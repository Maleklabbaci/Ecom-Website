/* Tests : bordereau PDF, paniers abandonnés + relances, statistiques livraison.
   Le faux bureau renvoie un VRAI PDF binaire (comme EcoTrack / DHD / NOEST),
   pas une URL — c'est le cas qui cassait le bouton « Bordereau ». */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const { spawn } = require("node:child_process")
const http = require("node:http")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, listen0 } = require("./boot")
let PORT = 0
let FAKE_PORT = 0
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-rel-${Date.now()}.db`)

let server
let fake
const jar = new Map()
const cookies = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")

async function req(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, {
    ...opts,
    headers: { ...(opts.headers || {}), cookie: cookies() },
    redirect: "manual",
  })
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  for (const c of set) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    status: res.status,
    text: buf.toString("utf8"),
    buf,
    type: res.headers.get("content-type") || "",
    location: res.headers.get("location") || "",
  }
}
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})
const jsonPost = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
})

/* un PDF minimal mais valide à l'octet près */
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "latin1")

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}

  fake = http.createServer((rq, rs) => {
    let body = ""
    rq.on("data", (c) => { body += c })
    rq.on("end", () => {
      const u = new URL(rq.url, `http://127.0.0.1:${FAKE_PORT}`)
      if (u.pathname === "/api/v1/get/communes") {
        rs.writeHead(200, { "Content-Type": "application/json" })
        return rs.end(JSON.stringify([{ nom: "Blida", code_postal: "09000", has_stop_desk: 1 }]))
      }
      if (u.pathname === "/api/v1/create/order") {
        rs.writeHead(200, { "Content-Type": "application/json" })
        return rs.end(JSON.stringify({ success: true, tracking: "DHD-55221" }))
      }
      if (u.pathname === "/api/v1/valid/order") {
        rs.writeHead(200, { "Content-Type": "application/json" })
        return rs.end(JSON.stringify({ success: true }))
      }
      if (u.pathname === "/api/v1/get/order/label") {
        rs.writeHead(200, { "Content-Type": "application/pdf" })
        return rs.end(MINIMAL_PDF)
      }
      if (u.pathname === "/api/v1/get/trackings/info") {
        rs.writeHead(200, { "Content-Type": "application/json" })
        return rs.end(JSON.stringify({ "DHD-55221": { activity: [{ status: "Livré" }] } }))
      }
      rs.writeHead(404, { "Content-Type": "application/json" })
      rs.end("{}")
    })
  })
  FAKE_PORT = await listen0(fake)

  const started = await startServer({ db: DB })
  server = started.child
  PORT = started.port
  BASE = started.base
})

