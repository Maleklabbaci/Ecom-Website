/* Chantier 5 : ce que le marchand voit vraiment dans le Studio.
   1. toutes les photos s'affichent (pas de carte écrasée, pas de photo
      « lazy » qui reste grise dans l'atelier) ;
   2. la grille de produits ne revient pas quand on l'a enlevée ;
   3. la couleur des prix est un seul réglage, qui suit toute la boutique ;
   4. FR / AR ne change que la langue : rien n'est enregistré en arabe. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-c5-${Date.now()}.db`)
let BASE = "", server
const jar = new Map()
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
async function req(p, opts = {}) {
  const res = await fetch(BASE + p, { ...opts, headers: { ...(opts.headers || {}), cookie: cookieHeader() }, redirect: "manual" })
  for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    const [pair] = c.split(";"); const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return { status: res.status, text: await res.text(), location: res.headers.get("location") || "" }
}
const form = (obj) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(obj).toString() })
const json = (obj) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) })

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const s = await startServer({ db: DB }); server = s.child; BASE = s.base
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  /* une boutique « site complet » : c'est là que vivent les pages du Studio */
  await req("/dashboard/design/site-template", form({ id: "site6" }))
})
after(() => { if (server) server.kill(); try { fs.unlinkSync(DB) } catch (_) {} })

