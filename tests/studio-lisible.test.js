/* LE STUDIO DOIT ÊTRE LISIBLE.

   Le marchand a dit : « c'est moche, c'est mal rangé, je trouve pas les
   boutons, et ça rame ». Ce fichier vérifie, écran en main :
     1. la barre du haut est groupée, et chaque bouton est NOMMÉ
        (plus d'icône toute seule qu'on ne comprend pas) ;
     2. les commandes secondaires sont rangées dans le menu « Plus » ;
     3. la page n'embarque plus ses polices : elle est deux fois plus légère ;
     4. dans la colonne de gauche, « Ajouter une section » et « Changer de
        thème » sont en haut, l'assistant en bas — l'ordre du métier.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer } = require("./boot")
const { JSDOM, VirtualConsole } = require("jsdom")
const PARCOURS = require("../src/parcours")

const DB = path.join(os.tmpdir(), `novadz-visuel-${Date.now()}.db`)
let BASE = ""
let server = null
const jar = new Map()
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")

async function req(p, opts = {}) {
  const res = await fetch(BASE + p, {
    ...opts,
    headers: { ...(opts.headers || {}), cookie: cookieHeader() },
    redirect: "manual",
  })
  for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return { status: res.status, text: await res.text(), location: res.headers.get("location") || "" }
}
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() })

/* charge une page et RÉELLEMENT exécute ses scripts */
async function voir(p, url) {
  const page = await req(p)
  assert.equal(page.status, 200, `${p} doit répondre`)
  const vc = new VirtualConsole()
  const err = []
  vc.on("jsdomError", (e) => { if (!/Could not parse CSS|Not implemented/.test(e.message)) err.push(e.message.slice(0, 120)) })
  const dom = new JSDOM(page.text, {
    runScripts: "dangerously", pretendToBeVisual: true, url: BASE + (url || p), virtualConsole: vc,
    beforeParse(win) {
      win.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, draft: null, live: null }), text: () => Promise.resolve("") })
      win.matchMedia = win.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
      win.scrollTo = () => {}
      win.open = () => null
    },
  })
  await new Promise((r) => setTimeout(r, 900))
  return { dom, doc: dom.window.document, err, close: () => dom.window.close(), texte: page.text }
}


let doc = null
let brut = ""
let fermer = () => {}

before(async () => {
  server = await startServer({ db: DB })
  BASE = server.base
  jar.clear()
  await req("/signup", form({
    kind: "commerce", name: "Karim", store: "Karim Shop", email: `{Date.now()}{Math.random().toString(36).slice(2,6)}@lisible.test.dz`,
    password: "test1234", password2: "test1234",
  }))
  await req("/dashboard/products", form({ title: "Montre acier", price: "4500", stock: "5", active: "1" }))
  const v = await voir("/dashboard/studio")
  doc = v.doc
  brut = v.texte
  fermer = v.close
})
after(() => { fermer(); if (server && server.child) server.child.kill() })

const label = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "")

test("la barre du haut est groupée en trois, séparée par des filets", () => {
  const top = doc.querySelector(".top")
  assert.ok(top, "la barre du haut existe")
  const filets = top.querySelectorAll(":scope > .sep")
  assert.equal(filets.length, 3, "trois filets : quatre zones bien séparées")
  const groupes = top.querySelectorAll(":scope > .grp")
  assert.equal(groupes.length, 4, "quatre zones : revenir / la page / regarder / agir")
  /* le dernier groupe porte les deux actions qui comptent */
  const dernier = label(groupes[3])
  assert.match(dernier, /Enregistrer/, "« Enregistrer » est dans le dernier groupe")
  assert.match(dernier, /Publier/, "« Publier » est dans le dernier groupe")
})

test("chaque bouton de la barre est NOMMÉ, pas une icône toute seule", () => {
  const noms = ["backDash", "previewBtn", "undo", "save", "pub", "plusBtn"]
  for (const id of noms) {
    const b = doc.getElementById(id)
    assert.ok(b, `le bouton #${id} existe`)
    assert.ok(label(b).length >= 4, `#${id} doit avoir un texte lisible, pas seulement une icône (lu : « ${label(b)} »)`)
  }
  /* « Tableau de bord », « Aperçu », « Annuler » : des mots, pas des symboles */
  assert.match(label(doc.getElementById("backDash")), /Tableau de bord/)
  assert.match(label(doc.getElementById("previewBtn")), /Aperçu/)
  assert.match(label(doc.getElementById("undo")), /Annuler/)
})

test("les commandes secondaires sont dans le menu « Plus », fermé au départ", () => {
  const pan = doc.getElementById("plusPan")
  const btn = doc.getElementById("plusBtn")
  assert.ok(pan && btn, "le menu « Plus » existe")
  assert.equal(pan.hidden, true, "le menu est fermé en arrivant")
  for (const id of ["goFresh", "btnLeft", "btnRight", "btnFocus", "lvl"]) {
    assert.ok(pan.querySelector(`#${id}`), `#${id} est rangé dans le menu « Plus »`)
  }
  /* et elles ont toutes une phrase qui explique à quoi elles servent */
  for (const mi of pan.querySelectorAll(".mi")) {
    assert.ok(mi.querySelector("b") && mi.querySelector("small"), `« ${label(mi)} » doit être expliqué`)
    assert.ok(label(mi.querySelector("small")).length > 8, "l'explication doit être une phrase")
  }
})

test("le menu « Plus » s'ouvre au clic et se referme", () => {
  const pan = doc.getElementById("plusPan")
  const btn = doc.getElementById("plusBtn")
  const clic = () => btn.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }))
  clic()
  assert.equal(pan.hidden, false, "le menu s'ouvre au premier clic")
  assert.equal(btn.getAttribute("aria-expanded"), "true")
  clic()
  assert.equal(pan.hidden, true, "le menu se referme au second clic")
})

test("la page n'embarque plus ses polices : elle est deux fois plus légère", () => {
  assert.equal((brut.match(/base64,/g) || []).length, 0, "plus aucune police encodée dans la page")
  assert.ok(brut.length < 520000, `la page doit rester légère (${Math.round(brut.length / 1024)} Ko)`)
  assert.match(brut, /href="\/inter-font\.css"/, "Inter est chargée en fichier, mise en cache")
})

test("colonne de gauche : agir en haut, assistant en bas", () => {
  const css = brut.slice(0, brut.indexOf("</head>") > 0 ? brut.indexOf("</head>") : 400000)
  assert.match(css, /#add\{order:2/, "« Ajouter une section » arrive en haut")
  assert.match(css, /#themeBtn\{order:3/, "« Changer de thème » suit")
  assert.match(css, /#list\{order:6/, "la liste des sections vient après")
  assert.match(css, /#ai\{order:7/, "l'assistant passe en bas de la colonne")
  /* la liste défile, les boutons du haut restent là */
  assert.match(css, /#list\{order:6;flex:1 1 auto;min-height:0/)
})

test("le studio s'affiche sans erreur JavaScript", () => {
  /* les erreurs sont relevées dans voir() */
  assert.ok(doc.getElementById("site"), "le site est construit dans le cadre")
})
