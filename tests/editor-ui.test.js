/* L'interface de l'éditeur, exécutée sans navigateur.
   Un DOM minimal suffit pour vérifier que chaque onglet se construit sans
   erreur (c'est le genre de bug qui laisse le rail blanc). */
const { test } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const CODE = fs.readFileSync(path.join(__dirname, "..", "public", "editor.js"), "utf8")
const SECTIONS = require("../src/sections")
const ALL_TYPES = Object.entries(SECTIONS.TYPES).map(([id, t]) => ({ id, name: t.name, desc: t.desc, defaults: t.defaults }))

function makeEl(id) {
  const el = {
    id,
    innerHTML: "",
    textContent: "",
    value: "",
    src: "",
    type: "text",
    checked: false,
    style: {},
    hidden: false,
    files: null,
    _h: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c) },
      remove(c) { this._s.delete(c) },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : on ? this._s.add(c) : this._s.delete(c) },
      contains(c) { return this._s.has(c) },
    },
    addEventListener(t, fn) { (el._h[t] = el._h[t] || []).push(fn) },
    removeEventListener() {},
    getAttribute() { return null },
    setAttribute() {},
    querySelector() { return null },
    querySelectorAll() { return [] },
    closest() { return null },
    scrollIntoView() {},
    appendChild() {},
    focus() {},
  }
  return el
}

function boot(designOverride) {
  const els = {}
  const get = (id) => (els[id] = els[id] || makeEl(id))
  const document = {
    getElementById: get,
    createElement: () => makeEl("new"),
    querySelector(sel) { return sel === ".ed-app" ? get("edApp") : null },
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: makeEl("html"),
    body: makeEl("body"),
  }
  const ED_DATA = {
    slug: "demo-shop",
    sections: [{ id: "s1", type: "hero", settings: {} }],
    types: ALL_TYPES,
    fields: {},
    blocks: {},
    products: [{ id: 1, title: "Produit" }],
    pages: [],
    fonts: [["inter", "Inter"]],
    design: Object.assign({ bg: "#FFFFFF", ink: "#111111", accent: "#111111", logoSize: 28, textScale: 1, radiusPx: 12, containerWidth: 1240, headStyle: "plein", cartMode: "deux" }, designOverride || {}),
    nav: [{ id: "n1", label: "Boutique", url: "" }],
  }
  const window = {
    ED_DATA,
    addEventListener() {},
    postMessage() {},
    location: { reload() {} },
    confirm: () => false,
    alert() {},
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: true }) }),
    FileReader: function () {},
    localStorage: { getItem() { return null }, setItem() {} },
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} } },
  }
  const sandbox = {
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    fetch: window.fetch,
    alert: window.alert,
    confirm: window.confirm,
    FileReader: window.FileReader,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    encodeURIComponent,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(CODE, sandbox, { filename: "editor.js" })
  return { els, rail: els.edRail }
}

/** Simule un clic sur un élément marqué par un attribut. */
function clickOn(rail, attr, value) {
  const selector = attr.startsWith("#") ? attr : "[" + attr + "]"
  const target = {
    closest(sel) {
      if (sel === selector) {
        return { getAttribute: (a) => (a === attr ? value : null) }
      }
      return null
    },
  }
  const handlers = rail._h.click || []
  for (const fn of handlers) fn({ target, preventDefault() {}, stopPropagation() {} })
}

test("éditeur : le rail se construit (onglet Sections par défaut)", () => {
  const { rail } = boot()
  assert.ok(rail.innerHTML.includes("ed-tabs"), "barre d'onglets absente")
  assert.ok(rail.innerHTML.includes('data-tab="theme"'))
  assert.ok(rail.innerHTML.includes("ed-addsection"))
})

test("éditeur : la bibliothèque de sections affiche ses vignettes", () => {
  const { rail, els } = boot()
  clickOn(rail, "#edAddSection", null)
  const pal = els.edPalette.innerHTML
  assert.ok(pal.includes("ed-pal-thumb"), "vignettes absentes")
  assert.ok((pal.match(/ed-pal-thumb/g) || []).length >= 9, "une vignette par type de section")
})

for (const [tab, marker] of [
  ["theme", "Couleurs"],
  ["pages", "CSS par page"],
  ["code", "CSS de la boutique"],
  ["texts", "Réécrire les textes"],
]) {
  test(`éditeur : l'onglet « ${tab} » se construit sans erreur`, () => {
    const { rail } = boot()
    clickOn(rail, "data-tab", tab)
    assert.ok(rail.innerHTML.includes(marker), "contenu de l'onglet absent : " + marker)
    assert.ok(rail.innerHTML.length > 500)
  })
}

test("éditeur : l'onglet Thème expose tous les réglages demandés", () => {
  const { rail } = boot()
  clickOn(rail, "data-tab", "theme")
  const html = rail.innerHTML
  for (const key of ["bg", "ink", "accent", "headBg", "headInk", "headStyle", "headHeight",
    "headAlign", "logoSize", "textScale", "radiusPx", "containerWidth", "cartMode", "footBg"]) {
    assert.ok(html.includes('data-key="' + key + '"'), "réglage manquant : " + key)
  }
  assert.ok(html.includes('data-preset'), "apparences prêtes à l'emploi absentes")
  /* une seule rangée de palettes : celle des apparences, pour ne pas doubler les tuiles */
  assert.ok(!html.includes("data-palette"), "la double rangée de palettes est revenue")
  assert.ok(html.includes("data-img=\"design||logo\""), "changement de logo absent")
  assert.ok(html.includes("Sans panier"), "mode sans panier absent")
})

test("éditeur : l'onglet Pages propose chaque page et les masquages", () => {
  const { rail } = boot()
  clickOn(rail, "data-tab", "pages")
  const html = rail.innerHTML
  for (const p of ["home", "product", "cart", "checkout", "done", "legal", "account"]) {
    assert.ok(html.includes('data-page-key="' + p + '"'), "page manquante : " + p)
  }
  assert.ok(html.includes('data-hide-key="productReviews"'))
  assert.ok(html.includes('data-deep="pageCss.checkout"'))
})

test("éditeur : les réglages existants du marchand sont rechargés", () => {
  const { rail } = boot({ bg: "#0E0E0E", cartMode: "direct", logoSize: 48, dict: [{ from: "A", to: "B" }] })
  clickOn(rail, "data-tab", "theme")
  assert.ok(rail.innerHTML.includes('value="#0E0E0E"'), "couleur enregistrée non reprise")
  assert.ok(/value="direct"[^>]*checked|checked[^>]*value="direct"/.test(rail.innerHTML), "mode panier non coché")
  clickOn(rail, "data-tab", "texts")
  assert.ok(rail.innerHTML.includes('value="A"') && rail.innerHTML.includes('value="B"'), "textes non repris")
})

test("éditeur : l'onglet Thème est replié en sections courtes et lisibles", () => {
  const { rail } = boot()
  clickOn(rail, "data-tab", "theme")
  const html = rail.innerHTML
  assert.match(html, /data-sec="Apparences prêtes"/)
  assert.match(html, /data-sec="Fiche produit"/)
  assert.match(html, /ed-sec-h/)
  /* chaque bloc du thème s'ouvre au départ : plus de liste repliée à trois lignes */
  const open = (html.match(/class="ed-sec open"/g) || []).length
  const secs = (html.match(/data-sec="/g) || []).length
  assert.ok(open > 3, "les sections du thème doivent s'ouvrir")
  assert.equal(open, secs)
})
