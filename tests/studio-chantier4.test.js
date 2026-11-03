/* Chantier 4 : menu commun aux pages, retour à ce que voient les clients,
   blocs prêts à l'emploi, assistant qui écrit la page, et site en arabe. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-c4-${Date.now()}.db`)
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

test("assistant : trois réponses donnent des textes, en français et en arabe", () => {
  const R = require("../src/redaction")
  const fr = R.write({ name: "Amina Mode" }, { activite: "robes et sacs", ville: "Blida", atout: "Tissus choisis un par un." }, "fr")
  assert.equal(fr.ok, true)
  assert.match(fr.plan.hero.title, /Robes et sacs/)
  assert.match(fr.plan.hero.text, /Livraison à Blida/)
  assert.equal(fr.plan.hero.cta, "Voir les produits")
  assert.deepEqual(fr.manques, [])

  const ar = R.write({ name: "دار الزهرة" }, { activite: "فساتين وأحذية", ville: "البليدة" }, "ar")
  assert.equal(ar.ok, true)
  assert.match(ar.plan.hero.text, /البليدة/)
  assert.match(ar.plan.hero.cta, /[\u0600-\u06FF]/)
  assert.equal(ar.manques.length, 1, "il signale ce qui manque, sans le remplir au hasard")

  /* une activité vide ne produit pas de texte creux */
  assert.equal(R.write({}, { activite: "" }, "fr").ok, false)
})

test("blocs prêts à l'emploi : bannière, avis, galerie, avec un vrai contenu", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "_studio", "frame.js"), "utf8")
  assert.match(src, /g: "Prêts à l'emploi"/)
  assert.match(src, /l: "Bandeau d'annonce"/)
  assert.match(src, /l: "Avis clients"/)
  assert.match(src, /l: "Galerie de 3 photos"/)
  /* les avis sont écrits, pas des « lorem » : le marchand remplace des mots */
  assert.match(src, /Ils ont commandé/)
  assert.match(src, /★★★★★/)
})

