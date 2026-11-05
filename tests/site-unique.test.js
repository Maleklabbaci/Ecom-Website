/* UN SEUL SITE.

   Avant ce correctif, quatre choses prétendaient être « le site » :
     1. /dashboard/design      → l'ancien éditeur (thème + sections d'avant) ;
     2. /dashboard/studio      → le Studio ;
     3. /dashboard (aperçu)    → l'ancien brouillon, pas le Studio ;
     4. /<adresse>             → l'ancienne page, même après avoir publié.

   Maintenant, une seule règle :
     - ce qui est PUBLIÉ dans le Studio est ce que voient les clients ;
     - l'aperçu du tableau de bord montre le BROUILLON, donc ce qu'on règle ;
     - dès qu'un site Studio existe, l'ancien éditeur renvoie vers le Studio ;
     - une boutique qui n'a jamais ouvert le Studio garde sa page d'avant.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-siteunique-${Date.now()}.db`)
let BASE = ""
let server = null
let SLUG = ""
const jar = new Map()
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")

async function req(p, opts = {}) {
  const res = await fetch(BASE + p, {
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
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() })
const json = (o) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) })

/* un état de Studio lisible, avec une marque pour le reconnaître dans la page */
const etat = (marque) => ({
  design: { bg: "#ffffff", marque },
  pages: {
    home: [
      { id: "s1", k: "head", on: true },
      { id: "s2", k: "hero", on: true },
      { id: "s3", k: "foot", on: true },
    ],
  },
})
const modeDe = (html) => (html.match(/"mode":"(edit|preview|public)"/) || [])[1] || ""

