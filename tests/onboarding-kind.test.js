/* Le premier écran ne pose que les questions du site choisi :
   - « vendre en ligne » → produit, commandes, wilaya de livraison ;
   - « montrer ce que je fais » → métier, contact, aucune question de boutique.
   Les deux versions sont dans la page, une seule est visible (la bascule se
   fait sans rechargement, et le serveur garde le bon choix). */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-onb-${Date.now()}.db`)
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

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const s = await startServer({ db: DB }); server = s.child; BASE = s.base
})
after(() => { if (server) server.kill(); try { fs.unlinkSync(DB) } catch (_) {} })

test("nouveau compte e-commerce : le premier écran parle boutique", async () => {
  const mail = `c-${Date.now()}@t.dz`
  await req("/signup", form({ kind: "commerce", store: "Boutique Essai", name: "Essai", email: mail, password: "secret1", password2: "secret1" }))
  const p = await req("/demarrer")
  assert.equal(p.status, 200)
  assert.match(p.text, /class="start-wrap" data-kind="commerce"/, "l'écran part sur le choix fait à l'inscription")
  assert.match(p.text, /Qu'est-ce que vous vendez \?/, "on demande ce qui est vendu")
  assert.match(p.text, /Wilaya \(livraison\)/, "la wilaya sert à la livraison")
  assert.match(p.text, /sert à confirmer les commandes/, "les commandes sont expliquées")
  /* la version vitrine est là mais masquée par la règle CSS */
  assert.match(p.text, /data-kind="commerce"\] \[data-k="vitrine"\]\{display:none\}/)
  assert.match(p.text, /data-k="vitrine">3\. Où et comment vous joindre \?</, "le texte vitrine n'est pas demandé")
})

test("nouveau compte vitrine : aucune question de boutique", async () => {
  jar.clear()
  const mail = `v-${Date.now()}@t.dz`
  const su = await req("/signup", form({ kind: "vitrine", store: "Atelier Photo", name: "Photo", email: mail, password: "secret1", password2: "secret1" }))
  assert.equal(su.status, 302)
  const p = await req("/demarrer")
  assert.match(p.text, /class="start-wrap" data-kind="vitrine"/)
  assert.match(p.text, /Quel est votre métier \?/, "on demande le métier, pas un produit")
  assert.match(p.text, /Ville \(wilaya\)/, "la ville remplace la wilaya de livraison")
  assert.match(p.text, /Pas de commande ni de livraison à préparer/, "on le dit clairement")
  assert.match(p.text, /Créer mon site/, "le bouton parle de site")
  assert.match(p.text, /data-kind="vitrine"\] \[data-k="commerce"\]\{display:none\}/)
})

test("changer d'avis sur le premier écran change tout de suite les questions", async () => {
  jar.clear()
  const mail = `b-${Date.now()}@t.dz`
  await req("/signup", form({ kind: "commerce", store: "Bascule Test", name: "Bascule", email: mail, password: "secret1", password2: "secret1" }))
  const p = await req("/demarrer")
  /* la bascule est côté page : les deux textes sont présents, un seul visible */
  assert.match(p.text, /input\[name=kind\]/)
  assert.match(p.text, /setAttribute\('data-kind', r\.value\)/, "le changement met la page à jour")
  /* et le serveur enregistre bien le choix final */
  await req("/demarrer", form({ kind: "vitrine", metier: "services", phone: "0555 12 34 56", wilaya: "Blida" }))
  const after = await req("/demarrer")
  assert.match(after.text, /data-kind="vitrine"/, "le serveur garde le choix vitrine")
})