test("studio : menu commun, retour à la version en ligne, assistant", async () => {
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site11" }))

  /* deux pages qui ont chacune leur en-tête : le studio garde celui de l'accueil */
  const home = `<!doctype html><html><head><title>t</title></head><body>
    <header><nav class="h11"><a href="/">ACCUEIL-H11</a><a href="/s/a-propos">À propos</a></nav></header>
    <h1>TITRE-ORIGINAL</h1><p>Phrase d'origine.</p><div data-ndz="produits"></div></body></html>`
  assert.equal(JSON.parse((await req("/dashboard/studio/save", json({ html: home }))).text).ok, true)
  const np = JSON.parse((await req("/dashboard/studio/page", json({ name: "À propos", from: "home" }))).text)
  assert.equal(np.ok, true)

  /* l'en-tête est maintenant le même sur les deux pages */
  const meta = JSON.parse((await req("/dashboard/studio/meta")).text)
  assert.equal(meta.shared.header, true)
  assert.match((await req("/dashboard/studio/frame?page=" + np.key)).text, /ACCUEIL-H11/)

  /* publication, puis modification : le retour en arrière ramène la version en ligne */
  assert.equal(JSON.parse((await req("/dashboard/studio/publish", { method: "POST" })).text).ok, true)
  const modifie = home.replace("TITRE-ORIGINAL", "TITRE-MODIFIE")
  await req("/dashboard/studio/save", json({ html: modifie }))
  assert.match((await req("/dashboard/studio/frame")).text, /TITRE-MODIFIE/)
  const back = JSON.parse((await req("/dashboard/studio/revert", { method: "POST" })).text)
  assert.equal(back.ok, true)
  assert.ok(back.pages >= 1, "au moins une page est revenue à la version en ligne")
  const apres = (await req("/dashboard/studio/frame")).text
  assert.match(apres, /TITRE-ORIGINAL/)
  assert.ok(!apres.includes("TITRE-MODIFIE"), "le brouillon non publié a disparu")

  /* l'assistant répond avec des textes prêts à poser */
  const ecrit = JSON.parse((await req("/dashboard/studio/ecrire", json({ activite: "robes", ville: "Blida" }))).text)
  assert.equal(ecrit.ok, true)
  assert.ok(ecrit.plan.hero.title.length > 2)
  assert.equal(JSON.parse((await req("/dashboard/studio/ecrire", json({ activite: "a" }))).text).ok, false)

  /* un visiteur non connecté n'écrit rien */
  jar.clear()
  const anon = await fetch(BASE + "/dashboard/studio/ecrire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activite: "robes" }), redirect: "manual" })
  assert.notEqual(anon.status, 200)
})

test("site en arabe : lecture de droite à gauche, police arabe, textes de la plateforme", () => {
  const S = require("../src/site-templates")
  const store = { slug: "sara-mode", name: "دار سارة", site_kind: "vitrine", lang_mode: "ar" }
  const out = S.render(store, [], "site5", { html: "<!doctype html><html><head></head><body><header>H</header><p>Texte du marchand</p></body></html>" })
  assert.match(out, /<html[^>]*dir="rtl"/)
  assert.match(out, /lang="ar"/)
  assert.match(out, /\/arabic-fonts\.css/)
  assert.match(out, /"Cairo"/, "sans choix du marchand, le site part sur Cairo")
  assert.match(out, /الرئيسية|راسلنا|إرسال/, "la barre du bas et le formulaire sont en arabe")
  assert.ok(out.includes("Texte du marchand"), "le contenu écrit par le marchand n'est pas traduit")

  const fr = S.render({ ...store, lang_mode: "fr" }, [], "site5", { html: "<!doctype html><html><head></head><body><p>x</p></body></html>" })
  assert.ok(!/dir="rtl"/.test(fr), "site en français : rien ne change")
})

test("studio en arabe : sens de lecture, police, table de traduction, bouton FR", async () => {
  const AR = require("../src/studio-ar")
  const table = AR.table()
  /* les mots que le débutant lit en premier doivent y être */
  const fr = table.words.map((w) => w[0])
  for (const mot of ["Studio", "Publier", "Enregistrer", "Ma page", "Ajouter", "Mon site", "Aide",
    "L'assistant écrit ma page", "Vos changements ne sont pas encore en ligne.",
    "Revenir à ce que voient mes clients", "Prêts à l'emploi"]) {
    assert.ok(fr.includes(mot), "traduction manquante : " + mot)
  }
  /* aucune traduction vide, et tout est bien en arabe */
  for (const [k, v] of table.words) {
    assert.ok(v && v.trim(), "traduction vide : " + k)
    assert.match(v, /[\u0600-\u06FF]/, "pas d'arabe dans : " + v)
  }

  jar.clear()
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site11" }))
  const ar = await req("/dashboard/studio/pages?lang=ar")
  assert.match(ar.text, /<html lang="ar" dir="rtl">/)
  assert.match(ar.text, /\/arabic-fonts\.css/)
  assert.match(ar.text, /body\.ar[^{]*\{font-family:"Amiri"/, "l'interface arabe de la plateforme est en Amiri")
  assert.match(ar.text, /id="st-ar"/)
  assert.match(ar.text, /data-lang="ar"/)
  assert.match(ar.text, /<title>الاستوديو/)
  /* le choix reste possible : un seul bouton, vers le français (côté navigateur) */
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "_studio", "studio.js"), "utf8")
  /* …et il change LES DEUX langues : celle de l'espace de gestion et celle de
     la page qu'on regarde (sinon la page restait dans l'autre langue). */
  assert.match(js, /href: "\?uilang=" \+ \(LANG === "ar" \? "fr" : "ar"\) \+ "&lang=" \+ \(LANG === "ar" \? "fr" : "ar"\)/)

  const frPage = await req("/dashboard/studio/pages?lang=fr")
  assert.match(frPage.text, /<html lang="fr" dir="ltr">/)
  assert.ok(!/id="st-ar"/.test(frPage.text), "pas de table arabe en français")
})

test("police arabe : cinq choix, enregistrés, appliqués au site", async () => {
  const ARF = require("../src/fonts-ar")
  const ids = ARF.FONTS.map((f) => f.id)
  for (const id of ["cairo", "tajawal", "almarai", "ibm-plex", "amiri"]) {
    assert.ok(ids.includes(id), "police manquante : " + id)
  }
  assert.equal(ARF.FONTS.length, 5, "cinq polices à choisir, pas six")
  assert.equal(ARF.of({}).id, "cairo", "valeur vide = Cairo")
  assert.equal(ARF.of({ arabic_font: "pirate" }).id, "cairo", "valeur inconnue = Cairo")
  assert.match(ARF.stack({ arabic_font: "cairo" }), /^"Cairo"/)
  assert.equal(ARF.needsCss({ arabic_font: "cairo" }), true)
  /* la plateforme en arabe est en Amiri, quoi qu'ait choisi le marchand */
  assert.equal(ARF.UI, "amiri")
  assert.match(ARF.uiStack(), /^"Amiri"/)
  assert.notEqual(ARF.uiStack(), ARF.stack({ arabic_font: "cairo" }), "l'interface ne suit pas la police du site")
  /* chaque police a bien ses fichiers, sinon le site tomberait sur du vide */
  for (const f of ARF.FONTS) {
    const file = f.id === "ibm-plex" ? "ibm-plex-sans-arabic" : f.id
    for (const w of ["400", "700"]) {
      for (const s of ["arabic", "latin"]) {
        assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "fonts", `${file}-${s}-${w}.woff2`)), "fichier manquant : " + f.id + " " + s + " " + w)
      }
    }
  }

  jar.clear()
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site11" }))
  const liste = JSON.parse((await req("/dashboard/studio/polices")).text)
  assert.equal(liste.ok, true)
  assert.equal(liste.fonts.length, ARF.FONTS.length)
  assert.equal(liste.current, "cairo")

  assert.equal(JSON.parse((await req("/dashboard/studio/police", json({ id: "amiri" }))).text).ok, true)
  assert.equal(JSON.parse((await req("/dashboard/studio/polices")).text).current, "amiri")
  const mauvais = await req("/dashboard/studio/police", json({ id: "<script>" }))
  assert.equal(mauvais.status, 400, "on n'écrit pas n'importe quoi en base")
})

