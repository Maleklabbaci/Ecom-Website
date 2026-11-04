"use strict"
/**
 * Templates « site complet » (site1…site16 + ceux importés par scripts/importer-template.py) :
 * de vraies pages d'accueil dessinées, servies telles quelles dans /templates/<id>.html
 * (démo) et, une fois choisies par un marchand, comme page d'accueil de son site.
 *
 * Les deux familles ne se mélangent jamais :
 *  - « boutique » : réservé aux e-commerce, avec les produits, le panier et la
 *    commande NovaDZ ;
 *  - « vitrine » : réservé aux sites de présentation, avec le formulaire de
 *    contact NovaDZ, sans produit, panier ni commande.
 *
 * Studio : le marchand édite une copie du HTML (opts.html), page par page
 * (opts.key). Le HTML enregistré est assaini dans src/studio.js et la page
 * publique est en plus servie avec la CSP ci-dessous (aucun script marchand).
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
const forStore = (storeOrKind) => all().filter((t) => t.kind === templateKindForStore(storeOrKind))
const isSiteForStore = (id, storeOrKind) => {
  const t = get(id)
  return !!t && t.kind === templateKindForStore(storeOrKind)
}

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
const source = (id) => { try { return read(id) } catch (_) { return "" } }

/* La photo d'une carte produit : `display:block` est indispensable. Un <span>
   reste en ligne, l'aspect-ratio ne s'applique pas et la photo s'affiche
   écrasée sur 50 px de haut — c'était le défaut « les images ne s'affichent
   pas ». Le prix prend sa couleur dans --ndz-prix : un seul réglage dans le
   Studio change tous les prix de la boutique, d'un coup. */
const SHOP_CSS = `
#ndz-boutique{all:initial;display:block;box-sizing:border-box;background:#fff;color:#111;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:72px 24px;position:relative;z-index:2}
#ndz-boutique *{box-sizing:border-box}
#ndz-boutique .ndzs-in{max-width:1180px;margin:0 auto}
#ndz-boutique h2{font:700 30px/1.15 system-ui,sans-serif;margin:0 0 28px;color:#111}
#ndz-boutique .ndzs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:22px}
#ndz-boutique a.ndzs-card{display:block;text-decoration:none;color:#111}
#ndz-boutique .ndzs-img{display:block;aspect-ratio:4/5;background:#f1f1ef;border-radius:12px;overflow:hidden}
#ndz-boutique .ndzs-img img{width:100%;height:100%;object-fit:cover;display:block}
#ndz-boutique .ndzs-noimg{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:linear-gradient(135deg,#f4f3f8,#e9e8ef);color:#a5a2b3}
#ndz-boutique .ndzs-noimg svg{width:34%;height:auto;max-width:64px;min-width:26px;opacity:.85}
#ndz-boutique .ndzs-t{display:block;font:600 15px/1.3 system-ui,sans-serif;margin:10px 0 2px}
#ndz-boutique .ndzs-p{display:block;font:500 14px/1.3 system-ui,sans-serif;color:var(--ndz-prix,#555)}
#ndz-boutique .ndzs-empty{font:400 15px/1.5 system-ui,sans-serif;color:#666}
`

/* La pastille NOVADZ était posée en bas à droite, au-dessus du bouton
   « Commander » de la barre d'achat : sur téléphone elle cachait le seul
   bouton qui compte. On la retire sous 700 px ; la signature reste dans le
   pied de page (« Propulsé par NovaDZ »). */
const BRAND_CSS = `@media (max-width:700px){#novadz-brand{display:none!important}}`

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

/* Site en arabe : la police choisie par le marchand remplace le latin là où il
   faut, sans écraser les titres décoratifs du modèle (ils restent tels quels).
   La police vient de `arabic_font` (voir src/fonts-ar.js) : c'est un choix de
   la boutique, pas du modèle, donc il s'applique partout de la même façon. */
