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

test("galerie : 6 cartes « Utiliser » sur l'accueil (3 vitrine + 3 e-commerce) ; l'inscription garde le template", async () => {
  jar.clear()
  const home = await req("/")
  assert.equal((home.text.match(/\/signup\?site=site\d+/g) || []).length, 6)
  assert.equal((await req("/themes")).status, 200)
  const su = await req("/signup?site=site5")
  assert.match(su.text, /name="site" value="site5"/)
  const out = await req("/signup", form({ kind: "commerce", theme: "", site: "site5", store: "Ma Boutique Test", name: "Test", email: "t@t.dz", password: "secret1", password2: "secret1" }))
  assert.equal(out.status, 302)
  assert.match(out.location, /design\?template=1/)
  const prev = await req("/ma-boutique-test?preview=1")
  assert.ok(prev.text.includes("ndz-boutique"))
})
