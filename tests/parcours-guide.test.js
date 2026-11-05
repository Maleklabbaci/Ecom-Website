/* LE PARCOURS GUIDÉ — « dis-moi quoi faire, un truc à la fois ».

   Avant : une petite liste « Pour commencer » de quatre lignes, qui
   disparaissait sans jamais dire quoi faire maintenant, et qui ne parlait
   ni du Studio ni de la publication.

   Maintenant : huit étapes, une seule allumée à la fois, le reste assombri.
     - l'étape est calculée à partir des VRAIES données (produit ajouté ?
       site publié ? commande reçue ?), donc on ne reste jamais bloqué sur
       une étape déjà faite ;
     - on peut toujours sortir : « Passer » et « ne plus me guider » ;
     - quand les huit sont faites, le guide s'efface pour de bon.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-parcours-${Date.now()}.db`)
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
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() })
const json = (o) => ({ method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(o) })
const etat = async () => JSON.parse((await req("/dashboard/parcours", { headers: { Accept: "application/json" } })).text)

before(async () => {
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
  const r = await req("/signup", form({
    kind: "commerce", name: "Test", store: "Boutique Guide", email: "guide@test.dz",
    password: "test1234", password2: "test1234",
  }))
  assert.equal(r.status, 302, "inscription")
})

after(() => {
  if (server) server.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

test("huit étapes, dans l'ordre, et on commence par le formulaire", async () => {
  const e = await etat()
  assert.equal(e.total, 8)
  assert.deepEqual(e.steps.map((s) => s.id),
    ["fiche", "produit", "categorie", "commande", "style", "modifier", "publier", "donnees"])
  assert.equal(e.courant.id, "fiche", "la première chose à faire, c'est ses informations")
  assert.equal(e.steps[2].optionnel, true, "la catégorie est facultative : sinon on bloque")
})

test("sur son écran, une seule chose est allumée (le formulaire)", async () => {
  const page = await req("/dashboard/settings")
  assert.equal(page.status, 200)
  assert.match(page.text, /id="ndzTour"/, "le guide est là")
  assert.match(page.text, /"etape":1/, "on est bien à l'étape 1")
  assert.match(page.text, /"cible":"form\[action=\\"\/dashboard\/settings\\"\]"/, "le formulaire est la seule cible")
  assert.match(page.text, /Étape [0-9]+ sur [0-9]+|"total":8/)
  assert.match(page.text, /Ne plus me guider/, "on peut toujours sortir")
  assert.match(page.text, /Passer/, "on peut passer")
})

test("ailleurs, pas de voile : juste une pastille discrète pour continuer", async () => {
  const page = await req("/dashboard/orders")
  assert.equal(page.status, 200)
  assert.match(page.text, /"ici":false/, "on n'assombrit pas un écran qui n'est pas celui de l'étape")
  assert.match(page.text, /tour-pill/, "une pastille propose de continuer")
})

test("les étapes se cochent avec les VRAIES données", async () => {
  await req("/dashboard/settings", form({ name: "Test", phone: "0555112233", wilaya: "Blida", email: "guide@test.dz" }))
  let e = await etat()
  assert.equal(e.steps.find((s) => s.id === "fiche").fait, true, "téléphone + wilaya = étape 1 faite")

  await req("/dashboard/products", form({ title: "Montre acier", price: "4500", stock: "5", active: "1" }))
  e = await etat()
  assert.equal(e.steps.find((s) => s.id === "produit").fait, true, "un produit = étape 2 faite")
  assert.equal(e.courant.id, "categorie", "on avance tout seul")
})

test("on peut passer une étape, et le guide s'en souvient", async () => {
  await req("/dashboard/parcours/categorie", json({ action: "passer" }))
  const e = await etat()
  const cat = e.steps.find((s) => s.id === "categorie")
  assert.equal(cat.passe, true)
  assert.equal(e.courant.id, "commande", "on passe à la suite sans rester coincé")
})

test("l'étape du formulaire de commande se valide sur place", async () => {
  const page = await req("/dashboard/formulaire")
  assert.equal(page.status, 200)
  assert.match(page.text, /"etape":4/)
  await req("/dashboard/parcours/commande", json({ action: "fait" }))
  const e = await etat()
  assert.equal(e.steps.find((s) => s.id === "commande").fait, true)
  assert.equal(e.courant.id, "style", "l'étape suivante, c'est le style")
})

test("le Studio a le bouton retour, l'heure d'enregistrement et l'aperçu", async () => {
  const page = await req("/dashboard/studio")
  assert.equal(page.status, 200)
  assert.match(page.text, /id="backDash"/, "on peut revenir au tableau de bord")
  assert.match(page.text, /href="\/dashboard"/, "le lien pointe vers le tableau de bord")
  assert.match(page.text, /Tableau de bord/)
  assert.match(page.text, /id="savedAt"/, "« Enregistré à 14:32 »")
  assert.match(page.text, /id="previewBtn"/, "le bouton Aperçu")
  assert.match(page.text, /data-tour="styles"/, "l'étape « style » sait quoi allumer")
  assert.match(page.text, /data-tour="apercu"/, "l'étape « modifier » sait quoi allumer")
})

test("dans le Studio, le guide montre l'étape 5 et sait où pointer", async () => {
  const page = await req("/dashboard/studio")
  assert.match(page.text, /"etape":5/)
  assert.match(page.text, /"ici":true/, "on est sur l'écran de l'étape")
  assert.match(page.text, /"cible":"\[data-tour=\\"styles\\"\]"/, "une seule cible : les styles")
})

test("zéro démonstration : aucun faux nom, aucun faux produit, aucun « 58 wilayas »", async () => {
  const page = await req("/dashboard/studio")
  for (const faux of ["Meriem", "amina.mode", "Robe d'été fleurie", "Sac à main camel", "58 wilayas", "Amine Benali"]) {
    assert.equal(page.text.includes(faux), false, `« ${faux} » ne doit plus apparaître`)
  }
  assert.match(page.text, /69 wilayas|0 wilaya/, "si un nombre de wilayas reste, c'est le bon")
})

test("aucun produit : le Studio le dit et donne le bouton", async () => {
  /* on regarde une boutique neuve, sans produit */
  const jar2 = [...jar.entries()]
  jar.clear()
  const r = await req("/signup", form({
    kind: "commerce", name: "Vide", store: "Boutique Vide", email: "vide@test.dz",
    password: "test1234", password2: "test1234",
  }))
  assert.equal(r.status, 302)
  const page = await req("/dashboard/studio")
  assert.match(page.text, /Aucun produit pour l'instant/)
  assert.match(page.text, /Ajouter mon premier produit/)
  assert.match(page.text, /href="\/dashboard\/products\/new"/)
  for (const [k, v] of jar2) jar.set(k, v)
})

test("les produits viennent du catalogue, pas d'une copie dans la page", async () => {
  jar.clear()
  await req("/login", form({ email: "guide@test.dz", password: "test1234" }))
  await req("/dashboard/products", form({ title: "Sac cuir noir", price: "3200", stock: "3", active: "1" }))
  const page = await req("/dashboard/studio")
  assert.match(page.text, /Montre acier/)
  assert.match(page.text, /Sac cuir noir/)
  assert.equal(/Robe d'été fleurie/.test(page.text), false)
})

test("« ne plus me guider » : le guide disparaît, et on peut le reprendre", async () => {
  await req("/dashboard/parcours/style", json({ action: "arreter" }))
  let page = await req("/dashboard/settings")
  assert.equal(page.text.includes('id="ndzTour"'), false, "plus de voile du tout")
  assert.match(page.text, /Reprendre le guide/, "mais on peut le rallumer")
  await req("/dashboard/parcours/relancer", form({}))
  page = await req("/dashboard/settings")
  assert.match(page.text, /id="ndzTour"|tour-pill/, "le guide est revenu")
})
