"use strict"
/**
 * Layouts de vitrine — quatre structures réellement différentes.
 * Ce ne sont pas des variantes de couleur : header, hero, grille, fiche
 * produit, panier, checkout et footer sont recomposés pour chaque thème.
 */

const { icon, initial } = require("./icons")
const I18N = require("./i18n")
const PAY = require("./payments")
const SOCIAL = require("./social")
const SECTIONS = require("./sections")
const CF = require("./checkoutform")
const SHOP = require("./shop")
const CARRIERS = require("./carriers")
const GEO = require("./geo")
const { esc, money, moneyHtml, WILAYAS, page, PREVIEW_SCRIPT } = require("./ui")
const { readSections, renderSections, readDesign, readDraft, storeStyle, designClass, img, readNav } = require("./sections")
const db = require("./db")

/** Lien de navigation : "" = accueil, sinon page interne ou URL externe. */
const navHref = (store, url) => {
  if (!url) return `/${esc(store.slug)}`
  if (/^https?:\/\//.test(url)) return esc(url)
  if (url.startsWith("/")) return url
  return `/${esc(store.slug)}/${esc(url.replace(/^\//, ""))}`
}
const navLinks = (store, cls) => {
  const D = readDesign(store)
  const extra = Array.isArray(D.navAdd) ? D.navAdd : []
  const write = store.site_kind === "vitrine"
    ? `<a${cls ? ` class="${cls}"` : ""} href="/${esc(store.slug)}#ecrire">Écrire</a>`
    : ""
  return readNav(store)
    .map((l) => `<a${cls ? ` class="${cls}"` : ""} href="${navHref(store, l.url)}">${esc(l.label)}</a>`)
    .join("") +
    extra
      .filter((l) => l && l.label)
      .map((l) => `<a${cls ? ` class="${cls}"` : ""} href="${navHref(store, l.url)}">${esc(l.label)}</a>`)
      .join("") + write
}

/** Accueil = suite de sections ordonnées par le marchand dans l'éditeur. */
const homeFromSections = (store, products, meta) =>
  renderSections(store, readSections(store), {
    products,
    design: readDesign(store),
    /* pas de barre Tout / rayons / Récents : retirée de tous les thèmes */
    before: "",
    cats: (() => { try { return SHOP.categories(store.id) || [] } catch (_) { return [] } })(),
    store,
  })

const slug = (store) => `/` + esc(store.slug)
const emptyCartHref = (store) => {
  const u = String((readDesign(store).cartEmptyUrl) || "").trim()
  return u ? navHref(store, u) : slug(store)
}
const cur = (store) => store.currency || "DZD"
const price = (store, cents) => moneyHtml(cents, cur(store))

/**
 * Bouton d'achat. Trois modes réglables par le marchand (éditeur → Panier) :
 *   panier : ajout au panier classique ;
 *   direct : aucun panier, on file droit au formulaire de commande ;
 *   deux   : les deux boutons côte à côte (défaut).
 * Le second bouton utilise `formaction` : même formulaire, autre destination.
 */
const cartModeOf = (store) => {
  const d = readDesign(store)
  return ["panier", "direct", "deux"].includes(d.cartMode) ? d.cartMode : "deux"
}

/** Boutons « commander avec ce moyen de paiement » : aucun panier, un clic.
    Ils vivent dans le même formulaire (formaction) pour garder la variante choisie. */
/* Pastille de couleur à partir du nom déjà saisi (Noir, Rouge…).
   Pas de catalogue d'images : la boutique n'invente pas de photo. */
const SWATCH = {
  noir: "#111111", black: "#111111", blanc: "#ffffff", white: "#ffffff",
  rouge: "#c0392b", red: "#c0392b", bleu: "#1d4e89", blue: "#1d4e89",
  vert: "#1e7a46", green: "#1e7a46", jaune: "#e6c200", yellow: "#e6c200",
  rose: "#e7a3b5", pink: "#e7a3b5", beige: "#e6d5c3", marron: "#6b3e26",
  brown: "#6b3e26", gris: "#8a8a8a", gray: "#8a8a8a", grey: "#8a8a8a",
  orange: "#e07a2f", violet: "#6c4ab6", or: "#c6a15b", gold: "#c6a15b",
  marine: "#1b2a4a", bordeaux: "#6e1e2a", kaki: "#6b6a3a", creme: "#f3ead8",
  argent: "#c0c0c0", navy: "#1b2a4a", purple: "#6c4ab6",
}
const swatchOf = (label) => {
  const raw = String(label || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (SWATCH[raw]) return SWATCH[raw]
  const first = raw.split(/[\s/-]+/)[0]
  return SWATCH[first] || ""
}
const swatchMark = (label) => {
  const c = swatchOf(label)
  const letter = esc(String(label || "").trim().slice(0, 1))
  return `<i class="vp-swatch"${c ? ` style="background:${c}"` : ""} aria-hidden="true">${c ? "" : letter}</i>`
}

/** Les boutons sont toujours dans la page. data-cart et data-accel les
    montrent ou les cachent, dans l'aperçu et sur la boutique publiée. */
const payDirectButtons = (store, p) => {
  const methods = PAY.list(store)
  if (!methods.length) return ""
  return methods.map((m) => `<button class="ndz-paybtn" formaction="${slug(store)}/direct"
    name="payment" value="${esc(m.id)}" ${p.stock === 0 ? "disabled" : ""}>Commander · ${esc(m.name)}</button>`).join("")
}

const buyButtons = (store, p, cls, label) => {
  const soldOut = p.stock === 0 ? "disabled" : ""
  const cartBtn = `<button class="${cls} ndz-cart-add" ${soldOut}>${label || "Ajouter au panier"}</button>`
  const directBtn = `<button class="${cls} ndz-buy-now" formaction="${slug(store)}/direct" ${soldOut}>Acheter maintenant</button>`
  return cartBtn + directBtn + payDirectButtons(store, p)
}

const addForm = (store, p, cls, label) => `
<form method="post" action="${slug(store)}/cart" class="ndz-buy">
  <input type="hidden" name="product_id" value="${p.id}">
  ${buyButtons(store, p, cls, label)}
</form>`

const PROMO_ERRORS = {
  inconnu: "Ce code n'existe pas ou n'est plus actif.",
  epuise: "Ce code a atteint sa limite d'utilisation.",
  minimum: "Le montant minimum du panier n'est pas atteint pour ce code.",
  produits: "Ce code ne s'applique qu'à un produit absent de votre panier.",
}
const promoErrorText = (msg) => PROMO_ERRORS[String(msg).slice(4)] || "Code invalide."

const promoBox = (store, totals, msg) => {
  if (readDesign(store).cartDiscount === false) return ""
  const applied = totals.promo ? totals.promo.code : ""
  return `
<form class="promo" method="post" action="/${esc(store.slug)}/promo">
  <div class="promo-in">
    ${icon("receipt", 15)}
    <input name="code" placeholder="Code promo" value="${esc(applied)}" autocomplete="off">
    <button class="promo-btn">${applied ? "Changer" : "Appliquer"}</button>
  </div>
  ${msg === "ok" && applied ? `<span class="promo-ok">Code ${esc(applied)} appliqué</span>` : ""}
  ${msg && msg.indexOf("err:") === 0 ? `<span class="promo-err">${promoErrorText(msg)}</span>` : ""}
</form>`
}

const discountRow = (cls, store, totals) =>
  totals.discount > 0
    ? `<div class="${cls}"><span>Remise ${totals.promo ? esc(totals.promo.code) : ""}</span><span>−${money(totals.discount, cur(store))}</span></div>`
    : ""

/* -------- galerie (plusieurs images + point focal) -------- */
/** Prix affiché : prix courant, plus l'ancien prix barré et la remise si le marchand en a saisi un. */
const priceWithCompare = (store, p) => {
  const cur = Number(p && p.price_cents) || 0
  const cmp = Number(p && p.compare_cents) || 0
  if (!cmp || cmp <= cur) return price(store, cur)
  const pct = Math.max(1, Math.round((1 - cur / cmp) * 100))
  return `<span class="pr-now">${price(store, cur)}</span><s class="pr-old">${price(store, cmp)}</s><b class="pr-off">-${pct}%</b>`
}

/** « Plus que N » quand le stock est bas (seuil réglable dans le Design). */
const stockNote = (store, p) => {
  const n = Number(p && p.stock) || 0
  const alert = Number(readDesign(store).stockAlert)
  const seuil = alert > 0 ? alert : 5
  if (n <= 0) return ""
  if (n > seuil) return ""
  return `<p class="ndz-stock-low">${n === 1 ? "Dernière pièce disponible" : `Plus que ${n} en stock`}</p>`
}

/** « Souvent achetés ensemble » : 1 à 3 produits liés, ajoutés en un clic. */
const bundleBlock = (store, p) => {
  const ids = String((p && p.bundle_ids) || "")
    .split(",").map((n) => parseInt(n, 10)).filter((n) => n > 0 && n !== p.id).slice(0, 3)
  if (!ids.length) return ""
  const rows = db.prepare(`SELECT id, title, price_cents, image FROM products
    WHERE store_id = ? AND active = 1 AND id IN (${ids.map(() => "?").join(",")}) ORDER BY title`)
    .all(store.id, ...ids)
  if (!rows.length) return ""
  const total = rows.reduce((a, r) => a + r.price_cents, Number(p.price_cents) || 0)
  return `
<div class="ndz-bundle">
  <b class="ndz-bundle-t">Souvent achetés ensemble</b>
  <form method="post" action="/${esc(store.slug)}/cart/bundle" class="ndz-bundle-form">
    <input type="hidden" name="ids" value="${p.id}">
    <span class="ndz-bundle-row ndz-bundle-this" data-cents="${Number(p.price_cents) || 0}">${img(p.image, "ndz-bundle-img", p.title)}<span><b>${esc(p.title)}</b><em>${priceWithCompare(store, p)}</em></span></span>
    ${rows.map((r) => `<label class="ndz-bundle-row">
      <input type="checkbox" name="ids" value="${r.id}" data-cents="${Number(r.price_cents) || 0}" checked>
      ${img(r.image, "ndz-bundle-img", r.title)}
      <span><b>${esc(r.title)}</b><em>${price(store, r.price_cents)}</em></span>
    </label>`).join("")}
    <div class="ndz-bundle-foot">
      <span>Ensemble : <b data-bundle-total data-cents="${total}">${price(store, total)}</b></span>
      <button class="btn btn-primary btn-sm" type="submit" data-bundle-btn>Ajouter les ${rows.length + 1} au panier</button>
    </div>
  </form>
  <script>
  (function(){
    var form = document.currentScript.previousElementSibling;
    if (!form) return;
    var btn = form.querySelector("[data-bundle-btn]");
    var total = form.querySelector("[data-bundle-total]");
    var self = form.querySelector(".ndz-bundle-this");
    var boxes = form.querySelectorAll("input[type=checkbox]");
    function money(cents){
      var n = (Number(cents) || 0) / 100;
      return n.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DZD";
    }
    function sync(){
      var cents = Number(self && self.getAttribute("data-cents")) || 0;
      var n = 1;
      boxes.forEach(function(b){ if (b.checked) { n++; cents += Number(b.getAttribute("data-cents")) || 0; } });
      if (btn) btn.textContent = n > 1 ? ("Ajouter les " + n + " au panier") : "Ajouter au panier";
      if (total) total.textContent = money(cents);
    }
    boxes.forEach(function(b){ b.addEventListener("change", sync); });
  })();
  </script>
</div>`
}

/** Barre de recherche de la boutique : emplacement choisi par le marchand dans le Design. */

/** Pose le lien de langue dans l'en-tête, juste avant la recherche.
    S'il n'y a pas de recherche, il reste dans la barre (jamais en languette fixe). */
const placeLang = (html, link) => {
  const headStart = html.indexOf("<header")
  const headEnd = html.indexOf("</header>")
  const head = headStart !== -1 && headEnd > headStart ? html.slice(headStart, headEnd) : ""
  const markers = [
    'class="ndz-search-btn',
    'class="ndz-search ',
    'class="tpx-search"',
    'class="ca-search',
    'class="th-search',
    'aria-label="Rechercher"',
  ]
  /* dans le groupe d'actions (panier, compte) : jamais en languette sur le bord gauche */
  const actions = head.indexOf('class="tpx-actions"')
  if (actions !== -1) {
    const close = head.indexOf("</div>", actions)
    if (close !== -1) return html.slice(0, headStart + close) + link + html.slice(headStart + close)
  }
  if (head) {
    for (const m of markers) {
      const i = head.indexOf(m)
      if (i === -1) continue
      const tag = head.lastIndexOf("<", i)
      if (tag === -1) continue
      /* champ de recherche du thème : le lien reste dedans, même si le champ passe à la ligne */
      if (m.indexOf("tpx-search") !== -1 || m.indexOf("ca-search") !== -1 || m.indexOf("th-search") !== -1) {
        const formEnd = head.indexOf("</form>", tag)
        if (formEnd !== -1) {
          const abs = headStart + formEnd
          return html.slice(0, abs) + link + html.slice(abs)
        }
      }
      const abs = headStart + tag
      return html.slice(0, abs) + link + html.slice(abs)
    }
  }
  const bar = html.indexOf('class="ndz-searchbar"')
  if (bar !== -1 && (headEnd === -1 || bar > headEnd)) {
    const close = html.indexOf("</div>", bar)
    if (close !== -1) return html.slice(0, close) + link + html.slice(close)
  }
  if (head) {
    const spot = rowInsertPoint(head)
    if (spot > -1) {
      const abs = headStart + spot
      return html.slice(0, abs) + link + html.slice(abs)
    }
    return html.slice(0, headEnd) + link + html.slice(headEnd)
  }
  return html.replace("</body>", link + "</body>")
}

/** Position d'insertion dans la barre de l'en-tête : juste avant la fermeture du
    premier conteneur <div> qui suit <header>, pour rester sur la même ligne. */
const rowInsertPoint = (headHtml) => {
  const open = headHtml.indexOf("<div")
  if (open === -1) return -1
  let i = headHtml.indexOf(">", open) + 1
  let depth = 1
  while (i < headHtml.length) {
    const nextOpen = headHtml.indexOf("<div", i)
    const nextClose = headHtml.indexOf("</div>", i)
    if (nextClose === -1) return -1
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      if (depth === 0) return nextClose
      i = nextClose + 6
    }
  }
  return -1
}

const searchBox = (store, D, where) => {
  const action = `/${esc(store.slug)}`
  const hint = esc(D.searchHint == null ? "Rechercher un produit…" : D.searchHint)
  const al = ["gauche", "centre", "droite"].includes(D.searchAlign) ? D.searchAlign : "droite"
  if (where === "icone") {
    return `<button type="button" class="ndz-search-btn slot-${al}" data-searchopen aria-label="Rechercher">${icon("search", 17)}</button>`
  }
  return `<form class="ndz-search ndz-search-${where === "dessous" ? "bar" : "in"} slot-${al}" method="get" action="${action}" role="search">
  ${icon("search", 15)}
  <input name="q" type="search" placeholder="${hint}" aria-label="${hint}" autocomplete="off">
</form>`
}

/** Superposition de recherche pour la variante « icône ». */
const searchOverlay = (store, D) => `
<div class="ndz-searchlay" hidden>
  <form class="ndz-searchlay-in" method="get" action="/${esc(store.slug)}" role="search">
    ${icon("search", 18)}
    <input name="q" type="search" placeholder="${esc(D.searchHint == null ? "Rechercher un produit…" : D.searchHint)}" aria-label="Rechercher" autocomplete="off">
    <button type="button" class="ndz-searchlay-x" data-searchclose aria-label="Fermer">✕</button>
  </form>
</div>
<script>
(function(){
  var lay = document.currentScript.previousElementSibling;
  if (!lay) return;
  document.querySelectorAll('[data-searchopen]').forEach(function(b){
    b.addEventListener('click', function(){ lay.hidden = false; var i = lay.querySelector('input'); if (i) i.focus() })
  });
  lay.addEventListener('click', function(e){ if (e.target === lay || e.target.closest('[data-searchclose]')) lay.hidden = true });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') lay.hidden = true });
})();
</script>`

const focalCss = (f) => (f === "top" ? "center top" : f === "bottom" ? "center bottom" : "center")

const fileThere = (url) => {
  const src = String(url || "").trim().split("?")[0]
  if (!src) return false
  if (!src.startsWith("/") || src.startsWith("//")) return /^https?:\/\//i.test(src)
  try {
    return require("fs").existsSync(require("path").join(__dirname, "..", "public", src.slice(1)))
  } catch (_) { return false }
}

const galleryHtml = (store, p, extra) => {
  const imgs = (extra && extra.gallery) || []
  const all = [{ url: p.image, focal: p.focal }, ...imgs.filter((i) => i.url !== p.image)]
    .filter((i) => i.url && fileThere(i.url))
  /* pas de lettre dans le cadre : ça se lit comme une image cassée */
  if (!all.length) return `<div class="gal"><div class="gal-main placeholder" aria-hidden="true"></div></div>`
  return `
<div class="gal" data-gal>
  <div class="gal-main"><img src="${esc(all[0].url)}" alt="${esc(p.title)}" style="object-position:${focalCss(all[0].focal)}"></div>
  ${all.length > 1 ? `<div class="gal-thumbs">${all.map((i, idx) => `
    <button type="button" class="gal-thumb${idx === 0 ? " on" : ""}" data-src="${esc(i.url)}" data-focal="${focalCss(i.focal)}">
      <img src="${esc(i.url)}" alt="" style="object-position:${focalCss(i.focal)}">
    </button>`).join("")}</div>` : ""}
</div>
<script>
(function(){
  var box = document.currentScript.previousElementSibling;
  if (!box) return;
  var main = box.querySelector('.gal-main img');
  box.querySelectorAll('.gal-thumb').forEach(function(b){
    b.addEventListener('click', function(){
      if (!main) return;
      main.src = b.getAttribute('data-src');
      main.style.objectPosition = b.getAttribute('data-focal');
      box.querySelectorAll('.gal-thumb').forEach(function(x){ x.classList.remove('on') });
      b.classList.add('on');
    });
  });
})();
</script>`
}

/* -------- sélecteur de variante dans le formulaire d'ajout -------- */
const favButton = (store, p) =>
  `<button type="button" class="ndz-fav" data-fav="1" data-id="${p.id}" data-slug="${esc(store.slug)}"
    data-title="${esc(p.title)}" data-price="${money(p.price_cents, cur(store))}"
    data-img="${esc(p.image || "")}" data-url="/${esc(store.slug)}/p/${p.id}">
    <span class="ndz-fav-ico">♡</span> <span class="ndz-fav-txt">Mes favoris</span></button>
  <script>(function(){var b=document.currentScript.previousElementSibling;
  var k='ndz_fav_'+b.getAttribute('data-slug');
  var list=[];try{list=JSON.parse(localStorage.getItem(k)||'[]')}catch(e){list=[]}
  var id=Number(b.getAttribute('data-id'));
  function paint(on){b.classList.toggle('on',on);
    b.querySelector('.ndz-fav-ico').textContent=on?'♥':'♡';
    b.querySelector('.ndz-fav-txt').textContent=on?'Dans mes favoris':'Mes favoris'}
  paint(list.some(function(x){return Number(x.id)===id}));
  b.addEventListener('click',function(){
    var arr=[];try{arr=JSON.parse(localStorage.getItem(k)||'[]')}catch(e){arr=[]}
    var i=arr.findIndex(function(x){return Number(x.id)===id});
    if(i>=0){arr.splice(i,1);paint(false)}else{
      arr.unshift({id:id,title:b.getAttribute('data-title'),price:b.getAttribute('data-price'),
        img:b.getAttribute('data-img'),url:b.getAttribute('data-url')});paint(true)}
    try{localStorage.setItem(k,JSON.stringify(arr.slice(0,60)))}catch(e){}
  })})();</script>`

/** Formulaire de commande posé directement sur la fiche produit (sans bouton panier). */
const variantPills = (list, store, p, title) => `<div class="ck-var"><span>${esc(title || "Variante")}</span><span class="ck-pills">${list.map((v, i) => {
  const diff = v.price_cents && Number(v.price_cents) !== Number(p.price_cents)
  return `<label class="ck-pill"><input type="radio" name="buy_variant" value="${v.id}" ${i === 0 ? "checked" : ""}><span>${esc(v.label)}${diff ? " · " + money(v.price_cents, cur(store)) : ""}</span></label>`
}).join("")}</span></div>`

const qtyBlock = (p, open, title) => {
  const max = Math.max(1, Math.min(5, Number(p.stock) || 1))
  const name = esc(title || "Quantité")
  if (!open) {
    return `<div class="ndz-qty"><span>${name}</span><input name="buy_qty" type="number" min="1" max="${Math.max(1, Number(p.stock) || 1)}" value="1"></div>`
  }
  return `<div class="ck-var"><span>${name}</span><span class="ck-pills">${Array.from({ length: max }, (_, i) => i + 1).map((n) => `<label class="ck-pill"><input type="radio" name="buy_qty" value="${n}" ${n === 1 ? "checked" : ""}><span>${n}</span></label>`).join("")}</span></div>`
}

const deliveryChoice = (store, p, look) => {
  const types = SHOP.deliveryTypes(store)
  const home = types.find((t) => t.id === "home")
  const desk = types.find((t) => t.id === "desk")
  if (!look.delivery || !home || !desk) {
    const first = types[0] ? types[0].id : "home"
    return `<input type="hidden" name="delivery" value="${esc(first)}">`
  }
  const wilaya = store.wilaya && SHOP.WILAYAS.includes(store.wilaya) ? store.wilaya : "Alger"
  const seed = {
    home: SHOP.shippingFor(store.id, wilaya, "home"),
    desk: SHOP.shippingFor(store.id, wilaya, "desk"),
    source: "boutique",
    desks: [],
  }
  const say = (fr) => I18N.t(CF.formLang(store), fr)
  return `
<div class="ck-dlv" data-dlv>
  <span class="ck-dlv-label">${esc(CF.pieceText(store, "delivery"))}</span>
  <div class="ck-dlv-opts">
    <label class="ck-dlv-opt">
      <input type="radio" name="delivery" value="home" checked>
      <span><b>${esc(say("À domicile"))}</b><em data-dlv-price="home"></em></span>
    </label>
    <label class="ck-dlv-opt">
      <input type="radio" name="delivery" value="desk">
      <span><b>${esc(say("Au bureau"))}</b><em data-dlv-price="desk"></em></span>
    </label>
  </div>
  <p class="ck-dlv-src" data-dlv-src hidden></p>
</div>
<script type="application/json" class="ck-dlv-seed">${JSON.stringify(seed).replace(/</g, "\\u003c")}</script>
<script>
(function () {
  var seedEl = document.currentScript.previousElementSibling
  var form = document.currentScript.closest("form")
  if (!form || !seedEl) return
  var price = Number(form.getAttribute("data-price")) || 0
  var cur = form.getAttribute("data-cur") || "DZD"
  var slug = form.getAttribute("data-slug") || ""
  var last = null
  try { last = JSON.parse(seedEl.textContent || "{}") } catch (e) { last = {} }
  function fmt(c) {
    var ar = form.getAttribute("data-lang") === "ar"
    var loc = ar ? "ar-DZ" : "fr-FR"
    var unit = ar ? "دج" : cur
    return (Number(c) / 100).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + unit
  }
  function type() {
    var on = form.querySelector("[name=delivery]:checked")
    return on ? on.value : "home"
  }
  function apply(q) {
    if (!q) return
    form.querySelectorAll("[data-dlv-price=home]").forEach(function (el) { el.textContent = fmt(q.home) })
    form.querySelectorAll("[data-dlv-price=desk]").forEach(function (el) { el.textContent = fmt(q.desk) })
    var src = form.querySelector("[data-dlv-src]")
    if (src) {
      src.hidden = false
      src.textContent = q.source === "api" ? "Prix du transporteur." : "Prix de la boutique."
    }
    var ship = type() === "desk" ? Number(q.desk) || 0 : Number(q.home) || 0
    var btn = form.querySelector(".ndz-buyform-btn")
    if (btn) {
      var label = btn.getAttribute("data-label") || "Commander"
      btn.textContent = label + " — " + fmt(price + ship)
    }
    var wrap = form.querySelector("[data-desk-live]")
    var sel = form.querySelector("[data-desk-live] select[name=desk]")
    if (!wrap || !sel) return
    var desks = Array.isArray(q.desks) ? q.desks : []
    var show = type() === "desk" && desks.length > 0
    wrap.hidden = !show
    sel.disabled = !show
    if (!show) { sel.textContent = ""; return }
    sel.textContent = ""
    desks.forEach(function (d) {
      var o = document.createElement("option")
      o.value = [d.id || "", d.name || "", d.commune || ""].join("|")
      o.textContent = d.name + (d.commune ? " — " + d.commune : "")
      sel.appendChild(o)
    })
  }
  function load() {
    var wEl = form.querySelector("[name=wilaya]")
    var w = wEl ? wEl.value : ""
    if (!w) { apply(last); return }
    fetch("/" + slug + "/livraison?wilaya=" + encodeURIComponent(w), { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json() })
      .then(function (q) { last = q; apply(q) })
      .catch(function () { apply(last) })
  }
  form.addEventListener("change", function (e) {
    if (!e.target) return
    if (e.target.name === "wilaya") load()
    if (e.target.name === "delivery") apply(last)
  })
  function start() { apply(last); load() }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start)
  else start()
})()
</script>`
}

/** Bureau de retrait : toujours en bas, seulement après le choix Au bureau. */
const deskSlot = (store) => {
  const lang = CF.formLang(store)
  return `
<div class="ck-desk" data-desk-live hidden>
  <label class="ck-f ck-wide"><span>${esc(I18N.t(lang, "Bureau"))}</span>
    <select name="desk" disabled></select>
  </label>
</div>`
}

const inlineOrderForm = (store, p, variants) => {
  const types = SHOP.deliveryTypes(store)
  const look = CF.lookOf(store)
  const lang = CF.formLang(store)
  const open = look.model === "ouvert"
  const say = (fr) => I18N.t(lang, fr)
  const extra = {
    wilayas: SHOP.WILAYAS,
    shipping: SHOP.shippingTable(store.id),
    delivery: types,
    payments: PAY.list(store),
    skipGeo: true,
  }
  const def = store && GEO.isWilaya(store.wilaya) ? store.wilaya : "Alger"
  const stocked = (variants || []).filter((v) => v.stock > 0)
  const groups = optionGroupsOf(p)
  const varTitle = CF.pieceText(store, "variants", lang)
  const choices = stocked.length
    ? (open ? variantPills(stocked, store, p, varTitle) : `<label class="ck-f ck-wide"><span>${esc(varTitle)}</span><select name="buy_variant">${stocked.map((v) => `<option value="${v.id}">${esc(v.label)}${v.price_cents && Number(v.price_cents) !== Number(p.price_cents) ? " — " + money(v.price_cents, cur(store)) : ""}</option>`).join("")}</select></label>`)
    : (groups.length ? optionPicker(store, p, groups) : "")
  const flow = CF.pieces(store)
  const noteLast = flow.length && flow[flow.length - 1].id === "paynote"
  const parts = []
  let fieldBuf = []
  const flush = () => {
    if (!fieldBuf.length) return
    parts.push(`<div class="ck-grid">${fieldBuf.join("")}</div>`)
    fieldBuf = []
  }
  let deliveryOn = false
  for (const piece of (noteLast ? flow.slice(0, -1) : flow)) {
    if (piece.kind === "field") {
      fieldBuf.push(CF.renderField(piece.field, store, extra, lang, def, look))
      continue
    }
    flush()
    if (piece.id === "variants" && choices) parts.push(choices)
    else if (piece.id === "qty") parts.push(qtyBlock(p, open, CF.pieceText(store, "qty", lang)))
    else if (piece.id === "delivery") {
      deliveryOn = true
      parts.push(deliveryChoice(store, p, look))
    } else if (piece.id === "position") {
      parts.push(CF.geoBlock(store, lang, CF.pieceText(store, "position", lang)))
    } else if (piece.id === "paynote") {
      parts.push(`<p class="ndz-buyform-note">${icon("shield", 13)} ${esc(CF.pieceText(store, "paynote", lang))}</p>`)
    }
  }
  flush()
  if (!deliveryOn) parts.push(`<input type="hidden" name="delivery" value="home">`)
  const buy = say("Commander")
  const note = noteLast ? `<p class="ndz-buyform-note">${icon("shield", 13)} ${esc(CF.pieceText(store, "paynote", lang))}</p>` : ""
  const lock = look.lang === "fr"
  const form = `
<form class="ndz-buyform ck-shell ck-shell-${look.model}${lang === "ar" ? " ck-ar" : ""}" style="${CF.lookStyle(look)}" method="post" action="/${esc(store.slug)}/checkout" dir="${lang === "ar" ? "rtl" : "ltr"}" data-price="${Number(p.price_cents) || 0}" data-cur="${esc(cur(store))}" data-slug="${esc(store.slug)}" data-lang="${esc(lang)}">
  <input type="hidden" name="buy_id" value="${p.id}">
  ${parts.join("\n  ")}
  ${deliveryOn ? deskSlot(store) : ""}
  <button class="btn btn-primary btn-block btn-lg ndz-buyform-btn" type="submit" data-label="${esc(buy)}">
    ${esc(buy)} — ${price(store, p.price_cents)}
  </button>
  ${note}
</form>`
  return lock ? `<!--ndz-lock-->${form}<!--/ndz-lock-->` : form
}

/** Titres de variante enregistrés sur le produit : [{ name, options: [] }]. */
const optionGroupsOf = (p) => {
  let list = []
  try { list = JSON.parse((p && p.option_groups) || "[]") } catch (_) { list = [] }
  return Array.isArray(list) ? list.filter((g) => g && g.name && Array.isArray(g.options) && g.options.length) : []
}

/**
 * Choix des options (Taille, Couleur…) : un menu par titre.
 * Le choix part dans le panier sous la forme « Taille : M · Couleur : Rouge ».
 */
const optionPicker = (store, p, groups) => `
<div class="opt-pick">
  ${groups.map((g, i) => `<label class="opt-row">
    <span>${esc(g.name)}</span>
    <select name="opt_${i}" data-group="${esc(g.name)}" aria-label="${esc(g.name)}">
      ${g.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}
    </select>
  </label>`).join("")}
  <input type="hidden" name="opts" value="">
</div>
<script>
(function(){
  var f = document.currentScript.parentNode;
  function sync(){
    var parts = [];
    Array.prototype.forEach.call(f.querySelectorAll('.opt-pick select[data-group]'), function(s){
      if (s.value) parts.push(s.getAttribute('data-group') + ' : ' + s.value);
    });
    var h = f.querySelector('input[name=opts]');
    if (h) h.value = parts.join(' · ');
  }
  f.addEventListener('change', function(e){ if (e.target.closest('.opt-pick')) sync(); });
  f.addEventListener('submit', sync);
  sync();
})();
</script>`

const addFormV = (store, p, cls, label, variants) => {
  const extraBlocks = favButton(store, p) + stockNote(store, p) + bundleBlock(store, p)
  if (readDesign(store).productForm === "inline" || (store && store.form_look) || CF.lookOf(store).model === "ouvert") {
    return stockNote(store, p) + inlineOrderForm(store, p, variants) + favButton(store, p) + bundleBlock(store, p)
  }
  const list = variants || []
  const groups = list.length ? [] : optionGroupsOf(p)
  if (!list.length && groups.length) {
    /* produit à options : le client choisit, puis ajoute au panier */
    return `
<form class="varform ndz-buy optform" method="post" action="/${esc(store.slug)}/cart">
  <input type="hidden" name="product_id" value="${p.id}">
  ${optionPicker(store, p, groups)}
  ${buyButtons(store, p, cls, label)}
</form>` + extraBlocks
  }
  if (!list.length) return addForm(store, p, cls, label) + extraBlocks
  const inStock = list.filter((v) => v.stock > 0)
  if (!inStock.length) return `<button class="${cls}" disabled>Épuisé</button>`
  const cartBtn = `<button class="${cls} ndz-cart-add">${label}</button>`
  const directBtn = `<button class="${cls} ndz-buy-now" formaction="/${esc(store.slug)}/direct">Acheter maintenant</button>`
  const style = ["boutons", "cartes", "radio", "liste"].includes(readDesign(store).variantStyle)
    ? readDesign(store).variantStyle : "boutons"
  const priceOf = (v) => (v.price_cents ? money(v.price_cents, cur(store)) : "")
  /* « liste » : un menu déroulant ; les autres styles : des pastilles cliquables
     (de vrais boutons radio, donc utilisables au clavier et sur mobile). */
  const picker = style === "liste"
    ? `<select name="variant_id" class="varselect" aria-label="Choix de la variante">
    ${inStock.map((v) => `<option value="${v.id}">${esc(v.label)}${v.price_cents ? " — " + priceOf(v) : ""}</option>`).join("")}
  </select>`
    : `<fieldset class="varpick vp-${style}">
    <legend>${esc(p.variantLabel || "Choix")}</legend>
    ${inStock.map((v, i) => `<label class="vp-opt">
      <input type="radio" name="variant_id" value="${v.id}" ${i === 0 ? "checked" : ""}>
      <span class="vp-box">
        ${swatchMark(v.label)}
        <span class="vp-label">${esc(v.label)}</span>
        ${v.price_cents ? `<span class="vp-price">${priceOf(v)}</span>` : ""}
        ${v.stock > 0 && v.stock <= 3 ? `<span class="vp-stock">plus que ${v.stock}</span>` : ""}
      </span>
    </label>`).join("")}
  </fieldset>`
  return `
<form class="varform ndz-buy" method="post" action="/${esc(store.slug)}/cart">
  <input type="hidden" name="product_id" value="${p.id}">
  ${picker}
  ${cartBtn}${directBtn}
  ${payDirectButtons(store, p)}
</form>` + extraBlocks
}

/* -------- avis clients -------- */
const stars = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n))

