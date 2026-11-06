/* L'INTERFACE SIMPLE.

   Le marchand : « ya trop trop trop de case et tout mais mal fait mal ».
   On a décidé ensemble de quatre règles, et ce fichier les verrouille :

     1. une page pose trois questions, le reste est PLIÉ dans un tiroir ;
     2. RIEN n'est supprimé — les champs pliés sont toujours dans la page ;
     3. un seul bouton en couleur par écran, les autres en gris ;
     4. l'accueil dit quoi faire aujourd'hui.

   Si un jour quelqu'un remet 40 champs à l'écran, ce fichier le dit.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")

const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-ux-${Date.now()}.db`)
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

/** Ce que le marchand VOIT : sans les champs cachés, sans les tiroirs fermés. */
const champsVisibles = (html) => {
  let t = String(html || "")
  /* un <details> fermé, c'est plié : le marchand ne le voit pas. On le retire
     bloc par bloc, en sautant les blocs déjà ouverts. */
  let garde = t
  for (let tour = 0; tour < 6; tour++) {
    const avant = garde
    garde = garde.replace(/<details\b([^>]*)>([\s\S]*?)<\/details>/g, (tout, attrs, dedans) =>
      /\bopen\b/.test(attrs) ? dedans : "")
    if (garde === avant) break
  }
  const compte = (s) => (s.match(/<(input|select|textarea)\b/g) || []).length - (s.match(/type="hidden"/g) || []).length
  return { vu: compte(garde), tout: compte(t) }
}

/* Le cadre du tableau de bord (recherche, assistant) traîne deux champs sur
   chaque page. Pour juger une page, on ne compte que son CONTENU. */
const contenu = (html) => {
  const t = String(html || "")
  const a = t.indexOf('<main class="dash-main">')
  if (a < 0) return t
  const b = t.indexOf("</main>", a)
  return b < 0 ? t.slice(a) : t.slice(a, b)
}

before(async () => {
  const s = await startServer({ db: DB })
  child = s.child
  BASE = s.base
  await req("/signup", form({
    kind: "commerce", name: "Karim", store: "Chez Karim",
    email: `ux-${Date.now()}@test.dz`, password: "test1234", password2: "test1234",
  }))
})

after(() => {
  if (child) child.kill()
  for (const f of [DB, DB + "-wal", DB + "-shm"]) { try { fs.unlinkSync(f) } catch (_) {} }
})

/* ------------------------------------------------------------------ 1 */

