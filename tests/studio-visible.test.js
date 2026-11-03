/* STUDIO VISIBLE — le Studio est le seul endroit où l'on écrit les pages du
   site. Il n'apparaissait dans le menu qu'une fois un modèle de site choisi :
   une boutique neuve (ou la démo) ne voyait donc aucune entrée « Studio » et
   on croyait que l'éditeur avait disparu.

   Ce qui est vérifié ici :
   1. le menu montre « Studio » même sans modèle choisi ;
   2. la page Studio explique quoi faire au lieu de renvoyer dans le vide ;
   3. une fois le modèle choisi, le Studio s'ouvre vraiment (200).
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-studio-visible-${Date.now()}.db`)
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

before(async () => {
  server = await startServer({ db: DB })
  BASE = server.base
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
})

after(async () => {
  if (server && server.child) server.child.kill("SIGKILL")
})

test("le menu du tableau de bord montre le Studio même sans modèle de site", async () => {
  const r = await req("/dashboard")
  assert.equal(r.status, 200)
  assert.match(r.text, /href="\/dashboard\/studio"/, "l'entrée Studio doit être dans le menu")
})

test("le Studio reste accessible dans la barre du bas sur téléphone", async () => {
  const r = await req("/dashboard/products")
  assert.equal(r.status, 200)
  assert.match(r.text, /app-tab/, "la barre du bas doit être rendue")
})

test("sans modèle de site, Studio renvoie vers le choix des modèles avec une explication", async () => {
  const r = await req("/dashboard/studio")
  assert.equal(r.status, 302)
  assert.equal(r.location, "/dashboard/design/themes?modele=1")
})

test("la page des modèles dit pourquoi on est là", async () => {
  const r = await req("/dashboard/design/themes?modele=1")
  assert.equal(r.status, 200)
  assert.match(r.text, /data-studio-modele/, "le bandeau « Ton Studio t'attend » doit s'afficher")
  assert.match(r.text, /Studio t'attend/)
})

test("après le choix d'un modèle, le Studio s'ouvre pour de bon", async () => {
  const choice = await req("/dashboard/design/site-template", form({ id: "site6" }))
  assert.equal(choice.status, 302)
  assert.equal(choice.location, "/dashboard/studio")

  const r = await req("/dashboard/studio")
  assert.equal(r.status, 200)
  assert.match(r.text, /Studio/, "la page du Studio doit être rendue")
  assert.match(r.text, /\/_studio\//, "l'éditeur doit charger ses fichiers")
})

test("le Studio choisi se retrouve dans le menu comme page active", async () => {
  const r = await req("/dashboard/studio")
  assert.equal(r.status, 200)
  assert.match(r.text, /<title>[^<]*Studio[^<]*<\/title>/)
})
