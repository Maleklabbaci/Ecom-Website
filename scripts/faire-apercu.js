/* Fabrique des copies HTML autonomes des pages modifiées :
   CSS + polices intégrés en data URI, pour qu'elles s'ouvrent sans serveur. */
const fs = require("fs")
const path = require("path")
const OUT = "/home/user/apercu"

const BASE = "http://127.0.0.1:3950"
const COOKIE = fs.readFileSync("/tmp/cookie.txt", "utf8").trim()

const PAGES = [
  ["liste-produits-photos.html", "/dashboard/products", "Liste des produits — la photo principale devant chaque produit"],
  ["barre-laterale-chiffres.html", "/dashboard", "Barre latérale — les chiffres (commandes, paniers, stock, avis)"],
  ["fiche-commande.html", "/dashboard/orders/1", "Fiche commande — modifier, choisir la société, expédier"],
  ["liste-commandes.html", "/dashboard/orders", "Liste des commandes — sélection multiple"],
  ["produit-photos-variantes.html", "/dashboard/products/3", "Produit — photos glissables + titres de variante"],
  ["transporteurs-multiples.html", "/dashboard/transporteur", "Transporteur — plusieurs sociétés"],
  ["boutique-options.html", "/amina-mode/p/3", "Boutique — menus de variante (vitrine)"],
  ["panier-options.html", "/amina-mode/cart", "Panier — options choisies"],
]

const get = async (p, cookie) => {
  const r = await fetch(BASE + p, { headers: { cookie } })
  return { status: r.status, html: await r.text() }
}

const dataUri = (file, type) =>
  `data:${type};base64,${fs.readFileSync(file).toString("base64")}`

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })

  /* CSS du site, polices incluses en data URI */
  let css = await (await fetch(BASE + "/styles.css")).text()
  const fontsDir = "/home/user/novadz-repo-final/public/fonts"
  css = css.replace(/url\(["']?\/fonts\/([^"')]+)["']?\)/g, (m, f) => {
    const file = path.join(fontsDir, f)
    if (!fs.existsSync(file)) return m
    const type = f.endsWith(".woff2") ? "font/woff2" : f.endsWith(".woff") ? "font/woff" : "font/ttf"
    return `url(${dataUri(file, type)})`
  })

  const banner = (title, sub) => `
<div style="position:sticky;top:0;z-index:9999;display:flex;gap:12px;align-items:center;flex-wrap:wrap;
  padding:10px 18px;background:#18181B;color:#fff;font:500 13px/1.4 system-ui,sans-serif">
  <b style="font-weight:700">${title}</b>
  <span style="color:#A1A1AA">${sub}</span>
  <span style="margin-left:auto;color:#FFD400;font-size:11.5px">copie statique — les boutons ne font rien ici</span>
</div>`

  for (const [file, url, title] of PAGES) {
    const cookie = file.startsWith("panier") ? fs.readFileSync("/tmp/cookie2.txt", "utf8").trim() : COOKIE
    const { status, html } = await get(url, cookie)
    if (status !== 200) { console.log("IGNORÉ", url, status); continue }

    /* base <base href> neutre + CSS intégré */
    /* toutes les feuilles de style servies par le serveur sont intégrées */
    const others = {}
    for (const m of html.matchAll(/<link[^>]+href="(\/[^"]+\.css)"[^>]*>/g)) {
      if (m[1] === "/styles.css") continue
      try { others[m[1]] = await (await fetch(BASE + m[1])).text() } catch (_) { others[m[1]] = "" }
    }
    let out = html
      .replace(/<link[^>]+href="(\/[^"]+\.css)"[^>]*>/g, (m, href) => {
        const body = href === "/styles.css" ? css : (others[href] || "")
        return `<style>${body}</style>`
      })
      .replace(/<\/head>/, `<style>html{scroll-behavior:auto}</style></head>`)
      .replace(/<body([^>]*)>/, (m, attrs) => `<body${attrs}>${banner(title, url)}`)

    /* scripts et images servis par le serveur : intégrés aussi */
    const upimg = await (await fetch(BASE + "/upimg.js")).text()
    out = out.replace(/<script src="\/upimg\.js"[^>]*><\/script>/g, `<script>${upimg}</script>`)
    for (const m of [...out.matchAll(/src="(\/(?:uploads|demo)\/[^"]+)"/g)]) {
      try {
        const r = await fetch(BASE + m[1])
        if (!r.ok) continue
        const buf = Buffer.from(await r.arrayBuffer())
        const type = m[1].endsWith(".png") ? "image/png" : m[1].endsWith(".webp") ? "image/webp" : "image/jpeg"
        out = out.split(m[1]).join(`data:${type};base64,${buf.toString("base64")}`)
      } catch (_) {}
    }

    fs.writeFileSync(path.join(OUT, file), out)
    console.log("OK", file, Math.round(out.length / 1024) + " Ko")
  }
})()