test("la photo d'une carte produit a une vraie place (et un cadre propre s'il n'y a pas de photo)", () => {
  const SITES = require("../src/site-templates")
  const store = { id: 1, slug: "essai", name: "Essai", currency: "DZD", site_kind: "commerce" }
  const produits = [
    { id: 1, title: "Avec photo", price_cents: 450000, image: "/demo/demo-robe.jpg" },
    { id: 2, title: "Sans photo", price_cents: 120000, image: null },
  ]
  const html = SITES.render(store, produits, "site6", {})
  /* `display:block` est indispensable : un <span> reste en ligne, l'aspect-ratio
     ne s'applique pas, et la photo s'affiche écrasée sur 50 px de haut. */
  assert.match(html, /#ndz-boutique \.ndzs-img\{display:block;aspect-ratio:4\/5/, "la vignette a une place fixe")
  assert.match(html, /\.ndzs-p\{[^}]*color:var\(--ndz-prix,#555\)/, "le prix prend sa couleur dans un seul endroit")
  assert.match(html, /<img src="\/demo\/demo-robe\.jpg"/, "la photo du produit s'affiche")
  assert.match(html, /ndzs-noimg/, "un produit sans photo garde un cadre propre, sans rien inventer")
  assert.ok(!/src="null"/.test(html))
})

test("l'atelier charge toutes les photos tout de suite, et les remet « lazy » en enregistrant", async () => {
  const frame = fs.readFileSync(path.join(__dirname, "..", "public", "_studio", "frame.js"), "utf8")
  assert.match(frame, /img\[loading="lazy"\]/, "les photos « lazy » sont repérées")
  assert.match(frame, /data-ndz-lz/, "elles sont marquées pour être remises en place")
  assert.match(frame, /lazyAgain\(c\)/, "l'enregistrement remet « lazy » : la page publique reste rapide")
  /* les photos de fond (pas des <img>) sont aussi des calques */
  assert.match(frame, /bgs: bgs/, "les fonds sont listés")
  assert.match(frame, /API\.setBg/, "on peut remplacer un fond")
  assert.match(frame, /API\.clearBg/, "on peut retirer un fond sans emporter la section")
})

test("la couleur des prix : un réglage, toute la boutique", async () => {
  const r = await req("/dashboard/studio/couleur", json({ prix: "#b91c1c" }))
  assert.equal(JSON.parse(r.text).ok, true)
  const store = require("../src/db")
  assert.ok(store)
  const page = await req("/amina-mode")
  assert.match(page.text, /--ndz-prix:#b91c1c/, "la variable arrive sur la page publique")
  /* une couleur inventée est refusée */
  const mauvais = await req("/dashboard/studio/couleur", json({ prix: "rouge" }))
  assert.equal(mauvais.status, 400)
  /* retour à la couleur d'origine */
  const off = await req("/dashboard/studio/couleur", json({ prix: "" }))
  assert.equal(JSON.parse(off.text).ok, true)
  const apres = await req("/amina-mode")
  assert.ok(!/--ndz-prix:#b91c1c/.test(apres.text), "l'ancienne couleur ne reste pas dans la page")
})

test("la grille de produits ne revient pas quand le marchand l'a enlevée", async () => {
  const frame = await req("/dashboard/studio/frame?page=home")
  assert.equal(frame.status, 200)
  assert.match(frame.text, /data-ndz="produits"/, "au départ, la grille est posée")
  /* on enregistre une page SANS la grille */
  const html = '<!doctype html><html><head><title>Ma page</title></head><body><h1>Bonjour</h1></body></html>'
  const save = await req("/dashboard/studio/save", json({ page: "home", html }))
  assert.equal(JSON.parse(save.text).ok, true)
  const apres = await req("/dashboard/studio/frame?page=home")
  assert.ok(!/data-ndz="produits"><\/div>/.test(apres.text), "la grille n'est pas rajoutée d'office")
  const public_ = await req("/amina-mode")
  assert.ok(!/id="ndz-boutique"/.test(public_.text), "ni sur le site public")
  /* on remet la page du modèle pour la suite des tests */
  await req("/dashboard/studio/reset", json({}))
})

test("FR / AR ne change que la langue : une page enregistrée en arabe reste française en base", () => {
  const AR = require("../src/ui-ar")
  const html = '<body><a href="/x">السلة</a><button>حفظ</button><p>نص الزبون</p></body>'
  const fr = AR.unlocalize(html)
  assert.match(fr, />Panier</, "le libellé de la plateforme redevient français")
  assert.match(fr, />Enregistrer</, "idem pour les boutons")
  assert.match(fr, /نص الزبون/, "le texte du marchand n'est jamais touché")
  /* et le Studio garde ses propres libellés de pages en arabe */
  const SA = require("../src/studio-ar")
  const mots = new Map(SA.WORDS)
  assert.equal(mots.get("Fiche produit"), "صفحة المنتج")
  assert.equal(mots.get("Panier"), "السلة")
  assert.equal(mots.get("Confirmation"), "تأكيد الطلب")
})

test("un bouton se relie à une page choisie, et l'adresse reste modifiable", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "_studio", "studio.js"), "utf8")
  /* la liste des pages est là, et le champ d'adresse aussi (avant, le champ
     était créé puis jamais affiché : le marchand ne pouvait pas voir le lien) */
  assert.match(src, /lienListe\(a, function/, "on choisit une page dans la liste")
  assert.match(src, /fld\("Adresse du lien", href\)/, "l'adresse du bouton est visible et modifiable")
  /* choisir « Action du bouton » ne doit plus écraser l'adresse choisie */
  const apply = src.slice(src.indexOf("var apply = function ()"), src.indexOf("mode.onchange = apply"))
  assert.match(apply, /if \(mode.value && pid.value\) F\.setAttr\("href"/, "l'adresse n'est écrasée que pour un achat")
})

test("le réglage « mobile » ne s'applique qu'en vue téléphone", () => {
  const frame = fs.readFileSync(path.join(__dirname, "..", "public", "_studio", "frame.js"), "utf8")
  const fn = frame.slice(frame.indexOf("API.autoMobile = function"), frame.indexOf("API.autoMobile = function") + 200)
  assert.match(fn, /if \(S\.dev !== "m"\) return -1/, "rien n'est posé quand on regarde en ordinateur ou en tablette")
})

test("atelier en arabe : la page de la boutique suit la langue, et s'enregistre en français", async () => {
  const fr = await req("/dashboard/studio/plateforme?page=product")
  assert.equal(fr.status, 200)
  assert.match(fr.text, /Retour à la boutique/, "en français, la page est en français")
  assert.match(fr.text, /data-ndz-keep="achat"/)
  const ar = await req("/dashboard/studio/plateforme?page=product&uilang=ar")
  assert.equal(ar.status, 200)
  assert.match(ar.text, /dir="rtl"/, "la page passe en arabe, de droite à gauche")
  assert.match(ar.text, /العودة إلى المتجر/, "les libellés suivent la langue de l'atelier")
  assert.ok(!/Retour à la boutique/.test(ar.text), "aucun libellé français ne reste")
  assert.match(ar.text, /data-ndz-keep="achat"/, "la zone d'achat reste protégée")
  /* on enregistre la page telle qu'elle est affichée (en arabe) : elle doit
     repartir en français dans la base, sinon la langue deviendrait un contenu */
  const save = await req("/dashboard/studio/plateforme", json({ page: "product", html: ar.text }))
  assert.equal(JSON.parse(save.text).ok, true)
  /* retour au Studio en français : la page enregistrée se relit en français */
  const relu = await req("/dashboard/studio/plateforme?page=product&uilang=fr")
  assert.match(relu.text, /Retour à la boutique/, "la page enregistrée est en français")
  assert.ok(!/العودة إلى المتجر/.test(relu.text), "l'arabe n'est pas figé dans la page")
  /* on remet la page du modèle */
  await req("/dashboard/studio/plateforme", json({ page: "product", html: fr.text }))
})

test("les raccourcis « il reste à faire » mènent au bon endroit", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "_studio", "studio.js"), "utf8")
  const frame = fs.readFileSync(path.join(__dirname, "..", "public", "_studio", "frame.js"), "utf8")
  /* « Ajouter une photo » ouvre la fenêtre des photos et pose la photo choisie
     (avant : on envoyait sur l'onglet « Ajouter », où il n'y a aucun bloc photo) */
  assert.match(src, /pickImage\(function \(u\) \{ F\.insertImage\(u\) \}\)/, "le raccourci photo ouvre les photos")
  assert.match(frame, /API\.insertImage = function/, "la photo choisie est posée dans la page")
  /* « Montrer ce que vous vendez » ouvre la page Produits : la grille vient de là */
  assert.match(src, /window\.open\("\/dashboard\/products", "_blank"\)/, "le raccourci produits ouvre « Produits »")
})

test("en arabe, un texte écrit en français reste lisible (sens de lecture par phrase)", () => {
  const SITES = require("../src/site-templates")
  const store = { id: 1, slug: "essai", name: "Essai", currency: "DZD", site_kind: "commerce", lang_mode: "ar" }
  const html = SITES.render(store, [], "site6", { html: "<!doctype html><html><head></head><body><h1>Effortlessly Blend Comfort &amp; Style!</h1></body></html>" })
  assert.match(html, /dir="rtl"/, "la page arabe se lit de droite à gauche")
  /* sans `unicode-bidi:plaintext`, « !Comfort » passait la ponctuation devant */
  assert.match(html, /html\[dir="rtl"\] h1[^{]*\{unicode-bidi:plaintext\}/, "chaque texte garde son sens de lecture")
  assert.match(html, /html\[dir="rtl"\] p,/, "idem pour les paragraphes")
  /* le texte du marchand n'est pas traduit */
  assert.match(html, /Effortlessly Blend Comfort &amp; Style!/, "on ne traduit jamais le contenu du marchand")
})

test("une page enregistrée en arabe ne laisse pas la boutique de droite à gauche", () => {
  const SITES = require("../src/site-templates")
  const I18N = require("../src/i18n")
  const store = { id: 1, slug: "essai", name: "Essai", currency: "DZD", site_kind: "commerce" }
  /* ce que le Studio enregistre quand on travaillait en arabe */
  const enregistre = '<!doctype html><html dir="rtl" lang="ar"><head><title>Essai</title></head><body><p>Bonjour</p></body></html>'
  I18N.run({ req: { query: {}, cookies: {} } }, () => {
    const fr = SITES.render(store, [], "site6", { html: enregistre })
    assert.match(fr, /<html[^>]*dir="ltr"[^>]*lang="fr"/, "en français, la page repart de gauche à droite")
    assert.ok(!/dir="rtl"/.test(fr), "aucun reste de droite à gauche")
  })
  I18N.run({ req: { query: { lang: "ar" }, cookies: {} } }, () => {
    const ar = SITES.render(store, [], "site6", { html: enregistre })
    assert.match(ar, /<html[^>]*dir="rtl"[^>]*lang="ar"/, "en arabe, elle se lit de droite à gauche")
  })
})

test("une boutique qui vient d'être créée arrive dans le Studio, pas dans l'ancien Design", async () => {
  /* compte neuf, puis le premier écran (ce que je vends + téléphone + wilaya) */
  const mail = `neuf-${Date.now()}@t.dz`
  await req("/signup", form({ kind: "commerce", store: "Boutique Neuve", name: "Neuf", email: mail, password: "secret1", password2: "secret1" }))
  const start = await req("/demarrer", form({ store_name: "Boutique Neuve", metier: "mode", phone: "0555 12 34 56", wilaya: "Blida" }))
  assert.equal(start.status, 302)

  /* le menu propose le Studio, et il s'ouvre (plus de renvoi vers la galerie) */
  const dash = await req("/dashboard")
  assert.match(dash.text, /href="\/dashboard\/studio"/, "le Studio est proposé au menu")
  const studio = await req("/dashboard/studio/pages")
  assert.equal(studio.status, 200, "le Studio s'ouvre tout de suite")
  assert.match(studio.text, /data-tpl="site6"/, "le Studio travaille sur le modèle du métier")

  /* et la boutique montre déjà un vrai modèle complet, pas l'ancien thème */
  const shop = await req("/boutique-neuve?preview=1")
  assert.ok(shop.text.includes("ndz-boutique"), "un modèle complet est posé d'office")
})
