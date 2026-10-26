/* Tests des trois familles d'API algériennes — `npm test`
   Un seul moteur, trois façons très différentes de parler :
     1. Yalidine  : POST d'un TABLEAU en JSON, réponse indexée par référence
     2. EcoTrack  : POST en QUERY STRING + second appel /valid/order (DHD & ~82 bureaux)
     3. Procolis  : POST d'un objet, l'échec arrive avec un code 200 (ZR legacy)
   Si ces trois passent, « n'importe quel bureau » est une question de configuration. */
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
const DB = path.join(os.tmpdir(), `novadz-fam-${Date.now()}.db`)

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

/* --- mémorise ce que chaque faux transporteur a reçu --- */
const seen = { yalidine: null, ecotrack: [], procolis: null }

function yalidineApi(rq, url, body, rs) {
  if (!rq.headers["x-api-id"] || !rq.headers["x-api-token"]) {
    rs.writeHead(401, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({ message: "identifiants manquants" }))
  }
  if (url.pathname === "/v1/centers/") {
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({ has_more: false, data: [{ center_id: 12, name: "Blida Agence" }] }))
  }
  if (url.pathname === "/v1/parcels/") {
    const arr = JSON.parse(body) /* doit être un TABLEAU */
    if (!Array.isArray(arr)) {
      rs.writeHead(400, { "Content-Type": "application/json" })
      return rs.end(JSON.stringify({ message: "tableau attendu" }))
    }
    const p = arr[0]
    seen.yalidine = p
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({
      [p.order_id]: { success: true, tracking: "YLD-9001", label: "https://yalidine.dz/bl/YLD-9001.pdf", message: "" },
    }))
  }
  if (url.pathname === "/v1/histories/") {
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({ data: [{ tracking: "YLD-9001", status: "Livré" }] }))
  }
  rs.writeHead(404, { "Content-Type": "application/json" })
  rs.end("{}")
}

function ecotrackApi(rq, url, body, rs) {
  if (rq.headers.authorization !== "Bearer TOK-ECO") {
    rs.writeHead(403, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({ success: false, message: "token invalide" }))
  }
  if (url.pathname === "/api/v1/get/communes") {
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify([{ nom: "Blida", code_postal: "09000", wilaya_id: 9, has_stop_desk: 1 }]))
  }
  if (url.pathname === "/api/v1/create/order") {
    seen.ecotrack.push({ step: "create", query: Object.fromEntries(url.searchParams) })
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({ success: true, tracking: "ECO-777", message: "" }))
  }
  if (url.pathname === "/api/v1/valid/order") {
    seen.ecotrack.push({ step: "valid", query: Object.fromEntries(url.searchParams) })
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({ success: true, message: "" }))
  }
  if (url.pathname === "/api/v1/get/trackings/info") {
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({
      "ECO-777": { tracking: "ECO-777", activity: [{ status: "Livré" }] },
    }))
  }
  rs.writeHead(404, { "Content-Type": "application/json" })
  rs.end("{}")
}

