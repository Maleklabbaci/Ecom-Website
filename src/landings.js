"use strict"
/**
 * Pages de vente (landing) par produit.
 *
 * Une landing = un produit + un prix propre + des offres de quantité + un formulaire
 * court (nom, téléphone, wilaya, adresse). Pas de panier : c'est le format qui convertit
 * en paiement à la livraison. Plusieurs landings peuvent viser le même produit — une par
 * publicité — avec chacune ses pixels et son compte à rebours.
 */
const db = require("./db")
const SHOP = require("./shop")
const PAY = require("./payments")
const INV = require("./inventory")
const SEC = require("./security")

db.exec(`
CREATE TABLE IF NOT EXISTS landings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id       INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  subtitle       TEXT DEFAULT '',
  hero           TEXT,
  compare_cents  INTEGER NOT NULL DEFAULT 0,
  benefits       TEXT DEFAULT '',
  countdown_min  INTEGER NOT NULL DEFAULT 0,
  free_ship_qty  INTEGER NOT NULL DEFAULT 0,
  offers         TEXT,
  sticky_cta     INTEGER NOT NULL DEFAULT 1,
  active         INTEGER NOT NULL DEFAULT 1,
  visits         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, slug)
);
`)

const slugify = (t) => String(t || "")
  .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50)

const list = (storeId) =>
  db.prepare(`SELECT l.*, p.title AS product_title, p.image AS product_image, p.price_cents,
              (SELECT COUNT(*) FROM orders o WHERE o.landing_id = l.id) AS orders,
              (SELECT COALESCE(SUM(o.total_cents),0) FROM orders o WHERE o.landing_id = l.id AND o.status != 'annulee') AS revenue
              FROM landings l JOIN products p ON p.id = l.product_id
              WHERE l.store_id = ? ORDER BY l.id DESC`).all(storeId)

const get = (id, storeId) =>
  db.prepare("SELECT * FROM landings WHERE id = ? AND store_id = ?").get(id, storeId)

const bySlug = (storeId, slug) =>
  db.prepare("SELECT * FROM landings WHERE store_id = ? AND slug = ? AND active = 1").get(storeId, slug)

const parseOffers = (raw) => {
  if (Array.isArray(raw)) return raw
  try {
    const v = JSON.parse(raw || "[]")
    return Array.isArray(v) ? v : []
  } catch (_) { return [] }
}

/** Offres utiles : au moins une, toujours triées par quantité. */
const offersOf = (landing, product) => {
  const base = landing ? Number(landing.compare_cents || 0) || product.price_cents : product.price_cents
  const list = parseOffers(landing && landing.offers)
    .map((o) => ({ qty: Math.max(1, parseInt(o.qty, 10) || 1), price: Math.max(0, Math.round(Number(o.price) || 0)), label: String(o.label || "") }))
    .filter((o) => o.price > 0)
    .sort((a, b) => a.qty - b.qty)
  return list.length ? list : [{ qty: 1, price: base, label: "" }]
}

