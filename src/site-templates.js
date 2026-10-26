"use strict"
/**
 * Templates « site complet » (site1…site16) : de vraies pages d'accueil dessinées,
 * servies telles quelles dans /templates/<id>.html (démo) et, une fois choisies
 * par un marchand, comme page d'accueil de sa boutique.
 * Les produits, le panier et la commande restent ceux de Nova : on ajoute à la
 * page une section « Nos produits » et une barre panier. Aucun script du template
 * (il n'y en a pas) et aucune donnée marchand n'entre sans échappement.
 */
const fs = require("fs")
const path = require("path")
const { money } = require("./ui")

const DIR = path.join(__dirname, "..", "public", "templates")

/* id, nom, niche, accroche. kind : boutique (produits) | vitrine (services) */
const LIST = [
  { id: "site1", name: "Adeline", niche: "Mode & accessoires", line: "Sacs et accessoires femme", kind: "boutique" },
  { id: "site2", name: "Manière", niche: "Chaussures", line: "Chaussures de créateur", kind: "boutique" },
  { id: "site3", name: "C. Reyes", niche: "Conseil & recrutement", line: "Réseau et carrières", kind: "vitrine" },
  { id: "site4", name: "Tri.wi", niche: "Cybersécurité", line: "Sécurité cloud, en clair", kind: "vitrine" },
  { id: "site5", name: "Prozi", niche: "Agence marketing", line: "Agence digitale sombre et audacieuse", kind: "vitrine" },
  { id: "site6", name: "Wardrobe", niche: "Prêt-à-porter", line: "Vêtements casual et confortables", kind: "boutique" },
  { id: "site7", name: "Plashoe", niche: "Chaussures éco", line: "Baskets en matières recyclées", kind: "boutique" },
  { id: "site8", name: "Rises", niche: "Conseil business", line: "Cabinet de consultants", kind: "vitrine" },
  { id: "site9", name: "VOID", niche: "Streetwear", line: "Hoodies et oversize, fond blanc", kind: "boutique" },
  { id: "site10", name: "Furnexa", niche: "Mobilier & déco", line: "Fauteuils et salon", kind: "boutique" },
  { id: "site11", name: "Essentia", niche: "Soin de la peau", line: "Un produit phare, mis en scène", kind: "boutique" },
  { id: "site12", name: "Sabina", niche: "Mode femme", line: "Tailleurs et nouveautés", kind: "boutique" },
  { id: "site13", name: "Chalant", niche: "Cosmétique naturelle", line: "Soins doux pour toutes les peaux", kind: "boutique" },
  { id: "site14", name: "Peak", niche: "Montagne & outdoor", line: "Équipement d'alpinisme", kind: "boutique" },
  { id: "site15", name: "Solene", niche: "Compléments & bien-être", line: "Vitamines au naturel", kind: "boutique" },
  { id: "site16", name: "Newcomer", niche: "Appli & liste d'attente", line: "Lancement d'un produit digital", kind: "vitrine" },
]
const BY_ID = new Map(LIST.map((t) => [t.id, t]))

const isSite = (id) => typeof id === "string" && BY_ID.has(id)
const get = (id) => BY_ID.get(id) || null

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

const cache = new Map()
const read = (id) => {
  if (cache.has(id)) return cache.get(id)
  const html = fs.readFileSync(path.join(DIR, id + ".html"), "utf8")
  cache.set(id, html)
  return html
}

const CSS = `
#ndz-boutique{all:initial;display:block;box-sizing:border-box;background:#fff;color:#111;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:72px 24px;position:relative;z-index:2}
#ndz-boutique *{box-sizing:border-box}
#ndz-boutique .ndzs-in{max-width:1180px;margin:0 auto}
#ndz-boutique h2{font:700 30px/1.15 system-ui,sans-serif;margin:0 0 28px;color:#111}
#ndz-boutique .ndzs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:22px}
#ndz-boutique a.ndzs-card{display:block;text-decoration:none;color:#111}
#ndz-boutique .ndzs-img{aspect-ratio:4/5;background:#f1f1ef;border-radius:12px;overflow:hidden}
#ndz-boutique .ndzs-img img{width:100%;height:100%;object-fit:cover;display:block}
#ndz-boutique .ndzs-t{display:block;font:600 15px/1.3 system-ui,sans-serif;margin:10px 0 2px}
#ndz-boutique .ndzs-p{display:block;font:500 14px/1.3 system-ui,sans-serif;color:#555}
#ndz-boutique .ndzs-empty{font:400 15px/1.5 system-ui,sans-serif;color:#666}
#ndz-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:6px;padding:6px;background:#111;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.28);font-family:system-ui,sans-serif}
#ndz-bar a{color:#fff;text-decoration:none;font:600 13px/1 system-ui,sans-serif;padding:11px 16px;border-radius:999px;white-space:nowrap}
#ndz-bar a.main{background:#fff;color:#111}
`

const shopBlock = (store, products) => {
  const slug = encodeURIComponent(store.slug || "")
  const list = (products || []).slice(0, 24)
  const cards = list.map((p) => `<a class="ndzs-card" href="/${slug}/p/${Number(p.id)}">
      <span class="ndzs-img">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ""}</span>
      <span class="ndzs-t">${esc(p.title)}</span>
      <span class="ndzs-p">${esc(money(p.price_cents, store.currency || "DZD"))}</span>
    </a>`).join("")
  return `<section id="ndz-boutique"><div class="ndzs-in">
    <h2>Nos produits</h2>
    ${list.length ? `<div class="ndzs-grid">${cards}</div>` : `<p class="ndzs-empty">Les produits arrivent bientôt.</p>`}
  </div></section>`
}

/** @returns {string} document HTML complet de la vitrine, ou "" si le template manque */
const render = (store, products, id, opts = {}) => {
  if (!isSite(id)) return ""
  let html
  try { html = read(id) } catch (_) { return "" }
  const slug = encodeURIComponent(store.slug || "")
  const name = esc(store.name || get(id).name)
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${name}</title>`)
  const desc = esc(store.tagline || store.about || `${store.name || ""} — boutique en ligne, paiement à la livraison.`).slice(0, 300)
  if (/<meta\s+name="description"/i.test(html)) html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${desc}$2`)
  else html = html.replace(/<\/head>/i, `<meta name="description" content="${desc}"></head>`)
  html = html.replace(/<\/head>/i, `<style>${CSS}</style></head>`)
  const shop = shopBlock(store, products)
  const n = Math.max(0, Number(opts.cartCount) || 0)
  const bar = `<nav id="ndz-bar" aria-label="Boutique"><a href="#ndz-boutique">Produits</a><a href="/${slug}/cart">Panier${n ? ` (${n})` : ""}</a><a class="main" href="/${slug}/checkout">Commander</a></nav>`
  /* toujours en fin de page : un <footer> du template peut être imbriqué dans une colonne étroite */
  return html.replace(/<\/body>/i, shop + bar + "</body>")
}

module.exports = { LIST, isSite, get, render }