const AR_FONTS = require("./fonts-ar")
const arCss = (store) => `<link rel="stylesheet" href="/arabic-fonts.css"><style>
html[dir="rtl"]{font-family:${AR_FONTS.stack(store)} !important}
html[dir="rtl"] body,html[dir="rtl"] p,html[dir="rtl"] li,html[dir="rtl"] a,
html[dir="rtl"] span,html[dir="rtl"] label,html[dir="rtl"] input,html[dir="rtl"] textarea,
html[dir="rtl"] button,html[dir="rtl"] small,html[dir="rtl"] b,html[dir="rtl"] strong,
html[dir="rtl"] h1,html[dir="rtl"] h2,html[dir="rtl"] h3,
html[dir="rtl"] h4,html[dir="rtl"] h5,html[dir="rtl"] h6{font-family:${AR_FONTS.stack(store)} !important}
html[dir="rtl"] #ndz-bar{direction:rtl}
html[dir="rtl"] #ndz-boutique .ndzs-grid,html[dir="rtl"] #ndz-vitrine .ndzv-row{direction:rtl}
/* Le marchand garde ses textes : s'il écrit en français ou en anglais, la
   phrase doit se lire de gauche à droite, même dans une page arabe. Sans ça,
   « …Comfort & Style! » s'affichait « !Comfort & Style ». Chaque texte prend
   donc son sens de lecture de son premier mot. */
html[dir="rtl"] h1,html[dir="rtl"] h2,html[dir="rtl"] h3,html[dir="rtl"] h4,
html[dir="rtl"] h5,html[dir="rtl"] h6,html[dir="rtl"] p,html[dir="rtl"] li,
html[dir="rtl"] a,html[dir="rtl"] span,html[dir="rtl"] button,html[dir="rtl"] label,
html[dir="rtl"] small,html[dir="rtl"] b,html[dir="rtl"] strong,html[dir="rtl"] em,
html[dir="rtl"] blockquote,html[dir="rtl"] figcaption,html[dir="rtl"] summary,
html[dir="rtl"] td,html[dir="rtl"] th{unicode-bidi:plaintext}
</style>`

/* Modèles « site complet » en arabe : on ne traduit que ce que la PLATEFORME
   ajoute (produits, contact, barre du bas). Le contenu du modèle appartient au
   marchand : il l'écrit dans le Studio. */
const T = {
  fr: {
    products: "Nos produits", soon: "Les produits arrivent bientôt.",
    writeTo: "Écrire à", intro: "Parle de ton projet, de ta ville et du meilleur moment pour te rappeler. Le message arrive directement dans le tableau de bord.",
    name: "Nom", phone: "Téléphone", email: "E-mail", message: "Message", send: "Envoyer",
    sent: "Message reçu. Nous vous répondons dès que possible.",
    err: "Vérifie ton nom et ton message, puis ajoute un téléphone ou un e-mail.",
    navHome: "Accueil", navCall: "Appeler", navWrite: "Écrire",
    navProducts: "Produits", navCart: "Panier", navOrder: "Commander",
  },
  ar: {
    products: "منتجاتنا", soon: "المنتجات قادمة قريباً.",
    writeTo: "اكتب إلى", intro: "حدّثنا عن مشروعك ومدينتك وأفضل وقت للاتصال بك. تصل الرسالة مباشرة إلى لوحة التحكم.",
    name: "الاسم", phone: "الهاتف", email: "البريد الإلكتروني", message: "الرسالة", send: "إرسال",
    sent: "وصلت رسالتك. سنتواصل معك في أقرب وقت.",
    err: "تحقّق من الاسم والرسالة، وأضف هاتفاً أو بريداً إلكترونياً.",
    navHome: "الرئيسية", navCall: "اتصل", navWrite: "راسلنا",
    navProducts: "المنتجات", navCart: "السلة", navOrder: "اطلب الآن",
  },
}
const t = (lang) => T[lang] || T.fr

const shopBlock = (store, products, lang = "fr") => {
  const W = t(lang)
  const slug = encodeURIComponent(store.slug || "")
  const list = Array.isArray(products) ? products.slice(0, 24) : []
  /* photo absente : un cadre neutre, pas une carte vide qui ressemble à un
     bug. On n'invente aucune photo et aucun produit. */
  const sansPhoto = `<span class="ndzs-noimg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M3.5 17l4.6-4.4a2 2 0 0 1 2.7 0L16 17.6"/></svg></span>`
  /* data-ndz-produit : le Studio s'en sert pour retrouver le produit cliqué
     (nom et prix modifiables sans quitter l'éditeur). */
  const cards = list.map((p) => `<a class="ndzs-card" href="/${slug}/p/${Number(p.id)}" data-ndz-produit="${Number(p.id)}" data-titre="${esc(p.title)}" data-prix="${Number(p.price_cents || 0)}">
      <span class="ndzs-img">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : sansPhoto}</span>
      <span class="ndzs-t">${esc(p.title)}</span>
      <span class="ndzs-p">${esc(money(p.price_cents, store.currency || "DZD"))}</span>
    </a>`).join("")
  return `<section id="ndz-boutique"><div class="ndzs-in">
    <h2>${W.products}</h2>
    ${list.length ? `<div class="ndzs-grid">${cards}</div>` : `<p class="ndzs-empty">${W.soon}</p>`}
  </div></section>`
}

