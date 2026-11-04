/* L'espace marchand, en clair :
   - une icône par page du menu (aucune répétition d'un même dessin) ;
   - aucune clé d'API, aucun jeton, aucun réglage SMTP demandé au marchand :
     ces fonctions s'annoncent « Prochainement » ;
   - l'adresse gratuite (amina-mode.nova.site) s'affiche AVANT le domaine payant. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-clair-${Date.now()}.db`)
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
const login = async (mail) => {
  jar.clear()
  const r = await req("/login", form({ email: mail, password: "demo1234" }))
  assert.equal(r.status, 302, `connexion de ${mail}`)
}

/** Chaque entrée du menu, avec le dessin de son icône. */
function entreesMenu(html) {
  const debut = html.indexOf('<nav class="dash-nav">')
  const fin = html.indexOf("</nav>", debut)
  const bloc = debut >= 0 && fin > debut ? html.slice(debut, fin) : ""
  const out = []
  const re = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(bloc))) {
    const svg = m[2].match(/<svg[\s\S]*?<\/svg>/)
    if (svg) out.push({ href: m[1], svg: svg[0].replace(/\s+/g, " ") })
  }
  return out
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const s = await startServer({ db: DB }); server = s.child; BASE = s.base
})
after(() => { if (server) server.kill(); try { fs.unlinkSync(DB) } catch (_) {} })

test("boutique : une icône différente pour chaque page du menu", async () => {
  await login("demo@novadz.dz")
  const page = await req("/dashboard/orders")
  assert.equal(page.status, 200)
  const entrees = entreesMenu(page.text)
  assert.ok(entrees.length >= 12, `le menu est bien lu (${entrees.length} entrées)`)
  const parHref = new Map()
  for (const e of entrees) {
    const vu = parHref.get(e.svg)
    assert.ok(!vu || vu === e.href, `deux pages partagent la même icône : ${vu} et ${e.href}`)
    parHref.set(e.svg, e.href)
  }
})

test("vitrine : même règle, une icône par page", async () => {
  await login("vitrine@novadz.dz")
  const page = await req("/dashboard")
  const entrees = entreesMenu(page.text)
  assert.ok(entrees.length >= 6, `le menu vitrine est lu (${entrees.length} entrées)`)
  const parHref = new Map()
  for (const e of entrees) {
    const vu = parHref.get(e.svg)
    assert.ok(!vu || vu === e.href, `deux pages partagent la même icône : ${vu} et ${e.href}`)
    parHref.set(e.svg, e.href)
  }
})

test("relances : plus aucune clé d'API à remplir, la suite est annoncée", async () => {
  await login("demo@novadz.dz")
  const p = await req("/dashboard/relances")
  assert.equal(p.status, 200)
  for (const champ of ["msg_url", "msg_header_name", "msg_header_value", "msg_body", "msg_provider"]) {
    assert.ok(!p.text.includes(`name="${champ}"`), `${champ} ne doit plus être demandé au marchand`)
  }
  assert.match(p.text, /Prochainement/)
  assert.match(p.text, /Envoi automatique/)
  /* ce qui reste utile : le délai, les modèles, le lien WhatsApp */
  assert.match(p.text, /name="msg_delay_minutes"/)
  assert.match(p.text, /name="msg_template_cart"/)
})

test("e-mails : pas de serveur, pas de mot de passe à saisir", async () => {
  const p = await req("/dashboard/mails")
  assert.equal(p.status, 200)
  for (const champ of ["smtp_host", "smtp_port", "smtp_user", "smtp_pass"]) {
    assert.ok(!p.text.includes(`name="${champ}"`), `${champ} ne doit plus être demandé`)
  }
  assert.match(p.text, /Prochainement/)
  assert.match(p.text, /name="mail_from"/, "l'adresse d'envoi reste un choix simple")
})

test("transporteur : les réglages techniques ne sont plus à écrire à la main", async () => {
  const p = await req("/dashboard/transporteur")
  assert.equal(p.status, 200)
  assert.ok(!p.text.includes("Réglages avancés"), "plus de tableau de chemins et d'en-têtes")
  assert.ok(!p.text.includes('name="create_body"'), "plus de corps de requête à écrire")
})

test("l'adresse gratuite s'affiche avant le domaine payant", async () => {
  const p = await req("/dashboard/settings")
  assert.equal(p.status, 200)
  assert.match(p.text, /Ton adresse gratuite/)
  assert.match(p.text, /amina-mode\.nova\.site/, "l'adresse offerte, sans /amina-mode")
  const iAdresse = p.text.indexOf("amina-mode.nova.site")
  const iDomaine = p.text.indexOf("Tu as déjà un domaine")
  const iDns = p.text.indexOf("Comment le relier")
  assert.ok(iAdresse > -1 && iDomaine > iAdresse, "le domaine payant vient après l'adresse gratuite")
  assert.ok(iDns > iDomaine, "le DNS vient en dernier, une fois le domaine demandé")
})

test("l'adresse gratuite sert vraiment la boutique", async () => {
  /* fetch ignore un Host imposé : on passe par http pour simuler le vrai DNS */
  const http = require("node:http")
  const { port } = new URL(BASE)
  const r = await new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port, path: "/", headers: { Host: "amina-mode.nova.site" } }, (res) => {
      let body = ""
      res.on("data", (c) => { body += c })
      res.on("end", () => resolve({ status: res.statusCode, html: body }))
    })
    q.on("error", reject)
    q.end()
  })
  assert.equal(r.status, 200)
  assert.match(r.html, /Amina Mode/, "le sous-domaine gratuit ouvre la boutique")
})
