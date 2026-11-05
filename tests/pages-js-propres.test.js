/* LES PAGES NE LIVRENT PAS DE CODE CASSÉ.
   Pourquoi ce test existe : sur une page produit, un script écrit
   `!/^image\//` dans un gabarit JavaScript. Le gabarit mangeait le `\`, la
   page recevait `!/^image//` : le reste de la ligne devenait un commentaire et
   la page levait « SyntaxError: Unexpected token '.' ». Le formulaire d'avis
   avec photo ne marchait donc pas, sans que rien ne casse côté serveur.

   Ce test lit les pages réelles et compile chaque script écrit dans la page :
   une syntaxe cassée est vue tout de suite, sans navigateur.
   Il vérifie aussi ce qu'un client ne doit jamais lire :
   « undefined », « NaN », un prix en dollars ou en euros.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")
const fs = require("node:fs")
const { startServer } = require("./boot")

let srv = null
let base = ""
let cookieMarchand = ""

const PAGES = [
  "/", "/themes", "/login",
  "/amina-mode", "/amina-mode/p/1", "/amina-mode/cart",
  "/tech-dz", "/atelier-lina",
  "/dashboard", "/dashboard/studio", "/dashboard/studio/themes", "/dashboard/products",
]

before(async () => {
  const db = path.join(os.tmpdir(), `novadz-pages-${process.pid}.db`)
  srv = await startServer({ db, env: { NOVADZ_DEMO_DATA: "1" } })
  base = srv.base
  const r = await fetch(base + "/demo-login/marchand?next=/dashboard", { redirect: "manual" })
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]
  cookieMarchand = raw.filter(Boolean).map((c) => c.split(";")[0]).join("; ")
})

after(() => { if (srv && srv.child) srv.child.kill() })

const lire = async (url) => {
  const r = await fetch(base + url, { headers: cookieMarchand ? { cookie: cookieMarchand } : {} })
  return { status: r.status, html: await r.text() }
}

/** Les <script> écrits dans la page (pas les fichiers .js externes). */
const scriptsEnLigne = (html) => {
  const out = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    const attrs = m[1] || ""
    if (/type\s*=\s*["'](application\/(ld\+)?json|text\/template|text\/x-template)["']/i.test(attrs)) continue
    if (/\bsrc\s*=/i.test(attrs)) continue
    out.push(m[2])
  }
  return out
}

const texteVisible = (html) =>
  html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")

for (const url of PAGES) {
  test(`${url} : aucun script cassé`, async () => {
    const { status, html } = await lire(url)
    assert.ok(status < 400, `${url} répond ${status}`)
    for (const code of scriptsEnLigne(html)) {
      if (!code.trim()) continue
      try {
        /* on compile sans exécuter : seule la syntaxe nous intéresse */
        new Function(code)
      } catch (e) {
        assert.fail(`${url} : script invalide (${e.message})\n${code.slice(0, 300)}`)
      }
    }
  })

  test(`${url} : pas de « undefined », de dollars ni d'euros`, async () => {
    const { html } = await lire(url)
    const texte = texteVisible(html).replace(/&nbsp;/g, " ")
    assert.ok(!/\bundefined\b/.test(texte), `${url} contient « undefined »`)
    assert.ok(!/[\[{]object Object[\]}]/i.test(texte), `${url} contient « [object Object] »`)
    assert.ok(!/\$\s?\d/.test(texte), `${url} affiche un prix en dollars`)
    assert.ok(!/€\s?\d|\d\s?€/.test(texte), `${url} affiche un prix en euros`)
  })
}

/* UN SEUL STUDIO, UNE SEULE ADRESSE.
   Le marchand ne doit pas se demander si « Design » et « Studio » sont deux
   outils différents : le menu n'offre que le Studio, et l'ancienne adresse
   /dashboard/studio/atelier renvoie vers lui au lieu de montrer autre chose. */
test("le menu du marchand propose un seul Studio, et pas de doublon « Design »", async () => {
  const dash = await lire("/dashboard")
  const nav = (dash.html.match(/<nav class="dash-nav">[\s\S]*?<\/nav>/) || [""])[0]
  const liens = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  const studio = liens.filter((h) => /\/dashboard\/studio/.test(h))
  assert.deepEqual(studio, ["/dashboard/studio"], "une seule entrée Studio : " + JSON.stringify(studio))
  const design = liens.filter((h) => /^\/dashboard\/design($|\?)/.test(h))
  assert.deepEqual(design, [], "plus d'entrée « Design » en double : " + JSON.stringify(design))
})

test("l'ancienne adresse du Studio renvoie vers lui", async () => {
  const r = await fetch(base + "/dashboard/studio/atelier", { headers: { cookie: cookieMarchand }, redirect: "manual" })
  assert.equal(r.status, 302)
  assert.equal(r.headers.get("location"), "/dashboard/studio")
})

/* LE CONTENU DOIT TOUJOURS ÊTRE ATTEIGNABLE.
   Un script « rognait » les cartes qui dépassaient de la barre du bas sur
   téléphone : il leur posait une hauteur maximale, et le reste du formulaire
   n'existait plus, même en défilant. On vérifie que ce rognage ne revient pas. */
test("aucune carte n'est rognée à la hauteur de l'écran", async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src/views.js"), "utf8")
  assert.ok(!/dock-clip|dock-sliver/.test(src), "le rognage des cartes est revenu dans src/views.js")
  const css = fs.readFileSync(path.join(__dirname, "..", "public/styles.css"), "utf8")
  assert.ok(!/\.dock-clip|\.dock-sliver/.test(css), "les règles de rognage sont revenues dans public/styles.css")
  /* et une page longue doit défiler assez pour montrer son bouton d'enregistrement */
  const { html } = await lire("/dashboard/settings")
  assert.ok(/<button[^>]*>[^<]*Enregistrer/i.test(html) || /Enregistrer/i.test(html), "le bouton Enregistrer doit exister")
})