const reviewsHtml = (store, p, extra) => {
  const list = (extra && extra.reviews) || []
  const r = (extra && extra.rating) || { avg: 0, count: 0 }
  return `
<section class="revs" id="avis">
  <div class="revs-head">
    <h2>Avis clients</h2>
    ${r.count ? `<span class="revs-score">${stars(r.avg)} <b>${r.avg.toFixed(1)}</b> · ${r.count} avis</span>` : `<span>Pas encore d'avis</span>`}
  </div>
  ${extra && extra.reviewSent ? `<div class="revs-ok">Merci ! Votre avis sera publié après validation.</div>` : ""}
  ${list.length ? `<ul class="revs-list">${list.map((v) => `
    <li><div class="revs-top"><b>${esc(v.name)}</b><span>${stars(v.rating)}</span></div>
      ${v.body ? `<p>${esc(v.body)}</p>` : ""}</li>`).join("")}</ul>` : ""}
  <details class="revs-form">
    <summary>Laisser un avis</summary>
    <form method="post" action="/${esc(store.slug)}/p/${p.id}/review">
      <div class="revs-row">
        <label>Votre nom<input name="name" required maxlength="40"></label>
        <label>Note
          <select name="rating"><option value="5">5 — Excellent</option><option value="4">4 — Très bien</option>
          <option value="3">3 — Correct</option><option value="2">2 — Moyen</option><option value="1">1 — Décevant</option></select>
        </label>
      </div>
      <label>Votre avis<textarea name="body" rows="3" maxlength="500" placeholder="Qualité, taille, livraison…"></textarea></label>
      <button class="btn btn-primary">Envoyer</button>
    </form>
  </details>
</section>`
}

/* -------- filtres / recherche / catégories -------- */
/* Barre « Tout / rayons / Récents » retirée de tous les thèmes. */
const filterBar = () => ""

/* -------- choix de wilaya + frais dynamiques -------- */
const shipSelect = (extra) => {
  const rates = (extra && extra.shipping) || {}
  const list = (extra && extra.wilayas) || WILAYAS
  const cell = (w) => {
    const r = rates[w]
    const home = r && r.home != null ? r.home : 50000
    const desk = r && r.desk != null ? r.desk : Math.max(0, home - 10000)
    return `<option value="${esc(w)}" data-home="${home}" data-desk="${desk}" data-cents="${home}">${esc(w)}</option>`
  }
  return `<select name="wilaya" data-shipsel>${list.map(cell).join("")}</select>`
}

/**
 * Choix du mode de livraison : à domicile, ou au bureau (stop desk).
 * Les deux tarifs viennent des réglages du marchand ; le client voit la différence.
 */
/** Choix du bureau de retrait, quand le transporteur en a importé. */
const deskSelect = (store) => {
  let list = []
  try { list = CARRIERS.centersForWilaya(store.id, "") } catch (_) { list = [] }
  if (!list.length) return ""
  return `
<div class="ck-desk" data-desk-wrap hidden>
  <label class="ck-f ck-wide"><span>Bureau de retrait</span>
    <select name="desk">
      ${list.map((c) => `<option value="${esc(c.external_id)}|${esc(c.name)}|${esc(c.commune || "")}" data-w="${esc(c.wilaya || "")}">${esc(c.name)}${c.commune ? " — " + esc(c.commune) : ""}${c.wilaya ? " (" + esc(c.wilaya) + ")" : ""}</option>`).join("")}
    </select>
  </label>
  <p class="ndz-muted">Choisissez le bureau le plus proche.</p>
</div>
<script>
(function () {
  var wrap = document.currentScript.previousElementSibling;
  if (!wrap) return;
  var sel = wrap.querySelector("select[name=desk]");
  var wil = document.querySelector("select[name=wilaya]");
  var opts = sel ? Array.prototype.slice.call(sel.options) : [];
  function sync() {
    var w = wil ? wil.value : "";
    var first = null;
    opts.forEach(function (o) {
      var ok = !w || !o.getAttribute("data-w") || o.getAttribute("data-w") === w;
      o.hidden = !ok;
      o.disabled = !ok;
      if (ok && !first) first = o;
    });
    if (first) first.selected = true;
  }
  function toggle() {
    var r = document.querySelector("input[name=delivery]:checked");
    var desk = r && /bureau|desk/i.test(r.value + " " + r.parentNode.textContent);
    wrap.hidden = !desk;
  }
  if (wil) wil.addEventListener("change", sync);
  document.querySelectorAll("input[name=delivery]").forEach(function (r) { r.addEventListener("change", toggle) });
  sync(); toggle();
})();
</script>`
}

const deliveryBlock = (store, extra = {}) => {
  const types = (extra && extra.delivery) || []
  if (!types.length) return ""
  if (types.length === 1) {
    return `<div class="dlv-single"><input type="hidden" name="delivery" value="${types[0].id}">
      <b>${icon("truck", 15)} ${esc(types[0].name)}</b><span>${esc(types[0].hint)}</span></div>` + deskSelect(store)
  }
  return `<div class="dlv-list">${types
    .map(
      (t, i) => `<label class="dlv-opt">
      <input type="radio" name="delivery" value="${t.id}" ${i === 0 ? "checked" : ""}>
      <span class="dlv-body"><b>${esc(t.name)}</b><span>${esc(t.hint)}</span>
        <em data-dlv-price="${t.id}"></em></span>
    </label>`
    )
    .join("")}</div>` + deskSelect(store)
}


/**
 * Choix du moyen de paiement dans le tunnel de commande.
 * Les moyens viennent des réglages du marchand (src/payments.js) : on n'affiche
 * que ce qu'il a activé. Un seul moyen → champ caché ; plusieurs → boutons radio.
 */
const payBlock = (store, extra = {}) => {
  const methods = (extra && extra.payments) || []
  if (!methods.length) {
    return `<p class="pay-empty">Aucun moyen de paiement activé. Contactez la boutique.</p>`
  }
  if (methods.length === 1) {
    const m = methods[0]
    return `<div class="pay-single">
      <input type="hidden" name="payment" value="${m.id}" data-fee="${m.fee || 0}">
      <b>${icon("cash", 15)} ${esc(m.name)}</b>
      ${m.note ? `<p>${esc(m.note)}</p>` : ""}
      ${m.fee ? `<em>Frais : + ${price(store, m.fee)}</em>` : ""}
    </div>`
  }
  const preselect = (extra && extra.preselect) || ""
  return `<div class="pay-list">${methods
    .map(
      (m, i) => `<label class="pay-opt">
      <input type="radio" name="payment" value="${m.id}" data-fee="${m.fee || 0}" ${(preselect ? preselect === m.id : i === 0) ? "checked" : ""}>
      <span class="pay-body">
        <b>${esc(m.name)}</b>
        ${m.note ? `<span>${esc(m.note)}</span>` : ""}
        ${m.fee ? `<em>Frais : + ${price(store, m.fee)}</em>` : ""}
      </span>
    </label>`
    )
    .join("")}</div>`
}

const shipScript = (store, totals) => {
  const sub = totals.subtotal || 0
  const disc = totals.discount || 0
  const lang = I18N.langNow(store)
  const T = {
    eta: I18N.t(lang, "Livraison estimée"),
    geo: I18N.t(lang, "Ma position"),
    geoOk: I18N.t(lang, "Position enregistrée"),
    geoWait: I18N.t(lang, "Autorisez la position pour remplir la wilaya."),
    geoNo: I18N.t(lang, "Position indisponible. Choisissez la wilaya."),
    geoDenied: I18N.t(lang, "Position refusée. Choisissez la wilaya."),
    geoFar: I18N.t(lang, "Position trop loin. Choisissez la wilaya."),
    geoFilled: I18N.t(lang, "Wilaya et commune remplies."),
    map: I18N.t(lang, "Voir sur la carte"),
    days: I18N.t(lang, "jours"),
    from: I18N.t(lang, "à"),
  }
  return `<script>
document.addEventListener('DOMContentLoaded', function(){
  var sel = document.querySelector('[data-shipsel]');
  var SUB = ${sub}, DISC = ${disc}, CUR = ${JSON.stringify(store.currency || "DZD")};
  var SLUG = ${JSON.stringify("/" + store.slug)};
  var TXT = ${JSON.stringify(T)};
  function fmt(c){ return (c/100).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}) + " " + CUR }
  function type(){
    var r = document.querySelector('[name="delivery"]');
    if (!r) return 'home';
    if (r.type === 'radio') { var on = document.querySelector('[name="delivery"]:checked'); return on ? on.value : 'home' }
    return r.value || 'home';
  }
  function eta(){
    if (!sel) return;
    var o = sel.options[sel.selectedIndex];
    if (!o) return;
    var mn = parseInt(o.getAttribute('data-eta-min'), 10) || 0;
    var mx = parseInt(o.getAttribute('data-eta-max'), 10) || 0;
    var txt = '';
    if (mn && mx) txt = TXT.eta + ' : ' + (mn === mx ? mn + ' ' + TXT.days : mn + ' ' + TXT.from + ' ' + mx + ' ' + TXT.days);
    document.querySelectorAll('[data-eta]').forEach(function(el){ el.textContent = txt });
  }
  function upd(){
    var ship = 0;
    if (sel) {
      var o = sel.options[sel.selectedIndex];
      var home = parseInt(o.getAttribute('data-home') || o.getAttribute('data-cents'), 10) || 0;
      var desk = parseInt(o.getAttribute('data-desk'), 10) || home;
      ship = type() === 'desk' ? desk : home;
      document.querySelectorAll('[data-dlv-price="home"]').forEach(function(el){ el.textContent = fmt(home) });
      document.querySelectorAll('[data-dlv-price="desk"]').forEach(function(el){ el.textContent = fmt(desk) });
    }
    var total = Math.max(0, SUB - DISC) + ship;
    document.querySelectorAll('[data-ship]').forEach(function(el){ el.textContent = fmt(ship) });
    document.querySelectorAll('[data-total]').forEach(function(el){ el.textContent = fmt(total) });
    var btn = document.querySelector('[data-totbtn]');
    if (btn) btn.textContent = btn.getAttribute('data-totbtn').replace('{total}', fmt(total) );
    eta();
  }
  if (sel) sel.addEventListener('change', upd);
  document.querySelectorAll('[name="delivery"]').forEach(function(el){ el.addEventListener('change', upd) });
  upd();

  /* ---------- communes de la wilaya choisie (suggestions, saisie libre ok) ---------- */
  var cmn = document.querySelector('[data-commune]');
  var list = document.querySelector('[data-commune-list]');
  function fill(items){
    if (!list || !items) return;
    list.innerHTML = '';
    items.forEach(function(c){
      var o = document.createElement('option');
      o.value = typeof c === 'string' ? c : c.fr;
      list.appendChild(o);
    });
  }
  function loadCommunes(w){
    if (!w || !list || !window.fetch) return;
    fetch(SLUG + '/communes?w=' + encodeURIComponent(w), { headers: { 'Accept': 'application/json' } })
      .then(function(r){ return r.json() })
      .then(function(d){ if (d && d.communes) fill(d.communes) })
      .catch(function(){});
  }
  if (sel) sel.addEventListener('change', function(){ loadCommunes(sel.value) });
  if (cmn) cmn.addEventListener('focus', function(){
    if (sel && !list.children.length) loadCommunes(sel.value);
  });

  /* ---------- position GPS en un clic ---------- */
  var gbtn = document.querySelector('[data-geo]');
  var gnote = document.querySelector('[data-geo-note]');
  var gmap = document.querySelector('[data-geo-map]');
  var flat = document.querySelector('[name="geo_lat"]');
  var flng = document.querySelector('[name="geo_lng"]');
  var facc = document.querySelector('[name="geo_acc"]');
  function setGeo(lat, lng, acc, quiet){
    if (flat) flat.value = lat;
    if (flng) flng.value = lng;
    if (facc) facc.value = Math.round(acc || 0);
    if (gnote && !quiet) gnote.textContent = TXT.geoOk;
    if (gmap) {
      gmap.href = 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng;
      gmap.textContent = TXT.map;
      gmap.hidden = false;
    }
  }
  var asked = false, pending = false, filling = false;
  if (sel) sel.addEventListener('change', function(){ if (!filling) sel.dataset.touched = '1' });
  if (cmn) cmn.addEventListener('input', function(){ if (!filling) cmn.dataset.touched = '1' });
  function applyPlace(lat, lng, acc){
    setGeo(lat, lng, acc, true);
    fetch(SLUG + '/position?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng), { headers: { 'Accept': 'application/json' } })
      .then(function(r){ return r.json() })
      .then(function(d){
        if (!d || !d.wilaya) { if (gnote) gnote.textContent = TXT.geoFar; return }
        var filled = false;
        filling = true;
        if (sel && !sel.dataset.touched) {
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === d.wilaya) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); filled = true; break }
          }
          loadCommunes(d.wilaya);
        }
        if (cmn && !cmn.dataset.touched && d.commune) {
          cmn.value = d.commune;
          cmn.dispatchEvent(new Event('input', { bubbles: true }));
          filled = true;
        }
        filling = false;
        if (gnote) gnote.textContent = filled ? TXT.geoFilled : TXT.geoOk;
      })
      .catch(function(){ filling = false; if (gnote) gnote.textContent = TXT.geoOk });
  }
  function askGeo(force){
    if (pending) return;
    if (asked && !force) return;
    asked = true;
    if (!navigator.geolocation) { if (gnote) gnote.textContent = TXT.geoNo; return }
    pending = true;
    if (gnote) gnote.textContent = TXT.geoWait;
    navigator.geolocation.getCurrentPosition(
      function(pos){
        pending = false;
        applyPlace(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6), pos.coords.accuracy);
      },
      function(){ pending = false; if (gnote) gnote.textContent = TXT.geoDenied },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
    );
  }
  if (gbtn) gbtn.addEventListener('click', function(){ askGeo(true) });
  var form = sel && sel.form;
  if (form) form.addEventListener('focusin', function(e){
    if (e.target && e.target.closest && e.target.closest('[data-geo]')) return;
    askGeo(false);
  });
});
</script>`
}

/* -------- bandeau légal + cookies + pixels -------- */
const legalBar = (store) => `
<div class="legalbar"><div class="wrap legalbar-in">
  <span>${esc(store.legal_name || store.name)}${store.legal_address ? " · " + esc(store.legal_address) : ""}</span>
  <nav>
    <a href="/${esc(store.slug)}/legal#mentions">Mentions légales</a>
    ${store.site_kind === "vitrine" ? "" : `<a href="/${esc(store.slug)}/legal#cgv">CGV</a>
    <a href="/${esc(store.slug)}/legal#retours">Retours</a>
    <a href="/${esc(store.slug)}/account">Mon compte</a>`}
  </nav>
