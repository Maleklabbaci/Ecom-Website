/* LES QUESTIONS DU FORMULAIRE DE COMMANDE.
 *
 * Le marchand ajoute une question à son formulaire (« Pointure », « Étage »,
 * « Message cadeau »), il enregistre, et elle doit rester.
 *
 * Elle disparaissait. Pourquoi : le javascript numérote une ligne ajoutée à
 * partir de 200, pour ne jamais marcher sur une ligne déjà rendue par le
 * serveur (0, 1, 2…). Mais la sauvegarde parcourait bêtement les indices
 * 0 à 39. La question partait donc à la poubelle sans aucun message — le
 * marchand croyait l'avoir enregistrée et elle n'existait pas.
 *
 * Ce fichier verrouille les deux chemins : avec javascript (indice 200) et
 * sans javascript (le champ d'ajout est envoyé tel quel).
 */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-formulaire-${Date.now()}.db`)
let BASE = ""
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
  return { status: res.status, text: await res.text() }
}
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() })

/** Les questions RÉELLEMENT dans la liste, pas les mots qui traînent dans
    la page : le champ d'ajout porte l'exemple « Pointure, cadeau, étage… »,
    donc chercher un mot dans le HTML ne prouve rien. */
const clesRendues = (html) =>
  [...String(html || "").matchAll(/name="key_\d+"\s+value="([^"]*)"/g)].map((m) => m[1])

/** Refabrique le corps de la requête exactement comme le ferait la page. */
const corpsDeLaPage = (html) => {
  const body = {}
  for (const m of String(html || "").matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0]
    const at = (n) => { const r = new RegExp(n + '="([^"]*)"', "i").exec(tag); return r ? r[1] : "" }
    const nom = at("name")
    if (!nom) continue
    const type = (at("type") || "text").toLowerCase()
    if (type === "hidden") body[nom] = at("value")
    else if (type === "checkbox" || type === "radio") { if (/\bchecked\b/i.test(tag)) body[nom] = at("value") || "1" }
    else body[nom] = at("value")
  }
  for (const m of String(html || "").matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const sel = /<option\b[^>]*\bselected\b[^>]*value="([^"]*)"/i.exec(m[2])
    if (sel) body[m[1]] = sel[1]
    else { const first = /<option\b[^>]*value="([^"]*)"/i.exec(m[2]); if (first) body[m[1]] = first[1] }
  }
  return body
}

before(async () => {
  const started = await startServer({ db: DB })
  child = started.child
  BASE = started.base
  const r = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.ok([302, 303].includes(r.status))
})

after(async () => { if (child) child.kill() })

test("une question ajoutée par le javascript (indice 200) est enregistrée", async () => {
  const page = await req("/dashboard/formulaire")
  assert.equal(page.status, 200)
  const body = corpsDeLaPage(page.text)
  assert.ok(Object.keys(body).some((k) => k.startsWith("key_")), "la page n'a aucune ligne de question")

  /* exactement ce qu'envoie le navigateur quand on clique « Ajouter » */
  body.key_200 = "f_pointure"
  body.kind_200 = "field"
  body.label_200 = "Pointure"
  body.type_200 = "text"
  body.pos_200 = "11"
  body.ph_200 = ""
  body.width_200 = "half"
  body.opt_200 = ""
  body.label_ar_200 = ""
  body.enabled_200 = "1"

  const post = await req("/dashboard/formulaire", form(body))
  assert.ok([302, 303].includes(post.status))

  const apres = await req("/dashboard/formulaire")
  assert.ok(
    clesRendues(apres.text).includes("f_pointure"),
    "la question « Pointure » n'a pas été enregistrée (clés rendues : " + clesRendues(apres.text).join(", ") + ")",
  )
})

test("sans javascript, le champ d'ajout est enregistré quand même", async () => {
  const page = await req("/dashboard/formulaire")
  const body = corpsDeLaPage(page.text)
  body.add_label = "Message cadeau"
  body.add_type = "textarea"

  const post = await req("/dashboard/formulaire", form(body))
  assert.ok([302, 303].includes(post.status))

  const apres = await req("/dashboard/formulaire")
  assert.ok(
    clesRendues(apres.text).includes("f_message_cadeau"),
    "la question ajoutée sans javascript n'a pas été enregistrée (clés rendues : " + clesRendues(apres.text).join(", ") + ")",
  )
})

test("une question enlevée disparaît pour de bon", async () => {
  const page = await req("/dashboard/formulaire")
  const body = corpsDeLaPage(page.text)
  /* on marque la ligne « Pointure » comme supprimée */
  for (const [k, v] of Object.entries(body)) {
    if (k.startsWith("key_") && v === "f_pointure") {
      const i = k.slice(4)
      body[`del_${i}`] = "1"
    }
  }
  const post = await req("/dashboard/formulaire", form(body))
  assert.ok([302, 303].includes(post.status))
  const apres = await req("/dashboard/formulaire")
  assert.ok(
    !clesRendues(apres.text).includes("f_pointure"),
    "la question enlevée est revenue (clés rendues : " + clesRendues(apres.text).join(", ") + ")",
  )
})

test("l'allure est pliée dans un tiroir, jamais supprimée", async () => {
  const page = await req("/dashboard/formulaire")
  /* le tiroir existe et contient le modèle, la couleur et le bouton */
  assert.match(page.text, /class="tiroir"/, "le tiroir a disparu")
  assert.match(page.text, /Plus de r&eacute;glages|Plus de réglages/, "le tiroir n'a pas de titre")
  /* et rien n'a été supprimé : les réglages sont toujours dans la page */
  assert.match(page.text, /name="form_model"/, "le choix du modèle a été supprimé de la page")
  assert.match(page.text, /name="form_color"/, "le choix de la couleur a été supprimé de la page")
  assert.match(page.text, /name="btn_text"/, "le réglage du bouton a été supprimé de la page")
})
