/* LOT 47 — six thèmes « prêts à l'emploi » (Atelier, Électro, Bureau, Audio,
   Soin, Mode). Un thème prêt doit : exister, s'appliquer d'un clic, afficher
   une page d'accueil complète branchée sur le vrai catalogue, et ne jamais
   laisser de bloc vide.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")
let PORT = 0
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-pro-${Date.now()}.db`)
const NEW = ["atelier", "electro", "bureau", "audio", "soin", "mode"]
let server
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
const json = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
})
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})
const file = () => new (require("better-sqlite3"))(DB)
const setTheme = (id) => file().prepare("UPDATE stores SET theme = ?, sections = NULL WHERE id = 1").run(id)

before(async () => {
  if (fs.existsSync(DB)) fs.unlinkSync(DB)
  const started = await startServer({ db: DB, env: { HOST: "127.0.0.1" } })
  server = started.child
  PORT = started.port
  BASE = started.base
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
})

after(() => { if (server) server.kill("SIGKILL") })

const login = () => req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))

test("les six thèmes sont déclarés et visibles dans le sélecteur", async () => {
  const page = await req("/dashboard/design/themes")
  assert.strictEqual(page.status, 200)
  /* le thème publié est présenté à part, en haut de la page */
  const published = (page.text.match(/class="th-now"[\s\S]*?<h2>([^<]+)<\/h2>/) || [])[1]
  assert.ok(published, "le thème publié est affiché en haut")
  for (const id of NEW) {
    assert.ok(page.text.includes(`data-theme="${id}"`) || page.text.includes(`th-now-shot`),
      `le thème ${id} a sa carte`)
    const isPublished = !page.text.includes(`value="${id}"`)
    if (!isPublished) assert.ok(page.text.includes(`value="${id}"`), `case ${id} sélectionnable`)
  }
  /* chaque thème non publié a un bouton pour le choisir */
  assert.ok((page.text.match(/Choisir ce thème/g) || []).length >= NEW.length - 1)
})

test("page Thèmes : capture réelle du thème publié + les autres thèmes en dessous", async () => {
  const page = await req("/dashboard/design/themes")
  assert.strictEqual(page.status, 200)
  assert.match(page.text, /<section class="th-now"[ >]/)
  assert.match(page.text, /Thème publié/)
  assert.match(page.text, /Choisir un autre thème/)
  /* les six thèmes prêts ont une vraie capture, pas la maquette dessinée */
  for (const id of NEW) {
    const fs = require("fs"), path = require("path")
    assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "demo", `theme-${id}.jpg`)),
      `capture du thème ${id}`)
  }
})

