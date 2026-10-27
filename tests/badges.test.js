/* LOT 45 — les chiffres de la barre latérale (« taskbar ») :
   commandes à traiter, paniers abandonnés, stock faible, avis en attente…
   Un chiffre faux serait pire que pas de chiffre : on vérifie la valeur réelle.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")
let PORT = 0
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-badges-${Date.now()}.db`)
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

/** Extrait le contenu du lien du menu pour une page donnée. */
const navLink = (html, href) => {
  const i = html.indexOf(`href="${href}"`)
  if (i < 0) return ""
  return html.slice(i, i + 900)
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

async function newOrder(name) {
  await req("/amina-mode")
  await req("/amina-mode/cart", form({ product_id: "3" }))
  await req("/amina-mode/checkout", form({
    customer_name: name, phone: "0555123456", address: "Rue de test",
    wilaya: "Blida", commune: "Blida", delivery: "home", payment: "cod",
  }))
}

test("barre latérale : aucun chiffre quand il n'y a rien à faire", async () => {
  await login()
  const page = await req("/dashboard")
  assert.equal(page.status, 200)
  /* les liens existent, mais sans pastille */
  assert.ok(navLink(page.text, "/dashboard/orders"), "lien Commandes manquant")
  assert.doesNotMatch(navLink(page.text, "/dashboard/orders"), /nav-badge/)
  assert.doesNotMatch(navLink(page.text, "/dashboard/paniers"), /nav-badge/)
  assert.doesNotMatch(navLink(page.text, "/dashboard/stock"), /nav-badge/)
})

test("barre latérale : le nombre de commandes à traiter est le vrai", async () => {
  await login()
  await newOrder("Badge Un")
  await newOrder("Badge Deux")
  const page = await req("/dashboard")
  const lien = navLink(page.text, "/dashboard/orders")
  assert.match(lien, /nav-badge[^>]*>2</, "deux commandes neuves = pastille 2")

  /* on confirme une commande : elle ne compte plus comme « à traiter » */
  const db = dbFile()
  const first = db.prepare("SELECT id FROM orders ORDER BY id LIMIT 1").get()
  db.close()
  await req(`/dashboard/orders/${first.id}/status`, form({ status: "confirmee" }))
  const after = await req("/dashboard")
  assert.match(navLink(after.text, "/dashboard/orders"), /nav-badge[^>]*>1</)

  /* une commande de test ne doit jamais apparaître dans les chiffres */
  await req("/dashboard/orders/fake", form({}))
  const withFake = await req("/dashboard")
  assert.match(navLink(withFake.text, "/dashboard/orders"), /nav-badge[^>]*>1</,
    "la commande de test ne doit pas gonfler le compteur")
})

test("barre latérale : paniers abandonnés, stock faible et avis en attente", async () => {
  await login()
  const db = dbFile()
  /* un panier laissé de côté il y a deux heures */
  db.prepare(`INSERT INTO carts (store_id, token, session_hash, items_json, subtotal_cents, count,
              name, phone, wilaya, address, status, first_seen, last_seen)
              VALUES (1, 'tok-badge', 'h', '[]', 450000, 1, 'Panier Test', '0661112233',
              'Blida', 'Rue Z', 'open', datetime('now','-3 hours'), datetime('now','-2 hours'))`).run()
  /* un produit en rupture */
  db.prepare("UPDATE products SET stock = 0 WHERE id = 4").run()
  /* un avis à valider */
  db.prepare(`INSERT INTO reviews (store_id, product_id, name, rating, body, approved)
              VALUES (1, 1, 'Client Avis', 5, 'Parfait', 0)`).run()
  db.close()

  const page = await req("/dashboard")
  assert.match(navLink(page.text, "/dashboard/paniers"), /nav-badge warn[^>]*>1</)
  assert.match(navLink(page.text, "/dashboard/stock"), /nav-badge danger[^>]*>1</)
  /* les avis sont dans « Plus d'outils » : le compteur reste visible même replié */
  const i = page.text.indexOf("Plus d'outils")
  assert.ok(i > 0, "section « Plus d'outils » absente")
  assert.match(page.text.slice(i, i + 300), /nav-badge[^>]*>1</)
  /* et dans la sous-liste */
  assert.match(navLink(page.text, "/dashboard/reviews"), /nav-badge[^>]*>1</)
})

test("barre latérale : les chiffres sont sur toutes les pages du tableau de bord", async () => {
  await login()
  for (const page of ["/dashboard/products", "/dashboard/orders", "/dashboard/stock", "/dashboard/relances"]) {
    const r = await req(page)
    assert.equal(r.status, 200, page)
    assert.match(r.text, /class="dash-nav"/, "menu absent sur " + page)
    assert.match(navLink(r.text, "/dashboard/paniers"), /nav-badge/, "pastille absente sur " + page)
  }
})

test("barre latérale : le compteur de produits reste affiché même à zéro", async () => {
  await login()
  const page = await req("/dashboard")
  assert.match(navLink(page.text, "/dashboard/products"), /nav-count/, "le nombre de produits doit rester visible")
})
