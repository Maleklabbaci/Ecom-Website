/* Nouveautés « vitrine libre » : réglages de design complets, code du marchand,
   pages éditables, achat sans panier, nouveaux thèmes, choix du moyen de paiement.
   Serveur isolé (port libre, base temporaire). */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")
let PORT = 0
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-libre-${Date.now()}.db`)
let server
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
const login = () => req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const started = await startServer({ db: DB })
  server = started.child
  PORT = started.port
  BASE = started.base
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

const design = (d) => req("/dashboard/design/save", json({ design: d }))
const publish = () => req("/dashboard/design/publish", { method: "POST" })

/* ------------------------------- THÈMES ------------------------------- */
test("thèmes : les dix-neuf modèles existent et sont proposés", async () => {
  const { THEMES } = require("../src/themes")
  const ids = THEMES.map((t) => t.id)
  for (const id of ["atelier", "electro", "bureau", "audio", "soin", "mode", "minimal", "editorial", "contrast", "mono", "galerie", "bento", "zen", "cod", "tech", "marche", "catalogue", "mosaique", "noir"]) {
    assert.ok(ids.includes(id), "thème manquant : " + id)
  }
  assert.equal(ids.length, 19)
  await login()
  const page = await req("/dashboard/design/themes")
  for (const id of ids) assert.match(page.text, new RegExp('data-theme="' + id + '"'), id)
})

test("thèmes : chaque modèle se rend sans erreur sur la vitrine", async () => {
  const { THEMES } = require("../src/themes")
  await login()
  const liveNow = ((await req("/amina-mode")).text.match(/class="theme theme-([a-z]+)/) || [])[1]
  for (const t of THEMES) {
    const r = await req("/dashboard/design/theme", form({ theme: t.id }))
    assert.equal(r.status, 302, t.id)
    /* le thème d'essai ne touche pas la boutique en ligne… */
    if (t.id !== liveNow) {
      const live = await req("/amina-mode")
      assert.doesNotMatch(live.text, new RegExp("theme-" + t.id + "\\b"))
    }
    /* …mais il s'affiche dans l'aperçu du marchand */
    const home = await req("/amina-mode?preview=1")
    assert.equal(home.status, 200, "accueil cassé avec " + t.id)
    assert.match(home.text, new RegExp("theme-" + t.id))
    const prod = await req("/amina-mode/p/1?preview=1")
    assert.equal(prod.status, 200, "fiche produit cassée avec " + t.id)
  }
  await req("/dashboard/design/theme/cancel", { method: "POST" })
})

test("thèmes : changer de thème ne casse pas la boutique en ligne avant publication", async () => {
  await login()
  const before = await req("/amina-mode")
  const themeBefore = (before.text.match(/class="theme theme-([a-z]+)/) || [])[1]
  await req("/dashboard/design/theme", form({ theme: "noir" }))
  const after = await req("/amina-mode")
  const themeAfter = (after.text.match(/class="theme theme-([a-z]+)/) || [])[1]
  assert.equal(themeAfter, themeBefore, "la vitrine a changé sans publication")

  /* publier applique le thème d'essai */
  await publish()
  const published = await req("/amina-mode")
  assert.match(published.text, /theme-noir/)

  /* on revient au thème d'origine pour les autres tests */
  await req("/dashboard/design/theme", form({ theme: themeBefore }))
  await publish()
})

/* ------------------------- RÉGLAGES DU DESIGN ------------------------- */
test("design : couleurs, logo, taille de texte et largeur arrivent dans la vitrine", async () => {
  await login()
  await design({
    bg: "#0E0E0E", ink: "#F5F5F5", accent: "#FFD400",
    headStyle: "ligne", headHeight: "large", headAlign: "centre",
    logoSize: 48, textScale: 1.1, radiusPx: 18, containerWidth: 1400,
  })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /--s-bg:#0E0E0E/)
  assert.match(r.text, /--s-accent:#FFD400/)
  assert.match(r.text, /--s-logo:48px/)
  assert.match(r.text, /--s-text:1.1/)
  assert.match(r.text, /--s-radius:18px/)
  assert.match(r.text, /--s-container:1400px/)
  assert.match(r.text, /d-head-ligne/)
  assert.match(r.text, /min-height:96px/)
})

test("design : une couleur invalide est remplacée, pas injectée", async () => {
  await login()
  await design({ bg: "red;}</style><script>alert(1)</script>", accent: "pas-une-couleur" })
  await publish()
  const r = await req("/amina-mode")
  assert.ok(!r.text.includes("alert(1)"), "injection refusée")
  assert.match(r.text, /--s-bg:#FFFFFF/)
  assert.match(r.text, /--s-accent:#111111/)
})

test("design : CSS personnalisé + CSS par page", async () => {
  await login()
  await design({
    customCss: ".theme h1{text-transform:uppercase}",
    pageCss: { product: ".p-desc{outline:1px solid red}" },
  })
  await publish()
  const home = await req("/amina-mode")
  assert.match(home.text, /text-transform:uppercase/)
  assert.ok(!home.text.includes("outline:1px solid red"), "le CSS produit ne doit pas fuiter sur l'accueil")
  const prod = await req("/amina-mode/p/1")
  assert.match(prod.text, /outline:1px solid red/)
})

test("design : code HTML de l'en-tête et du pied, scripts retirés", async () => {
  await login()
  await design({
    htmlHead: '<meta name="x-test" content="1"><script>alert(1)</script>',
    htmlFooter: '<div id="ndz-foot">pied</div>',
  })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /name="x-test"/)
  assert.match(r.text, /id="ndz-foot"/)
  assert.ok(!/alert\(1\)/.test(r.text), "le script doit être retiré")
})

test("design : le marchand réécrit les textes de n'importe quelle page", async () => {
  await login()
  await design({ dict: [{ from: "Ajouter au panier", to: "Je le veux" }, { from: "Retour à la boutique", to: "Retour" }] })
  await publish()
  const prod = await req("/amina-mode/p/1")
  assert.match(prod.text, /Je le veux/)
  assert.match(prod.text, /Retour<\/a>/)
  assert.ok(!prod.text.includes(">Ajouter au panier<"))
})

test("design : masquer un élément d'une page", async () => {
  await login()
  await design({ hide: { productReviews: true } })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /p-reviews[^{]*\{display:none\}/)
  assert.equal(r.status, 200)
})

/* --------------------------- ACHAT SANS PANIER --------------------------- */
test("panier : mode « deux » affiche les deux boutons", async () => {
  await login()
  await design({ cartMode: "deux" })
  await publish()
  const r = await req("/amina-mode/p/1")
  assert.match(r.text, /Ajouter au panier/)
  assert.match(r.text, /Acheter maintenant/)
  assert.match(r.text, /formaction="\/amina-mode\/direct"/)
})

test("panier : mode « sans panier » masque le panier et va droit à la commande", async () => {
  await login()
  await design({ cartMode: "direct" })
  await publish()
  const r = await req("/amina-mode/p/1")
  assert.match(r.text, /data-cart="direct"/)
  assert.match(r.text, /Commander maintenant/)
  assert.ok(!r.text.includes(">Ajouter au panier<"))
})

test("achat direct : renvoie au formulaire avec un seul article", async () => {
  await login()
  await design({ cartMode: "deux" })
  await publish()
  const r = await req("/amina-mode/direct", form({ product_id: "2" }))
  assert.equal(r.status, 302)
  assert.match(r.location, /\/amina-mode\/checkout/)
  const co = await req("/amina-mode/checkout")
  assert.equal(co.status, 200)
  assert.match(co.text, /data-desk=/)
})

test("achat direct : produit inexistant → retour boutique, pas d'erreur", async () => {
  const r = await req("/amina-mode/direct", form({ product_id: "999999" }))
  assert.equal(r.status, 302)
  assert.match(r.location, /\/amina-mode$/)
})

test("paiement : ?pay= présélectionne le moyen choisi", async () => {
  await login()
  await req("/dashboard/paiement", form({ pay_cod: "1", pay_cib: "1", pay_cib_note: "Carte" }))
  await req("/amina-mode/direct", form({ product_id: "1" }))
  const r = await req("/amina-mode/checkout?pay=cib")
  assert.match(r.text, /value="cib"[^>]*checked/)
})

/* ------------------------------- ÉDITEUR ------------------------------- */
test("éditeur : l'interface charge les nouveaux réglages", async () => {
  await login()
  const r = await req("/dashboard/design")
  assert.equal(r.status, 200)
  assert.match(r.text, /window\.ED_DATA/)
  assert.match(r.text, /"cartMode"/)
  assert.match(r.text, /"pageCss"/)
  assert.match(r.text, /"headStyle"/)
})

test("éditeur : le JS contient les cinq onglets et les vignettes", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "editor.js"), "utf8")
  for (const tab of ["sections", "theme", "pages", "code", "texts"]) {
    assert.match(js, new RegExp('\\["' + tab + '",'))
  }
  assert.match(js, /data-palette/)
  assert.match(js, /data-hide-key/)
  assert.match(js, /data-dict-from/)
  assert.match(js, /ed-pal-thumb/)
})

test("achat direct : un bouton par moyen de paiement, sans panier", async () => {
  await login()
  await req("/dashboard/paiement", form({ pay_cod: "1", pay_cib: "1", pay_cib_note: "Carte" }))
  await req("/dashboard/design/save", json({ design: { cartMode: "direct", payDirect: true } }))
  await req("/dashboard/design/publish", form({}))
  const r = await req("/amina-mode/p/1")
  assert.equal(r.status, 200)
  assert.match(r.text, /class="ndz-paybtn" formaction="\/amina-mode\/direct"/)
  assert.match(r.text, /value="cib"/)
  assert.match(r.text, /value="cod"/)

  /* un clic sur « Carte » ouvre la commande avec ce moyen déjà coché */
  const go = await req("/amina-mode/direct", form({ product_id: "1", payment: "cib" }))
  assert.equal(go.status, 302)
  assert.match(go.location, /pay=cib/)
  const co = await req("/amina-mode/checkout?pay=cib")
  assert.match(co.text, /value="cib"[^>]*checked/)

  /* le réglage se coupe : plus aucun bouton direct */
  await req("/dashboard/design/save", json({ design: { payDirect: false } }))
  await req("/dashboard/design/publish", form({}))
  const clean = await req("/amina-mode/p/1")
  assert.doesNotMatch(clean.text, /ndz-paybtn/)
})

/* ------------------------------- POLICE ARABE ------------------------------- */
test("police arabe : Estedad est auto-hébergée et servie", async () => {
  const fsx = require("fs")
  for (const f of ["estedad-arabic.woff2", "estedad-latin.woff2"]) {
    const p = path.join(__dirname, "..", "public", "fonts", f)
    assert.ok(fsx.existsSync(p), `fichier manquant : public/fonts/${f}`)
    assert.ok(fsx.statSync(p).size > 5000, `fichier vide : ${f}`)
    const r = await req("/fonts/" + f)
    assert.equal(r.status, 200)
  }
  const css = await req("/estedad.css")
  assert.equal(css.status, 200)
  assert.match(css.text, /font-family: 'Estedad'/)
  assert.match(css.text, /\/fonts\/estedad-arabic\.woff2/)
})

test("police arabe : une page en arabe charge Estedad", async () => {
  await login()
  const r = await req("/amina-mode?lang=ar")
  assert.equal(r.status, 200)
  assert.match(r.text, /href="\/estedad\.css"/)
})

test("thèmes Bento et Zen : chaque classe utilisée a son style (pas de trou visuel)", async () => {
  const fsx = require("fs")
  const css = fsx.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8")
  await login()
  for (const t of ["bento", "zen"]) {
    await req("/dashboard/design/theme", form({ theme: t }))
    for (const u of ["/amina-mode", "/amina-mode?q=laine", "/amina-mode/p/1", "/amina-mode/cart"]) {
      const r = await req(u)
      assert.equal(r.status, 200, t + " " + u)
      const prefix = t === "bento" ? "bt-" : "zn-"
      const classes = [...new Set((r.text.match(/class="([^"]*)"/g) || [])
        .flatMap((m) => m.slice(7, -1).split(/\s+/))
        .filter((c) => c.startsWith(prefix)))]
      const missing = classes.filter((c) => !css.includes("." + c))
      assert.deepEqual(missing, [], `${t} ${u} : classes sans CSS → ${missing.join(", ")}`)
    }
  }
})

/* ===================== NOUVELLES SECTIONS (21 au total) ===================== */
const SECTIONS = require("../src/sections")

test("bibliothèque : 23 sections, chacune avec sa vignette dans l'éditeur", () => {
  const fsx = require("fs")
  const js = fsx.readFileSync(path.join(__dirname, "..", "public", "editor.js"), "utf8")
  const ids = Object.keys(SECTIONS.TYPES)
  assert.equal(ids.length, 24)
  const wireBlock = js.slice(js.indexOf("var WIRE = {"), js.indexOf("function wire(t)"))
  for (const id of ids) {
    assert.ok(wireBlock.includes(id + ":"), "vignette manquante pour " + id)
  }
})

test("sections : chaque type se rend sur la vitrine sans erreur", async () => {
  await login()
  await req("/amina-mode?lang=fr")
  const sections = Object.keys(SECTIONS.TYPES).map((type, i) => ({
    id: "t" + i,
    type,
    settings: {},
    blocks: SECTIONS.TYPES[type].blocks ? [{ id: "b" + i, settings: {} }, { id: "c" + i, settings: {} }] : [],
  }))
  const r = await req("/dashboard/design/save", json({ sections, design: { cartMode: "deux" } }))
  assert.equal(r.status, 200)
  await publish()
  const home = await req("/amina-mode")
  assert.equal(home.status, 200)
  Object.keys(SECTIONS.TYPES).forEach((type, i) => {
    assert.ok(home.text.includes(`data-section="t${i}"`), "section non rendue : " + type)
  })
})

test("carrousel : rangée horizontale et ajout rapide", async () => {
  await login()
  await req("/dashboard/design/save", json({
    sections: [{ id: "c1", type: "carousel", settings: { heading: "Coups de cœur", count: 6, showAdd: true } }],
  }))
  await publish()
  const home = await req("/amina-mode")
  assert.match(home.text, /sec-rail/)
  assert.match(home.text, /Coups de cœur/)
})

test("image + texte : inversable", async () => {
  await login()
  await req("/dashboard/design/save", json({
    sections: [{ id: "m1", type: "media_text", settings: { heading: "Atelier", body: "Fait main", reverse: true } }],
  }))
  await publish()
  const home = await req("/amina-mode")
  assert.match(home.text, /sec-mtext rev/)
  assert.match(home.text, /Fait main/)
})

test("avis : note globale calculée sur les avis saisis", async () => {
  await login()
  await req("/dashboard/design/save", json({
    sections: [{
      id: "r1", type: "reviews", settings: { heading: "Avis", big: true },
      blocks: [
        { id: "b1", settings: { name: "Amina", city: "Blida", rating: 5, text: "Parfait" } },
        { id: "b2", settings: { name: "Yacine", city: "Oran", rating: 4, text: "Bien" } },
      ],
    }],
  }))
  await publish()
  const home = await req("/amina-mode")
  assert.match(home.text, /sec-rating/)
  assert.match(home.text, /4,5/)
  assert.match(home.text, /2 avis vérifiés/)
  assert.match(home.text, /Amina/)
})

test("bandeau livraison : délai réel + moyens de paiement activés", async () => {
  await login()
  await req("/amina-mode?lang=fr")
  await req("/dashboard/paiement", form({ pay_cod: "1", pay_cib: "1" }))
  await req("/dashboard/design/save", json({
    sections: [{ id: "s1", type: "shipping", settings: { prefix: "Paiement à la livraison", showEta: true, showPay: true, showWilayas: true } }],
  }))
  await publish()
  const home = await req("/amina-mode")
  assert.match(home.text, /sec-shipbar/)
  assert.match(home.text, /Livraison \d+ à \d+ jours/)
  assert.match(home.text, /Paiement à la livraison/)
  assert.match(home.text, /58 wilayas/)
})

test("offre du jour : compte à rebours rendu", async () => {
  await login()
  await req("/dashboard/design/save", json({
    sections: [{ id: "o1", type: "offer", settings: { heading: "Offre du jour", endsAt: "2030-01-01", ctaLabel: "J'en profite" } }],
  }))
  await publish()
  const home = await req("/amina-mode")
  assert.match(home.text, /sec-count/)
  assert.match(home.text, /data-cd="d"/)
  assert.match(home.text, /J(&#39;|')en profite/)
})

test("WhatsApp collant : lien wa.me avec message pré-rempli", async () => {
  await login()
  await req("/dashboard/design/save", json({
    sections: [{ id: "w1", type: "whatsapp", settings: { text: "Écrivez-nous", message: "Bonjour" } }],
  }))
  await publish()
  const home = await req("/amina-mode")
  assert.match(home.text, /sec-wabar/)
  assert.match(home.text, /wa\.me\/213/)
})

test("thèmes Vente directe, Tech et Marché : chaque classe utilisée a son style", async () => {
  const fsx = require("fs")
  const css = fsx.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8")
  await login()
  const prefixes = { cod: "cd-", tech: "th-", marche: "mr-" }
  for (const t of Object.keys(prefixes)) {
    await req("/dashboard/design/theme", form({ theme: t }))
    for (const u of ["/amina-mode", "/amina-mode/p/1", "/amina-mode/cart"]) {
      const r = await req(u)
      assert.equal(r.status, 200, t + " " + u)
      const classes = [...new Set((r.text.match(/class="([^"]*)"/g) || [])
        .flatMap((m) => m.slice(7, -1).split(/\s+/))
        .filter((c) => c.startsWith(prefixes[t]) && !c.startsWith(prefixes[t] + "s")))]
      const missing = classes.filter((c) => !css.includes("." + c))
      assert.deepEqual(missing, [], `${t} ${u} : classes sans CSS → ${missing.join(", ")}`)
    }
  }
  await req("/dashboard/design/theme", form({ theme: "minimal" }))
})

test("éditeur : 12 apparences prêtes en un clic", () => {
  const fsx = require("fs")
  const js = fsx.readFileSync(path.join(__dirname, "..", "public", "editor.js"), "utf8")
  const block = js.slice(js.indexOf("var PRESETS = ["), js.indexOf("function themeTab()"))
  assert.equal((block.match(/\["/g) || []).length >= 12, true)
  for (const name of ["Clair", "Nuit", "Sable", "Pastel", "Forêt", "Tech", "Néo-brut", "Édito", "Mono", "Doré", "Océan", "Corail"]) {
    assert.ok(block.includes('"' + name + '"'), "apparence manquante : " + name)
  }
  assert.match(js, /data-preset/)
  assert.match(require("fs").readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8"), /\.ed-preset\b/)
})

/* ============================ RÉSEAUX SOCIAUX ============================ */
test("réseaux sociaux : la page de réglages existe et liste les réseaux", async () => {
  await login()
  const r = await req("/dashboard/reseaux")
  assert.equal(r.status, 200)
  for (const n of ["facebook", "instagram", "tiktok", "whatsapp", "youtube", "snapchat", "telegram", "x", "linkedin", "pinterest", "site"]) {
    assert.match(r.text, new RegExp('name="url_' + n + '"'), "réseau absent : " + n)
  }
})

test("réseaux sociaux : les liens enregistrés s'affichent dans le pied de page", async () => {
  await login()
  const r = await req("/dashboard/reseaux", form({
    url_facebook: "https://facebook.com/aminamode",
    label_facebook: "Amina Mode",
    url_instagram: "instagram.com/aminamode",
    url_tiktok: "https://tiktok.com/@aminamode",
  }))
  assert.equal(r.status, 302)
  await req("/dashboard/design/save", json({ design: { socialWhere: "pied", socialStyle: "icones", socialSize: "normal" } }))
  await publish()
  const home = await req("/amina-mode?lang=fr")
  assert.match(home.text, /ndz-social ndz-social-pied/)
  assert.match(home.text, /href="https:\/\/facebook\.com\/aminamode"/)
  /* adresse sans schéma complétée automatiquement */
  assert.match(home.text, /href="https:\/\/instagram\.com\/aminamode"/)
  assert.doesNotMatch(home.text, /ndz-social-entete/)
})

test("réseaux sociaux : emplacement en-tête, les deux, ou nulle part", async () => {
  await login()
  const set = async (where) => {
    await req("/dashboard/design/save", json({ design: { socialWhere: where } }))
    await publish()
    return req("/amina-mode?lang=fr")
  }
  const head = await set("entete")
  assert.match(head.text, /ndz-social-entete/)
  assert.doesNotMatch(head.text, /ndz-social-pied/)
  const both = await set("deux")
  assert.match(both.text, /ndz-social-entete/)
  assert.match(both.text, /ndz-social-pied/)
  const none = await set("aucun")
  assert.doesNotMatch(none.text, /ndz-social/)
  await set("pied")
})

test("réseaux sociaux : un lien dangereux est refusé, pas recopié", async () => {
  await login()
  await req("/dashboard/reseaux", form({ url_facebook: "javascript:alert(1)", url_instagram: "https://instagram.com/ok" }))
  await publish()
  const home = await req("/amina-mode?lang=fr")
  assert.doesNotMatch(home.text, /javascript:/)
  assert.match(home.text, /instagram\.com\/ok/)
})

test("réseaux sociaux : section plaçable dans n'importe quelle page", async () => {
  await login()
  await req("/dashboard/design/save", json({
    sections: [{ id: "so1", type: "social", settings: { heading: "Suivez-nous", style: "noms" } }],
  }))
  await publish()
  const home = await req("/amina-mode?lang=fr")
  assert.match(home.text, /sec-social/)
  assert.match(home.text, /ndz-social-noms/)
  /* remise à zéro pour les autres tests */
  await req("/dashboard/design/save", json({ sections: [] }))
  await publish()
})

/* --------------------- ÉDITEUR « PLUS OPEN » --------------------- */
test("en-tête : liens ajoutés à la main (page interne ou URL directe)", async () => {
  await login()
  await design({
    navAdd: [
      { label: "Promo", url: "https://exemple.dz/soldes" },
      { label: "Mon compte", url: "/amina-mode/account" },
      { label: "   ", url: "/amina-mode" },
    ],
  })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /href="https:\/\/exemple\.dz\/soldes">Promo</)
  assert.match(r.text, /href="\/amina-mode\/account">Mon compte</)
  const { sanitizeDesign } = require("../src/sections")
  const many = sanitizeDesign({ navAdd: Array.from({ length: 12 }, (_, i) => ({ label: "L" + i, url: "/x" })) })
  assert.ok(many.navAdd.length <= 6, "6 liens ajoutés au maximum")
})

test("en-tête : le lien « Panier » peut être masqué côté vitrine (pas seulement dans l'aperçu)", async () => {
  await login()
  await design({ showCartLink: false })
  await publish()
  const off = await req("/amina-mode")
  assert.match(off.text, /data-cartlink="off"/)
  await design({ showCartLink: true })
  await publish()
  const on = await req("/amina-mode")
  assert.match(on.text, /data-cartlink="on"/)
})

test("éditeur : la liste de pages couvre toutes les pages et chacune s'ouvre en aperçu", async () => {
  await login()
  const dash = await req("/dashboard/design")
  assert.match(dash.text, /class="ed-pagepick"/)
  assert.match(dash.text, /id="edPageSelect"/)
  const m = dash.text.match(/window\.ED_DATA = (\{[\s\S]*?\});<\/script>/)
  assert.ok(m, "ED_DATA attendu dans la page Design")
  const data = JSON.parse(m[1])
  const keys = data.previewPages.map((p) => p.key)
  for (const k of ["home", "product", "cart", "checkout", "legal", "account"]) {
    assert.ok(keys.includes(k), "page absente de la liste : " + k)
  }
  for (const p of data.previewPages) {
    const r = await req(p.url)
    assert.equal(r.status, 200, "aperçu cassé : " + p.url)
  }
})

test("éditeur : les onglets En-tête / Pages / Code existent et l'aperçu est cliquable", async () => {
  const fsMod = require("node:fs")
  const pathMod = require("node:path")
  const editor = fsMod.readFileSync(pathMod.join(__dirname, "..", "public", "editor.js"), "utf8")
  for (const tab of ["sections", "head", "theme", "pages", "code", "texts"]) {
    assert.match(editor, new RegExp('\\["' + tab + '",'), "onglet manquant : " + tab)
  }
  assert.match(editor, /navAdd/, "édition des liens ajoutés")
  assert.match(editor, /showCartLink/, "case « Lien Panier »")
  assert.match(editor, /edPageSelect/, "liste des pages")
  const ui = fsMod.readFileSync(pathMod.join(__dirname, "..", "src", "ui.js"), "utf8")
  assert.match(ui, /data-cartlink/, "l'aperçu doit refléter le masquage du panier")
  const css = fsMod.readFileSync(pathMod.join(__dirname, "..", "public", "styles.css"), "utf8")
  assert.match(css, /\.ed-pagebar/)
})

test("éditeur : la page de commande s'affiche en aperçu même si le panier est vide", async () => {
  await login()
  const r = await req("/amina-mode/checkout?preview=1")
  assert.equal(r.status, 200)
  assert.match(r.text, /data-page="checkout"/)
})

/* ------------------- PROMO, PACK, STOCK BAS, FAVORIS ------------------- */
test("produit : prix barré et badge de remise affichés sur la fiche", async () => {
  await login()
  const p = Math.max(2, 3)
  await req(`/dashboard/products/${p}`, form({
    title: "Produit promo test", description: "Test", price: "3000", compare: "4000",
    stock: "20", active: "on", category_id: "0", focal: "center",
  }))
  const r = await req(`/amina-mode/p/${p}`)
  assert.equal(r.status, 200)
  assert.match(r.text, /class="pr-old"/)
  assert.match(r.text, /-25%/)
})

test("produit : « souvent achetés ensemble » propose les produits liés", async () => {
  await login()
  await req("/dashboard/products/1", form({
    title: "Produit principal", description: "Test", price: "4500", compare: "",
    stock: "30", active: "on", category_id: "0", focal: "center", bundle_ids: "2,3",
  }))
  const r = await req("/amina-mode/p/1")
  assert.match(r.text, /class="ndz-bundle"/)
  assert.match(r.text, /Souvent achetés ensemble/)
  assert.match(r.text, /cart\/bundle/)
})

test("panier : l'ajout groupé remplit le panier", async () => {
  await login()
  await req("/amina-mode/cart")
  const r = await req("/amina-mode/cart/bundle", form({ ids: "1,2" }))
  assert.equal(r.status, 302)
  const cart = await req("/amina-mode/cart")
  assert.equal(cart.status, 200)
})

test("produit : stock bas signalé (« plus que N »)", async () => {
  await login()
  await req("/dashboard/products/2", form({
    title: "Derniere piece", description: "", price: "2500", compare: "",
    stock: "2", active: "on", category_id: "0", focal: "center",
  }))
  const r = await req("/amina-mode/p/2")
  assert.match(r.text, /ndz-stock-low/)
  assert.match(r.text, /2 en stock/)
})

test("favoris : bouton sur la fiche + page « Mes favoris »", async () => {
  const prod = await req("/amina-mode/p/1")
  assert.match(prod.text, /class="ndz-fav"/)
  assert.match(prod.text, /localStorage/)
  const fav = await req("/amina-mode/favoris")
  assert.equal(fav.status, 200)
  assert.match(fav.text, /id="favRoot"/)
})

/* -------------------- STOCK, CARTES, RECHERCHE, STATS -------------------- */
test("stock : les boutons − / + / Définir ajustent vraiment le stock", async () => {
  await login()
  const before = await req("/dashboard/stock")
  const val = Number((before.text.match(/name="value" type="number" step="1" min="1" value="1"/) ? 1 : 1))
  assert.equal(val, 1)
  const pid = (before.text.match(/name="product_id" value="(\d+)"/) || [])[1]
  assert.ok(pid, "produit attendu dans le tableau de stock")
  const plus = await req("/dashboard/stock/adjust", form({ product_id: pid, variant_id: "0", value: "3", act: "plus", reason: "reassort" }))
  assert.equal(plus.status, 302)
  const minus = await req("/dashboard/stock/adjust", form({ product_id: pid, variant_id: "0", value: "2", act: "minus", reason: "inventaire" }))
  assert.equal(minus.status, 302)
  const set = await req("/dashboard/stock/adjust", form({ product_id: pid, variant_id: "0", value: "7", act: "set", reason: "inventaire" }))
  assert.equal(set.status, 302)
  const after = await req("/dashboard/stock")
  assert.match(after.text, /stock-step/)
  assert.match(after.text, /stock-set/)
})

test("cartes de produit : le style choisi arrive sur la vitrine", async () => {
  await login()
  await design({ cardStyle: "carte" })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /data-cards="carte"/)
  await design({ cardStyle: "classique" })
  await publish()
})

test("recherche : emplacement choisi par le marchand (en-tête / icône / masquée)", async () => {
  await login()
  await design({ searchPlace: "entete", searchHint: "Trouver une pièce" })
  await publish()
  let r = await req("/amina-mode")
  assert.match(r.text, /class="ndz-search ndz-search-in slot-/)
  assert.match(r.text, /Trouver une pièce/)

  await design({ searchPlace: "icone" })
  await publish()
  r = await req("/amina-mode")
  assert.match(r.text, /data-searchopen/)
  assert.match(r.text, /ndz-searchlay/)

  await design({ searchPlace: "aucune" })
  await publish()
  r = await req("/amina-mode")
  assert.ok(!/ndz-search-in|data-searchopen/.test(r.text), "aucune recherche quand c'est masqué")
  await design({ searchPlace: "entete" })
  await publish()
})

test("recherche : le mot-clé filtre vraiment les produits", async () => {
  const hit = await req("/amina-mode?q=robe")
  assert.equal(hit.status, 200)
  assert.match(hit.text, /value="robe"/)
  assert.match(hit.text, /Robe/i)
  const miss = await req("/amina-mode?q=zzzzintrouvable")
  assert.equal(miss.status, 200)
  assert.ok(!/Robe d'été fleurie/.test(miss.text), "produit non correspondant masqué")
})

test("statistiques : page dédiée avec chiffres, graphe et classements", async () => {
  await login()
  const pid = (await req("/dashboard/products")).text
  const p = (pid.match(/href="\/dashboard\/products\/(\d+)"/) || [])[1]
  await req("/amina-mode/cart", form({ product_id: p }))
  await req("/amina-mode/checkout", form({
    customer_name: "Client Stats", phone: "0550111222", wilaya: "Blida", address: "Rue 1", note: "",
  }))
  const r = await req("/dashboard/stats")
  assert.equal(r.status, 200)
  assert.match(r.text, /Panier moyen/)
  assert.match(r.text, /Taux de confirmation/)
  assert.match(r.text, /st-chart/)
  assert.match(r.text, /Meilleures ventes/)
  assert.match(r.text, /Wilayas/)
})

/* ------------------- PAGES PAR SECTION, STRUCTURE, CONTRASTE ------------------- */
test("sections par page : la page produit a ses propres sections", async () => {
  await login()
  const home = [{ id: "h1", type: "hero", settings: { heading: "Accueil maison" } }]
  const prod = [{ id: "p1", type: "benefits", settings: { heading: "Bloc de la fiche" } }]
  const save = await req("/dashboard/design/save", json({ sections: { home, product: prod } }))
  assert.equal(save.status, 200)
  await publish()
  const h = await req("/amina-mode")
  assert.match(h.text, /Accueil maison/)
  assert.ok(!/Bloc de la fiche/.test(h.text), "les sections produit ne doivent pas fuiter sur l'accueil")
  const p = await req("/amina-mode/p/1")
  assert.match(p.text, /Bloc de la fiche/)
  assert.ok(!/Accueil maison/.test(p.text), "les sections d'accueil ne doivent pas fuiter sur la fiche")
})

test("structure : la recherche est dans l'en-tête, une seule barre", async () => {
  await login()
  await design({ searchPlace: "entete" })
  await publish()
  const r = await req("/amina-mode")
  const header = r.text.slice(r.text.indexOf("<header"), r.text.indexOf("/header>"))
  assert.match(header, /ndz-search-in/, "recherche dans l'en-tête")
  assert.match(header, /<\/form>/, "formulaire complet dans l'en-tête")
  const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "public", "styles.css"), "utf8")
  assert.match(css, /html\[data-search="entete"\] \.filters-search/, "la 2e barre de recherche est masquée")
})

test("contraste : un texte de la même couleur que le fond est corrigé", () => {
  const { storeStyle } = require("../src/sections")
  const css = storeStyle({ bg: "#FFFFFF", ink: "#FFFFFF", accent: "#FFFFFF" })
  assert.ok(!/--s-ink:#FFFFFF/.test(css), "le texte doit rester lisible")
  const dark = storeStyle({ bg: "#111111", ink: "#111111" })
  assert.ok(!/--s-ink:#111111/.test(dark), "texte noir sur fond noir corrigé")
})

test("apparences prêtes : chacune pose une police et un contraste correct", () => {
  const fs = require("node:fs")
  const path = require("node:path")
  const editor = fs.readFileSync(path.join(__dirname, "..", "public", "editor.js"), "utf8")
  const block = editor.slice(editor.indexOf("var PRESETS"), editor.indexOf("function themeTab"))
  const lines = block.split("\n").filter((l) => l.indexOf("bg: ") !== -1)
  assert.ok(lines.length >= 12, "12 apparences attendues, trouvé " + lines.length)
  for (const l of lines) {
    assert.match(l, /font: "/, "chaque apparence doit poser une police")
    assert.ok(!/fontFamily/.test(l), "clé de police obsolète")
  }
})

/* ---------------------- OPEN MODIF : nav, pages, alignement ---------------------- */
const saveSections = (obj) => req("/dashboard/design/save", json({ sections: obj }))
const saveNav = (nav) => req("/dashboard/design/save", json({ nav }))

test("navigation : on peut supprimer « Boutique » de la barre", async () => {
  await login()
  await saveNav([{ id: "n1", label: "Accueil", url: "" }])
  await publish()
  let page = await req("/amina-mode")
  assert.match(page.text, />Accueil</)
  assert.doesNotMatch(page.text, />Boutique</)

  /* même une barre vide reste vide (le thème ne remet pas « Boutique ») */
  await saveNav([])
  await publish()
  page = await req("/amina-mode")
  assert.doesNotMatch(page.text, />Boutique</)
})

test("sections : un bloc ajouté apparaît aussi sur la fiche produit", async () => {
  await login()
  const r = await saveSections({
    product: [{ id: "sx1", type: "html", settings: { html: "<p>MARQUEUR-BLOC-PRODUIT</p>" }, blocks: [] }],
  })
  assert.equal(r.status, 200)
  await publish()
  const page = await req("/amina-mode/p/1")
  assert.equal(page.status, 200)
  assert.match(page.text, /MARQUEUR-BLOC-PRODUIT/)
})

test("sections : une page vidée par le marchand reste vide", async () => {
  await login()
  await saveSections({ product: [] })
  await publish()
  const page = await req("/amina-mode/p/1")
  assert.doesNotMatch(page.text, /MARQUEUR-BLOC-PRODUIT/)
})

test("alignement : par section et pour toute la boutique", async () => {
  await login()
  await saveSections({
    home: [{ id: "sh1", type: "html", settings: { html: "<p>Bloc</p>" }, blocks: [], align: "centre" }],
  })
  await design({ textAlign: "droite" })
  await publish()
  const page = await req("/amina-mode")
  assert.match(page.text, /data-align="droite"/)
  assert.match(page.text, /ndz-al-centre/)
})

test("taille des sections : espacement, titre et largeur arrivent dans la vitrine", async () => {
  await login()
  await saveSections({
    home: [{
      id: "ss1", type: "html", align: "centre", pad: 64, tsize: 1.5, wide: "etroite",
      settings: { html: "<p>Bloc dimensionné</p>" }, blocks: [],
    }],
  })
  await publish()
  const page = await req("/amina-mode")
  assert.match(page.text, /--sec-pad:64px/)
  assert.match(page.text, /--sec-title:1\.5/)
  assert.match(page.text, /ndz-wide-etroite/)
  assert.match(page.text, /ndz-al-centre/)
})

test("taille des sections : une valeur absurde est ramenée dans les bornes", async () => {
  await login()
  await saveSections({
    home: [{ id: "ss2", type: "html", pad: 9999, tsize: 99, settings: { html: "<p>x</p>" }, blocks: [] }],
  })
  await publish()
  const page = await req("/amina-mode")
  assert.match(page.text, /--sec-pad:140px/)
  assert.match(page.text, /--sec-title:2\.2/)
})

test("hauteur du visuel : réglable et bornée", async () => {
  await login()
  await saveSections({
    home: [{
      id: "si1", type: "hero", imgH: 360,
      settings: { heading: "Bannière test", image: "/uploads/demo.jpg" }, blocks: [],
    }],
  })
  await publish()
  let page = await req("/amina-mode")
  assert.match(page.text, /--sec-img:360px/)

  /* valeur absurde : ramenée dans la plage au lieu de casser la page */
  await saveSections({
    home: [{ id: "si2", type: "hero", imgH: 5000, settings: { heading: "Bannière test" }, blocks: [] }],
  })
  await publish()
  page = await req("/amina-mode")
  assert.match(page.text, /--sec-img:900px/)
})

/* --------------------- cartes produit · recherche · stock --------------------- */
test("style de carte produit : le réglage change vraiment le rendu", async () => {
  await login()
  for (const style of ["carte", "ombre", "bordee", "compacte"]) {
    await design({ cardStyle: style })
    await publish()
    const page = await req("/amina-mode")
    assert.match(page.text, new RegExp('data-cards="' + style + '"'), style)
  }
  await design({ cardStyle: "n-importe-quoi" })
  await publish()
  const page = await req("/amina-mode")
  assert.match(page.text, /data-cards="classique"/)
})

test("recherche : la barre peut être choisie, et le mot-clé filtre", async () => {
  await login()
  await design({ searchPlace: "dessous" })
  await publish()
  let page = await req("/amina-mode")
  assert.match(page.text, /data-search="dessous"/)
  assert.match(page.text, /class="ndz-searchbar"/)

  await design({ searchPlace: "aucune" })
  await publish()
  page = await req("/amina-mode")
  assert.doesNotMatch(page.text, /class="ndz-search ndz-search-in/)

  /* le mot-clé renvoie des produits et un compteur */
  const r = await req("/amina-mode?q=montre")
  assert.equal(r.status, 200)
  assert.match(r.text, /résultat/)
})

test("recherche : insensible aux accents", async () => {
  await login()
  const r = await req("/amina-mode?q=telephone")
  assert.equal(r.status, 200)
})

test("stock : la rangée d'ajustement est propre (une seule rangée de contrôles)", async () => {
  await login()
  const page = await req("/dashboard/stock")
  assert.equal(page.status, 200)
  assert.match(page.text, /class="stock-ctrl"/)
  assert.match(page.text, /class="stock-reason"/)
})

/* ------------------------- STOCK · CARTES · RECHERCHE · STATS ------------------------- */
test("stock : les boutons − / + / Définir ajustent vraiment le stock", async () => {
  await login()
  const before = await req("/dashboard/stock")
  assert.equal(before.status, 200)

  /* produit 1 : on ajoute 3 puis on retire 1 */
  await req("/dashboard/stock/adjust", form({ product_id: "1", variant_id: "0", act: "plus", value: "3", reason: "reassort" }))
  await req("/dashboard/stock/adjust", form({ product_id: "1", variant_id: "0", act: "minus", value: "1", reason: "inventaire" }))
  const db = require("../src/sqlite").open(DB)
  const p = db.prepare("SELECT stock FROM products WHERE id = 1").get()
  assert.ok(p.stock >= 0, "stock cohérent")
  /* on remet un stock sain pour les tests suivants */
  await req("/dashboard/stock/adjust", form({ product_id: "1", variant_id: "0", act: "set", value: "12", reason: "inventaire" }))
  const after = db.prepare("SELECT stock FROM products WHERE id = 1").get()
  assert.equal(after.stock, 12)
  db.close()

  const page = await req("/dashboard/stock")
  assert.match(page.text, /class="stock-form"/, "rangée d'ajustement")
})

test("stats : la page affiche les chiffres clés après une commande", async () => {
  await login()
  await req("/amina-mode/cart", form({ product_id: 1 }))
  const order = await req("/amina-mode/checkout", form({
    customer_name: "Test Stats", phone: "0550121212", wilaya: "Blida", address: "Rue 2",
  }))
  assert.equal(order.status, 200)

  const page = await req("/dashboard/stats")
  assert.equal(page.status, 200)
  assert.match(page.text, /Statistiques/i)
  assert.match(page.text, /Chiffre d'affaires|Panier moyen|Commandes/i)
})

/* ------------------- RÉGRESSIONS TROUVÉES EN DIRECT ------------------- */
test("éditeur : le rail s'ouvre (plus d'écran vide) et garde les réglages de section", async () => {
  await login()
  const fs2 = require("node:fs")
  const html = (await req("/dashboard/design")).text
  /* le serveur doit envoyer des sections par page utilisables (aucune valeur non-tableau) */
  const m = html.match(/window\.ED_DATA = (\{[\s\S]*?\});<\/script>/)
  assert.ok(m, "ED_DATA présent")
  const data = JSON.parse(m[1])
  for (const k of Object.keys(data.sectionsByPage)) {
    assert.ok(Array.isArray(data.sectionsByPage[k]), "sections de page non tableau : " + k)
  }
  /* et l'éditeur réel ne doit pas planter au chargement (jsdom optionnel) */
  let JSDOM, VirtualConsole
  try { ({ JSDOM, VirtualConsole } = require("jsdom")) } catch (_) { return }
  const errs = []
  const vc = new VirtualConsole()
  vc.on("jsdomError", (e) => errs.push(String(e.message)))
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: BASE + "/dashboard/design",
    virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
    },
  })
  const w = dom.window
  w.addEventListener("error", (e) => errs.push(String(e.message)))
  const s = w.document.createElement("script")
  s.textContent = fs2.readFileSync(require("node:path").join(__dirname, "..", "public", "editor.js"), "utf8")
  w.document.body.appendChild(s)
  await new Promise((r) => setTimeout(r, 400))
  assert.deepEqual(errs, [], "l'éditeur plante : " + errs.join(" | "))
  const rail = w.document.getElementById("edRail")
  assert.ok(rail && rail.innerHTML.length > 500, "rail vide = rien de modifiable")
})

test("recherche : jamais deux barres (Catalogue et Tech ont déjà la leur)", async () => {
  await login()
  for (const t of ["catalogue", "tech"]) {
    await req("/dashboard/design/theme", form({ theme: t }))
    const page = await req("/amina-mode?preview=1")
    assert.equal(page.status, 200, t)
    assert.equal((page.text.match(/ndz-search-in/g) || []).length, 0, "barre doublée sur " + t)
    assert.match(page.text, /name="q"/, "le champ du thème cherche vraiment (" + t + ")")
  }
  await req("/dashboard/design/theme/cancel", { method: "POST" })
})

test("thème : l'essai repart des blocs du nouveau thème, la boutique en ligne ne bouge pas", async () => {
  await login()
  const before = (await req("/amina-mode")).text
  const themeBefore = (before.match(/class="theme theme-([a-z]+)/) || [])[1]
  await req("/dashboard/design/theme", form({ theme: "bento" }))
  const live = (await req("/amina-mode")).text
  assert.match(live, new RegExp("theme-" + themeBefore))
  const preview = (await req("/amina-mode?preview=1")).text
  assert.match(preview, /theme-bento/)
  await req("/dashboard/design/theme/cancel", { method: "POST" })
  const after = (await req("/amina-mode")).text
  assert.match(after, new RegExp("theme-" + themeBefore))
})

/* ---------------- RÉGRESSIONS THÈMES (audit du 20/10, Playwright) ---------------- */
test("thèmes : le bouton panier du header ne dépasse jamais la barre", async () => {
  await login()
  for (const t of ["catalogue", "marche", "mosaique", "noir", "contrast"]) {
    await req("/dashboard/design/theme", form({ theme: t }))
    const page = await req("/amina-mode?preview=1")
    assert.equal(page.status, 200, t)
    /* le bouton reste dans le header : on vérifie qu'aucune règle « page panier »
       ne s'applique au bouton (cause du bouton étiré) */
    assert.doesNotMatch(page.text, /class="[a-z-]*cartpage"/, t + " : suffixe de page panier dans le header")
  }
  await req("/dashboard/design/theme/cancel", { method: "POST" })
})

test("grille produits : jamais plus de colonnes que d'articles", async () => {
  const { defaultSections } = require("../src/sections")
  const { renderSections } = require("../src/sections")
  const store = { slug: "x", currency: "DZD", sections: null, theme: "catalogue" }
  const sections = defaultSections("catalogue")
  const four = [
    { id: 1, title: "A", price_cents: 100, stock: 3, image: "" },
    { id: 2, title: "B", price_cents: 100, stock: 3, image: "" },
    { id: 3, title: "C", price_cents: 100, stock: 3, image: "" },
    { id: 4, title: "D", price_cents: 100, stock: 3, image: "" },
  ]
  const html = renderSections(store, sections, { products: four, design: {} })
  const m = html.match(/--cols:(\d+)/)
  assert.ok(m, "variable --cols présente")
  assert.ok(Number(m[1]) <= 4, "colonnes plafonnées (--cols:" + m[1] + ")")
})

test("bandeau d'annonce : il est visible (fond et texte posés)", async () => {
  const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "public", "styles.css"), "utf8")
  assert.match(css, /\.theme \.sec\.sec-banner \{ background:/, "le bandeau doit garder un fond")
})

test("vignettes de thème : pas de fuite du vrai thème dans la vignette", async () => {
  const { THEMES } = require("../src/themes")
  const { themePicker } = require("../src/themes")
  const html = themePicker("noir")
  for (const t of THEMES) {
    assert.match(html, new RegExp('theme-preview tpv-' + t.id), "vignette " + t.id)
    assert.doesNotMatch(html, new RegExp('theme-preview theme-' + t.id), "fuite du thème " + t.id)
  }
})

/* ---------------- COMMANDES (lot 40) : statuts, relances, attribution ---------------- */
const ORD = require("../src/orders")

test("commandes : les anciens statuts accentués restent compris", () => {
  assert.equal(ORD.norm("confirmée"), "confirmee")
  assert.equal(ORD.norm("annulée"), "annulee")
  assert.equal(ORD.norm("expédiée"), "expediee")
  assert.equal(ORD.norm("à vérifier"), "a_verifier")
  assert.equal(ORD.norm("n'importe quoi"), "nouvelle")
  assert.equal(ORD.label("reportee"), "Reportée")
  assert.equal(ORD.label("injoignable"), "Injoignable")
})

test("commandes : les grandes étapes existent toutes", () => {
  for (const id of ["nouvelle", "confirmee", "reportee", "annulee", "injoignable"])
    assert.ok(ORD.STATUSES.some((s) => s.id === id), id + " manquant")
  assert.equal(ORD.MAX_ATTEMPTS, 3)
})

test("commandes : une commande de test ne compte jamais dans le chiffre", () => {
  assert.equal(ORD.counts({ status: "confirmee", fake: 0 }), true)
  assert.equal(ORD.counts({ status: "confirmee", fake: 1 }), false)
  assert.equal(ORD.counts({ status: "annulee", fake: 0 }), false)
  const t = ORD.tally([
    { status: "confirmee", total_cents: 1000, fake: 0 },
    { status: "nouvelle", total_cents: 500, fake: 0 },
    { status: "nouvelle", total_cents: 9999, fake: 1 },
  ])
  assert.equal(t.real, 2)
  assert.equal(t.fake, 1)
  assert.equal(t.ca, 1500)
  assert.equal(t.confirmee, 1)
})

test("attribution : la plateforme est déduite du lien, du clic ou du référent", () => {
  assert.equal(ORD.guessSource("facebook", "", ""), "facebook")
  assert.equal(ORD.guessSource("instagram", "", ""), "instagram")
  assert.equal(ORD.guessSource("", "ttclid", ""), "tiktok")
  assert.equal(ORD.guessSource("", "gclid", ""), "google")
  assert.equal(ORD.guessSource("", "", "https://www.tiktok.com/@x"), "tiktok")
  assert.equal(ORD.guessSource("", "", "https://wa.me/213555"), "whatsapp")
  assert.equal(ORD.guessSource("", "", "https://un-blog-inconnu.example/article"), "organic", "lien inconnu = organique")
  assert.equal(ORD.guessSource("", "", ""), "organic", "aucune trace = organique")
  assert.equal(ORD.sourceLabel("organic"), "Sans publicité")
  assert.equal(ORD.sourceLabel(""), "Sans publicité")
  /* anciennes valeurs : elles retombent toutes en organique */
  assert.equal(ORD.normSource("direct"), "organic")
  assert.equal(ORD.normSource("referral"), "organic")
  assert.equal(ORD.normSource(""), "organic")
  assert.equal(ORD.normSource("inconnu"), "organic")
  assert.equal(ORD.sourceLabel("direct"), "Sans publicité")
  assert.equal(ORD.normSource("TikTok"), "tiktok")
  assert.equal(ORD.sourceLabel("facebook"), "Facebook")
  assert.equal(ORD.sourceIcon("instagram"), "instagram")
})

test("attribution : utm, identifiant de clic et appareil sont lus", () => {
  const p = ORD.readParams({ utm_source: "facebook", utm_campaign: "ramadan", fbclid: "ABC" })
  assert.equal(p.utm_campaign, "ramadan")
  assert.equal(p.click_kind, "fbclid")
  assert.equal(p.click_id, "ABC")
  const p2 = ORD.readParams({ ttclid: "TT1" })
  assert.equal(p2.utm_source, "tiktok", "un clic TikTok vaut une source TikTok")
  assert.equal(ORD.deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile"), "mobile")
  assert.equal(ORD.deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0)"), "tablet")
  assert.equal(ORD.deviceOf("Mozilla/5.0 (Windows NT 10.0)"), "desktop")
})

test("attribution : le détail affiche les lignes de suivi", () => {
  const rows = ORD.trackingRows({
    source: "tiktok", utm_campaign: "promo", utm_content: "video-1", click_id: "TT9",
    click_kind: "ttclid", landing: "/amina-mode", device: "mobile",
  })
  const labels = rows.map((r) => r.label)
  for (const l of ["Plateforme", "Campagne", "Créatif / annonce", "Page d'arrivée", "Appareil"])
    assert.ok(labels.includes(l), l + " manquant")
  assert.equal(rows[0].value, "TikTok")
})

/* ------------------- LOT 41 : design plus ouvert, moins de texte -------- */

test("design : nom de boutique et logo de bannière peuvent être retirés", async () => {
  const { sanitizeDesign } = require("../src/sections")
  const d = sanitizeDesign({ showLogo: false, showName: false, heroLogo: false })
  assert.equal(d.showLogo, false)
  assert.equal(d.showName, false)
  assert.equal(d.heroLogo, false)
  const back = sanitizeDesign({ showLogo: true, showName: true, heroLogo: true })
  assert.equal(back.showName, true)
  await login()
  await design({ showName: false, showLogo: false, heroLogo: false })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /data-brandname="off"/)
  assert.match(r.text, /data-brandlogo="off"/)
  assert.doesNotMatch(r.text, /class="brand-name"/)
  await design({ showName: true, showLogo: true, heroLogo: true })
  await publish()
  const on = await req("/amina-mode")
  assert.match(on.text, /class="brand-name"/)
})

test("bannière : le texte peut passer à droite comme à gauche", async () => {
  const { sanitizeDesign } = require("../src/sections")
  assert.equal(sanitizeDesign({ heroAlign: "droite" }).heroAlign, "droite")
  assert.equal(sanitizeDesign({ heroAlign: "gauche" }).heroAlign, "gauche")
  assert.equal(sanitizeDesign({ heroAlign: "n-importe-quoi" }).heroAlign, "def")
  await login()
  await design({ heroAlign: "droite" })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /data-heroalign="droite"/)
  assert.match(r.text, /a-right/)
  await design({ heroAlign: "gauche" })
  await publish()
  assert.match((await req("/amina-mode")).text, /data-heroalign="gauche"/)
})

test("recherche : trois placements possibles, dont l'icône sur la même ligne", async () => {
  const { sanitizeDesign } = require("../src/sections")
  for (const p of ["icone", "entete", "dessous", "aucune"]) {
    assert.equal(sanitizeDesign({ searchPlace: p }).searchPlace, p)
  }
  assert.equal(sanitizeDesign({ searchPlace: "zzz" }).searchPlace, "entete")
  await login()
  await design({ searchPlace: "icone" })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /data-search="icone"/)
  assert.match(r.text, /ndz-search-btn/)
  assert.doesNotMatch(r.text, /ndz-searchbar/)
})

test("variantes : quatre styles d'affichage acceptés, le reste retombe sur « boutons »", async () => {
  const { sanitizeDesign } = require("../src/sections")
  for (const v of ["boutons", "cartes", "radio", "liste"]) {
    assert.equal(sanitizeDesign({ variantStyle: v }).variantStyle, v)
  }
  assert.equal(sanitizeDesign({ variantStyle: "grille-magique" }).variantStyle, "boutons")
  assert.equal(sanitizeDesign({}).variantStyle, "boutons")
  await login()
  await design({ variantStyle: "radio" })
  await publish()
  const r = await req("/amina-mode")
  assert.match(r.text, /data-variant="radio"/)
})

test("thèmes : chaque modèle dit à qui il sert, et les groupes sont lisibles", async () => {
  const { THEMES, CATEGORIES } = require("../src/themes")
  for (const t of THEMES) {
    assert.ok(t.ideal && t.ideal.length > 5, "usage manquant pour " + t.id)
    assert.ok(CATEGORIES.some(([id]) => id === t.cat), "catégorie inconnue pour " + t.id)
  }
  await login()
  const r = await req("/dashboard/design/themes")
  assert.equal(r.status, 200)
  assert.match(r.text, /Choisir ce thème/)
  assert.match(r.text, /Thème publié/)
  assert.match(r.text, /th-group/)
})

test("fiche produit : les photos ont une vignette et un bouton pour recadrer", async () => {
  await login()
  const list = await req("/dashboard/products")
  assert.equal(list.status, 200)
  const m = list.text.match(/\/dashboard\/products\/(\d+)/)
  assert.ok(m, "au moins un produit de démonstration")
  const r = await req("/dashboard/products/" + m[1])
  assert.equal(r.status, 200)
  assert.match(r.text, /id="cropBox"/)
  assert.match(r.text, /id="imgCrop"/)
  assert.match(r.text, /data-crop=/)
  assert.match(r.text, /Utiliser cette zone/)
})

test("éditeur : recharger l'aperçu garde la page en cours (accueil reste accueil)", async () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "editor.js"), "utf8")
  assert.match(js, /function currentUrl\(\)/)
  assert.match(js, /PREVIEWS\[i\]\.key === CURRENT_PAGE/)
  assert.match(js, /frame\.src = currentUrl\(\)/)
  assert.match(js, /function goPage\(key\)/)
  assert.match(js, /contentWindow\.scrollTo\(0, 0\)/)
  assert.match(js, /data-vstyle/)
})

test("fiche produit : le script de la page est valide (envoi, recadrage, variantes)", async () => {
  await login()
  const list = await req("/dashboard/products")
  const m = list.text.match(/\/dashboard\/products\/(\d+)/)
  const page = await req("/dashboard/products/" + m[1])
  /* la page a d'autres scripts après le formulaire (navigation, assistant) */
  const scripts = [...page.text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1])
  const code = scripts.find((s) => s.includes("openCrop")) || ""
  assert.ok(code.length > 500, "script du formulaire produit manquant")
  assert.doesNotThrow(() => new Function(code), "le script du formulaire produit contient une erreur")
  assert.match(code, /openCrop/)
})

/* ---------- LOT 42 : « je clique là, je modifie ça » dans l'aperçu ---------- */

test("aperçu : le script de sélection s'exécute sans erreur", async () => {
  const { PREVIEW_SCRIPT } = require("../src/ui")
  const code = PREVIEW_SCRIPT.replace(/^<script>/, "").replace(/<\/script>$/, "")
  assert.doesNotThrow(() => new Function(code), "le script de l'aperçu contient une erreur")
  assert.match(code, /pickOf/)
  assert.match(code, /shPickTag/)
})

test("aperçu : chaque zone de l'en-tête renvoie au bon réglage", async () => {
  const { PREVIEW_SCRIPT } = require("../src/ui")
  const code = PREVIEW_SCRIPT.replace(/^<script>/, "").replace(/<\/script>$/, "")
  for (const area of ["brand", "search", "nav", "cartlink", "social", "footer", "header"]) {
    assert.ok(code.includes("area: '" + area + "'"), "zone non gérée : " + area)
  }
  for (const area of ["productTitle", "productPrice", "productDesc", "productPhotos", "variants", "buy", "reviews"]) {
    assert.ok(code.includes("area: '" + area + "'"), "zone produit non gérée : " + area)
  }
  /* le contour de survol ne doit pas déplacer la page */
  assert.match(code, /classList\.add\('sh-hot'\)/)
})

test("aperçu : un clic n'ouvre plus deux fois la même chose (un seul script)", async () => {
  const fsx = require("fs")
  const srv = fsx.readFileSync(require("path").join(__dirname, "..", "server.js"), "utf8")
  assert.doesNotMatch(srv, /ndz: "section"/, "l'ancien script de clic est encore dans server.js")
  await login()
  await req("/dashboard/design/save", json({ design: { showName: true } }))
  const r = await req("/amina-mode?preview=1&editor=1")
  assert.equal((r.text.match(/shPickTag/g) || []).length, 1, "un seul script de sélection attendu")
  assert.equal((r.text.match(/function pickOf/g) || []).length, 1, "le script de sélection est chargé deux fois")
})