</div></div>`

const cookieBanner = (store) => `
<div class="cookies" id="ndzCookies" hidden>
  <p>Ce site utilise des cookies de mesure d'audience. <a href="/${esc(store.slug)}/legal#cookies">En savoir plus</a>.</p>
  <div><button type="button" data-ck="no">Refuser</button><button type="button" data-ck="yes">Accepter</button></div>
</div>
<script>
(function(){
  var key = 'ndz-ck-${esc(store.slug)}';
  var box = document.getElementById('ndzCookies');
  function loadPixels(){
    var tpl = document.getElementById('ndzPx');
    if (!tpl || tpl.dataset.loaded) return;
    tpl.dataset.loaded = '1';
    document.body.appendChild(tpl.content.cloneNode(true));
  }
  var choice = null;
  try { choice = localStorage.getItem(key) } catch(e) {}
  if (choice === 'yes') loadPixels();
  if (choice) return;
  box.hidden = false;
  box.addEventListener('click', function(e){
    var b = e.target.closest('[data-ck]'); if (!b) return;
    var v = b.getAttribute('data-ck');
    try { localStorage.setItem(key, v) } catch(e) {}
    if (v === 'yes') loadPixels();
    box.hidden = true;
  });
})();
</script>`

const pixels = (store) => {
  let out = ""
  if (store.pixel_meta) {
    out += `<script>(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;
n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${esc(String(store.pixel_meta).replace(/[^0-9]/g, ""))}');fbq('track','PageView');</script>`
  }
  if (store.pixel_tiktok) {
    out += `<script>(function(w,d,t){var s=d.createElement('script');s.async=true;
s.src='https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${esc(String(store.pixel_tiktok).replace(/[^A-Z0-9]/gi, ""))}&lib=ttq';
d.getElementsByTagName(t)[0].parentNode.insertBefore(s,d.getElementsByTagName(t)[0]);})(window,document,'script');
window.ttq=window.ttq||{track:function(){}};window.ttq.track('PageView');</script>`
  }
  return out
}

const waNumber = (store) => String(store.whatsapp || store.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "213")

const waButton = (store) => {
  const n = waNumber(store)
  if (!n) return ""
  const msg = encodeURIComponent(`Bonjour ${store.name}, j'ai une question sur un produit.`)
  return `<a class="wa-float" href="https://wa.me/${n}?text=${msg}" target="_blank" rel="noopener"
    aria-label="Nous écrire sur WhatsApp"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10.1 10.1 0 0 0 4.65 1.12h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 13.92c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.42-.14-.95-.31-1.64-.6-2.88-1.24-4.76-4.14-4.9-4.33-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.26.64-.38 1.02-.38.12 0 .23 0 .33.01.3.01.44.03.64.49.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.2 1.36.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.54.73 1.8.86.27.13.44.2.51.31.07.12.07.67-.17 1.35z"/></svg></a>`
}

/** Barre de réseaux sociaux (voir /dashboard/reseaux). */
const socialBar = (store, place) => SOCIAL.bar(store, readDesign(store), place)

