/* Tests de fumée NovaDZ — `npm test`
   Démarre le serveur sur une base temporaire, puis vérifie le parcours réel :
   connexion marchand, catalogue, panier, commande, avis, facture, SEO, admin. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")
let PORT = 0
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-test-${Date.now()}.db`)
let server

const jar = new Map()
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
async function req(pathname, opts = {}) {
  const headers = { ...(opts.headers || {}), cookie: cookieHeader() }
  const res = await fetch(BASE + pathname, { ...opts, headers, redirect: "manual" })
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  for (const c of set) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  const text = await res.text()
  return { status: res.status, text, location: res.headers.get("location") || "" }
}
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})
const json = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
})

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

test("page d'accueil publique", async () => {
  const r = await req("/")
  assert.equal(r.status, 200)
  assert.match(r.text, /NovaDZ/)
})

test("connexion marchand", async () => {
  const bad = await req("/login", form({ email: "demo@novadz.dz", password: "faux" }))
  assert.equal(bad.status, 401)
  const ok = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.equal(ok.status, 302)
  assert.match(ok.location, /dashboard/)
})

test("tableau de bord et pages marchand", async () => {
  for (const p of ["/dashboard", "/dashboard/products", "/dashboard/orders", "/dashboard/categories",
    "/dashboard/shipping", "/dashboard/reviews", "/dashboard/customers", "/dashboard/design", "/dashboard/settings"]) {
    const r = await req(p)
    assert.equal(r.status, 200, `GET ${p}`)
  }
})

test("vitrine : recherche, filtres, SEO", async () => {
  const home = await req("/amina-mode")
  assert.equal(home.status, 200)
  assert.match(home.text, /og:title/)
  const filtered = await req("/amina-mode?q=robe&sort=prix-asc")
  assert.equal(filtered.status, 200)
  const sm = await req("/amina-mode/sitemap.xml")
  assert.match(sm.text, /<urlset/)
  const rb = await req("/amina-mode/robots.txt")
  assert.match(rb.text, /Sitemap:/)
})

test("fiche produit : galerie, variante, données structurées", async () => {
  const list = await req("/dashboard/products")
  const id = (list.text.match(/href="\/dashboard\/products\/(\d+)"/) || [])[1]
  assert.ok(id, "un produit existe")
  const p = await req(`/amina-mode/p/${id}`)
  assert.equal(p.status, 200)
  assert.match(p.text, /application\/ld\+json/)
})

test("panier puis commande complète", async () => {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  const add = await req("/amina-mode/cart", form({ product_id: pid }))
  assert.equal(add.status, 302)
  const cart = await req("/amina-mode/cart")
  assert.match(cart.text, /Panier/)
  const order = await req("/amina-mode/checkout", form({
    customer_name: "Test Client", phone: "0550000000", wilaya: "Blida", address: "Rue 1", note: "",
  }))
  assert.equal(order.status, 200)
  const ref = (order.text.match(/NDZ-[A-Z0-9]{6}/) || [])[0]
  assert.ok(ref, "référence de commande générée")
  const track = await req(`/amina-mode/order/${ref}`)
  assert.equal(track.status, 200)
  const invoice = await req(`/amina-mode/order/${ref}/invoice`)
  assert.match(invoice.text, /Facture/)
  const bl = await req(`/amina-mode/order/${ref}/invoice?type=bl`)
  assert.match(bl.text, /Bon de livraison/)
})

test("avis client + modération", async () => {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  const post = await req(`/amina-mode/p/${pid}/review`, form({ name: "Nadia", rating: "5", body: "Parfait" }))
  assert.equal(post.status, 302)
  const page = await req(`/amina-mode/p/${pid}?avis=ok`)
  assert.match(page.text, /Merci/)
})

test("compte client : inscription et historique", async () => {
  const reg = await req("/amina-mode/account/register", form({
    email: "client@test.dz", password: "secret123", name: "Test Client", phone: "0550000000",
  }))
  assert.equal(reg.status, 302)
  const acc = await req("/amina-mode/account")
  assert.match(acc.text, /Mes commandes|Aucune commande/)
})

test("brouillon de design puis publication", async () => {
  const save = await req("/dashboard/design/save", json({
    design: { font: "serif", accent: "#1D4ED8" },
    sections: [{ id: "s1", type: "text", settings: { heading: "Test", body: "Brouillon" } }],
  }))
  assert.match(save.text, /"ok":true/)
  const preview = await req("/amina-mode?preview=1")
  assert.match(preview.text, /Brouillon/)
  const pub = await req("/dashboard/design/publish", { method: "POST" })
  assert.match(pub.text, /"published":true/)
  const live = await req("/amina-mode")
  assert.match(live.text, /Georgia/)
})

test("stock : page inventaire, seuil et export CSV", async () => {
  const r = await req("/dashboard/stock")
  assert.equal(r.status, 200)
  assert.match(r.text, /Mouvements récents/)
  assert.match(r.text, /Seuil d'alerte/)
  const csv = await req("/dashboard/stock/export.csv")
  assert.equal(csv.status, 200)
  assert.match(csv.text, /produit.*sku.*variante.*stock/)
})

test("stock : ajustement journalisé et rupture bloquée", async () => {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  const up = await req("/dashboard/stock/adjust", form({
    product_id: pid, variant_id: "0", value: "7", mode: "set", reason: "reassort",
  }))
  assert.equal(up.status, 302)
  const page = await req("/dashboard/stock")
  assert.match(page.text, /Réassort/)

  /* stock à zéro : la fiche produit passe en rupture */
  await req("/dashboard/stock/adjust", form({ product_id: pid, variant_id: "0", value: "0", mode: "set", reason: "inventaire" }))
  const fiche = await req(`/amina-mode/p/${pid}`)
  assert.match(fiche.text, /Rupture/)

  /* remettre en stock pour ne pas casser les autres tests */
  await req("/dashboard/stock/adjust", form({ product_id: pid, variant_id: "0", value: "20", mode: "set", reason: "reassort" }))
})

