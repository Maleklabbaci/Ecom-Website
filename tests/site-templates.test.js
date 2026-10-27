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
  assert.match(mismatch.location, /design\/themes/)
  const mismatchPrev = await req("/mismatch-test?preview=1")
  assert.ok(!mismatchPrev.text.includes("ndz-vitrine") && !mismatchPrev.text.includes("ndz-boutique"))

  /* type vitrine + template vitrine : brouillon prêt, formulaire branché aux reçus */
  const out = await req("/signup", form({ kind: "vitrine", theme: "", site: "site5", store: "Ma Vitrine Test", name: "Test", email: "v@t.dz", password: "secret1", password2: "secret1" }))
  assert.equal(out.status, 302)
  assert.match(out.location, /design\?template=1/)
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
