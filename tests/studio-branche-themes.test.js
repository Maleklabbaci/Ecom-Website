/* LE STUDIO EST BRANCHÉ SUR LES THÈMES — et il n'y a plus de page « Design ».

   Le problème, avant ce correctif :
     - /dashboard/design existait encore pour les boutiques qui n'avaient jamais
       ouvert le Studio : deux éditeurs, donc deux vérités ;
     - le Studio avait ses six styles à LUI (Épuré, Chaleureux, Nuit, Doux,
       Nature, Contrasté), inventés dans la maquette. Le marchand choisissait
       « Nuit » et rien ne changeait ailleurs : les autres pages continuaient
       avec les vrais thèmes de la plateforme.

   Maintenant :
     - une seule porte : /dashboard/studio. « design » renvoie dedans ;
     - le Studio affiche les thèmes de la plateforme (Calme, Claire, Centré,
       Affiche, Séparé, Large), avec leur vrai identifiant ;
     - le thème choisi est écrit dans la boutique : tout le site suit.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer, openDb } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-studio-themes-${Date.now()}.db`)
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
  for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return { status: res.status, text: await res.text(), location: res.headers.get("location") || "" }
}
const json = (o) => ({ method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(o) })

/* les six thèmes gardés, tels que la plateforme les connaît */
const SIX = ["electro", "atelier", "bureau", "audio", "soin", "mode"]
const NOMS = ["Claire", "Calme", "Centré", "Affiche", "Séparé", "Large"]
/* les six styles inventés dans l'ancienne maquette — ils ne doivent plus exister */
const INVENTES = ["Épuré", "Chaleureux", "Nuit", "Doux", "Nature", "Contrasté"]

before(async () => {
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
  const r = await req("/signup", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      kind: "commerce", name: "Karim", store: "Boutique Branchee",
      email: "branche@test.dz", password: "test1234", password2: "test1234",
    }).toString(),
  })
  assert.equal(r.status, 302, "inscription")
})

after(() => {
  if (server) server.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

/* ------------------------------------------------------------------ 1 */

test("plus aucune page « design » : tout renvoie au Studio", async () => {
  for (const p of ["/dashboard/design", "/dashboard/design/themes",
    "/dashboard/design/themes/apercu/atelier", "/dashboard/design/source",
    "/dashboard/design?ia=1", "/dashboard/design?reglages=1"]) {
    const r = await req(p)
    assert.equal(r.status, 302, `${p} doit rediriger`)
    assert.match(r.location, /\/dashboard\/studio$/, `${p} doit aller au Studio`)
  }
})

test("le menu ne propose plus « Design »", async () => {
  const dash = await req("/dashboard")
  assert.equal(dash.status, 200)
  assert.doesNotMatch(dash.text, /href="\/dashboard\/design/, "aucun lien vers l'ancien éditeur")
  assert.match(dash.text, /href="\/dashboard\/studio"/, "le lien vers le Studio est là")
})

/* ------------------------------------------------------------------ 2 */

test("le Studio affiche les SIX VRAIS thèmes, pas des styles inventés", async () => {
  const page = await req("/dashboard/studio")
  assert.equal(page.status, 200)
  /* la liste servie par le serveur : celle de la plateforme, pas celle de la maquette */
  const m = page.text.match(/"themes":\[(.*?)\],"themeDefaut"/)
  assert.ok(m, "le serveur envoie la liste des thèmes")
  const themes = JSON.parse("[" + m[1] + "]")
  assert.equal(themes.length, 6, "six thèmes, pas dix-neuf, pas six inventés")
  assert.deepEqual(themes.map((t) => t.id), ["electro", "atelier", "bureau", "audio", "soin", "mode"])
  assert.deepEqual(themes.map((t) => t.n), ["Claire", "Calme", "Centré", "Affiche", "Séparé", "Large"])
  /* les identifiants des styles inventés (p1…p6) ont disparu */
  for (const faux of ["p1", "p2", "p3", "p4", "p5", "p6"]) {
    assert.equal(themes.some((t) => t.id === faux), true === false, `plus de style ${faux}`)
  }
  for (const n of NOMS) assert.ok(page.text.includes(n), `le thème « ${n} » est proposé`)
  /* « Doux » et « Nuit » restent dans l'interface, mais comme réglages
     (arrondi, motif) — jamais comme thème. */
  for (const t of themes) assert.ok(NOMS.includes(t.n), "chaque thème a un vrai nom")
})

test("« Claire » est le thème par défaut", async () => {
  const page = await req("/dashboard/studio")
  assert.match(page.text, /"themeDefaut":"electro"/)
  /* et la maquette elle-même démarre sur Claire */
  assert.match(page.text, /theme: 'electro'/)
})

test("chaque thème du Studio a ses couleurs (l'aperçu n'est pas vide)", async () => {
  const page = await req("/dashboard/studio")
  for (const id of SIX) {
    assert.match(page.text, new RegExp(`\\.site\\.${id}\\{--s-bg:#`), `palette CSS de ${id}`)
  }
})

/* ------------------------------------------------------------------ 3 */

test("publier écrit le thème choisi dans la boutique : tout le site suit", async () => {
  const avant = openDb(DB).prepare("SELECT theme FROM stores WHERE slug = ?").get("boutique-branchee")
  assert.notEqual(avant.theme, "audio", "on part d'un autre thème")

  const etat = { design: { theme: "audio", set: {} }, pages: { home: [] }, set: {} }
  const r = await req("/dashboard/studio/design/publish", json({ state: etat }))
  assert.equal(r.status, 200, "publication acceptée")

  const apres = openDb(DB).prepare("SELECT theme FROM stores WHERE slug = ?").get("boutique-branchee")
  assert.equal(apres.theme, "audio", "le thème choisi dans le Studio est celui de la boutique")
})

test("un thème inconnu n'écrase pas celui de la boutique", async () => {
  const etat = { design: { theme: "pas-un-theme", set: {} }, pages: { home: [] }, set: {} }
  await req("/dashboard/studio/design/publish", json({ state: etat }))
  const row = openDb(DB).prepare("SELECT theme FROM stores WHERE slug = ?").get("boutique-branchee")
  assert.equal(row.theme, "audio", "la boutique garde son thème")
})

/* ------------------------------------------------------------------ 4 */

test("la planche des thèmes est dans le Studio, avec les 19", async () => {
  const page = await req("/dashboard/studio/themes")
  assert.equal(page.status, 200)
  assert.match(page.text, /data-f="all">Tous <i>19<\/i>/, "les 19 thèmes sont là")
  assert.match(page.text, /data-f="pret">Prêts à l'emploi <i>6<\/i>/, "et les 6 prêts devant")
  /* plus rien dans cette page ne renvoie à l'ancien éditeur — ni lien, ni
     formulaire : la planche appartient au Studio maintenant */
  assert.doesNotMatch(page.text, /href="\/dashboard\/design/)
  assert.doesNotMatch(page.text, /action="\/dashboard\/design/)
})

test("« Voir en grand » montre la boutique avec ce thème", async () => {
  const r = await req("/dashboard/studio/themes/apercu/audio")
  assert.equal(r.status, 200)
  assert.match(r.text, /Aperçu — rien n'est publié/)
  const faux = await req("/dashboard/studio/themes/apercu/pas-un-theme")
  assert.equal(faux.status, 404, "un thème inventé ne s'ouvre pas")
})
