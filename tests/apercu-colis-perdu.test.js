/* Aperçu du site dans le tableau de bord (boutique + vitrine) et statut
   « Colis perdu » : normalisation, exclusion du chiffre d'affaires,
   marquage depuis l'interface, filtre de la liste, tuile d'alerte.
   Serveur isolé (port libre, base temporaire, données de démonstration). */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")
const DB = path.join(os.tmpdir(), `novadz-apercu-${Date.now()}.db`)
process.env.NOVADZ_DB = DB
const ORD = require("../src/orders")

let server
let BASE = ""
let orderId = 0

async function req(jar, pathname, opts = {}) {
  const res = await fetch(BASE + pathname, {
    ...opts,
    headers: { ...(opts.headers || {}), cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") },
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
const login = (jar, email) => req(jar, "/login", form({ email, password: "demo1234" }))

before(async () => {
  server = await startServer({ db: DB })
  BASE = server.base
  const db = openDb(DB)
  const store = db.prepare("SELECT s.id FROM stores s JOIN users u ON u.id = s.owner_id WHERE u.email = 'demo@novadz.dz'").get()
  assert.ok(store, "boutique de démonstration présente")
  const r = db.prepare(`INSERT INTO orders (store_id, ref, customer_name, phone, address, wilaya, subtotal_cents, shipping_cents, total_cents, status)
    VALUES (?, 'TEST-PERDU', 'Client Test', '0550000000', '1 rue du test', 'Alger', 100000, 60000, 160000, 'expediee')`).run(store.id)
  orderId = Number(r.lastInsertRowid)
})
after(async () => {
  if (server) server.child.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

test("colis perdu : le statut existe et ses libellés sont compris", () => {
  assert.ok(ORD.STATUSES.some((s) => s.id === "perdue"))
  assert.equal(ORD.norm("Colis perdu"), "perdue")
  assert.equal(ORD.norm("perdu"), "perdue")
  assert.equal(ORD.norm("lost"), "perdue")
  assert.equal(ORD.label("perdue"), "Colis perdu")
})

test("colis perdu : il ne compte pas dans le chiffre d'affaires", () => {
  assert.equal(ORD.counts({ status: "perdue", fake: 0 }), false)
  assert.equal(ORD.counts({ status: "expediee", fake: 0 }), true)
  const t = ORD.tally([
    { status: "perdue", total_cents: 5000, fake: 0 },
    { status: "expediee", total_cents: 7000, fake: 0 },
  ])
  assert.equal(t.perdue, 1)
  assert.equal(t.ca, 7000)
})

test("boutique : l'accueil marchand montre l'aperçu du site et le suivi des livraisons", async () => {
  const jar = new Map()
  await login(jar, "demo@novadz.dz")
  const { status, text } = await req(jar, "/dashboard")
  assert.equal(status, 200)
  assert.ok(text.includes("Aperçu du site"), "panneau d'aperçu présent")
  assert.ok(text.includes("?preview=1"), "iframe d'aperçu (sans compter la visite)")
  assert.ok(text.includes("Livraisons à suivre"), "tuiles de suivi présentes")
  assert.ok(text.includes("Colis perdus"), "tuile colis perdus présente")
})

test("boutique : marquer un colis perdu le fait ressortir dans l'interface", async () => {
  const jar = new Map()
  await login(jar, "demo@novadz.dz")
  const post = await req(jar, `/dashboard/orders/${orderId}/status`, form({ status: "perdue" }))
  assert.ok(post.status === 302 || post.status === 200, "changement de statut accepté : " + post.status)
  const db = openDb(DB)
  assert.equal(db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId).status, "perdue")
  const liste = await req(jar, "/dashboard/orders?statut=perdue")
  assert.ok(liste.text.includes("Client Test"), "la commande apparaît dans le filtre « perdue »")
  assert.ok(liste.text.includes("Colis perdu"), "le libellé « Colis perdu » s'affiche")
  const home = await req(jar, "/dashboard")
  assert.ok(home.text.includes("suivi-tile danger"), "la tuile passe en alerte quand un colis est perdu")
})

test("vitrine : aperçu du site, et les messages du formulaire arrivent dans l'interface", async () => {
  const visiteur = new Map()
  const envoi = await req(visiteur, "/atelier-lina/contact", form({
    name: "Test Visiteur", phone: "0550112233", email: "", message: "Message de test automatise.", website: "",
  }))
  assert.ok(envoi.location.includes("envoye=1"), "formulaire accepté : " + envoi.location)
  const jar = new Map()
  await login(jar, "vitrine@novadz.dz")
  const home = await req(jar, "/dashboard")
  assert.ok(home.text.includes("Aperçu du site"), "panneau d'aperçu présent côté vitrine")
  assert.ok(home.text.includes("?preview=1"), "iframe d'aperçu côté vitrine")
  assert.ok(home.text.includes("Message de test automatise."), "le message reçu s'affiche dès l'accueil")
  const recus = await req(jar, "/dashboard/recus")
  assert.ok(recus.text.includes("Test Visiteur"), "le message est dans les Reçus")
  const visites = await req(jar, "/dashboard/visites")
  assert.equal(visites.status, 200)
})
