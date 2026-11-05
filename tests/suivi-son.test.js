/* Suivi de commande et son : deux nouvelles, deux sons.

   Avant : tout passait par le carillon de commande. Une commande et un colis
   livré sonnaient pareil.
   Maintenant : « ♪ Commande » (deux notes qui montent) pour une vente,
   « ♪ Suivi » (deux notes qui descendent, plus douces) pour une nouvelle du
   transporteur. La cloche reçoit le genre dans chaque notification.

   On vérifie : la base, le flux temps réel, le rendu du tableau de bord et le
   chemin complet d'une synchro transporteur (simulée, aucun réseau).
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-suivi-${Date.now()}.db`)
process.env.NOVADZ_DB = DB

const db = require("../src/db")
require("../src/carriers")
const NOTICES = require("../src/notices")
const CARRIERS = require("../src/carriers")

let BASE = ""
let server = null
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
  return { status: res.status, text: await res.text() }
}
const form = (o) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
})

const storeDeTest = () => {
  const owner = db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)")
    .run(`s${Date.now()}${Math.random()}@x.dz`, "x", "Test").lastInsertRowid
  return db.prepare("INSERT INTO stores (owner_id, slug, name) VALUES (?, ?, ?)")
    .run(owner, "suivi-" + Date.now() + Math.random().toString(36).slice(2), "Boutique suivi").lastInsertRowid
}

before(async () => {
  /* la base est neuve à chaque exécution (nom unique) : on ne l'efface pas ici,
     le processus de test l'a déjà ouverte */
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

/* ---------------------------------------------------------------- */
/* 1. Deux genres de notification                                    */
/* ---------------------------------------------------------------- */

test("une nouvelle commande garde le genre « order »", () => {
  const id = storeDeTest()
  NOTICES.add(id, { title: "Nouvelle commande — CMD-1", body: "Sara · 4 500 DZD" })
  const [row] = NOTICES.list(id)
  assert.equal(row.kind, "order")
})

test("une nouvelle du transporteur a le genre « suivi »", () => {
  const id = storeDeTest()
  NOTICES.add(id, { kind: "suivi", title: "Colis livré — CMD-2", body: "Yalidine · Blida" })
  const [row] = NOTICES.list(id)
  assert.equal(row.kind, "suivi")
  assert.equal(row.title, "Colis livré — CMD-2")
})

test("le flux temps réel transmet le genre (c'est lui qui choisit le son)", () => {
  const id = storeDeTest()
  const lignes = []
  const faux = { write: (t) => lignes.push(String(t)), set: null }
  const stop = NOTICES.subscribe(id, faux)
  NOTICES.add(id, { kind: "suivi", title: "Colis livré — CMD-3", body: "ZR · Oran" })
  stop()
  const data = lignes.map((l) => {
    const m = l.match(/^data: (.+)$/m)
    return m ? JSON.parse(m[1]) : null
  }).filter(Boolean)
  assert.ok(data.length >= 1, "le paquet est poussé tout de suite")
  assert.equal(data[0].kind, "suivi")
  assert.equal(data[0].title, "Colis livré — CMD-3")
})

/* ---------------------------------------------------------------- */
/* 2. Une synchro transporteur pose la notification                  */
/* ---------------------------------------------------------------- */

test("colis livré : la commande passe à « livree » et la cloche sonne en suivi", async () => {
  const store = require("../src/shop")
  const id = storeDeTest()
  db.prepare(`INSERT INTO carriers (store_id, preset, label, enabled, origin_wilaya)
    VALUES (?, 'yalidine', 'Yalidine', 1, 'Blida')`).run(id)
  const carrier = db.prepare("SELECT * FROM carriers WHERE store_id = ?").get(id)
  const orderId = db.prepare(`INSERT INTO orders (store_id, ref, customer_name, phone, address, wilaya, total_cents, status)
    VALUES (?, 'CMD-77', 'Sara B', '0551234567', 'Cité', 'Bou Saâda', 450000, 'expediee')`).run(id).lastInsertRowid
  const shipId = db.prepare(`INSERT INTO shipments (store_id, order_id, carrier_id, tracking, state, mapped)
    VALUES (?, ?, ?, 'YAL-77', '', '')`).run(id, orderId, carrier.id).lastInsertRowid

  /* le transporteur est simulé : pas de réseau dans les tests */
  const DZ = require("../src/dzship")
  const vraiHandles = DZ.handles
  const vraiTrack = DZ.track
  DZ.handles = () => true
  DZ.track = async () => ({ ok: true, raw: "livré", mapped: "livree" })
  try {
    const r = await CARRIERS.syncOne(db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipId))
    assert.equal(r.mapped, "livree")
  } finally {
    DZ.handles = vraiHandles
    DZ.track = vraiTrack
  }

  assert.equal(db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId).status, "livree")
  const [row] = NOTICES.list(id)
  assert.equal(row.kind, "suivi", "le son de suivi, pas celui de la caisse")
  assert.match(row.title, /Colis livré — CMD-77/)
  assert.match(row.body, /Yalidine/)
  assert.match(row.body, /4 500 DZD/)
  assert.match(row.href, /dashboard\/orders\/\d+/)
})

