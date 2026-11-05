/* LE STUDIO ET LE VRAI SITE DOIVENT ÊTRE LE MÊME.

   Le marchand l'a dit avec ses mots : « le studio et l'aperçu du vrai site,
   ce n'est pas le même ». Il avait raison, et voici pourquoi — deux défauts
   bien réels, trouvés en comparant les pages une à une :

   1. LES PRODUITS ÉTAIENT FIGÉS POUR LE VISITEUR.
      Le catalogue n'était rafraîchi qu'en mode édition. Le marchand ajoutait
      un produit, le voyait dans son Studio, et le client continuait de voir
      l'ancienne liste, figée au jour de la publication.

   2. LES SECTIONS PERDAIENT LEUR CLASSE « zone » SUR LE SITE PUBLIC.
      Or c'est cette classe qui porte la couleur des textes (.site .zone p)
      et le voile sombre du héros (readableHero). Résultat : le décor et la
      mise en page n'étaient pas les mêmes d'un côté et de l'autre.

   Ce fichier charge les DEUX pages pour de vrai et compare ce qu'elles
   produisent. S'ils divergent à nouveau, il tombe.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer } = require("./boot")
const { JSDOM, VirtualConsole } = require("jsdom")

const DB = path.join(os.tmpdir(), `novadz-meme-site-${Date.now()}.db`)
let BASE = ""
let server = null
let child = null
const jar = new Map()
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")

async function req(p, opts = {}) {
  const res = await fetch(BASE + p, { ...opts, headers: { ...(opts.headers || {}), cookie: cookieHeader() }, redirect: "manual" })
  for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  const text = await res.text()
  return { status: res.status, text, json: () => JSON.parse(text) }
}
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() })
const json = (o) => ({ method: "POST", headers: { "Content-Type": "application/json", cookie: cookieHeader() }, body: JSON.stringify(o) })

/* charge une page, exécute ses scripts, et rend le site tel qu'il apparaît */
async function rendre(url, attendre) {
  const page = await req(url)
  assert.equal(page.status, 200, `${url} doit répondre`)
  const err = []
  const vc = new VirtualConsole()
  vc.on("jsdomError", (e) => { if (!/Could not parse CSS|Not implemented/.test(e.message)) err.push(e.message.slice(0, 140)) })
  const dom = new JSDOM(page.text, {
    runScripts: "dangerously", pretendToBeVisual: true, url: BASE + url, virtualConsole: vc,
    beforeParse(win) {
      win.fetch = (u, o) => fetch(BASE + String(u), { ...(o || {}), headers: { ...((o || {}).headers || {}), cookie: cookieHeader() } })
      win.matchMedia = win.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
      win.scrollTo = () => {}
      win.open = () => null
    },
  })
  await new Promise((r) => setTimeout(r, attendre || 1800))
  const d = dom.window.document
  const site = d.querySelector("#site")
  return {
    doc: d,
    site: site ? site.outerHTML : "",
    texte: (site ? site.textContent : d.body.textContent || "").replace(/\s+/g, " ").trim(),
    err,
    close: () => dom.window.close(),
  }
}
/* ce qui PEUT différer, et qui doit différer : sur le site public les liens
   sont de vrais liens et le curseur le dit. Le décor, lui, doit être pareil. */
const montre = (h) => h
  .replace(/ style="cursor: pointer;"/g, "")
  .replace(/href="\/[^"]*"/g, 'href="#"')

let SLUG = ""