const contactBlock = (store, opts = {}) => {
  const lang = opts.lang || "fr"
  const W = t(lang)
  const slug = encodeURIComponent(store.slug || "")
  const note = opts.contactSent
    ? `<p class="ndzv-note" role="status">${W.sent}</p>`
    : opts.contactError
      ? `<p class="ndzv-note err" role="alert">${W.err}</p>`
      : ""
  return `<section id="ndz-vitrine"><div class="ndzv-in" id="ecrire">
    <h2>${W.writeTo} ${esc(store.name || "")}</h2>
    <p class="ndzv-sub">${W.intro}</p>
    ${note}
    <form method="post" action="/${slug}/contact">
      <input type="text" name="website" value="" autocomplete="off" tabindex="-1" hidden>
      <input type="hidden" name="back" value="">
      <label>${W.name}<input name="name" required maxlength="80" autocomplete="name" placeholder="${lang === "ar" ? "سارة بن سالم" : "Sara Bensalem"}"></label>
      <div class="ndzv-row">
        <label>${W.phone}<input name="phone" inputmode="tel" maxlength="24" autocomplete="tel" placeholder="0555 12 34 56"></label>
        <label>${W.email}<input name="email" type="email" maxlength="120" autocomplete="email" placeholder="sara@exemple.dz"></label>
      </div>
      <label>${W.message}<textarea name="message" required maxlength="2000" placeholder="${lang === "ar" ? "مشروعك، المدة، أسئلتك…" : "Ton projet, tes délais, tes questions…"}"></textarea></label>
      <button type="submit">${W.send}</button>
    </form>
  </div></section>`
}

/**
 * @param opts.html    HTML enregistré par le Studio (sinon le fichier du template)
 * @param opts.key     page demandée (studio) — « home » par défaut
 * @param opts.studio  true : version éditable (bloc produits repérable, pas de barre, script du studio)
 * @param opts.auto    false : ne pas ajouter le bloc produits s'il manque dans la page
 * @returns {string} document HTML complet, ou "" si le template manque ou
 * n'appartient pas au type du magasin (un ancien choix incohérent retombe
 * alors proprement sur le rendu classique de NovaDZ).
 */