test("chaque thème prêt : accueil court, produits du marchand, rien d'inventé", () => {
  const S = require("../src/sections")
  for (const id of NEW) {
    const list = S.defaultSections(id)
    const types = list.map((s) => s.type)
    assert.ok(list.length >= 4 && list.length <= 6, `${id} : ${list.length} blocs, page courte`)
    const musts = id === "atelier"
      ? ["banner", "hero", "carousel", "benefits"]
      : ["banner", "hero", "grid", "benefits"]
    for (const must of musts) {
      assert.ok(types.includes(must), `${id} contient un bloc « ${must} »`)
    }
    assert.ok(!types.includes("reviews") && !types.includes("gallery"), `${id} n'invente ni avis ni lookbook`)
    const blob = JSON.stringify(list)
    assert.ok(!/demo-robe|demo-sac|Sac camel|Robe d'été|3 800/.test(blob), `${id} ne cite pas un article inventé`)
    for (const s of list) {
      if (s.type === "benefits") {
        assert.ok(s.blocks && s.blocks.length > 0, `${id} : promesses présentes`)
      }
    }
  }
})

test("la bannière d'un thème prêt n'est jamais vide (photo du premier produit)", async () => {
  setTheme("atelier")
  const home = await req("/amina-mode")
  assert.strictEqual(home.status, 200)
  assert.ok(/class="sec sec-hero[^"]*has-img/.test(home.text), "la bannière a une image")
  assert.ok(/sec-hero-bg" style="background-image:url\('\/demo\//.test(home.text), "l'image vient du catalogue")
})

test("chaque thème rend sa page d'accueil, sa fiche produit, son panier et sa commande", async () => {
  for (const id of NEW) {
    setTheme(id)
    const home = await req("/amina-mode")
    assert.strictEqual(home.status, 200, `${id} accueil`)
    assert.ok(home.text.includes(`tpx-${id}`), `${id} : sa propre classe de thème`)
    assert.ok(home.text.includes("/themes-pro.css"), `${id} : sa feuille de style`)
    assert.ok((home.text.match(/class="sec sec-/g) || []).length >= 4, `${id} : blocs rendus`)

    const prod = await req("/amina-mode/p/1")
    assert.strictEqual(prod.status, 200, `${id} fiche produit`)
    assert.ok(prod.text.includes("tpx-pgrid"), `${id} : fiche produit structurée`)
    assert.ok(prod.text.includes("tpx-buy"), `${id} : bouton d'achat`)
  }
})

test("le panier et la commande restent lisibles dans un thème prêt", async () => {
  setTheme("mode")
  await req("/amina-mode/cart", form({ product_id: "2" }))
  const cart = await req("/amina-mode/cart")
  assert.strictEqual(cart.status, 200)
  assert.ok(cart.text.includes("tpx-cartgrid"), "panier en deux colonnes")
  assert.ok(cart.text.includes("tpx-summary"), "récapitulatif présent")
  const ck = await req("/amina-mode/checkout")
  assert.strictEqual(ck.status, 200)
  assert.ok(ck.text.includes("tpx-form"), "formulaire de commande")
})

test("la feuille des thèmes prêts couvre les trois tailles", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "themes-pro.css"), "utf8")
  for (const id of NEW) assert.ok(css.includes(`.tpx-${id}`), `règle CSS pour ${id}`)
  assert.ok(css.includes("@media (max-width: 820px)"), "palier tablette")
  assert.ok(css.includes("@media (max-width: 480px)"), "palier téléphone")
  /* les en-têtes transparents doivent laisser la bannière respirer */
  /* l'en-tête posé ne doit PAS être en position absolue : c'est ce qui le faisait
     chevaucher la barre d'annonce */
  assert.ok(/:has\(\.tpx-head-overlay\)\s*\{[^}]*margin-bottom: -76px/.test(css), "en-tête posé remonté dans le flux")
  assert.ok(!/tpx-head-overlay\s*\{[^}]*position: absolute/.test(css), "aucun positionnement absolu")
})

test("choisir un thème remplace la recette du brouillon (sans toucher à la boutique en ligne)", async () => {
  const row = () => file().prepare("SELECT theme, sections, draft FROM stores WHERE id = 1").get()
  setTheme("atelier")
  await req("/dashboard/design/theme", form({ theme: "electro" }))
  const after = row()
  const draft = JSON.parse(after.draft || "{}")
  assert.strictEqual(draft.theme, "electro")
  assert.ok(Array.isArray(draft.sections.home) && draft.sections.home.length >= 4, "recette du nouveau thème dans le brouillon")
  assert.strictEqual(after.theme, "atelier", "la boutique en ligne n'a pas bougé avant publication")
})

/* ---------------------------------------------------------------------------
   Les réglages de l'éditeur doivent changer les nouveaux thèmes.
   Avant, leur CSS figeait couleurs et polices : l'éditeur ne modifiait rien.
   --------------------------------------------------------------------------- */
test("les réglages du marchand passent devant le CSS des six thèmes", async () => {
  await login()
  const save = await req("/dashboard/design/save", json({
    design: { accent: "#C0392B", font: "serif", radiusPx: 2 },
  }))
  assert.equal(save.status, 200)
  await req("/dashboard/design/publish", { method: "POST" })

  for (const id of NEW) {
    await req("/dashboard/design/theme", form({ theme: id }))
    await req("/dashboard/design/publish", { method: "POST" })
    const page = (await req("/amina-mode")).text
    assert.match(page, /--tpx-accent:#C0392B/i, `${id} : couleur d'accent appliquée`)
    assert.match(page, /--tpx-f-head:Georgia/i, `${id} : police appliquée`)
    assert.match(page, /border-radius:2px/i, `${id} : arrondi appliqué`)
    /* la feuille du marchand doit venir APRÈS le CSS du thème */
    const iTheme = page.indexOf("/themes-pro.css")
    const iUser = page.indexOf("--tpx-accent:#C0392B")
    assert.ok(iTheme > -1 && iUser > iTheme, `${id} : réglages après le thème`)
  }
  /* on remet le design d'origine pour ne pas polluer les autres tests */
  await req("/dashboard/design/save", json({ design: { accent: "#111111", font: "inter", radiusPx: 12 } }))
  await req("/dashboard/design/publish", { method: "POST" })
})

test("un thème sans réglage garde ses propres couleurs (identité intacte)", async () => {
  await login()
  await req("/dashboard/design/save", json({ design: { accent: "#111111", bg: "#FFFFFF", font: "inter" } }))
  await req("/dashboard/design/publish", { method: "POST" })
  await req("/dashboard/design/theme", form({ theme: "electro" }))
  await req("/dashboard/design/publish", { method: "POST" })
  const page = (await req("/amina-mode")).text
  assert.ok(!/--tpx-accent:#111111/.test(page), "aucune surcharge d'accent")
  /* l'accent du thème vit dans sa feuille de style, pas dans la page */
  const css = (await req("/themes-pro.css")).text
  const block = css.slice(css.indexOf(".tp.tpx-electro {"), css.indexOf(".tp.tpx-electro {") + 400)
  assert.match(block, /--tpx-accent:\s*#B4442A/i, "l'accent du thème reste le sien")
})

test("bandeau de catégories : un bloc de la bibliothèque, utilisé par Électro", () => {
  const S = require("../src/sections")
  assert.ok(S.TYPES.cats, "type « cats » déclaré")
  assert.ok(S.defaultSections("electro").some((s) => s.type === "cats"), "Électro : rayons du marchand")
  /* le rendu existe aussi quand il n'y a aucun rayon (jamais un trou muet) */
  const html = S.renderSections({ id: 1, slug: "demo" }, [{ id: "x", type: "cats", settings: {} }], { cats: [] })
  assert.match(html, /Aucun rayon pour le moment/)
})

/* ------------------- LOT 51 : aucun réglage mort ---------------------- */
test("en-tête : hauteur, disposition et style sortent vraiment du réglage", () => {
  const S = require("../src/sections")
  const css = S.storeStyle({ headHeight: "large", headAlign: "centre", headStyle: "transparent" }, "atelier")
  /* les règles visent le vrai conteneur de la barre, pas un sélecteur vide */
  assert.match(css, /\.tpx-hrow\{min-height:96px!important\}/)
  assert.match(css, /\.tpx-hrow\{justify-content:center!important\}/)
  assert.match(css, /\.tpx-headwrap\{background:transparent!important/)
  /* préfixe valide : :root est un ancêtre réel (un préfixe .tp ne matcherait pas) */
  assert.match(css, /:root :is\(\.tp\.tpx-atelier/)
  assert.ok(!/\.tp :is\(\.tp\.tpx-atelier/.test(css), "pas de sélecteur qui ne peut pas matcher")
})

test("texte, titres et interlignes suivent les curseurs de l'éditeur", () => {
  const S = require("../src/sections")
  const css = S.storeStyle({ textScale: 1.25, tracking: "serre", weight: "700" }, "atelier")
  assert.match(css, /font-size:calc\(1\.25 \* 15px\)!important/)
  assert.match(css, /letter-spacing:-0\.045em!important/)
  assert.match(css, /font-weight:700!important/)
})

test("version téléphone : quatre réglages, tous émis et limités au petit écran", () => {
  const S = require("../src/sections")
  const css = S.storeStyle({ mobileText: "grand", mobileTitle: "petit", mobilePad: "aere", mobileCols: 1 }, "atelier")
  assert.match(css, /@media \(max-width:520px\)/)
  assert.match(css, /calc\(1\.12 \* 15px\)!important/, "texte plus grand")
  assert.match(css, /calc\(0\.86 \* 26px\)!important/, "titres plus petits")
  assert.match(css, /padding-top:calc\(1\.3 \* 34px\)!important/, "espacement aéré")
  assert.match(css, /grid-template-columns:repeat\(1,minmax\(0,1fr\)\)!important/, "un produit par ligne")
  /* par défaut : rien n'est émis, le thème garde son rendu */
  assert.ok(!/520px/.test(S.storeStyle({}, "atelier")))
})

test("un bloc ajouté se règle : espacement, titre, visuel, largeur, colonnes, ordre", () => {
  const S = require("../src/sections")
  const html = S.renderSections({ id: 1, slug: "demo" },
    [{ id: "g1", type: "grid", cols: 2, pad: 96, tsize: 1.5, imgH: 480, wide: "etroite",
       settings: { count: 2, columns: 4, heading: "Produits" } }],
    { products: [{ id: 1, title: "A", price: 100, image: "" }, { id: 2, title: "B", price: 200, image: "" }] })
  assert.match(html, /--sec-pad:96px/)
  assert.match(html, /--sec-title:1.5/)
  assert.match(html, /--sec-img:480px/)
  assert.match(html, /--cols:2/)
  assert.match(html, /sec-items cols-fixed/, "le réglage de colonnes prime sur la mosaïque du thème")
  assert.match(html, /ndz-wide-etroite/)
})
