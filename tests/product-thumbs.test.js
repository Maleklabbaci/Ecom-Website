/* LOT 46 — la photo principale doit toujours s'afficher devant le produit. */
const test = require("node:test")
const assert = require("node:assert")
const fs = require("fs")
const path = require("path")

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "views.js"), "utf8")
const CSS = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8")

test("la liste Produits utilise la photo, plus l'initiale seule", () => {
  assert.ok(SRC.includes('${pThumb(p)}'), "dashProducts doit appeler pThumb(p)")
  assert.ok(!SRC.includes('<td class="t-thumb">${initial(p.title)}</td>'), "l'ancienne lettre seule doit avoir disparu")
})

test("pThumb rend un <img> quand le produit a une image, sinon l'initiale", () => {
  const start = SRC.indexOf("const pThumb =")
  assert.ok(start > 0, "helper pThumb présent")
  const body = SRC.slice(start, SRC.indexOf("\n}", start) + 2)
  assert.ok(body.includes('<img src="${esc(img)}"'), "balise img avec l'image du produit")
  assert.ok(body.includes("initial("), "repli sur l'initiale")
  assert.ok(body.includes("loading=\"lazy\""), "chargement différé")
  assert.ok(body.includes('class="t-img'), "classe de style dédiée")
})

test("le stock et les articles de commande affichent aussi la photo", () => {
  assert.ok(SRC.includes('<span class="stock-prod"><span class="t-thumb">${pThumb(p)}</span>'), "vignette dans le tableau de stock")
  assert.ok(SRC.includes('<span class="ord-item"><span class="t-thumb">${pThumb(it)}</span>'), "vignette dans les articles de commande")
})

test("les articles de commande remontent l'image du produit", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
  assert.ok(/SELECT oi\.\*,\s*\(SELECT p\.image FROM products p WHERE p\.id = oi\.product_id\) AS image/.test(server),
    "la fiche commande doit joindre products.image")
})

test("le CSS cadre la vignette sans la déformer (object-fit)", () => {
  assert.ok(/\.t-thumb \.t-img[^{]*\{[^}]*object-fit: cover/.test(CSS), "object-fit: cover")
  assert.ok(/\.t-img[^{]*\{[^}]*border-radius/.test(CSS), "coins arrondis")
  assert.ok(/\.stock-prod\s*\{[^}]*display: inline-flex/.test(CSS), "alignement dans le stock")
})

test("la démo fournit de vraies photos (sinon la liste retombe sur des lettres)", () => {
  const seed = fs.readFileSync(path.join(__dirname, "..", "src", "seed.js"), "utf8")
  const files = ["demo-robe.jpg", "demo-sac.jpg", "demo-foulard.jpg", "demo-sandales.jpg"]
  for (const f of files) {
    assert.ok(seed.includes(`/demo/${f}`), `seed référence ${f}`)
    const p = path.join(__dirname, "..", "public", "demo", f)
    assert.ok(fs.existsSync(p), `${f} existe sur le disque`)
    assert.ok(fs.statSync(p).size > 20000, `${f} n'est pas vide`)
  }
})
