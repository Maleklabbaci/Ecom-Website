/* LOT 48 — « Mes boutiques » : un seul écran pour toutes les boutiques.
   Ce qui compte pour quelqu'un qui tient deux ou trois boutiques :
   où est l'argent, ce qu'il reste à traiter, ce que les transporteurs doivent.
   Les chiffres doivent être ceux des boutiques, pas une addition approximative.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-boutiques-${Date.now()}.db`)
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
const plain = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")

/** Une commande réelle dans une boutique donnée. */
function order(storeId, total, status = "nouvelle") {
  const db = dbFile()
  const id = db.prepare(`INSERT INTO orders (store_id, ref, customer_name, phone, address, wilaya,
    subtotal_cents, shipping_cents, total_cents, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))`).run(storeId, "B-" + Math.random().toString(36).slice(2, 7),
    "Client test", "0550000000", "Rue de test", "Blida", total - 50000, 50000, total, status).lastInsertRowid
  db.close()
  return Number(id)
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

test("mes boutiques : toutes les boutiques du compte sont listées", async () => {
  await login()
  const page = await req("/dashboard/boutiques")
  assert.equal(page.status, 200)
  const txt = plain(page.text)
  assert.match(txt, /Mes boutiques/)
  assert.match(txt, /Amina Mode/)
  assert.match(txt, /Tech DZ/)
  assert.match(txt, /30 derniers jours/)
})

test("mes boutiques : chaque carte montre les chiffres de SA boutique", async () => {
  order(1, 300000)            // 3 000 DZD chez Amina Mode
  order(2, 500000)            // 5 000 DZD chez Tech DZ
  await login()
  const txt = plain((await req("/dashboard/boutiques")).text)
  /* on lit la liste des cartes, pas le menu de gauche */
  const from = txt.indexOf("clique pour ouvrir")
  assert.ok(from > 0, "la liste des boutiques est absente")
  const list = txt.slice(from)
  const iAmina = list.indexOf("Amina Mode")
  const iTech = list.indexOf("Tech DZ")
  assert.ok(iAmina > 0 && iTech > 0)
  const cardAmina = list.slice(iAmina, iTech)
  const cardTech = list.slice(iTech, iTech + 300)
  assert.match(cardAmina, /3 000,00/, "la commande d'Amina doit apparaître sur sa carte")
  assert.match(cardTech, /5 000,00/, "la commande de Tech DZ doit apparaître sur sa carte")
  assert.doesNotMatch(cardAmina, /5 000,00/, "les chiffres ne se mélangent pas entre boutiques")
})

test("mes boutiques : le total additionne vraiment toutes les boutiques", async () => {
  await login()
  const txt = plain((await req("/dashboard/boutiques")).text)
  /* 3 000 + 5 000 = 8 000, et le total doit être annoncé comme tel */
  assert.match(txt, /Chiffre d'affaires\s*8 000,00/, "le total toutes boutiques est faux")
  assert.match(txt, /toutes boutiques/)
  assert.match(txt, /commandes? à appeler/, "les commandes à traiter doivent être comptées")
})

test("mes boutiques : une commande à traiter se voit tout de suite", async () => {
  order(2, 120000, "livree")   // livrée : plus rien à traiter, mais l'argent compte
  await login()
  const txt = plain((await req("/dashboard/boutiques")).text)
  assert.match(txt, /9 200,00/, "le chiffre d'affaires suit les commandes ajoutées")
  /* deux commandes restent à appeler : une par boutique */
  assert.match(txt, /2 commandes à appeler/)
})

test("mes boutiques : on peut toujours ouvrir une autre boutique", async () => {
  await login()
  const page = await req("/dashboard/boutiques")
  assert.match(page.text, /\/dashboard\/utiliser-boutique/)
  const r = await req("/dashboard/utiliser-boutique", form({ store_id: "2" }))
  assert.equal(r.status, 302)
  const dash = await req("/dashboard")
  assert.match(plain(dash.text), /Tech DZ/, "la boutique ouverte doit être Tech DZ")
  /* retour à la première boutique pour ne pas laisser la session ailleurs */
  await req("/dashboard/utiliser-boutique", form({ store_id: "1" }))
})
