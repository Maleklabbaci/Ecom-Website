/* CATÉGORIES, BOUTON « COMMANDER », ET VARIANTES DANS L'INVENTAIRE.

   Trois demandes du marchand, dans ses mots :
     · « ajouter le produit depuis la categorie dirctement et le contraire
       + photo de categorie »
     · « dans le formulaire le bouton commander a modifier, modifier kolch le
       fond le nom les fonts et tout le reste »
     · « +++ vairante dans l'Inventaire »

   On vérifie le chemin complet : l'écran, l'enregistrement, et ce que voit le
   client sur la boutique.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer } = require("./boot")
const { JSDOM, VirtualConsole } = require("jsdom")
const V = require("../src/variantes")

const DB = path.join(os.tmpdir(), `novadz-cats-${Date.now()}.db`)
let BASE = ""
let child = null
let SLUG = ""
const jar = new Map()
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")

async function req(p, opts = {}) {
  const res = await fetch(BASE + p, { ...opts, headers: { ...(opts.headers || {}), cookie: cookieHeader() }, redirect: "manual" })
  for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  const text = await res.text()
  return { status: res.status, text, json: () => JSON.parse(text) }
}
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() })

async function ouvrir(url, attendre) {
  const page = await req(url)
  assert.equal(page.status, 200, `${url} doit répondre`)
  const err = []
  const vc = new VirtualConsole()
  vc.on("jsdomError", (e) => { if (!/Could not parse CSS|Not implemented/.test(e.message)) err.push(e.message.slice(0, 140)) })
  const dom = new JSDOM(page.text, {
    runScripts: "dangerously", pretendToBeVisual: true, url: BASE + url, virtualConsole: vc,
    beforeParse(win) {
      win.fetch = (u, o) => fetch(BASE + String(u), { ...(o || {}), headers: { ...((o || {}).headers || {}), cookie: cookieHeader() } })
      win.matchMedia = win.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
      win.scrollTo = () => {}
      win.open = () => null
    },
  })
  await new Promise((r) => setTimeout(r, attendre || 700))
  return { doc: dom.window.document, win: dom.window, err, close: () => dom.window.close() }
}

const lire = () => {
  const { DatabaseSync } = require("node:sqlite")
  const d = new DatabaseSync(DB, { readOnly: true })
  return d
}

/* une image 1×1 valide : le serveur n'accepte que de vraies images */
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const GRILLE = {
  groups: [
    { id: "g1", name: "votre iphone", options: [{ id: "o1", label: "11" }, { id: "o2", label: "12" }] },
    { id: "g2", name: "couleur", options: [{ id: "o3", label: "noir" }, { id: "o4", label: "rose" }] },
  ],
  combos: [
    { picks: { g1: "o1", g2: "o3" }, stock: 2, price: "", unlimited: false, on: true },
    { picks: { g1: "o2", g2: "o4" }, stock: 1, price: "3200", unlimited: false, on: true },
  ],
  unlimited: false,
  style: "boutons",
}

before(async () => {
  const s = await startServer({ db: DB })
  child = s.child
  BASE = s.base
  const email = `cats-${Date.now()}@test.dz`
  const r = await req("/signup", form({ kind: "commerce", name: "Karim", store: "Chez Karim", email, password: "test1234", password2: "test1234" }))
  assert.ok(r.status === 302 || r.status === 200, "inscription OK")
  const d = lire()
  const st = d.prepare("SELECT id, slug FROM stores WHERE slug = 'chez-karim'").get()
  SLUG = st.slug
  d.close()
})

after(() => {
  if (child) child.kill()
  for (const ext of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(DB + ext) } catch (_) {}
  }
})

/* ---------------------------------------------------------------- CATÉGORIES */

