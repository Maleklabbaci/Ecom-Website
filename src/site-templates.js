"use strict"
/**
 * Templates « site complet » (site1…site16) : de vraies pages d'accueil dessinées,
 * servies telles quelles dans /templates/<id>.html (démo) et, une fois choisies
 * par un marchand, comme page d'accueil de son site.
 *
 * Les deux familles ne se mélangent jamais :
 *  - « boutique » : réservé aux e-commerce, avec les produits, le panier et la
 *    commande NovaDZ ;
 *  - « vitrine » : réservé aux sites de présentation, avec le formulaire de
 *    contact NovaDZ, sans produit, panier ni commande.
 *
 * Aucun script du template (il n'y en a pas) et aucune donnée marchand n'entre
 * sans échappement.
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

/* Les magasins parlent de « commerce » / « vitrine », les templates de
   « boutique » / « vitrine ». Ces helpers sont le seul endroit où les deux
   vocabulaires se rencontrent. Un ancien magasin sans site_kind est traité
   comme un e-commerce, comme dans le reste de la plateforme. */
const templateKindForStore = (storeOrKind) => {
  const kind = typeof storeOrKind === "string" ? storeOrKind : storeOrKind && storeOrKind.site_kind
  return kind === "vitrine" ? "vitrine" : "boutique"
}
const storeKindForSite = (id) => {
  const t = get(id)
  return t ? (t.kind === "vitrine" ? "vitrine" : "commerce") : ""
}
const forStore = (storeOrKind) => LIST.filter((t) => t.kind === templateKindForStore(storeOrKind))
const isSiteForStore = (id, storeOrKind) => {
  const t = get(id)
  return !!t && t.kind === templateKindForStore(storeOrKind)
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

const cache = new Map()
const read = (id) => {
  if (cache.has(id)) return cache.get(id)
  const html = fs.readFileSync(path.join(DIR, id + ".html"), "utf8")
  cache.set(id, html)
  return html
}

const SHOP_CSS = `
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
`

const BAR_CSS = `
#ndz-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:6px;padding:6px;background:#111;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.28);font-family:system-ui,sans-serif}
#ndz-bar a{color:#fff;text-decoration:none;font:600 13px/1 system-ui,sans-serif;padding:11px 16px;border-radius:999px;white-space:nowrap}
#ndz-bar a.main{background:#fff;color:#111}
`

const VITRINE_CSS = `
#ndz-vitrine{all:initial;display:block;box-sizing:border-box;background:#fff;color:#111;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:72px 24px 104px;position:relative;z-index:2}
#ndz-vitrine *{box-sizing:border-box}
#ndz-vitrine .ndzv-in{max-width:760px;margin:0 auto;scroll-margin-top:24px}
#ndz-vitrine h2{font:700 30px/1.15 system-ui,sans-serif;margin:0 0 10px;color:#111}
#ndz-vitrine .ndzv-sub{font:400 15px/1.55 system-ui,sans-serif;color:#555;margin:0 0 26px}
#ndz-vitrine .ndzv-note{font:600 14px/1.45 system-ui,sans-serif;background:#edf7e7;border:1px solid #cde5bf;color:#274b1d;border-radius:12px;padding:13px 15px;margin:0 0 20px}
#ndz-vitrine .ndzv-note.err{background:#fff1f0;border-color:#f2c6c1;color:#77251e}
#ndz-vitrine form{display:grid;gap:15px}
#ndz-vitrine label{display:grid;gap:7px;font:600 13px/1.25 system-ui,sans-serif;color:#222}
#ndz-vitrine input,#ndz-vitrine textarea{width:100%;border:1px solid #d8d8d8;border-radius:11px;background:#fff;color:#111;padding:12px 14px;font:400 16px/1.4 system-ui,sans-serif}
#ndz-vitrine textarea{min-height:132px;resize:vertical}
#ndz-vitrine .ndzv-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
#ndz-vitrine button{justify-self:start;border:0;border-radius:999px;background:#111;color:#fff;padding:13px 24px;font:700 14px/1 system-ui,sans-serif;cursor:pointer}
@media(max-width:640px){#ndz-vitrine{padding:52px 18px 104px}#ndz-vitrine .ndzv-row{grid-template-columns:1fr}#ndz-vitrine button{justify-self:stretch}}
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

const contactBlock = (store, opts = {}) => {
  const slug = encodeURIComponent(store.slug || "")
  const note = opts.contactSent
    ? `<p class="ndzv-note" role="status">Message reçu. ${esc(store.name || "")} te répond dès que possible.</p>`
    : opts.contactError
      ? `<p class="ndzv-note err" role="alert">Vérifie ton nom et ton message, puis ajoute un téléphone ou un e-mail.</p>`
      : ""
  return `<section id="ndz-vitrine"><div class="ndzv-in" id="ecrire">
    <h2>Écrire à ${esc(store.name || "")}</h2>
    <p class="ndzv-sub">Parle de ton projet, de ta ville et du meilleur moment pour te rappeler. Le message arrive directement dans le tableau de bord.</p>
    ${note}
    <form method="post" action="/${slug}/contact">
      <input type="text" name="website" value="" autocomplete="off" tabindex="-1" hidden>
      <input type="hidden" name="back" value="">
      <label>Nom<input name="name" required maxlength="80" autocomplete="name" placeholder="Sara Bensalem"></label>
      <div class="ndzv-row">
        <label>Téléphone<input name="phone" inputmode="tel" maxlength="24" autocomplete="tel" placeholder="0555 12 34 56"></label>
        <label>E-mail<input name="email" type="email" maxlength="120" autocomplete="email" placeholder="sara@exemple.dz"></label>
      </div>
      <label>Message<textarea name="message" required maxlength="2000" placeholder="Ton projet, tes délais, tes questions…"></textarea></label>
      <button type="submit">Envoyer</button>
    </form>
  </div></section>`
}

/**
 * @returns {string} document HTML complet, ou "" si le template manque ou
 * n'appartient pas au type du magasin (un ancien choix incohérent retombe
 * alors proprement sur le rendu classique de NovaDZ).
 */
const render = (store, products, id, opts = {}) => {
  const template = get(id)
  if (!template || !isSiteForStore(id, store)) return ""
  let html
  try { html = read(id) } catch (_) { return "" }
  const slug = encodeURIComponent(store.slug || "")
  const name = esc(store.name || template.name)
  const isVitrine = template.kind === "vitrine"
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${name}</title>`)
  const fallbackDesc = isVitrine
    ? `${store.name || ""} — services, réalisations et contact.`
    : `${store.name || ""} — boutique en ligne, paiement à la livraison.`
  const desc = esc(store.tagline || store.about || fallbackDesc).slice(0, 300)
  if (/<meta\s+name="description"/i.test(html)) html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${desc}$2`)
  else html = html.replace(/<\/head>/i, `<meta name="description" content="${desc}"></head>`)
  html = html.replace(/<\/head>/i, `<style>${(isVitrine ? VITRINE_CSS : SHOP_CSS) + BAR_CSS}</style></head>`)
  const block = isVitrine ? contactBlock(store, opts) : shopBlock(store, products)
  let bar
  if (isVitrine) {
    const phone = String(store.phone || store.whatsapp || "").replace(/[^\d+]/g, "")
    bar = `<nav id="ndz-bar" aria-label="Contact"><a href="/${slug}">Accueil</a>${phone ? `<a href="tel:${esc(phone)}">Appeler</a>` : ""}<a class="main" href="#ecrire">Écrire</a></nav>`
  } else {
    const n = Math.max(0, Number(opts.cartCount) || 0)
    bar = `<nav id="ndz-bar" aria-label="Boutique"><a href="#ndz-boutique">Produits</a><a href="/${slug}/cart">Panier${n ? ` (${n})` : ""}</a><a class="main" href="/${slug}/checkout">Commander</a></nav>`
  }
  /* toujours en fin de page : un <footer> du template peut être imbriqué dans une colonne étroite */
  return html.replace(/<\/body>/i, block + bar + "</body>")
}

module.exports = { LIST, isSite, get, templateKindForStore, storeKindForSite, forStore, isSiteForStore, render }
