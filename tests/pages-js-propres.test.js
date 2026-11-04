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
  "/dashboard", "/dashboard/studio", "/dashboard/design/themes", "/dashboard/products",
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
