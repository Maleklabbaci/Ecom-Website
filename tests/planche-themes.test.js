/* La planche des thèmes : tout voir d'un coup d'œil.

   Avant : les thèmes étaient rangés en plusieurs sections, avec des vignettes
   de tailles différentes — impossible de comparer.
   Maintenant : une seule planche, le même cadre pour tous (image 4/3, nom,
   à quoi ça sert, deux boutons), un filtre par usage, et « Voir en grand » qui
   ouvre la VRAIE boutique du marchand avec ce thème, sans rien publier.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-planche-${Date.now()}.db`)
let BASE = ""
let server = null
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
  return { status: res.status, text: await res.text() }
}
const form = (o) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
})

before(async () => {
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

const THEMES = () => require("../src/themes").THEMES

test("une seule planche, avec les 19 thèmes dedans", async () => {
  const page = await req("/dashboard/design/themes")
  assert.equal(page.status, 200)
  assert.match(page.text, /class="th-group th-board-sec"/)
  assert.match(page.text, /Vue d'ensemble — 19 thèmes/)
  assert.match(page.text, /class="th-board"/)
  const cards = page.text.match(/class="th-card[^"]*"/g) || []
  assert.ok(cards.length >= THEMES().length, `au moins ${THEMES().length} cartes, trouvé ${cards.length}`)
})

test("les thèmes prêts à l'emploi passent devant, le publié en tête", async () => {
  const page = await req("/dashboard/design/themes")
  const ordre = [...page.text.matchAll(/data-theme="([a-z-]+)"/g)].map((m) => m[1])
  const publie = ordre[0]
  /* le premier bloc « publié » est bien celui de la boutique */
  assert.match(page.text, new RegExp(`class="th-now" data-theme="${publie}"`))
  const prêts = ["atelier", "electro", "bureau", "audio", "soin", "mode"]
  const restants = ordre.slice(1, 7)
  for (const id of restants) assert.ok(prêts.includes(id) || id === publie, `${id} devrait être un thème prêt`)
})

test("le même cadre pour chaque carte : image, usage, deux boutons", async () => {
  const page = await req("/dashboard/design/themes")
  /* chaque carte a un lien « Voir en grand » */
  const zooms = page.text.match(/href="\/dashboard\/design\/themes\/apercu\/[a-z-]+"/g) || []
  assert.ok(zooms.length >= THEMES().length, `un lien par thème, trouvé ${zooms.length}`)
  assert.match(page.text, /Voir en grand/)
  assert.match(page.text, /data-cat="[a-z]+"/)
  assert.match(page.text, /data-pret="[01]"/)
})

test("les filtres sont là, avec le compte de chaque famille", async () => {
  const page = await req("/dashboard/design/themes")
  assert.match(page.text, /data-th-chips/)
  assert.match(page.text, /data-f="all">Tous <i>19<\/i>/)
  assert.match(page.text, /data-f="pret">Prêts à l'emploi <i>6<\/i>/)
  for (const [id] of require("../src/themes").CATEGORIES) {
    assert.match(page.text, new RegExp(`data-f="${id}"`), `filtre ${id}`)
  }
})

test("« Voir en grand » ouvre la vraie boutique avec ce thème", async () => {
  const page = await req("/dashboard/design/themes/apercu/minimal")
  assert.equal(page.status, 200)
  assert.match(page.text, /id="ndz-apercu-theme"/)
  assert.match(page.text, /Aperçu — rien n'est publié/)
  assert.match(page.text, /Choisir ce thème/)
  assert.match(page.text, /Retour aux thèmes/)
  /* c'est bien la boutique du marchand qui est montrée, pas une page vide */
  assert.match(page.text, /Amina|boutique/i)
})

test("voir en grand ne publie rien", async () => {
  const avant = await req("/dashboard/design/themes")
  const publie = (avant.text.match(/class="th-now" data-theme="([a-z-]+)"/) || [])[1]
  await req("/dashboard/design/themes/apercu/contrast")
  const apres = await req("/dashboard/design/themes")
  const encore = (apres.text.match(/class="th-now" data-theme="([a-z-]+)"/) || [])[1]
  assert.equal(encore, publie, "le thème publié n'a pas bougé")
})

test("un thème inventé ne s'ouvre pas", async () => {
  const page = await req("/dashboard/design/themes/apercu/pas-un-theme")
  assert.equal(page.status, 404)
})

test("sans connexion, pas d'aperçu", async () => {
  const res = await fetch(BASE + "/dashboard/design/themes/apercu/minimal", { redirect: "manual" })
  assert.ok([301, 302, 303].includes(res.status), `redirigé vers la connexion (${res.status})`)
})

test("le style de la planche existe (même image, même hauteur, filtres)", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8")
  assert.match(css, /\.th-board \{ display: grid/)
  assert.match(css, /\.th-board \.th-shot \{ position: relative; aspect-ratio: 4 \/ 3/)
  assert.match(css, /\.th-board \.th-actions \{ margin-top: auto/)
  assert.match(css, /\.th-chip\.on/)
  assert.match(css, /\.th-zoom/)
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.th-board \{ grid-template-columns: 1fr/)
})
