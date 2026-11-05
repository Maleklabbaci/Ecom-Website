/* ON REGARDE VRAIMENT CE QUE LE MARCHAND VOIT.

   Ce fichier existe parce que des défauts sont passés à travers les tests
   habituels : ils vérifiaient le code, pas l'écran. Ici on charge les pages
   dans un navigateur factice (jsdom), on exécute les scripts, et on regarde
   ce qui apparaît.

   Trois choses qu'on ne veut plus jamais revoir :
     1. un grand titre VIDE en haut de la boutique ;
     2. une image cassée (<img src="">) sur une carte produit sans photo ;
     3. une étape du guide qui allume quatre éléments au lieu d'un seul —
        ou qui n'en allume aucun.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer } = require("./boot")
const { JSDOM, VirtualConsole } = require("jsdom")
const PARCOURS = require("../src/parcours")

const DB = path.join(os.tmpdir(), `novadz-visuel-${Date.now()}.db`)
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

/* charge une page et RÉELLEMENT exécute ses scripts */
async function voir(p, url) {
  const page = await req(p)
  assert.equal(page.status, 200, `${p} doit répondre`)
  const vc = new VirtualConsole()
  const err = []
  vc.on("jsdomError", (e) => { if (!/Could not parse CSS|Not implemented/.test(e.message)) err.push(e.message.slice(0, 120)) })
  const dom = new JSDOM(page.text, {
    runScripts: "dangerously", pretendToBeVisual: true, url: BASE + (url || p), virtualConsole: vc,
    beforeParse(win) {
      win.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, draft: null, live: null }), text: () => Promise.resolve("") })
      win.matchMedia = win.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
      win.scrollTo = () => {}
      win.open = () => null
    },
  })
  await new Promise((r) => setTimeout(r, 600))
  return { dom, doc: dom.window.document, err, close: () => dom.window.close() }
}

/* même chose, mais les appels réseau partent VRAIMENT au serveur : le Studio
   peut donc enregistrer son brouillon, comme dans un navigateur. */
async function voirEnVrai(p, url) {
  const page = await req(p)
  assert.equal(page.status, 200)
  const vc = new VirtualConsole()
  const err = []
  vc.on("jsdomError", (e) => { if (!/Could not parse CSS|Not implemented/.test(e.message)) err.push(e.message.slice(0, 120)) })
  const dom = new JSDOM(page.text, {
    runScripts: "dangerously", pretendToBeVisual: true, url: BASE + (url || p), virtualConsole: vc,
    beforeParse(win) {
      win.fetch = (u, o) => fetch(BASE + String(u), {
        ...(o || {}),
        headers: { ...((o || {}).headers || {}), cookie: cookieHeader(), "Content-Type": "application/json" },
      })
      win.matchMedia = win.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
      win.scrollTo = () => {}
      win.open = () => null
    },
  })
  await new Promise((r) => setTimeout(r, 1200))
  return { dom, doc: dom.window.document, err, close: () => dom.window.close() }
}

before(async () => {
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
  await req("/signup", form({
    kind: "commerce", name: "Karim", store: "Chez Karim", email: `{Date.now()}{Math.random().toString(36).slice(2,6)}@vu.test.dz`,
    password: "test1234", password2: "test1234",
  }))
})

