/* Tests : photos, commune, position GPS, délai de livraison, bilingue FR/AR.
   Démarre un serveur isolé (port libre, base temporaire) pour ne rien casser. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")
let PORT = 0
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-bilingue-${Date.now()}.db`)
let server
const jar = new Map()

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
async function req(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, {
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

const login = () => req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
const addToCart = (pid = 1) => req("/amina-mode/cart", form({ product_id: pid }))

/* ------------------------------ communes ------------------------------ */
test("communes : la liste d'une wilaya est servie en JSON", async () => {
  const r = await req("/amina-mode/communes?w=Blida")
  assert.equal(r.status, 200)
  const d = JSON.parse(r.text)
  assert.ok(Array.isArray(d.communes) && d.communes.length > 10)
  assert.ok(d.communes.some((c) => c.fr === "Boufarik"))
  assert.ok(d.communes.every((c) => typeof c.ar === "string" && c.ar.length > 1))
})

test("communes : wilaya inconnue → réponse par défaut, pas d'erreur", async () => {
  const r = await req("/amina-mode/communes?w=Atlantide")
  assert.equal(r.status, 200)
  assert.ok(JSON.parse(r.text).communes.length > 0)
})

test("communes : 58 wilayas couvertes", async () => {
  const { WILAYAS } = require("../src/geo")
  assert.equal(WILAYAS.length, 58)
  const total = WILAYAS.reduce((n, w) => n + require("../src/geo").communesOf(w).length, 0)
  assert.ok(total > 1500, "au moins 1 500 communes, trouvé " + total)
})

/* --------------------------- tunnel de commande --------------------------- */
test("checkout : commune, position GPS et délai annoncé sont présents", async () => {
  await addToCart()
  const r = await req("/amina-mode/checkout")
  assert.equal(r.status, 200)
  assert.match(r.text, /name="commune"/)
  assert.match(r.text, /data-commune-list/)
  assert.match(r.text, /data-geo/)
  assert.match(r.text, /data-eta-min="\d+"/)
})

test("checkout : la wilaya de la boutique est sélectionnée par défaut", async () => {
  await addToCart()
  const r = await req("/amina-mode/checkout")
  assert.match(r.text, /<option value="Alger"[^>]*selected/s)
})

test("commande : la commune est enregistrée et normalisée", async () => {
  await addToCart()
  const r = await req("/amina-mode/checkout", form({
    customer_name: "Test Commune", phone: "0555112233", address: "Cité 200 logements",
    commune: "boufarik", wilaya: "Blida", delivery: "desk", payment: "cod",
    geo_lat: "36.5321", geo_lng: "3.0892", geo_acc: "12",
  }))
  assert.equal(r.status, 200)
  const db = require("../src/sqlite").open(DB)
  const o = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").get()
  assert.equal(o.commune, "Boufarik", "saisie libre normalisée sur la liste officielle")
  assert.equal(o.wilaya, "Blida")
  assert.equal(o.delivery_type, "desk")
  assert.ok(o.geo_lat > 36 && o.geo_lng > 3)
  db.close()
})

test("commande : position GPS seule acceptée (cité sans nom de rue)", async () => {
  await addToCart()
  const r = await req("/amina-mode/checkout", form({
    customer_name: "Test GPS", phone: "0555998877", address: "", wilaya: "Alger",
    delivery: "home", payment: "cod", geo_lat: "36.7538", geo_lng: "3.0588",
  }))
  assert.equal(r.status, 200)
  const db = require("../src/sqlite").open(DB)
  const o = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").get()
  assert.match(o.address, /Position GPS/)
  db.close()
})

test("commande : sans adresse ni position → refus propre", async () => {
  await addToCart()
  const r = await req("/amina-mode/checkout", form({
    customer_name: "Test Vide", phone: "0555000000", address: "", wilaya: "Alger",
    delivery: "home", payment: "cod",
  }))
  assert.equal(r.status, 400)
})

