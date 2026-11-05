/* LOT 49 — lisibilité du tableau de bord.
   Quatre pannes vues par le marchand sur ses propres captures :

   1. le graphique des 14 derniers jours affichait « 0,00 DZD » et
      « commande(s) » en vrac : le prix était mis en HTML dans un attribut
      title, le navigateur coupait au premier guillemet ;
   2. le menu ne montrait aucun onglet actif ;
   3. les sept boutons de la page commande débordaient de la carte ;
   4. le son de commande ne marchait que sur téléphone : sur un ordinateur,
      aucun clic sur la page = aucun son autorisé.

   On vérifie le rendu servi, pas l'intention.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer, openDb } = require("./boot")
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-lisibilite-${Date.now()}.db`)
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
  return { status: res.status, text: await res.text() }
}
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})

/* Une commande client fraîche, comme un vrai acheteur. */
async function newOrder() {
  await req("/amina-mode")
  await req("/amina-mode/cart", form({ product_id: "3" }))
  await req("/amina-mode/checkout", form({
    customer_name: "Malek", phone: "0555123456", address: "Cité 200 logements",
    wilaya: "Blida", commune: "Blida", delivery: "home", payment: "cod",
  }))
  const db = openDb(DB, { readonly: true })
  const o = db.prepare("SELECT id FROM orders ORDER BY id DESC LIMIT 1").get()
  db.close()
  return o
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

/* ------------------------------------------------------------------ */
/* 1. Le graphique                                                     */
/* ------------------------------------------------------------------ */

test("graphique : aucun HTML dans une info-bulle (la cause du texte en vrac)", async () => {
  await newOrder()
  const html = (await req("/dashboard/stats")).text
  const titres = (html.slice(html.indexOf("st-chart")).match(/title="[^"]*"/g) || [])
  assert.ok(titres.length >= 14, "un titre par jour")
  for (const t of titres) assert.ok(!t.includes("<"), "un montant en HTML dans un title casse la page : " + t.slice(0, 60))
  assert.ok(!/title="[^"]*ndz-money/.test(html))
})

test("graphique : des barres à l'échelle, un axe et des dates", async () => {
  const html = (await req("/dashboard/stats")).text
  assert.match(html, /class="st-chart st-graph"/)
  assert.match(html, /class="st-yaxis"/)
  assert.match(html, /class="st-grid"/)
  assert.equal((html.match(/class="st-day"/g) || []).length, 14)
  const barres = html.match(/class="st-bar[^"]*" style="height:\d+(\.\d+)?%"/g) || []
  assert.equal(barres.length, 14)
})

test("graphique : le montant est écrit au-dessus de la barre", async () => {
  const html = (await req("/dashboard/stats")).text
  assert.match(html, /<span class="st-val">[^<]*<\/span>/)
})

/* ------------------------------------------------------------------ */
/* 2. Où suis-je ?                                                     */
/* ------------------------------------------------------------------ */

test("menu : chaque page met en avant sa propre rubrique", async () => {
  const pages = [
    ["/dashboard/stats", "/dashboard/stats"],
    ["/dashboard/orders", "/dashboard/orders"],
    ["/dashboard/products", "/dashboard/products"],
    ["/dashboard/stock", "/dashboard/stock"],
    ["/dashboard/settings", "/dashboard/settings"],
    ["/dashboard/shipping", "/dashboard/shipping"],
  ]
  for (const [url, lien] of pages) {
    const html = (await req(url)).text
    const i = html.indexOf(`href="${lien}"`)
    assert.ok(i > 0, "lien du menu absent pour " + url)
    assert.match(html.slice(Math.max(0, i - 80), i), /class="on"/, `l'onglet ${lien} doit être actif sur ${url}`)
  }
})

/* ------------------------------------------------------------------ */
/* 3. La page commande                                                 */
/* ------------------------------------------------------------------ */

test("commande : les actions sont en deux étages, plus de boutons collés", async () => {
  const o = await newOrder()
  assert.ok(o && o.id)
  const html = (await req("/dashboard/orders/" + o.id)).text
  assert.match(html, /class="ord-acts big"/)
  assert.match(html, /class="ord-acts-row main"/)
  assert.match(html, /class="ord-acts-row more"/)
  const main = html.slice(html.indexOf("ord-acts-row main"), html.indexOf("ord-acts-row more"))
  assert.match(main, /WhatsApp/)
  assert.match(main, /Confirmer/)
  assert.match(html.slice(html.indexOf("ord-acts-row more")), /Annuler|Commande de test/)
})

/* ------------------------------------------------------------------ */
/* 4. Le son de commande                                               */
/* ------------------------------------------------------------------ */

test("son : le carillon est débloqué au premier geste, pas seulement à l'arrivée", async () => {
  const html = (await req("/dashboard/orders")).text
  assert.match(html, /function ding\(\)/)
  assert.match(html, /pointerdown/, "sur un PC, c'est le clic qui débloque le son")
  assert.match(html, /keydown/, "le clavier aussi compte")
  assert.match(html, /visibilitychange/)
  assert.match(html, /audioCtx|ctxOnce/)
  assert.match(html, /1046\.5/, "deux notes : le ding")
  assert.match(html, /784/, "puis le dong")
})

test("son : un bouton « Son » et une notification non muette", async () => {
  const html = (await req("/dashboard/orders")).text
  assert.match(html, /data-bell-ding/)
  assert.match(html, /Son bloqué par le navigateur/)
  assert.match(html, /silent: false/)
})

/* ------------------------------------------------------------------ */
/* 5. Les deux boutons qui gênaient                                    */
/* ------------------------------------------------------------------ */

test("boutons : l'assistant fait 44 px et « Installer » ne flotte plus", async () => {
  const html = (await req("/dashboard")).text
  assert.match(html, /\.ndz-ai-ball\{[^}]*width:44px/)
  const i = html.indexOf('class="pwa-install"')
  assert.ok(i > html.indexOf('id="dashSide"') && i < html.indexOf("</aside>"), "« Installer » dans la barre latérale")
  assert.ok(i < html.indexOf('class="dash-nav"'), "assez haut pour être vu sans défiler")
})

test("boutons : la feuille de style ne recolle plus « Installer » en bas à gauche", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8")
  const bloc = css.slice(css.indexOf(".pwa-install{"), css.indexOf(".pwa-install{") + 260)
  assert.ok(!/position:\s*fixed/.test(bloc))
})