const render = (store, products, id, opts = {}) => {
  const template = get(id)
  if (!template || !isSiteForStore(id, store)) return ""
  /* langue du site : le site en arabe se lit de droite à gauche, avec la
     police arabe auto-hébergée (Estedad). Les modèles fournis sont écrits en
     latin : ils restent lisibles, et le marchand traduit ses textes au Studio. */
  const I18N = require("./i18n")
  const lang = opts.lang || I18N.langNow(store)
  const ar = lang === "ar"
  const W = t(lang)
  const isVitrine = template.kind === "vitrine"
  let html = opts.html || ""
  if (!html) { try { html = read(id) } catch (_) { return "" } }
  /* Les modèles importés portent parfois leur propre <meta http-equiv
     content-security-policy>, héritée de l'outil qui les a dessinés : elle
     interdit nos scripts (le bouton « ajouter au panier ») et ne sert à rien,
     puisque le serveur envoie déjà une vraie politique dans l'en-tête. On la
     retire, à chaque rendu, sans toucher au reste du modèle. */
  html = html.replace(/<meta\b[^>]*http-equiv=["']?content-security-policy["']?[^>]*>/gi, "")
  const slug = encodeURIComponent(store.slug || "")
  const name = esc(store.name || template.name)

  /* le Studio garde le <title> écrit par le marchand ; la page publique prend le nom de la boutique */
  const keepTitle = opts.html && !opts.studio && !/&nbsp;|\|\s*NovaDZ/.test(html)
  html = html.replace(/<title>[\s\S]*?<\/title>/i, (m) => (keepTitle ? m : `<title>${name}</title>`))
  if (!/<title>/i.test(html)) html = html.replace(/<\/head>/i, `<title>${name}</title></head>`)
  const fallbackDesc = isVitrine
    ? `${store.name || ""} — services, réalisations et contact.`
    : `${store.name || ""} — boutique en ligne, paiement à la livraison.`
  const desc = esc(store.tagline || store.about || fallbackDesc).slice(0, 300)
  if (!/<meta\s+name="description"/i.test(html)) html = html.replace(/<\/head>/i, `<meta name="description" content="${desc}"></head>`)
  else if (!opts.html) html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${desc}$2`)

  const links = FONT_CSS.filter((f) => !html.includes(f)).map((f) => `<link rel="stylesheet" href="${f}">`).join("")
  const blockCss = isVitrine ? VITRINE_CSS : SHOP_CSS
  /* Une page enregistrée depuis le Studio en arabe garde dans son HTML le
     sens de lecture du moment (« dir="rtl" »). Au rendu, c'est LA PAGE qui
     décide : sinon la boutique restait de droite à gauche même en français.
     On remet donc toujours l'attribut d'après la langue demandée. */
  html = html.replace(/<html\b([^>]*)>/i, (m, a) => {
    const clean = a.replace(/\s(dir|lang)="[^"]*"/gi, "")
    return `<html${clean} dir="${ar ? "rtl" : "ltr"}" lang="${ar ? "ar" : "fr"}">`
  })
  if (ar) {
    /* dir=rtl sur la racine : tout le modèle se retourne, sans le modifier. */
    html = html.replace(/<html\b([^>]*)>/i, (m, a) => {
      const clean = a.replace(/\s(dir|lang)="[^"]*"/gi, "")
      return `<html${clean} dir="rtl" lang="ar">`
    })
    if (!/<html\b/i.test(html)) html = `<html dir="rtl" lang="ar">` + html
  }
  /* La couleur des prix (et de ce qui se répète) vient d'un seul réglage,
     gardé avec la boutique : --ndz-prix. Une variable, donc la changer une
     fois la change partout où elle sert. */
  const prix = (() => { try { const d = JSON.parse(store.design || "{}"); return /^#[0-9a-f]{6}$/i.test(d.prix || "") ? d.prix : "" } catch (_) { return "" } })()
  const varsCss = prix ? `<style id="ndz-vars">html{--ndz-prix:${prix}}</style>` : ""
  /* une seule feuille de variables, toujours à jour : l'ancienne est retirée
     même quand le marchand revient à la couleur d'origine, sinon l'ancienne
     couleur resterait dans la page enregistrée. */
  html = html.replace(/<style[^>]*id="ndz-vars"[^>]*>[\s\S]*?<\/style>/gi, "")
  /* la pastille de langue écrit « ع » : sa police vient avec elle, sinon
     certains systèmes affichaient un autre signe à la place. */
  const offersAr = !ar && I18N.storeLangs(store).includes("ar")
  const pillCss = offersAr
    ? '<link rel="stylesheet" href="/arabic-fonts.css"><style>.lang-switch{font-family:"Cairo","IBM Plex Sans Arabic","Noto Naskh Arabic",system-ui,sans-serif}</style>'
    : ""
  if (!opts.studio) html = html.replace(/<\/head>/i, `${links}${ar ? arCss(store) : pillCss}${varsCss}${html.includes("ndz-shop-css") ? "" : `<style id="ndz-shop-css">${blockCss}</style>`}<style>${BAR_CSS}${BRAND_CSS}</style></head>`)

  /* liens entre pages d'un site importé : /__ndz__/s/about -> /<boutique>/s/about */
  html = html.replace(/\/__ndz__(?=[\/"'#?])/g, "/" + slug)
  html = html.replace(/<html\b([^>]*?)\s+data-ndz-slug="[^"]*"/i, "<html$1")
  html = html.replace(/<html\b/i, `<html data-ndz-slug="${esc(store.slug || "")}"`)

  /* vidéo YouTube : seul un identifiant de 11 caractères passe, jamais une adresse libre */
  html = html.replace(/<div\b([^>]*\bdata-ndz-video="([\w-]{11})"[^>]*)>\s*(?:<iframe[\s\S]*?<\/iframe>)?\s*<\/div>/gi,
    (m, attrs, vid) => `<div${attrs}><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="Vidéo" loading="lazy" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe></div>`)
  html = html.replace(/<link rel="stylesheet" href="\/_studio\/fx\.css">/g, "")
  html = html.replace(/<\/head>/i, `<link rel="stylesheet" href="/_studio/fx.css"></head>`)

  let bar = ""
  if (isVitrine) {
    /* vitrine : formulaire de contact, aucun produit, aucun panier.
       Dans le Studio, le bloc est montré mais marqué « data-studio-ui » :
       frame.js le retire à l'enregistrement, sinon il serait enregistré
       avec la page puis ajouté une deuxième fois au rendu (doublon). */
    if (opts.auto !== false) {
      const block = contactBlock(store, { ...opts, lang })
      html = html.replace(/<\/body>/i, (opts.studio ? `<section data-studio-ui="apercu-contact">${block}</section>` : block) + "</body>")
    }
    const phone = String(store.phone || store.whatsapp || "").replace(/[^\d+]/g, "")
    bar = `<nav id="ndz-bar" aria-label="${ar ? "تواصل" : "Contact"}"><a href="/${slug}">${W.navHome}</a>${phone ? `<a href="tel:${esc(phone)}">${W.navCall}</a>` : ""}<a class="main" href="#ecrire">${W.navWrite}</a></nav>`
  } else {
    /* boutique : produits, panier, commande */
    const shop = shopBlock(store, products, lang)
    if (!PH.test(html) && opts.auto !== false) html = html.replace(/<\/body>/i, `<div data-ndz="produits"></div></body>`)
    html = html.replace(PH, opts.studio ? `<div data-ndz="produits">${shop}</div>` : shop)
    const n = Math.max(0, Number(opts.cartCount) || 0)
    bar = `<nav id="ndz-bar" aria-label="${ar ? "المتجر" : "Boutique"}"><a href="#ndz-boutique">${W.navProducts}</a><a href="/${slug}/cart">${W.navCart}${n ? ` (${n})` : ""}</a><a class="main" href="/${slug}/checkout">${W.navOrder}</a></nav>`
  }

  if (opts.studio) {
    html = html.replace(/<script defer src="\/_studio\/fx\.js"><\/script>/g, "")
    /* scripts du template : en pause dans l'éditeur (ils casseraient la sélection), remis tels quels à l'enregistrement */
    html = html.replace(/<script\b([^>]*?)\bsrc="(\/templates\/[^"]+)"([^>]*)>\s*<\/script>/gi, (m, a, src, b) =>
      `<script type="text/ndz-off" data-ndz-src="${src}"${/type\s*=\s*"module"/i.test(a + b) ? ' data-ndz-mod="1"' : ""}></script>`)
    /* Les styles du bloc « Nos produits » sont dans une feuille à part, et
       pas dans une feuille du Studio : ainsi le marchand peut changer la
       couleur des prix depuis « Mon site », et elle est enregistrée avec la
       page. Sans ça, la couleur du prix restait invisible aux réglages. */
    html = html.replace(/<style[^>]*id="ndz-shop-css"[^>]*>[\s\S]*?<\/style>/gi, "")
    html = html.replace(/<\/head>/i, `${varsCss}<style id="ndz-shop-css">[data-ndz="produits"] a{cursor:pointer}${blockCss}</style><script defer src="/_studio/frame.js"></script></head>`)
    return html
  }

  /* boutons « acheter » : sans JS ils mènent à la fiche produit, avec fx.js ils achètent ou ajoutent au panier */
  html = html.replace(/<a\b([^>]*\bdata-ndz-pid="(\d+)"[^>]*)>/gi, (m, attrs, pid) => {
    const href = `/${slug}/p/${pid}`
    return /\shref\s*=/i.test(attrs) ? `<a${attrs.replace(/(\shref\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${href}"`)}>` : `<a href="${href}"${attrs}>`
  })
  /* formulaire de contact posé dans le studio : l'adresse d'envoi est posée ici, jamais lue dans le HTML du marchand */
  html = html.replace(/<form\b([^>]*\bdata-ndz-form[^>]*)>/gi, (m, attrs) =>
    `<form${attrs.replace(/\s(?:method|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")} method="post" action="/${slug}/s-form"><input type="hidden" name="back" value="${esc(opts.key || "home")}">`)
  html = html.replace(/<\/body>/i, `<script defer src="/_studio/fx.js"></script></body>`)
  /* toujours en fin de page : un <footer> du template peut être imbriqué dans une colonne étroite */
  return html.replace(/<\/body>/i, bar + "</body>")
}

module.exports = { isSite, get, render, source, pages, pageSource, CSP, templateKindForStore, storeKindForSite, forStore, isSiteForStore }
Object.defineProperty(module.exports, "LIST", { enumerable: true, get: all })