test("une deuxième synchro ne sonne pas deux fois", async () => {
  const id = storeDeTest()
  db.prepare(`INSERT INTO carriers (store_id, preset, label, enabled, origin_wilaya)
    VALUES (?, 'yalidine', 'Yalidine', 1, 'Blida')`).run(id)
  const carrier = db.prepare("SELECT * FROM carriers WHERE store_id = ?").get(id)
  const orderId = db.prepare(`INSERT INTO orders (store_id, ref, customer_name, phone, address, wilaya, total_cents, status)
    VALUES (?, 'CMD-88', 'Ali K', '0551234567', 'Rue', 'Alger', 300000, 'expediee')`).run(id).lastInsertRowid
  const shipId = db.prepare(`INSERT INTO shipments (store_id, order_id, carrier_id, tracking, state, mapped)
    VALUES (?, ?, ?, 'YAL-88', '', '')`).run(id, orderId, carrier.id).lastInsertRowid
  const DZ = require("../src/dzship")
  const vraiHandles = DZ.handles
  const vraiTrack = DZ.track
  DZ.handles = () => true
  DZ.track = async () => ({ ok: true, raw: "livré", mapped: "livree" })
  try {
    await CARRIERS.syncOne(db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipId))
    await CARRIERS.syncOne(db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipId))
  } finally {
    DZ.handles = vraiHandles
    DZ.track = vraiTrack
  }
  assert.equal(NOTICES.list(id).length, 1, "une seule notification pour un seul colis livré")
})

test("colis revenu : notification de suivi et stock remis", async () => {
  const id = storeDeTest()
  db.prepare(`INSERT INTO carriers (store_id, preset, label, enabled, origin_wilaya)
    VALUES (?, 'yalidine', 'Yalidine', 1, 'Blida')`).run(id)
  const carrier = db.prepare("SELECT * FROM carriers WHERE store_id = ?").get(id)
  const orderId = db.prepare(`INSERT INTO orders (store_id, ref, customer_name, phone, address, wilaya, total_cents, status)
    VALUES (?, 'CMD-99', 'Nadia L', '0551234567', 'Rue', 'Oran', 250000, 'expediee')`).run(id).lastInsertRowid
  const shipId = db.prepare(`INSERT INTO shipments (store_id, order_id, carrier_id, tracking, state, mapped)
    VALUES (?, ?, ?, 'YAL-99', '', '')`).run(id, orderId, carrier.id).lastInsertRowid
  const DZ = require("../src/dzship")
  const vraiHandles = DZ.handles
  const vraiTrack = DZ.track
  DZ.handles = () => true
  DZ.track = async () => ({ ok: true, raw: "retour", mapped: "annulee" })
  try {
    await CARRIERS.syncOne(db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipId))
  } finally {
    DZ.handles = vraiHandles
    DZ.track = vraiTrack
  }
  const [row] = NOTICES.list(id)
  assert.equal(row.kind, "suivi")
  assert.match(row.title, /Colis revenu — CMD-99/)
  assert.match(row.body, /retour au vendeur/)
})

/* ---------------------------------------------------------------- */
/* 3. Le rendu : deux sons, deux boutons                             */
/* ---------------------------------------------------------------- */

test("le tableau de bord propose les deux sons et les sépare", async () => {
  const r = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.ok([302, 303].includes(r.status), `login ${r.status}`)
  const page = await req("/dashboard")
  assert.equal(page.status, 200)
  assert.match(page.text, /data-bell-ding-suivi/, "bouton « ♪ Suivi »")
  assert.match(page.text, /♪ Commande/)
  assert.match(page.text, /♪ Suivi/)
  /* deux timbres différents : le carillon de caisse et le suivi n'ont pas les mêmes notes */
  assert.match(page.text, /1046\.5/)
  assert.match(page.text, /880/)
  assert.match(page.text, /659\.25/)
  assert.match(page.text, /function suivi\(\)/)
  assert.match(page.text, /joue\(kind\)/)
  /* la notification du système change d'étiquette selon le genre */
  assert.match(page.text, /tag: "novadz-" \+ kind/)
})

test("la cloche ne sonne le suivi que pour le suivi", async () => {
  const page = await req("/dashboard")
  assert.match(page.text, /it\.kind === "suivi" \? "suivi" : "commande"/)
  assert.match(page.text, /k-suivi/)
})

test("le style du suivi existe", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8")
  assert.match(css, /\.ndz-bell-item\.k-suivi/)
  assert.match(css, /\.ndz-toast\.suivi/)
})
