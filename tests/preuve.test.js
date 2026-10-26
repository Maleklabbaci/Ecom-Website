/* Preuve demandée : titres, thèmes, éditeur, tailles, pied, blocs, en-tête, commande.
   Serveur sur un port libre. La boutique publique est celle de cette base temporaire. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-preuve-${Date.now()}.db`)
const SHOTS = path.join(__dirname, "..", "..", "preuve-shots")
let server, BASE
const jar = new Map()

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
async function req(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, {
    ...opts,
    headers: { ...(opts.headers || {}), cookie: cookieHeader() },
    redirect: "manual",
  })
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  for (const c of set) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return { status: res.status, text: await res.text(), location: res.headers.get("location") || "" }
}
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})
const json = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
})
const decode = (s) => String(s || "")
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
const heroBlock = (html) => {
  const i = html.indexOf('class="sec sec-hero')
  if (i < 0) return ""
  return html.slice(i, html.indexOf("</section>", i) + 10)
}
const field = (html, re) => {
  const m = heroBlock(html).match(re)
  return m ? decode(m[1]).trim() : ""
}
const h1 = (html) => field(html, /<h1[^>]*>([^<]*)<\/h1>/)
const kicker = (html) => field(html, /class="sec-kicker"[^>]*>([^<]*)</)
const sub = (html) => field(html, /class="sec-sub"[^>]*>([^<]*)</)

const SECTIONS = require("../src/sections")
const { THEMES } = require("../src/themes")
const HERO_THEMES = THEMES.map((t) => t.id).filter((id) => SECTIONS.defaultSections(id).some((s) => s.type === "hero"))
const FOOT_STYLES = ["colonnes", "centre", "sombre", "magazine", "ligne", "cartes", "contact"]

async function useTheme(id, home, design) {
  const trial = await req("/dashboard/design/theme", form({ theme: id }))
  assert.equal(trial.status, 302, id)
  const body = {}
  if (home) body.sections = { home }
  if (design) body.design = design
  if (Object.keys(body).length) {
    const saved = await req("/dashboard/design/save", json(body))
    assert.equal(saved.status, 200, saved.text.slice(0, 180))
  }
  const pub = await req("/dashboard/design/publish", { method: "POST" })
  assert.equal(pub.status, 200, id + " publish " + pub.text.slice(0, 120))
  const page = await req("/amina-mode")
  assert.equal(page.status, 200, id)
  return page.text
}

function localUrls(html) {
  const out = new Set()
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const u = m[1]
    if (u.startsWith("/") && !u.startsWith("//")) out.add(u.split("#")[0].split("?")[0])
  }
  for (const m of html.matchAll(/url\((['"]?)(\/[^'")]+)\1\)/g)) out.add(m[2].split("?")[0])
  return [...out].filter((u) => !u.startsWith("/dashboard") && u !== "/")
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  fs.mkdirSync(SHOTS, { recursive: true })
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
  const login = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.ok([302, 303].includes(login.status), "login " + login.status)
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

test("ports : aucun fichier de test n'écoute un port fixe", () => {
  for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8")
    assert.doesNotMatch(src, /\.listen\(\s*[1-9]/, f + " écoute un port fixe")
    assert.doesNotMatch(src, /127\.0\.0\.1:4043/, f + " force encore 4043")
  }
})

test("titres : 4 cas sur chaque thème à bannière, texte de la boutique publique", async () => {
  const lines = []
  for (const id of HERO_THEMES) {
    const base = SECTIONS.defaultSections(id)
    const cases = [
      ["saisi", (s) => { s.heading = s.heading || "Titre saisi" }],
      ["vide", (s) => { s.heading = ""; s.kicker = ""; s.sub = "" }],
      ["vide+surtitre", (s) => { s.heading = ""; s.kicker = "Sur-titre"; s.sub = "" }],
      ["vide+soustitre", (s) => { s.heading = ""; s.kicker = ""; s.sub = "Sous-titre" }],
    ]
    for (const [name, mut] of cases) {
      const home = JSON.parse(JSON.stringify(base))
      const hero = home.find((s) => s.type === "hero")
      mut(hero.settings)
      const html = await useTheme(id, home)
      const got = h1(html)
      const expected = hero.settings.heading || "Amina Mode"
      assert.equal(got, expected, `${id} ${name} h1=${got}`)
      if (name === "vide") {
        assert.equal(kicker(html), "")
        assert.equal(sub(html), "")
      }
      if (name === "vide+surtitre") assert.equal(kicker(html), "Sur-titre")
      if (name === "vide+soustitre") assert.equal(sub(html), "Sous-titre")
      lines.push(`${id} ${name}: h1=${got} kicker=${kicker(html) || "-"} sub=${sub(html) || "-"}`)
    }
  }
  console.log("TITRES\n" + lines.join("\n"))
})

test("titres par défaut : Éditorial, Contraste, Boutique", async () => {
  const ed = await useTheme("editorial")
  const co = await useTheme("contrast")
  const mi = await useTheme("minimal")
  console.log(`DEFAUT editorial=${h1(ed)} contrast=${h1(co)} minimal=${h1(mi)}`)
  assert.equal(h1(ed), "La sélection")
  assert.equal(h1(co), "Le catalogue")
  assert.equal(h1(mi), "Amina Mode")
})

test("19 thèmes : aucune ressource locale en 404, avec et sans photo de bannière", async () => {
  const broken = []
  for (const t of THEMES) {
    for (const photo of [true, false]) {
      const home = JSON.parse(JSON.stringify(SECTIONS.defaultSections(t.id)))
      if (!photo) {
        for (const s of home) {
          if (s.settings && "image" in s.settings) s.settings.image = ""
          for (const b of s.blocks || []) if (b.settings && b.settings.image) b.settings.image = ""
        }
      }
      const html = await useTheme(t.id, home)
      assert.match(html, new RegExp("theme-" + t.id), t.id)
      for (const u of localUrls(html)) {
        const r = await req(u)
        if (r.status === 404) broken.push(`${t.id} photo=${photo} ${u}`)
      }
    }
  }
  console.log("404 locales: " + (broken.length ? broken.join(" | ") : "0"))
  assert.deepEqual(broken, [])
})

test("contraste : encre et fond publiés ont un ratio d'au moins 4", async () => {
  const css = await req("/themes-pro.css")
  assert.equal(css.status, 200)
  assert.match(css.text, /\.tp \.sec-hero\.has-img \.sec-hero-text h1 \{ color: #fff; \}/)
  const { contrastRatio } = ratioOf()
  const bad = []
  for (const t of THEMES) {
    const html = await useTheme(t.id)
    const bg = (html.match(/--s-bg:(#[0-9A-Fa-f]{6})/) || [])[1]
    const ink = (html.match(/--s-ink:(#[0-9A-Fa-f]{6})/) || [])[1]
    assert.ok(bg && ink, t.id + " couleurs absentes")
    const ratio = contrastRatio(bg, ink)
    if (ratio < 4) bad.push(`${t.id} ${bg}/${ink} ${ratio.toFixed(2)}`)
    const heroCls = (html.match(/class="sec sec-hero[^"]*"/) || [""])[0]
    if (heroCls.includes("has-img")) {
      assert.match(html, /themes-pro\.css/, t.id + " feuille des thèmes prête absente")
    }
  }
  console.log("CONTRASTE " + (bad.length ? bad.join(" | ") : "ok >= 4 sur les 19"))
  assert.deepEqual(bad, [])
})

function ratioOf() {
  const lum = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
  }
  const contrastRatio = (a, b) => {
    const l1 = lum(a), l2 = lum(b)
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)
  }
  return { contrastRatio }
}

test("éditeur : le brouillon se voit, le public non, puis la publication change le public", async () => {
  await useTheme("minimal")
  const before = await req("/amina-mode")
  assert.doesNotMatch(before.text, /TEXTE-BROUILLON-NDZ/)
  const home = SECTIONS.defaultSections("minimal")
  home[0].settings.heading = "TEXTE-BROUILLON-NDZ"
  const saved = await req("/dashboard/design/save", json({ sections: { home } }))
  assert.equal(saved.status, 200)
  const preview = await req("/amina-mode?preview=1")
  const pub = await req("/amina-mode")
  assert.match(preview.text, /TEXTE-BROUILLON-NDZ/)
  assert.doesNotMatch(pub.text, /TEXTE-BROUILLON-NDZ/)
  const published = await req("/dashboard/design/publish", { method: "POST" })
  assert.equal(published.status, 200)
  const after = await req("/amina-mode")
  assert.match(after.text, /TEXTE-BROUILLON-NDZ/)
  console.log("EDITEUR avant=" + (before.text.includes("TEXTE-BROUILLON-NDZ") ? "changé" : "inchangé")
    + " aperçu=oui public-avant=non public-après=oui")
})

test("tailles 0, 1 et 100 : le texte reste dans la page et le CSS est borné", async () => {
  const home = SECTIONS.defaultSections("minimal")
  home[0].settings.heading = "Taille visible NDZ"
  for (const size of [0, 1, 100]) {
    const saved = await req("/dashboard/design/save", json({
      sections: { home },
      design: { textSizes: [{ page: "home", sel: "h1", size, label: "titre" }] },
    }))
    assert.equal(saved.status, 200, "save " + size)
    await req("/dashboard/design/publish", { method: "POST" })
    const page = await req("/amina-mode")
    assert.match(page.text, /Taille visible NDZ/, "le titre a disparu du HTML à " + size)
    const shown = size === 0 ? 1 : size
    assert.match(page.text, new RegExp(`font-size:${shown}px!important`))
    assert.doesNotMatch(page.text, /color:transparent!important/)
    console.log(`TAILLE ${size}: html=présent css=${shown}px`)
  }
})

test("7 styles de pied, et un champ vide qui reste vide", async () => {
  for (const style of FOOT_STYLES) {
    const saved = await req("/dashboard/design/save", json({
      design: {
        footerStyle: style,
        footerBrand: "",
        footerNote: "",
        footerCols: [{ title: "", links: [{ label: "", url: "" }] }],
      },
    }))
    assert.equal(saved.status, 200, style)
    await req("/dashboard/design/publish", { method: "POST" })
    const page = await req("/amina-mode")
    assert.match(page.text, new RegExp(`ndz-foot-${style}`), style)
    assert.match(page.text, /data-foot="title"><\/b>/, style + " titre vide rempli")
    assert.match(page.text, /data-footbrand><\/p>/, style + " marque vide remplie")
    assert.doesNotMatch(page.text, /data-foot="title">Titre</, style)
  }
  console.log("PIEDS " + FOOT_STYLES.join(",") + " champ vide=vide")
})

test("blocs : ajouter, déplacer, masquer, supprimer — le masqué n'est pas public", async () => {
  const home = SECTIONS.defaultSections("minimal")
  const added = SECTIONS.makeSection("text", { heading: "BLOC-AJOUTE", body: "Texte du bloc ajouté." })
  home.push(added)
  let html = await useTheme("minimal", home)
  assert.match(html, /BLOC-AJOUTE/)
  const moved = [added, ...home.filter((s) => s !== added)]
  html = await useTheme("minimal", moved)
  assert.ok(html.indexOf("BLOC-AJOUTE") < html.indexOf("Pièce en vedette"), "le bloc déplacé n'est pas passé devant")
  added.hidden = true
  html = await useTheme("minimal", moved)
  assert.doesNotMatch(html, /BLOC-AJOUTE/, "un bloc masqué est encore public")
  const gone = moved.filter((s) => s !== added)
  html = await useTheme("minimal", gone)
  assert.doesNotMatch(html, /BLOC-AJOUTE/)
  console.log("BLOCS ajouté=oui déplacé=oui masqué=absent supprimé=absent")
})

test("en-tête : lien, logo, recherche déplacée ou supprimée, couleurs, hauteur", async () => {
  await useTheme("minimal")
  const before = await req("/amina-mode")
  assert.doesNotMatch(before.text, /Lien-preuve/)
  const saved = await req("/dashboard/design/save", json({
    design: {
      logo: "/demo/exemple.jpg",
      showLogo: true,
      showName: true,
      searchPlace: "icone",
      headBg: "#112233",
      headInk: "#F4F1EA",
      headHeight: "large",
      navAdd: [{ label: "Lien-preuve", url: "legal" }],
    },
    nav: [{ label: "Boutique", url: "" }, { label: "Lien-preuve", url: "legal" }],
  }))
  assert.equal(saved.status, 200, saved.text.slice(0, 160))
  await req("/dashboard/design/publish", { method: "POST" })
  const page = await req("/amina-mode")
  assert.match(page.text, /Lien-preuve/)
  assert.match(page.text, /\/demo\/exemple\.jpg/)
  assert.match(page.text, /data-search="icone"/)
  assert.match(page.text, /#112233/i)
  assert.match(page.text, /headHeight:large|data-headh="large"|--s-head/)
  assert.match(page.text, /96px/, "hauteur large absente")
  const off = await req("/dashboard/design/save", json({ design: { searchPlace: "aucune", showLogo: false } }))
  assert.equal(off.status, 200)
  await req("/dashboard/design/publish", { method: "POST" })
  const hidden = await req("/amina-mode")
  assert.match(hidden.text, /data-search="aucune"/)
  assert.match(hidden.text, /data-brandlogo="off"/)
  console.log("ENTETE lien=oui logo=oui recherche=icone puis aucune hauteur=96px")
})

test("panier et checkout : commande complète, paiement à la livraison, wilaya", async () => {
  const list = await req("/dashboard/products")
  const id = (list.text.match(/\/dashboard\/products\/(\d+)/) || [])[1]
  assert.ok(id, "produit démo")
  const add = await req("/amina-mode/cart", form({ product_id: id }))
  assert.equal(add.status, 302)
  const cart = await req("/amina-mode/cart")
  assert.equal(cart.status, 200)
  assert.match(cart.text, /Panier|panier/)
  const co = await req("/amina-mode/checkout")
  assert.match(co.text, /name="wilaya"/)
  assert.match(co.text, /name="payment"/)
  assert.match(co.text, /cod/)
  const order = await req("/amina-mode/checkout", form({
    customer_name: "Karim Benali",
    phone: "0555123456",
    wilaya: "Blida",
    commune: "Blida",
    address: "Cité 200 logements",
    payment: "cod",
    delivery: "home",
  }))
  assert.equal(order.status, 200, order.text.slice(0, 400))
  assert.match(order.text, /Commande confirmée/)
  assert.match(order.text, /Blida/)
  assert.match(order.text, /Karim Benali/)
  const db = require("../src/sqlite").open(DB)
  const row = db.prepare("SELECT wilaya, payment, customer_name FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()
  assert.equal(row.wilaya, "Blida")
  assert.equal(row.payment, "cod")
  assert.equal(row.customer_name, "Karim Benali")
  console.log("COMMANDE status=200 wilaya=Blida paiement=cod nom=Karim Benali")
})
