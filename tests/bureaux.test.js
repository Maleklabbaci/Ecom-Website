/* Bureaux de livraison (stop desk) : vérifie que chaque famille de transporteur
   reçoit le champ que SON API attend, et que le bureau choisi par le client
   arrive bien jusqu'au colis.
   Serveur isolé (port libre, base temporaire) + faux transporteur local. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const { spawn } = require("node:child_process")
const http = require("node:http")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, listen0, openDb } = require("./boot")
let PORT = 0
let MOCK_PORT = 0
let BASE = ""
let MOCK = ""
const DB = path.join(os.tmpdir(), `novadz-bureaux-${Date.now()}.db`)
let server, mock
let received = []
const jar = new Map()

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
async function req(p, opts = {}) {
  const res = await fetch(BASE + p, {
    ...opts,
    headers: { ...(opts.headers || {}), cookie: cookieHeader() },
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
const login = () => req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  /* faux transporteur : il renvoie un suivi et garde ce qu'il a reçu */
  mock = http.createServer((rq, rs) => {
    let body = ""
    rq.on("data", (c) => { body += c })
    rq.on("end", () => {
      received.push({ url: rq.url, method: rq.method, headers: rq.headers, body })
      rs.writeHead(200, { "Content-Type": "application/json" })
      rs.end(JSON.stringify({ tracking: "NDZTEST1", label: "" }))
    })
  })
  MOCK_PORT = await listen0(mock)
  MOCK = `http://127.0.0.1:${MOCK_PORT}`

  const started = await startServer({ db: DB })
  server = started.child
  PORT = started.port
  BASE = started.base
})

after(() => {
  if (server) server.kill()
  if (mock) mock.close()
  try { fs.unlinkSync(DB) } catch (_) {}
})

const dbFile = () => openDb(DB, { readonly: true })

/* ------------------------- 1. les presets ------------------------- */

test("bureaux : Yalidine reçoit stopdesk_id (sans lui, le colis au bureau est refusé)", () => {
  const { presets } = require("../src/carriers-presets")
  const y = presets.find((p) => p.key === "yalidine")
  assert.match(y.config.create_body, /is_stopdesk/)
  assert.match(y.config.create_body, /stopdesk_id/)
  assert.match(y.config.create_body, /"\{\{deskId\}\}"/)
  /* toute la famille Yalidine hérite du même corps */
  for (const k of ["guepex", "yalitec", "economiqua", "easyspeed"]) {
    const p = presets.find((x) => x.key === k)
    assert.match(p.config.create_body, /stopdesk_id/, "stopdesk_id manquant pour " + k)
  }
})

test("bureaux : NOEST reçoit station_code, EcoTrack stop_desk, Maystro 1/2, Procolis 1/0", () => {
  const { presets } = require("../src/carriers-presets")
  const noest = presets.find((p) => p.key === "noest")
  assert.match(noest.config.create_steps, /station_code/)
  assert.match(noest.config.create_steps, /stop_desk/)

  const eco = presets.find((p) => p.key === "ecotrack")
  assert.match(eco.config.create_steps, /stop_desk/)
  assert.doesNotMatch(eco.config.create_steps, /stopdesk_id/, "EcoTrack n'a pas d'identifiant de bureau")

  const may = presets.find((p) => p.key === "maystro")
  assert.match(may.config.create_body, /deliveryTypeNum/, "Maystro attend 1 = domicile, 2 = bureau")

  const zr = presets.find((p) => p.key === "zrexpress")
  assert.match(zr.config.create_body, /TypeLivraison/)
})

test("bureaux : la nouvelle plateforme ZR est proposée et décrit le point relais", () => {
  const { presets } = require("../src/carriers-presets")
  const zr2 = presets.find((p) => p.key === "zrexpress-v2")
  assert.ok(zr2, "préréglage ZR nouvelle plateforme absent")
  assert.equal(zr2.config.header1_name, "X-Api-Key")
  assert.equal(zr2.config.header2_name, "X-Tenant")
  assert.match(zr2.config.create_body, /pickup-point|deliveryType/)
  assert.match(zr2.config.create_body, /hubId/)
  assert.equal(zr2.verified, false, "les chemins ZR v2 ne sont pas confirmés : rester honnête")
})

/* ------------------------- 2. le bureau va jusqu'au colis ------------------------- */