after(() => {
  if (server) server.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

/* ------------------------------------------------------------------ 1 */

test("boutique vide : le grand titre n'est jamais un trou blanc", async () => {
  const { doc, close } = await voir("/dashboard/studio")
  const site = doc.querySelector("#site")
  assert.ok(site, "le canvas du site existe")
  const h2 = site.querySelector("h1, h2, h3")
  assert.ok(h2, "il y a un titre")
  const titre = (h2.textContent || "").trim()
  assert.ok(titre.length > 0, "le grand titre n'est pas vide")
  assert.match(titre, /Chez Karim|Votre boutique|Livraison/, `titre lisible, trouvé : « ${titre} »`)
  close()
})

test("aucune image cassée, même sans photo produit", async () => {
  const { doc, close } = await voir("/dashboard/studio")
  const imgs = [...doc.querySelectorAll("#site img")]
  for (const im of imgs) {
    const src = im.getAttribute("src")
    assert.ok(src && src.trim().length > 0, `aucune image sans source (trouvé src="${src}")`)
  }
  close()
})

test("pas de ligne « Téléphone » suivie de rien", async () => {
  const { doc, close } = await voir("/dashboard/studio")
  const rows = [...doc.querySelectorAll("#site .contact > div")]
  for (const r of rows) {
    const b = (r.querySelector("b") || {}).textContent || ""
    const v = (r.querySelector("span") || {}).textContent || ""
    assert.ok(v.trim().length > 0, `la ligne « ${b.trim()} » a une valeur`)
  }
  close()
})

test("avec des produits : ils s'affichent, avec une vignette même sans photo", async () => {
  await req("/dashboard/products", form({ title: "Montre en acier", price: "8500", stock: "5", active: "1" }))
  await req("/dashboard/products", form({ title: "Sac en cuir", price: "6200", stock: "3", active: "1" }))
  const { doc, close } = await voir("/dashboard/studio")
  const site = doc.querySelector("#site")
  const txt = (site.textContent || "").replace(/\s+/g, " ")
  assert.match(txt, /Montre en acier/)
  assert.match(txt, /Sac en cuir/)
  /* vignettes : ni image cassée, ni case vide */
  const imgs = [...site.querySelectorAll("img")]
  for (const im of imgs) assert.ok((im.getAttribute("src") || "").trim(), "pas d'image sans source")
  const vignettes = site.querySelectorAll(".nop")
  assert.ok(imgs.length + vignettes.length >= 2, "chaque produit a une image ou une vignette")
  close()
})

/* ------------------------------------------------------------------ 2 */

test("les 8 étapes du guide allument CHACUNE un seul élément", async () => {
  const pages = {
    "/dashboard/settings": null, "/dashboard/products/new": null, "/dashboard/categories": null,
    "/dashboard/formulaire": null, "/dashboard/studio": null, "/dashboard/stats": null,
  }
  for (const p of Object.keys(pages)) pages[p] = await voir(p)

  for (const et of PARCOURS.STEPS) {
    const v = pages[et.page]
    assert.ok(v, `page chargée pour l'étape ${et.n} (${et.id})`)
    let total = 0
    const trouves = []
    for (const sel of String(et.cible).split(",")) {
      try {
        const els = v.doc.querySelectorAll(sel.trim())
        total += els.length
        if (els.length) trouves.push(els[0].tagName.toLowerCase())
      } catch (_) {}
    }
    assert.equal(total, 1, `étape ${et.n}/8 « ${et.id} » : 1 seul élément allumé, trouvé ${total} avec "${et.cible}"`)
  }
  for (const k of Object.keys(pages)) if (pages[k]) pages[k].close()
})

test("le guide s'affiche sans erreur JavaScript", async () => {
  const { doc, err, close } = await voir("/dashboard/settings")
  const tour = doc.querySelector("#ndzTour")
  assert.ok(tour, "le bloc du guide est dans la page")
  assert.equal(err.length, 0, "aucune erreur JS : " + err.join(" | "))
  close()
})

test("la carte du guide a une barre de progression et les deux sorties", async () => {
  const { doc, close } = await voir("/dashboard/settings")
  assert.ok(doc.querySelector(".tour-bar"), "la barre « Étape 3 sur 8 » est dessinée")
  assert.ok(doc.querySelector("#tourPasser"), "on peut passer")
  assert.ok(doc.querySelector("#tourOff"), "on peut arrêter le guide")
  assert.ok(doc.querySelector("#tourFaire"), "il y a un bouton pour faire l'étape")
  close()
})

test("ouvrir le Studio crée le brouillon : l'aperçu montre ce site, pas l'ancien", async () => {
  /* une boutique neuve, jamais ouverte dans le Studio */
  jar.clear()
  await req("/signup", form({
    kind: "commerce", name: "Nadia", store: "Chez Nadia", email: `{Date.now()}{Math.random().toString(36).slice(2,6)}@apercu.test.dz`,
    password: "test1234", password2: "test1234",
  }))
  await req("/dashboard/products", form({ title: "Parfum rose", price: "4200", stock: "4", active: "1" }))
  const slug = "chez-nadia"

  /* AVANT : aucun brouillon, l'aperçu montre encore la page d'avant */
  const avant = await req(`/${slug}?preview=1`)
  assert.equal(avant.status, 200)
  assert.equal(avant.text.includes("NDZ_STUDIO"), false, "avant ouverture : pas encore de site Studio")

  /* on ouvre le Studio comme un vrai navigateur : il construit le site et l'enregistre */
  const v = await voirEnVrai("/dashboard/studio")
  v.close()

  /* APRÈS : l'aperçu montre le site du Studio */
  const apres = await req(`/${slug}?preview=1`)
  assert.equal(apres.status, 200)
  assert.ok(apres.text.includes("NDZ_STUDIO"), "après ouverture : l'aperçu sert bien le site du Studio")

  const vc = new VirtualConsole()
  const dom = new JSDOM(apres.text, {
    runScripts: "dangerously", pretendToBeVisual: true, url: BASE + `/${slug}?preview=1`, virtualConsole: vc,
    beforeParse(win) {
      win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve("") })
      win.matchMedia = win.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
      win.scrollTo = () => {}
    },
  })
  await new Promise((r) => setTimeout(r, 1500))
  const site = dom.window.document.querySelector("#site")
  assert.ok(site && site.innerHTML.length > 300, `l'aperçu montre le site (${site ? site.innerHTML.length : 0} caractères)`)
  const txt = (site.textContent || "").replace(/\s+/g, " ")
  assert.match(txt, /Parfum rose/, "le produit du marchand est dans l'aperçu")
  assert.match(txt, /Chez Nadia/, "le nom de la boutique est dans l'aperçu")
  dom.window.close()
})