before(async () => {
  const started = await startServer({ db: DB })
  BASE = started.base
  child = started.child
  jar.clear()
  await req("/signup", form({
    kind: "commerce", name: "Karim", store: "Chez Karim",
    email: `${Date.now()}${Math.random().toString(36).slice(2, 6)}@meme.test.dz`,
    password: "test1234", password2: "test1234",
  }))
  SLUG = "chez-karim"
  await req("/dashboard/products", form({ title: "Montre acier", price: "4500", stock: "5", active: "1" }))
  await req("/dashboard/products", form({ title: "Parfum rose", price: "3200", stock: "4", active: "1" }))
  /* le marchand ouvre son Studio : le site est construit et publié */
  const st = await rendre("/dashboard/studio", 2200)
  st.close()
  const d = await (await req("/dashboard/studio/design")).json()
  await req("/dashboard/studio/design/publish", json({ state: d.draft }))
  /* PUIS il ajoute un troisième produit */
  await req("/dashboard/products", form({ title: "Sac cuir", price: "6700", stock: "2", active: "1" }))
})
after(() => {
  if (child) child.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

test("un produit ajouté après apparaît dans le Studio ET chez le client", async () => {
  const studio = await rendre("/dashboard/studio", 2200)
  const publicSite = await rendre("/" + SLUG, 1800)
  const apercu = await rendre("/" + SLUG + "?preview=1", 1800)
  for (const [nom, r] of [["Studio", studio], ["site public", publicSite], ["aperçu", apercu]]) {
    assert.match(r.texte, /Montre acier/, `${nom} : le premier produit`)
    assert.match(r.texte, /Parfum rose/, `${nom} : le deuxième produit`)
    assert.match(r.texte, /Sac cuir/, `${nom} : le produit ajouté APRÈS la publication doit apparaître`)
    assert.match(r.texte, /6 700/, `${nom} : son prix aussi`)
  }
  studio.close(); publicSite.close(); apercu.close()
})

test("le lien d'aperçu à partager montre les mêmes produits", async () => {
  const d = await (await req("/dashboard/studio/design")).json()
  const r = await req("/dashboard/studio/design/preview", json({ state: d.draft || d.live }))
  const tok = r.json()
  assert.ok(tok.url, "le serveur donne un lien d'aperçu")
  const lien = await rendre(tok.url, 1800)
  assert.match(lien.texte, /Sac cuir/, "le lien partagé montre le nouveau produit, lui aussi")
  lien.close()
})

test("le site public a les mêmes sections « zone » que le Studio", async () => {
  const studio = await rendre("/dashboard/studio", 2200)
  const publicSite = await rendre("/" + SLUG, 1800)
  const zonesStudio = (studio.site.match(/class="zone /g) || []).length
  const zonesPublic = (publicSite.site.match(/class="zone /g) || []).length
  assert.ok(zonesStudio > 0, "le Studio pose bien des sections")
  assert.equal(zonesPublic, zonesStudio,
    `le site public doit avoir les mêmes sections que le Studio (${zonesPublic} au lieu de ${zonesStudio}) : sans la classe « zone », la couleur des textes et le voile du héros disparaissent`)
  /* chaque section porte son étiquette, des deux côtés */
  const etiqS = (studio.site.match(/data-z="/g) || []).length
  const etiqP = (publicSite.site.match(/data-z="/g) || []).length
  assert.equal(etiqP, etiqS, "chaque section garde son étiquette data-z")
  studio.close(); publicSite.close()
})

test("le décor est identique, à part les vrais liens du site public", async () => {
  const studio = await rendre("/dashboard/studio", 2200)
  const publicSite = await rendre("/" + SLUG, 1800)
  const a = montre(studio.site)
  const b = montre(publicSite.site)
  if (a !== b) {
    let i = 0
    while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++
    assert.fail(
      `le Studio et le site public neProduisent pas le même décor (1re différence au caractère ${i})\n` +
      `  studio : ${JSON.stringify(a.slice(Math.max(0, i - 70), i + 130))}\n` +
      `  public : ${JSON.stringify(b.slice(Math.max(0, i - 70), i + 130))}`
    )
  }
  studio.close(); publicSite.close()
})

test("aucune erreur JavaScript, ni dans le Studio ni sur le site public", async () => {
  const studio = await rendre("/dashboard/studio", 2200)
  const publicSite = await rendre("/" + SLUG, 1800)
  assert.deepEqual(studio.err, [], "pas d'erreur dans le Studio")
  assert.deepEqual(publicSite.err, [], "pas d'erreur sur le site public")
  studio.close(); publicSite.close()
})