/* ------------------------------ écriture ------------------------------ */
const save = (storeId, body, id) => {
  const productId = parseInt(body.product_id, 10)
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ?").get(productId, storeId)
  if (!product) return null

  const offers = []
  for (let i = 1; i <= 3; i++) {
    const qty = parseInt(body[`qty${i}`] != null ? body[`qty${i}`] : i, 10)
    const price = Math.round(parseFloat(body[`price${i}`] || "0") * 100)
    if (qty > 0 && price > 0) offers.push({ qty, price, label: String(body[`label${i}`] || "").trim().slice(0, 40) })
  }
  let slug = slugify(body.slug || body.title || product.title) || `offre-${product.id}`
  /* adresse déjà prise par une autre page ? on ajoute un suffixe au lieu d'échouer */
  const clash = db.prepare("SELECT id FROM landings WHERE store_id = ? AND slug = ?").get(storeId, slug)
  if (clash && clash.id !== Number(id || 0)) slug = `${slug}-${String(Date.now()).slice(-5)}`
  const data = {
    store_id: storeId,
    product_id: productId,
    slug,
    title: String(body.title || product.title).trim().slice(0, 90),
    subtitle: String(body.subtitle || "").trim().slice(0, 160),
    hero: String(body.hero || "").trim() || product.image || null,
    compare_cents: Math.round(parseFloat(body.compare || "0") * 100) || 0,
    benefits: String(body.benefits || "").slice(0, 600),
    countdown_min: Math.max(0, Math.min(1440, parseInt(body.countdown_min, 10) || 0)),
    free_ship_qty: Math.max(0, Math.min(9, parseInt(body.free_ship_qty, 10) || 0)),
    offers: JSON.stringify(offers),
    sticky_cta: body.sticky_cta ? 1 : 0,
    active: body.active ? 1 : 0,
  }

  if (id) {
    db.prepare(`UPDATE landings SET product_id = ?, slug = ?, title = ?, subtitle = ?, hero = ?,
                compare_cents = ?, benefits = ?, countdown_min = ?, free_ship_qty = ?, offers = ?,
                sticky_cta = ?, active = ? WHERE id = ? AND store_id = ?`)
      .run(data.product_id, data.slug, data.title, data.subtitle, data.hero, data.compare_cents,
        data.benefits, data.countdown_min, data.free_ship_qty, data.offers, data.sticky_cta,
        data.active, id, storeId)
    return id
  }
  const info = db.prepare(`INSERT INTO landings (store_id, product_id, slug, title, subtitle, hero,
              compare_cents, benefits, countdown_min, free_ship_qty, offers, sticky_cta, active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(data.store_id, data.product_id, data.slug, data.title, data.subtitle, data.hero,
      data.compare_cents, data.benefits, data.countdown_min, data.free_ship_qty, data.offers,
      data.sticky_cta, data.active)
  return info.lastInsertRowid
}

const remove = (id, storeId) => db.prepare("DELETE FROM landings WHERE id = ? AND store_id = ?").run(id, storeId)

const countVisit = (id) => db.prepare("UPDATE landings SET visits = visits + 1 WHERE id = ?").run(id)

/* ------------------------------ commande ------------------------------ */
/**
 * Crée la commande d'une landing. Stock vérifié et décrémenté dans la même transaction.
 * Renvoie { order } ou { error }.
 */
const createOrder = (store, landing, product, body) => {
  const offers = offersOf(landing, product)
  const qty = Math.max(1, parseInt(body.qty, 10) || 1)
  const offer = offers.find((o) => o.qty === qty)
  /* quantité hors offre : on applique le prix unitaire de la première offre */
  const subtotal = offer ? offer.price : offers[0].price * qty
  const unit = Math.round(subtotal / qty)
  const freeShip = landing && landing.free_ship_qty > 0 && qty >= landing.free_ship_qty
  SHOP.ensureShipping(store.id)
  const deskTypes = SHOP.deliveryTypes(store).map((t) => t.id)
  const dType = deskTypes.includes(body.delivery) ? body.delivery : (deskTypes[0] || "home")
  const shipping = freeShip ? 0 : SHOP.shippingFor(store.id, body.wilaya || "Alger", dType)
  /* les pages de vente sont en paiement à la livraison : on applique les frais
     que le marchand a éventuellement réglés pour ce moyen */
  const payFee = PAY.feeFor(store, "cod")
  const total = subtotal + shipping + payFee

  const ref = require("./refs").uniqueRef(db, store.id)
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO orders (store_id, ref, customer_name, phone, address, wilaya, note,
        subtotal_cents, shipping_cents, discount_cents, promo_code, customer_id, total_cents,
        landing_id, ip, ua, risk_score, risk_flags, captcha_ok, geo_lat, geo_lng, geo_accuracy, status,
        payment, pay_fee_cents, delivery_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cod', ?, ?)`)
      .run(store.id, ref, String(body.customer_name || "").trim().slice(0, 80),
        String(body.phone || "").trim().slice(0, 20),
        String(body.address || "").trim().slice(0, 200),
        String(body.wilaya || "").slice(0, 40),
        String(body.note || "").slice(0, 200),
        subtotal, shipping, total,
        landing ? landing.id : null,
        String(body.ip || ""), String(body.ua || "").slice(0, 200),
        Number(body.risk_score || 0), String(body.risk_flags || ""),
        body.captcha_ok ? 1 : 0,
        body.geo && body.geo.lat ? Number(body.geo.lat) : null,
        body.geo && body.geo.lng ? Number(body.geo.lng) : null,
        body.geo && body.geo.acc ? Math.round(Number(body.geo.acc)) : null,
        body.status || "nouvelle", payFee, dType)
    db.prepare("INSERT INTO order_items (order_id, product_id, title, price_cents, qty) VALUES (?, ?, ?, ?, ?)")
      .run(info.lastInsertRowid, product.id,
        qty > 1 ? `${product.title} × ${qty}` : product.title, unit * qty, qty)
    INV.reserve(store.id, [{ productId: product.id, variantId: null, qty }], info.lastInsertRowid)
    return info.lastInsertRowid
  })

  try {
    const orderId = tx()
    return { order: db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) }
  } catch (e) {
    if (e.code === "STOCK") return { error: e.message }
    throw e
  }
}