test("bureaux : le bureau choisi par le client arrive dans la commande", async () => {
  await login()
  /* on enregistre un transporteur « maison » qui pointe sur le faux serveur */
  await req("/dashboard/transporteur", form({
    preset: "custom",
    label: "Bureau de test",
    enabled: "1",
    base_url: MOCK,
    header1_name: "Authorization",
    header1_value: "jeton-de-test",
    create_method: "POST",
    create_path: "/parcels",
    create_body_mode: "json",
    create_body: JSON.stringify({
      reference: "{{ref}}",
      commune: "{{commune}}",
      is_stopdesk: "{{stopDesk}}",
      stopdesk_id: "{{deskId}}",
      delivery_type: "{{deliveryTypeNum}}",
      station_code: "{{deskId}}",
    }),
    resp_tracking_path: "tracking",
    resp_label_path: "label",
    resp_error_path: "message",
    status_path: "/parcels/{tracking}",
    status_state_field: "status",
    status_map: "{}",
  }))
  await req("/dashboard/transporteur/centres/manual", form({
    list: "Agence Blida Centre ; Blida ; Blida ; 12 rue des Frères ; 025000000 ; BLD-01",
  }))

  /* commande client avec un bureau choisi */
  await req("/amina-mode")
  await req("/amina-mode/cart", form({ product_id: "3" }))
  const co = await req("/amina-mode/checkout", form({
    customer_name: "Client Bureau",
    phone: "0555000111",
    address: "Cité 200 logements",
    wilaya: "Blida",
    commune: "Blida",
    delivery: "home",
    payment: "cod",
    desk: "BLD-01|Agence Blida Centre|Blida",
  }))
  assert.ok([200, 302].includes(co.status), "commande refusée : " + co.status)

  const db = dbFile()
  const order = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()
  assert.equal(order.desk_id, "BLD-01")
  assert.equal(order.desk_name, "Agence Blida Centre")
  assert.equal(order.desk_commune, "Blida")

  /* envoi du colis : on vérifie ce que reçoit vraiment le transporteur */
  received = []
  /* on n'expédie qu'une commande confirmée */
  await req(`/dashboard/orders/${order.id}/status`, form({ status: "confirmee" }))
  const send = await req(`/dashboard/orders/${order.id}/expedier`, form({ stopDesk: "1", desk_id: "BLD-01|Agence Blida Centre|Blida" }))
  assert.ok([200, 302].includes(send.status))
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(received.length, 1, "le transporteur n'a rien reçu")
  const sent = JSON.parse(received[0].body)
  assert.equal(sent.stopdesk_id, "BLD-01", "l'identifiant du bureau doit partir")
  assert.equal(sent.commune, "Blida", "la commune envoyée est celle du bureau")
  assert.equal(sent.is_stopdesk, 1)
  assert.equal(sent.delivery_type, 2, "Maystro : 2 = bureau")
})

test("bureaux : sans bureau choisi, rien de faux n'est envoyé", async () => {
  await login()
  const db = dbFile()
  const order = db.prepare("SELECT * FROM orders WHERE desk_id = '' OR desk_id IS NULL ORDER BY id DESC LIMIT 1").get()
  db.close()
  if (!order) return
  received = []
  await req(`/dashboard/orders/${order.id}/expedier`, form({ stopDesk: "0", commune: "Blida" }))
  await new Promise((r) => setTimeout(r, 400))
  if (!received.length) return
  const sent = JSON.parse(received[0].body)
  assert.equal(sent.stopdesk_id, "", "aucun bureau : pas d'identifiant inventé")
  assert.equal(sent.delivery_type, 1, "domicile = 1")
})

/* ------------------------- 3. l'écran du marchand ------------------------- */

test("bureaux : l'écran d'envoi propose le bureau et explique l'absence de liste", async () => {
  await login()
  /* une commande encore non envoyée : c'est là qu'apparaît le formulaire */
  await req("/amina-mode")
  await req("/amina-mode/cart", form({ product_id: "3" }))
  await req("/amina-mode/checkout", form({
    customer_name: "Client Bureau 2",
    phone: "0555000222",
    address: "Rue des Frères",
    wilaya: "Blida",
    commune: "Blida",
    delivery: "home",
    payment: "cod",
    desk: "BLD-01|Agence Blida Centre|Blida",
  }))
  const db = dbFile()
  const order = db.prepare("SELECT id, tracking FROM orders WHERE tracking IS NULL OR tracking = '' ORDER BY id DESC LIMIT 1").get()
  db.close()
  assert.ok(order, "aucune commande non envoyée")
  /* le formulaire d'envoi n'apparaît qu'une fois la commande confirmée */
  await req(`/dashboard/orders/${order.id}/status`, form({ status: "confirmee" }))
  const page = await req("/dashboard/orders/" + order.id)
  assert.match(page.text, /name="desk_id"/, "le choix du bureau manque à l'envoi")
  assert.match(page.text, /Agence Blida Centre/)
  assert.match(page.text, /BLD-01\|Agence Blida Centre\|Blida/, "le bureau doit porter son identifiant")
})

test("bureaux : la page Transporteur dit combien de bureaux sont connus", async () => {
  await login()
  const page = await req("/dashboard/transporteur")
  assert.equal(page.status, 200)
  assert.match(page.text, /bureau\(x\)/)
})
