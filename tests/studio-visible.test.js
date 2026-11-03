/* LE STUDIO POUR TOUS LES THÈMES.
   Le Studio ne doit pas être réservé aux modèles « site complet » : une
   boutique sur un thème classique (minimal, galerie, tech…) ouvre le même
   Studio, sur la page que son thème dessine déjà. Ce qui est écrit puis publié
   devient le contenu de la page d'accueil, sans casser la coque du thème.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-studio-theme-${Date.now()}.db`)
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
const json = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
})

before(async () => {
  server = await startServer({ db: DB })
  BASE = server.base
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
})

after(async () => {
  if (server && server.child) server.child.kill("SIGKILL")
  try { fs.unlinkSync(DB) } catch (_) {}
})

test("un thème classique ouvre le Studio (plus de renvoi vers les modèles)", async () => {
  const r = await req("/dashboard/studio/pages")
  assert.equal(r.status, 200, "le Studio doit s'ouvrir pour un thème")
  assert.match(r.text, /data-tpl="theme:/, "le Studio doit être en mode thème")
  assert.match(r.text, /Studio/, "la page doit être le Studio")
})

test("le Studio montre la vraie page du thème, avec ses produits", async () => {
  const r = await req("/dashboard/studio/frame")
  assert.equal(r.status, 200)
  assert.match(r.text, /<body/i)
  assert.match(r.text, /_studio\/frame\.js/, "l'éditeur doit pouvoir piloter la page")
  assert.match(r.text, /Amina Mode|Robe|Sac/, "la page du thème doit être affichée")
})

test("on écrit dans la page, on publie, la boutique suit", async () => {
  const page = "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>Page</title></head>"
    + "<body><h1>Ma nouvelle accueil</h1><p>Écrit dans le Studio.</p></body></html>"
  const saved = await req("/dashboard/studio/save", json({ page: "home", html: page }))
  assert.equal(saved.status, 200, saved.text)
  const pub = await req("/dashboard/studio/publish", json({}))
  assert.equal(pub.status, 200, pub.text)

  const shop = await req("/amina-mode")
  assert.equal(shop.status, 200)
  assert.match(shop.text, /Ma nouvelle accueil/, "la page publiée doit être servie")
  assert.match(shop.text, /<header|nav/i, "la coque du thème doit rester en place")
})

test("la page des modèles reste accessible pour qui veut un site complet", async () => {
  const r = await req("/dashboard/design/themes?modele=1")
  assert.equal(r.status, 200)
  assert.match(r.text, /Templates e-commerce complets/)
  assert.match(r.text, /data-studio-modele/)
})

test("choisir un modèle de site repasse le Studio en mode modèle", async () => {
  const choice = await req("/dashboard/design/site-template", form({ id: "site6" }))
  assert.equal(choice.status, 302)
  assert.equal(choice.location, "/dashboard/studio")
  const r = await req("/dashboard/studio/pages")
  assert.equal(r.status, 200)
  assert.match(r.text, /data-tpl="site6"/)
})