/* ------------------------------ rendu ------------------------------ */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const dz = (cents) => (Math.round(cents) / 100).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ") + " DZD"

const page = (store, landing, product, opts = {}) => {
  const offers = offersOf(landing, product)
  const best = offers[offers.length - 1]
  const price = offers[0].price
  const compare = landing ? landing.compare_cents : 0
  const benefits = String((landing && landing.benefits) || "")
    .split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6)
  const minutes = landing ? landing.countdown_min : 0
  const wilayas = SHOP.WILAYAS.map((w) =>
    `<option value="${esc(w)}"${w === "Alger" ? " selected" : ""}>${esc(w)}</option>`).join("")
  const reviews = opts.reviews || []
  const error = opts.error || null

  const offerRows = offers.map((o, i) => {
    const per = Math.round(o.price / o.qty)
    const save = compare ? Math.max(0, compare - o.price) : 0
    return `<label class="lp-offer${i === 0 ? " on" : ""}">
      <input type="radio" name="offer" value="${o.qty}" ${i === 0 ? "checked" : ""}>
      <span class="lp-offer-l">${o.qty} ${o.qty > 1 ? "pièces" : "pièce"}</span>
      <span class="lp-offer-p">${dz(o.price)}</span>
      ${o.label ? `<span class="lp-offer-b">${esc(o.label)}</span>` : save > 0 ? `<span class="lp-offer-b">−${dz(save)}</span>` : ""}
      ${o.qty > 1 ? `<span class="lp-offer-u">${dz(per)} l'unité</span>` : ""}
    </label>`
  }).join("")

  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(landing ? landing.title : product.title)} — ${esc(store.name)}</title>
<meta name="description" content="${esc((landing && landing.subtitle) || product.description || "").slice(0, 155)}">
<meta property="og:title" content="${esc(landing ? landing.title : product.title)}">
<meta property="og:image" content="${esc((landing && landing.hero) || product.image || "")}">
<link rel="stylesheet" href="/inter-font.css">
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:#18181B;background:#fff;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
.wrap{max-width:1020px;margin:0 auto;padding:0 16px}
.top{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #E4E4E7}
.brand{font-weight:700;letter-spacing:-.02em;font-size:17px;text-decoration:none;color:#18181B}
.brand span{color:#71717A;font-weight:500}
.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:40px;padding:36px 0 44px}
@media(max-width:820px){.hero{grid-template-columns:1fr;gap:22px;padding:22px 0 30px}}
.hero-img{border-radius:14px;overflow:hidden;background:#FAFAFA;aspect-ratio:1/1}
.hero-img img{width:100%;height:100%;object-fit:cover}
h1{font-size:34px;line-height:1.15;letter-spacing:-.03em;margin:0 0 10px}
@media(max-width:820px){h1{font-size:26px}}
.sub{color:#52525B;font-size:15.5px;line-height:1.55;margin:0 0 18px}
.prices{display:flex;align-items:baseline;gap:12px;margin:0 0 16px}
.p-now{font-size:30px;font-weight:700;letter-spacing:-.03em}
.p-old{color:#A1A1AA;text-decoration:line-through;font-size:16px}
.p-save{background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:600}
.benefits{list-style:none;padding:0;margin:0 0 18px;display:grid;gap:8px}
.benefits li{display:flex;gap:9px;font-size:14.5px;color:#3F3F46;line-height:1.45}
.benefits li:before{content:"";width:16px;height:16px;flex:0 0 16px;margin-top:2px;border-radius:50%;
  background:#18181B url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3'%3E%3Cpath d='M5 12l5 5L20 6'/%3E%3C/svg%3E") center/11px no-repeat}
.count{display:inline-flex;gap:8px;align-items:center;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;
  border-radius:9px;padding:9px 13px;font-size:13.5px;font-weight:600;margin-bottom:16px}
.count b{font-variant-numeric:tabular-nums;font-size:15px}
.offers{display:grid;gap:9px;margin:0 0 16px}
.lp-offer{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"r l p" "r b u";
  gap:2px 10px;align-items:center;border:1.5px solid #E4E4E7;border-radius:11px;padding:11px 13px;cursor:pointer;transition:.15s}
.lp-offer:hover{border-color:#D4D4D8}
.lp-offer.on{border-color:#18181B;background:#FAFAFA}
.lp-offer input{grid-area:r;margin:0;accent-color:#18181B}
.lp-offer-l{grid-area:l;font-weight:600;font-size:14.5px}
.lp-offer-p{grid-area:p;font-weight:700;font-variant-numeric:tabular-nums}
.lp-offer-b{grid-area:b;font-size:12px;color:#15803D;font-weight:600}
.lp-offer-u{grid-area:u;font-size:11.5px;color:#71717A;text-align:right}
form.order{background:#FAFAFA;border:1px solid #E4E4E7;border-radius:14px;padding:18px;margin-top:18px}
@media(max-width:820px){form.order{position:sticky;bottom:0;z-index:5;border-radius:14px 14px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.08);background:#fff}}
form.order h3{margin:0 0 12px;font-size:15.5px}
label.f{display:block;margin-bottom:10px;font-size:12.5px;font-weight:600;color:#3F3F46}
input.f,select.f,textarea.f{width:100%;margin-top:5px;padding:11px 12px;border:1px solid #D4D4D8;border-radius:9px;
  font:inherit;font-size:14.5px;background:#fff;color:#18181B}
input.f:focus,select.f:focus{outline:none;border-color:#18181B;box-shadow:0 0 0 3px rgba(24,24,27,.08)}
.btn{display:block;width:100%;padding:14px;border:0;border-radius:10px;background:#18181B;color:#fff;font:inherit;
  font-weight:600;font-size:15.5px;cursor:pointer;margin-top:6px}
.btn:hover{background:#27272A}
.total{display:flex;justify-content:space-between;font-size:13.5px;color:#52525B;margin:12px 0 2px}
.total b{color:#18181B}
.trust{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:#71717A;margin-top:12px}
.alert{background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:9px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}
.ndz-captcha{margin:10px 0}
.ndz-captcha-note{font-size:11px;color:#A1A1AA;margin-top:6px}
.reviews{padding:34px 0;border-top:1px solid #E4E4E7}
.reviews h2{font-size:18px;margin:0 0 14px;letter-spacing:-.02em}
.rv{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.rv-c{border:1px solid #E4E4E7;border-radius:11px;padding:14px}
.rv-s{color:#F59E0B;font-size:13px;letter-spacing:1px}
.rv-t{font-size:13.5px;color:#3F3F46;line-height:1.5;margin:6px 0}
.rv-n{font-size:12px;color:#A1A1AA}
footer{border-top:1px solid #E4E4E7;padding:18px 0 40px;font-size:12px;color:#A1A1AA;display:flex;gap:14px;flex-wrap:wrap;justify-content:space-between}
footer a{color:#71717A}
</style></head><body>
<div class="wrap">
  <div class="top">
    <a class="brand" href="/${esc(store.slug)}">${esc(store.name)}</a>
    <span style="font-size:12.5px;color:#71717A">Paiement à la livraison</span>
  </div>

  <div class="hero">
    <div class="hero-img">
      ${(landing && landing.hero) || product.image
        ? `<img src="${esc((landing && landing.hero) || product.image)}" alt="${esc(product.title)}">`
        : `<div style="height:100%;display:grid;place-items:center;color:#A1A1AA;font-size:13px">Photo du produit</div>`}
    </div>
    <div>
      <h1>${esc(landing ? landing.title : product.title)}</h1>
      ${(landing && landing.subtitle) || product.description
        ? `<p class="sub">${esc((landing && landing.subtitle) || String(product.description).slice(0, 200))}</p>` : ""}
      <div class="prices">
        <span class="p-now" id="ndzPrice">${dz(price)}</span>
        ${compare > price ? `<span class="p-old">${dz(compare)}</span>` : ""}
        ${compare > price ? `<span class="p-save">−${Math.round((1 - price / compare) * 100)} %</span>` : ""}
      </div>
      ${benefits.length ? `<ul class="benefits">${benefits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      ${minutes ? `<div class="count">Offre valable encore <b id="ndzCount">--:--</b></div>` : ""}

      <div class="offers">${offerRows}</div>

      <form class="order" method="post" action="/${esc(store.slug)}/l/${esc(landing ? landing.slug : "offre")}">
        ${error ? `<div class="alert">${esc(error)}</div>` : ""}
        <h3>Commandez maintenant</h3>
        <input type="hidden" name="qty" id="ndzQty" value="${offers[0].qty}">
        <input type="hidden" name="offer_price" id="ndzOfferPrice" value="${offers[0].price}">
        ${SEC.formFields(store)}
        <label class="f">Nom et prénom
          <input class="f" name="customer_name" required autocomplete="name" placeholder="Amine Benali"></label>
        <label class="f">Téléphone
          <input class="f" name="phone" required inputmode="tel" autocomplete="tel" placeholder="0555 12 34 56"></label>
        <label class="f">E-mail (facultatif)
          <input class="f" name="email" type="email" autocomplete="email" placeholder="vous@exemple.dz"></label>
        <label class="f">Wilaya
          <select class="f" name="wilaya" required>${wilayas}</select></label>
        <label class="f">Adresse complète
          <input class="f" name="address" required autocomplete="street-address" placeholder="Cité, rue, numéro, repère"></label>
        <div class="total"><span>Livraison</span><b id="ndzShip">selon la wilaya</b></div>
        <div class="total"><span>Total à payer</span><b id="ndzTotal">${dz(price)}</b></div>
        <button class="btn" type="submit">Confirmer ma commande</button>
        <div class="trust">
          <span>Paiement à la réception</span><span>Livraison 48 à 72 h</span><span>Échange sous 7 jours</span>
        </div>
      </form>
    </div>
  </div>

  ${reviews.length ? `<div class="reviews"><h2>Avis des clients</h2><div class="rv">${reviews.slice(0, 6).map((r) => `
    <div class="rv-c"><div class="rv-s">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
    <p class="rv-t">${esc(r.body || "")}</p><div class="rv-n">${esc(r.name)}</div></div>`).join("")}</div></div>` : ""}

  <footer>
    <span>${esc(store.name)} · ${esc(store.wilaya || "Algérie")}</span>
    <span><a href="/${esc(store.slug)}">Voir la boutique</a> · <a href="/${esc(store.slug)}/legal">Conditions</a></span>
  </footer>
</div>
${best && offers.length > 1 ? "" : ""}
<script>
(function(){
  var offers = ${JSON.stringify(offers.map((o) => ({ qty: o.qty, price: o.price })))};
  var radios = document.querySelectorAll('input[name="offer"]');
  radios.forEach(function(r){
    r.addEventListener('change', function(){
      document.querySelectorAll('.lp-offer').forEach(function(l){ l.classList.remove('on') });
      r.closest('.lp-offer').classList.add('on');
      var o = offers.filter(function(x){ return x.qty == r.value })[0] || offers[0];
      document.getElementById('ndzQty').value = o.qty;
      document.getElementById('ndzOfferPrice').value = o.price;
      document.getElementById('ndzPrice').textContent = (o.price/100).toLocaleString('fr-FR') + ' DZD';
      var t = document.getElementById('ndzTotal');
      if (t) t.textContent = (o.price/100).toLocaleString('fr-FR') + ' DZD + livraison';
    });
  });
  var mins = ${minutes};
  var box = document.getElementById('ndzCount');
  if (mins > 0 && box) {
    var end = Date.now() + mins * 60000;
    setInterval(function(){
      var s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      var m = Math.floor(s / 60), r = s % 60;
      box.textContent = (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
    }, 1000);
  }
})();
</script>
${SEC.formScripts(store).replace('form[action$="/checkout"]', 'form[action*="/l/"]')}
</body></html>`
}

module.exports = {
  list, get, bySlug, save, remove, countVisit, offersOf, parseOffers,
  createOrder, page, slugify, esc, dz,
}
