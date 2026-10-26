/* Tests du moteur transporteurs générique — `npm test`
   Un faux bureau de livraison (serveur HTTP local) joue le rôle de n'importe
   quelle API : le moteur ne doit rien savoir de lui à l'avance.
   Il vérifie aussi le correctif de référence de commande (NDZ-...). */
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
const DB = path.join(os.tmpdir(), `novadz-carriers-${Date.now()}.db`)

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
  return { status: res.status, text: await res.text(), location: res.headers.get("location") || "" }
}
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})

/* Le faux transporteur : en-têtes exotiques, corps imbriqué, réponses non standard. */
let received = null
let trackingCounter = 7000
const states = ["en_cours", "sorti_livraison", "livre"]

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}

  fake = http.createServer((rq, rs) => {
    let body = ""
    rq.on("data", (c) => { body += c })
    rq.on("end", () => {
      if (rq.url.startsWith("/v2/communes")) {
        if (rq.headers["x-cle-api"] !== "CLE-SECRETE") {
          rs.writeHead(401, { "Content-Type": "application/json" })
          return rs.end(JSON.stringify({ error: "cle invalide" }))
        }
        rs.writeHead(200, { "Content-Type": "application/json" })
        return rs.end(JSON.stringify({ resultats: [{ code: "16", libelle: "Alger" }, { code: "09", libelle: "Blida" }] }))
      }
      if (rq.url.startsWith("/v2/colis") && rq.method === "POST") {
        if (rq.headers["x-cle-api"] !== "CLE-SECRETE") {
          rs.writeHead(401, { "Content-Type": "application/json" })
          return rs.end(JSON.stringify({ message: "jeton refusé" }))
        }
        received = JSON.parse(body)
        trackingCounter++
        rs.writeHead(200, { "Content-Type": "application/json" })
        return rs.end(JSON.stringify({
          statut: "ok",
          colis: { numero: `PK-${trackingCounter}`, etiquette: `https://faux.dz/bl/${trackingCounter}.pdf` },
        }))
      }
      if (rq.url.startsWith("/v2/suivi")) {
        rs.writeHead(200, { "Content-Type": "application/json" })
        return rs.end(JSON.stringify({ data: [{ etat: states[Math.min(2, Math.floor(trackingCounter % 3))] }] }))
      }
      rs.writeHead(404, { "Content-Type": "application/json" })
      rs.end(JSON.stringify({ message: "inconnu" }))
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
})

test("connexion marchand démo", async () => {
  const r = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.ok([302, 303].includes(r.status), `login ${r.status}`)
})

test("l'écran transporteur s'ouvre sans configuration", async () => {
  const r = await req("/dashboard/transporteur")
  assert.equal(r.status, 200)
  assert.match(r.text, /Ma connexion/)
  assert.match(r.text, /Société de livraison/)
  assert.match(r.text, /Wilaya de départ/)
  /* Yalidine est le choix par défaut : l'adresse EcoTrack existe, mais reste cachée. */
  assert.match(r.text, /Adresse du bureau EcoTrack/)
  assert.match(r.text, /id="ndzBase"[^>]*hidden/)
  assert.doesNotMatch(r.text, /URL de base de l'API/)
})

test("enregistrer un transporteur arbitraire (aucun code dédié)", async () => {
  const r = await req("/dashboard/transporteur", form({
    preset: "custom",
    label: "Bureau de Blida",
    base_url: `http://127.0.0.1:${FAKE_PORT}/v2`,
    header1_name: "X-Cle-Api",
    header1_value: "CLE-SECRETE",
    create_method: "POST",
    create_path: "/colis",
    create_body: JSON.stringify({
      reference: "{{ref}}",
      client: { nom: "{{fullName}}", tel: "{{phone}}" },
      adresse: { rue: "{{address}}", commune: "{{communeId}}", wilaya: "{{wilaya}}" },
      montant: "{{price}}",
      stopdesk: "{{stopDesk}}",
    }),
    resp_tracking_path: "colis.numero",
    resp_label_path: "colis.etiquette",
    resp_error_path: "message",
    centers_path: "/communes",
    centers_list_path: "resultats",
    center_id_field: "code",
    center_name_field: "libelle",
    status_path: "/suivi?ref={tracking}",
    status_state_field: "data.0.etat",
    status_map: JSON.stringify({ en_cours: "expediee", sorti_livraison: "expediee", livre: "livree" }),
    enabled: "on",
  }))
  assert.equal(r.status, 302)
  const page = await req("/dashboard/transporteur")
  assert.match(page.text, /Bureau de Blida/)
})

test("test de connexion : le jeton part bien en en-tête", async () => {
  const r = await req("/dashboard/transporteur/test", { method: "POST" })
  assert.equal(r.status, 200)
  assert.match(r.text, /Connexion réussie/)
  assert.match(r.text, /2 bureau\(x\)/)
})

test("les communes sont récupérées et enregistrées", async () => {
  await req("/dashboard/transporteur/centres", { method: "POST" })
  const page = await req("/dashboard/transporteur")
  assert.match(page.text, /2 bureau\(x\) enregistré/)
})

test("un colis s'envoie avec les variables remplies", async () => {
  /* on passe une vraie commande côté client pour avoir une commande à expédier */
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  await req("/amina-mode/cart", form({ product_id: pid }))
  await req("/amina-mode/checkout", form({
    customer_name: "Karim Benali", phone: "0661234567", wilaya: "Blida",
    address: "Cité 200 logements, Blida", note: "sonner avant",
  }))
  const orders = await req("/dashboard/orders")
  const m = orders.text.match(/\/dashboard\/orders\/(\d+)/)
  assert.ok(m, "aucune commande créée")
  const id = m[1]

  const page = await req(`/dashboard/orders/${id}`)
  assert.match(page.text, /Envoyer à Bureau de Blida/)

  await req(`/dashboard/orders/${id}/status`, form({ status: "confirmee" }))
  const r = await req(`/dashboard/orders/${id}/expedier`, form({
    commune_id: "09|Blida",
    stopDesk: "0",
    price: "4500",
    free_shipping: "on",
  }))
  assert.equal(r.status, 302)

  assert.ok(received, "le faux transporteur n'a rien reçu")
  assert.match(received.reference, /^NDZ-[A-Z0-9]{6}$/)
  assert.match(received.client.tel, /^0\d{9}$/)
  assert.equal(received.adresse.commune, "09")
  assert.equal(received.adresse.wilaya.length > 1, true)
  assert.equal(received.montant, 4500)
  assert.equal(received.stopdesk, 0)

  const after = await req(`/dashboard/orders/${id}`)
  assert.match(after.text, /Colis envoyé/)
  assert.match(after.text, /PK-7/)
})

test("la synchronisation applique le statut du transporteur", async () => {
  await req("/dashboard/transporteur/sync", { method: "POST" })
  const page = await req("/dashboard/transporteur")
  assert.match(page.text, /Bordereau/)
  const db = require("../src/sqlite").open(DB)
  const s = db.prepare("SELECT state, mapped FROM shipments ORDER BY id DESC LIMIT 1").get()
  db.close()
  assert.match(s.state, /^(en_cours|sorti_livraison|livre)$/)
  assert.ok(["expediee", "livree"].includes(s.mapped), `mapped=${s.mapped}`)
})

test("un transporteur ne peut pas être vu par une autre boutique", async () => {
  const db = require("../src/sqlite").open(DB)
  const stores = db.prepare("SELECT id, slug FROM stores ORDER BY id").all()
  const rows = db.prepare("SELECT store_id, label FROM carriers").all()
  db.close()
  const mine = stores.find((s) => s.slug === "amina-mode")
  const other = stores.find((s) => s.slug === "tech-dz")
  assert.ok(mine && other, "les deux boutiques de démo doivent exister")
  assert.ok(rows.some((r) => r.store_id === mine.id && r.label === "Bureau de Blida"))
  assert.equal(rows.filter((r) => r.store_id === other.id).length, 0)

  /* le menu marchand n'ouvre que la première boutique : on passe par la vue admin */
  const adminJar = new Map()
  const adminReq = async (pathname, opts = {}) => {
    const res = await fetch(BASE + pathname, {
      ...opts,
      headers: { ...(opts.headers || {}), cookie: [...adminJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") },
      redirect: "manual",
    })
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : []
    for (const c of set) {
      const [pair] = c.split(";")
      const i = pair.indexOf("=")
      adminJar.set(pair.slice(0, i), pair.slice(i + 1))
    }
    return { status: res.status, text: await res.text(), location: res.headers.get("location") || "" }
  }
  const login = await adminReq("/login", form({ email: "admin@novadz.dz", password: "admin1234" }))
  assert.ok([302, 303].includes(login.status), `admin ${login.status}`)
  const open = await adminReq(`/admin/boutiques/${other.id}/ouvrir`, { method: "POST" })
  assert.equal(open.status, 302)
  const page = await adminReq("/dashboard/transporteur")
  assert.equal(page.status, 200)
  assert.match(page.text, /Tech DZ/)
  assert.doesNotMatch(page.text, /Bureau de Blida/)
  assert.doesNotMatch(page.text, /CLE-SECRETE/)
})

test("les références de commande ne se répètent pas (bug NDZ-)", async () => {
  const REFS = require("../src/refs")
  const seen = new Set()
  for (let i = 0; i < 2000; i++) {
    const r = REFS.randomRef()
    assert.match(r, /^NDZ-[A-Z2-9]{6}$/)
    seen.add(r)
  }
  assert.ok(seen.size > 1990, `collisions: ${2000 - seen.size}`)
})
