/* LES VARIANTES LIÉES.

   Le marchand l'a demandé avec son exemple :
     titre « votre iphone » → 11, 12
     titre « couleur »      → noir, rose
     linker et stock : iphone 11 en noir = 2 pièces, iphone 12 en rose = 1.

   Ce fichier vérifie toute la chaîne : la grille, l'enregistrement, le rendu
   sur la page produit (huit styles, hors formulaire), et surtout que le stock
   de CHAQUE combinaison est respecté à la commande.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer } = require("./boot")
const { JSDOM, VirtualConsole } = require("jsdom")
const V = require("../src/variantes")

const DB = path.join(os.tmpdir(), `novadz-variantes-${Date.now()}.db`)
let BASE = ""
let child = null
let SLUG = ""
let PRODUIT = null
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
  await new Promise((r) => setTimeout(r, attendre || 900))
  return { doc: dom.window.document, win: dom.window, err, close: () => dom.window.close() }
}

/* l'exemple du marchand */
const EXEMPLE = {
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
  const started = await startServer({ db: DB })
  BASE = started.base
  child = started.child
  jar.clear()
  await req("/signup", form({
    kind: "commerce", name: "Karim", store: "Chez Karim",
    email: `${Date.now()}${Math.random().toString(36).slice(2, 6)}@variantes.test.dz`,
    password: "test1234", password2: "test1234",
  }))
  SLUG = "chez-karim"
  await req("/dashboard/products", form({ title: "Coque iphone", price: "1500", stock: "0", active: "1" }))
  const { DatabaseSync } = require("node:sqlite")
  const db = new DatabaseSync(DB, { readOnly: true })
  const sid = db.prepare("SELECT id FROM stores WHERE slug = ?").get(SLUG).id
  PRODUIT = db.prepare("SELECT id FROM products WHERE store_id = ?").get(sid)
  db.close()
})
after(() => {
  if (child) child.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

/* ------------------------------------------------------------------ 1 */
test("la grille croise les titres : 4 cases pour 2 × 2 options", () => {
  const d = V.lire(JSON.stringify(EXEMPLE))
  assert.equal(d.groups.length, 2, "deux titres")
  assert.equal(d.combos.length, 4, "2 × 2 = 4 cases")
  const noms = d.combos.map((c) => V.etiquette(d, c.picks))
  assert.ok(noms.includes("votre iphone : 11 · couleur : noir"))
  assert.ok(noms.includes("votre iphone : 12 · couleur : rose"))
})

test("chaque case garde SON stock (11 en noir = 2, 12 en rose = 1)", () => {
  const d = V.lire(JSON.stringify(EXEMPLE))
  const noir11 = V.combinaison(d, { g1: "o1", g2: "o3" })
  const rose12 = V.combinaison(d, { g1: "o2", g2: "o4" })
  const rose11 = V.combinaison(d, { g1: "o1", g2: "o4" })
  assert.equal(noir11.stock, 2, "iphone 11 en noir : 2 pièces")
  assert.equal(rose12.stock, 1, "iphone 12 en rose : 1 pièce")
  assert.ok(V.disponible(d, { g1: "o1", g2: "o3" }, 1, 0).ok, "11/noir est disponible")
  assert.ok(V.disponible(d, { g1: "o2", g2: "o4" }, 1, 0).ok, "12/rose est disponible")
  assert.equal(V.disponible(d, { g1: "o1", g2: "o4" }, 1, 0).ok, false, "11/rose est à zéro : indisponible")
  assert.equal(rose11.stock, 0)
})

test("« recevoir les commandes même en rupture » : la case redevient commandable", () => {
  const d = V.lire(JSON.stringify(EXEMPLE))
  const picks = { g1: "o1", g2: "o4" } /* 0 pièce */
  assert.equal(V.disponible(d, picks, 1, 0).ok, false, "sans la case : refusé")
  V.combinaison(d, picks).unlimited = true
  assert.equal(V.disponible(d, picks, 1, 0).ok, true, "avec « illimité » sur la case : accepté")
  V.combinaison(d, picks).unlimited = false
  d.unlimited = true
  assert.equal(V.disponible(d, picks, 1, 0).ok, true, "avec « illimité » sur le produit : accepté")
})

test("une vente retire les pièces de la bonne case", () => {
  const d = V.lire(JSON.stringify(EXEMPLE))
  const picks = { g1: "o1", g2: "o3" }
  assert.equal(V.combinaison(d, picks).stock, 2)
  V.retirer(d, picks, 1)
  assert.equal(V.combinaison(d, picks).stock, 1, "il en reste 1")
  V.retirer(d, picks, 1)
  assert.equal(V.combinaison(d, picks).stock, 0)
  assert.equal(V.disponible(d, picks, 1, 0).ok, false, "épuisé")
  /* et les autres cases n'ont pas bougé */
  assert.equal(V.combinaison(d, { g1: "o2", g2: "o4" }).stock, 1, "12/rose n'a pas été touché")
})

test("l'ancienne écriture (une simple liste) est encore comprise", () => {
  const d = V.lire(JSON.stringify([{ name: "Taille", options: ["M", "L"] }]))
  assert.equal(d.groups.length, 1)
  assert.equal(d.combos.length, 2, "la grille se construit toute seule")
})

/* ------------------------------------------------------------------ 2 */
test("le marchand enregistre sa grille depuis la fiche produit", async () => {
  const r = await req(`/dashboard/products/${PRODUIT.id}`, form({
    title: "Coque iphone", price: "1500", stock: "0", active: "1",
    option_groups: JSON.stringify(EXEMPLE),
    gallery: "[]", variants: "[]",
  }))
  assert.ok([200, 302].includes(r.status), `l'enregistrement doit passer (${r.status})`)
  const { DatabaseSync } = require("node:sqlite")
  const db = new DatabaseSync(DB, { readOnly: true })
  const brut = db.prepare("SELECT option_groups FROM products WHERE id = ?").get(PRODUIT.id).option_groups
  db.close()
  const relu = V.lire(brut)
  assert.equal(relu.combos.length, 4, "les 4 cases sont en base")
  assert.equal(V.combinaison(relu, { g1: "o1", g2: "o3" }).stock, 2, "le stock de 11/noir a survécu à l'enregistrement")
  assert.equal(V.combinaison(relu, { g1: "o2", g2: "o4" }).stock, 1, "et celui de 12/rose")
})

test("la page produit montre le sélecteur HORS du formulaire", async () => {
  const p = await ouvrir(`/${SLUG}/p/${PRODUIT.id}`)
  try {
    const pick = p.doc.querySelector(".opt-pick")
    assert.ok(pick, "le sélecteur de variantes est affiché")
    assert.equal(pick.closest("form"), null, "il doit être HORS du formulaire")
    assert.equal(p.doc.querySelectorAll(".opt-grp").length, 2, "un bloc par titre (« votre iphone », « couleur »)")
    const form = p.doc.querySelector("form.varform")
    assert.ok(form, "le formulaire d'achat existe")
    assert.ok(form.querySelector('input[name="combo"]'), "le formulaire reçoit la combinaison choisie")
    assert.ok(form.querySelector('input[name="opts"]'), "et son libellé lisible")
  } finally { p.close() }
})

test("les 8 styles d'affichage sont disponibles", async () => {
  for (const style of V.STYLES) {
    await req(`/dashboard/products/${PRODUIT.id}`, form({
      title: "Coque iphone", price: "1500", stock: "0", active: "1",
      option_groups: JSON.stringify(Object.assign({}, EXEMPLE, { style })),
      gallery: "[]", variants: "[]",
    }))
    const p = await ouvrir(`/${SLUG}/p/${PRODUIT.id}`, 500)
    try {
      const pick = p.doc.querySelector(".opt-pick")
      assert.ok(pick, `style ${style} : le sélecteur existe`)
      assert.ok(pick.className.includes("vp-" + style), `style ${style} : la classe vp-${style} est posée (lu : ${pick.className})`)
    } finally { p.close() }
  }
  assert.ok(V.STYLES.length >= 5, "au moins cinq styles, comme demandé")
})

test("une combinaison épuisée est refusée à la commande, une bonne passe", async () => {
  await req(`/dashboard/products/${PRODUIT.id}`, form({
    title: "Coque iphone", price: "1500", stock: "0", active: "1",
    option_groups: JSON.stringify(EXEMPLE), gallery: "[]", variants: "[]",
  }))
  const corps = (opts) => form({
    buy_id: String(PRODUIT.id), buy_qty: "1", opts, combo: "",
    customer_name: "Amine B", phone: "0555123456", wilaya: "Alger",
    commune: "Bab Ezzouar", address: "Rue 12", note: "",
  })
  /* 11 en rose : 0 pièce → refusé */
  const mauvais = await req(`/${SLUG}/checkout`, corps("votre iphone : 11 · couleur : rose"))
  assert.equal(mauvais.status, 400, "une variante épuisée ne passe pas")
  assert.match(mauvais.text, /plus en stock|Réduis la quantité/, "le client comprend pourquoi")

  /* 11 en noir : 2 pièces → accepté */
  const bon = await req(`/${SLUG}/checkout`, corps("votre iphone : 11 · couleur : noir"))
  assert.notEqual(bon.status, 400, "une variante en stock doit passer")
  assert.match(bon.text, /NDZ-/, "la commande est enregistrée avec sa référence")

  /* et le stock de la case a baissé */
  const { DatabaseSync } = require("node:sqlite")
  const db = new DatabaseSync(DB, { readOnly: true })
  const relu = V.lire(db.prepare("SELECT option_groups FROM products WHERE id = ?").get(PRODUIT.id).option_groups)
  const nb = db.prepare("SELECT COUNT(*) n FROM orders").get().n
  db.close()
  assert.equal(nb, 1, "une seule commande enregistrée")
  assert.equal(V.combinaison(relu, { g1: "o1", g2: "o3" }).stock, 1, "11/noir est passé de 2 à 1 pièce")
  assert.equal(V.combinaison(relu, { g1: "o2", g2: "o4" }).stock, 1, "12/rose n'a pas bougé")
})
