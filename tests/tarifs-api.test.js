/* LOT 50 — les frais de livraison pris chez le transporteur (API).
   Aujourd'hui la page « Frais de livraison » se remplit à la main. Ici on
   vérifie le chemin complet : on demande les prix réels, on les montre, et
   RIEN n'est écrit tant que le marchand n'a pas cliqué « Appliquer ».
   Le transporteur est simulé : aucun appel réseau dans les tests.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-tarifs-${Date.now()}.db`)
process.env.NOVADZ_DB = DB

const db = require("../src/db")
require("../src/carriers") /* crée la table des transporteurs, comme au démarrage */
const SHOP = require("../src/shop")
const TARIFS = require("../src/tarifs-api")

const aide = () => {
  const owner = db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)")
    .run(`t${Date.now()}@x.dz`, "x", "Test").lastInsertRowid
  const store = db.prepare("INSERT INTO stores (owner_id, slug, name) VALUES (?, ?, ?)")
    .run(owner, "boutique-test-" + Date.now(), "Boutique test").lastInsertRowid
  db.prepare(`INSERT INTO carriers (store_id, preset, label, enabled, origin_wilaya)
    VALUES (?, ?, ?, 1, 'Blida')`).run(store, "yalidine", "Yalidine")
  SHOP.ensureShipping(store)
  return db.prepare("SELECT * FROM stores WHERE id = ?").get(store)
}

before(() => {
  try { fs.unlinkSync(DB) } catch (_) {}
})

after(() => {
  TARIFS.setQuote(null)
  try { fs.unlinkSync(DB) } catch (_) {}
})

/* ---------------------------------------------------------------- */
/* 1. Lecture des tarifs                                            */
/* ---------------------------------------------------------------- */

test("tarifs API : les prix du transporteur arrivent, wilaya par wilaya", async () => {
  const store = aide()
  const demandees = []
  TARIFS.setQuote(async (carrier, wilaya) => {
    demandees.push(wilaya)
    if (wilaya === "Adrar") return { home: 140000, desk: 90000 }
    if (wilaya === "Alger") return { home: 45000, desk: 35000 }
    return null /* le transporteur ne répond pas pour les autres */
  })
  const out = await TARIFS.preview(store, { budgetMs: 5000 })
  assert.equal(out.ok, true)
  assert.equal(out.carrier, "Yalidine")
  assert.equal(out.found, 2)
  assert.equal(out.total, SHOP.WILAYAS.length)
  assert.equal(SHOP.WILAYAS.length, 69, "69 wilayas affichées")
  /* une wilaya nouvelle (59 à 69) n'a pas de tarif à elle : on demande celui
     de sa wilaya mère, une seule fois par mère — donc 58 appels, pas 69. */
  assert.equal(demandees.length, 58, "un appel par wilaya mère")

  const adrar = out.rows.find((r) => r.wilaya === "Adrar")
  assert.deepEqual({ home: adrar.home, desk: adrar.desk, api: adrar.api }, { home: 140000, desk: 90000, api: true })
  const oran = out.rows.find((r) => r.wilaya === "Oran")
  assert.equal(oran.api, false)
  assert.equal(oran.home, null)
})

test("tarifs API : rien n'est écrit tant qu'on n'a pas appliqué", async () => {
  const store = aide()
  const avant = SHOP.shippingTable(store.id)
  TARIFS.setQuote(async (c, w) => (w === "Blida" ? { home: 99000, desk: 70000 } : null))
  await TARIFS.preview(store, { budgetMs: 4000, force: true })
  const apres = SHOP.shippingTable(store.id)
  assert.deepEqual(apres, avant, "la lecture ne doit rien modifier en base")
})

test("tarifs API : une panne du transporteur ne casse rien, on garde ses tarifs", async () => {
  const store = aide()
  TARIFS.setQuote(async () => { throw new Error("réseau coupé") })
  const out = await TARIFS.preview(store, { budgetMs: 4000, force: true })
  assert.equal(out.ok, true)
  assert.equal(out.found, 0)
  assert.match(out.error, /aucun tarif/i, "on doit expliquer au lieu de laisser un vide")
})

test("tarifs API : sans transporteur branché, on le dit clairement", async () => {
  const owner = db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)")
    .run(`s${Date.now()}@x.dz`, "x", "Sans").lastInsertRowid
  const id = db.prepare("INSERT INTO stores (owner_id, slug, name) VALUES (?, ?, ?)")
    .run(owner, "sans-transporteur-" + Date.now(), "Sans transporteur").lastInsertRowid
  const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(id)
  const out = await TARIFS.preview(store)
  assert.equal(out.ok, false)
  assert.match(out.error, /Transporteur/i)
})

/* ---------------------------------------------------------------- */
/* 2. Application des tarifs                                        */
/* ---------------------------------------------------------------- */

