#!/usr/bin/env node
/**
 * Récupère la police arabe Estedad (licence OFL) depuis Google Fonts
 * et la range dans public/fonts/ — auto-hébergée, aucun appel à Google à l'exécution.
 * À relancer si les fichiers .woff2 manquent : npm run fonts
 *
 * Les autres polices (Jost, Space Grotesk, Playfair Display, Archivo,
 * Cormorant Garamond, Bodoni Moda — voir public/theme-fonts.css) sont déjà
 * livrées dans public/fonts/ (Fontsource 5.3.0, sous-ensemble latin, licence
 * OFL à côté de chaque fichier). Si ce script dit « hors ligne », les polices
 * livrées suffisent au fonctionnement.
 */
const fs = require("fs")
const path = require("path")

const FILES = [
  ["estedad-arabic.woff2", "https://fonts.gstatic.com/s/estedad/v3/QdVWSTk1OgitjvYTJJDEvDlh.woff2"],
  ["estedad-latin.woff2", "https://fonts.gstatic.com/s/estedad/v3/QdVWSTk1OgitjvYTJJXEvA.woff2"],
]

async function main() {
  const dir = path.join(__dirname, "..", "public", "fonts")
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, url] of FILES) {
    const out = path.join(dir, name)
    if (fs.existsSync(out) && fs.statSync(out).size > 5000) {
      console.log("  deja la :", name)
      continue
    }
    const r = await fetch(url)
    if (!r.ok) throw new Error(`telechargement impossible (${r.status}) : ${name}`)
    fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()))
    console.log("  recupere :", name, fs.statSync(out).size, "octets")
  }
  console.log("Police Estedad prete dans public/fonts/")
}

main().catch((e) => { console.error(e.message); process.exit(1) })