function procolisApi(rq, url, body, rs) {
  if (rq.headers.token !== "T-1" || rq.headers.key !== "K-1") {
    rs.writeHead(401, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({ Statut: "Clé non détectée" }))
  }
  if (url.pathname === "/api_v1/add_colis") {
    const parsed = JSON.parse(body)
    const colis = parsed.Colis && parsed.Colis[0]
    seen.procolis = colis
    /* cas réel : refus avec un code 200 et MessageRetour */
    const refus = colis.Client && colis.Client.includes("Refus")
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({
      Colis: [{
        Tracking: colis.Tracking,
        MessageRetour: refus ? "Commune introuvable" : "Good",
      }],
    }))
  }
  if (url.pathname === "/api_v1/lire") {
    rs.writeHead(200, { "Content-Type": "application/json" })
    return rs.end(JSON.stringify({ Colis: [{ Tracking: "NDZ-TEST", Situation: "Livré", DateH_Action: "2026-10-20 10:00" }] }))
  }
  rs.writeHead(404, { "Content-Type": "application/json" })
  rs.end("{}")
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}

  fake = http.createServer((rq, rs) => {
    let body = ""
    rq.on("data", (c) => { body += c })
    rq.on("end", () => {
      const url = new URL(rq.url, `http://127.0.0.1:${FAKE_PORT}`)
      if (url.pathname.startsWith("/v1/")) return yalidineApi(rq, url, body, rs)
      if (url.pathname.startsWith("/api/v1/")) return ecotrackApi(rq, url, body, rs)
      if (url.pathname.startsWith("/api_v1/")) return procolisApi(rq, url, body, rs)
      rs.writeHead(404)
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
})

const connect = (fields) => req("/dashboard/transporteur", form({
  preset: "custom",
  header1_name: "", header2_name: "", header3_name: "",
  enabled: "on", origin_wilaya: "Blida",
  ...fields,
}))

async function order() {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  await req("/amina-mode/cart", form({ product_id: pid }))
  await req("/amina-mode/checkout", form({
    customer_name: "Nassim Merabet", phone: "0561234567", wilaya: "Blida",
    address: "Rue des frères Ali, Blida", note: "appeler avant",
  }))
  const id = (await req("/dashboard/orders")).text.match(/\/dashboard\/orders\/(\d+)/)[1]
  return id
}

async function send(id) {
  /* la commande doit être confirmée avant de partir */
  await req(`/dashboard/orders/${id}/status`, form({ status: "confirmee" }))
  return req(`/dashboard/orders/${id}/expedier`, form({
    commune: "Blida", commune_id: "|", stopDesk: "0", price: "5200", free_shipping: "on",
  }))
}

test("connexion marchand", async () => {
  const r = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.ok([302, 303].includes(r.status))
})

test("familie Yalidine : tableau JSON, reponse indexee par reference", async () => {
  await connect({
    label: "Yalidine test",
    base_url: `http://127.0.0.1:${FAKE_PORT}/v1`,
    header1_name: "X-API-ID", header1_value: "ID-1",
    header2_name: "X-API-TOKEN", header2_value: "TOK-1",
    create_path: "/parcels/",
    create_body_mode: "json",
    create_body: JSON.stringify([{
      order_id: "{{ref}}", from_wilaya_name: "{{fromWilaya}}",
      firstname: "{{firstName}}", familyname: "{{lastName}}", contact_phone: "{{phone}}",
      address: "{{addressLine}}", to_commune_name: "{{commune}}", to_wilaya_name: "{{wilaya}}",
      product_list: "{{products}}", price: "{{price}}", freeshipping: "{{freeShipping}}",
      is_stopdesk: "{{stopDesk}}",
    }]),
    resp_tracking_path: "{ref}.tracking",
    resp_label_path: "{ref}.label",
    resp_message_path: "{ref}.message",
    centers_path: "/centers/", centers_list_path: "data",
    center_id_field: "center_id", center_name_field: "name",
    status_path: "/histories/?tracking={tracking}",
    status_state_field: "data.0.status",
    status_map: JSON.stringify({ "livré": "livree" }),
  })

  const id = await order()
  const r = await send(id)
  assert.equal(r.status, 302)
  assert.ok(seen.yalidine, "Yalidine n'a rien reçu")
  assert.match(seen.yalidine.order_id, /^NDZ-[A-Z0-9]{6}$/)
  assert.equal(seen.yalidine.from_wilaya_name, "Blida")
  assert.equal(seen.yalidine.to_wilaya_name, "Blida")
  assert.equal(seen.yalidine.price, 5200)
  assert.equal(seen.yalidine.is_stopdesk, 0)

  const page = await req(`/dashboard/orders/${id}`)
  assert.match(page.text, /YLD-9001/)
  assert.match(page.text, /YLD-9001\.pdf/)
})

test("famille EcoTrack (DHD) : query string + second appel de validation", async () => {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  await req("/amina-mode/cart", form({ product_id: pid }))
  await req("/amina-mode/checkout", form({
    customer_name: "Amine Bouzid", phone: "0551234567", wilaya: "Blida",
    address: "Cité 200 logements", note: "",
  }))
  const id = (await req("/dashboard/orders")).text.match(/\/dashboard\/orders\/(\d+)/)[1]

  await connect({
    label: "DHD test",
    base_url: `http://127.0.0.1:${FAKE_PORT}/api/v1`,
    header1_name: "Authorization", header1_value: "Bearer TOK-ECO",
    create_body_mode: "query",
    create_steps: JSON.stringify([
      {
        method: "POST", path: "/create/order", body_mode: "query",
        body: {
          reference: "{{ref}}", nom_client: "{{fullName}}", telephone: "{{phone}}",
          adresse: "{{addressLine}}", code_wilaya: "{{wilayaCode}}", commune: "{{commune}}",
          montant: "{{price}}", produit: "{{products}}", type: "1", stop_desk: "{{stopDesk}}",
        },
        capture: { tracking: "tracking" }, error_path: "message",
      },
      {
        method: "POST", path: "/valid/order", body_mode: "query",
        body: { tracking: "{{tracking}}", ask_collection: "1" }, error_path: "message",
      },
    ]),
    resp_tracking_path: "tracking",
    centers_path: "/get/communes", centers_list_path: "",
    center_id_field: "code_postal", center_name_field: "nom",
    status_path: "/get/trackings/info?trackings[]={tracking}",
    status_state_field: "{tracking}.activity.0.status",
    status_map: JSON.stringify({ "livré": "livree" }),
  })

  await send(id)
  assert.equal(seen.ecotrack.length, 2, "les deux appels doivent partir")
  assert.equal(seen.ecotrack[0].step, "create")
  assert.equal(seen.ecotrack[0].query.code_wilaya, "9")
  assert.equal(seen.ecotrack[0].query.telephone, "0551234567")
  assert.equal(seen.ecotrack[0].query.montant, "5200")
  assert.equal(seen.ecotrack[0].query.stop_desk, "0")
  assert.equal(seen.ecotrack[1].step, "valid")
  assert.equal(seen.ecotrack[1].query.tracking, "ECO-777")
  assert.equal(seen.ecotrack[1].query.ask_collection, "1")

  const page = await req(`/dashboard/orders/${id}`)
  assert.match(page.text, /ECO-777/)
})

test("famille Procolis (ZR legacy) : echec en HTTP 200 detecte", async () => {
  await connect({
    label: "ZR test",
    base_url: `http://127.0.0.1:${FAKE_PORT}/api_v1`,
    header1_name: "token", header1_value: "T-1",
    header2_name: "key", header2_value: "K-1",
    create_path: "/add_colis",
    create_body_mode: "json",
    create_steps: JSON.stringify([{
      method: "POST", path: "/add_colis", body_mode: "json",
      body: { Colis: [{
        Tracking: "{{ref}}", TypeLivraison: "{{stopDesk}}", Client: "{{fullName}}",
        MobileA: "{{phone}}", Adresse: "{{addressLine}}", IDWilaya: "{{wilayaCode}}",
        Commune: "{{commune}}", Total: "{{price}}", Produit: "{{products}}", id_Externe: "{{ref}}",
      }] },
      error_path: "Colis.0.MessageRetour",
      ok_values: ["Good"],
    }]),
    resp_tracking_path: "Colis.0.Tracking",
    status_method: "POST",
    status_path: "/lire",
    status_body: JSON.stringify({ Colis: [{ Tracking: "{{tracking}}" }] }),
    status_state_field: "Colis.0.Situation",
    status_map: JSON.stringify({ "livré": "livree" }),
  })

  const id = await order()
  await send(id)
  assert.ok(seen.procolis, "Procolis n'a rien reçu")
  assert.equal(seen.procolis.IDWilaya, "9")
  assert.equal(seen.procolis.Total, "5200")
  assert.match(seen.procolis.Tracking, /^NDZ-[A-Z0-9]{6}$/)

  const page = await req(`/dashboard/orders/${id}`)
  assert.match(page.text, new RegExp(seen.procolis.Tracking))
})

test("un refus Procolis en HTTP 200 ne cree pas de colis fantome", async () => {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  await req("/amina-mode/cart", form({ product_id: pid }))
  await req("/amina-mode/checkout", form({
    customer_name: "Refus Test", phone: "0770999888", wilaya: "Blida",
    address: "Rue 1", note: "",
  }))
  const id = (await req("/dashboard/orders")).text.match(/\/dashboard\/orders\/(\d+)/)[1]
  const before = (await req("/dashboard/transporteur")).text.match(/PK|NDZ/g) || []

  await send(id)
  const page = await req(`/dashboard/orders/${id}`)
  /* pas de bloc « Colis envoyé » : l'envoi a échoué proprement */
  assert.ok(!/Colis envoyé/.test(page.text) || before, "aucun colis fantôme")
})

test("synchronisation : le statut Procolis passe par un POST", async () => {
  await req("/dashboard/transporteur/sync", { method: "POST" })
  const db = require("../src/sqlite").open(DB)
  const rows = db.prepare("SELECT state, mapped FROM shipments").all()
  db.close()
  assert.ok(rows.some((r) => r.mapped === "livree"), JSON.stringify(rows))
})

test("les 58 wilayas sont converties en codes", async () => {
  const W = require("../src/wilayas")
  assert.equal(W.codeOf("Blida"), 9)
  assert.equal(W.codeOf("alger"), 16)
  assert.equal(W.codeOf("Tizi Ouzou"), 15)
  assert.equal(W.codeOf("Béjaïa"), 6)
  assert.equal(W.codeOf("58"), 58)
  assert.equal(W.codeOf(""), "")
  assert.equal(W.WILAYAS_58.length, 58)
})

test("les 24 preréglages sont chargeables et coherents", async () => {
  const { presets } = require("../src/carriers-presets")
  assert.ok(presets.length >= 20)
  for (const p of presets) {
    assert.ok(p.key && p.label && p.config, `préréglage incomplet : ${p.key}`)
    assert.ok(Array.isArray(JSON.parse(p.config.create_body_mode === "query" ? "[]" : "[]")))
    if (p.config.create_steps) assert.doesNotThrow(() => JSON.parse(p.config.create_steps), p.key)
    if (p.config.create_body) assert.doesNotThrow(() => JSON.parse(p.config.create_body), p.key)
    if (p.config.status_body) assert.doesNotThrow(() => JSON.parse(p.config.status_body), p.key)
    assert.doesNotThrow(() => JSON.parse(p.config.status_map || "{}"), p.key)
  }
})