test("landing : création, rendu et commande avec offres de quantité", async () => {
  const list = await req("/dashboard/landings")
  assert.equal(list.status, 200)
  assert.match(list.text, /Pages de vente/)

  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]
  const create = await req("/dashboard/landings", form({
    product_id: pid, slug: "offre-test", title: "Offre de test", compare: "2900",
    qty1: "1", price1: "2300", qty2: "2", price2: "4200", label2: "Économisez 300",
    qty3: "3", price3: "6000", label3: "Livraison offerte",
    countdown_min: "15", free_ship_qty: "3", benefits: "Coton\nLivraison 48 h", active: "1",
  }))
  assert.equal(create.status, 302)

  const page = await req("/amina-mode/l/offre-test")
  assert.equal(page.status, 200)
  assert.match(page.text, /Commandez maintenant/)
  assert.match(page.text, /Livraison offerte/)
  assert.match(page.text, /ndzGeoLat/)

  /* 3 pièces : livraison offerte */
  const order = await req("/amina-mode/l/offre-test", form({
    qty: "3", customer_name: "Client Landing", phone: "0770111222",
    wilaya: "Blida", address: "Cité 200 logements, bâtiment B, numéro 12",
  }))
  assert.equal(order.status, 302)
  assert.match(order.location, /NDZ-/)
  const ref = order.location.match(/NDZ-[A-Z0-9]{6}/)[0]
  const track = await req(`/amina-mode/order/${ref}`)
  assert.equal(track.status, 200)
})

test("anti-fraude : CAPTCHA exigé, téléphone strict, doublon détecté", async () => {
  const pid = (await req("/dashboard/products")).text.match(/href="\/dashboard\/products\/(\d+)"/)[1]

  /* CAPTCHA activé avec des clés de test : sans jeton, la commande est refusée */
  await req("/dashboard/marketing/security", form({
    captcha_enabled: "1", captcha_version: "v2", captcha_site: "6LcTEST", captcha_secret: "6LcSECRET",
    captcha_min_score: "0.5", phone_strict: "1",
  }))
  await req("/amina-mode/cart", form({ product_id: pid }))
  const page = await req("/amina-mode/checkout")
  assert.match(page.text, /g-recaptcha/)
  const refused = await req("/amina-mode/checkout", form({
    customer_name: "Robot", phone: "0555000111", wilaya: "Blida", address: "Rue 1",
  }))
  assert.equal(refused.status, 400)

  /* CAPTCHA désactivé + téléphone strict : un numéro invalide est refusé */
  await req("/dashboard/marketing/security", form({
    captcha_enabled: "0", captcha_version: "v3", captcha_site: "", captcha_secret: "",
    captcha_min_score: "0.5", phone_strict: "1",
  }))
  const badPhone = await req("/amina-mode/checkout", form({
    customer_name: "Test", phone: "123", wilaya: "Blida", address: "Rue 1",
  }))
  assert.equal(badPhone.status, 400)
  assert.match(badPhone.text, /invalide/)

  /* numéro valide : la commande passe et la position est enregistrée */
  const ok = await req("/amina-mode/checkout", form({
    customer_name: "Client Valide", phone: "0770999111", wilaya: "Blida",
    address: "Rue des palmiers 12, Blida", geo_lat: "36.47", geo_lng: "2.83", geo_acc: "20",
  }))
  assert.equal(ok.status, 200)

  /* même numéro une seconde fois : marquée « à vérifier » */
  await req("/amina-mode/cart", form({ product_id: pid }))
  await req("/amina-mode/checkout", form({
    customer_name: "Client Valide", phone: "0770999111", wilaya: "Blida",
    address: "Rue des palmiers 12, Blida",
  }))
  const marketing = await req("/dashboard/marketing")
  assert.equal(marketing.status, 200)
  assert.match(marketing.text, /doublon_telephone/)
})

test("pixels serveur : configuration et journal des envois", async () => {
  const save = await req("/dashboard/marketing/pixels", form({
    pixels_server: "1", pixel_meta: "123456789012345", meta_token: "FAKE",
    pixel_tiktok: "", tiktok_token: "", snap_pixel: "", snap_token: "", pixel_test_code: "",
  }))
  assert.equal(save.status, 302)
  const page = await req("/dashboard/marketing")
  assert.equal(page.status, 200)
  assert.match(page.text, /Pixels serveur/)
  assert.match(page.text, /Journal des événements/)

  /* désactivé ensuite pour ne pas appeler Meta depuis les autres tests */
  await req("/dashboard/marketing/pixels", form({ pixels_server: "0", pixel_meta: "", meta_token: "" }))
})

test("admin : santé et journaux", async () => {
  jar.clear()
  const login = await req("/login", form({ email: "admin@novadz.dz", password: "admin1234" }))
  assert.equal(login.status, 302)
  const health = await req("/admin/health")
  assert.equal(health.status, 200)
  const logs = await req("/admin/logs")
  assert.equal(logs.status, 200)
})