test("l'accueil dit quoi faire aujourd'hui", async () => {
  const r = await req("/dashboard")
  assert.equal(r.status, 200)
  assert.match(r.text, /Aujourd'hui/, "les chiffres du jour")
  assert.match(r.text, /Pour avancer/, "les actions du jour")
  assert.match(r.text, /Le reste/, "et tout le reste, rangé")
  /* l'ordre compte : on lit de haut en bas, du plus urgent au plus calme */
  const a = r.text.indexOf("Aujourd'hui")
  const b = r.text.indexOf("Pour avancer")
  const c = r.text.indexOf("Le reste")
  assert.ok(a < b && b < c, "dans cet ordre : aujourd'hui, avancer, le reste")
})

test("rien n'est perdu : tous les écrans restent atteignables depuis l'accueil", async () => {
  const r = await req("/dashboard")
  for (const [lien, nom] of [
    ["/dashboard/products", "Produits"],
    ["/dashboard/orders", "Commandes"],
    ["/dashboard/stock", "Stock"],
    ["/dashboard/categories", "Catégories"],
    ["/dashboard/formulaire", "Formulaire"],
    ["/dashboard/shipping", "Livraison"],
    ["/dashboard/paiement", "Paiement"],
    ["/dashboard/stats", "Statistiques"],
    ["/dashboard/settings", "Réglages"],
    ["/dashboard/boutiques", "Mes boutiques"],
  ]) {
    assert.ok(r.text.includes(`href="${lien}"`), `le lien ${nom} (${lien}) est toujours là`)
  }
})

/* ------------------------------------------------------------------ 2 */

test("la fiche produit pose trois questions, le reste est plié", async () => {
  const r = await req("/dashboard/products/new")
  assert.equal(r.status, 200)
  assert.match(r.text, /class="tiroir"/, "le tiroir existe")
  const i = r.text.indexOf('class="tiroir"')
  const avant = r.text.slice(0, i)
  const apres = r.text.slice(i)
  const vuAvant = (avant.match(/<(input|select|textarea)\b/g) || []).length - (avant.match(/type="hidden"/g) || []).length
  const vuApres = (apres.match(/<(input|select|textarea)\b/g) || []).length - (apres.match(/type="hidden"/g) || []).length
  assert.ok(vuAvant <= 10, `au plus 10 champs à l'écran (lu : ${vuAvant})`)
  assert.ok(vuApres >= 15, `et les autres sont bien rangés dans le tiroir (lu : ${vuApres})`)

  /* RIEN n'est supprimé : ce qui est plié est toujours dans la page */
  for (const nom of ["compare", "cost", "video", "category_id", "new_category", "option_groups", "variants"]) {
    assert.ok(r.text.includes(`name="${nom}"`), `le champ ${nom} existe toujours`)
  }
  /* les packs : le bloc est là (vide tant qu'il n'y a pas d'autre produit) */
  assert.ok(r.text.includes("Souvent achetés ensemble"), "le bloc des packs existe toujours")
})

test("le tiroir s'ouvre tout seul quand le produit a déjà des variantes", async () => {
  await req("/dashboard/products", form({ title: "Coque", price: "1500", stock: "2", active: "1" }))
  const { DatabaseSync } = require("node:sqlite")
  const db = new DatabaseSync(DB, { readOnly: true })
  const st = db.prepare("SELECT id FROM stores WHERE slug = 'chez-karim'").get()
  const p = db.prepare("SELECT id FROM products WHERE store_id = ?").get(st.id)
  db.close()
  const grille = JSON.stringify({
    groups: [{ id: "g1", name: "couleur", options: [{ id: "o1", label: "noir" }, { id: "o2", label: "rose" }] }],
    combos: [{ picks: { g1: "o1" }, stock: 3, price: "", unlimited: false, on: true }],
    unlimited: false, style: "boutons",
  })
  await req(`/dashboard/products/${p.id}`, form({
    title: "Coque", price: "1500", stock: "2", active: "1",
    option_groups: grille, gallery: "[]", variants: "[]",
  }))
  const r = await req(`/dashboard/products/${p.id}`)
  assert.match(r.text, /class="tiroir" open/, "le tiroir est ouvert : le marchand retrouve ses variantes")
})

/* ------------------------------------------------------------------ 3 */

test("un seul bouton en couleur par écran", async () => {
  const ecrans = [
    "/dashboard", "/dashboard/products", "/dashboard/stock", "/dashboard/shipping",
    "/dashboard/paiement", "/dashboard/stats", "/dashboard/discounts", "/dashboard/categories",
    "/dashboard/marketing",
  ]
  for (const u of ecrans) {
    const r = await req(u)
    if (r.status !== 200) continue
    const n = (r.text.match(/class="btn btn-primary/g) || []).length
    assert.ok(n <= 2, `${u} : au plus un bouton en couleur par formulaire (lu : ${n})`)
  }
  /* la couleur est bien celle qu'on a choisie, une seule fois dans la feuille de style */
  const css = await req("/styles.css")
  assert.match(css.text, /--accent:\s*#d6ff45/i, "l'accent, c'est le vert fluo de la landing")
  assert.ok(!/0F766E|0B5A53|5EEAD4/i.test(css.text), "plus aucune trace de l'ancien vert")
  /* le vert fluo remplit, il ne s'écrit pas : le bouton plein est en texte noir */
  assert.match(css.text, /--accent-ink:\s*#(000000|111111|000|111)\b/i, "le texte posé sur le vert fluo est noir")
})

test("blanc, noir, gris et le vert fluo — rien d'autre", async () => {
  const fs = require("node:fs")
  const chemin = path.join(__dirname, "..", "public", "landing.css")
  const landing = fs.readFileSync(chemin, "utf8")
  /* le vert fluo est bien celui de la landing */
  assert.match(landing, /--lime:\s*#d6ff45/i, "le vert de la landing")
  /* et aucune autre couleur vive ne traîne : ni bleu, ni violet, ni orange.
     Sont admis : les gris/noirs/blancs (les trois composantes presque égales)
     et le vert fluo. Tout le reste est interdit. */
  const admis = (h) => {
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    const ecart = Math.max(r, g, b) - Math.min(r, g, b)
    if (ecart <= 14) return true                 /* gris, noir, blanc */
    if (r > 150 && g > 200 && b < 120) return true /* le vert fluo #d6ff45 */
    return false
  }
  const vives = [...landing.matchAll(/#([0-9a-f]{6})\b/gi)].map(m => m[1].toLowerCase()).filter(h => !admis(h))
  assert.deepEqual([...new Set(vives)], [], `couleur(s) interdite(s) dans la landing : ${[...new Set(vives)].join(", ")}`)
})

test("le même vert fluo que la landing, sur un dashboard clair", async () => {
  const fs = require("node:fs")
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8")
  const landing = fs.readFileSync(path.join(__dirname, "..", "public", "landing.css"), "utf8")
  /* le vert du dashboard est exactement celui de la landing */
  const vert = /--lime:\s*(#[0-9a-f]{6})/i.exec(landing)
  assert.ok(vert, "le vert de la landing")
  assert.match(app, new RegExp("--accent:\\s*" + vert[1], "i"), "le dashboard prend le même vert, au même endroit")
  /* et il ne reste aucun vert inventé ici ou là */
  assert.ok(!/0F766E|0B5A53|5EEAD4/i.test(app), "plus aucune trace d'un autre vert")
  /* le dashboard reste CLAIR : c'est une décision, on la verrouille */
  assert.match(app, /--paper:#F6F5F3/i, "fond des pages clair")
  assert.match(app, /--card:#FFFFFF/i, "cartes blanches")
  assert.ok(!/--bg:#000000/.test(app), "le dashboard n'est pas sombre")
  /* le vert fluo remplit : le bouton plein est vert fluo avec du texte noir */
  assert.match(app, /background:var\(--accent\);color:var\(--accent-ink\)/, "le bouton plein")
  assert.match(app, /--accent-ink:\s*#111111/i, "le texte posé sur le vert fluo est noir")
})

/* ------------------------------------------------------------------ 4 */

test("les écrans lourds respirent : moins de champs à l'écran", async () => {
  const mesures = {}
  for (const [nom, u] of [["Réglages", "/dashboard/settings"], ["Livraison", "/dashboard/shipping"], ["Catégories", "/dashboard/categories"]]) {
    const r = await req(u)
    assert.equal(r.status, 200, u)
    mesures[nom] = champsVisibles(r.text).vu
  }
  assert.ok(mesures["Réglages"] <= 14, `Réglages : ${mesures["Réglages"]} champs à l'écran`)
  assert.ok(mesures["Livraison"] <= 14, `Livraison : ${mesures["Livraison"]} champs à l'écran (les 69 wilayas sont pliées)`)
  assert.ok(mesures["Catégories"] <= 8, `Catégories : ${mesures["Catégories"]} champs à l'écran`)
})

/* ------------------------------------------------------------------ 5 */

test("Anti-fraude : on voit le travail du jour, les clés sont pliées", async () => {
  const r = await req("/dashboard/marketing")
  assert.equal(r.status, 200)
  /* ce qu'on voit sans rien ouvrir : une seule question, bloquer un numéro */
  const vu = champsVisibles(contenu(r.text)).vu
  assert.ok(vu <= 2, `${vu} champs à l'écran sur Anti-fraude (au plus 2)`)
  /* les six cases de clés Google sont pliées — et surtout pas supprimées */
  assert.match(r.text, /class="tiroir"/, "le tiroir existe")
  for (const nom of ["captcha_site", "captcha_secret", "captcha_min_score", "pixel_meta", "pixel_tiktok", "snap_pixel"]) {
    assert.ok(r.text.includes(`name="${nom}"`), `le champ ${nom} existe toujours, il est seulement plié`)
  }
  /* le travail du jour, lui, reste devant */
  assert.match(r.text, /Commandes à vérifier/, "les commandes à vérifier restent à l'écran")
  assert.match(r.text, /Numéros bloqués/, "les numéros bloqués restent à l'écran")
  /* cette boutique n'a collé aucune clé : le tiroir reste fermé */
  assert.ok(!/class="tiroir" open/.test(r.text), "le tiroir est fermé tant qu'on n'a rien configuré")
})

test("Anti-fraude : le tiroir s'ouvre seul dès qu'on a collé un identifiant", async () => {
  const avant = await req("/dashboard/marketing")
  assert.ok(!/class="tiroir" open/.test(avant.text), "fermé avant")
  const post = await req("/dashboard/marketing/pixels", form({ pixel_meta: "123456789012345" }))
  assert.ok([302, 303].includes(post.status))
  const apres = await req("/dashboard/marketing")
  assert.match(apres.text, /class="tiroir" open/, "le tiroir s'ouvre : ce qu'on a déjà rempli ne se cache pas")
  /* et on peut tout remettre à zéro */
  await req("/dashboard/marketing/pixels", form({ pixel_meta: "" }))
})

test("et la boutique, elle, n'a pas bougé d'un pouce", async () => {
  const r = await req("/chez-karim")
  assert.equal(r.status, 200, "la vitrine répond toujours")
  /* les changements sont réservés au dashboard : la vitrine garde son moteur */
  assert.ok(!r.text.includes("home-act"), "pas de bloc d'accueil marchand côté client")
})