test("tarifs API : « compléter » remplit les vides sans toucher à mes prix", async () => {
  const store = aide()
  /* une wilaya où le marchand a mis SON prix (les autres sont au tarif d'office) */
  db.prepare("UPDATE shipping_rates SET cents = ?, desk_cents = ? WHERE store_id = ? AND wilaya = 'Alger'")
    .run(90000, 80000, store.id)
  TARIFS.setQuote(async (c, w) => {
    if (w === "Alger") return { home: 45000, desk: 35000 }
    if (w === "Blida") return { home: 40000, desk: 30000 }
    return null
  })
  await TARIFS.preview(store, { budgetMs: 4000, force: true })
  const res = TARIFS.apply(store, "completer")
  assert.equal(res.ok, true)
  assert.ok(res.updated >= 1)

  const alger = db.prepare("SELECT cents, desk_cents FROM shipping_rates WHERE store_id = ? AND wilaya = 'Alger'").get(store.id)
  assert.equal(alger.cents, 90000, "mon tarif saisi à la main est gardé")
  const blida = db.prepare("SELECT cents, desk_cents FROM shipping_rates WHERE store_id = ? AND wilaya = 'Blida'").get(store.id)
  assert.equal(blida.cents, 40000, "le tarif venant de l'API remplit le vide")
  assert.equal(blida.desk_cents, 30000)
})

test("tarifs API : « remplacer » met les prix du transporteur partout", async () => {
  const store = aide()
  db.prepare("UPDATE shipping_rates SET cents = 99000, desk_cents = 88000 WHERE store_id = ? AND wilaya = 'Oran'").run(store.id)
  TARIFS.setQuote(async (c, w) => (w === "Oran" ? { home: 55000, desk: 42000 } : null))
  await TARIFS.preview(store, { budgetMs: 4000, force: true })
  const res = TARIFS.apply(store, "remplacer")
  assert.equal(res.ok, true)
  const oran = db.prepare("SELECT cents, desk_cents FROM shipping_rates WHERE store_id = ? AND wilaya = 'Oran'").get(store.id)
  assert.equal(oran.cents, 55000)
  assert.equal(oran.desk_cents, 42000)
})

test("tarifs API : les délais de livraison ne sont jamais écrasés", async () => {
  const store = aide()
  db.prepare("UPDATE shipping_rates SET eta_min = 1, eta_max = 2 WHERE store_id = ? AND wilaya = 'Sétif'").run(store.id)
  TARIFS.setQuote(async (c, w) => (w === "Sétif" ? { home: 50000, desk: 40000 } : null))
  await TARIFS.preview(store, { budgetMs: 4000, force: true })
  TARIFS.apply(store, "remplacer")
  const row = db.prepare("SELECT eta_min, eta_max FROM shipping_rates WHERE store_id = ? AND wilaya = 'Sétif'").get(store.id)
  assert.deepEqual([row.eta_min, row.eta_max], [1, 2])
})

test("tarifs API : appliquer sans avoir récupéré ne fait rien et le dit", () => {
  const store = aide()
  const res = TARIFS.apply(store, "remplacer")
  assert.equal(res.ok, false)
  assert.match(res.error, /Récupérez/i)
})

/* ---------------------------------------------------------------- */
/* 3. Le chemin complet dans l'application                          */
/* ---------------------------------------------------------------- */

let BASE = ""
let server
const jar = new Map()
const HDB = path.join(os.tmpdir(), `novadz-tarifs-http-${Date.now()}.db`)

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
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})

before(async () => {
  try { fs.unlinkSync(HDB) } catch (_) {}
  const started = await startServer({ db: HDB })
  server = started.child
  BASE = started.base
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
})

after(async () => {
  if (server) server.kill()
  try { fs.unlinkSync(HDB) } catch (_) {}
})

test("page frais de livraison : la carte « Tarifs du transporteur » est là", async () => {
  const html = (await req("/dashboard/shipping")).text
  assert.match(html, /data-api-rates/, "la carte doit exister")
  assert.match(html, /Récupérer les tarifs/)
  assert.match(html, /dashboard\/shipping\/tarifs-api/, "elle doit appeler la bonne route")
  assert.match(html, /Remplacer aussi les tarifs/, "le choix doit être explicite")
})

test("route tarifs : sans récupération préalable, appliquer refuse proprement", async () => {
  const r = await req("/dashboard/shipping/tarifs-api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "remplacer" }),
  })
  assert.equal(r.status, 200)
  const data = JSON.parse(r.text)
  assert.equal(data.ok, false)
  assert.ok(data.error)
})

test("route tarifs : un visiteur non connecté n'y a pas accès", async () => {
  const r = await fetch(BASE + "/dashboard/shipping/tarifs-api", { redirect: "manual" })
  await r.text()
  assert.ok(r.status === 302 || r.status === 401 || r.status === 403)
})

test("page frais de livraison : le tarif manuel marche toujours", async () => {
  const r = await fetch(BASE + "/dashboard/shipping", {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
    body: new URLSearchParams({ all: "700", all_desk: "600", applyAll: "1", ship_home: "1", ship_desk: "1" }).toString(),
  })
  await r.text()
  assert.equal(r.status, 302)
  const hdb = openDb(HDB, { readonly: true })
  const row = hdb.prepare("SELECT cents FROM shipping_rates WHERE wilaya = 'Oran' LIMIT 1").get()
  hdb.close()
  assert.equal(row.cents, 70000, "le formulaire manuel n'a pas été cassé par la nouveauté")
})
