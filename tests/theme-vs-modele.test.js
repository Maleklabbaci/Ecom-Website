/* UN THÈME OU UN MODÈLE, PAS LES DEUX.
   Un marchand choisissait un thème classique : le bandeau disait « Thème
   d'essai : Séparé », mais l'aperçu continuait d'afficher le modèle de site
   (Essentia, en anglais, avec des prix en dollars). Il croyait que son choix
   n'avait rien fait.
   Règle : choisir un thème retire le modèle du brouillon (« Annuler » le
   ramène), et le Studio suit — il ouvre le thème, pas le modèle.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-theme-modele-${Date.now()}.db`)
let server
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
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})
const design = () => {
  const db = openDb(DB)
  const row = db.prepare("SELECT design, draft, theme FROM stores WHERE slug = 'amina-mode'").get()
  const live = JSON.parse(row.design || "{}")
  const draft = JSON.parse(row.draft || "{}")
  return { live, draft, theme: row.theme }
}

before(async () => {
  server = await startServer({ db: DB })
  BASE = server.base
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  /* on part d'un modèle de site, comme la boutique du marchand */
  await req("/dashboard/design/site-template", form({ id: "site6" }))
})

after(async () => {
  if (server && server.child) server.child.kill("SIGKILL")
  try { fs.unlinkSync(DB) } catch (_) {}
})

test("choisir un thème retire le modèle de site du brouillon", async () => {
  const before = design()
  assert.equal((before.draft.design || {}).siteTemplate, "site6", "le modèle doit être posé au départ")

  const r = await req("/dashboard/design/theme", form({ theme: "galerie" }))
  assert.equal(r.status, 302)

  const after = design()
  assert.equal(after.draft.theme, "galerie", "le thème essayé vit dans le brouillon")
  assert.equal((after.draft.design || {}).siteTemplate, "", "le modèle doit disparaître du brouillon")
  assert.deepEqual(after.live, before.live, "la boutique en ligne ne bouge pas avant publication")
})

test("l'aperçu de l'ancien éditeur n'est plus servi, le Studio prend tout", async () => {
  /* L'ancien éditeur « Design » n'existe plus : il y a un seul endroit pour
     modifier le site, le Studio. L'adresse reste vivante pour les favoris et
     les liens déjà envoyés, mais elle ne montre plus un deuxième éditeur. */
  const page = await req("/dashboard/design")
  assert.equal(page.status, 302, "l'ancien éditeur renvoie au Studio")
  assert.match(page.location, /\/dashboard\/studio$/, "et seulement au Studio")
})

test("le Studio bascule sur le thème, pas sur le modèle", async () => {
  const r = await req("/dashboard/studio/pages")
  assert.equal(r.status, 200)
  assert.match(r.text, /data-tpl="theme:galerie"/)
})

test("annuler l'essai rend la boutique exactement comme avant", async () => {
  const r = await req("/dashboard/design/theme/cancel", form({}))
  assert.equal(r.status, 302)
  const db = openDb(DB)
  const row = db.prepare("SELECT draft FROM stores WHERE slug = 'amina-mode'").get()
  assert.equal(row.draft, null, "le brouillon doit être effacé")
  /* rien n'avait été publié : le Studio revient donc au thème en ligne */
  const studio = await req("/dashboard/studio/pages")
  assert.equal(studio.status, 200)
  assert.match(studio.text, /data-tpl="theme:minimal"/)
})
