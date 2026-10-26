/* Bibliothèque de sections de l'éditeur : chaque bloc doit avoir sa vignette
   d'aperçu (façon Shopify), sinon le marchand ne sait pas ce qu'il ajoute. */
const { test } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.join(__dirname, "..")
const SECTIONS = require("../src/sections")
const EDITOR = fs.readFileSync(path.join(ROOT, "public", "editor.js"), "utf8")
const VIEWS = fs.readFileSync(path.join(ROOT, "src", "views.js"), "utf8")

const TYPES = Object.keys(SECTIONS.TYPES)

test("éditeur : chaque type de section a sa vignette d'aperçu", () => {
  assert.ok(TYPES.length >= 9, "types attendus : " + TYPES.join(", "))
  for (const id of TYPES) {
    const re = new RegExp("\\b" + id + ":\\s*'<svg viewBox")
    assert.ok(re.test(EDITOR), "vignette manquante pour la section « " + id + " »")
  }
})

test("éditeur : les vignettes sont des SVG autonomes (pas d'image externe)", () => {
  const svgs = EDITOR.match(/<svg viewBox="0 0 168 104"/g) || []
  assert.ok(svgs.length >= TYPES.length, "attendu au moins " + TYPES.length + " vignettes, trouvé " + svgs.length)
  const wireBlock = EDITOR.slice(EDITOR.indexOf("var WIRE"), EDITOR.indexOf("function wire("))
  assert.ok(!/<img|http:|https:/.test(wireBlock), "aucune ressource externe dans les vignettes")
})

test("éditeur : la palette affiche vignette + nom + description", () => {
  assert.match(EDITOR, /class="ed-pal-thumb"/)
  assert.match(EDITOR, /class="ed-pal-txt"/)
  assert.match(EDITOR, /Ajouter : /)
})

test("éditeur : la fenêtre « Ajouter une section » explique l'usage", () => {
  assert.match(VIEWS, /Ajouter une section/)
  assert.match(VIEWS, /Choisis un bloc : il s'ajoute à ta page/)
})
