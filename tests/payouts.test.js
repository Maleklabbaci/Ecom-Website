/* LOT 46 — reversements des transporteurs.
   Le transporteur encaisse le colis, garde les frais de livraison, et doit
   reverser le reste. On vérifie ici les trois promesses de l'écran :
     - ce qui est dû = total payé − frais de livraison, pour les commandes
       livrées avec un transporteur (rien d'inventé) ;
     - un versement se pose sur les plus anciennes commandes ;
     - un versement partiel laisse une dette visible, et peut être annulé.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")
let PORT = 0
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-reversements-${Date.now()}.db`)
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

/** Le texte lisible d'une page : les balises en moins, les espaces en plus. */
const plain = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")

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

let carrierId = 0
const orderIds = []

function seed() {
  const db = dbFile()
  carrierId = Number(db.prepare(`INSERT INTO carriers (store_id, preset, label, enabled)
    VALUES (1, 'yalidine', 'Yalidine test', 1)`).run().lastInsertRowid)
  const add = (ref, total, ship, status, carrier, fake = 0, store = 1) =>
    Number(db.prepare(`INSERT INTO orders (store_id, ref, customer_name, phone, address, wilaya,
      subtotal_cents, shipping_cents, total_cents, status, carrier_id, fake, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(store, ref, "Client test", "0550000000", "Rue de test",
      "Blida", total - ship, ship, total, status, carrier, fake, "2026-10-18 10:00:00").lastInsertRowid)
  orderIds.push(add("R-1", 620000, 60000, "livree", carrierId))        // dû 5 600
  orderIds.push(add("R-2", 350000, 50000, "livree", carrierId))        // dû 3 000
  orderIds.push(add("R-3", 480000, 70000, "expediee", carrierId))      // pas encore livrée
  orderIds.push(add("R-4", 200000, 20000, "livree", 0))                // aucun transporteur
  orderIds.push(add("R-5", 900000, 0, "livree", carrierId, 1))         // commande de test
  orderIds.push(add("R-6", 700000, 0, "livree", carrierId, 0, 2))      // autre boutique
  db.close()
}

test("reversements : la page existe et ne montre rien d'inventé sans transporteur", async () => {
  await login()
  const page = await req("/dashboard/reversements")
  assert.equal(page.status, 200)
  const txt = plain(page.text)
  assert.match(txt, /Reversements/)
  assert.match(txt, /Aucun transporteur branché/, "sans transporteur, un message clair")
  assert.match(txt, /Ajouter un transporteur/)
})

test("reversements : le dû est total − livraison, seulement sur les commandes livrées", async () => {
  seed()
  await login()
  const page = await req("/dashboard/reversements")
  const txt = plain(page.text)
  /* 5 600 + 3 000 = 8 600 : l'expédiée, la commande sans transporteur,
     la commande de test et celle de l'autre boutique ne comptent pas */
  assert.match(txt, /8 600,00/, "le total dû doit être 8 600 DZD")
  assert.match(txt, /5 600,00/)
  assert.match(txt, /3 000,00/)
  assert.doesNotMatch(txt, /480 000|4 800,00|R-3/, "une commande non livrée ne doit pas être réclamée")
  assert.doesNotMatch(txt, /R-4|R-5|R-6/, "ni sans transporteur, ni de test, ni d'une autre boutique")
  assert.match(txt, /2 commandes livrées pas encore versées/)
})

test("reversements : le versement se pose sur les plus anciennes commandes", async () => {
  await login()
  await req("/dashboard/reversements", form({ carrier_id: String(carrierId), day: "2026-10-20", amount: "5000", note: "Virement 1" }))
  const page = await req("/dashboard/reversements")
  const txt = plain(page.text)
  /* 5 000 : R-1 (5 600) n'est pas couverte entièrement, rien ne va sur R-2 */
  assert.match(txt, /3 600,00/, "il reste 3 600 DZD à recevoir")
  assert.match(txt, /reçu 5 600,00 DZD · versé 5 000,00 DZD/, "R-1 garde 600 DZD à verser")
  assert.match(txt, /600,00 DZD/, "le manque de R-1 est affiché")
  assert.match(txt, /Virement 1/)

  /* le second versement termine R-1 puis attaque R-2 */
  await req("/dashboard/reversements", form({ carrier_id: String(carrierId), day: "2026-10-27", amount: "3000", note: "Virement 2" }))
  const p2 = plain((await req("/dashboard/reversements")).text)
  assert.match(p2, /600,00/, "il reste 600 DZD sur R-2")
  assert.match(p2, /1 commande livrée pas encore versée/)
})

test("reversements : un versement plus gros que la dette est refusé", async () => {
  await login()
  const before = await req("/dashboard/reversements")
  const nBefore = (before.text.match(/Annuler/g) || []).length
  const r = await req("/dashboard/reversements", form({ carrier_id: String(carrierId), day: "2026-11-01", amount: "9000" }))
  assert.equal(r.status, 302)
  assert.match(decodeURIComponent(r.location), /dépasse/)
  const after = await req("/dashboard/reversements")
  const nAfter = (after.text.match(/Annuler/g) || []).length
  assert.equal(nAfter, nBefore, "aucun versement ne doit être enregistré")
})

test("reversements : annuler un versement remet la dette", async () => {
  await login()
  const db = dbFile()
  const last = db.prepare("SELECT id FROM carrier_payouts ORDER BY id DESC LIMIT 1").get()
  db.close()
  const r = await req(`/dashboard/reversements/${last.id}/supprimer`, form({}))
  assert.equal(r.status, 302)
  const txt = plain((await req("/dashboard/reversements")).text)
  /* il ne reste que le premier versement de 5 000 : 3 600 DZD dus */
  assert.match(txt, /3 600,00/)
  assert.doesNotMatch(txt, /Virement 2/, "le versement annulé disparaît de l'historique")
})

test("reversements : pastille du menu et total identiques à la page", async () => {
  await login()
  const dash = await req("/dashboard")
  const i = dash.text.indexOf('href="/dashboard/reversements"')
  assert.ok(i > 0, "lien Reversements absent du menu")
  assert.match(dash.text.slice(i, i + 600), /nav-badge[^>]*>2</, "2 commandes livrées pas encore versées")
  assert.match(dash.text.slice(i, i + 600), /Reversements/)
})
