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
const BASE = LIST.slice()
const BASE_IDS = new Set(BASE.map((t) => t.id))
const CATALOG = path.join(DIR, "catalog.json")
let extra = [], extraM = -1
/** Templates ajoutés par l'importateur : relus dès que catalog.json change, sans redémarrage. */
const added = () => {
  let m = 0
  try { m = fs.statSync(CATALOG).mtimeMs } catch (_) { m = 0 }
  if (m !== extraM) {
    extraM = m
    try {
      extra = JSON.parse(fs.readFileSync(CATALOG, "utf8")).filter((t) => t && /^[a-z][a-z0-9-]{0,29}$/.test(t.id) && !BASE_IDS.has(t.id) && t.name)
        .map((t) => ({ id: t.id, name: String(t.name).slice(0, 40), niche: String(t.niche || "").slice(0, 60), line: String(t.line || "").slice(0, 100), kind: t.kind === "vitrine" ? "vitrine" : "boutique" }))
    } catch (_) { extra = [] }
  }
  return extra
}
const all = () => BASE.concat(added())
const get = (id) => (typeof id === "string" ? all().find((t) => t.id === id) || null : null)
const isSite = (id) => !!get(id)

/** Pages fournies par le template lui-même (site importé en plusieurs pages) : public/templates/<id>/manifest.json */
const pages = (id) => {
  if (!isSite(id)) return []
  try {
    const m = JSON.parse(fs.readFileSync(path.join(DIR, id, "manifest.json"), "utf8"))
    return (m.pages || []).filter((p) => p && /^[a-z0-9-]{1,40}$/.test(p.key) && p.key !== "home").map((p) => ({ key: p.key, name: String(p.name || p.key).slice(0, 40) }))
  } catch (_) { return [] }
}
const pageSource = (id, key) => {
  if (!isSite(id)) return ""
  if (key === "home") return source(id)
  if (!pages(id).some((p) => p.key === key)) return ""
  try { return fs.readFileSync(path.join(DIR, id, "pages", key + ".html"), "utf8") } catch (_) { return "" }
}
const source = (id) => { try { return read(id) } catch (_) { return "" } }

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

/* page publique : seuls NOS scripts (/_studio/fx.js) tournent ; rien d'inline, rien venant du marchand */
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src * data: blob:", "font-src * data:", "media-src * data: blob:",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-src https://www.youtube-nocookie.com",
].join("; ")
const FONT_CSS = ["/theme-fonts.css", "/landing-fonts.css", "/estedad.css"]
const PH = /<div\s+data-ndz="produits"\s*>\s*<\/div>/i

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

/**
 * @param opts.html    HTML enregistré par le Studio (sinon le fichier du template)
 * @param opts.studio  true : version éditable (bloc produits repérable, pas de barre, script du studio)
 * @returns {string} document HTML complet de la vitrine, ou "" si le template manque
 */