after(() => {
  if (server) server.kill()
  if (fake) fake.close()
  try { fs.unlinkSync(DB) } catch (_) {}
  try {
    const dir = path.join(__dirname, "..", "data", "labels")
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (_) {}
})

test("connexion marchand", async () => {
  const r = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.ok([302, 303].includes(r.status))
})

test("transporteur EcoTrack/DHD configuré", async () => {
  const r = await req("/dashboard/transporteur", form({
    preset: "custom",
    label: "DHD test",
    base_url: `http://127.0.0.1:${FAKE_PORT}/api/v1`,
    header1_name: "Authorization", header1_value: "Bearer TOK",
    header2_name: "", header3_name: "",
    create_body_mode: "query",
    create_steps: JSON.stringify([
      { method: "POST", path: "/create/order", body_mode: "query",
        body: { reference: "{{ref}}", nom_client: "{{fullName}}", telephone: "{{phone}}",
                code_wilaya: "{{wilayaCode}}", commune: "{{commune}}", montant: "{{price}}" },
        capture: { tracking: "tracking" }, error_path: "message" },
      { method: "POST", path: "/valid/order", body_mode: "query",
        body: { tracking: "{{tracking}}" }, error_path: "message" },
    ]),
    resp_tracking_path: "tracking",
    centers_path: "/get/communes", centers_list_path: "",
    center_id_field: "code_postal", center_name_field: "nom",
    label_path: "/get/order/label?tracking={tracking}", label_method: "GET",
    status_path: "/get/trackings/info?trackings[]={tracking}",
    status_state_field: "{tracking}.activity.0.status",
    status_map: JSON.stringify({ "livré": "livree" }),
    enabled: "on",
  }))
  assert.equal(r.status, 302)
})

test("le bordereau PDF est téléchargé et servi par la plateforme", async () => {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  await req("/amina-mode/cart", form({ product_id: pid }))
  await req("/amina-mode/checkout", form({
    customer_name: "Sofiane Kaci", phone: "0661112233", wilaya: "Blida",
    address: "Rue des oliviers", note: "",
  }))
  const id = (await req("/dashboard/orders")).text.match(/\/dashboard\/orders\/(\d+)/)[1]
  await req(`/dashboard/orders/${id}/status`, form({ status: "confirmee" }))
  await req(`/dashboard/orders/${id}/expedier`, form({
    commune: "Blida", commune_id: "|", stopDesk: "0", price: "4800", free_shipping: "on",
  }))

  const page = await req(`/dashboard/orders/${id}`)
  assert.match(page.text, /bordereau \(PDF\)/i)

  const pdf = await req(`/dashboard/orders/${id}/bordereau`)
  assert.equal(pdf.status, 200)
  assert.match(pdf.type, /application\/pdf/)
  assert.equal(pdf.buf.subarray(0, 4).toString(), "%PDF")
  assert.ok(pdf.buf.length > 60)
})

test("une boutique ne peut pas lire le bordereau d'une autre", async () => {
  const r = await req("/dashboard/orders/999999/bordereau")
  assert.equal(r.status, 302)
})

test("le panier est mémorisé et devient abandonné", async () => {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  await req("/amina-mode/cart", form({ product_id: pid }))
  await req("/amina-mode/checkout")

  /* le petit script du checkout envoie le contact saisi */
  const beacon = await req("/amina-mode/panier/contact", jsonPost({
    name: "Yacine Belkacem", phone: "0770554433", wilaya: "Blida", address: "Cité 5",
  }))
  assert.equal(beacon.status, 200)
  assert.match(beacon.text, /"ok":true/)

  const db = require("../src/sqlite").open(DB)
  const cart = db.prepare("SELECT * FROM carts WHERE phone = '0770554433'").get()
  assert.ok(cart, "panier non enregistré")
  assert.ok(cart.count > 0)
  assert.ok(cart.token.length >= 20)

  /* on le vieillit de deux heures pour le rendre « abandonné » (et on annule
     la conversion provoquée par la commande du test précédent) */
  db.prepare("UPDATE carts SET last_seen = datetime('now','-2 hours'), status = 'open', order_id = NULL, reminded_at = NULL WHERE id = ?")
    .run(cart.id)
  db.close()
})

test("l'écran paniers abandonnés montre le panier et son lien de relance", async () => {
  const page = await req("/dashboard/paniers")
  assert.equal(page.status, 200)
  assert.match(page.text, /Yacine Belkacem/)
  assert.match(page.text, /panier\/[a-f0-9]+\/relancer/)
  assert.match(page.text, /Paniers abandonnés/)
})

test("le lien de récupération remplit le panier du client", async () => {
  const db = require("../src/sqlite").open(DB)
  const cart = db.prepare("SELECT token FROM carts WHERE phone = '0770554433'").get()
  db.close()
  const r = await req(`/amina-mode/panier/${cart.token}`)
  assert.equal(r.status, 302)
  assert.match(r.location, /\/cart$/)
  const page = await req("/amina-mode/cart")
  assert.match(page.text, /Panier/)
})

test("le clic Relancer journalise le message et ouvre WhatsApp", async () => {
  const db = require("../src/sqlite").open(DB)
  const token = db.prepare("SELECT token FROM carts WHERE phone = '0770554433'").get().token
  db.close()

  const r = await req(`/amina-mode/panier/${token}/relancer`)
  assert.equal(r.status, 302)
  assert.match(r.location, /^https:\/\/wa\.me\/213/)
  assert.match(decodeURIComponent(r.location), /Yacine/)

  const page = await req("/dashboard/relances")
  assert.match(page.text, /0770554433/)
  assert.match(page.text, /Journal des messages/)
})

test("relance manuelle : pas d'API, donc aucun envoi prétendu", async () => {
  const r = await req("/dashboard/relances/envoyer", { method: "POST" })
  assert.equal(r.status, 302)
  assert.match(r.location, /error=/)
  assert.match(decodeURIComponent(r.location), /Aucune API enregistrée/)
  assert.doesNotMatch(r.location, /note=ok/)
})

test("fournisseur d'API configuré : le message part vraiment", async () => {
  let received = null
  const hook = http.createServer((rq, rs) => {
    let b = ""
    rq.on("data", (c) => { b += c })
    rq.on("end", () => {
      received = { body: JSON.parse(b), auth: rq.headers.authorization }
      rs.writeHead(200, { "Content-Type": "application/json" })
      rs.end('{"ok":true}')
    })
  })
  const hookPort = await listen0(hook)

  await req("/dashboard/relances", form({
    msg_provider: "custom",
    msg_url: `http://127.0.0.1:${hookPort}/send`,
    msg_header_name: "Authorization",
    msg_header_value: "Bearer JETON-TEST",
    msg_body: '{"to":"{{phone}}","message":"{{texte}}"}',
    msg_delay_minutes: "45",
    msg_template_cart: "",
    msg_template_order: "",
  }))

  const db = require("../src/sqlite").open(DB)
  db.prepare("UPDATE messages SET status = 'pending'").run()
  db.close()

  const r = await req("/dashboard/relances/envoyer", { method: "POST" })
  assert.equal(r.status, 302)
  assert.ok(received, "l'API n'a rien reçu")
  assert.equal(received.auth, "Bearer JETON-TEST")
  assert.equal(received.body.to, "+213770554433")
  assert.ok(received.body.message.length > 10)

  hook.close()
})

test("statistiques : taux de livraison par transporteur", async () => {
  await req("/dashboard/livraison/sync", { method: "POST" })
  const page = await req("/dashboard/livraison")
  assert.equal(page.status, 200)
  assert.match(page.text, /DHD test/)
  assert.match(page.text, /Statistiques de livraison/)
  assert.match(page.text, /Par wilaya/)

  const db = require("../src/sqlite").open(DB)
  const row = db.prepare("SELECT mapped FROM shipments WHERE tracking = 'DHD-55221'").get()
  db.close()
  assert.equal(row.mapped, "livree")
})

test("le calcul du verdict compare les transporteurs", async () => {
  const S = require("../src/stats")
  const v = S.verdict([
    { carrier: "A", sent: 10, rate: 90 },
    { carrier: "B", sent: 10, rate: 55 },
  ])
  assert.equal(v.best, "A")
  assert.equal(v.worst, "B")
  assert.equal(v.gap, 35)
  /* moins de 3 colis : pas de conclusion */
  assert.equal(S.verdict([{ carrier: "A", sent: 2, rate: 100 }, { carrier: "B", sent: 2, rate: 0 }]), null)
})

test("un numéro algérien devient un lien wa.me correct", async () => {
  const REL = require("../src/relance")
  assert.equal(REL.waPhone("0555123456"), "213555123456")
  assert.equal(REL.waPhone("+213 555 12 34 56"), "213555123456")
  assert.equal(REL.waPhone("555123456"), "213555123456")
  assert.equal(REL.waPhone(""), "")
  assert.match(REL.waLink("0555123456", "bonjour"), /^https:\/\/wa\.me\/213555123456\?text=bonjour$/)
})