test("une catégorie garde sa photo", async () => {
  const r = await req("/dashboard/categories", form({ name: "Coques", image: PNG1 }))
  assert.equal(r.status, 302)
  const d = lire()
  const c = d.prepare("SELECT * FROM categories WHERE slug = 'coques'").get()
  d.close()
  assert.ok(c, "la catégorie existe")
  assert.ok(c.image && c.image.startsWith("/uploads/"), `la photo est enregistrée (${c.image})`)

  const page = await req("/dashboard/categories")
  assert.match(page.text, /\/uploads\//, "l'écran Catégories montre la photo")
})

test("depuis la catégorie, on enchaîne sur la fiche produit : elle est déjà choisie", async () => {
  const r = await req("/dashboard/categories", form({ name: "Sacs", then: "product" }))
  assert.equal(r.status, 302)
  assert.match(r.text, /\/dashboard\/products\/new\?category=\d+/, "on atterrit sur « nouveau produit »")
  const id = Number((r.text.match(/category=(\d+)/) || [])[1])
  assert.ok(id > 0, "avec le numéro de la catégorie")

  const page = await ouvrir(`/dashboard/products/new?category=${id}`, 500)
  const sel = page.doc.querySelector('select[name="category_id"]')
  assert.ok(sel, "la fiche produit a une liste de catégories")
  assert.equal(sel.value, String(id), "la catégorie est présélectionnée")
  assert.ok(page.doc.querySelector('input[name="new_category"]'), "et on peut en écrire une nouvelle")
  page.close()
})

test("le contraire : le produit crée sa catégorie à la volée", async () => {
  const r = await req("/dashboard/products", form({
    title: "Robe d'été", price: "3500", stock: "4", active: "1",
    category_id: "0", new_category: "Robes d'été",
  }))
  assert.equal(r.status, 302)
  const d = lire()
  const cat = d.prepare("SELECT id FROM categories WHERE slug = ?").get("robes-d-ete")
  assert.ok(cat, "la catégorie a été créée")
  const p = d.prepare("SELECT category_id FROM products WHERE title = ?").get("Robe d'été")
  d.close()
  assert.equal(p.category_id, cat.id, "le produit est rangé dedans")
})

test("le bloc « rayons » de la boutique montre la photo de la catégorie", async () => {
  const SECTIONS = require("../src/sections")
  const d = lire()
  const st = d.prepare("SELECT * FROM stores WHERE slug = ?").get(SLUG)
  const c = d.prepare("SELECT * FROM categories WHERE slug = 'coques'").get()
  d.close()
  assert.ok(c.image, "la catégorie a une image")
  const sec = SECTIONS.makeSection("cats", { style: "tiles", count: 4, heading: "" })
  const html = SECTIONS.renderSectionsRaw(st, [sec], { cats: [c] })
  assert.ok(html.includes(c.image), "le rayon affiche la photo")
  assert.match(html, /tpx-cat-img/, "dans son cadre prévu")
  assert.ok(html.includes(c.name), "avec le nom du rayon")

  /* une catégorie sans photo ne change pas d'un pouce */
  const sans = SECTIONS.renderSectionsRaw(st, [SECTIONS.makeSection("cats", { style: "tiles", count: 4, heading: "" })],
    { cats: [{ ...c, image: "" }] })
  assert.ok(!sans.includes("tpx-cat-img"), "sans photo, pas de cadre vide")
})

/* ------------------------------------------------------- BOUTON « COMMANDER » */

test("le bouton « Commander » se règle : le nom, le fond, la police", async () => {
  const r = await req("/dashboard/formulaire", form({
    form_model: "classique",
    form_color: "#111111",
    btn_text: "Je le veux",
    btn_bg: "#e11d48",
    btn_ink: "#ffffff",
    btn_font: "gf-cairo",
    btn_size: "moyen",
    btn_radius: "30",
    btn_full: "1",
    btn_bold: "1",
    btn_upper: "1",
    btn_shadow: "1",
  }))
  assert.equal(r.status, 302)
  const d = lire()
  const st = d.prepare("SELECT form_look FROM stores WHERE slug = ?").get(SLUG)
  d.close()
  const look = JSON.parse(st.form_look)
  assert.equal(look.btn.text, "Je le veux", "le nom est enregistré")
  assert.equal(look.btn.bg, "#e11d48", "le fond aussi")
  assert.equal(look.btn.font, "gf-cairo", "et la police")

  const d2 = lire()
  const pid = d2.prepare("SELECT id FROM products WHERE title = ?").get("Robe d'été").id
  d2.close()
  const page = await req(`/${SLUG}/p/${pid}`)
  assert.equal(page.status, 200)
  assert.match(page.text, /Je le veux/, "le client voit le mot choisi")
  assert.match(page.text, /background:#e11d48/, "avec le fond choisi")
  assert.match(page.text, /Cairo/, "et la police demandée est chargée")
})

test("vider le champ rend la main au thème de la boutique", async () => {
  await req("/dashboard/formulaire", form({
    form_model: "classique", form_color: "#111111",
    btn_text: "", btn_reset: "1", btn_size: "grand",
  }))
  const d = lire()
  const st = d.prepare("SELECT form_look FROM stores WHERE slug = ?").get(SLUG)
  d.close()
  const look = JSON.parse(st.form_look)
  assert.equal(look.btn.bg, "", "plus de fond imposé")
  assert.equal(look.btn.text, "", "plus de nom imposé")
  const d2 = lire()
  const pid = d2.prepare("SELECT id FROM products WHERE title = ?").get("Robe d'été").id
  d2.close()
  const page = await req(`/${SLUG}/p/${pid}`)
  assert.match(page.text, /Commander/, "le bouton revient à « Commander »")
  assert.ok(!page.text.includes("background:#e11d48"), "et l'ancien fond est parti")
})

/* ----------------------------------------------- VARIANTES DANS L'INVENTAIRE */

test("l'inventaire montre une ligne par combinaison", async () => {
  const r = await req("/dashboard/products", form({ title: "Coque iphone", price: "1500", stock: "0", active: "1" }))
  assert.equal(r.status, 302)
  const d = lire()
  const st = d.prepare("SELECT id FROM stores WHERE slug = ?").get(SLUG)
  const p = d.prepare("SELECT id FROM products WHERE title = 'Coque iphone' AND store_id = ?").get(st.id)
  d.close()
  await req(`/dashboard/products/${p.id}`, form({
    title: "Coque iphone", price: "1500", stock: "0", active: "1",
    option_groups: JSON.stringify(GRILLE), gallery: "[]", variants: "[]",
  }))

  const page = await ouvrir("/dashboard/stock", 400)
  const text = page.doc.body.textContent.replace(/\s+/g, " ")
  page.close()
  assert.match(text, /votre iphone : 11 · couleur : noir/, "la première combinaison est listée")
  assert.match(text, /votre iphone : 12 · couleur : rose/, "la deuxième aussi")
  const forms = (text.match(/Coque iphone/g) || []).length
  assert.ok(forms >= 1, "le produit apparaît dans l'inventaire")
})

test("depuis l'inventaire, on remet du stock dans la bonne case", async () => {
  const d0 = lire()
  const st = d0.prepare("SELECT id FROM stores WHERE slug = ?").get(SLUG)
  const p = d0.prepare("SELECT id, option_groups FROM products WHERE title = 'Coque iphone' AND store_id = ?").get(st.id)
  d0.close()
  const grille = V.lire(p.option_groups)
  const cle11 = V.cle({ g1: "o1", g2: "o3" })
  const cle12 = V.cle({ g1: "o2", g2: "o4" })
  assert.ok(V.parCle(grille, cle11), "la case existe avant l'ajustement")

  const r = await req("/dashboard/stock/adjust", form({
    product_id: String(p.id), variant_id: "0", combo: cle11, act: "set", value: "9", reason: "reassort",
  }))
  assert.equal(r.status, 302, "l'ajustement passe")
  assert.ok(!/error=/.test(r.text), `sans message d'erreur (${String(r.text).slice(0, 90)})`)

  const d = lire()
  const apres = d.prepare("SELECT option_groups FROM products WHERE id = ?").get(p.id)
  d.close()
  const g = V.lire(apres.option_groups)
  assert.equal(V.parCle(g, cle11).stock, 9, "la case « 11 · noir » est à 9")
  assert.equal(V.parCle(g, cle12).stock, 1, "la case « 12 · rose » n'a pas bougé")
})

test("une combinaison inconnue est refusée, sans casser la grille", async () => {
  const d0 = lire()
  const st = d0.prepare("SELECT id FROM stores WHERE slug = ?").get(SLUG)
  const p = d0.prepare("SELECT id FROM products WHERE title = 'Coque iphone' AND store_id = ?").get(st.id)
  d0.close()
  const r = await req("/dashboard/stock/adjust", form({
    product_id: String(p.id), variant_id: "0", combo: "g1:inconnu|g2:inconnu", act: "set", value: "5",
  }))
  assert.equal(r.status, 302)
  assert.match(r.text, /error=/, "une combinaison qui n'existe pas est signalée")
})