const footerHtml = (store) => {
  const D = readDesign(store)
  const style = D.footerStyle || "theme"
  if (style === "theme") return ""
  const cols = Array.isArray(D.footerCols) ? D.footerCols : []
  const hrefOf = (url) => {
    const u = String(url || "").trim()
    if (!u) return `/${store.slug}`
    if (/^(https?:|tel:|mailto:|#|\/)/.test(u)) return u
    return `/${store.slug}/${u.replace(/^\//, "")}`
  }
  const colHtml = cols.map((col, i) => `<div class="ndz-fcol" data-footcol="${i}"><b data-foot="title">${esc(col.title || "")}</b>${(col.links || []).map((l, j) => `<a data-foot="link" data-i="${j}" href="${esc(hrefOf(l.url))}">${esc(l.label || "")}</a>`).join("")}</div>`).join("")
  const note = D.footerBrand ? `<p data-footbrand>${esc(D.footerBrand)}</p>` : `<p data-footbrand></p>`
  const powered = D.showNovadz ? `Propulsé par <a href="/">NovaDZ</a>` : ""
  const mention = D.footerNote ? esc(D.footerNote) : ""
  return `<footer class="ndz-foot ndz-foot-${esc(style)}">
    <div class="ndz-fwrap">
      <div class="ndz-fbrand"><strong>${esc(store.name)}</strong>${note}<span>${esc(store.phone || "")}${store.wilaya ? ` · ${esc(store.wilaya)}` : ""}</span></div>
      ${colHtml}
    </div>
    <div class="ndz-fbottom"><span>© ${new Date().getFullYear()} ${esc(store.name)}</span><span data-footnote>${mention}${mention && powered ? " · " : ""}${powered}</span></div>
  </footer>`
}

const askBox = (store) => `<form class="ndz-ask" method="post" action="/${esc(store.slug)}/question">
  <b>Une question pour la boutique</b>
  <p>Le marchand reçoit le message dans ses notifications. Personne ne répond à votre place.</p>
  <input name="name" maxlength="60" placeholder="Votre nom" autocomplete="name">
  <input name="phone" maxlength="20" placeholder="Téléphone" autocomplete="tel">
  <textarea name="text" required maxlength="400" placeholder="Votre question"></textarea>
  <button type="submit">Envoyer au marchand</button>
</form>`

const footerExtras = (store, opt = {}) => {
  const px = pixels(store)
  return (opt.foot === false ? "" : footerHtml(store)) +
    (opt.ask === false || store.site_kind === "vitrine" ? "" : askBox(store)) +
    (opt.social === false ? "" : socialBar(store, "pied")) +
    (opt.legal === false ? "" : legalBar(store)) +
    (px ? `<template id="ndzPx">${px}</template>` : "") +
    cookieBanner(store) + waButton(store)
}

/* chaque avantage est un vrai <li> : sans lui, l'icône passait à la ligne au-dessus du texte */
const TRUST = [
  ["truck", "Livraison 48 wilayas"],
  ["cash", "Paiement à la livraison"],
  ["refresh", "Échange sous 7 jours"],
]
const trust = () => TRUST.map(([ic, txt]) => `<li>${icon(ic, 16)}<span>${txt}</span></li>`).join("")
const trustInline = () => TRUST.map(([ic, txt]) => `<span class="tr-item">${icon(ic, 16)}<span>${txt}</span></span>`).join("")

/* ======================================================================
   1. MINIMAL — boutique épurée, header classique, grille de cartes
   ====================================================================== */
const minimal = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const opts = { preview }
    const D = readDesign(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-minimal ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="mn-head">
    <div class="wrap mn-bar">
      <a class="mn-brand" href="${slug(store)}">
        ${D.logo ? `<img class="mn-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : `<span class="mn-tile">${esc((store.name || "?")[0].toUpperCase())}</span>`}
        <span class="brand-name">${esc(store.name)}</span>
      </a>
      <nav class="mn-nav">
        ${navLinks(store)}
        <a class="mn-cartlink" href="${slug(store)}/cart">Panier${cartCount ? `<b class="mn-chip">${cartCount}</b>` : ""}</a>
      </nav>
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="mn-foot">
    <div class="wrap mn-frow">
      <div class="mn-fbrand">${esc(store.name)}</div>
      <div>${esc(store.phone || "")}${store.wilaya ? (store.phone ? " · " : "") + esc(store.wilaya) : ""}</div>
      <div class="mn-powered">${D.footerNote ? esc(D.footerNote) + (D.showNovadz ? " · " : "") : ""}${D.showNovadz ? 'Propulsé par <a href="/">NovaDZ</a>' : ""}</div>
    </div>
  </footer>
  ${footerExtras(store)}
</div>${opts.preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    return homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="wrap mn-section">
  <a class="mn-back" href="${slug(store)}">${icon("arrowLeft", 14)} Retour à la boutique</a>
  <div class="mn-detail">
    <div class="mn-detail-thumb">${galleryHtml(store, p, extra)}</div>
    <div class="mn-detail-body">
      <h1>${esc(p.title)}</h1>
      <div class="mn-price big">${priceWithCompare(store, p)}</div>
      <p class="mn-muted">${esc(p.description || "Aucune description.")}</p>
      <p class="mn-stock">${p.stock > 0 ? `${p.stock} en stock` : "Rupture de stock"}</p>
      ${addFormV(store, p, "btn btn-primary btn-lg", "Ajouter au panier", extra.variants)}
      <ul class="mn-trust">${trust()}</ul>
    </div>
  </div>
  ${reviewsHtml(store, p, extra)}
</section>`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap mn-section">
  <h1 class="mn-title">Votre panier</h1>
  ${promoBox(store, totals, promoMsg)}
  ${!items.length ? `<div class="mn-empty"><h3>Votre panier est vide</h3><p>Ajoutez des produits depuis la boutique.</p><a class="btn btn-primary ndz-empty-link" href="${emptyCartHref(store)}">Voir les produits</a></div>` : `
  <div class="mn-cart">
    <div class="mn-cart-items">
      ${items.map((it) => `
      <div class="mn-crow">
        <div class="mn-cthumb">${img(it.image, "cart-img", it.title)}</div>
        <div class="mn-cinfo">
          <b>${esc(it.title)}</b>
          <span class="mn-muted">${price(store, it.price_cents)}</span>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </div>
        <div class="mn-cline">${price(store, it.price_cents * it.qty)}</div>
      </div>`).join("")}
    </div>
    <aside class="mn-summary">
      <h3>Récapitulatif</h3>
      <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
      <a class="btn btn-primary btn-block" href="${slug(store)}/checkout">Commander</a>
      <a class="btn btn-ghost btn-block" href="${slug(store)}">Continuer mes achats</a>
    </aside>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap mn-section">
  <h1 class="mn-title">Finaliser la commande</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <div class="mn-cart">
    <form class="mn-form" method="post" action="${slug(store)}/checkout">
      <h3>Vos informations</h3>
      ${CF.fields(store, extra)}
      ${deliveryBlock(store, extra)}
      <div class="mn-pay">${payBlock(store, extra)}</div>
      <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
    </form>
    <aside class="mn-summary">
      <h3>Votre commande</h3>
      ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap mn-section">
  <div class="mn-done">
    <div class="mn-done-ico">${icon("check", 26)}</div>
    <h1>Commande confirmée</h1>
    <p class="mn-muted">Merci ${esc(order.customer_name)}. Commande <b>#${esc(order.ref)}</b> enregistrée.</p>
    <div class="mn-done-box">
      <div class="mn-srow"><span>Total à payer</span><span><b>${price(store, order.total_cents)}</b></span></div>
      <div class="mn-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
      <div class="mn-srow"><span>Contact</span><span>${esc(order.phone)}</span></div>
    </div>
    <a class="btn btn-primary" href="${slug(store)}">Retour à la boutique</a>
  </div>
</section>`
  },
}

/* ======================================================================
   2. ÉDITORIAL — logo centré, sommaire, une pièce en vedette, numérotation
   ====================================================================== */
const editorial = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const opts = { preview }
    const D = readDesign(store)
    return page(title ? `${title} — ${store.name}` : `${store.name}`, `
<div class="theme theme-editorial ${designClass(D)}">
${storeStyle(D, store.theme)}
  <div class="ed-topbar">
    <div class="wrap ed-topline">
      <span>${esc(store.wilaya || "Algérie")}</span>
      <span>Livraison dans les 48 wilayas · Paiement à la livraison</span>
      <a href="${slug(store)}/cart">Panier${cartCount ? ` (${cartCount})` : ""}</a>
    </div>
  </div>
  <header class="ed-head">
    <div class="wrap">
      <a class="ed-wordmark" href="${slug(store)}">${D.logo ? `<img class="ed-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : esc(store.name)}</a>
      <nav class="ed-nav">
        ${readNav(store).map((l) => `<a href="${navHref(store, l.url)}">${esc(l.label)}</a><span class="ed-sep"></span>`).join("")}
        <a href="${slug(store)}/cart">Panier</a>
      </nav>
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="ed-foot">
    <div class="wrap">
      <div class="ed-footmark">${esc(store.name)}</div>
      <div class="ed-footcols">
        <div><b>Boutique</b><a href="${slug(store)}">Toute la collection</a><a href="${slug(store)}/cart">Panier</a></div>
        <div><b>Livraison</b><span>48 wilayas</span><span>2 à 3 jours ouvrés</span></div>
        <div><b>Contact</b><span>${esc(store.phone || "—")}</span><span>${esc(store.wilaya || "Algérie")}</span></div>
      </div>
      <div class="ed-legal">${D.footerNote ? esc(D.footerNote) + " — " : ""}${D.showNovadz ? 'Propulsé par <a href="/">NovaDZ</a> — ' : ""}${new Date().getFullYear()}</div>
    </div>
  </footer>
  ${footerExtras(store)}
</div>${opts.preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    return homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<div class="wrap ed-crumb"><a href="${slug(store)}">Collection</a> <span>/</span> <span>${esc(p.title)}</span></div>
<section class="wrap ed-product">
  <div class="ed-product-visual">
    <div class="ed-product-fig">${galleryHtml(store, p, extra)}</div>
    <div class="ed-figcap">Fig. — ${esc(p.title)}</div>
  </div>
  <div class="ed-product-info">
    <div class="ed-kicker">${p.stock > 0 ? "Disponible" : "Épuisé"}</div>
    <h1>${esc(p.title)}</h1>
    <div class="ed-product-price">${priceWithCompare(store, p)}</div>
    <div class="ed-rule"></div>
    <p class="ed-desc">${esc(p.description || "Aucune description fournie.")}</p>
    <dl class="ed-specs">
      <div><dt>Référence</dt><dd>NDZ-${String(p.id).padStart(4, "0")}</dd></div>
      <div><dt>Disponibilité</dt><dd>${p.stock > 0 ? `${p.stock} en stock` : "Rupture"}</dd></div>
      <div><dt>Livraison</dt><dd>2 à 3 jours · 48 wilayas</dd></div>
      <div><dt>Paiement</dt><dd>Espèces à la livraison</dd></div>
    </dl>
    ${addFormV(store, p, "btn btn-primary btn-lg btn-block", "Ajouter à la sélection", extra.variants)}
    <p class="ed-note">Échange sous 7 jours · Retour offert en cas de défaut.</p>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `
<section class="wrap ed-related">
  <div class="ed-list-head"><span>Dans la même série</span><span>${related.length}</span></div>
  <div class="ed-related-grid">
    ${related.map((r) => `
    <a class="ed-related-card" href="${slug(store)}/p/${r.id}">
      <span class="ed-related-thumb">${img(r.image, "cart-img", r.title)}</span>
      <b>${esc(r.title)}</b>
      <span>${price(store, r.price_cents)}</span>
    </a>`).join("")}
  </div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap ed-cart">
  <h1>Panier</h1>
  ${promoBox(store, totals, promoMsg)}
  ${!items.length ? `<p class="ed-empty">Votre panier est vide. <a class="ed-link ndz-empty-link" href="${emptyCartHref(store)}">Voir la collection</a></p>` : `
  <table class="ed-table">
    <thead><tr><th>Pièce</th><th>Quantité</th><th class="r">Prix</th><th class="r"></th></tr></thead>
    <tbody>
    ${items.map((it) => `
      <tr>
        <td>
          <div class="ed-tcell"><span class="ed-tthumb">${img(it.image, "cart-img", it.title)}</span>
            <span><b>${esc(it.title)}</b><small>${price(store, it.price_cents)} l'unité</small></span></div>
        </td>
        <td>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="ed-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </td>
        <td class="r">${price(store, it.price_cents * it.qty)}</td>
        <td class="r"><a class="ed-remove" href="${slug(store)}/cart">—</a></td>
      </tr>`).join("")}
    </tbody>
  </table>
  <div class="ed-totals">
    <div class="ed-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
    <div class="ed-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("ed-srow", store, totals)}
    <div class="ed-srow total"><span>Total</span><span data-total>${price(store, totals.total)}</span></div>
    <a class="btn btn-primary btn-lg" href="${slug(store)}/checkout">Passer commande ${icon("arrowRight", 15)}</a>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap ed-co">
  <h1>Commande</h1>
  ${error ? `<div class="ed-alert">${esc(error)}</div>` : ""}
  <form method="post" action="${slug(store)}/checkout">
    <section class="ed-step">
      <div class="ed-step-num">1</div>
      <div class="ed-step-body">
        <h2>Vos informations</h2>
        ${CF.fields(store, extra)}
      </div>
    </section>
    <section class="ed-step">
      <div class="ed-step-num">2</div>
      <div class="ed-step-body">
        <h2>Mode de livraison</h2>
        ${deliveryBlock(store, extra)}
      </div>
    </section>
    <section class="ed-step">
      <div class="ed-step-num">3</div>
      <div class="ed-step-body">
        <h2>Paiement</h2>
        ${payBlock(store, extra)}
        <div class="ed-summary">
          ${items.map((it) => `<div class="ed-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
          <div class="ed-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("ed-srow", store, totals)}
          <div class="ed-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
          <div class="ed-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
        </div>
        <button class="btn btn-primary btn-lg">Confirmer la commande</button>
      </div>
    </section>
  </form>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap ed-done">
  <div class="ed-kicker">Commande enregistrée</div>
  <h1>Merci, ${esc(order.customer_name.split(" ")[0])}.</h1>
  <p class="ed-desc">Votre commande <b>#${esc(order.ref)}</b> est prise en compte. La maison vous appelle pour confirmer la livraison.</p>
  <div class="ed-receipt">
    <div class="ed-srow"><span>Total</span><span><b>${price(store, order.total_cents)}</b></span></div>
    <div class="ed-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
    <div class="ed-srow"><span>Contact</span><span>${esc(order.phone)}</span></div>
  </div>
  <a class="ed-link" href="${slug(store)}">Retour à la collection ${icon("arrowRight", 14)}</a>
</section>`
  },
}

/* ======================================================================
   3. CONTRASTE — header à onglets, hero scindé, produits en lignes
   ====================================================================== */
const contrast = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const opts = { preview }
    const D = readDesign(store)
    return page(title ? `${title} — ${store.name}` : `${store.name}`, `
<div class="theme theme-contrast ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="ct-head">
    <div class="wrap ct-bar">
      <a class="ct-brand" href="${slug(store)}">
        ${D.logo ? `<img class="ct-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : `<span class="ct-tile">${esc((store.name || "?")[0].toUpperCase())}</span>`}
        <span class="brand-name">${esc(store.name)}</span>
      </a>
      <nav class="ct-tabs">
        ${readNav(store).map((l) => `<a href="${navHref(store, l.url)}">${esc(l.label)}</a>`).join("")}
      </nav>
      <a class="ct-cart" href="${slug(store)}/cart">${icon("cart", 16)} <span>Panier</span>${cartCount ? `<b>${cartCount}</b>` : ""}</a>
    </div>
    ${socialBar(store, "entete")}
  </header>
  <div class="ct-subbar"><div class="wrap">${trustInline()}</div></div>
  ${content}
  <footer class="ct-foot">
    <div class="wrap ct-fgrid">
      <div>
        <div class="ct-fbrand">${esc(store.name)}</div>
        <p>${esc(store.tagline || "")}</p>
      </div>
      <div><b>Boutique</b><a href="${slug(store)}">Tous les produits</a><a href="${slug(store)}/cart">Panier</a></div>
      <div><b>Contact</b><span>${esc(store.phone || "—")}</span><span>${esc(store.wilaya || "Algérie")}</span></div>
    </div>
    <div class="wrap ct-legal">${D.footerNote ? esc(D.footerNote) + " · " : ""}${D.showNovadz ? 'Propulsé par <a href="/">NovaDZ</a>' : ""}</div>
  </footer>
  ${footerExtras(store)}
</div>${opts.preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    return homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="wrap ct-product">
  <div class="ct-gallery">${galleryHtml(store, p, extra)}</div>
  <div class="ct-buy">
    <a class="ct-back" href="${slug(store)}">${icon("arrowLeft", 14)} Catalogue</a>
    <h1>${esc(p.title)}</h1>
    <div class="ct-price-big">${priceWithCompare(store, p)}</div>
    <div class="ct-row-meta">
      <span class="ct-pill ${p.stock > 0 ? "ok" : "off"}">${p.stock > 0 ? `En stock · ${p.stock}` : "Rupture"}</span>
      <span class="ct-pill">Paiement à la livraison</span>
    </div>
    <p class="ct-desc">${esc(p.description || "Aucune description.")}</p>
    ${addFormV(store, p, "ct-btn wide", "Ajouter au panier", extra.variants)}
    <a class="ct-btn ghost wide" href="${slug(store)}/checkout">Commander directement</a>
    <ul class="ct-trust">${trust()}</ul>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `
<section class="wrap ct-related">
  <h2>À voir aussi</h2>
  <div class="ct-related-grid">
    ${related.map((r) => `
    <a class="ct-rel-card" href="${slug(store)}/p/${r.id}">
      <span class="ct-shot">${img(r.image, "cart-img", r.title)}</span>
      <b>${esc(r.title)}</b>
      <span>${price(store, r.price_cents)}</span>
    </a>`).join("")}
  </div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap ct-cart">
  <h1>Mon panier</h1>
  ${promoBox(store, totals, promoMsg)}
  ${!items.length ? `<div class="ct-empty">Panier vide. <a class="ct-link ndz-empty-link" href="${emptyCartHref(store)}">Retour au catalogue</a></div>` : `
  <div class="ct-cart-grid">
    <div class="ct-cart-items">
      ${items.map((it, i) => `
      <div class="ct-item">
        <div class="ct-item-num">${String(i + 1).padStart(2, "0")}</div>
        <div class="ct-item-thumb">${img(it.image, "cart-img", it.title)}</div>
        <div class="ct-item-main">
          <b>${esc(it.title)}</b>
          <span>${price(store, it.price_cents)} / unité</span>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="ct-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </div>
        <div class="ct-item-total">${price(store, it.price_cents * it.qty)}</div>
      </div>`).join("")}
    </div>
    <aside class="ct-summary">
      <h3>Récapitulatif</h3>
      <div class="ct-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
      <div class="ct-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("ct-srow", store, totals)}
      <div class="ct-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="ct-srow total"><span>À payer</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
      <a class="ct-btn wide" href="${slug(store)}/checkout">Passer commande</a>
      <a class="ct-btn ghost wide" href="${slug(store)}">Continuer</a>
    </aside>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap ct-co">
  <div class="ct-steps"><span class="on">1 Panier</span><span class="on">2 Livraison</span><span>3 Confirmation</span></div>
  ${error ? `<div class="ct-alert">${esc(error)}</div>` : ""}
  <div class="ct-cart-grid">
    <form class="ct-form" method="post" action="${slug(store)}/checkout">
      <fieldset><legend>Qui reçoit le colis ? Où livrer ?</legend>
        ${CF.fields(store, extra)}
      </fieldset>
      <fieldset><legend>Mode de livraison</legend>
        ${deliveryBlock(store, extra)}
      </fieldset>
      <button class="ct-btn wide big">Confirmer · ${price(store, totals.total)}</button>
      <div class="ct-pay">${payBlock(store, extra)}</div>
    </form>
    <aside class="ct-summary">
      <h3>Votre commande</h3>
      ${items.map((it) => `<div class="ct-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="ct-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("ct-srow", store, totals)}
      <div class="ct-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="ct-srow total"><span>À payer</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap ct-done">
  <div class="ct-done-ico">${icon("check", 30)}</div>
  <h1>Commande reçue</h1>
  <p class="ct-desc">Référence <b>#${esc(order.ref)}</b> — ${esc(order.customer_name)}, nous vous appelons au ${esc(order.phone)}.</p>
  <div class="ct-summary wide">
    <div class="ct-srow"><span>À payer à la livraison</span><span><b>${price(store, order.total_cents)}</b></span></div>
    <div class="ct-srow"><span>Adresse</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
  </div>
  <a class="ct-btn" href="${slug(store)}">Retour au catalogue</a>
</section>`
  },
}

/* ======================================================================
   4. CATALOGUE — header avec recherche, promo, grille dense, fiches compactes
   ====================================================================== */
const catalogue = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const opts = { preview }
    const D = readDesign(store)
    return page(title ? `${title} — ${store.name}` : `${store.name}`, `
<div class="theme theme-catalogue ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="ca-head">
    <div class="wrap ca-bar">
      <a class="ca-brand" href="${slug(store)}">${D.logo ? `<img class="ca-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : `<span class="ca-tile">${esc((store.name || "?")[0].toUpperCase())}</span>`}${esc(store.name)}</a>
      ${readNav(store).length > 1 ? `<nav class="ca-nav">${navLinks(store)}</nav>` : ""}
      <form class="ca-search" method="get" action="/${esc(store.slug)}" role="search">
        ${icon("search", 15)}
        <input name="q" type="search" id="ca-q" placeholder="Rechercher un produit…" aria-label="Rechercher un produit" autocomplete="off">
      </form>
      <a class="ca-cart" href="${slug(store)}/cart" aria-label="Panier${cartCount ? ` (${cartCount} article${cartCount > 1 ? "s" : ""})` : ""}">${icon("cart", 17)}${cartCount ? `<b>${cartCount}</b>` : ""}</a>
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="ca-foot">
    <div class="wrap">
      <span>${esc(store.name)} · ${esc(store.phone || "")}</span>
      <span>${D.footerNote ? esc(D.footerNote) + " · " : ""}${D.showNovadz ? 'Propulsé par <a href="/">NovaDZ</a>' : ""}</span>
    </div>
  </footer>
  ${footerExtras(store)}
  ${opts.preview ? PREVIEW_SCRIPT : ""}
</div>
<script>
(function(){
  var q = document.getElementById('ca-q');
  if (!q) return;
  q.addEventListener('input', function(){
    var v = q.value.trim().toLowerCase();
    document.querySelectorAll('[data-title]').forEach(function(el){
      el.style.display = el.getAttribute('data-title').indexOf(v) > -1 ? '' : 'none';
    });
  });
})();
</script>`, { seo })
  },

  home(store, products, meta) {
    return homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="wrap ca-product">
  <div class="ca-pthumb">${galleryHtml(store, p, extra)}</div>
  <div class="ca-pmain">
    <a class="ca-back" href="${slug(store)}">${icon("arrowLeft", 14)} Catalogue</a>
    <h1>${esc(p.title)}</h1>
    <div class="ca-pprice">${priceWithCompare(store, p)}</div>
    <div class="ca-pstock ${p.stock > 0 ? "ok" : "off"}">${p.stock > 0 ? `En stock · ${p.stock} disponible${p.stock > 1 ? "s" : ""}` : "Rupture de stock"}</div>
    <p class="ca-pdesc">${esc(p.description || "Aucune description.")}</p>
    ${addFormV(store, p, "btn btn-primary btn-lg btn-block", "Ajouter au panier", extra.variants)}
    <a class="btn btn-ghost btn-block" href="${slug(store)}/cart">Voir mon panier</a>
    <div class="ca-pay">${icon("cash", 15)} Payez en espèces à la réception.</div>
  </div>
  <table class="ca-specs">
    <tr><th>Référence</th><td>NDZ-${String(p.id).padStart(4, "0")}</td></tr>
    <tr><th>Boutique</th><td>${esc(store.name)}</td></tr>
    <tr><th>Disponibilité</th><td>${p.stock} unité${p.stock > 1 ? "s" : ""}</td></tr>
    <tr><th>Livraison</th><td>2 à 3 jours ouvrés</td></tr>
    <tr><th>Wilaya</th><td>${esc(store.wilaya || "Toutes")}</td></tr>
    <tr><th>Retour</th><td>${store.return_days || 7} jours</td></tr>
  </table>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `
<section class="wrap ca-related">
  <div class="ca-toolbar"><span class="ca-tab on">Du même vendeur</span></div>
  <div class="ca-grid">
    ${related.map((r) => `
    <article class="ca-card" data-title="${esc(r.title.toLowerCase())}">
      <a class="ca-thumb" href="${slug(store)}/p/${r.id}">${img(r.image, "ca-thumb-img", r.title)}</a>
      <div class="ca-info">
        <a class="ca-name" href="${slug(store)}/p/${r.id}">${esc(r.title)}</a>
        <div class="ca-row"><b class="ca-price">${price(store, r.price_cents)}</b></div>
      </div>
    </article>`).join("")}
  </div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap ca-cartpage">
  <h1>Panier <span>${items.reduce((n, i) => n + i.qty, 0)} article(s)</span></h1>
  ${promoBox(store, totals, promoMsg)}
  ${!items.length ? `<div class="ca-empty">Panier vide. <a class="ndz-empty-link" href="${emptyCartHref(store)}">Continuer les achats</a></div>` : `
  ${items.map((it) => `
  <div class="ca-crow">
    <div class="ca-cthumb">${img(it.image, "cart-img", it.title)}</div>
    <div class="ca-cmain">
      <b>${esc(it.title)}</b>
      <span>${price(store, it.price_cents)}</span>
    </div>
    <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="ca-qty">
      <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
    </form>
    <div class="ca-ctotal">${price(store, it.price_cents * it.qty)}</div>
  </div>`).join("")}
  <div class="ca-totals">
    <div><span>Sous-total</span><b>${price(store, totals.subtotal)}</b></div>
    <div><span>Livraison</span><b data-ship>${price(store, totals.shipping)}</b></div>
    ${totals.discount > 0 ? `<div class="promo-line"><span>Remise ${totals.promo ? esc(totals.promo.code) : ""}</span><b>−${price(store, totals.discount)}</b></div>` : ""}
    <div class="total"><span>Total</span><b data-total>${price(store, totals.total)}</b></div>
    <a class="btn btn-primary btn-block btn-lg" href="${slug(store)}/checkout">Commander · ${price(store, totals.total)}</a>
    <a class="ca-link" href="${slug(store)}">Continuer les achats</a>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap ca-co">
  <h1>Commande</h1>
  ${error ? `<div class="ca-alert">${esc(error)}</div>` : ""}
  <form method="post" action="${slug(store)}/checkout">
    ${CF.fields(store, extra)}
    <div class="ca-dlv">${deliveryBlock(store, extra)}</div>
    <div class="ca-sumline">
      ${items.map((it) => `<span>${esc(it.title)} × ${it.qty}</span>`).join("")}
    </div>
    <div class="ca-totals">
      <div><span>Sous-total</span><b>${price(store, totals.subtotal)}</b></div>
      <div><span>Livraison</span><b data-ship>${price(store, totals.shipping)}</b></div>
    ${totals.discount > 0 ? `<div class="promo-line"><span>Remise ${totals.promo ? esc(totals.promo.code) : ""}</span><b>−${price(store, totals.discount)}</b></div>` : ""}
      <div data-payrow style="display:none"><span>Frais de paiement</span><b data-payfee></b></div>
      <div class="total"><span>Total à payer</span><b data-total data-base="${totals.total}">${price(store, totals.total)}</b></div>
      <button class="btn btn-primary btn-block btn-lg">Confirmer la commande</button>
      <div class="ca-pay-block">${payBlock(store, extra)}</div>
    </div>
  </form>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap ca-done">
  <div class="ca-done-head">${icon("check", 18)} Commande ${esc(order.ref)} enregistrée</div>
  <p>Merci ${esc(order.customer_name)}. Le vendeur vous appelle au ${esc(order.phone)} pour confirmer.</p>
  <div class="ca-totals">
    <div><span>Montant</span><b>${price(store, order.total_cents)}</b></div>
    <div><span>Adresse</span><b>${esc(order.wilaya)} — ${esc(order.address)}</b></div>
    <a class="btn btn-primary btn-block" href="${slug(store)}">Retour au catalogue</a>
  </div>
</section>`
  },
}

/* ======================================================================
   Dispatch
   ====================================================================== */

/* ======================================================================
   5. SOLO — une pièce en majesté : page d'accueil « produit unique »,
      gros bouton d'achat collant, rien qui détourne l'attention.
   ====================================================================== */
const mono = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const opts = { preview }
    const D = readDesign(store)
    const mode = cartModeOf(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-mono ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="mo-head">
    <div class="wrap mo-bar">
      <a class="mo-brand" href="${slug(store)}">
        ${D.logo ? `<img class="mo-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : `<span class="mo-tile">${esc((store.name || "?")[0].toUpperCase())}</span>`}
        <span class="brand-name">${esc(store.name)}</span>
      </a>
      <nav class="mo-nav">${navLinks(store)}</nav>
      ${mode === "direct" ? `<a class="mo-cta" href="${slug(store)}/checkout">Commander</a>`
        : `<a class="mo-cartlink" href="${slug(store)}/cart">Panier${cartCount ? `<b>${cartCount}</b>` : ""}</a>`}
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="mo-foot"><div class="wrap mo-frow">
    <b>${esc(store.name)}</b>
    <span>${esc(store.phone || "")}${store.wilaya ? (store.phone ? " · " : "") + esc(store.wilaya) : ""}</span>
    <span class="mo-powered">${D.footerNote ? esc(D.footerNote) + (D.showNovadz ? " · " : "") : ""}${D.showNovadz ? 'Propulsé par <a href="/">NovaDZ</a>' : ""}</span>
  </div></footer>
  ${footerExtras(store)}
</div>${opts.preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  /** Accueil : la première pièce en très grand, puis les sections du marchand. */
  home(store, products, meta) {
    const p = (products || [])[0]
    const hero = p ? `
<section class="mo-hero"><div class="wrap mo-hero-in">
  <div class="mo-hero-media">${galleryHtml(store, p, { gallery: [] })}</div>
  <div class="mo-hero-body">
    <span class="mo-kicker">${esc(store.tagline || "Sélection de la maison")}</span>
    <h1>${esc(p.title)}</h1>
    <div class="mo-price">${priceWithCompare(store, p)}</div>
    <p class="mo-desc">${esc((p.description || "").slice(0, 180))}</p>
    ${addForm(store, p, "btn btn-primary btn-lg mo-buy", "Ajouter au panier")}
    <ul class="mo-trust">${trust()}</ul>
  </div>
</div></section>` : ""
    return hero + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="wrap mo-product">
  <a class="mn-back" href="${slug(store)}">${icon("arrowLeft", 14)} Retour à la boutique</a>
  <div class="mo-detail">
    <div class="mo-gallery">${galleryHtml(store, p, extra)}</div>
    <div class="mo-buybox">
      <h1>${esc(p.title)}</h1>
      <div class="mo-price big">${priceWithCompare(store, p)}</div>
      <p class="mn-stock">${p.stock > 0 ? `${p.stock} en stock` : "Rupture de stock"}</p>
      <p class="p-desc">${esc(p.description || "")}</p>
      ${addFormV(store, p, "btn btn-primary btn-block btn-lg mo-buy", "Ajouter au panier", extra.variants)}
      <ul class="mo-trust">${trust()}</ul>
    </div>
  </div>
  <div class="mo-long p-desc">${esc(p.description || "")}</div>
  ${reviewsHtml(store, p, extra)}
  ${related.length ? `<section class="mo-related">
    <h2>Vous aimerez aussi</h2>
    <div class="mo-relgrid">${related.map((r) => `
      <a class="mo-relcard" href="${slug(store)}/p/${r.id}">
        ${img(r.image, "mo-relimg", r.title)}
        <b>${esc(r.title)}</b><span>${price(store, r.price_cents)}</span>
      </a>`).join("")}</div>
  </section>` : ""}
</section>`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap mo-cart">
  <h1>Votre panier</h1>
  ${!items.length ? `<p class="mn-muted">Votre panier est vide.</p><a class="btn btn-primary ndz-empty-link" href="${emptyCartHref(store)}">Découvrir la boutique</a>` : `
  <div class="mo-cart-grid">
    <div class="mo-lines">
      ${items.map((it) => `<div class="mo-line">
        ${img(it.image, "mo-line-img", it.title)}
        <div class="mo-line-body"><b>${esc(it.title)}</b>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </div>
        <div class="mo-line-price">${price(store, it.price_cents * it.qty)}</div>
      </div>`).join("")}
      ${promoBox(store, totals, promoMsg)}
    </div>
    <aside class="mn-summary">
      <h3>Récapitulatif</h3>
      <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
      <a class="btn btn-primary btn-block" href="${slug(store)}/checkout">Commander</a>
    </aside>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap mo-checkout">
  <h1>Commander</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <div class="mo-co-grid">
    <form class="mn-form" method="post" action="${slug(store)}/checkout">
      ${CF.fields(store, extra)}
      ${deliveryBlock(store, extra)}
      <div class="mn-pay">${payBlock(store, extra)}</div>
      <button class="btn btn-primary btn-block btn-lg mo-buy">Confirmer · ${price(store, totals.total)}</button>
    </form>
    <aside class="mn-summary">
      <h3>Votre commande</h3>
      ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap mo-done">
  <div class="mn-done-ico">${icon("check", 26)}</div>
  <h1>Commande confirmée</h1>
  <p class="mn-muted">Merci ${esc(order.customer_name)}. Commande <b>#${esc(order.ref)}</b> enregistrée.</p>
  <div class="mn-done-box">
    <div class="mn-srow"><span>Total à payer</span><span><b>${price(store, order.total_cents)}</b></span></div>
    <div class="mn-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
  </div>
  <a class="btn btn-primary" href="${slug(store)}">Retour à la boutique</a>
</section>`
  },
}

/* ======================================================================
   6. GALERIE — plein écran photographique, texte discret, typographie fine
   ====================================================================== */
const galerie = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const opts = { preview }
    const D = readDesign(store)
    const mode = cartModeOf(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-galerie ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="ga-head">
    <div class="wrap ga-bar">
      <a class="ga-brand" href="${slug(store)}" aria-label="${esc(store.name)}">
        ${D.logo ? `<img class="ga-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : ""}<span class="brand-name">${esc(store.name)}</span>
      </a>
      <nav class="ga-nav">${navLinks(store)}</nav>
      ${mode === "direct" ? `<a class="ga-cta" href="${slug(store)}/checkout">Commander</a>`
        : `<a class="ga-cartlink" href="${slug(store)}/cart">Panier${cartCount ? ` (${cartCount})` : ""}</a>`}
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="ga-foot">
    <div class="wrap ga-frow">
      <div>${esc(store.name)}${store.wilaya ? " · " + esc(store.wilaya) : ""}</div>
      <div>${esc(store.phone || "")}</div>
      <div class="ga-powered">${D.footerNote ? esc(D.footerNote) + (D.showNovadz ? " · " : "") : ""}${D.showNovadz ? 'Propulsé par <a href="/">NovaDZ</a>' : ""}</div>
    </div>
  </footer>
  ${footerExtras(store)}
</div>${opts.preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    const p = (products || [])[0]
    const hero = p ? `
<section class="ga-hero">
  <a class="ga-hero-media" href="${slug(store)}/p/${p.id}">${img(p.image, "ga-hero-img", p.title)}</a>
  <div class="wrap ga-hero-body">
    <h1>${esc(store.name)}</h1>
    <p>${esc(store.tagline || "Une sélection resserrée, photographiée pièce par pièce.")}</p>
    <a class="ga-link" href="${slug(store)}/p/${p.id}">Voir la pièce ${icon("arrowRight", 13)}</a>
  </div>
</section>` : ""
    return hero + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="ga-product">
  <div class="ga-media">${galleryHtml(store, p, extra)}</div>
  <div class="ga-body">
    <a class="ga-back" href="${slug(store)}">${icon("arrowLeft", 13)} Retour</a>
    <h1>${esc(p.title)}</h1>
    <div class="ga-price">${priceWithCompare(store, p)}</div>
    <p class="p-desc">${esc(p.description || "")}</p>
    <p class="ga-stock">${p.stock > 0 ? `${p.stock} en stock` : "Rupture de stock"}</p>
    ${addFormV(store, p, "btn btn-primary btn-block ga-buy", "Ajouter au panier", extra.variants)}
    <ul class="ga-trust">${trust()}</ul>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `<section class="wrap ga-related">
  <h2>À découvrir</h2>
  <div class="ga-relgrid">${related.map((r) => `
    <a class="ga-relcard" href="${slug(store)}/p/${r.id}">${img(r.image, "ga-relimg", r.title)}
      <b>${esc(r.title)}</b><span>${price(store, r.price_cents)}</span></a>`).join("")}</div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap ga-cart">
  <h1>Panier</h1>
  ${!items.length ? `<p class="mn-muted">Votre panier est vide.</p><a class="ga-link ndz-empty-link" href="${emptyCartHref(store)}">Voir la boutique</a>` : `
  <div class="ga-cart-grid">
    <div>
      ${items.map((it) => `<div class="ga-line">
        ${img(it.image, "ga-line-img", it.title)}
        <div><b>${esc(it.title)}</b>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </div>
        <span>${price(store, it.price_cents * it.qty)}</span>
      </div>`).join("")}
      ${promoBox(store, totals, promoMsg)}
    </div>
    <aside class="ga-summary">
      <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
      <a class="btn btn-primary btn-block" href="${slug(store)}/checkout">Commander</a>
    </aside>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap ga-checkout">
  <h1>Commande</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <div class="ga-co-grid">
    <form class="mn-form" method="post" action="${slug(store)}/checkout">
      ${CF.fields(store, extra)}
      ${deliveryBlock(store, extra)}
      <div class="mn-pay">${payBlock(store, extra)}</div>
      <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
    </form>
    <aside class="ga-summary">
      ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap ga-done">
  <h1>Merci.</h1>
  <p class="mn-muted">Commande <b>#${esc(order.ref)}</b> enregistrée pour ${esc(order.customer_name)}.</p>
  <div class="mn-done-box">
    <div class="mn-srow"><span>Total à payer</span><span><b>${price(store, order.total_cents)}</b></span></div>
    <div class="mn-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
  </div>
  <a class="ga-link" href="${slug(store)}">Retour à la boutique</a>
</section>`
  },
}

/* ======================================================================
   7. BENTO — grille modulaire de tuiles, header pilule, blocs asymétriques
   ====================================================================== */
const bento = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const D = readDesign(store)
    const mode = cartModeOf(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-bento ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="bt-head">
    <div class="wrap bt-bar">
      <a class="bt-brand" href="${slug(store)}">
        ${D.logo ? `<img class="bt-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : `<span class="bt-mark">${esc(store.name.slice(0, 1))}</span><span class="bt-word brand-name">${esc(store.name)}</span>`}
      </a>
      <nav class="bt-nav">${navLinks(store)}</nav>
      <div class="bt-actions">
        <a class="bt-icon" href="${slug(store)}/search" aria-label="Rechercher">${icon("search", 16)}</a>
        ${mode === "direct"
          ? `<a class="bt-pill bt-pill-solid" href="${slug(store)}/checkout">Commander</a>`
          : `<a class="bt-pill" href="${slug(store)}/cart">Panier${cartCount ? ` <b>${cartCount}</b>` : ""}</a>`}
      </div>
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="bt-foot">
    <div class="wrap bt-fgrid">
      <div class="bt-fcard">
        <b>${esc(store.name)}</b>
        <p>${esc(store.tagline || "Sélection courte, expédiée depuis l'Algérie.")}</p>
      </div>
      <div class="bt-fcard">
        <b>Contact</b>
        <p>${esc(store.phone || "")}${store.email ? `<br>${esc(store.email)}` : ""}</p>
      </div>
      <div class="bt-fcard">
        <b>Livraison</b>
        <p>58 wilayas · domicile et bureau<br>Paiement à la livraison</p>
      </div>
      <div class="bt-fcard bt-fnote">
        ${D.footerNote ? `<p>${esc(D.footerNote)}</p>` : ""}
        ${D.showNovadz ? '<p>Propulsé par <a href="/">NovaDZ</a></p>' : ""}
      </div>
    </div>
  </footer>
  ${footerExtras(store)}
</div>${preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    const list = (products || []).slice(0, 5)
    const hero = list[0]
    const tiles = list.slice(1, 5).map((p) => `
    <a class="bt-tile bt-tile-p" href="${slug(store)}/p/${p.id}">
      ${img(p.image, "bt-tile-img", p.title)}
      <span class="bt-tile-foot"><b>${esc(p.title)}</b><em>${priceWithCompare(store, p)}</em></span>
    </a>`).join("")
    const top = hero ? `
<section class="wrap bt-grid">
  <a class="bt-tile bt-hero" href="${slug(store)}/p/${hero.id}">
    ${img(hero.image, "bt-hero-img", hero.title)}
    <span class="bt-hero-body">
      <em class="bt-kicker">${esc(store.tagline || "Nouveau")}</em>
      <b>${esc(hero.title)}</b>
      <span class="bt-hero-price">${price(store, hero.price_cents)}</span>
    </span>
  </a>
  <div class="bt-tile bt-info">
    <b>Livraison 48 h</b>
    <p>Domicile ou bureau, dans les 58 wilayas.</p>
  </div>
  ${tiles}
  <a class="bt-tile bt-cta" href="${slug(store)}/search">
    <b>Tout voir</b>
    <span>${(products || []).length} articles ${icon("arrowRight", 14)}</span>
  </a>
</section>` : ""
    return top + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="wrap bt-product">
  <div class="bt-gallery">${galleryHtml(store, p, extra)}</div>
  <div class="bt-buybox">
    <a class="bt-back" href="${slug(store)}">${icon("arrowLeft", 13)} Boutique</a>
    <h1>${esc(p.title)}</h1>
    <div class="bt-price">${priceWithCompare(store, p)}</div>
    <p class="p-desc">${esc(p.description || "")}</p>
    <div class="bt-stock ${p.stock > 0 ? "ok" : "ko"}">${p.stock > 0 ? `${p.stock} en stock` : "Rupture de stock"}</div>
    ${addFormV(store, p, "btn btn-primary btn-block bt-buy", "Ajouter au panier", extra.variants)}
    <ul class="bt-trust">${trust()}</ul>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `<section class="wrap bt-related">
  <h2>Dans la même veine</h2>
  <div class="bt-relgrid">${related.slice(0, 4).map((r) => `
    <a class="bt-tile bt-tile-p" href="${slug(store)}/p/${r.id}">
      ${img(r.image, "bt-tile-img", r.title)}
      <span class="bt-tile-foot"><b>${esc(r.title)}</b><em>${price(store, r.price_cents)}</em></span>
    </a>`).join("")}</div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap bt-cart">
  <h1>Panier</h1>
  ${!items.length
    ? `<div class="bt-empty"><p>Votre panier est vide.</p><a class="bt-pill bt-pill-solid ndz-empty-link" href="${emptyCartHref(store)}">Voir la boutique</a></div>`
    : `<div class="bt-cart-grid">
    <div class="bt-lines">
      ${items.map((it) => `<div class="bt-line">
        ${img(it.image, "bt-line-img", it.title)}
        <div class="bt-line-body"><b>${esc(it.title)}</b>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </div>
        <span class="bt-line-price">${price(store, it.price_cents * it.qty)}</span>
      </div>`).join("")}
      ${promoBox(store, totals, promoMsg)}
    </div>
    <aside class="bt-summary">
      <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
      <a class="btn btn-primary btn-block" href="${slug(store)}/checkout">Commander</a>
    </aside>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap bt-checkout">
  <h1>Commande</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <div class="bt-co-grid">
    <form class="mn-form bt-form" method="post" action="${slug(store)}/checkout">
      ${CF.fields(store, extra)}
      ${deliveryBlock(store, extra)}
      <div class="mn-pay">${payBlock(store, extra)}</div>
      <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
    </form>
    <aside class="bt-summary bt-sticky">
      ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap bt-done">
  <div class="bt-done-card">
    <span class="bt-check">${icon("check", 22)}</span>
    <h1>Commande enregistrée</h1>
    <p class="mn-muted">Merci ${esc(order.customer_name)}. Référence <b>#${esc(order.ref)}</b>.</p>
    <div class="mn-srow"><span>Total à payer</span><span><b>${price(store, order.total_cents)}</b></span></div>
    <div class="mn-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
    <a class="bt-pill bt-pill-solid" href="${slug(store)}">Retour à la boutique</a>
  </div>
</section>`
  },
}

/* ======================================================================
   8. ZEN — colonne unique très aérée, typographie large, silence visuel
   ====================================================================== */
const zen = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const D = readDesign(store)
    const mode = cartModeOf(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-zen ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="zn-head">
    <div class="zn-wrap zn-bar">
      <a class="zn-brand" href="${slug(store)}">
        ${D.logo ? `<img class="zn-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : ""}<span class="brand-name">${esc(store.name)}</span>
      </a>
      <nav class="zn-nav">${navLinks(store)}</nav>
      ${mode === "direct"
        ? `<a class="zn-link" href="${slug(store)}/checkout">Commander</a>`
        : `<a class="zn-link" href="${slug(store)}/cart">Panier${cartCount ? ` (${cartCount})` : ""}</a>`}
    </div>
    ${socialBar(store, "entete")}
  </header>
  <main class="zn-main">${content}</main>
  <footer class="zn-foot">
    <div class="zn-wrap">
      <p class="zn-sign">${esc(store.name)}${store.wilaya ? ` — ${esc(store.wilaya)}` : ""}</p>
      ${D.footerNote ? `<p class="zn-note">${esc(D.footerNote)}</p>` : ""}
      <p class="zn-note">${esc(store.phone || "")}</p>
      ${D.showNovadz ? '<p class="zn-note">Propulsé par <a href="/">NovaDZ</a></p>' : ""}
    </div>
  </footer>
  ${footerExtras(store)}
</div>${preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    const list = products || []
    const Dz = readDesign(store)
    const heroMark = Dz.logo && Dz.heroLogo !== false && Dz.showLogo !== false
      ? `<img class="zn-hero-logo" src="${esc(Dz.logo)}" alt="">`
      : ""
    const intro = `
<section class="zn-wrap zn-intro">
  ${heroMark}
  <h1>${esc(store.name)}</h1>
  <p>${esc(store.tagline == null ? "Peu de pièces, choisies une par une." : store.tagline)}</p>
</section>`
    const listHtml = list.length ? `<section class="zn-wrap zn-list">
  ${list.slice(0, 6).map((p) => `
  <a class="zn-row" href="${slug(store)}/p/${p.id}">
    ${img(p.image, "zn-row-img", p.title)}
    <span class="zn-row-body">
      <b>${esc(p.title)}</b>${Number(p.stock) === 0 ? `<i class="zn-sold">Épuisé</i>` : ""}
      <span class="zn-row-price">${priceWithCompare(store, p)}</span>
    </span>
  </a>`).join("")}
</section>` : ""
    return intro + listHtml + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="zn-wrap zn-product">
  <div class="zn-gallery">${galleryHtml(store, p, extra)}</div>
  <div class="zn-body">
    <h1>${esc(p.title)}</h1>
    <div class="zn-price">${priceWithCompare(store, p)}</div>
    <p class="p-desc">${esc(p.description || "")}</p>
    <p class="zn-stock">${p.stock > 0 ? "Disponible" : "Épuisé"}</p>
    ${addFormV(store, p, "btn btn-primary btn-block zn-buy", "Ajouter au panier", extra.variants)}
    <ul class="zn-trust">${trust()}</ul>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `<section class="zn-wrap zn-rel">
  <h2>Ailleurs</h2>
  ${related.slice(0, 3).map((r) => `<a class="zn-row" href="${slug(store)}/p/${r.id}">
    ${img(r.image, "zn-row-img", r.title)}
    <span class="zn-row-body"><b>${esc(r.title)}</b>${Number(r.stock) === 0 ? `<i class="zn-sold">Épuisé</i>` : ""}<span class="zn-row-price">${price(store, r.price_cents)}</span></span>
  </a>`).join("")}
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="zn-wrap zn-cart">
  <h1>Panier</h1>
  ${!items.length ? `<p class="mn-muted">Votre panier est vide.</p><a class="zn-link ndz-empty-link" href="${emptyCartHref(store)}">Retour</a>` : `
  ${items.map((it) => `<div class="zn-line">
    ${img(it.image, "zn-line-img", it.title)}
    <div class="zn-line-body"><b>${esc(it.title)}</b>
      <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
        <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
      </form>
    </div>
    <span>${price(store, it.price_cents * it.qty)}</span>
  </div>`).join("")}
  ${promoBox(store, totals, promoMsg)}
  <div class="zn-totals">
    <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
    <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
    ${discountRow("mn-srow", store, totals)}
    <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
    <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
  </div>
  <a class="btn btn-primary btn-block btn-lg" href="${slug(store)}/checkout">Commander</a>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="zn-wrap zn-checkout">
  <h1>Commande</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <form class="mn-form" method="post" action="${slug(store)}/checkout">
    ${CF.fields(store, extra)}
    ${deliveryBlock(store, extra)}
    <div class="mn-pay">${payBlock(store, extra)}</div>
    <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
  </form>
  <div class="zn-totals">
    ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
    <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
    <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="zn-wrap zn-done">
  <h1>Merci.</h1>
  <p class="mn-muted">Commande <b>#${esc(order.ref)}</b> enregistrée.</p>
  <div class="mn-srow"><span>Total à payer</span><span><b>${price(store, order.total_cents)}</b></span></div>
  <div class="mn-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
  <a class="zn-link" href="${slug(store)}">Retour à la boutique</a>
</section>`
  },
}

/* ======================================================================
   9. COD — la page de vente à la livraison : un produit, des preuves,
      un formulaire court, un bouton d'achat collé en bas de l'écran.
   ====================================================================== */
const cod = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const D = readDesign(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-cod ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="cd-head">
    <div class="wrap cd-bar">
      <a class="cd-brand" href="${slug(store)}">
        ${D.logo ? `<img class="cd-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : ""}<span class="brand-name">${esc(store.name)}</span>
      </a>
      <nav class="cd-nav">${navLinks(store)}</nav>
      <a class="cd-phone" href="tel:${esc(String(store.phone || "").replace(/[^0-9+]/g, ""))}">${icon("phone", 15)} ${esc(store.phone || "")}</a>
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="cd-foot">
    <div class="wrap">
      <p class="cd-fbrand">${esc(store.name)}${store.wilaya ? ` · ${esc(store.wilaya)}` : ""}</p>
      ${D.footerNote ? `<p class="cd-fnote">${esc(D.footerNote)}</p>` : ""}
      ${D.showNovadz ? '<p class="cd-fnote">Propulsé par <a href="/">NovaDZ</a></p>' : ""}
    </div>
  </footer>
  ${footerExtras(store)}
</div>${preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    const p = (products || [])[0]
    const hero = p ? `
<section class="wrap cd-hero">
  <div class="cd-hero-media">${img(p.image, "cd-hero-img", p.title)}</div>
  <div class="cd-hero-body">
    <p class="cd-kicker">Vu à la télé · payé à la livraison</p>
    <h1>${esc(p.title)}</h1>
    <p class="cd-sub">${esc(p.description || store.tagline || "").slice(0, 160)}</p>
    <div class="cd-price">${priceWithCompare(store, p)}</div>
    <ul class="cd-args">
      <li>${icon("check", 14)} Paiement à la livraison</li>
      <li>${icon("truck", 14)} Livré en 48 à 72 h</li>
      <li>${icon("refresh", 14)} Échange sous 7 jours</li>
    </ul>
    <a class="btn btn-primary btn-block btn-lg" href="${slug(store)}/p/${p.id}">Commander maintenant</a>
  </div>
</section>` : ""
    return hero + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    const mode = cartModeOf(store)
    return `
<section class="wrap cd-product">
  <div class="cd-media">${galleryHtml(store, p, extra)}</div>
  <div class="cd-body">
    <h1>${esc(p.title)}</h1>
    <div class="cd-price">${priceWithCompare(store, p)}</div>
    <div class="cd-stock">${p.stock > 0 ? `En stock — ${p.stock} pièces` : "Épuisé pour le moment"}</div>
    <p class="p-desc">${esc(p.description || "")}</p>
    <ul class="cd-args">
      <li>${icon("cash", 14)} Vous payez le livreur, en espèces</li>
      <li>${icon("truck", 14)} Domicile ou bureau, 58 wilayas</li>
      <li>${icon("shield", 14)} Produit vérifié avant expédition</li>
    </ul>
    ${addFormV(store, p, "btn btn-primary btn-block btn-lg cd-buy", "Commander maintenant", extra.variants)}
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `<section class="wrap cd-related"><h2>Les clients ont aussi pris</h2>
  <div class="cd-relgrid">${related.slice(0, 4).map((r) => `<a class="cd-relcard" href="${slug(store)}/p/${r.id}">
    ${img(r.image, "cd-relimg", r.title)}<b>${esc(r.title)}</b><span>${price(store, r.price_cents)}</span></a>`).join("")}</div>
</section>` : ""}
<div class="cd-sticky">
  <div class="cd-sticky-price"><span>${esc(p.title)}</span><b>${priceWithCompare(store, p)}</b></div>
  <form method="post" action="${slug(store)}/${mode === "panier" ? "cart" : "direct"}">
    <input type="hidden" name="product_id" value="${p.id}">
    <button class="btn btn-primary cd-sticky-btn" ${p.stock === 0 ? "disabled" : ""}>${mode === "panier" ? "Ajouter au panier" : "Commander"}</button>
  </form>
</div>`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap cd-cart">
  <h1>Votre panier</h1>
  ${!items.length ? `<p class="mn-muted">Votre panier est vide.</p><a class="btn btn-primary ndz-empty-link" href="${emptyCartHref(store)}">Voir la boutique</a>` : `
  ${items.map((it) => `<div class="cd-line">
    ${img(it.image, "cd-line-img", it.title)}
    <div><b>${esc(it.title)}</b>
      <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
        <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
      </form>
    </div>
    <span>${price(store, it.price_cents * it.qty)}</span>
  </div>`).join("")}
  ${promoBox(store, totals, promoMsg)}
  <div class="cd-totals">
    <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
    <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
    ${discountRow("mn-srow", store, totals)}
    <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
  </div>
  <a class="btn btn-primary btn-block btn-lg" href="${slug(store)}/checkout">Commander</a>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap cd-checkout">
  <h1>Commande — payez à la livraison</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <form class="mn-form" method="post" action="${slug(store)}/checkout">
    ${CF.fields(store, extra)}
    ${deliveryBlock(store, extra)}
    <div class="mn-pay">${payBlock(store, extra)}</div>
    <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
  </form>
  <div class="cd-totals">
    ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
    <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
    <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap cd-done">
  <h1>Commande reçue</h1>
  <p class="mn-muted">Merci ${esc(order.customer_name)} — référence <b>#${esc(order.ref)}</b>. Nous vous appelons pour confirmer.</p>
  <div class="cd-totals">
    <div class="mn-srow"><span>Total à payer à la livraison</span><span><b>${price(store, order.total_cents)}</b></span></div>
  </div>
  <a class="btn btn-primary" href="${slug(store)}">Retour à la boutique</a>
</section>`
  },
}

/* ======================================================================
   10. TECH — magasin d'électronique : fiche technique, garantie, dense
   ====================================================================== */
const tech = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const D = readDesign(store)
    const mode = cartModeOf(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-tech ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="th-head">
    <div class="wrap th-top">
      <a class="th-brand" href="${slug(store)}">
        ${D.logo ? `<img class="th-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : ""}<span class="brand-name">${esc(store.name)}</span>
      </a>
      <form class="th-search" method="get" action="${slug(store)}" role="search">
        ${icon("search", 15)}
        <input name="q" type="search" placeholder="Rechercher un produit…" aria-label="Rechercher un produit" autocomplete="off">
      </form>
      ${mode === "direct"
        ? `<a class="th-cart th-cart-direct" href="${slug(store)}/checkout">Commander</a>`
        : `<a class="th-cart" href="${slug(store)}/cart">${icon("cart", 16)} Panier<b>${cartCount}</b></a>`}
    </div>
    <div class="wrap th-nav">${navLinks(store)}</div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="th-foot">
    <div class="wrap th-fgrid">
      <div><b>${esc(store.name)}</b><p>${esc(store.tagline || "Produits testés, garantis, livrés partout en Algérie.")}</p></div>
      <div><b>Service</b><p>Garantie 12 mois<br>Échange sous 7 jours</p></div>
      <div><b>Contact</b><p>${esc(store.phone || "")}${store.email ? `<br>${esc(store.email)}` : ""}</p></div>
    </div>
    ${D.showNovadz ? '<p class="th-powered">Propulsé par <a href="/">NovaDZ</a></p>' : ""}
  </footer>
  ${footerExtras(store)}
</div>${preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    const list = (products || []).slice(0, 4)
    const top = list.length ? `
<section class="wrap th-strip">${list.map((p) => `
  <a class="th-chip" href="${slug(store)}/p/${p.id}">${img(p.image, "th-chip-img", p.title)}<span>${esc(p.title)}</span></a>`).join("")}
</section>` : ""
    return top + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    const rows = [
      ["Référence", p.sku || "REF-" + String(p.id).padStart(4, "0")],
      ["Disponibilité", p.stock > 0 ? "En stock (" + p.stock + ")" : "Sur commande"],
      ["Garantie", "12 mois"],
      ["Livraison", "48 h à 72 h · 58 wilayas"],
      ["Retour", "Sous 7 jours"],
    ]
    return `
<section class="wrap th-product">
  <div class="th-gallery">${galleryHtml(store, p, extra)}</div>
  <div class="th-buy">
    <h1>${esc(p.title)}</h1>
    <div class="th-price">${priceWithCompare(store, p)}</div>
    <div class="th-badges">
      <span>${icon("shield", 13)} Garantie 12 mois</span>
      <span>${icon("truck", 13)} Livraison 48 h</span>
      <span>${icon("refresh", 13)} Échange 7 j</span>
    </div>
    <p class="p-desc">${esc(p.description || "")}</p>
    ${addFormV(store, p, "btn btn-primary btn-block th-buy-btn", "Ajouter au panier", extra.variants)}
    <table class="th-specs">
      <caption>Fiche technique</caption>
      <tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody>
    </table>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `<section class="wrap th-related"><h2>Comparer avec</h2>
  <div class="th-relgrid">${related.slice(0, 3).map((r) => `<a class="th-relline" href="${slug(store)}/p/${r.id}">
    ${img(r.image, "th-relimg", r.title)}
    <div><b>${esc(r.title)}</b><span>${price(store, r.price_cents)}</span><span class="th-relstock">${r.stock > 0 ? "En stock" : "Sur commande"}</span></div>
  </a>`).join("")}</div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap th-cartpage">
  <h1>Panier</h1>
  ${!items.length ? `<p class="mn-muted">Votre panier est vide.</p><a class="btn btn-primary ndz-empty-link" href="${emptyCartHref(store)}">Voir le catalogue</a>` : `
  <div class="th-cartgrid">
    <div class="th-lines">
      ${items.map((it) => `<div class="th-line">
        ${img(it.image, "th-lineimg", it.title)}
        <div class="th-linebody"><b>${esc(it.title)}</b>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </div>
        <span>${price(store, it.price_cents * it.qty)}</span>
      </div>`).join("")}
      ${promoBox(store, totals, promoMsg)}
    </div>
    <aside class="th-sum">
      <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
      <a class="btn btn-primary btn-block" href="${slug(store)}/checkout">Commander</a>
    </aside>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap th-checkout">
  <h1>Commande</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <div class="th-cartgrid">
    <form class="mn-form th-form" method="post" action="${slug(store)}/checkout">
      ${CF.fields(store, extra)}
      ${deliveryBlock(store, extra)}
      <div class="mn-pay">${payBlock(store, extra)}</div>
      <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
    </form>
    <aside class="th-sum">
      ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap th-done">
  <h1>Commande confirmée</h1>
  <p class="mn-muted">Référence <b>#${esc(order.ref)}</b> — un conseiller technique vous appelle si besoin.</p>
  <div class="mn-srow"><span>Total</span><span><b>${price(store, order.total_cents)}</b></span></div>
  <a class="btn btn-primary" href="${slug(store)}">Retour au catalogue</a>
</section>`
  },
}

/* ======================================================================
   11. MARCHÉ — dense, prix forts, badges, bandeau défilant
   ====================================================================== */
const marche = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const D = readDesign(store)
    const mode = cartModeOf(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-marche ${designClass(D)}">
${storeStyle(D, store.theme)}
  <div class="mr-marquee"><span>Prix cassés toute la semaine · Paiement à la livraison · Livraison 58 wilayas · Échange sous 7 jours · Prix cassés toute la semaine · Paiement à la livraison · Livraison 58 wilayas · Échange sous 7 jours ·</span></div>
  <header class="mr-head">
    <div class="wrap mr-bar">
      <a class="mr-brand" href="${slug(store)}">
        ${D.logo ? `<img class="mr-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : ""}<span class="brand-name">${esc(store.name)}</span>
      </a>
      <nav class="mr-nav">${navLinks(store)}</nav>
      ${mode === "direct"
        ? `<a class="mr-cart" href="${slug(store)}/checkout">Commander</a>`
        : `<a class="mr-cart" href="${slug(store)}/cart">${icon("cart", 15)} <b>${cartCount}</b></a>`}
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="mr-foot">
    <div class="wrap mr-fgrid">
      <div><b>${esc(store.name)}</b><p>${esc(store.tagline || "")}</p></div>
      <div><b>Infos</b><p>Livraison 58 wilayas<br>Paiement à la livraison</p></div>
      <div><b>Contact</b><p>${esc(store.phone || "")}</p></div>
    </div>
    ${D.showNovadz ? '<p class="mr-powered">Propulsé par <a href="/">NovaDZ</a></p>' : ""}
  </footer>
  ${footerExtras(store)}
</div>${preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    const list = (products || []).slice(0, 12)
    const top = list.length ? `
<section class="wrap mr-deals">
  <div class="mr-deals-head"><b>Les prix cassés du jour</b><span>${list.length} articles</span></div>
  <div class="mr-grid">
    ${list.map((p) => `<a class="mr-card" href="${slug(store)}/p/${p.id}">
      <span class="mr-badge">${p.stock === 0 ? "Épuisé" : "BON PLAN"}</span>
      ${img(p.image, "mr-card-img", p.title)}
      <b class="mr-card-name">${esc(p.title)}</b>
      <span class="mr-card-price">${priceWithCompare(store, p)}</span>
    </a>`).join("")}
  </div>
</section>` : ""
    return top + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="wrap mr-product">
  <div class="mr-media">${galleryHtml(store, p, extra)}<span class="mr-badge big">BON PLAN</span></div>
  <div class="mr-body">
    <h1>${esc(p.title)}</h1>
    <div class="mr-price">${priceWithCompare(store, p)}</div>
    <div class="mr-stock">${p.stock > 0 ? `${p.stock} disponibles` : "Épuisé"}</div>
    ${addFormV(store, p, "btn btn-primary btn-block mr-buy", "Ajouter au panier", extra.variants)}
    <p class="p-desc">${esc(p.description || "")}</p>
    <ul class="mr-trust">${trust()}</ul>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `<section class="wrap mr-related"><h2>Les autres bonnes affaires</h2>
  <div class="mr-grid">${related.slice(0, 4).map((r) => `<a class="mr-card" href="${slug(store)}/p/${r.id}">
    ${img(r.image, "mr-card-img", r.title)}<b class="mr-card-name">${esc(r.title)}</b>
    <span class="mr-card-price">${price(store, r.price_cents)}</span></a>`).join("")}</div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap mr-cartpage">
  <h1>Panier</h1>
  ${!items.length ? `<p class="mn-muted">Votre panier est vide.</p><a class="btn btn-primary ndz-empty-link" href="${emptyCartHref(store)}">Voir les offres</a>` : `
  ${items.map((it) => `<div class="mr-line">
    ${img(it.image, "mr-line-img", it.title)}
    <div><b>${esc(it.title)}</b>
      <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
        <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
      </form>
    </div>
    <span>${price(store, it.price_cents * it.qty)}</span>
  </div>`).join("")}
  ${promoBox(store, totals, promoMsg)}
  <div class="mr-totals">
    <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
    <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
    ${discountRow("mn-srow", store, totals)}
    <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
  </div>
  <a class="btn btn-primary btn-block btn-lg" href="${slug(store)}/checkout">Commander</a>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap mr-checkout">
  <h1>Commande</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <form class="mn-form" method="post" action="${slug(store)}/checkout">
    ${CF.fields(store, extra)}
    ${deliveryBlock(store, extra)}
    <div class="mn-pay">${payBlock(store, extra)}</div>
    <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
  </form>
  <div class="mr-totals">
    ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
    <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
    <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap mr-done">
  <h1>C'est commandé</h1>
  <p class="mn-muted">Référence <b>#${esc(order.ref)}</b>. On vous appelle pour confirmer.</p>
  <div class="mn-srow"><span>À payer à la livraison</span><span><b>${price(store, order.total_cents)}</b></span></div>
  <a class="btn btn-primary" href="${slug(store)}">Retour aux offres</a>
</section>`
  },
}

/* ============================== BENTO ==============================
   Grille de tuiles inégales, dense et moderne (façon bento).
   Cible : boutiques multi-produits, accessoires, high-tech. */
const mosaique = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const D = readDesign(store)
    const mode = cartModeOf(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-mosaique ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="mq-head">
    <div class="wrap mq-bar">
      <a class="mq-brand" href="${slug(store)}">
        ${D.logo ? `<img class="mq-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">`
          : `<span class="mq-mark">${esc((store.name || "N").slice(0, 1))}</span><b class="brand-name">${esc(store.name)}</b>`}
      </a>
      <nav class="mq-nav">${navLinks(store)}</nav>
      <div class="mq-end">
        ${mode === "direct" ? `<a class="mq-cta" href="${slug(store)}/checkout">Commander</a>`
          : `<a class="mq-cart" href="${slug(store)}/cart">Panier${cartCount ? `<b class="mq-chip">${cartCount}</b>` : ""}</a>`}
      </div>
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="mq-foot">
    <div class="wrap mq-frow">
      <div><b>${esc(store.name)}</b>${store.wilaya ? `<span>${esc(store.wilaya)}</span>` : ""}</div>
      <div>${esc(store.phone || "")}</div>
      <div class="mq-powered">${D.footerNote ? esc(D.footerNote) + (D.showNovadz ? " · " : "") : ""}${D.showNovadz ? 'Propulsé par <a href="/">NovaDZ</a>' : ""}</div>
    </div>
  </footer>
  ${footerExtras(store)}
</div>${preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    const list = products || []
    const p0 = list[0]
    const rest = list.slice(1, 5)
    const hero = `
<section class="wrap mq-hero">
  <div class="mq-grid">
    ${p0 ? `
    <a class="mq-tile mq-tile-big" href="${slug(store)}/p/${p0.id}">
      ${img(p0.image, "mq-tile-img", p0.title)}
      <span class="mq-tile-body">
        <small>À la une</small>
        <b>${esc(p0.title)}</b>
        <span class="mq-tile-price">${price(store, p0.price_cents)}</span>
      </span>
    </a>` : `
    <div class="mq-tile mq-tile-big mq-tile-text">
      <b>${esc(store.name)}</b>
      <span>${esc(store.tagline || "Votre boutique en ligne.")}</span>
    </div>`}
    <div class="mq-tile mq-tile-text mq-tile-brand">
      <b>${esc(store.name)}</b>
      <span>${esc(store.tagline || "Commande simple, livraison rapide.")}</span>
      <a class="mq-inline" href="${slug(store)}#catalogue">Voir tout ${icon("arrowRight", 12)}</a>
    </div>
    ${rest.map((p) => `
    <a class="mq-tile" href="${slug(store)}/p/${p.id}">
      ${img(p.image, "mq-tile-img", p.title)}
      <span class="mq-tile-body"><b>${esc(p.title)}</b><span class="mq-tile-price">${priceWithCompare(store, p)}</span></span>
    </a>`).join("")}
    <div class="mq-tile mq-tile-star">
      <span class="mq-stars">★★★★★</span>
      <b>Livraison 58 wilayas</b>
      <span>Paiement à la livraison.</span>
    </div>
  </div>
</section>`
    return hero + `<div id="catalogue"></div>` + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="wrap mq-product">
  <a class="mq-back" href="${slug(store)}">${icon("arrowLeft", 13)} Retour</a>
  <div class="mq-pgrid">
    <div class="mq-pmedia">${galleryHtml(store, p, extra)}</div>
    <div class="mq-pbody">
      <h1>${esc(p.title)}</h1>
      <div class="mq-pprice">${priceWithCompare(store, p)}</div>
      <p class="p-desc">${esc(p.description || "")}</p>
      <p class="mq-pstock">${p.stock > 0 ? `${p.stock} en stock` : "Rupture de stock"}</p>
      ${addFormV(store, p, "btn btn-primary btn-block", "Ajouter au panier", extra.variants)}
      <ul class="mq-trust">${trust()}</ul>
    </div>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `<section class="wrap mq-related">
  <h2>Dans le même esprit</h2>
  <div class="mq-relgrid">${related.map((r) => `
    <a class="mq-relcard" href="${slug(store)}/p/${r.id}">${img(r.image, "mq-relimg", r.title)}
      <b>${esc(r.title)}</b><span>${price(store, r.price_cents)}</span></a>`).join("")}</div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap mq-cartpage">
  <h1>Panier</h1>
  ${!items.length ? `<p class="mn-muted">Votre panier est vide.</p><a class="mq-inline ndz-empty-link" href="${emptyCartHref(store)}">Voir la boutique</a>` : `
  <div class="mq-cart-grid">
    <div>
      ${items.map((it) => `<div class="mq-line">
        ${img(it.image, "mq-line-img", it.title)}
        <div class="mq-line-body"><b>${esc(it.title)}</b>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </div>
        <span>${price(store, it.price_cents * it.qty)}</span>
      </div>`).join("")}
      ${promoBox(store, totals, promoMsg)}
    </div>
    <aside class="mq-summary">
      <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
      <a class="btn btn-primary btn-block" href="${slug(store)}/checkout">Commander</a>
    </aside>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap mq-checkout">
  <h1>Commande</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <div class="mq-co-grid">
    <form class="mn-form" method="post" action="${slug(store)}/checkout">
      ${CF.fields(store, extra)}
      ${deliveryBlock(store, extra)}
      <div class="mn-pay">${payBlock(store, extra)}</div>
      <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
    </form>
    <aside class="mq-summary">
      ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap mq-done">
  <h1>Commandé.</h1>
  <p class="mn-muted">Référence <b>#${esc(order.ref)}</b> — ${esc(order.customer_name)}.</p>
  <div class="mn-done-box">
    <div class="mn-srow"><span>Total à payer</span><span><b>${price(store, order.total_cents)}</b></span></div>
    <div class="mn-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
  </div>
  <a class="mq-inline" href="${slug(store)}">Retour à la boutique</a>
</section>`
  },

}

/* ============================== NOIR ==============================
   Éditorial sombre, grands titres, photo plein cadre.
   Cible : mode, parfum, cosmétique, bijoux. */
const noir = {
  shell(store, content, { title, cartCount = 0, preview = false, seo = null } = {}) {
    const D = readDesign(store)
    const mode = cartModeOf(store)
    return page(title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`, `
<div class="theme theme-noir ${designClass(D)}">
${storeStyle(D, store.theme)}
  <header class="nr-head">
    <div class="wrap nr-bar">
      <a class="nr-brand" href="${slug(store)}">
        ${D.logo ? `<img class="nr-logo" src="${esc(D.logo)}" alt="${esc(store.name)}">` : ""}<span class="brand-name">${esc(store.name)}</span>
      </a>
      <nav class="nr-nav">${navLinks(store)}</nav>
      <div class="nr-end">
        ${mode === "direct" ? `<a class="nr-cta" href="${slug(store)}/checkout">Commander</a>`
          : `<a class="nr-cart" href="${slug(store)}/cart">Panier${cartCount ? ` <b>${cartCount}</b>` : ""}</a>`}
      </div>
    </div>
    ${socialBar(store, "entete")}
  </header>
  ${content}
  <footer class="nr-foot">
    <div class="wrap nr-frow">
      <div class="nr-fbrand">${esc(store.name)}</div>
      <div>${esc(store.phone || "")}${store.wilaya ? ` · ${esc(store.wilaya)}` : ""}</div>
      <div class="nr-powered">${D.footerNote ? esc(D.footerNote) + (D.showNovadz ? " · " : "") : ""}${D.showNovadz ? 'Propulsé par <a href="/">NovaDZ</a>' : ""}</div>
    </div>
  </footer>
  ${footerExtras(store)}
</div>${preview ? PREVIEW_SCRIPT : ""}`, { seo })
  },

  home(store, products, meta) {
    const p0 = (products || [])[0]
    const hero = `
<section class="nr-hero">
  ${p0 ? `<a class="nr-hero-media" href="${slug(store)}/p/${p0.id}">${img(p0.image, "nr-hero-img", p0.title)}</a>` : ""}
  <div class="wrap nr-hero-body">
    <span class="nr-kicker">${esc(store.wilaya || "Collection")}</span>
    <h1>${esc(store.name)}</h1>
    <p>${esc(store.tagline || "Des pièces choisies, en petite quantité.")}</p>
    <div class="nr-hero-actions">
      <a class="nr-btn" href="${slug(store)}#catalogue">Découvrir</a>
      ${p0 ? `<a class="nr-btn nr-btn-ghost" href="${slug(store)}/p/${p0.id}">La pièce du moment</a>` : ""}
    </div>
  </div>
</section>`
    /* Bannière du thème (nom + wilaya) : elle n'est pas éditable.
       Si le marchand a déjà une bannière, c'est la sienne que le visiteur voit. */
    const ownHero = readSections(store).some((s) => s && s.type === "hero" && !s.hidden)
    return (ownHero ? "" : hero) + `<div id="catalogue"></div>` + homeFromSections(store, products, meta)
  },

  product(store, p, related = [], extra = {}) {
    return `
<section class="nr-product">
  <div class="nr-pmedia">${galleryHtml(store, p, extra)}</div>
  <div class="nr-pbody">
    <a class="nr-back" href="${slug(store)}">${icon("arrowLeft", 13)} Boutique</a>
    <h1>${esc(p.title)}</h1>
    <div class="nr-pprice">${priceWithCompare(store, p)}</div>
    <p class="p-desc">${esc(p.description || "")}</p>
    <p class="nr-pstock">${p.stock > 0 ? `Disponible · ${p.stock} pièces` : "Épuisé"}</p>
    ${addFormV(store, p, "btn btn-primary btn-block nr-buy", "Ajouter au panier", extra.variants)}
    <ul class="nr-trust">${trust()}</ul>
  </div>
</section>
${reviewsHtml(store, p, extra)}
${related.length ? `<section class="wrap nr-related">
  <h2>À voir aussi</h2>
  <div class="nr-relgrid">${related.map((r) => `
    <a class="nr-relcard" href="${slug(store)}/p/${r.id}">${img(r.image, "nr-relimg", r.title)}
      <b>${esc(r.title)}</b><span>${price(store, r.price_cents)}</span></a>`).join("")}</div>
</section>` : ""}`
  },

  cart(store, items, totals, promoMsg) {
    return `
<section class="wrap nr-cartpage">
  <h1>Panier</h1>
  ${!items.length ? `<p class="mn-muted">Votre panier est vide.</p><a class="nr-link ndz-empty-link" href="${emptyCartHref(store)}">Voir la boutique</a>` : `
  <div class="nr-cart-grid">
    <div>
      ${items.map((it) => `<div class="nr-line">
        ${img(it.image, "nr-line-img", it.title)}
        <div class="nr-line-body"><b>${esc(it.title)}</b>
          <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="mn-qty">
            <button name="delta" value="-1">−</button><span>${it.qty}</span><button name="delta" value="1">+</button>
          </form>
        </div>
        <span>${price(store, it.price_cents * it.qty)}</span>
      </div>`).join("")}
      ${promoBox(store, totals, promoMsg)}
    </div>
    <aside class="nr-summary">
      <div class="mn-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("mn-srow", store, totals)}
      <div class="mn-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
      <a class="btn btn-primary btn-block" href="${slug(store)}/checkout">Commander</a>
    </aside>
  </div>`}
</section>`
  },

  checkout(store, items, totals, error, extra = {}) {
    return `
<section class="wrap nr-checkout">
  <h1>Commande</h1>
  ${error ? `<div class="mn-alert">${esc(error)}</div>` : ""}
  <div class="nr-co-grid">
    <form class="mn-form" method="post" action="${slug(store)}/checkout">
      ${CF.fields(store, extra)}
      ${deliveryBlock(store, extra)}
      <div class="mn-pay">${payBlock(store, extra)}</div>
      <button class="btn btn-primary btn-block btn-lg">Confirmer · ${price(store, totals.total)}</button>
    </form>
    <aside class="nr-summary">
      ${items.map((it) => `<div class="mn-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="mn-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      <div class="mn-srow total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</section>`
  },

  done(store, order, opts = {}) {
    return `
<section class="wrap nr-done">
  <h1>Merci.</h1>
  <p class="mn-muted">Commande <b>#${esc(order.ref)}</b> — ${esc(order.customer_name)}.</p>
  <div class="mn-done-box">
    <div class="mn-srow"><span>Total à payer</span><span><b>${price(store, order.total_cents)}</b></span></div>
    <div class="mn-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
  </div>
  <a class="nr-link" href="${slug(store)}">Retour à la boutique</a>
</section>`
  },

}

/* Six thèmes « prêts à l'emploi » (voir src/layouts-pro.js). Ils reçoivent les
   briques déjà écrites ici : aucune duplication de la fiche produit ni du panier. */
const PRO = require("./layouts-pro")({
  esc, money, page, PREVIEW_SCRIPT, icon, img, initial,
    readDesign, storeStyle, designClass, navLinks, socialBar, footerExtras, legalBar,
  trustInline, galleryHtml, addFormV, reviewsHtml, promoBox, discountRow,
  deliveryBlock, payBlock, CF, homeFromSections, categories: SHOP.categories, price, slug, emptyCartHref,
})

const LAYOUTS = { minimal, editorial, contrast, catalogue, mono, galerie, bento, zen, cod, tech, marche, mosaique, noir, ...PRO, compact: catalogue }
const layoutFor = (id) => LAYOUTS[id] || minimal

/** Page libre (À propos, Contact, CGV…) dans le thème courant. */
/** Page « Mes favoris » : la liste vit dans le navigateur du client (aucun compte requis). */
const favPage = (store, cartCount = 0) => {
  const L = layoutFor(store.theme)
  return L.shell(
    store,
    `<div class="fav-wrap">
  <h1>Mes favoris</h1>
  <p class="ndz-muted">Enregistrés dans ce navigateur. Rien n'est envoyé.</p>
  <div class="fav-grid" id="favRoot"></div>
  <p class="fav-empty" id="favEmpty" hidden>Aucun favori pour le moment.</p>
</div>
<script>
(function(){
  var root = document.getElementById('favRoot');
  var empty = document.getElementById('favEmpty');
  var list = [];
  try { list = JSON.parse(localStorage.getItem('ndz_fav_${esc(store.slug)}') || '[]') } catch (e) { list = [] }
  if (!list.length) { empty.hidden = false; return }
  root.innerHTML = list.map(function (x) {
    return '<div class="fav-card">' +
      (x.img ? '<img src="' + x.img + '" alt="">' : '') +
      '<div class="fav-body"><b>' + x.title + '</b><span class="pr-now">' + x.price + '</span>' +
      '<form method="post" action="/${esc(store.slug)}/cart">' +
      '<input type="hidden" name="product_id" value="' + x.id + '">' +
      '<button class="btn btn-primary">Ajouter au panier</button></form>' +
      '<a class="ndz-muted" href="' + x.url + '">Voir la fiche</a></div></div>';
  }).join('');
})();
</script>`,
    { cartCount, title: "Mes favoris" }
  )
}

const leadForm = (store, { sent = false, back = "" } = {}) => {
  if (!store || store.site_kind !== "vitrine") return ""
  return `<section class="doc-form" id="ecrire">
    <h2>Écrire</h2>
    <p>Nom, téléphone, message. Ça arrive dans le tableau de bord.</p>
    ${sent ? `<div class="doc-sent">Message reçu. Il est dans le tableau de bord.</div>` : ""}
    <form method="post" action="/${esc(store.slug)}/contact">
      <input type="text" name="website" value="" autocomplete="off" tabindex="-1" hidden>
      <input type="hidden" name="back" value="${esc(back)}">
      <label>Nom<input name="name" required maxlength="80" placeholder="Sara Bensalem"></label>
      <div class="doc-form-row">
        <label>Téléphone<input name="phone" inputmode="tel" maxlength="24" placeholder="0555 12 34 56"></label>
        <label>E-mail<input name="email" type="email" maxlength="120" placeholder="sara@exemple.dz"></label>
      </div>
      <label>Message<textarea name="message" required maxlength="2000" placeholder="Le projet, la ville, quand vous appeler."></textarea></label>
      <button class="btn btn-primary" type="submit">Envoyer</button>
    </form>
  </section>`
}

const contentPage = (store, page, cartCount = 0, extra = {}) => {
  const L = layoutFor(store.theme)
  const vitrine = store.site_kind === "vitrine"
  const body = String(page.body || "")
    .split(/\n{2,}/)
    .map((par) => `<p>${esc(par).replace(/\n/g, "<br>")}</p>`)
    .join("")
  const inner = `<article class="doc"><div class="wrap doc-in">
      <a class="doc-back" href="/${esc(store.slug)}">${icon("arrowLeft", 14)} ${vitrine ? "Retour au site" : "Retour à la boutique"}</a>
      <h1>${esc(page.title)}</h1>
      <div class="doc-body">${body || "<p></p>"}</div>
    </div>${leadForm(store, { sent: extra.sent, back: page.slug })}</article>`
  const pageHtml = SECTIONS.renderPage(store, "page:" + String(page.slug || ""), inner)
  return L.shell(store, pageHtml.html, { cartCount, title: page.title, ownCode: pageHtml.ownCode })
}

/* ---------------------------------------------------------------------------
   Habillage bilingue : appliqué à TOUS les thèmes depuis un seul endroit.
   (évite de dupliquer la logique de langue dans les 4 gabarits)
   ------------------------------------------------------------------------- */
const WRAPPED = new Set()
Object.keys(LAYOUTS).forEach((key) => {
  const L = LAYOUTS[key]
  if (WRAPPED.has(L)) return
  WRAPPED.add(L)
  const orig = L.shell.bind(L)
  L.shell = function (store, content, opts = {}) {
    const lang = I18N.langNow(store)
    const D = readDesign(store)
    const req = I18N.current().req || {}
    const pageKey = SECTIONS.pageKeyOfPath(req.path || "/", store.slug)
    /* pages autres que l'accueil : les blocs ajoutés par le marchand viennent
       se placer sous la structure du thème (fiche produit, panier, commande…) */
    if (pageKey !== "home" && !opts.ownCode) {
      const list = SECTIONS.readSections(store, pageKey)
      if (list.length) {
        let products = []
        try {
          products = require("./db").prepare(
            "SELECT * FROM products WHERE store_id = ? AND active = 1 ORDER BY id DESC LIMIT 24"
          ).all(store.id)
        } catch (_) { products = [] }
        content = content + SECTIONS.renderSections(store, list, { design: D, products })
      }
    }
    let html = orig(store, content, opts)
    html = html.replace('<html lang="fr">',
      `<html ${I18N.htmlAttrs(lang)} data-kind="${store.site_kind === "vitrine" ? "vitrine" : "commerce"}" data-page="${pageKey}" data-cart="${D.cartMode || "deux"}" data-cartlink="${D.showCartLink === false ? "off" : "on"}" data-cards="${esc(D.cardStyle || "classique")}" data-search="${esc(D.searchPlace || "entete")}" data-align="${esc(D.textAlign || "def")}" data-title="${Number(D.scale) !== 1 ? "on" : "off"}" data-mtext="${esc(D.mobileText || "normal")}" data-mtitle="${esc(D.mobileTitle || "normal")}" data-mpad="${esc(D.mobilePad || "normal")}" data-mcols="${esc(String(D.mobileCols || 2))}" data-ownsearch="${/class="[a-z-]*\b(ca|th)-search\b/.test((html.match(/<header[\s\S]*?<\/header>/) || [""])[0]) ? "oui" : "non"}" data-brandname="${D.showName === false ? "off" : "on"}" data-brandlogo="${D.showLogo === false ? "off" : "on"}" data-logoplace="${esc(D.logoPlace || "gauche")}" data-exemple="${esc(D.exampleImage || "/demo/exemple.jpg")}" data-variant="${esc(D.variantStyle || "boutons")}" data-heroalign="${esc(D.heroAlign || "def")}" data-searchalign="${esc(D.searchAlign || "droite")}" data-headh="${esc(D.headHeight || "normale")}" data-headalign="${esc(D.headAlign || "gauche")}" data-wide="${Number(D.containerWidth) !== 1240 ? "on" : "off"}" data-radius="${Number(D.radiusPx) !== 12 ? "on" : "off"}" data-weight="${String(D.weight) !== "600" ? "on" : "off"}" data-track="${(D.tracking || "normal") !== "normal" ? "on" : "off"}" data-foot="${D.footBg || D.footInk ? "on" : "off"}" data-accent="${String(D.accent || "#111111").toLowerCase() !== "#111111" ? "on" : "off"}" data-headbg="${D.headBg ? "on" : "off"}" data-product="${esc(opts.productId || "")}">`)
    /* recherche : dans l'en-tête, sous l'en-tête, en icône, ou pas du tout.
       Deux thèmes (Catalogue, Tech) ont déjà la leur : on ne la double pas. */
    const place = D.searchPlace || "entete"
    const headStart = html.indexOf("<header")
    const headEnd = html.indexOf("</header>")
    const headHtml = headStart !== -1 && headEnd > headStart ? html.slice(headStart, headEnd) : ""
    const themeField = /class="[^"]*\b(tpx|ca|th)-search\b/.test(headHtml)
    const themeIcon = /href="[^"]*\?q="/.test(headHtml)
    const stripThemeSearch = () => {
      html = html
        .replace(/<form class="tpx-search"[\s\S]*?<\/form>/g, "")
        .replace(/<form class="[^"]*\b(ca|th)-search\b[\s\S]*?<\/form>/g, "")
        .replace(/<a class="[^"]*" href="[^"]*\?q="[^>]*>[\s\S]*?<\/a>/g, "")
    }
    /* « aucune » retire la recherche du thème. « entete » garde celle du thème
       (le grand champ d'Électro, l'icône des autres) et n'en ajoute pas une seconde.
       « icône » et « dessous » remplacent vraiment celle du thème. */
    if (place === "aucune") stripThemeSearch()
    const keepTheme = place === "entete" && (themeField || themeIcon)
    if (headHtml && !keepTheme) {
      if (place === "aucune") {
        /* rien : le CSS cache aussi ce qui resterait */
      } else if (place === "entete") {
        html = html.replace("</header>", `${searchBox(store, D, place)}</header>`)
      } else if (place === "icone") {
        stripThemeSearch()
        /* icône : on l'insère DANS la barre de l'en-tête (même ligne que le logo,
           le menu et le panier), et non après le </header> où elle tombait à la ligne. */
        const headNow = html.slice(html.indexOf("<header"), html.indexOf("</header>"))
        const btn = searchBox(store, D, "icone")
        const spot = rowInsertPoint(headNow)
        if (spot > -1) {
          const abs = html.indexOf("<header") + spot
          html = html.slice(0, abs) + btn + html.slice(abs)
        } else {
          html = html.replace("</header>", btn + "</header>")
        }
        html = html.replace("</body>", searchOverlay(store, D) + "</body>")
      } else {
        /* dessous : une barre discrète sous l'en-tête */
        stripThemeSearch()
        html = html.replace("</header>", `</header>\n<div class="ndz-searchbar">${searchBox(store, D, "dessous")}</div>`)
      }
    }
    /* nom de la boutique retiré : on l'enlève du HTML, pas seulement à l'écran */
    if (D.showName === false) {
      html = html.replace(/<(span|b) class="brand-name">[\s\S]*?<\/\1>/g, "")
      html = html.replace(/<(span|b) class="([a-z-]*) brand-name">[\s\S]*?<\/\1>/g, "")
      /* le logo seul reste cliquable : on garde un lien vers l'accueil lisible */
      html = html.replace(/(<a[^>]*class="(?:mn|ct|mo|ca|ga|bt|zn|cd|th|mr|mq|nr)-brand[^"]*"[^>]*>)\s*<\/a>/g, "$1<span class=\"sr-only\">Accueil</span></a>")
    }
    /* CSS propre à la page + codes HTML du marchand */
    if (D.pageCss && D.pageCss[pageKey]) html = html.replace("</head>", `<style>${D.pageCss[pageKey]}</style></head>`)
    if (D.customCss) html = html.replace("</head>", `<style id="ndzCustomCss">${D.customCss}</style></head>`)
    if (D.htmlHead) html = html.replace("</head>", `${D.htmlHead}</head>`)
    const fontHref = SECTIONS.fontHref(D)
    if (fontHref) {
      html = html.replace("</head>", `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link id="ndzGf" rel="stylesheet" href="${esc(fontHref)}"></head>`)
    }
    if (D.htmlFooter) html = html.replace("</body>", `${D.htmlFooter}</body>`)
    html = html.replace("<html ", `<html data-drawer="${esc(D.cartType || "page")}" data-drawer-open="${D.cartOpenDrawer ? "1" : "0"}" data-parts="${D.installOn ? String(D.installN || 3) : "0"}" data-accel="${D.payDirect ? "1" : "0"}" data-swatch="${D.swatchImg ? "1" : "0"}" `)
    html = html.replace("</body>", `<script src="/ndz-store.js" defer></script></body>`)
    if (Array.isArray(D.dict) && D.dict.length) html = I18N.applyDict(html, D.dict)
    if (lang === "ar" && html.indexOf("/estedad.css") === -1) {
      html = html.replace("</head>", '<link rel="stylesheet" href="/estedad.css"></head>')
    }
    const pill = I18N.switchHtml(store, I18N.current().req || {}, lang)
    if (pill) html = placeLang(html, pill)
    return I18N.localize(html, lang)
  }
})

module.exports = { layoutFor, LAYOUTS, contentPage, favPage, navHref, shipScript, leadForm }
