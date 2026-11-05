/* LE PARCOURS D'UN VRAI CLIENT, DE BOUT EN BOUT.

   En entrant dans le Studio pour y changer un thème, on est tombé sur des
   choses qui ne marchaient pas du tout côté client :

   1. les produits de la page d'accueil n'étaient PAS CLIQUABLES : le client
      voyait un catalogue dont aucune carte ne s'ouvrait ;
   2. la fiche produit était servie par l'ANCIEN moteur : le client changeait
      de décor en cliquant sur un produit ;
   3. le formulaire de commande n'envoyait RIEN : aucun champ n'avait de nom
      et le bouton n'était branché sur rien. Le marchand ne recevait aucune
      commande, sans que rien ne le signale.

   Ce fichier fait le parcours complet, comme un client : il clique, il
   remplit, il commande, et il vérifie que la commande arrive en base.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")
const { DatabaseSync } = require("node:sqlite")

const { startServer } = require("./boot")
const { JSDOM, VirtualConsole } = require("jsdom")

const DB = path.join(os.tmpdir(), `novadz-client-${Date.now()}.db`)
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

async function ouvrir(url, attendre) {
  const page = await req(url)
  assert.equal(page.status, 200, `${url} doit répondre`)
  const err = []
  const vc = new VirtualConsole()
  vc.on("jsdomError", (e) => { if (!/Could not parse CSS|Not implemented/.test(e.message)) err.push(e.message.slice(0, 140)) })
  const dom = new JSDOM(page.text, {
    runScripts: "dangerously", pretendToBeVisual: true, url: BASE + url, virtualConsole: vc,
    beforeParse(win) {
      win.fetch = (u, o) => fetch(BASE + String(u), { ...(o || {}), headers: { ...((o || {}).headers || {}), cookie: cookieHeader() } })
      win.matchMedia = win.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
      win.scrollTo = () => {}
      win.open = () => null
    },
  })
  await new Promise((r) => setTimeout(r, attendre || 2000))
  return { doc: dom.window.document, win: dom.window, err, close: () => dom.window.close() }
}
const decor = (d) => {
  const s = d.querySelector("#site")
  return s && s.firstElementChild ? s.firstElementChild.className.split(" ")[1] : "-"
}

before(async () => {
  const started = await startServer({ db: DB })
  BASE = started.base
  child = started.child
  jar.clear()
  await req("/signup", form({
    kind: "commerce", name: "Karim", store: "Chez Karim",
    email: `${Date.now()}${Math.random().toString(36).slice(2, 6)}@client.test.dz`,
    password: "test1234", password2: "test1234",
  }))
  SLUG = "chez-karim"
  await req("/dashboard/products", form({ title: "Montre acier", price: "4500", stock: "5", active: "1" }))
  await req("/dashboard/products", form({ title: "Parfum rose", price: "3200", stock: "4", active: "1" }))
  /* le marchand ouvre son Studio (le site se construit) puis publie */
  const st = await ouvrir("/dashboard/studio", 2600)
  st.close()
  const d = await (await req("/dashboard/studio/design")).json()
  await req("/dashboard/studio/design/publish", json({ state: d.draft || d.live }))
  const db = new DatabaseSync(DB, { readOnly: true })
  const sid = db.prepare("SELECT id FROM stores WHERE slug = ?").get(SLUG).id
  PRODUIT = db.prepare("SELECT id, title FROM products WHERE store_id = ? ORDER BY id").get(sid)
  db.close()
})
after(() => {
  if (child) child.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

test("sur la page d'accueil, chaque produit est cliquable et mène à sa fiche", async () => {
  const acc = await ouvrir("/" + SLUG)
  const cartes = [...acc.doc.querySelectorAll("#site a.card")]
  assert.ok(cartes.length >= 2, `les produits doivent être cliquables (${cartes.length} lien(s) trouvé(s))`)
  for (const a of cartes) {
    assert.match(a.getAttribute("href") || "", new RegExp(`^/${SLUG}/p/\\d+$`), "une carte mène à la fiche du produit")
  }
  acc.close()
})

test("la fiche produit a le même décor que l'accueil (pas l'ancien moteur)", async () => {
  const acc = await ouvrir("/" + SLUG)
  const accueilDecor = decor(acc.doc)
  acc.close()
  const fiche = await ouvrir(`/${SLUG}/p/${PRODUIT.id}`)
  try {
    const site = fiche.doc.querySelector("#site")
    assert.ok(site, "la fiche produit doit être servie par le même moteur que l'accueil")
    assert.equal(decor(fiche.doc), accueilDecor, "le client ne doit pas changer de décor en ouvrant un produit")
    assert.match((site.textContent || "").replace(/\s+/g, " "), /Montre acier/, "c'est bien CE produit qui est montré")
    assert.match(fiche.doc.title, /Montre acier/, "le titre de la page nomme le produit")
  } finally { fiche.close() }
})

test("le formulaire de commande a des champs nommés", async () => {
  const fiche = await ouvrir(`/${SLUG}/p/${PRODUIT.id}`)
  const f = fiche.doc.querySelector("#site form.ck")
  try {
    assert.ok(f, "le formulaire de commande est sur la fiche produit")
    const noms = [...f.querySelectorAll("input,textarea,select")].map((c) => c.name).filter(Boolean)
    for (const k of ["customer_name", "phone", "wilaya", "address"]) {
      assert.ok(noms.includes(k), `le champ « ${k} » doit porter un nom, sinon la commande part vide`)
    }
  } finally { fiche.close() }
})

test("un client remplit le formulaire, clique, et la commande est enregistrée", async () => {
  const fiche = await ouvrir(`/${SLUG}/p/${PRODUIT.id}`)
  const f = fiche.doc.querySelector("#site form.ck")
  assert.ok(f, "le formulaire est là")
  const champs = [...f.querySelectorAll("input,textarea,select")]
  const valeurs = {
    customer_name: "Amine Benali", phone: "0555123456", wilaya: "Alger",
    commune: "Bab Ezzouar", address: "Rue des Frères, n°12", note: "",
  }
  champs.forEach((c) => {
    if (valeurs[c.name] !== undefined) c.value = valeurs[c.name]
    else if (c.tagName !== "SELECT") c.value = "—"
    c.dispatchEvent(new fiche.win.Event("input", { bubbles: true }))
  })
  f.querySelector(".ck-btn").dispatchEvent(new fiche.win.MouseEvent("click", { bubbles: true }))
  await new Promise((r) => setTimeout(r, 3000))

  /* ce que le client VOIT */
  const dit = fiche.doc.querySelector(".ck-dit")
  const texte = dit ? (dit.textContent || "").replace(/\s+/g, " ").trim() : ""
  let commandes = []
  let ref = ""
  try {
    assert.match(texte, /Commande envoyée/, `le client doit voir une confirmation (lu : « ${texte} »)`)
    ref = (texte.match(/NDZ-[A-Z0-9]+/) || [""])[0]
    assert.ok(ref, "la confirmation donne un numéro de suivi")

    /* et ce que le marchand REÇOIT */
    const db = new DatabaseSync(DB, { readOnly: true })
    commandes = db.prepare("SELECT ref, customer_name, phone FROM orders").all()
    db.close()
    assert.equal(commandes.length, 1, `une commande doit être enregistrée (${commandes.length})`)
    assert.equal(commandes[0].customer_name, "Amine Benali", "la commande porte le nom du client")
    assert.equal(commandes[0].phone, "0555123456", "et son téléphone")
  } finally {
    fiche.close()
    for (const f2 of [DB, DB + "-wal", DB + "-shm"]) { try { fs.statSync(f2) } catch (_) {} }
  }
})

test("le panier est servi par le même moteur, sans article inventé", async () => {
  const pan = await ouvrir("/" + SLUG + "/cart")
  try {
    const site = pan.doc.querySelector("#site")
    assert.ok(site, "le panier doit être servi par le même moteur")
    assert.equal(decor(pan.doc), "electro", "même décor que l'accueil")
    /* un visiteur qui n'a rien ajouté ne doit pas voir un article inventé */
    const lignes = site.querySelectorAll(".ln")
    assert.equal(lignes.length, 0, "un panier vide reste vide : jamais de faux article")
  } finally { pan.close() }
})