/* --- les autres pages de la boutique (fiche produit, panier, commande,
   confirmation) se modifient dans le Studio, sans casser la commande --- */
test("pages de la boutique : la vraie page s'ouvre dans le Studio, la zone d'achat est protégée", async () => {
  jar.clear()
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site11" }))
  const r = await req("/dashboard/studio/plateforme?page=product")
  assert.equal(r.status, 200)
  assert.match(r.text, /data-ndz-keep="achat"/, "la zone d'achat est encadrée")
  assert.match(r.text, /\/_studio\/frame\.js/, "l'outil d'édition est posé dans la page")
  assert.ok(!/<script(?![^>]*\/_studio\/frame\.js)/.test(r.text), "aucun script du thème ne tourne dans l'atelier")

  const inconnue = await req("/dashboard/studio/plateforme?page=pirate")
  assert.equal(inconnue.status, 404)

  /* enregistrement : la zone protégée redevient la variable {{achat}} */
  const html = '<!doctype html><html><head></head><body><header>H</header><section><h1>Ma fiche</h1>{{achat}}</section><footer>F</footer></body></html>'
  const ok = await req("/dashboard/studio/plateforme", json({ page: "product", html }))
  assert.equal(JSON.parse(ok.text).ok, true)
  /* la page enregistrée se relit dans le Studio : le texte écrit est là,
     et la zone d'achat est toujours à sa place */
  const relu = await req("/dashboard/studio/plateforme?page=product")
  assert.match(relu.text, /Ma fiche/, "le texte écrit par le marchand est enregistré")
  assert.match(relu.text, /data-ndz-keep="achat"/, "le bouton d'achat est toujours là")
  assert.equal((relu.text.match(/data-ndz-keep="/g) || []).length, 1, "un seul repère d'achat")

  const mauvais = await req("/dashboard/studio/plateforme", json({ page: "pirate", html }))
  assert.equal(mauvais.status, 400)
})

test("police arabe : cinq choix, enregistrés, appliqués au site", async () => {
  const ARF = require("../src/fonts-ar")
  assert.equal(ARF.FONTS.length, 5, "cinq polices à choisir")
  assert.equal(ARF.of({}).id, "cairo", "sans choix : Cairo")
  assert.equal(ARF.of({ arabic_font: "pirate" }).id, "cairo", "valeur inconnue : on ne casse rien")
  assert.match(ARF.stack({ arabic_font: "cairo" }), /"Cairo"/)
  assert.equal(ARF.needsCss({ arabic_font: "cairo" }), true)
  assert.match(ARF.uiStack(), /"Amiri"/, "l'interface arabe de la plateforme est en Amiri")
  const S = require("../src/site-templates")
  const store = { slug: "sara-mode", name: "دار سارة", site_kind: "vitrine", lang_mode: "ar", arabic_font: "cairo" }
  const out = S.render(store, [], "site5", { html: "<!doctype html><html><head></head><body><p>x</p></body></html>" })
  assert.match(out, /\/arabic-fonts\.css/)
  assert.match(out, /"Cairo"/)

  jar.clear()
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  await req("/dashboard/design/site-template", form({ id: "site11" }))
  const liste = JSON.parse((await req("/dashboard/studio/polices")).text)
  assert.equal(liste.ok, true)
  assert.equal(liste.fonts.length, 5)
  const poser = await req("/dashboard/studio/police", json({ id: "tajawal" }))
  assert.equal(JSON.parse(poser.text).ok, true)
  assert.equal(JSON.parse((await req("/dashboard/studio/polices")).text).current, "tajawal")
  const non = await req("/dashboard/studio/police", json({ id: "pirate" }))
  assert.equal(non.status, 400)
})