before(async () => {
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
  const r = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.ok([302, 303].includes(r.status))
  const dash = await req("/dashboard")
  SLUG = (dash.text.match(/href="\/([a-z0-9-]+)\/?"[^>]*>Ouvrir le site/) || [])[1] || "amina-mode"
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

/* ---------------------------------------------------------------- */
/* 1. Une boutique qui n'a jamais ouvert le Studio : rien ne change  */
/* ---------------------------------------------------------------- */

test("boutique sans Studio : la page d'avant reste en ligne", async () => {
  const page = await req("/" + SLUG)
  assert.equal(page.status, 200)
  assert.equal(modeDe(page.text), "", "pas encore de site Studio")
})

test("boutique sans Studio : l'ancien éditeur n'existe plus, on va au Studio", async () => {
  /* L'ancien éditeur « Design » n'existe plus : il y a un seul endroit pour
     modifier le site, le Studio. L'adresse reste vivante pour les favoris et
     les liens déjà envoyés, mais elle ne montre plus un deuxième éditeur. */
  const page = await req("/dashboard/design")
  assert.equal(page.status, 302, "l'ancien éditeur renvoie au Studio")
  assert.match(page.location, /\/dashboard\/studio$/, "et seulement au Studio")
})

/* ---------------------------------------------------------------- */
/* 2. Le Studio : un site neuf, aux vraies affaires du marchand     */
/* ---------------------------------------------------------------- */

test("première ouverture du Studio : un site neuf, pas la maquette de démo", async () => {
  const page = await req("/dashboard/studio")
  assert.equal(page.status, 200)
  assert.match(page.text, /"fresh":true/, "le Studio sait que rien n'est enregistré")
  assert.doesNotMatch(page.text, /Templifica/, "plus de nom de prototype")
  assert.match(page.text, /NovaDZ/, "le Studio s'appelle NovaDZ Studio")
  assert.doesNotMatch(page.text, /id="vtag"/, "plus de pastille de version")
})

test("le Studio ne renvoie plus vers l'ancien éditeur", async () => {
  const page = await req("/dashboard/studio")
  assert.doesNotMatch(page.text, /\/dashboard\/design/, "aucun lien vers l'ancien éditeur")
})

test("un bouton pour repartir des vrais produits (et effacer l'ancien site de démo)", async () => {
  const page = await req("/dashboard/studio")
  assert.match(page.text, /id="goFresh"/)
  assert.match(page.text, /Nouveau site/)
  assert.match(page.text, /Votre brouillon actuel sera remplacé/, "on prévient avant d'effacer")
})

/* ---------------------------------------------------------------- */
/* 3. Publier = mettre le site en ligne                             */
/* ---------------------------------------------------------------- */

test("publier dans le Studio met le site en ligne (même sans cocher « page d'accueil »)", async () => {
  const pub = await req("/dashboard/studio/design/publish", json({ state: etat("PUBLIE-1") }))
  assert.equal(pub.status, 200)
  assert.equal(JSON.parse(pub.text).ok, true)
  const page = await req("/" + SLUG)
  assert.equal(modeDe(page.text), "public", "le visiteur voit le site publié")
  assert.match(page.text, /PUBLIE-1/)
})

test("le tableau de bord montre le site publié, pas l'ancien brouillon", async () => {
  const dash = await req("/dashboard")
  assert.equal(dash.status, 200)
  assert.match(dash.text, new RegExp(`src="/${SLUG}\\?preview=1"`), "l'aperçu pointe sur la page du Studio")
  assert.match(dash.text, /Modifier le site/)
  assert.doesNotMatch(dash.text, /Modifier le design/)
})

test("l'aperçu montre le brouillon en cours (ce qu'on est en train de régler)", async () => {
  const brouillon = await req("/dashboard/studio/design", json({ state: etat("BROUILLON-2") }))
  assert.equal(brouillon.status, 200)
  const apercu = await req("/" + SLUG + "?preview=1")
  assert.equal(modeDe(apercu.text), "preview")
  assert.match(apercu.text, /BROUILLON-2/, "l'aperçu suit le brouillon")
  /* et le public ne bouge pas : ce n'est pas encore publié */
  const public_ = await req("/" + SLUG)
  assert.match(public_.text, /PUBLIE-1/)
  assert.doesNotMatch(public_.text, /BROUILLON-2/, "le brouillon ne fuit pas chez les clients")
})

test("un visiteur sans compte ne voit jamais le brouillon", async () => {
  const res = await fetch(BASE + "/" + SLUG + "?preview=1", { redirect: "manual" })
  const html = await res.text()
  assert.equal(modeDe(html), "public")
  assert.doesNotMatch(html, /BROUILLON-2/)
})

test("republier met la nouvelle version en ligne", async () => {
  await req("/dashboard/studio/design/publish", json({ state: etat("PUBLIE-3") }))
  const page = await req("/" + SLUG)
  assert.match(page.text, /PUBLIE-3/)
  assert.doesNotMatch(page.text, /PUBLIE-1/)
})

/* ---------------------------------------------------------------- */
/* 4. L'ancien éditeur ne revient plus devant le marchand           */
/* ---------------------------------------------------------------- */

test("dès qu'un site Studio existe, /dashboard/design renvoie au Studio", async () => {
  const page = await req("/dashboard/design")
  assert.equal(page.status, 302)
  assert.match(page.location, /\/dashboard\/studio$/)
})

test("le Studio n'est plus une « première ouverture » après enregistrement", async () => {
  const page = await req("/dashboard/studio")
  assert.match(page.text, /"fresh":false/)
  assert.match(page.text, /"mode":"edit"/)
})

/* ---------------------------------------------------------------- */
/* 5. Une seule page de site, avec la bonne tête pour Google        */
/* ---------------------------------------------------------------- */

test("le site publié a un titre et une description (pas la page de travail)", async () => {
  const page = await req("/" + SLUG)
  assert.match(page.text, /<title>/)
  assert.match(page.text, /og:title/)
  assert.doesNotMatch(page.text, /name="robots" content="noindex"/, "le vrai site est indexable")
})

test("l'aperçu, lui, n'est pas indexé", async () => {
  const page = await req("/" + SLUG + "?preview=1")
  assert.match(page.text, /name="robots" content="noindex"/)
})