const render = (store, products, id, opts = {}) => {
  if (!isSite(id)) return ""
  let html = opts.html || ""
  if (!html) { try { html = read(id) } catch (_) { return "" } }
  const slug = encodeURIComponent(store.slug || "")
  const name = esc(store.name || get(id).name)
  html = html.replace(/<title>[\s\S]*?<\/title>/i, (m) => (opts.html && !opts.studio && !/\| NovaDZ/.test(m) ? m : `<title>${name}</title>`))
  if (!/<title>/i.test(html)) html = html.replace(/<\/head>/i, `<title>${name}</title></head>`)
  const desc = esc(store.tagline || store.about || `${store.name || ""} — boutique en ligne, paiement à la livraison.`).slice(0, 300)
  if (!/<meta\s+name="description"/i.test(html)) html = html.replace(/<\/head>/i, `<meta name="description" content="${desc}"></head>`)
  else if (!opts.html) html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${desc}$2`)
  const links = FONT_CSS.filter((f) => !html.includes(f)).map((f) => `<link rel="stylesheet" href="${f}">`).join("")
  html = html.replace(/<\/head>/i, `${links}${opts.studio ? "" : `<style>${CSS}</style>`}</head>`)
  const shop = shopBlock(store, products)
  if (!PH.test(html) && opts.auto !== false) html = html.replace(/<\/body>/i, `<div data-ndz="produits"></div></body>`)
  html = html.replace(PH, opts.studio ? `<div data-ndz="produits">${shop}</div>` : shop)
  /* liens entre pages d'un site importé : /__ndz__/s/about -> /<boutique>/s/about */
  html = html.replace(/\/__ndz__(?=[\/"'#?])/g, "/" + slug)
  html = html.replace(/<html\b([^>]*?)\s+data-ndz-slug="[^"]*"/i, "<html$1")
  html = html.replace(/<html\b/i, `<html data-ndz-slug="${esc(store.slug || "")}"`)
  /* vidéo YouTube : seul un identifiant de 11 caractères passe, jamais une adresse libre */
  html = html.replace(/<div\b([^>]*\bdata-ndz-video="([\w-]{11})"[^>]*)>\s*(?:<iframe[\s\S]*?<\/iframe>)?\s*<\/div>/gi,
    (m, attrs, vid) => `<div${attrs}><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="Vidéo" loading="lazy" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe></div>`)
  html = html.replace(/<link rel="stylesheet" href="\/_studio\/fx\.css">/g, "")
  html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="/_studio/fx.css"></head>`)
  if (opts.studio) {
    html = html.replace(/<script defer src="\/_studio\/fx\.js"><\/script>/g, "")
    /* scripts du template : en pause dans l'éditeur (ils casseraient la sélection), remis tels quels à l'enregistrement */
    html = html.replace(/<script\b([^>]*?)\bsrc="(\/templates\/[^"]+)"([^>]*)>\s*<\/script>/gi, (m, a, src, b) =>
      `<script type="text/ndz-off" data-ndz-src="${src}"${/type\s*=\s*"module"/i.test(a + b) ? ' data-ndz-mod="1"' : ""}></script>`)
    html = html.replace(/<\/head>/i, `<style data-studio-ui>[data-ndz="produits"] a{pointer-events:none}${CSS}</style><script defer src="/_studio/frame.js"></script></head>`)
    return html
  }
  /* boutons « acheter » : sans JS ils mènent à la fiche produit, avec fx.js ils achètent ou ajoutent au panier */
  html = html.replace(/<a\b([^>]*\bdata-ndz-pid="(\d+)"[^>]*)>/gi, (m, attrs, pid) => {
    const href = `/${slug}/p/${pid}`
    return /\shref\s*=/i.test(attrs) ? `<a${attrs.replace(/(\shref\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${href}"`)}>` : `<a href="${href}"${attrs}>`
  })
  /* formulaire de contact : l'adresse d'envoi est posée ici, jamais lue dans le HTML du marchand */
  html = html.replace(/<form\b([^>]*\bdata-ndz-form[^>]*)>/gi, (m, attrs) =>
    `<form${attrs.replace(/\s(?:method|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")} method="post" action="/${slug}/s-form"><input type="hidden" name="back" value="${esc(opts.key || "home")}">`)
  html = html.replace(/<\/body>/i, `<script defer src="/_studio/fx.js"></script></body>`)
  const n = Math.max(0, Number(opts.cartCount) || 0)
  const bar = `<nav id="ndz-bar" aria-label="Boutique"><a href="#ndz-boutique">Produits</a><a href="/${slug}/cart">Panier${n ? ` (${n})` : ""}</a><a class="main" href="/${slug}/checkout">Commander</a></nav>`
  return html.replace(/<\/body>/i, bar + "</body>")
}

module.exports = { isSite, get, render, source, pages, pageSource, CSP }
Object.defineProperty(module.exports, "LIST", { enumerable: true, get: all })
