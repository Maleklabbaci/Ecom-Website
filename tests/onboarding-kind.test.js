/* Le premier écran ne pose que les questions du site choisi :
   - « vendre en ligne » → produit, commandes, wilaya de livraison ;
   - « montrer ce que je fais » → activité, contact, aucune question de boutique.
   Un seul formulaire est envoyé, celui du type de site enregistré à
   l'inscription : les deux ne sont jamais mélangés dans la même page.
   Tous les champs demandés sont obligatoires. */
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
const compte = async (kind, store) => {
  jar.clear()
  const mail = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}@t.dz`
  await req("/signup", form({ kind, store, name: "Essai", email: mail, password: "secret1", password2: "secret1" }))
  return req("/demarrer")
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const s = await startServer({ db: DB }); server = s.child; BASE = s.base
})
after(() => { if (server) server.kill(); try { fs.unlinkSync(DB) } catch (_) {} })

test("nouveau compte e-commerce : le premier écran parle boutique", async () => {
  const p = await compte("commerce", "Boutique Essai")
  assert.equal(p.status, 200)
  assert.match(p.text, /class="start-wrap" data-kind="commerce"/, "l'écran part sur le choix fait à l'inscription")
  assert.match(p.text, /Ce que vous vendez/, "on demande ce qui est vendu")
  assert.match(p.text, /Le nom de votre boutique/, "on nomme la boutique")
  assert.match(p.text, /Wilaya \(livraison\)/, "la wilaya sert à la livraison")
  assert.match(p.text, /sert à confirmer les commandes/, "les commandes sont expliquées")
  /* aucune question de vitrine dans cette page */
  assert.ok(!/Ville \(wilaya\)/.test(p.text), "pas de champ « ville » de vitrine")
  assert.ok(!/Aucun produit, aucun panier/.test(p.text), "pas de discours vitrine")
  assert.ok(!/data-k="vitrine"/.test(p.text), "l'autre formulaire n'est pas dans la page")
  assert.ok(!/name="project"/.test(p.text), "la boutique ne demande pas de « projet »")
})

test("nouveau compte vitrine : aucune question de boutique", async () => {
  const p = await compte("vitrine", "Atelier Photo")
  assert.match(p.text, /class="start-wrap" data-kind="vitrine"/)
  assert.match(p.text, /Votre activité/, "on demande l'activité, pas un produit")
  assert.match(p.text, /Le nom de votre site/)
  assert.match(p.text, /Ville \(wilaya\)/, "la ville remplace la wilaya de livraison")
  assert.match(p.text, /name="project" required/, "la vitrine dit son projet en une phrase")
  assert.match(p.text, /Votre projet en une phrase/)
  assert.match(p.text, /Pas de commande ni de livraison à préparer/, "on le dit clairement")
  assert.match(p.text, /Créer mon site/, "le bouton parle de site")
  assert.ok(!/Wilaya \(livraison\)/.test(p.text), "aucune question de livraison")
  assert.ok(!/data-k="commerce"/.test(p.text), "l'autre formulaire n'est pas dans la page")
  /* le métier « téléphones et électronique » n'est pas proposé à une vitrine */
  assert.ok(!/value="tech"/.test(p.text), "liste de métiers propre à la vitrine")
  assert.match(p.text, /value="services"/, "les services sont proposés à une vitrine")

  /* le projet est obligatoire, vérifié aussi par le serveur */
  const sansProjet = await req("/demarrer", form({ store_name: "Atelier Photo", metier: "services", phone: "0555 12 34 56", wilaya: "Blida", project: "" }))
  assert.equal(sansProjet.status, 400, "sans projet, l'envoi est refusé")
  assert.match(sansProjet.text, /Dites en une phrase ce que vous faites/)
  const avecProjet = await req("/demarrer", form({ store_name: "Atelier Photo", metier: "services", phone: "0555 12 34 56", wilaya: "Blida", project: "Des portraits naturels, à Blida" }))
  assert.equal(avecProjet.status, 302, "avec le projet, ça passe")
  assert.match(avecProjet.location, /\/dashboard\/studio/, "une vitrine arrive dans le Studio")
})

test("tous les champs du premier écran sont obligatoires", async () => {
  const p = await compte("commerce", "Champs Test")
  for (const name of ["store_name", "phone", "wilaya"]) {
    assert.match(p.text, new RegExp(`name="${name}"[^>]*\\srequired`), `${name} est obligatoire`)
  }
  assert.match(p.text, /name="metier" value="[a-z]+" required/, "le métier est obligatoire")

  const sansNom = await req("/demarrer", form({ store_name: "", metier: "mode", phone: "0555 12 34 56", wilaya: "Blida" }))
  assert.equal(sansNom.status, 400)
  assert.match(sansNom.text, /Le nom de votre boutique est obligatoire/)

  const sansTel = await req("/demarrer", form({ store_name: "Champs Test", metier: "mode", phone: "12", wilaya: "Blida" }))
  assert.equal(sansTel.status, 400)
  assert.match(sansTel.text, /au moins 9 chiffres/)

  const sansWilaya = await req("/demarrer", form({ store_name: "Champs Test", metier: "mode", phone: "0555 12 34 56", wilaya: "" }))
  assert.equal(sansWilaya.status, 400)
  assert.match(sansWilaya.text, /Choisissez votre wilaya/)

  /* un métier de vitrine envoyé par une boutique est refusé, pas enregistré */
  const melange = await req("/demarrer", form({ store_name: "Champs Test", metier: "services", phone: "0555 12 34 56", wilaya: "Blida" }))
  assert.equal(melange.status, 400)
  assert.match(melange.text, /pas proposé pour une boutique/)
})

test("changer d'avis change de formulaire, et le serveur garde le choix", async () => {
  const p = await compte("commerce", "Bascule Test")
  assert.match(p.text, /action="\/demarrer\/type"/, "la bascule est un vrai choix envoyé au serveur")

  const change = await req("/demarrer/type", form({ kind: "vitrine" }))
  assert.equal(change.status, 302)
  const apres = await req("/demarrer")
  assert.match(apres.text, /data-kind="vitrine"/, "le serveur garde le choix vitrine")
  assert.match(apres.text, /Votre activité/)
  assert.ok(!/Wilaya \(livraison\)/.test(apres.text), "les questions de boutique ont disparu")

  /* le prénom saisi à l'inscription est repris dans le nom de la boutique */
  const fin = await req("/demarrer", form({ store_name: "Atelier Bascule", metier: "services", phone: "0555 12 34 56", wilaya: "Blida", project: "Des bijoux faits main, à Blida" }))
  assert.equal(fin.status, 302)
  assert.match(fin.location, /\/dashboard/, "on arrive dans l'espace de travail")
  const encore = await req("/demarrer")
  assert.match(encore.text, /value="Atelier Bascule"/, "le nom saisi est enregistré")
  assert.match(encore.text, /value="0555 12 34 56"/, "le téléphone est enregistré")
})
