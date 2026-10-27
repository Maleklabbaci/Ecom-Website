/* Fiche colis : la commande confirmée montre ce qui partira (nom, téléphone
   nettoyé, wilaya, commune, montant). Un champ encore exigé et vide bloque
   l'envoi, sans appel au bureau. */
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
const DB = path.join(os.tmpdir(), `novadz-colis-${Date.now()}.db`)
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
const dbFile = () => openDb(DB, { readonly: true })

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  mock = http.createServer((rq, rs) => {
    let body = ""
    rq.on("data", (c) => { body += c })
    rq.on("end", () => {
      received.push({ url: rq.url, method: rq.method, headers: rq.headers, body })
      let ref = "REF"
      try { ref = JSON.parse(body)[0].order_id } catch (_) {}
      rs.writeHead(200, { "Content-Type": "application/json" })
      /* Yalidine répond indexé par la référence de commande */
      rs.end(JSON.stringify({ [ref]: { success: true, tracking: "YAL-0001", label: "" } }))
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

/* ----------------------- 1. la fiche, sans réseau ----------------------- */

test("fiche colis : le téléphone est nettoyé pour le transporteur", () => {
  const F = require("../src/parcel-fields")
  assert.equal(F.cleanPhone("+213 555 12 34 56"), "0555123456")
  assert.equal(F.cleanPhone("00213 661 00 11 22"), "0661001122")
  assert.equal(F.cleanPhone("0555-12-34-56"), "0555123456")
  assert.equal(F.cleanPhone("213 770 12 34 56"), "0770123456")
  assert.ok(F.phoneOk("0555123456"))
  assert.ok(F.phoneOk("021456789"))
  assert.ok(!F.phoneOk("12345"), "un numéro incomplet doit être refusé")
})

test("fiche colis : la description respecte la limite exacte de chaque transporteur", () => {
  const F = require("../src/parcel-fields")
  assert.equal(F.DESC_LIMIT.yalidine, 150)
  assert.equal(F.DESC_LIMIT["zr-new"], 100)
  assert.equal(F.DESC_LIMIT.ecotrack, 255)
  const items = [{ title: "Robe d'été fleurie très longue avec ceinture", qty: 2 },
                 { title: "Foulard en soie imprimé", qty: 1 },
                 { title: "Sandales tressées cuir", qty: 1 }]
  const short = F.cleanProducts(items, 100)
  assert.ok(short.length <= 100, "dépassement de la limite ZR (100)")
  const long = F.cleanProducts(items, 150)
  assert.ok(long.length <= 150 && long.length >= short.length, "coupe trop agressive à 150")
  assert.equal(F.cleanProducts([{ title: "X", qty: 1 }], 150), "X")
})

test("fiche colis : chaque famille exige ses champs, et le dit en français", () => {
  const F = require("../src/parcel-fields")
  const base = {
    firstName: "Amine", lastName: "Belkacem", fullName: "Amine Belkacem",
    phone: "0555123456", addressLine: "Cité 200 logements", wilaya: "Blida",
    wilayaCode: "09", commune: "Blida", communeId: "", fromWilaya: "Blida",
    products: "Robe x1", price: 4500, stopDesk: 0, deskId: "", deskName: "", deskCommune: "",
  }
  /* Yalidine complète */
  assert.equal(F.check(base, "yalidine").ok, true)

  /* wilaya de départ vide : Yalidine refuse le colis */
  const noFrom = F.check({ ...base, fromWilaya: "" }, "yalidine")
  assert.equal(noFrom.ok, false)
  assert.ok(noFrom.missing.some((m) => m.label === "Wilaya de départ"))
  assert.ok(noFrom.missing[0].how, "on doit dire où corriger")

  /* nom d'un seul mot : signalé, pas bloquant */
  const oneWord = F.check({ ...base, lastName: "Amine" }, "yalidine")
  assert.equal(oneWord.ok, true)
  assert.ok(oneWord.warnings.some((w) => /un mot/.test(w)))

  /* colis au bureau sans identifiant : NOEST refuse */
  const noDesk = F.check({ ...base, stopDesk: 1, deskCommune: "Blida" }, "noest")
  assert.equal(noDesk.ok, false, "un colis au bureau sans station_code doit être bloqué")
  assert.ok(noDesk.missing.some((m) => /Bureau de retrait/.test(m.label)))

  /* avec le code station, ça passe */
  assert.equal(F.check({ ...base, stopDesk: 1, deskId: "16A", deskCommune: "Blida" }, "noest").ok, true)

  /* Maystro : commune au format numérique obligatoire */
  const may = F.check({ ...base, communeId: "Blida" }, "maystro")
  assert.equal(may.ok, false)
  assert.ok(may.missing.some((m) => /numérique/.test(m.label)))
  assert.equal(F.check({ ...base, communeId: "412" }, "maystro").ok, true)

  /* un transporteur maison n'est jamais bloqué par une règle qu'on ne connaît pas */
  assert.equal(F.check({}, "custom").ok, true)
})

/* ----------------------- 2. l'écran et l'envoi réel ----------------------- */

test("fiche colis : l'écran montre ce qui va partir, et bloque si incomplet", async () => {
  await login()
  /* Yalidine branchée sur le faux transporteur */
  await req("/dashboard/transporteur", form({
    preset: "yalidine",
    enabled: "1",
    base_url: MOCK,
    origin_wilaya: "Blida",
    header1_name: "X-API-ID",
    header1_value: "id-de-test",
    header2_name: "X-API-TOKEN",
    header2_value: "jeton-de-test",
  }))
  await req("/amina-mode")
  await req("/amina-mode/cart", form({ product_id: "3" }))
  await req("/amina-mode/checkout", form({
    customer_name: "Amine Belkacem",
    phone: "+213 555 12 34 56",
    address: "Cité 200 logements, bâtiment B",
    wilaya: "Blida",
    commune: "Blida",
    delivery: "home",
    payment: "cod",
  }))
  const db = dbFile()
  const order = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()

  /* la fiche colis ne s'affiche que sur une commande confirmée */
  await req(`/dashboard/orders/${order.id}/status`, form({ status: "confirmee" }))
  const page = await req(`/dashboard/orders/${order.id}`)
  assert.ok(page.text.includes("Ce qui part chez Yalidine"), "le récapitulatif du colis doit nommer la société")
  assert.ok(page.text.includes("Fiche complète"), "la fiche doit être annoncée complète")
  /* dzship affiche un nom complet, plus les anciens champs firstname / familyname */
  assert.ok(page.text.includes("{{fullName}}"), "le marchand doit voir quelle variable est envoyée")
  assert.ok(!page.text.includes("{{firstName}}"))
  assert.ok(page.text.includes("Amine Belkacem"), "la valeur réellement envoyée doit s'afficher")
  assert.ok(page.text.includes("0555123456"), "le téléphone affiché est celui qui part, sans +213")
  assert.ok(page.text.includes("{{wilaya}}") && page.text.includes("Blida"))
  assert.ok(page.text.includes("{{commune}}"))
  assert.ok(page.text.includes("{{products}}"))
  assert.ok(page.text.includes("Foulard"), "la description doit nommer les articles")
  assert.ok(page.text.includes(String(Math.round(order.total_cents / 100))))
  assert.doesNotMatch(page.text, /disabled[^>]*>[\s\S]{0,40}Envoyer le colis/)
})

test("fiche colis : un champ obligatoire manquant empêche l'envoi (rien ne part)", async () => {
  /* Maystro prend le nom de la commune : une commune « Blida » n'est plus un trou. */
  await req("/dashboard/transporteur", form({
    preset: "maystro",
    enabled: "1",
    base_url: MOCK,
    header1_name: "Authorization",
    header1_value: "jeton-maystro",
  }))
  await req("/amina-mode")
  await req("/amina-mode/cart", form({ product_id: "3" }))
  await req("/amina-mode/checkout", form({
    customer_name: "Nadia Haddad",
    phone: "0661001122",
    address: "Rue des Frères",
    wilaya: "Blida",
    commune: "Blida",
    delivery: "home",
    payment: "cod",
  }))
  const db = dbFile()
  const order = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()

  await req(`/dashboard/orders/${order.id}/status`, form({ status: "confirmee" }))
  const ready = await req(`/dashboard/orders/${order.id}`)
  assert.ok(ready.text.includes("Ce qui part chez Maystro"))
  assert.ok(ready.text.includes("Fiche complète"))
  assert.ok(ready.text.includes("{{fullName}}") && ready.text.includes("Nadia Haddad"))
  assert.ok(!ready.text.includes("Identifiant numérique de la commune"))
  assert.ok(!ready.text.includes("Complète les champs"))

  /* le blocage tient toujours : un mobile illisible empêche l'envoi, sans appel. */
  const write = openDb(DB)
  write.prepare("UPDATE orders SET phone = ? WHERE id = ?").run("123", order.id)
  write.close()
  const page = await req(`/dashboard/orders/${order.id}`)
  assert.ok(/champ\(s\) obligatoire\(s\) manquant\(s\)/.test(page.text), "les champs manquants doivent être annoncés")
  assert.ok(page.text.includes("Mobile algérien"), "le champ fautif doit être nommé")
  assert.ok(/disabled/.test(page.text), "le bouton d'envoi doit être désactivé")
  assert.ok(page.text.includes("Complète les champs"), "il faut dire quoi faire")

  received = []
  const res = await req(`/dashboard/orders/${order.id}/expedier`, form({ stopDesk: "0" }))
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(received.length, 0, "rien ne doit être envoyé si la fiche est incomplète")
  assert.ok(res.location.includes("envoi=incomplet"), "le marchand doit être averti au retour")

  const db2 = dbFile()
  const after = db2.prepare("SELECT status, tracking FROM orders WHERE id = ?").get(order.id)
  db2.close()
  assert.equal(after.tracking, "", "aucun suivi ne doit être inventé")
  assert.notEqual(after.status, "expediee", "la commande ne doit pas passer en expédiée")
})
