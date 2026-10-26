/* LOT 44 — la fiche de travail du marchand :
   1. modifier une commande (infos client, articles, tarif, livraison) ;
   2. sélectionner plusieurs commandes et leur appliquer une action ;
   3. n'expédier que les commandes confirmées, avec la société de livraison choisie ;
   4. produit : photos glissables, la première est la photo principale ;
   5. produit : plusieurs titres de variante, chacun avec ses options.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const { spawn } = require("node:child_process")
const http = require("node:http")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, listen0 } = require("./boot")
let PORT = 0
let MOCK_PORT = 0
let BASE = ""
let MOCK = ""
const DB = path.join(os.tmpdir(), `novadz-lot44-${Date.now()}.db`)
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
const dbFile = () => new (require("better-sqlite3"))(DB, { readonly: true })

/** Commande client fraîche, renvoie son identifiant. */
async function newOrder(name = "Client Test", phone = "0555123456") {
  await req("/amina-mode")
  await req("/amina-mode/cart", form({ product_id: "3" }))
  await req("/amina-mode/checkout", form({
    customer_name: name, phone, address: "Cité 200 logements", wilaya: "Blida",
    commune: "Blida", delivery: "home", payment: "cod",
  }))
  const db = dbFile()
  const o = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()
  return o
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  mock = http.createServer((rq, rs) => {
    let body = ""
    rq.on("data", (c) => { body += c })
    rq.on("end", () => {
      received.push({ url: rq.url, headers: rq.headers, body })
      rs.writeHead(200, { "Content-Type": "application/json" })
      rs.end(JSON.stringify({ tracking: "LOT44-1", label: "" }))
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

/* ------------------------- 1. modifier une commande ------------------------- */

test("commande : la fiche propose de tout modifier (client, articles, tarif)", async () => {
  await login()
  const o = await newOrder()
  const page = await req(`/dashboard/orders/${o.id}`)
  assert.equal(page.status, 200)
  assert.match(page.text, /Modifier la commande/)
  assert.match(page.text, new RegExp(`action="/dashboard/orders/${o.id}/edit"`))
  for (const field of ["customer_name", "phone", "wilaya", "commune", "address", "shipping", "discount", "items"]) {
    assert.match(page.text, new RegExp(`name="${field}"`), "champ manquant dans le formulaire : " + field)
  }
  /* le sélecteur de produits pour ajouter une ligne au panier */
  assert.match(page.text, /id="oePick"/)
  assert.match(page.text, /Ajouter à la commande/)
})

test("commande : tout est modifiable et le total est recalculé", async () => {
  await login()
  const o = await newOrder("Ancien Nom", "0555000000")
  const before = dbFile()
  const p = before.prepare("SELECT id, title, price_cents FROM products WHERE store_id = 1 ORDER BY id LIMIT 1").get()
  before.close()

  const items = JSON.stringify([
    { product_id: p.id, title: "Robe d'été fleurie", price: "4500.00", qty: 2 },
    { product_id: p.id, title: "Foulard en soie", price: "1200.00", qty: 1 },
  ])
  const r = await req(`/dashboard/orders/${o.id}/edit`, form({
    customer_name: "Nouveau Nom", phone: "0661223344", wilaya: "Oran", commune: "Es Senia",
    address: "12 rue de la gare", note: "livrer le matin", delivery_type: "desk",
    shipping: "600", discount: "300", items,
  }))
  assert.ok([302, 303].includes(r.status))

  const db = dbFile()
  const after = db.prepare("SELECT * FROM orders WHERE id = ?").get(o.id)
  const rows = db.prepare("SELECT title, price_cents, qty FROM order_items WHERE order_id = ? ORDER BY id").all(o.id)
  db.close()

  assert.equal(after.customer_name, "Nouveau Nom")
  assert.equal(after.phone, "0661223344")
  assert.equal(after.wilaya, "Oran")
  assert.equal(after.commune, "Es Senia")
  assert.equal(after.delivery_type, "desk")
  assert.equal(rows.length, 2, "les articles doivent être remplacés")
  assert.equal(rows[0].title, "Robe d'été fleurie")
  assert.equal(rows[0].qty, 2)
  /* 2 × 4500 + 1200 = 10200 − 300 de remise + 600 de livraison = 10500 DZD */
  assert.equal(after.subtotal_cents, 1020000)
  assert.equal(after.discount_cents, 30000)
  assert.equal(after.shipping_cents, 60000)
  assert.equal(after.total_cents, 1050000, "total recalculé")

  const page = await req(`/dashboard/orders/${o.id}`)
  assert.match(page.text, /Commande modifiée/)
})

test("commande : une modification sans article est refusée (rien n'est effacé)", async () => {
  await login()
  const o = await newOrder("Garde Moi", "0555777888")
  const r = await req(`/dashboard/orders/${o.id}/edit`, form({
    customer_name: "Effacé", phone: "0555000000", items: "[]",
  }))
  assert.ok(r.location.includes("edit=vide"))
  const db = dbFile()
  const after = db.prepare("SELECT customer_name FROM orders WHERE id = ?").get(o.id)
  const n = db.prepare("SELECT COUNT(*) n FROM order_items WHERE order_id = ?").get(o.id).n
  db.close()
  assert.equal(after.customer_name, "Garde Moi", "la commande ne doit pas être touchée")
  assert.ok(n > 0, "les articles doivent rester")
})

/* ------------------------- 2. sélection multiple ------------------------- */

test("commandes : cases à cocher, tout sélectionner, action en lot", async () => {
  await login()
  const a = await newOrder("Lot A", "0555101010")
  const b = await newOrder("Lot B", "0555202020")
  const list = await req("/dashboard/orders")
  assert.match(list.text, /id="bulkForm"/)
  assert.match(list.text, /id="ordAll"/)
  assert.match(list.text, /class="ord-pick"/)
  assert.match(list.text, /form="bulkForm"/, "les cases doivent être rattachées au formulaire de lot")

  const r = await req("/dashboard/orders/bulk", form({ ids: `${a.id},${b.id}`, action: "confirmee" }))
  assert.ok(r.location.includes("lots=2"))
  const db = dbFile()
  const st = db.prepare("SELECT id, status FROM orders WHERE id IN (?, ?)").all(a.id, b.id)
  db.close()
  assert.equal(st.length, 2)
  st.forEach((o) => assert.equal(o.status, "confirmee"))

  /* une action inconnue ne touche à rien */
  await req("/dashboard/orders/bulk", form({ ids: `${a.id}`, action: "supprimer" }))
  const db2 = dbFile()
  const still = db2.prepare("SELECT status FROM orders WHERE id = ?").get(a.id)
  db2.close()
  assert.equal(still.status, "confirmee")
})

/* ------------------- 3. expédition : confirmée + société choisie ------------------- */

test("expédition : impossible tant que la commande n'est pas confirmée", async () => {
  await login()
  await req("/dashboard/transporteur", form({
    preset: "custom", label: "Transporteur A", enabled: "1", base_url: MOCK,
    header1_name: "Authorization", header1_value: "jeton-a",
    create_body: JSON.stringify({ ref: "{{ref}}", name: "{{fullName}}" }),
    resp_tracking_path: "tracking",
  }))
  const o = await newOrder("Pas Confirmée", "0555303030")
  assert.notEqual(o.status, "confirmee", "une commande neuve n'est pas confirmée")

  const page = await req(`/dashboard/orders/${o.id}`)
  assert.match(page.text, /Commande non confirmée/)
  assert.match(page.text, /Confirmer la commande/)

  received = []
  const r = await req(`/dashboard/orders/${o.id}/expedier`, form({ stopDesk: "0" }))
  assert.ok(r.location.includes("envoi=nonconfirmee"), "l'envoi doit être refusé")
  await new Promise((x) => setTimeout(x, 250))
  assert.equal(received.length, 0, "rien ne doit partir")

  const db = dbFile()
  const after = db.prepare("SELECT status, tracking FROM orders WHERE id = ?").get(o.id)
  db.close()
  assert.notEqual(after.status, "confirmee")
  assert.notEqual(after.status, "expediee", "le statut ne doit pas changer")
  assert.equal(after.tracking, "")
})

test("expédition : le menu affiche toutes les sociétés connectées, et une seule s'il n'y en a qu'une", async () => {
  await login()
  /* un seul transporteur : pas de menu, juste le nom */
  const solo = await newOrder("Une Seule Société", "0555606060")
  await req(`/dashboard/orders/${solo.id}/status`, form({ status: "confirmee" }))
  const one = await req(`/dashboard/orders/${solo.id}`)
  assert.match(one.text, /Société de livraison : <b>Transporteur A<\/b>/)
  assert.doesNotMatch(one.text, /name="carrier"/)

  /* un deuxième transporteur : le menu apparaît avec les deux */
  await req("/dashboard/transporteur", form({
    preset: "custom", label: "Transporteur B", enabled: "1", base_url: MOCK, new: "1",
    header1_name: "Authorization", header1_value: "jeton-b",
    create_body: JSON.stringify({ ref: "{{ref}}" }), resp_tracking_path: "tracking",
  }))
  const db0 = dbFile()
  const carrierA = db0.prepare("SELECT id FROM carriers WHERE label = 'Transporteur A'").get()
  db0.close()

  const o = await newOrder("Deux Sociétés", "0555404040")
  await req(`/dashboard/orders/${o.id}/status`, form({ status: "confirmee" }))
  const page = await req(`/dashboard/orders/${o.id}`)
  assert.match(page.text, /name="carrier"/, "le menu des sociétés doit apparaître")
  assert.match(page.text, /Transporteur A/)
  assert.match(page.text, /Transporteur B/)

  /* choisir explicitement la société A, puis expédier : c'est elle qui reçoit */
  received = []
  const send = await req(`/dashboard/orders/${o.id}/expedier`, form({ carrier_id: String(carrierA.id), stopDesk: "0" }))
  assert.ok([302, 303].includes(send.status))
  await new Promise((x) => setTimeout(x, 300))
  assert.equal(received.length, 1)
  assert.equal(received[0].headers.authorization, "jeton-a", "c'est la société choisie qui doit recevoir le colis")
})

/* ------------------------- 4. photos glissables ------------------------- */

test("produit : une seule liste de photos, la première est la photo principale", async () => {
  await login()
  const page = await req("/dashboard/products/1")
  assert.equal(page.status, 200)
  assert.match(page.text, /id="phGrid"/, "la liste de photos manque")
  assert.match(page.text, /draggable="true"/, "les photos doivent être déplaçables")
  assert.match(page.text, /Photo principale/)
  assert.match(page.text, /data-left=/, "flèche de déplacement manquante")
  assert.match(page.text, /id="phFile"/)
  /* plus d'ancien bloc séparé « galerie » */
  assert.doesNotMatch(page.text, /id="galList"/)
  assert.match(page.text, /id="galJson"/, "la galerie reste envoyée au serveur")
})

test("produit : la première photo de la liste devient la photo principale en base", async () => {
  await login()
  const db0 = dbFile()
  const p = db0.prepare("SELECT * FROM products WHERE store_id = 1 ORDER BY id LIMIT 1").get()
  db0.close()
  /* on enregistre : principale = B, galerie = [A] (exactement ce que fait le glisser-déposer) */
  await req(`/dashboard/products/${p.id}`, form({
    title: p.title, description: p.description || "", price: (p.price_cents / 100).toFixed(2),
    stock: String(p.stock), image: "/uploads/photo-b.jpg", gallery: JSON.stringify(["/uploads/photo-a.jpg"]),
    category_id: p.category_id || "0", focal: "center", active: "on", option_groups: "",
  }))
  const db = dbFile()
  const after = db.prepare("SELECT image FROM products WHERE id = ?").get(p.id)
  const gal = db.prepare("SELECT url, position FROM product_images WHERE product_id = ? ORDER BY position").all(p.id)
  db.close()
  assert.equal(after.image, "/uploads/photo-b.jpg", "la première photo doit être la principale")
  assert.equal(gal.length, 1)
  assert.equal(gal[0].url, "/uploads/photo-a.jpg", "les autres photos vont dans la galerie")
})

/* ------------------------- 5. titres de variante ------------------------- */

test("produit : plusieurs titres de variante, chacun avec ses options", async () => {
  await login()
  const page = await req("/dashboard/products/1")
  assert.match(page.text, /Titres de variante/)
  assert.match(page.text, /id="ogList"/)
  assert.match(page.text, /name="option_groups"/)

  const db0 = dbFile()
  const p = db0.prepare(`SELECT * FROM products WHERE store_id = 1
    AND id NOT IN (SELECT product_id FROM variants) ORDER BY id LIMIT 1`).get()
  db0.close()
  const groups = JSON.stringify([
    { name: "Taille", options: ["S", "M", "L"] },
    { name: "Couleur", options: ["Rouge", "Bleu"] },
  ])
  await req(`/dashboard/products/${p.id}`, form({
    title: p.title, description: p.description || "", price: (p.price_cents / 100).toFixed(2),
    stock: String(p.stock), image: p.image || "", gallery: "[]",
    category_id: p.category_id || "0", focal: "center", active: "on", option_groups: groups,
  }))
  const db = dbFile()
  const saved = JSON.parse(db.prepare("SELECT option_groups FROM products WHERE id = ?").get(p.id).option_groups)
  db.close()
  assert.equal(saved.length, 2)
  assert.equal(saved[0].name, "Taille")
  assert.deepEqual(saved[0].options, ["S", "M", "L"])
  assert.equal(saved[1].name, "Couleur")
  assert.deepEqual(saved[1].options, ["Rouge", "Bleu"])

  /* la vitrine propose les deux titres, et le choix arrive dans le panier */
  const shop = await req(`/amina-mode/p/${p.id}`)
  assert.match(shop.text, /Taille/)
  assert.match(shop.text, /Couleur/)
  assert.match(shop.text, /data-group="Taille"/)
  assert.match(shop.text, /name="opts"/)

  await req("/amina-mode")
  const add = await req("/amina-mode/cart", form({ product_id: String(p.id), opts: "Taille : M · Couleur : Bleu" }))
  assert.ok([200, 302].includes(add.status))
  const cart = await req("/amina-mode/cart")
  assert.match(cart.text, /Taille : M · Couleur : Bleu/, "le choix doit apparaître dans le panier")

  /* les ordres de grandeur : le stock reste celui du produit (pas de combinaisons) */
  const db2 = dbFile()
  const v = db2.prepare("SELECT COUNT(*) n FROM variants WHERE product_id = ?").get(p.id).n
  db2.close()
  assert.equal(v, 0, "aucune combinaison automatique n'est créée")
})

test("produit : les titres de variante sont nettoyés (doublons, vides, trop longs)", async () => {
  await login()
  const db0 = dbFile()
  const p = db0.prepare("SELECT * FROM products WHERE store_id = 1 ORDER BY id DESC LIMIT 1").get()
  db0.close()
  const dirty = JSON.stringify([
    { name: "  Taille ", options: ["S", "S", " M ", ""] },
    { name: "", options: ["X"] },
    { name: "Couleur", options: [] },
    { name: "Matière", options: ["Coton"] },
    { name: "En trop", options: ["A"] },
  ])
  await req(`/dashboard/products/${p.id}`, form({
    title: p.title, description: "", price: (p.price_cents / 100).toFixed(2), stock: "5",
    image: "", gallery: "[]", focal: "center", active: "on", option_groups: dirty,
  }))
  const db = dbFile()
  const saved = JSON.parse(db.prepare("SELECT option_groups FROM products WHERE id = ?").get(p.id).option_groups)
  db.close()
  assert.equal(saved.length, 3, "3 titres maximum, les vides sont ignorés")
  assert.equal(saved[0].name, "Taille")
  assert.deepEqual(saved[0].options, ["S", "M"], "les doublons et les vides sont retirés")
  assert.equal(saved[1].name, "Matière")
  assert.equal(saved[2].name, "En trop")
})