/* ------------------------------ délais ------------------------------ */
test("livraison : un tarif négatif est refusé sans rien casser", async () => {
  await login()
  const before = await req("/dashboard/shipping")
  assert.equal(before.status, 200)
  const bad = await req("/dashboard/shipping", form({ all: "-500", applyAll: "1" }))
  assert.match(bad.location, /ok=0/)
  const page = await req(bad.location)
  assert.match(page.text, /négatif|Rien n'a été enregistré/i)
})

test("livraison : le délai par wilaya remonte jusqu'au checkout", async () => {
  await login()
  await req("/dashboard/shipping", form({
    ship_home: "1", ship_desk: "1", all: "500", all_desk: "400", applyAll: "1", eta_min: "2", eta_max: "4",
    w_Tlemcen: "800", d_Tlemcen: "600", e_min_Tlemcen: "5", e_max_Tlemcen: "7",
  }))
  await addToCart()
  const r = await req("/amina-mode/checkout")
  assert.match(r.text, /<option value="Tlemcen"[^>]*data-eta-min="5"[^>]*data-eta-max="7"/s)
})

/* ------------------------------ bilingue ------------------------------ */
test("arabe : la vitrine passe en RTL avec la police Estedad", async () => {
  const r = await req("/amina-mode?lang=ar")
  assert.equal(r.status, 200)
  assert.match(r.text, /<html[^>]*lang="ar" dir="rtl"/)
  assert.match(r.text, /\/estedad\.css/)
  assert.match(r.text, /أضف إلى السلة/)
})

test("arabe : le choix de langue est mémorisé (cookie)", async () => {
  await req("/amina-mode?lang=ar")
  const r = await req("/amina-mode")
  assert.match(r.text, /dir="rtl"/)
  const back = await req("/amina-mode?lang=fr")
  assert.match(back.text, /<html[^>]*lang="fr" dir="ltr"/)
})

test("arabe : le formulaire de commande est traduit", async () => {
  await addToCart()
  const r = await req("/amina-mode/checkout?lang=ar")
  assert.match(r.text, /الاسم الكامل/)
  assert.match(r.text, /البلدية/)
  assert.match(r.text, /الولاية/)
})

test("arabe : le tableau de bord reste en français", async () => {
  await login()
  const r = await req("/dashboard")
  assert.match(r.text, /<html lang="fr">/)
})

test("langue : mode « arabe seulement » force l'arabe", async () => {
  await login()
  await req("/dashboard/settings", form({
    name: "Amina Mode", slug: "amina-mode", lang_mode: "ar", return_days: "7", theme: "minimal",
  }))
  jar.delete("ndz_lang")
  const r = await req("/amina-mode")
  assert.match(r.text, /dir="rtl"/)
  /* on remet le mode bilingue pour les autres tests */
  await login()
  await req("/dashboard/settings", form({
    name: "Amina Mode", slug: "amina-mode", lang_mode: "both", return_days: "7", theme: "minimal",
  }))
})

/* ------------------------------ photos ------------------------------ */
test("photos : une image de 400 Ko passe (avant : erreur 500)", async () => {
  await login()
  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400000, 1)])
  const r = await req("/dashboard/upload", json({ dataUrl: "data:image/png;base64," + big.toString("base64") }))
  assert.equal(r.status, 200)
  assert.match(JSON.parse(r.text).url, /^\/uploads\/[a-f0-9]+\.png$/)
})

test("photos : un faux fichier (pas une image) est refusé", async () => {
  await login()
  const fake = Buffer.from("<?php echo 1; ?>".repeat(10))
  const r = await req("/dashboard/upload", json({ dataUrl: "data:image/png;base64," + fake.toString("base64") }))
  assert.equal(r.status, 400)
  assert.match(JSON.parse(r.text).error, /pas une image valide/)
})

test("photos : au-delà de la limite, message clair (413) et pas un plantage", async () => {
  await login()
  const huge = Buffer.alloc(9 * 1024 * 1024, 2)
  const r = await req("/dashboard/upload", json({ dataUrl: "data:image/png;base64," + huge.toString("base64") }))
  assert.equal(r.status, 413)
  assert.match(JSON.parse(r.text).error, /trop lourde/i)
})
