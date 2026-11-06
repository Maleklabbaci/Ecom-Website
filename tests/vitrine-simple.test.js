/* LA VITRINE, SIMPLE.

   Le marchand : « ya trop trop trop de case et tout mais mal fait mal ».
   Le tableau de bord a déjà été rangé (tests/interface-simple.test.js).
   Restait le côté client — la vitrine, celle que voit l'acheteur.

   Avant, une fiche produit posait DOUZE cases d'un coup, avec la liste des
   69 wilayas dépliée au milieu : la page faisait 2 122 px de haut et le
   client devait remplir son adresse avant même d'avoir choisi sa taille.
   Le bloc « Une question pour la boutique » était déplié en bas de CHAQUE
   page, accueil, fiche, panier et commande.

   Les mêmes quatre règles, appliquées à la vitrine :

     1. une page pose trois questions, le reste est PLIÉ ;
     2. RIEN n'est supprimé — les champs pliés sont toujours dans la page ;
     3. un seul bouton en couleur par écran ;
     4. sans JavaScript, tout se rouvre et la commande passe quand même.

   Si un jour quelqu'un remet douze cases sur une fiche produit, ce fichier
   le dit.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")
const { DatabaseSync } = require("node:sqlite")
const { JSDOM } = require("jsdom")

const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-vitrine-${Date.now()}.db`)
let BASE = ""
let child = null
let SLUG = ""
let PRODUIT = null
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

/** Ce que l'ACHETEUR voit en arrivant : sans les plis fermés, sans les champs cachés. */
function casesVisibles(html) {
  const dom = new JSDOM(String(html || ""))
  const d = dom.window.document
  d.querySelectorAll("details:not([open])").forEach((n) => n.remove())
  d.querySelectorAll(".ck-step2").forEach((n) => n.remove())
  const vus = [...d.querySelectorAll("input,select,textarea")].filter((e) => {
    const t = (e.getAttribute("type") || "text").toLowerCase()
    return t !== "hidden" && t !== "radio" && t !== "checkbox"
  })
  const tout = [...d.querySelectorAll("input,select,textarea")].filter((e) => (e.getAttribute("type") || "text").toLowerCase() !== "hidden")
  dom.window.close()
  return { vus: vus.length, noms: vus.map((e) => e.getAttribute("name") || ""), tout: tout.length }
}

before(async () => {
  const started = await startServer({ db: DB })
  BASE = started.base
  child = started.child
  jar.clear()
  /* la boutique de démonstration : c'est la seule qui ait déjà le formulaire
     de commande posé sur la fiche produit (réglage « formulaire en ligne ») */
  const ok = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.equal(ok.status, 302, "la connexion de démonstration doit marcher")
  const db = new DatabaseSync(DB, { readOnly: true })
  const boutique = db.prepare(
    "SELECT s.id, s.slug FROM stores s JOIN users u ON u.id = s.owner_id WHERE u.email = 'demo@novadz.dz' ORDER BY s.id LIMIT 1").get()
  SLUG = boutique.slug
  PRODUIT = db.prepare("SELECT id, title FROM products WHERE store_id = ? AND active = 1 ORDER BY id LIMIT 1").get(boutique.id)
  db.close()
  assert.ok(PRODUIT, "la boutique de démonstration doit avoir un produit")
  /* le marchand ouvre une fois l'écran Formulaire : sa fiche produit affiche
     alors le formulaire de commande en ligne — c'est le cas le plus long,
     celui qu'on mesure ici. */
  await req("/dashboard/formulaire", form({ form_model: "classique" }))
})

