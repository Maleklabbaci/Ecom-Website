/* LOT 46 — les réglages qui font vendre sans colis perdu :
   commune obligatoire, acompte avant l'envoi, répartition des commandes
   entre les personnes de l'équipe, et photo sur un avis.
   Un réglage éteint doit rester éteint, un réglage allumé doit vraiment agir.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")
let PORT = 0
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-vente-${Date.now()}.db`)
let server
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
const dbFile = () => openDb(DB)

/** Remplit le panier puis tente la commande. */
async function order(fields) {
  await req("/amina-mode")
  await req("/amina-mode/cart", form({ product_id: "3" }))
  return req("/amina-mode/checkout", form({
    customer_name: "Cliente Test", phone: "0555123456", address: "Rue de test",
    wilaya: "Blida", delivery: "home", payment: "cod", ...fields,
  }))
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const started = await startServer({ db: DB })
  server = started.child
  PORT = started.port
  BASE = started.base
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

test("commune : facultative par défaut, la commande passe sans commune", async () => {
  const res = await order({})
  assert.notEqual(res.status, 400, "sans réglage, la commune ne bloque rien")
})

test("commune obligatoire : refusée quand elle manque, acceptée quand elle est là", async () => {
  await login()
  await req("/dashboard/settings", form({
    name: "Amina Mode", slug: "amina-mode", currency: "DZD", commune_required: "1",
  }))
  const refusee = await order({})
  assert.equal(refusee.status, 400)
  assert.match(refusee.text, /commune/i)

  const ok = await order({ commune: "Blida" })
  assert.notEqual(ok.status, 400, "avec la commune, la commande passe")
})

test("acompte : inscrit sur la commande quand la boutique en demande un", async () => {
  await login()
  await req("/dashboard/settings", form({
    name: "Amina Mode", slug: "amina-mode", currency: "DZD", commune_required: "1",
    deposit: "500", deposit_note: "Baridimob 007999123456789",
  }))
  const res = await order({ commune: "Blida" })
  assert.notEqual(res.status, 400)
  assert.match(res.text, /[Aa]compte/, "la page de confirmation rappelle l'acompte")

  const db = dbFile()
  const o = db.prepare("SELECT deposit_cents, deposit_paid FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()
  assert.equal(o.deposit_cents, 50000, "500 DA en centimes")
  assert.equal(o.deposit_paid, 0, "l'argent n'est pas encore arrivé")
})

test("acompte reçu : le vendeur coche, la marque change", async () => {
  await login()
  const db0 = dbFile()
  const id = db0.prepare("SELECT id FROM orders ORDER BY id DESC LIMIT 1").get().id
  db0.close()
  const res = await req(`/dashboard/orders/${id}/acompte`, form({}))
  assert.equal(res.status, 302)
  const db = dbFile()
  const o = db.prepare("SELECT deposit_paid FROM orders WHERE id = ?").get(id)
  db.close()
  assert.equal(o.deposit_paid, 1)
})

test("acompte : zéro ne demande rien (le réglage s'éteint vraiment)", async () => {
  await login()
  await req("/dashboard/settings", form({
    name: "Amina Mode", slug: "amina-mode", currency: "DZD", deposit: "0", deposit_note: "",
  }))
  await order({ commune: "Blida" })
  const db = dbFile()
  const o = db.prepare("SELECT deposit_cents FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()
  assert.equal(o.deposit_cents, 0)
})

test("répartition : chaque commande reçoit un nom, à tour de rôle", async () => {
  const db = dbFile()
  const sid = db.prepare("SELECT id FROM stores WHERE slug = 'amina-mode'").get().id
  const add = db.prepare("INSERT INTO store_members (store_id, email, name, perms, status) VALUES (?, ?, ?, ?, 'active')")
  add.run(sid, "sara@exemple.dz", "Sara", JSON.stringify(["orders"]))
  add.run(sid, "yacine@exemple.dz", "Yacine", JSON.stringify(["orders"]))
  db.close()

  await login()
  await order({ commune: "Blida" })
  await order({ commune: "Blida" })

  const db2 = dbFile()
  const rows = db2.prepare("SELECT assigned_to FROM orders ORDER BY id DESC LIMIT 2").all()
  const sid2 = db2.prepare("SELECT id FROM stores WHERE slug = 'amina-mode'").get().id
  const noms = db2.prepare("SELECT id, name FROM store_members WHERE store_id = ?").all(sid2)
  db2.close()
  const byId = new Map(noms.map((m) => [m.id, m.name]))
  assert.ok(rows.every((r) => r.assigned_to > 0), "aucune commande ne reste sans personne")
  assert.notEqual(rows[0].assigned_to, rows[1].assigned_to, "deux commandes de suite = deux personnes")
  assert.deepEqual(new Set(rows.map((r) => byId.get(r.assigned_to))), new Set(["Sara", "Yacine"]))
})

test("répartition : le bouton répartit les commandes restées sans personne", async () => {
  const db0 = dbFile()
  db0.prepare("UPDATE orders SET assigned_to = 0").run()
  db0.close()
  await login()
  const res = await req("/dashboard/orders/repartir", form({}))
  assert.equal(res.status, 302)
  const db = dbFile()
  const n = db.prepare("SELECT COUNT(*) n FROM orders WHERE assigned_to = 0 AND fake = 0").get().n
  db.close()
  assert.equal(n, 0)
})

test("avis : la photo du client est enregistrée, une fausse image est refusée", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
  const res = await req("/amina-mode/p/1/review", form({
    name: "Nadia", rating: "5", body: "Très jolie robe.", photo: png,
  }))
  assert.equal(res.status, 302)
  const db = dbFile()
  const ok = db.prepare("SELECT photo FROM reviews ORDER BY id DESC LIMIT 1").get()
  db.close()
  assert.match(ok.photo, /^\/uploads\/[\w.-]+\.png$/, "la photo est stockée localement")

  await req("/amina-mode/p/1/review", form({
    name: "Faux", rating: "5", body: "image bidon", photo: "data:image/png;base64,bm90IGFuIGltYWdl",
  }))
  const db2 = dbFile()
  const bad = db2.prepare("SELECT photo FROM reviews ORDER BY id DESC LIMIT 1").get()
  db2.close()
  assert.equal(bad.photo, "", "un fichier qui n'est pas une image n'est pas gardé")
})