after(() => {
  if (child) child.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

test("1. une fiche produit pose trois questions, pas douze", async () => {
  const fiche = await req(`/${SLUG}/p/${PRODUIT.id}`)
  assert.equal(fiche.status, 200)
  const v = casesVisibles(fiche.text)
  assert.ok(v.vus <= 3, `la fiche produit doit poser 3 questions au plus (${v.vus} : ${v.noms.join(", ")})`)
})

test("2. rien n'est supprimé : les sept champs du marchand restent dans la page", async () => {
  const fiche = await req(`/${SLUG}/p/${PRODUIT.id}`)
  for (const n of ["customer_name", "phone", "wilaya", "commune", "address", "note", "email"]) {
    assert.ok(fiche.text.includes(`name="${n}"`), `le champ « ${n} » doit toujours être dans la fiche produit`)
  }
  assert.ok(/class="ck-step2"[^>]*data-ck-step="2"/.test(fiche.text), "les coordonnées sont rangées dans un pli")
})

test("3. sans JavaScript, le pli se rouvre tout seul", async () => {
  const fiche = await req(`/${SLUG}/p/${PRODUIT.id}`)
  assert.match(fiche.text, /<noscript><style>\.ck-step2\{display:block !important\}<\/style><\/noscript>/,
    "sans JavaScript le formulaire doit rester entièrement visible")
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8")
  assert.match(css, /\.ck-step2:not\(\.ck-open\)\s*\{\s*display:\s*none/, "le pli fermé est masqué par la feuille de style")
})

test("4. la quantité revient avant l'adresse (elle était tombée tout en bas)", async () => {
  const fiche = await req(`/${SLUG}/p/${PRODUIT.id}`)
  const q = fiche.text.indexOf('name="buy_qty"')
  const nom = fiche.text.indexOf('name="customer_name"')
  assert.ok(q > -1 && nom > -1, "la quantité et le nom sont dans la fiche")
  assert.ok(q < nom, "la quantité doit venir avant les coordonnées")
})

test("5. « Ma position » passe devant la wilaya : un clic remplit les deux", async () => {
  await req(`/${SLUG}/cart`, form({ product_id: String(PRODUIT.id) }))
  const co = await req(`/${SLUG}/checkout`)
  assert.equal(co.status, 200)
  const geo = co.text.indexOf("ck-geo")
  const wil = co.text.indexOf('name="wilaya"')
  assert.ok(geo > -1 && wil > -1, "le bloc position et la wilaya sont dans la page de commande")
  assert.ok(geo < wil, "« Ma position » doit venir avant la wilaya, puisqu'il la remplit")
})

test("6. ce qui est facultatif part dans « Plus d'options »", async () => {
  const co = await req(`/${SLUG}/checkout`)
  const plus = co.text.match(/<details class="ck-more">[\s\S]*?<\/details>/)
  assert.ok(plus, "un pli « Plus d'options » doit exister")
  assert.match(plus[0], /name="note"/, "la note est dans le pli")
  assert.match(plus[0], /name="email"/, "l'e-mail est dans le pli")
  assert.doesNotMatch(co.text.replace(/<details class="ck-more">[\s\S]*?<\/details>/, ""), /name="email"/,
    "l'e-mail ne doit plus être à l'air libre")
})

test("7. la question à la boutique est pliée au lieu d'être dépliée partout", async () => {
  for (const url of [`/` + SLUG, `/${SLUG}/p/${PRODUIT.id}`, `/${SLUG}/checkout`]) {
    const r = await req(url)
    assert.ok(/<details class="ndz-askbox"/.test(r.text), `${url} : le bloc question doit être plié`)
    assert.doesNotMatch(r.text, /<details class="ndz-askbox"[^>]*\bopen\b/, `${url} : le bloc question ne doit pas être ouvert`)
  }
})

test("8. la commande passe quand même, avec tous les champs", async () => {
  const avant = (() => {
    const db = new DatabaseSync(DB, { readOnly: true })
    const n = db.prepare("SELECT COUNT(*) c FROM orders").get().c
    db.close()
    return n
  })()
  const r = await req(`/${SLUG}/checkout`, form({
    buy_id: String(PRODUIT.id), buy_qty: "1", delivery: "home",
    customer_name: "Amine Benali", phone: "0555123456",
    wilaya: "Alger", commune: "Bab Ezzouar", address: "Cité 200 logements Bt B",
    note: "", email: "",
  }))
  assert.ok([200, 302].includes(r.status), `la commande doit aboutir (HTTP ${r.status})`)
  const db = new DatabaseSync(DB, { readOnly: true })
  const apres = db.prepare("SELECT COUNT(*) c FROM orders").get().c
  const derniere = db.prepare("SELECT customer_name, wilaya, address FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()
  assert.equal(apres, avant + 1, "une commande doit être enregistrée")
  assert.equal(derniere.customer_name, "Amine Benali")
  assert.equal(derniere.wilaya, "Alger")
  assert.equal(derniere.address, "Cité 200 logements Bt B")
})

test("9. le panier reste une page courte", async () => {
  await req(`/${SLUG}/cart`, form({ product_id: String(PRODUIT.id) }))
  const p = await req(`/${SLUG}/cart`)
  const v = casesVisibles(p.text)
  assert.ok(v.vus <= 3, `le panier doit rester court (${v.vus} : ${v.noms.join(", ")})`)
})

test("10. le marchand retrouve ses champs dans le Formulaire du tableau de bord", async () => {
  const f = await req("/dashboard/formulaire")
  assert.equal(f.status, 200)
  for (const n of ["customer_name", "phone", "wilaya", "commune", "address", "note", "email"]) {
    assert.ok(f.text.includes(n), `le champ « ${n} » reste réglable par le marchand`)
  }
})
