"use strict"
/** Vues HTML de la plateforme — design neutre (noir / blanc / gris), aucun emoji. */

const I18N = require("./i18n")
const { icon, initial, mark } = require("./icons")
const { themePicker, THEMES, DEFAULT_THEME } = require("./themes")
const { layoutFor, contentPage, favPage, shipScript, leadForm } = require("./layouts")
const SECTIONS = require("./sections")
const { esc, money, page, LOGO } = require("./ui")
const CARRIERS = require("./carriers")
const DZ = require("./dzship")
const REL = require("./relance")
const ORD = require("./orders")
const GEO = require("./geo")
const PAY = require("./payments")
const CF = require("./checkoutform")
const BADGES = require("./badges")
const HIST = require("./historique")

/* ---- vitrines : une structure complète par thème (voir layouts.js) ---- */
const absolute = (origin, u) => (!u ? "" : /^https?:/i.test(u) ? u : (origin || "") + u)

const parcelEvents = (shipment) => {
  if (!shipment || !shipment.events) return []
  try {
    const rows = JSON.parse(shipment.events)
    return Array.isArray(rows) ? rows.filter((e) => e && (e.label || e.status)) : []
  } catch (_) { return [] }
}

const whenLabel = (ts) => {
  const raw = String(ts || "").trim()
  if (!raw) return ""
  const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z")
  if (Number.isNaN(d.getTime())) return ""
  const p = (n) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const eventList = (rows) => {
  if (!rows.length) return ""
  return `<ol class="track-ev">${rows.map((e, i) => `<li class="${i === rows.length - 1 ? "on" : ""}"><span>${esc(e.label || e.status || "")}</span>${e.at ? `<time>${esc(whenLabel(e.at))}</time>` : ""}</li>`).join("")}</ol>`
}

const parcelCard = (shipment, order) => {
  const number = (shipment && shipment.tracking) || (order && order.tracking) || ""
  if (!number) return ""
  const name = (shipment && (shipment.carrier_name || shipment.carrier_label)) || (order && order.carrier_name) || ""
  const state = shipment && shipment.state && shipment.state !== "envoye" ? shipment.state : ""
  return `<div class="track-parcel">
    <b>${esc(name || "Suivi du colis")}</b>
    <p>Numéro <span class="num">${esc(number)}</span></p>
    ${state ? `<p class="st">${esc(state)}</p>` : ""}
    ${eventList(parcelEvents(shipment))}
  </div>`
}

const storefront = (store, products, cartCount = 0, preview = false, meta = {}) => {
  const L = layoutFor(store.theme)
  const D = require("./sections").readDesign(store)
  /* recherche : dire ce qu'on a trouvé (et permettre d'effacer le filtre),
     sinon le client ne sait pas si la page a compris son mot-clé */
  const searchNote = meta.q
    ? `<div class="wrap"><p class="ndz-search-count">${products.length
      ? `${products.length} résultat${products.length > 1 ? "s" : ""} pour « ${esc(meta.q)} »`
      : `Aucun résultat pour cette recherche.`} · <a href="/${esc(store.slug)}">Tout afficher</a></p></div>`
    : ""
  const home = searchNote + (store.site_kind === "vitrine"
    ? `${L.home(store, products, meta)}${leadForm(store, { sent: meta.sent })}`
    : L.home(store, products, meta))
  const page = meta.q || meta.cat ? { html: home, ownCode: false } : SECTIONS.renderPage(store, "home", home)
  return L.shell(store, page.html, {
    cartCount, preview, ownCode: page.ownCode,
    seo: {
      description: store.tagline || store.about || `${store.name} — boutique en ligne, paiement à la livraison.`,
      image: absolute(meta.origin, D.logo || (products[0] && products[0].image)),
      url: meta.origin ? `${meta.origin}/${store.slug}` : "",
      type: "website",
      jsonld: {
        "@context": "https://schema.org", "@type": "Store",
        name: store.name, description: store.tagline || store.about || "",
        url: meta.origin ? `${meta.origin}/${store.slug}` : undefined,
        telephone: store.phone || undefined,
        address: { "@type": "PostalAddress", addressCountry: "DZ", addressRegion: store.wilaya || undefined },
      },
    },
  })
}


/** Sections propres à une page (produit, panier, compte, CGV…). */
const pageSections = (store, page, products = []) => {
  const SECTIONS = require("./sections")
  const list = SECTIONS.readSections(store, page)
  if (!list.length) return ""
  return SECTIONS.renderSections(store, list, { products, design: SECTIONS.readDesign(store) })
}

const productPage = (store, p, cartCount = 0, related = [], extra = {}) => {
  const L = layoutFor(store.theme)
  const imgs = [p.image, ...(extra.gallery || []).map((g) => g.url)].filter(Boolean)
  const buy = L.product(store, p, related, extra)
  const productBody = SECTIONS.renderPage(store, "product", buy + pageSections(store, "product", [p, ...(related || [])]), { achat: buy })
  return L.shell(store, productBody.html, {
    cartCount, title: p.title, preview: !!extra.preview, productId: p.id, ownCode: productBody.ownCode,
    seo: {
      description: p.description || `${p.title} — ${store.name}`,
      image: absolute(extra.origin, p.image),
      url: extra.origin ? `${extra.origin}/${store.slug}/p/${p.id}` : "",
      type: "product",
      jsonld: {
        "@context": "https://schema.org", "@type": "Product",
        name: p.title, description: p.description || "",
        image: imgs.slice(0, 4).map((u) => absolute(extra.origin, u)),
        sku: String(p.id),
        brand: { "@type": "Brand", name: store.name },
        offers: {
          "@type": "Offer", price: (p.price_cents / 100).toFixed(2),
          priceCurrency: store.currency || "DZD",
          availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: extra.origin ? `${extra.origin}/${store.slug}/p/${p.id}` : "",
        },
      },
    },
  })
}
const cartPage = (store, items, totals, cartCount = 0, promoMsg = null, preview = false) => {
  const L = layoutFor(store.theme)
  const cartHtml = L.cart(store, items, totals, promoMsg)
  const cartBody = SECTIONS.renderPage(store, "cart", cartHtml + pageSections(store, "cart", []), { panier: cartHtml })
  return L.shell(store, cartBody.html, { cartCount, title: "Panier", preview, ownCode: cartBody.ownCode })
}
const checkoutPage = (store, items, totals, cartCount = 0, error = null, extra = {}) => {
  const L = layoutFor(store.theme)
  const form = L.checkout(store, items, totals, error, extra)
  const orderBody = SECTIONS.renderPage(store, "checkout", form + pageSections(store, "checkout", items), { formulaire: form })
  const html = L.shell(store, orderBody.html, { cartCount, title: "Commande", preview: !!extra.preview, ownCode: orderBody.ownCode })
  /* le formulaire de commande est reconnu par son action, quel que soit le thème */
  const body = error
    ? html.replace('<form class="mn-form" method="post" action="', '<form class="mn-form ndz-co" data-ndz-checkout method="post" action="')
        .replace(/<form([^>]*action="[^"]*\/checkout"[^>]*)>/g, (m, a) => (m.includes("ndz-co") ? m : `<form${a.replace(/\s*$/, "")} data-ndz-checkout>`))
    : html
  /* anti-fausses commandes : position + CAPTCHA + champs cachés, sur les 4 thèmes */
  const capture = `<script>
  (function () {
    var form = document.querySelector("form.checkout-form") || document.querySelector("form[action$='/checkout']")
    if (!form || !window.fetch) return
    var sent = 0
    var send = function () {
      if (Date.now() - sent < 4000) return
      sent = Date.now()
      var data = {
        name: (form.customer_name || {}).value || "",
        phone: (form.phone || {}).value || "",
        wilaya: (form.wilaya || {}).value || "",
        address: (form.address || {}).value || ""
      }
      if (!data.name && !data.phone) return
      fetch(${JSON.stringify("/" + store.slug + "/panier/contact")}, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data), keepalive: true
      }).catch(function () {})
    }
    ;["customer_name", "phone", "wilaya", "address"].forEach(function (n) {
      var el = form[n]
      if (!el) return
      el.addEventListener("blur", send)
      el.addEventListener("change", send)
    })
  })()
</script>`
  return require("./security").injectCheckout(
    body.replace("</body>", shipScript(store, totals) + payScript(store) + capture + "</body>"), store)
}

/**
 * Le client change de moyen de paiement → on ajoute les frais éventuels au total,
 * sans recharger la page. Base du total stockée dans data-base (centimes).
 */
const payScript = (store) => `<script>
(function () {
  var cur = ${JSON.stringify(store.currency || "DZD")}
  var fmt = function (c) {
    return (c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur
  }
  var rows = document.querySelectorAll("[data-payrow]")
  if (!rows.length) return
  var totalEl = document.querySelector("[data-total]")
  var base = totalEl ? Number(totalEl.getAttribute("data-base") || 0) : 0
  var feeEls = document.querySelectorAll('[name="payment"]')
  var apply = function () {
    var fee = 0
    feeEls.forEach(function (el) {
      if (el.type === "radio") { if (el.checked) fee = Number(el.getAttribute("data-fee") || 0) }
      else fee = Number(el.getAttribute("data-fee") || 0)
    })
    rows.forEach(function (row) {
      row.style.display = fee > 0 ? "flex" : "none"
      var cell = row.querySelector("[data-payfee]")
      if (cell) cell.textContent = fee > 0 ? fmt(fee) : ""
    })
    if (totalEl) totalEl.textContent = fmt(base + fee)
  }
  feeEls.forEach(function (el) { el.addEventListener("change", apply) })
  apply()
})()
</script>`
const orderDone = (store, order, opts = {}) => {
  const L = layoutFor(store.theme)
  let html = L.shell(store, L.done(store, order, opts), { title: "Commande confirmée" })
  const wa = String(store.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "213")
  const next = `
<div class="done-next">
  <p><b>Et maintenant ?</b> La boutique va vous appeler pour confirmer. Vous payez seulement quand vous recevez le colis.</p>
  <div class="done-next-actions">
    <a class="btn btn-primary" href="/${esc(store.slug)}/order/${esc(order.ref)}">Suivre ma commande</a>
    <a class="btn btn-ghost" href="/${esc(store.slug)}/order/${esc(order.ref)}/invoice">Facture</a>
    ${wa ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(
      `Bonjour, je viens de passer la commande ${order.ref} sur ${store.name}.`)}">Écrire à la boutique</a>` : ""}
  </div>
</div>`
  if (html.includes("</h1>")) html = html.replace("</h1>", "</h1>" + next)
  else html = html.replace("</body>", next + "</body>")
  return html.replace("</body>", (opts.pixel || "") + "</body>")
}


/* ============================== AUTH (login / inscription) ============================== */
const authBolt = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-14h-7l1-6z"/></svg>`
const authCart = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.1 6.1h.55l.35 1.35h10.7a1.05 1.05 0 0 1 1.02 1.3l-1.25 4.7a1.7 1.7 0 0 1-1.64 1.25H9.55a1.7 1.7 0 0 1-1.64-1.25L6.85 6.1H4.35a1.05 1.05 0 1 1 0-2.1h2.85c.46 0 .86.3.99.74l.2 1.36z"/><circle cx="10.15" cy="18.55" r="1.55"/><circle cx="16.35" cy="18.55" r="1.55"/></svg>`

const authPage = (mode, error, kind = "", site = "") => {
  const signup = mode === "signup"
  const picked = kind === "commerce" ? "commerce" : kind === "vitrine" ? "vitrine" : ""
  return page(signup ? "Créer un site — NovaDZ" : "Connexion — NovaDZ", `
<div class="auth-stage">
  <div class="auth-bg" aria-hidden="true"></div>
  <div class="auth-veil" aria-hidden="true"></div>
  <div class="auth-nav">
    <a class="auth-brand" href="/"><span class="auth-bolt">${authBolt}</span><b>templifica</b> <em>/ Création de site</em></a>
    <div class="auth-nav-links">
      <a href="/">Accueil</a>
      <a class="auth-pill" href="${signup ? "/login" : "/signup"}">${authBolt} ${signup ? "Se connecter" : "Créer un site"}</a>
    </div>
  </div>
  <div class="auth-mix">
    <section class="auth-pitch">
      <p class="auth-kicker">${signup
        ? `Tu es <span class="auth-spin"><b>un architecte.</b><b>un avocat.</b><b>un restaurateur.</b><b>un coach.</b><b>un photographe.</b><b>un artisan.</b><b>un médecin.</b><b>un pharmacien.</b><b>un formateur.</b><b>un hôtelier.</b><b>un architecte.</b></span>`
        : `Pas besoin d'un <b>freelance.</b>`}</p>
      <h1>${signup ? "Crée ton site." : "Bon retour."}</h1>
      <p>${signup
        ? "Une vitrine, ou même une boutique. 0 DA pour ouvrir."
        : "Connecte-toi. Ta vitrine, tes commandes, les 48 wilayas."}</p>
      <div class="auth-kinds">
        <div>
          <b><i>${authBolt}</i>Vitrine</b>
          <ul>
            <li>Une vitrine à ton nom, en 2 minutes</li>
            <li>Services, portfolio, prise de contact</li>
          </ul>
        </div>
        <div>
          <b><i>${authCart}</i>E-commerce</b>
          <ul>
            <li>Catalogue, panier, dinars</li>
            <li>Wilayas et paiement à la livraison</li>
          </ul>
        </div>
      </div>
    </section>
    <div class="auth-card">
      <h2>${signup ? "Crée ton site." : "Se connecter"}</h2>
      <p class="muted">${signup ? "0 DA pour ouvrir. Pas de carte." : "Connectez-vous pour gérer vos ventes."}</p>
      ${error ? `<div class="alert">${esc(error)}</div>` : ""}
      ${signup ? `<div class="auth-choice">
          <label class="auth-pick"><input type="radio" name="show" value="vitrine" ${picked === "vitrine" ? "checked" : ""}><i>${authBolt}</i>Vitrine</label>
          <label class="auth-pick"><input type="radio" name="show" value="commerce" ${picked === "commerce" ? "checked" : ""}><i>${authCart}</i>E-commerce</label>
        </div>
        <form class="auth-pane pane-vitrine" method="post" action="/signup">
          <input type="hidden" name="kind" value="vitrine">
          <input type="hidden" name="site" value="${esc(site)}">
          <p class="auth-mode"><i></i>Vitrine</p>
          <label>Nom de la marque<input name="store" required placeholder="Atelier Lina"></label>
          <label>Votre nom<input name="name" required placeholder="Amine Benali"></label>
          <label>E-mail<input type="email" name="email" required placeholder="vous@exemple.dz" autocomplete="email"></label>
          <label>Mot de passe<input type="password" name="password" required placeholder="6 caractères minimum" autocomplete="new-password"></label>
          <label>Mot de passe<input type="password" name="password2" required placeholder="le même mot de passe" autocomplete="new-password"></label>
          <button class="btn btn-primary btn-block" type="submit">Créer</button>
        </form>
        <form class="auth-pane pane-commerce" method="post" action="/signup">
          <input type="hidden" name="kind" value="commerce">
          <input type="hidden" name="site" value="${esc(site)}">
          <p class="auth-mode"><i></i>E-commerce</p>
          <label>Nom de la boutique<input name="store" required placeholder="Amina Mode"></label>
          <label>Votre nom<input name="name" required placeholder="Amine Benali"></label>
          <label>E-mail<input type="email" name="email" required placeholder="vous@exemple.dz" autocomplete="email"></label>
          <label>Mot de passe<input type="password" name="password" required placeholder="6 caractères minimum" autocomplete="new-password"></label>
          <label>Mot de passe<input type="password" name="password2" required placeholder="le même mot de passe" autocomplete="new-password"></label>
          <button class="btn btn-primary btn-block" type="submit">Créer</button>
        </form>` : `<form method="post" action="/login">
        <label>E-mail ou identifiant<input type="text" name="email" required placeholder="e-mail ou madame-sara" autocomplete="username"></label>
        <label>Mot de passe<input type="password" name="password" required placeholder="6 caractères minimum"></label>
        <button class="btn btn-primary btn-block">Se connecter</button>
      </form>`}
      <p class="auth-alt">${signup
        ? `Vous avez déjà un compte ? <a href="/login">Se connecter</a>`
        : `Pas encore de boutique ? <a href="/signup">En créer une</a>`}</p>
      ${process.env.NOVADZ_DEMO === "1" ? `<div class="auth-demo">
        <b>Comptes de démo</b>
        <span>Marchand · demo@novadz.dz / demo1234</span>
        <span>Admin · admin@novadz.dz / admin1234</span>
      </div>` : ""}
    </div>
  </div>
</div>
`, { bodyClass: "auth-body" })
}

const welcomePage = (user, store, error) => {
  const GEO = require("./geo")
  const admin = user.role === "admin"
  const wilaya = store && store.wilaya || ""
  const options = GEO.WILAYAS.map((w) => `<option ${w === wilaya ? "selected" : ""}>${esc(w)}</option>`).join("")
  return page("Tes infos — NovaDZ", `
<div class="auth-stage">
  <div class="auth-bg" aria-hidden="true"></div>
  <div class="auth-veil" aria-hidden="true"></div>
  <div class="auth-nav">
    <a class="auth-brand" href="/"><span class="auth-bolt">${authBolt}</span><b>templifica</b> <em>/ Création de site</em></a>
    <div class="auth-nav-links">
      <a href="/">Accueil</a>
      <a class="auth-pill" href="/logout">${authBolt} Déconnexion</a>
    </div>
  </div>
  <div class="auth-mix">
    <section class="auth-pitch">
      <p class="auth-kicker">Encore un peu.</p>
      <h1>Ton contact.</h1>
      <p>Téléphone, wilaya, adresse. Puis tu ouvres la boutique.</p>
    </section>
    <div class="auth-card">
      <h2>${admin && !store ? "Admin" : "Tes infos"}</h2>
      <p class="muted">${admin && !store ? "Tu ouvres l'admin." : "Ce qu'il faut pour te joindre."}</p>
      ${error ? `<div class="alert">${esc(error)}</div>` : ""}
      ${store ? `<form method="post" action="/welcome">

        <label>Téléphone<input name="phone" required value="${esc(store.phone || "")}" placeholder="0555 12 34 56" inputmode="tel" autocomplete="tel"></label>
        <label>WhatsApp<input name="whatsapp" value="${esc(store.whatsapp || "")}" placeholder="0555 12 34 56" inputmode="tel" autocomplete="tel"></label>
        <label>Wilaya
          <select name="wilaya" required>
            <option value="" ${wilaya ? "" : "selected"} disabled>Choisir</option>
            ${options}
          </select>
        </label>
        <label>Adresse<input name="address" value="${esc(store.legal_address || "")}" placeholder="12 rue Didouche, Alger" autocomplete="street-address"></label>
        <button class="btn btn-primary btn-block" type="submit">Ouvrir la boutique</button>
      </form>` : `<a class="btn btn-primary btn-block" href="${admin ? "/admin" : "/dashboard"}">${admin ? "Ouvrir l'admin" : "Ouvrir la boutique"}</a>`}
    </div>
  </div>
</div>`, { bodyClass: "auth-body" })
}

/* Confirmation de déconnexion : la vraie déconnexion est en POST,
   pour qu'un lien ou une image d'un autre site ne puisse pas la déclencher. */
const logoutPage = (user) => page("Déconnexion — NovaDZ", `
<div class="auth-stage">
  <div class="auth-bg" aria-hidden="true"></div>
  <div class="auth-veil" aria-hidden="true"></div>
  <div class="auth-nav">
    <a class="auth-brand" href="/"><span class="auth-bolt">${authBolt}</span><b>templifica</b> <em>/ Création de site</em></a>
    <div class="auth-nav-links">
      <a href="/">Accueil</a>
      <a class="auth-pill" href="/dashboard">${authBolt} Ma boutique</a>
    </div>
  </div>
  <div class="auth-mix">
    <section class="auth-pitch">
      <p class="auth-kicker">À bientôt.</p>
      <h1>Se déconnecter ?</h1>
      <p>${esc(user.name || user.email || "")} — ta boutique reste en ligne, évidemment.</p>
    </section>
    <div class="auth-card">
      <h2>Déconnexion</h2>
      <p class="muted">Tu pourras te reconnecter à tout moment.</p>
      <form method="post" action="/logout">
        <button class="btn btn-primary btn-block" type="submit">Oui, me déconnecter</button>
      </form>
      <p class="auth-alt"><a href="/dashboard">Non, retour à ma boutique</a></p>
    </div>
  </div>
</div>`, { bodyClass: "auth-body" })

/* ======================================================================
   ÉDITEUR DE BOUTIQUE — sections déplaçables (drag & drop)
   ====================================================================== */
const dashDesign = (user, store, themeName, products = [], pages = [], meta = {}) => {
  const THEMES = require("./public-themes").present(require("./themes").THEMES)
  const { TYPES, readSections, readDesign, readNav, FONT_LIST, FONTS } = require("./sections")
  const sections = readSections(store)
  const sectionsByPage = require("./sections").readSectionsAll(store)
  const design = readDesign(store)
  const nav = readNav(store)

  const types = Object.entries(TYPES).map(([id, t]) => ({
    id, name: t.name, desc: t.desc, defaults: t.defaults,
  }))
  const fields = Object.fromEntries(Object.entries(TYPES).map(([id, t]) => [id, t.fields]))
  const blocks = Object.fromEntries(
    Object.entries(TYPES).filter(([, t]) => t.blocks).map(([id, t]) => [id, {
      name: t.blocks.name, max: t.blocks.max, min: t.blocks.min || 1,
      fields: t.blocks.fields, defaults: t.blocks.defaults || {},
    }])
  )
  const firstProduct = products && products.length ? products[0].id : null
  const slug = store.slug
  const pv = (path, key, label) => ({ key, label, url: `/${slug}${path}${path.indexOf("?") === -1 ? "?" : "&"}preview=1&editor=1` })
  const previewPages = [
    pv("", "home", "Accueil"),
    firstProduct ? pv("/p/" + firstProduct, "product", "Fiche produit") : null,
    pv("/cart", "cart", "Panier"),
    pv("/checkout", "checkout", "Page de commande"),
    pv("/legal", "legal", "CGV / mentions légales"),
    pv("/account", "account", "Compte client"),
    ...(pages || []).map((p) => pv("/page/" + p.slug, "page:" + p.slug, p.title || "Page")),
  ].filter(Boolean)

  const data = {
    slug: store.slug, storeName: store.name, sections, sectionsByPage, types, fields, blocks,
    design, nav, products: products.map((p) => ({ id: p.id, title: p.title })), pages,
    fonts: FONT_LIST,
    fontMeta: Object.fromEntries(Object.entries(FONTS).map(([id, f]) => [id, { stack: f.stack, google: f.google || "" }])),
    previewPages,
  }

  const draftTheme = (require("./sections").readDraft(store) || {}).theme
  const trialTheme = draftTheme && draftTheme !== store.theme ? draftTheme : ""
  const trialName = trialTheme ? (THEMES.find((t) => t.id === trialTheme) || {}).name || trialTheme : ""
  data.themes = THEMES.map((t) => ({
    id: t.id, name: t.name, desc: t.desc, ideal: t.ideal, dots: t.dots, tag: t.tag,
  }))
  data.currentTheme = trialTheme || store.theme
  data.publishedTheme = store.theme

  return page(`Design — ${store.name}`, `
<script>window.ED_DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};</script>
<script src="/editor.js" defer></script>
<div class="ed-app">
  <header class="ed-top">
    <div class="ed-top-left">
      <a class="ed-back" href="/dashboard" title="Tableau de bord" aria-label="Retour au tableau de bord">${icon("arrowLeft", 16)}</a>
      <div class="ed-title"><b>Design</b><span>${esc(themeName)} · /${esc(store.slug)}</span></div>
    </div>

    <div class="ed-top-mid">
      <div class="ed-group">
        <button class="ed-tool" id="edUndo" type="button" title="Annuler (Ctrl+Z)" aria-label="Annuler">${icon("undo", 16)}</button>
        <button class="ed-tool" id="edRedo" type="button" title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir">${icon("redo", 16)}</button>
      </div>
      <div class="ed-devices" role="group" aria-label="Taille de l'aperçu">
        <button class="ed-tool on" data-device="desktop" type="button" title="Ordinateur" aria-label="Ordinateur">${icon("monitor", 16)}</button>
        <button class="ed-tool" data-device="tablet" type="button" title="Tablette" aria-label="Tablette">${icon("tablet", 16)}</button>
        <button class="ed-tool" data-device="mobile" type="button" title="Mobile" aria-label="Mobile">${icon("smartphone", 16)}</button>
      </div>
      <span class="ed-pagepick" title="Page à modifier">
        ${icon("layers", 15)}
        <select id="edPageSelect" aria-label="Page à modifier">
          ${previewPages.map((p) => `<option value="${esc(p.key)}">${esc(p.label)}</option>`).join("")}
        </select>
      </span>
      <button type="button" class="ed-tool" id="edPageCss" title="CSS de cette page" aria-label="CSS de cette page">${icon("code", 16)}</button>
      <button type="button" class="ed-tool ed-tool-text" id="edPageCode" title="Code HTML de cette page" aria-label="Code HTML de cette page">Code</button>
      <button type="button" class="ed-tool ed-tool-text" id="edAiOpen" title="Créer la page avec les sections déjà là">IA</button>
      <label class="ed-outline"><input type="checkbox" id="edOutline" checked> Contours</label>
      <span class="ed-pickhint" id="edPickHint">${icon("edit", 13)} Clique dans l'aperçu : ça ouvre le bon réglage</span>
    </div>

    <div class="ed-top-right">
      <button type="button" class="ed-tool ed-tool-text" id="edTextMode" aria-pressed="false" title="Régler la taille d'un texte" aria-label="Taille du texte">Taille</button>
      <button type="button" class="ed-tool ed-rail-toggle" id="edRailToggle" aria-pressed="true" title="Afficher ou cacher les réglages" aria-label="Afficher ou cacher les réglages">${icon("menu", 16)}</button>
      <span class="ed-save ok" id="edSave">Enregistré</span>
      <span class="ed-pub ${meta.dirty ? "dirty" : "live"}" id="edPubState">${meta.dirty ? "Brouillon" : "En ligne"}</span>
      <details class="ed-more">
        <summary class="ed-tool" title="Plus d'actions" aria-label="Plus d'actions">${icon("menuDots", 16)}</summary>
        <div class="ed-more-menu">
          <a href="/dashboard/design/themes">${icon("palette", 15)} Changer de thème</a>
          <button type="button" id="edSaveTpl">${icon("copy", 15)} Enregistrer comme template</button>
          <button type="button" id="edNavToggle">${icon("nav", 15)} Modifier la navigation</button>
          <button type="button" id="edHistory">${icon("history", 15)} Historique des publications</button>
          <button type="button" id="edReset">${icon("reset", 15)} Réinitialiser le design</button>
        </div>
      </details>
      <a class="ed-btn" href="/${esc(store.slug)}?preview=1" target="_blank" rel="noopener">${icon("eye", 15)} Voir</a>
      <button class="ed-btn ed-btn-primary" id="edPublish" type="button">Publier</button>
    </div>
  </header>

  ${meta.template ? `<div class="ed-trial"><span>Template chargé en brouillon. Tes clients ne le voient pas tant que tu n'as pas publié.</span></div>` : ""}
  ${trialTheme ? `<div class="ed-trial">
    <span>Thème d'essai : <b>${esc(trialName)}</b> — visible seulement dans l'aperçu.</span>
    <span class="sp"></span>
    <button type="button" class="primary" onclick="document.getElementById('edPublish').click()">Publier ce thème</button>
    <form method="post" action="/dashboard/design/theme/cancel" class="inline"><button type="submit">Annuler</button></form>
  </div>` : ""}

  <div class="ed-main">
    <aside class="ed-rail-wrap">
      <div class="ed-rail" id="edRail"></div>
      <div class="ed-navpanel" id="edNavPanel">
        <div class="ed-navpanel-head">Navigation de l'en-tête</div>
        <div id="edNavBody"></div>
        <button type="button" class="ed-addblock" id="edAddNav">+ Ajouter un lien</button>
        <p class="ed-hint">Adresse vide = accueil. Sinon <b>page/a-propos</b>, <b>cart</b> ou une URL complète.</p>
      </div>
    </aside>
    <main class="ed-canvas">
      <div class="ed-frame-box" id="edFrameBox">
        <iframe id="edFrame" src="/${esc(store.slug)}?preview=1&amp;editor=1" title="Aperçu de la boutique"></iframe>
      </div>
    </main>
  </div>

  <div class="ed-tsize" id="edTsize" hidden>
    <div class="ed-tsize-top">
      <b>Taille du texte</b>
      <span id="edTsizeLabel">Clique un texte dans l'aperçu.</span>
      <button type="button" id="edTsizeX" aria-label="Fermer">✕</button>
    </div>
    <p class="ed-tsize-hint" id="edTsizeHint">0 le cache. 100 est la plus grande. Le chiffre du milieu est la taille exacte.</p>
    <div class="ed-tsize-row" id="edTsizeControls">
      <button type="button" data-tsz="0">0</button>
      <input type="range" id="edTsizeRange" min="0" max="100" step="1" value="16" aria-label="Taille de 0 à 100">
      <button type="button" data-tsz="100">100</button>
      <label class="ed-tsize-num">Exact <input type="number" id="edTsizeNum" min="0" max="100" step="1" value="16" inputmode="numeric"></label>
      <button type="button" id="edTsizeAuto">Auto</button>
    </div>
  </div>

  <div class="ed-modal" id="edModal">
    <div class="ed-modal-card">
      <div class="ed-modal-head"><div><h3>Ajouter une section</h3>
        <p>Choisis un bloc : il s'ajoute à ta page et tu le modifies tout de suite.</p></div>
        <button class="ed-x" id="edModalX" type="button">✕</button></div>
      <div class="ed-palette" id="edPalette"></div>
    </div>
  </div>

  <div class="ed-modal" id="edTplModal">
    <div class="ed-modal-card narrow">
      <div class="ed-modal-head"><div><h3>Enregistrer comme template</h3>
        <p>La boutique telle qu'elle est maintenant est gardée. Rien n'est publié.</p></div>
        <button class="ed-x" id="edTplX" type="button" aria-label="Fermer">✕</button></div>
      <label class="ed-tpl-name">Nom<input id="edTplName" maxlength="40" placeholder="Boutique Ramadan" autocomplete="off"></label>
      <p class="ed-hint" id="edTplErr" hidden></p>
      <div class="ed-code-actions"><button type="button" class="ed-btn ed-btn-primary" id="edTplSave">Enregistrer</button></div>
    </div>
  </div>

  <div class="ed-modal" id="edCodeModal">
    <div class="ed-modal-card ed-codepage">
      <div class="ed-modal-head"><div><h3 id="edCodeTitle">Code de la page</h3>
        <p>Le chemin simple, c'est l'affichage : tu glisses un bloc ou tu en ajoutes un, et ce code se range tout seul, bloc par bloc. Enregistrer un code à la main le fige jusqu'à « Revenir au thème ». Logo, formulaire, panier et achat restent des racines Nova.</p></div>
        <button class="ed-x" id="edCodeX" type="button" aria-label="Fermer">✕</button></div>
      <div class="ed-vars" id="edVars"></div>
      <textarea id="edCodeBox" spellcheck="false" placeholder="Chargement du code de la page…"></textarea>
      <p class="ed-hint">Si le formulaire, le panier ou l'achat disparaissent du code, Nova les remet pour que la commande continue. Les pages de vente publicitaires se règlent dans Pages de vente.</p>
      <div class="ed-code-actions">
        <button type="button" class="ed-btn" id="edCodeStarter">Insérer le modèle</button>
        <button type="button" class="ed-btn" id="edCodeClear">Revenir au thème</button>
        <button type="button" class="ed-btn ed-btn-primary" id="edCodeSave">Enregistrer ce code</button>
      </div>
    </div>
  </div>

  <div class="ed-modal" id="edHistModal">
    <div class="ed-modal-card narrow">
      <div class="ed-modal-head"><h3>Versions publiées</h3><button class="ed-x" id="edHistX" type="button">✕</button></div>
      <div class="ed-hist" id="edHistList">Chargement…</div>
    </div>
  </div>

  <div class="ed-modal" id="edAi">
    <div class="ed-modal-card">
      <div class="ed-modal-head"><h3>Créer avec les sections déjà là</h3><button class="ed-x" id="edAiX" type="button">✕</button></div>
      <p class="ed-hint">Décris la boutique. L'IA ne pose que des thèmes, des sections et des réglages qui existent déjà. Elle enregistre un brouillon. Elle ne publie pas.</p>
      <textarea id="edAiPrompt" rows="5" maxlength="800" placeholder="Grille de produits, bandeau de livraison, titre à gauche. Un brouillon, rien n'est publié."></textarea>
      <p class="ed-hint" id="edAiOut"></p>
      <div class="ed-code-actions">
        <button type="button" class="ed-btn ed-btn-primary" id="edAiGo">Poser le brouillon</button>
        <button type="button" class="ed-btn" id="edAiClose">Fermer</button>
      </div>
    </div>
  </div>
  <script>
  (function () {
    var open = document.getElementById("edAiOpen")
    var modal = document.getElementById("edAi")
    var go = document.getElementById("edAiGo")
    var out = document.getElementById("edAiOut")
    function close() { if (modal) modal.classList.remove("open") }
    if (open && modal) open.addEventListener("click", function () { modal.classList.add("open") })
    var x = document.getElementById("edAiX")
    if (x) x.addEventListener("click", close)
    var c = document.getElementById("edAiClose")
    if (c) c.addEventListener("click", close)
    if (go) go.addEventListener("click", function () {
      var prompt = (document.getElementById("edAiPrompt") || {}).value || ""
      go.disabled = true
      out.textContent = "Je pose les sections…"
      fetch("/dashboard/assistant/site", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ prompt: prompt })
      }).then(function (r) { return r.json() }).then(function (d) {
        go.disabled = false
        if (!d || !d.ok) { out.textContent = (d && d.error) || "Impossible."; return }
        out.textContent = d.summary || "Brouillon posé."
        setTimeout(function () { location.href = "/dashboard/design?ia=1" }, 700)
      }).catch(function () { go.disabled = false; out.textContent = "Impossible pour le moment." })
    })
  })()
  </script>
</div>`)
}


/* ============================== PAGES ============================== */
const dashPages = (user, store, pages) => dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Pages</h1><p class="muted">${store.site_kind === "vitrine" ? "À propos, services, portfolio." : "À propos, Contact, conditions de vente…"}</p></div>
  <a class="btn btn-primary" href="/dashboard/pages/new">${icon("plus", 15)} Nouvelle page</a>
</header>
<section class="panel">
  ${pages.length ? `<table class="table">
    <thead><tr><th>Titre</th><th>Adresse</th><th>Statut</th><th></th></tr></thead>
    <tbody>${pages.map((pg) => `<tr>
      <td><b>${esc(pg.title)}</b></td>
      <td><a class="link" target="_blank" href="/${esc(store.slug)}/page/${esc(pg.slug)}">/${esc(store.slug)}/page/${esc(pg.slug)}</a></td>
      <td>${pg.published ? '<span class="pill ok">En ligne</span>' : '<span class="pill">Brouillon</span>'}</td>
      <td class="right">
        <a class="btn btn-ghost btn-sm" href="/dashboard/pages/${pg.id}">Modifier</a>
        <form method="post" action="/dashboard/pages/${pg.id}/delete" class="inline">
          <button class="link-danger">Supprimer</button>
        </form>
      </td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("receipt", 22)}<h3>Aucune page</h3>
  <p>Créez « À propos », « Livraison » ou « Conditions de vente » pour rassurer vos clients.</p>
  <a class="btn btn-primary" href="/dashboard/pages/new">Créer une page</a></div>`}
</section>`, "pages")

const pageForm = (user, store, page, error) => dashLayout(user, store, `
<script>window.ED_NAV = ${JSON.stringify({ pages: [] })};</script>
<header class="dash-head"><div><h1>${page ? "Modifier la page" : "Nouvelle page"}</h1>
<p class="muted">Elle sera accessible à l'adresse /${esc(store.slug)}/page/…</p></div>
<a class="btn btn-ghost" href="/dashboard/pages">${icon("arrowLeft", 15)} Retour</a></header>
${error ? `<div class="alert">${esc(error)}</div>` : ""}
<form class="panel form" method="post" action="${page ? `/dashboard/pages/${page.id}` : "/dashboard/pages"}">
  <label>Titre<input name="title" required value="${esc(page?.title || "")}" placeholder="À propos de la boutique" id="pgTitle"></label>
  <label>Adresse (slug)<input name="slug" value="${esc(page?.slug || "")}" placeholder="a-propos" id="pgSlug"></label>
  <label>Contenu<textarea name="body" rows="12" placeholder="Deux paragraphes, séparés par une ligne vide.">${esc(page?.body || "")}</textarea></label>
  <label class="check"><input type="checkbox" name="published" ${!page || page.published ? "checked" : ""}> Publier la page</label>
  <div class="form-actions">
    <button class="btn btn-primary">${page ? "Enregistrer" : "Créer la page"}</button>
    <a class="btn btn-ghost" href="/dashboard/pages">Annuler</a>
  </div>
</form>
<script>
(function(){
  var t = document.getElementById('pgTitle'), s = document.getElementById('pgSlug');
  var manual = s.value.length > 0;
  s.addEventListener('input', function(){ manual = true });
  t.addEventListener('input', function(){
    if (manual) return;
    s.value = t.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
  });
})();
</script>`, "pages")

/* ============================== CODES PROMO ============================== */
const dashDiscounts = (user, store, list, products = []) => dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Codes promo</h1><p class="muted">Remises appliquées au panier par vos clients.</p></div>
</header>
<section class="panel">
  <form class="promo-form" method="post" action="/dashboard/discounts">
    <div class="promo-row">
      <label>Code<input name="code" required placeholder="WELCOME10" maxlength="24" style="text-transform:uppercase"></label>
      <label>Type
        <select name="kind">
          <option value="percent">Pourcentage (%)</option>
          <option value="amount">Montant fixe (${esc(store.currency)})</option>
        </select>
      </label>
      <label>Valeur<input name="value" type="number" min="1" step="1" required placeholder="10"></label>
      <label>Panier minimum<input name="min" type="number" min="0" step="1" placeholder="0"></label>
      <label>Utilisations max<input name="max" type="number" min="0" step="1" placeholder="0 = illimité"></label>
      <label>Produit concerné
        <select name="product_id"><option value="0">Tout le panier</option>
          ${products.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join("")}
        </select>
      </label>
      <button class="btn btn-primary">Créer</button>
    </div>
  </form>

  ${list.length ? `<table class="table">
    <thead><tr><th>Code</th><th>Remise</th><th>Minimum</th><th>Utilisé</th><th>Statut</th><th></th></tr></thead>
    <tbody>${list.map((d) => `<tr>
      <td><b class="mono">${esc(d.code)}</b></td>
      <td>${d.kind === "percent" ? `${d.value} %` : money(d.value * 100, store.currency)}</td>
      <td>${d.min_subtotal_cents ? money(d.min_subtotal_cents, store.currency) : "—"}${d.product_id ? `<br><small class="muted">1 produit</small>` : ""}</td>
      <td>${d.uses}${d.max_uses ? ` / ${d.max_uses}` : ""}</td>
      <td>${d.active ? '<span class="pill ok">Actif</span>' : '<span class="pill">Inactif</span>'}</td>
      <td class="right">
        <form method="post" action="/dashboard/discounts/${d.id}/toggle" class="inline"><button class="btn btn-ghost btn-sm">${d.active ? "Désactiver" : "Activer"}</button></form>
        <form method="post" action="/dashboard/discounts/${d.id}/delete" class="inline"><button class="link-danger">Supprimer</button></form>
      </td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("cash", 22)}<h3>Aucun code promo</h3>
  <p>Un code de bienvenue de 10 % convertit souvent mieux qu'une remise affichée partout.</p></div>`}
</section>`, "promos")

/* ============================== DÉTAIL COMMANDE ============================== */

/**
 * Modifier une commande : toutes les infos client, les articles (ajouter, retirer,
 * changer la quantité et le tarif) et les frais de livraison. Le total se recalcule.
 */
const orderEditPanel = (store, order, items, products) => {
  const rows = items.map((it) => ({
    product_id: it.product_id || "", variant_id: it.variant_id || "",
    title: it.title, price: (it.price_cents / 100).toFixed(2), qty: it.qty,
  }))
  return `
<section class="panel ord-edit">
  <details>
    <summary><b>Modifier la commande</b>
      <span class="muted">— infos du client, articles, quantités, tarifs</span></summary>
    <form method="post" action="/dashboard/orders/${order.id}/edit" class="form ord-editform" id="ordEdit">
      <h3>Client</h3>
      <div class="form-row two">
        <label>Nom<input name="customer_name" required maxlength="80" value="${esc(order.customer_name)}"></label>
        <label>Téléphone<input name="phone" required maxlength="20" value="${esc(order.phone)}"></label>
      </div>
      <div class="form-row two">
        <label>Wilaya
          <select name="wilaya">${GEO.WILAYAS.map((w) => `<option ${order.wilaya === w ? "selected" : ""}>${esc(w)}</option>`).join("")}</select>
        </label>
        <label>Commune<input name="commune" maxlength="60" value="${esc(order.commune || "")}"></label>
      </div>
      <label>Adresse<input name="address" maxlength="200" value="${esc(order.address || "")}"></label>
      <div class="form-row two">
        <label>Note interne<input name="note" maxlength="400" value="${esc(order.note || "")}"></label>
        <label>Type de livraison
          <select name="delivery_type">
            <option value="home" ${order.delivery_type !== "desk" ? "selected" : ""}>À domicile</option>
            <option value="desk" ${order.delivery_type === "desk" ? "selected" : ""}>Au bureau</option>
          </select>
        </label>
      </div>

      <h3>Articles</h3>
      <div class="oe-list" id="oeList"></div>
      <div class="oe-add">
        <select id="oePick" aria-label="Produit à ajouter">
          <option value="">— Choisir un produit à ajouter —</option>
          ${products.map((p) => `<option value="${p.id}" data-title="${esc(p.title)}" data-price="${(p.price_cents / 100).toFixed(2)}">${esc(p.title)} — ${money(p.price_cents, store.currency)}</option>`).join("")}
        </select>
        <button type="button" class="btn btn-ghost btn-sm" id="oeAdd">+ Ajouter à la commande</button>
      </div>

      <div class="form-row two">
        <label>Frais de livraison (${esc(store.currency)})
          <input name="shipping" id="oeShip" type="number" step="1" min="0" value="${(order.shipping_cents / 100).toFixed(0)}"></label>
        <label>Remise (${esc(store.currency)})
          <input name="discount" id="oeDisc" type="number" step="1" min="0" value="${(order.discount_cents / 100).toFixed(0)}"></label>
      </div>
      <div class="oe-total"><span>Nouveau total</span><b id="oeTotal"></b></div>
      <input type="hidden" name="items" id="oeJson">
      <div class="form-actions">
        <button class="btn btn-primary">Enregistrer les modifications</button>
      </div>
      <p class="muted small">Le stock des produits n'est pas modifié ici : la commande seule est corrigée.</p>
    </form>
  </details>
</section>
<script>
(function(){
  var ITEMS = ${JSON.stringify(rows)};
  var CUR = ${JSON.stringify(store.currency)};
  var list = document.getElementById('oeList'), json = document.getElementById('oeJson');
  var ship = document.getElementById('oeShip'), disc = document.getElementById('oeDisc');
  var total = document.getElementById('oeTotal');
  function fmt(n){ return Math.round(n).toLocaleString('fr-FR') + ' ' + CUR; }
  function render(){
    list.innerHTML = ITEMS.map(function(it, i){
      return '<div class="oe-row">' +
        '<input type="text" value="' + esc(it.title) + '" data-i="' + i + '" data-k="title" aria-label="Désignation">' +
        '<input type="number" step="0.01" min="0" value="' + esc(it.price) + '" data-i="' + i + '" data-k="price" aria-label="Prix">' +
        '<input type="number" min="1" value="' + esc(it.qty) + '" data-i="' + i + '" data-k="qty" aria-label="Quantité">' +
        '<button type="button" data-del="' + i + '" title="Retirer cet article" aria-label="Retirer cet article">' + '\u2715' + '</button>' +
      '</div>';
    }).join('') || '<p class="muted small">Aucun article.</p>';
    if (!ITEMS.length) ITEMS.push({ title: 'Article', price: '0.00', qty: 1 });
    json.value = JSON.stringify(ITEMS);
    sum();
  }
  function esc(v){ return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  function sum(){
    var sub = ITEMS.reduce(function(a, it){ return a + (parseFloat(it.price) || 0) * (parseInt(it.qty, 10) || 0); }, 0);
    var s = parseFloat(ship.value) || 0, d = parseFloat(disc.value) || 0;
    total.textContent = fmt(Math.max(0, sub - d) + s);
  }
  list.addEventListener('input', function(e){
    var t = e.target, i = t.getAttribute('data-i'), k = t.getAttribute('data-k');
    if (i === null || !k) return;
    ITEMS[+i][k] = t.value; json.value = JSON.stringify(ITEMS); sum();
  });
  list.addEventListener('click', function(e){
    var b = e.target.closest('button[data-del]'); if (!b) return;
    ITEMS.splice(+b.getAttribute('data-del'), 1); render();
  });
  document.getElementById('oeAdd').addEventListener('click', function(){
    var sel = document.getElementById('oePick'), o = sel.options[sel.selectedIndex];
    if (!o || !o.value) return;
    ITEMS.push({ product_id: o.value, variant_id: '', title: o.getAttribute('data-title'), price: o.getAttribute('data-price'), qty: 1 });
    sel.value = ''; render();
  });
  ship.addEventListener('input', sum); disc.addEventListener('input', sum);
  render();
})();
</script>`
}

const dashOrderDetail = (user, store, order, items, extras = {}) => dashLayout(user, store, `
${extras.editing === "ok" ? `<div class="alert ok">Commande modifiée : articles et total recalculés.</div>` : ""}
${extras.editing === "vide" ? `<div class="alert">Il faut au moins un article dans la commande.</div>` : ""}
<header class="dash-head">
  <div><h1>Commande ${refChip(order, "big")}</h1>
    <p class="muted">${frDate(order.created_at)} · ${esc(ORD.sourceLabel(order.source))}
      · <span class="ord-status t-${ORD.tone(order.status)}">${esc(ORD.label(order.status))}</span>
      ${order.fake ? `<span class="ord-flag">${icon("flask", 12)} Test</span>` : ""}</p>
  </div>
  <div class="head-actions">
    <a class="btn btn-ghost act-text" href="/dashboard/orders/${order.id}/invoice" target="_blank" rel="noopener">Facture</a>
    <a class="btn btn-ghost act-text" href="/dashboard/orders/${order.id}/invoice?type=bl" target="_blank" rel="noopener">Bon de livraison</a>
    <a class="btn btn-ghost" href="/dashboard/orders">${icon("arrowLeft", 15)} Commandes</a>
  </div>
</header>

<section class="panel ord-bar">
  <div class="ord-say">
    <b>À dire au téléphone</b>
    <p>${esc(productLine({ items }) || "Article")}</p>
    <p>${order.delivery_type === "desk" ? "Au bureau" : "À domicile"}${order.wilaya ? " · " + esc(order.wilaya) : ""}${order.commune ? ", " + esc(order.commune) : ""}</p>
    <p>Livraison ${money(order.shipping_cents || 0, store.currency)}</p>
    <p class="sum">À préparer ${money(order.total_cents, store.currency)}</p>
  </div>
  ${historyCard(order.phone)}
  <div class="ord-barbox">
    <span class="ord-barlabel">Action rapide</span>
    ${orderActions(store, order, true)}
  </div>
  ${Number(order.attempts || 0) >= ORD.MAX_ATTEMPTS
    ? `<p class="ord-hint warn">${icon("phoneOff", 14)} ${ORD.MAX_ATTEMPTS} appels sans réponse — la commande est marquée injoignable. Une relance WhatsApp reste possible.</p>`
    : Number(order.attempts || 0) > 0
      ? `<p class="ord-hint">${icon("clock", 14)} ${order.attempts}/${ORD.MAX_ATTEMPTS} appel(s) sans réponse${order.last_attempt_at ? ` — dernier le ${frDate(order.last_attempt_at)}` : ""}.</p>`
      : `<p class="ord-hint">${icon("clock", 14)} Aucun appel enregistré. Le bouton « injoignable » compte les appels : au 3ᵉ, la commande passe en injoignable.</p>`}
</section>

${orderEditPanel(store, order, items, extras.products || [])}

<div class="detail-grid">
  <section class="panel">
    <h2>Articles</h2>
    <table class="table">
      <thead><tr><th>Produit</th><th>Prix</th><th>Qté</th><th class="r">Total</th></tr></thead>
      <tbody>${items.map((it) => `<tr>
        <td><span class="ord-item"><span class="t-thumb">${pThumb(it)}</span>${esc(it.title)}</span></td>
        <td>${money(it.price_cents, store.currency)}</td>
        <td>${it.qty}</td><td>${money(it.price_cents * it.qty, store.currency)}</td></tr>`).join("")}</tbody>
    </table>
    <div class="totals-block">
      <div><span>Sous-total</span><b>${money(order.subtotal_cents, store.currency)}</b></div>
      ${order.discount_cents ? `<div><span>Remise ${esc(order.promo_code || "")}</span><b>−${money(order.discount_cents, store.currency)}</b></div>` : ""}
      <div><span>Livraison</span><b>${money(order.shipping_cents, store.currency)}</b></div>
      <div class="total"><span>Total</span><b>${money(order.total_cents, store.currency)}</b></div>
    </div>
  </section>
  <aside class="panel">
    <h2>Client</h2>
    <dl class="kv">
      <div><dt>Nom</dt><dd>${esc(order.customer_name)}</dd></div>
      <div><dt>Téléphone</dt><dd><a class="link" href="tel:${esc(order.phone)}">${esc(order.phone)}</a></dd></div>
      <div><dt>Wilaya</dt><dd>${esc(order.wilaya)}</dd></div>
      <div><dt>Adresse</dt><dd>${esc(order.address)}${order.commune ? `<br><span class="muted">Commune : ${esc(order.commune)}</span>` : ""}</dd></div>
      ${order.geo_lat != null && order.geo_lng != null ? `<div><dt>Position GPS</dt><dd><a class="link-y" target="_blank" rel="noopener"
        href="https://www.google.com/maps/search/?api=1&query=${order.geo_lat},${order.geo_lng}">Ouvrir dans Google Maps</a></dd></div>` : ""}
      <div><dt>Note</dt><dd>${esc(order.note || "—")}</dd></div>
      ${(() => {
        let extra = {}
        try { extra = order.form ? JSON.parse(order.form) : {} } catch (_) { extra = {} }
        return Object.keys(extra).map((k) => `<div><dt>${esc(k)}</dt><dd>${esc(String(extra[k]))}</dd></div>`).join("")
      })()}
      <div><dt>Paiement</dt><dd>${esc(PAY.describe(store, order))}</dd></div>
      <div><dt>Livraison</dt><dd>${order.delivery_type === "desk" ? "Au bureau" : "À domicile"}</dd></div>
      ${order.tracking ? `<div><dt>Suivi</dt><dd><b>${esc(order.carrier_name || "Transporteur")}</b><br>${esc(order.tracking)}${order.ship_state && order.ship_state !== "envoye" ? `<br><span class="muted">${esc(order.ship_state)}</span>` : ""}</dd></div>` : ""}
      <div><dt>Type</dt><dd>${order.fake ? "Commande de test (hors chiffre d'affaires)" : "Commande réelle"}</dd></div>
    </dl>

    <form class="stack" method="post" action="/dashboard/orders/${order.id}/status">
      <label>Changer le statut
        <select name="status">
          ${ORD.STATUSES.map((st) => `<option value="${st.id}" ${ORD.norm(order.status) === st.id ? "selected" : ""}>${st.label}</option>`).join("")}
        </select>
      </label>
      <button class="btn btn-primary btn-block">Enregistrer</button>
    </form>

    ${extras.carrier || ""}

    ${order.refunded_cents
      ? `<p class="muted mt-3">Remboursé : ${money(order.refunded_cents, store.currency)}</p>`
      : `<form method="post" action="/dashboard/orders/${order.id}/refund" class="mt-3"
              onsubmit="return confirm('Rembourser la totalité de cette commande et remettre le stock ?')">
           <button class="btn btn-ghost btn-block link-danger">Rembourser ${money(order.total_cents, store.currency)}</button>
         </form>`}
  </aside>
</div>

<div class="detail-grid">
  <section class="panel">
    <div class="panel-head"><h2>D'où vient cette commande</h2>
      <span class="muted">${esc(ORD.sourceLabel(order.source))}</span></div>
    <dl class="kv kv-ico">
      ${ORD.trackingRows(order).map((r) => `<div><dt>${icon(r.icon, 14)} ${esc(r.label)}</dt>
        <dd${r.strong ? ' class="strong"' : ""}>${esc(String(r.value || "—"))}</dd></div>`).join("")}
    </dl>
    ${(extras.pixels && extras.pixels.length) ? `<div class="ord-pixels">
      <b>Pixels publicitaires</b>
      ${extras.pixels.map((p) => `<span class="ord-px ${p.status === "ok" ? "ok" : "ko"}">
        ${icon("target", 12)} ${esc(p.provider === "meta" ? "Meta" : p.provider === "tiktok" ? "TikTok" : p.provider)}
        — ${esc(p.event_name)} : ${p.status === "ok" ? "envoyé" : "erreur" + (p.code ? ` (${p.code})` : "")}</span>`).join("")}
    </div>` : (store.pixel_meta || store.pixel_tiktok) ? `<p class="muted mt-2">${icon("target", 13)} Aucun événement pixel enregistré pour cette commande.</p>` : ""}
    ${!order.utm_campaign && !order.click_id
      ? `<p class="muted mt-2">Aucune campagne détectée : le client est arrivé directement ou depuis un lien sans paramètre.
         Ajoutez <code>?utm_source=facebook&utm_campaign=ma-campagne</code> à vos liens de publicité pour tout suivre ici.</p>`
      : ""}
  </section>
  <aside class="panel">
    <div class="panel-head"><h2>Historique</h2></div>
    <ol class="ord-timeline">
      ${(extras.events && extras.events.length ? extras.events : []).map((e) => `<li class="kind-${esc(e.kind)}">
        <span class="ord-dot"></span>
        <div><b>${esc(e.label)}</b>${e.detail ? `<span>${esc(e.detail)}</span>` : ""}
        <i>${frDate(e.created_at)}</i></div>
      </li>`).join("") || `<li class="muted">Aucune action enregistrée pour le moment.</li>`}
    </ol>
  </aside>
</div>`, "orders")

const wl = (num) => String(num || "").replace(/[^0-9]/g, "").replace(/^0/, "213")

/* ============================== MENTIONS / CGV / RETOURS ============================== */
const legalPage = (store, cartCount = 0, opts = {}) => {
  const L = layoutFor(store.theme)
  const days = store.return_days || 7
  const ar = I18N.langNow(store) === "ar"
  const body = ar
    ? `
<article class="doc"><div class="wrap doc-in">
  <a class="doc-back" href="/${esc(store.slug)}">${icon("arrowLeft", 14)} العودة إلى المتجر</a>
  <h1>المعلومات القانونية</h1>
  <div class="doc-body">
    <h2 id="mentions">المعلومات القانونية</h2>
    <p><b>${esc(store.legal_name || store.name)}</b><br>
    ${esc(store.legal_address || store.wilaya || "الجزائر")}${store.phone ? "<br>الهاتف : " + esc(store.phone) : ""}</p>
    <p>${store.legal_rc ? "السجل التجاري : " + esc(store.legal_rc) + "<br>" : ""}
       ${store.legal_nif ? "رقم التعريف الجبائي : " + esc(store.legal_nif) + "<br>" : ""}
       موقع مُدار عبر منصة NovaDZ.</p>

    <h2 id="cgv">الشروط العامة للبيع</h2>
    <p>الأسعار بالدينار الجزائري، جميع الرسوم مشمولة، دون تكاليف التوصيل. تُحتسب تكاليف التوصيل حسب ولاية الوجهة
    وتظهر عند الدفع.</p>
    <p>الدفع نقدا عند استلام الطلب. لا يُطلب أي دفع إلكتروني. يتم تأكيد الطلب هاتفيا قبل الإرسال.</p>

    <h2 id="retours">المرتجعات والاستبدال</h2>
    <p>لديك <b>${days} أيام</b> بعد الاستلام لطلب الاستبدال أو الإرجاع، بشرط أن يكون المنتج سليما وغير مستعمل
    وفي تغليفه الأصلي. تكاليف الإرجاع على عاتق العميل إلا في حالة منتج معيب أو خطأ في التحضير.</p>
    <p>في حالة الاسترجاع المالي يتم ذلك بالوسائل المتفق عليها مع المتجر خلال 7 أيام من استلام المنتج المُرجَع.</p>

    <h2 id="cookies">ملفات تعريف الارتباط</h2>
    <p>يستعمل الموقع ملفات تقنية (السلة، الجلسة) و، إذا فعّل المتجر ذلك، ملفات لقياس الزيارات.
    يمكنك رفض هذه الأخيرة من الشريط الظاهر عند أول زيارة.</p>

    <h2 id="donnees">المعطيات الشخصية</h2>
    <p>المعلومات المجمعة (الاسم، الهاتف، العنوان) تُستعمل فقط لمعالجة طلبك وتوصيله.
    لا تُباع ولا تُنقل إلى أي طرف ثالث غير الناقل.</p>
  </div>
</div></article>`
    : `
<article class="doc"><div class="wrap doc-in">
  <a class="doc-back" href="/${esc(store.slug)}">${icon("arrowLeft", 14)} Retour à la boutique</a>
  <h1>Informations légales</h1>
  <div class="doc-body">
    <h2 id="mentions">Mentions légales</h2>
    <p><b>${esc(store.legal_name || store.name)}</b><br>
    ${esc(store.legal_address || store.wilaya || "Algérie")}${store.phone ? "<br>Téléphone : " + esc(store.phone) : ""}</p>
    <p>${store.legal_rc ? "Registre de commerce : " + esc(store.legal_rc) + "<br>" : ""}
       ${store.legal_nif ? "NIF : " + esc(store.legal_nif) + "<br>" : ""}
       Site édité via la plateforme NovaDZ.</p>

    <h2 id="cgv">Conditions générales de vente</h2>
    <p>Les prix sont indiqués en ${esc(store.currency || "DZD")}, toutes taxes comprises, hors frais de livraison.
    La livraison est facturée selon la wilaya de destination et affichée au moment du paiement.</p>
    <p>Le paiement se fait en espèces à la réception de la commande. Aucun paiement en ligne n'est demandé.
    La commande est confirmée par téléphone avant expédition.</p>

    <h2 id="retours">Retours et échanges</h2>
    <p>Vous disposez de <b>${days} jours</b> après réception pour demander un échange ou un retour,
    si l'article est intact, non porté et dans son emballage d'origine. Les frais de retour sont à la charge
    du client sauf article défectueux ou erreur de préparation.</p>
    <p>En cas de remboursement, il est effectué par les moyens convenus avec la boutique dans un délai de 7 jours
    après réception de l'article retourné.</p>

    <h2 id="cookies">Cookies</h2>
    <p>Le site utilise des cookies techniques (panier, session) et, si la boutique l'a activé, des cookies de mesure
    d'audience. Vous pouvez refuser ces derniers depuis le bandeau affiché à la première visite.</p>

    <h2 id="donnees">Données personnelles</h2>
    <p>Les informations collectées (nom, téléphone, adresse) servent uniquement à traiter et livrer votre commande.
    Elles ne sont ni revendues ni transmises à des tiers autres que le transporteur.</p>
  </div>
</div></article>`
  const legalBody = SECTIONS.renderPage(store, "legal", body + pageSections(store, "legal", []))
  return L.shell(store, legalBody.html, { title: ar ? "المعلومات القانونية" : "Informations légales", preview: !!opts.preview, ownCode: legalBody.ownCode })
}

/* ============================== COMPTE CLIENT (vitrine) ============================== */
const customerAccount = (store, customer, orders, error, preview = false) => {
  const L = layoutFor(store.theme)
  const errs = {
    1: "E-mail ou mot de passe incorrect.",
    2: "Renseignez un nom, un e-mail et un mot de passe de 6 caractères minimum.",
    3: "Un compte existe déjà avec cet e-mail.",
  }
  const body = customer
    ? `
<article class="acc"><div class="wrap acc-in">
  <h1>Mon compte</h1>
  <p class="acc-sub">${esc(customer.name)} · ${esc(customer.email)}</p>
  <h2>Mes commandes</h2>
  ${orders.length
    ? `<table class="acc-table"><thead><tr><th>Référence</th><th>Date</th><th>Total</th><th>Statut</th><th></th></tr></thead>
       <tbody>${orders.map((o) => `<tr>
         <td><b>#${esc(o.ref)}</b></td><td>${esc(String(o.created_at).slice(0, 10))}</td>
         <td>${money(o.total_cents, store.currency)}</td>
         <td><span class="acc-pill">${esc(o.status)}</span></td>
         <td><a class="acc-link" href="/${esc(store.slug)}/order/${esc(o.ref)}">Suivre</a></td>
       </tr>`).join("")}</tbody></table>`
    : `<p class="acc-empty">Aucune commande pour le moment.</p>`}
  <div class="acc-actions">
    <form method="post" action="/${esc(store.slug)}/account/logout"><button class="btn btn-ghost">Se déconnecter</button></form>
    <a class="btn btn-primary" href="/${esc(store.slug)}">Continuer mes achats</a>
  </div>
</div></article>`
    : `
<article class="acc"><div class="wrap acc-in">
  <h1>Mon compte</h1>
  <p class="acc-sub">Suivez vos commandes et retrouvez vos achats.</p>
  ${error ? `<div class="acc-alert">${esc(errs[error] || "Erreur.")}</div>` : ""}
  <div class="acc-cols">
    <form class="acc-card" method="post" action="/${esc(store.slug)}/account/login">
      <h2>Se connecter</h2>
      <label>E-mail<input type="email" name="email" required></label>
      <label>Mot de passe<input type="password" name="password" required></label>
      <button class="btn btn-primary btn-block">Se connecter</button>
    </form>
    <form class="acc-card" method="post" action="/${esc(store.slug)}/account/register">
      <h2>Créer un compte</h2>
      <label>Nom<input name="name" required placeholder="Amine Benali"></label>
      <label>E-mail<input type="email" name="email" required></label>
      <label>Téléphone<input name="phone" placeholder="0555 12 34 56"></label>
      <label>Mot de passe<input type="password" name="password" required minlength="6"></label>
      <button class="btn btn-primary btn-block">Créer mon compte</button>
    </form>
  </div>
  <p class="acc-note">Vous avez commandé sans compte ? <a href="/${esc(store.slug)}">Retrouvez votre commande</a> avec sa référence.</p>
</div></article>`
  const accountBody = SECTIONS.renderPage(store, "account", body + pageSections(store, "account", []))
  return L.shell(store, accountBody.html, { title: "Mon compte", preview: !!preview, ownCode: accountBody.ownCode })
}

/* ============================== SUIVI DE COMMANDE ============================== */
/* Page publique (lien par référence) : jamais le numéro complet ni l'adresse
   exacte — 0555 ** ** 33 et la commune suffisent à reconnaître sa commande. */
const maskPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "")
  if (d.length < 7) return "•••"
  return `${d.slice(0, 4)} ** ** ${d.slice(-2)}`
}

const orderTrack = (store, order, items, parcel = null) => {
  const L = layoutFor(store.theme)
  const steps = [
    ["nouvelle", "Commande reçue"],
    ["confirmee", "Confirmée"],
    ["expediee", "Expédiée"],
    ["livree", "Livrée"],
  ]
  const idx = Math.max(0, steps.findIndex(([k]) => k === order.status))
  const refunded = order.status === "remboursee"
  const body = `
<article class="track"><div class="wrap track-in">
  <h1>Commande #${esc(order.ref)}</h1>
  <p class="track-sub">${esc(store.name)} · ${esc(String(order.created_at).slice(0, 16))}</p>
  ${parcelCard(parcel, order)}

  ${refunded
    ? `<div class="track-refund">Commande remboursée (${money(order.refunded_cents || order.total_cents, store.currency)}).</div>`
    : `<ol class="track-steps">
        ${steps.map(([k, label], i) => `<li class="${i <= idx ? "on" : ""}"><span>${i + 1}</span>${label}</li>`).join("")}
      </ol>`}

  <div class="track-grid">
    <div>
      <h2>Articles</h2>
      <ul class="track-items">
        ${items.map((it) => `<li><span>${esc(it.title)}</span><span>× ${it.qty}</span><b>${money(it.price_cents * it.qty, store.currency)}</b></li>`).join("")}
      </ul>
    </div>
    <div>
      <h2>Livraison</h2>
      <p class="track-addr">${esc(order.customer_name)}<br>${esc(maskPhone(order.phone))}<br>${esc([order.commune, order.wilaya].filter(Boolean).join(", ") || order.wilaya || "")}</p>
      <div class="track-tot">
        <div><span>Sous-total</span><span>${money(order.subtotal_cents, store.currency)}</span></div>
        ${order.discount_cents ? `<div><span>Remise ${esc(order.promo_code || "")}</span><span>−${money(order.discount_cents, store.currency)}</span></div>` : ""}
        <div><span>Livraison</span><span>${money(order.shipping_cents, store.currency)}</span></div>
        <div class="total"><span>Total</span><span>${money(order.total_cents, store.currency)}</span></div>
      </div>
      <a class="btn btn-ghost btn-block" href="/${esc(store.slug)}/order/${esc(order.ref)}/invoice">Voir la facture</a>
      <a class="link-quiet" href="/${esc(store.slug)}/order/${esc(order.ref)}/invoice?type=bl">Bon de livraison</a>
    </div>
  </div>
</div></article>`
  return L.shell(store, body, { title: `Commande ${order.ref}` })
}

/* ============================== FACTURE (imprimable → PDF) ============================== */
const invoice = (store, order, items, { mode, doc = "facture" } = {}) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${doc === "bl" ? "Bon de livraison" : "Facture"} ${esc(order.ref)} — ${esc(store.name)}</title>
<link rel="stylesheet" href="/inter-font.css">
<style>
*{box-sizing:border-box}
body{margin:0;background:#F4F4F5;font-family:'Inter',system-ui,sans-serif;font-size:13px;color:#313131;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{max-width:740px;margin:28px auto;background:#fff;padding:40px 44px;border:1px solid #E4E4E7;border-radius:8px}
.head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111;padding-bottom:18px}
.brand{font-size:19px;font-weight:600;color:#111;letter-spacing:-.02em}
.brand small{display:block;font-size:11px;color:#71717A;font-weight:400;margin-top:4px;letter-spacing:0}
.doc{text-align:right}
.doc b{display:block;font-size:15px;color:#111}
.doc span{font-size:11.5px;color:#71717A}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}
.cols h3{margin:0 0 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;color:#A1A1AA;font-weight:500}
.cols p{margin:0;line-height:1.55;font-size:12.5px}
table{width:100%;border-collapse:collapse;margin:8px 0 0}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#A1A1AA;font-weight:500;
  border-bottom:1px solid #111;padding:0 0 8px}
th.r,td.r{text-align:right}
td{padding:10px 0;border-bottom:1px solid #E4E4E7;font-size:12.5px}
.tot{margin-left:auto;max-width:280px;margin-top:16px}
.tot div{display:flex;justify-content:space-between;gap:16px;font-size:12.5px;color:#71717A;padding:4px 0}
.tot div.total{border-top:1px solid #111;margin-top:6px;padding-top:9px;font-size:15px;color:#111;font-weight:600}
.legal{margin-top:28px;border-top:1px solid #E4E4E7;padding-top:14px;font-size:10.5px;color:#A1A1AA;line-height:1.6}
.actions{max-width:740px;margin:0 auto 28px;display:flex;gap:8px;justify-content:flex-end}
.actions a,.actions button{height:34px;padding:0 14px;border-radius:6px;border:1px solid #111;background:#111;
  color:#fff;font:inherit;font-size:12.5px;display:inline-flex;align-items:center;cursor:pointer;text-decoration:none}
.actions a.ghost{background:#fff;color:#111;border-color:#E4E4E7}
@media print{body{background:#fff}.sheet{border:0;margin:0;box-shadow:none;padding:0}.actions{display:none}}
</style></head>
<body>
${mode === "merchant" ? `<div class="actions">
  <a class="ghost" href="/dashboard/orders/${order.id}">Retour</a>
  <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>
</div>` : ""}
<div class="sheet">
  <div class="head">
    <div class="brand">${esc(store.name)}
      <small>${esc(store.legal_address || store.wilaya || "Algérie")}${store.phone ? " · " + esc(store.phone) : ""}
      ${store.legal_rc ? "<br>RC " + esc(store.legal_rc) : ""}${store.legal_nif ? " · NIF " + esc(store.legal_nif) : ""}</small>
    </div>
    <div class="doc"><b>${doc === "bl" ? "Bon de livraison" : "Facture"}</b><span>N° ${esc(order.ref)}</span><span>${esc(String(order.created_at).slice(0, 10))}</span></div>
  </div>

  <div class="cols">
    <div><h3>Client</h3><p>${esc(order.customer_name)}<br>${esc(order.phone)}<br>${esc(order.address)}<br>
      ${esc(order.wilaya)}${order.commune ? " · " + esc(order.commune) : ""}
      ${order.geo_lat != null && order.geo_lng != null ? `<br>GPS ${Number(order.geo_lat).toFixed(5)}, ${Number(order.geo_lng).toFixed(5)}` : ""}
      ${order.delivery_type === "desk" ? "<br>Retrait au bureau" : ""}</p></div>
    <div><h3>Paiement</h3><p>Espèces à la livraison<br>Statut : ${esc(order.status)}</p></div>
  </div>

  <table>
    <thead><tr><th>Article</th><th class="r">Prix unitaire</th><th class="r">Qté</th><th class="r">Total</th></tr></thead>
    <tbody>${items.map((it) => `<tr><td>${esc(it.title)}</td><td class="r">${money(it.price_cents, store.currency)}</td>
      <td class="r">${it.qty}</td><td class="r">${money(it.price_cents * it.qty, store.currency)}</td></tr>`).join("")}</tbody>
  </table>

  <div class="tot">
    <div><span>Sous-total</span><span>${money(order.subtotal_cents, store.currency)}</span></div>
    ${order.discount_cents ? `<div><span>Remise ${esc(order.promo_code || "")}</span><span>−${money(order.discount_cents, store.currency)}</span></div>` : ""}
    <div><span>Livraison (${esc(order.wilaya)})</span><span>${money(order.shipping_cents, store.currency)}</span></div>
    <div class="total"><span>Total à payer</span><span>${money(order.total_cents, store.currency)}</span></div>
  </div>

  <div class="legal">
    ${esc(store.legal_name || store.name)}${store.legal_address ? " — " + esc(store.legal_address) : ""}<br>
    Retours acceptés ${store.return_days || 7} jours après réception, article intact.<br>
    Facture générée par NovaDZ — ${new Date().toLocaleDateString("fr-FR")}
  </div>
</div>
</body></html>`

/* ============================== DASHBOARD : CATÉGORIES ============================== */
const dashCategories = (user, store, cats) => dashLayout(user, store, `
<header class="dash-head"><div><h1>Catégories</h1><p class="muted">Ranger le catalogue et filtrer la boutique.</p></div></header>
<section class="panel">
  <form class="inline-form" method="post" action="/dashboard/categories">
    <input name="name" required placeholder="Robes, Sacs, Chaussures…" maxlength="40">
    <button class="btn btn-primary">Ajouter</button>
  </form>
  ${cats.length ? `<table class="table">
    <thead><tr><th>Catégorie</th><th>Adresse</th><th>Produits</th><th></th></tr></thead>
    <tbody>${cats.map((c) => `<tr>
      <td><b>${esc(c.name)}</b></td>
      <td><a class="link" target="_blank" href="/${esc(store.slug)}?cat=${esc(c.slug)}">?cat=${esc(c.slug)}</a></td>
      <td>${c.n}</td>
      <td class="right"><form method="post" action="/dashboard/categories/${c.id}/delete" class="inline">
        <button class="link-danger">Supprimer</button></form></td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("box", 22)}<h3>Aucune catégorie</h3>
  <p>Les catégories s'affichent comme filtres sur la boutique et dans le menu.</p></div>`}
</section>`, "categories")

/* ============================== DASHBOARD : LIVRAISON ============================== */
const dashShipping = (user, store, rates, saved, err = "") => dashLayout(user, store, `
<header class="dash-head"><div><h1>Livraison</h1><p class="muted">Deux façons de livrer : à domicile, ou au bureau. Un tarif pour tout le pays suffit dans la plupart des cas.</p></div></header>
${saved ? `<div class="alert ok">Livraison enregistrée.</div>` : ""}

<form method="post" action="/dashboard/shipping">
  <section class="panel">
    <div class="panel-head"><h2>Ce que vous proposez</h2></div>
    <div class="dlv-modes">
      <label class="dlv-mode">
        <input type="checkbox" name="ship_home" value="1" ${Number(store.ship_home) !== 0 ? "checked" : ""}>
        <span><b>Livraison à domicile</b><span>Le livreur vient à l'adresse indiquée par le client.</span></span>
      </label>
      <label class="dlv-mode">
        <input type="checkbox" name="ship_desk" value="1" ${Number(store.ship_desk) !== 0 ? "checked" : ""}>
        <span><b>Retrait au bureau</b><span>Le client retire son colis dans l'agence de sa wilaya — souvent moins cher.</span></span>
      </label>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Tarifs</h2></div>
    <div class="ship-all">
      <label>Tarif à domicile (DZD)
        <input name="all" type="number" min="0" step="50" placeholder="500">
        <small class="muted">500 = 500 DZD partout, à domicile.</small></label>
      <label>Tarif au bureau (DZD)
        <input name="all_desk" type="number" min="0" step="50" placeholder="400">
        <small class="muted">Généralement 100 DZD de moins.</small></label>
      <label>Délai annoncé (jours)<span class="ship-eta">
        <input name="eta_min" type="number" min="0" max="60" value="${store.eta_min || 2}" aria-label="Délai minimum">
        <em>à</em>
        <input name="eta_max" type="number" min="0" max="60" value="${store.eta_max || 4}" aria-label="Délai maximum">
      </span>
        <small class="muted">Affiché au client : « Livraison estimée : 2 à 4 jours ».</small></label>
      <button class="btn btn-primary" name="applyAll" value="1">Appliquer partout</button>
    </div>

    <details class="adv">
      <summary><b>Tarif wilaya par wilaya</b> <span class="muted">— 58 wilayas, seulement si tu veux des prix différents</span></summary>
      <div class="ship-grid">
        ${rates.map((r) => `<div class="ship-cell">
          <b>${esc(r.wilaya)}</b>
          <label>Domicile<input name="w_${esc(r.wilaya)}" type="number" min="0" step="50" value="${Math.round((r.home || 0) / 100)}"></label>
          <label>Bureau<input name="d_${esc(r.wilaya)}" type="number" min="0" step="50" value="${Math.round((r.desk || 0) / 100)}"></label>
          <label class="ship-eta-cell">Délai (j)
            <span class="ship-eta">
              <input name="e_min_${esc(r.wilaya)}" type="number" min="0" max="60" value="${r.etaMin != null ? r.etaMin : 2}" aria-label="Délai minimum ${esc(r.wilaya)}">
              <em>à</em>
              <input name="e_max_${esc(r.wilaya)}" type="number" min="0" max="60" value="${r.etaMax != null ? r.etaMax : 4}" aria-label="Délai maximum ${esc(r.wilaya)}">
            </span>
          </label>
        </div>`).join("")}
      </div>
    </details>

    <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
  </section>
</form>`, "shipping")

/* ============================== DASHBOARD : AVIS ============================== */
const dashReviews = (user, store, rows) => dashLayout(user, store, `
<header class="dash-head"><div><h1>Avis clients</h1><p class="muted">${rows.filter((r) => !r.approved).length} en attente de validation.</p></div></header>
<section class="panel">
  ${rows.length ? `<table class="table">
    <thead><tr><th>Produit</th><th>Client</th><th>Note</th><th>Avis</th><th>Statut</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.title || "—")}</td>
      <td>${esc(r.name)}<br><small class="muted">${esc(String(r.created_at).slice(0, 10))}</small></td>
      <td>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</td>
      <td class="wrap-cell">${esc(r.body || "—")}</td>
      <td>${r.approved ? '<span class="pill ok">Publié</span>' : '<span class="pill nouvelle">En attente</span>'}</td>
      <td class="right">
        <form method="post" action="/dashboard/reviews/${r.id}/approve" class="inline">
          <button class="btn btn-ghost btn-sm">${r.approved ? "Retirer" : "Publier"}</button></form>
        <form method="post" action="/dashboard/reviews/${r.id}/delete" class="inline">
          <button class="link-danger">Supprimer</button></form>
      </td>
    </tr>`).join("")}</tbody></table>`
    : `<div class="empty-state">${icon("user", 22)}<h3>Aucun avis</h3><p>Les avis arrivent depuis la fiche produit.</p></div>`}
</section>`, "reviews")

/* ============================== DASHBOARD : CLIENTS ============================== */
const dashCustomers = (user, store, rows) => dashLayout(user, store, `
<header class="dash-head"><div><h1>Clients</h1><p class="muted">${rows.length} compte(s) créé(s) dans la boutique.</p></div></header>
<section class="panel">
  ${rows.length ? `<table class="table">
    <thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>Commandes</th><th>Total dépensé</th></tr></thead>
    <tbody>${rows.map((c) => `<tr>
      <td><b>${esc(c.name)}</b></td><td>${esc(c.email)}</td><td>${esc(c.phone || "—")}</td>
      <td>${c.n}</td><td>${money(c.spent, store.currency)}</td>
    </tr>`).join("")}</tbody></table>`
    : `<div class="empty-state">${icon("user", 22)}<h3>Aucun client inscrit</h3>
       <p>Le compte client permet le suivi de commande et l'historique.</p></div>`}
</section>`, "customers")

/* ============================== ADMIN : SANTÉ ============================== */
const adminHealth = (user, counts, visits, info) => page("Santé — Admin NovaDZ", `
<div class="dash"><aside class="dash-side">
  <a class="brand" href="/">${LOGO}<span>NovaDZ</span></a>
  <nav class="dash-nav">
    <a href="/admin">${icon("shield", 16)} Boutiques</a>
    <a class="on" href="/admin/health">${icon("grid", 16)} Santé</a>
  </nav>
  <div class="dash-foot"><a href="/dashboard">${icon("arrowLeft", 15)} Ma boutique</a><a href="/logout">${icon("logout", 15)} Déconnexion</a></div>
</aside>
<main class="dash-main">
  <header class="dash-head"><div><h1>Santé de la plateforme</h1><p class="muted">Processus actif depuis ${(info.uptime / 60).toFixed(0)} min.</p></div></header>
  <div class="kpis">
    <div class="kpi"><span>Boutiques</span><b>${counts.stores}</b><i>${counts.users} utilisateurs</i></div>
    <div class="kpi"><span>Produits</span><b>${counts.products}</b><i>${counts.reviews} avis</i></div>
    <div class="kpi"><span>Commandes</span><b>${counts.orders}</b><i>${counts.customers} clients</i></div>
    <div class="kpi"><span>Fichiers média</span><b>${info.uploads}</b><i>public/uploads</i></div>
  </div>
  <section class="panel">
    <div class="panel-head"><h2>Visites (14 derniers jours)</h2></div>
    ${visits.length ? `<div class="bars">${visits.slice().reverse().map((v) => `<div class="bar" title="${esc(v.day)} : ${v.n}"><i style="height:${Math.min(100, v.n)}%"></i><span>${esc(String(v.day).slice(5))}</span></div>`).join("")}</div>`
      : `<p class="muted">Aucune visite enregistrée.</p>`}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Médias</h2></div>
    <p class="muted">Supprime les images qui ne sont plus utilisées par un produit, une section ou le design.</p>
    <form method="post" action="/admin/cleanup-uploads"><button class="btn btn-primary">Nettoyer les fichiers orphelins</button></form>
  </section>
</main></div>`)


/* ============================== DASHBOARD ============================== */
const canSee = (user, key) => {
  if (!user || user.isOwner || user.role === "admin") return true
  const p = user.perms
  if (!p) return true
  if (p === "all" || (p.has && p.has("all"))) return true
  if (p.has) return p.has(key)
  if (Array.isArray(p)) return p.includes(key)
  return true
}
const navIf = (user, key, html) => (canSee(user, key) ? html : "")

const deliveryNote = (store) => {
  const carrier = CARRIERS.active(store.id)
  if (!carrier) return "Aucun transporteur branché. Les prix viennent de tes frais de livraison. Tu peux décocher ce choix."
  const info = DZ.courierOf(carrier)
  const creds = info ? DZ.credentialsOf(carrier, info) : {}
  const missing = ((info && info.requiredCredentials) || []).filter((k) => !creds[k])
  if (missing.length) return carrier.label + " est choisi, mais le jeton manque. Colle-le dans Transporteur. En attendant, ce sont tes frais. Tu peux décocher ce choix."
  if (info && info.capabilities && info.capabilities.rates) return "Les prix viennent de " + carrier.label + ". S'il ne répond pas, on prend tes frais. Tu peux décocher ce choix."
  return carrier.label + " ne publie pas de tarif. On prend tes frais de livraison. Tu peux décocher ce choix."
}

const historyCard = (phone) => {
  const h = HIST.summary(phone)
  if (!h.ok) return ""
  return `<aside class="hist-card">
    <b>Ce numéro, partout</b>
    <p>Livré, annulé, retour. Pas le nom, pas l'adresse, pas la boutique.</p>
    <div class="hist-row">
      <span><b>${h.livre}</b> livré</span>
      <span><b>${h.annule}</b> annulé</span>
      <span><b>${h.retour}</b> retour</span>
    </div>
    <a class="hist-more" href="/dashboard/historique?phone=${encodeURIComponent(h.phone)}">Vérifier un autre numéro</a>
  </aside>`
}

const bellHtml = (desktop) => `<div class="ndz-bell${desktop ? " ndz-bell-desk" : " ndz-bell-mob"}" data-bell>
  <button type="button" class="ndz-bell-btn" aria-label="Notifications" aria-expanded="false">
    ${icon("bell", 18)}<i data-bell-n hidden>0</i>
  </button>
  <div class="ndz-bell-panel" hidden>
    <div class="ndz-bell-head"><b>Notifications</b><button type="button" data-bell-read>Tout lu</button></div>
    <div data-bell-list><p class="muted">Rien pour le moment.</p></div>
  </div>
</div>${desktop ? bellScript() : ""}`

const bellScript = () => `<script>
(function () {
  var root = document.querySelector("[data-bell]")
  if (!root || root.getAttribute("data-on")) return
  document.querySelectorAll("[data-bell]").forEach(function (el) { el.setAttribute("data-on", "1") })
  var seen = null
  var ding = new Audio("/sons/shopify-sales.mp3")
  ding.preload = "auto"
  function nodes() { return Array.prototype.slice.call(document.querySelectorAll("[data-bell]")) }
  function placeDesk() {
    var desk = document.querySelector(".ndz-bell-desk")
    var head = document.querySelector(".dash-head")
    if (!desk || !head || head.contains(desk)) return
    var actions = head.querySelector(".head-actions")
    if (!actions) {
      actions = document.createElement("div")
      actions.className = "head-actions"
      Array.prototype.slice.call(head.children).forEach(function (el, i) {
        if (i > 0) actions.appendChild(el)
      })
      head.appendChild(actions)
    }
    actions.appendChild(desk)
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", placeDesk)
  else placeDesk()
  function ring() {
    nodes().forEach(function (box) {
      var btn = box.querySelector(".ndz-bell-btn")
      if (!btn) return
      btn.classList.remove("ring")
      void btn.offsetWidth
      btn.classList.add("ring")
    })
    try {
      ding.currentTime = 0
      var p = ding.play()
      if (p && p.catch) p.catch(function () {})
    } catch (e) {}
  }
  var heard = {}
  var ticket = 0
  function arrive(it) {
    if (!it || !it.id || heard[it.id]) return
    heard[it.id] = 1
    toast(it)
    ring()
    if (document.hidden && window.Notification && Notification.permission === "granted") {
      try {
        var note = new Notification(it.title, { body: it.body || "Nouvelle commande", silent: true })
        note.onclick = function () {
          window.focus()
          if (it.href) window.location.href = it.href
        }
      } catch (err) {}
    }
  }
  function paint(data) {
    var n = data.unread || 0
    var items = data.items || []
    nodes().forEach(function (box) {
      var badge = box.querySelector("[data-bell-n]")
      if (badge) {
        badge.textContent = n > 9 ? "9+" : String(n)
        badge.hidden = n < 1
      }
      var list = box.querySelector("[data-bell-list]")
      if (!list) return
      list.innerHTML = items.length ? items.map(function (it) {
        return '<a class="ndz-bell-item' + (it.read_at ? "" : " new") + '" href="' + (it.href || "#") + '" data-id="' + it.id + '"><b>' + it.title + '</b><span>' + (it.body || "") + '</span></a>'
      }).join("") : '<p class="muted">Rien pour le moment.</p>'
    })
    if (seen == null) items.forEach(function (it) { if (it.id) heard[it.id] = 1 })
    var first = items.length ? items[0] : null
    if (seen != null && n > seen && first) arrive(first)
    seen = n
  }
  function toast(it) {
    var old = document.querySelector(".ndz-toast")
    if (old) old.remove()
    var el = document.createElement("a")
    el.className = "ndz-toast"
    el.href = it.href || "/dashboard/orders"
    el.innerHTML = "<b>" + it.title + "</b><span>" + (it.body || "Nouvelle commande") + "</span>"
    document.body.appendChild(el)
    setTimeout(function () { el.classList.add("on") }, 20)
    setTimeout(function () { el.classList.remove("on"); setTimeout(function () { el.remove() }, 300) }, 5000)
  }
  function load() {
    var mine = ++ticket
    fetch("/dashboard/notices", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (data) { if (data && mine === ticket) paint(data) })
      .catch(function () {})
  }
  function openLive() {
    if (!window.EventSource) return
    var live = new EventSource("/dashboard/notices/flux")
    live.onopen = function () { document.documentElement.setAttribute("data-live", "1") }
    live.addEventListener("notice", function (ev) {
      var it = null
      try { it = JSON.parse(ev.data) } catch (err) { it = null }
      if (it) arrive(it)
      load()
    })
  }
  openLive()
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ndz-bell-btn")
    if (btn) {
      var box = btn.closest("[data-bell]")
      var panel = box.querySelector(".ndz-bell-panel")
      var open = panel.hidden
      nodes().forEach(function (b) {
        var p = b.querySelector(".ndz-bell-panel")
        if (p) p.hidden = true
        var t = b.querySelector(".ndz-bell-btn")
        if (t) t.setAttribute("aria-expanded", "false")
      })
      panel.hidden = !open
      btn.setAttribute("aria-expanded", open ? "true" : "false")
      return
    }
    if (e.target.closest("[data-bell-read]")) {
      e.preventDefault()
      fetch("/dashboard/notices/lu", { method: "POST", headers: { Accept: "application/json" } }).then(load)
      return
    }
    var item = e.target.closest(".ndz-bell-item")
    if (item) {
      fetch("/dashboard/notices/lu", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: "id=" + encodeURIComponent(item.getAttribute("data-id") || "") })
    }
    if (!e.target.closest("[data-bell]")) {
      nodes().forEach(function (b) {
        var p = b.querySelector(".ndz-bell-panel")
        if (p) p.hidden = true
      })
    }
  })
  load()
  setInterval(load, 30000)
})()
</script>`

const aiBall = (mode) => {
  const design = mode === "design"
  const chips = design
    ? [
        ["Grille des produits déjà en ligne, bandeau livraison, titre à droite. Pas d'article inventé.", "Mes produits"],
        ["Titre à droite, carrousel des produits, avis, questions fréquentes.", "Avis et FAQ"],
        ["Points forts, bandeau livraison, pied simple.", "Livraison"],
      ]
    : mode === "vitrine"
    ? [
        ["Quelles pages sont en ligne ?", "Pages"],
        ["Le téléphone est-il rempli ?", "Contact"],
        ["Combien de visites ?", "Visites"],
      ]
    : [
        ["Ya quoi dans la boutique ?", "Ya quoi"],
        ["Qu'est-ce qui est en rupture ?", "Stock"],
        ["Combien de commandes en attente ?", "Commandes"],
        ["Signale ce qui attend", "Signaler"],
      ]
  return `
<div class="ndz-ai" id="ndzAi" data-mode="${design ? "design" : "ask"}">
  <div class="ndz-ai-panel" id="ndzAiPanel" hidden>
    <div class="ndz-ai-head"><b>${design ? "IA du site" : "Assistant"}</b><button type="button" id="ndzAiX" aria-label="Fermer">✕</button></div>
    <div class="ndz-ai-log" id="ndzAiLog"></div>
    <div class="ndz-ai-chips">
      ${chips.map(([q, label]) => `<button type="button" data-aiq="${q.replace(/"/g, "&quot;")}">${label}</button>`).join("")}
    </div>
    <form class="ndz-ai-form" id="ndzAiForm">
      <input id="ndzAiQ" maxlength="${design ? 800 : 500}" placeholder="${design ? "Décris la page" : "Une question"}" autocomplete="off" aria-label="${design ? "Description de la page" : "Question"}">
      <button type="submit" aria-label="Envoyer">↑</button>
    </form>
  </div>
  <button type="button" class="ndz-ai-ball" id="ndzAiBall" aria-label="Ouvrir l'assistant" aria-expanded="false">${icon("robot", 30)}</button>
</div>
<style>
.ndz-ai,.ndz-ai-ball,.ndz-ai-panel{position:fixed !important;z-index:2147483000 !important}
.ndz-ai-ball{right:18px;bottom:18px;width:68px;height:68px;border:3px solid #fff;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 0 0 4px #111, 0 16px 36px rgba(0,0,0,.35)}
.ndz-ai-ball svg{display:block;width:32px;height:32px}
.ndz-ai-panel{right:18px;bottom:100px;width:min(380px,calc(100vw - 28px));height:min(520px,calc(100vh - 130px));background:#fff;color:#111;border-radius:28px;box-shadow:0 22px 60px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden}
.ndz-ai-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
.ndz-ai-head b{font-size:15px}
.ndz-ai-head button{border:0;background:transparent;font:inherit;font-size:16px;cursor:pointer}
.ndz-ai-log{flex:1;overflow:auto;padding:8px 14px 12px;display:flex;flex-direction:column;gap:8px}
.ndz-bub{max-width:84%;padding:10px 12px;border-radius:18px;font-size:14px;line-height:1.4;white-space:pre-wrap}
.ndz-bub.bot{align-self:flex-start;background:#f3f1ec;border-bottom-left-radius:6px}
.ndz-bub.me{align-self:flex-end;background:#111;color:#fff;border-bottom-right-radius:6px}
.ndz-ai-chips{display:flex;gap:6px;overflow:auto;padding:0 12px 8px}
.ndz-ai-chips button{border:1px solid #e4e0d8;background:#fff;border-radius:999px;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.ndz-ai-form{display:flex;gap:8px;padding:10px 12px 12px;border-top:1px solid #eee}
.ndz-ai-form input{flex:1;border:1px solid #e4e0d8;border-radius:999px;padding:10px 12px;font:inherit}
.ndz-ai-form button{width:40px;height:40px;border:0;border-radius:50%;background:#111;color:#fff;font:inherit;cursor:pointer}
@media (max-width:760px){
  .ndz-ai-ball{right:14px !important;bottom:92px !important}
  .ndz-ai-panel{right:12px !important;left:12px !important;bottom:168px !important;width:auto !important;height:min(68vh,520px) !important}
}
</style>
<script>
(function () {
  if (window.__ndzAi) return
  window.__ndzAi = 1
  var root = document.getElementById("ndzAi")
  if (root && root.parentNode !== document.body) document.body.appendChild(root)
  var ball = document.getElementById("ndzAiBall")
  var panel = document.getElementById("ndzAiPanel")
  var log = document.getElementById("ndzAiLog")
  var form = document.getElementById("ndzAiForm")
  var box = document.getElementById("ndzAiQ")
  if (!ball || !panel) return
  function bub(text, mine) {
    var d = document.createElement("div")
    d.className = "ndz-bub " + (mine ? "me" : "bot")
    d.textContent = text
    log.appendChild(d)
    log.scrollTop = log.scrollHeight
  }
  var design = root.getAttribute("data-mode") === "design"
  bub(design
    ? "Décris la boutique. Je pose seulement des sections qui existent déjà, en brouillon. Je ne publie pas."
    : "Je réponds avec ce qui est dans la boutique. Signaler met une ligne dans la cloche. Pas de mail, pas de WhatsApp.", false)
  function open(on) {
    panel.hidden = !on
    ball.setAttribute("aria-expanded", on ? "true" : "false")
    if (on) box.focus()
  }
  ball.addEventListener("click", function () { open(panel.hidden) })
  document.getElementById("ndzAiX").addEventListener("click", function () { open(false) })
  /* fermé au chargement : il ne s'ouvre que si on clique la pastille */
  function ask(text) {
    var q = String(text || "").trim()
    if (!q) return
    bub(q, true)
    box.value = ""
    var url = design ? "/dashboard/assistant/site" : "/dashboard/assistant/ask"
    var body = design ? { prompt: q } : { q: q }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json() }).then(function (d) {
      if (design) {
        if (!d || !d.ok) { bub((d && d.error) || "Impossible.", false); return }
        bub((d.summary || "Brouillon posé.") + " Rien n'est publié.", false)
        setTimeout(function () { location.href = "/dashboard/design?ia=1" }, 700)
        return
      }
      bub((d && d.answer) || "Pas de réponse.", false)
    }).catch(function () { bub("Je n'arrive pas à répondre pour le moment.", false) })
  }
  form.addEventListener("submit", function (e) { e.preventDefault(); ask(box.value) })
  document.querySelectorAll("[data-aiq]").forEach(function (b) {
    b.addEventListener("click", function () { ask(b.getAttribute("data-aiq")) })
  })
})()
</script>`
}

const dashLayout = (user, store, content, active) => {
  /* les chiffres de la barre latérale : commandes, paniers, stock, avis… */
  const B = BADGES.counts(store)
  const vitrine = store.site_kind === "vitrine"
  const PAGE = {
    home: "Accueil", orders: "Commandes", products: "Produits", stock: "Stock",
    paniers: "Paniers", relances: "Relances", stats: "Statistiques",
    categories: "Catégories", promos: "Codes promo", design: "Design",
    form: "Formulaire", transporteur: "Transporteur", shipping: "Livraison",
    paiement: "Paiement", social: "Réseaux", settings: "Réglages",
    landings: "Pages de vente", pages: "Pages", livraison: "Livraison",
    reviews: "Avis", customers: "Clients", marketing: "Marketing",
    mails: "E-mails", equipe: "Équipe", assistant: "Assistant", visits: "Visites", leads: "Reçus",
  }
  const first = esc(String(user.name || "").split(" ")[0] || "")
  const barTitle = active === "home" ? `Bonjour, ${first}` : esc(PAGE[active] || store.name)
  const docTitle = active && active !== "home" && PAGE[active]
    ? `${PAGE[active]} — ${store.name}`
    : `${store.name} — Tableau de bord`
  const tab = (id, href, ico, label, n, tone) =>
    `<a class="${active === id ? "on" : ""}" href="${href}">${icon(ico, 20)}<span>${label}</span>${n ? `<i class="${tone || ""}">${n}</i>` : ""}</a>`
  return page(
  docTitle,
  `
<div class="dash">
  <header class="dash-mobile">
    <button type="button" class="dm-burger" id="dashBurger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="dashSide">${icon("menu", 19)}</button>
    <a class="dm-mark" href="/dashboard" aria-label="Accueil">${esc((store.name || "?")[0].toUpperCase())}</a>
    <form class="dm-search" action="${vitrine ? "/dashboard/pages" : "/dashboard/orders"}" method="get">
      ${icon("search", 15)}
      <input type="search" name="q" placeholder="Rechercher" aria-label="${vitrine ? "Rechercher une page" : "Rechercher une commande"}">
    </form>
    ${bellHtml()}
    <a class="dm-shop" href="/${esc(store.slug)}" target="_blank" rel="noopener" aria-label="${vitrine ? "Voir mon site" : "Voir ma boutique"}">${icon("external", 16)}</a>
  </header>
  <div class="dash-scrim" id="dashScrim" hidden></div>
  <aside class="dash-side" id="dashSide">
    <button type="button" class="dash-close" id="dashClose" aria-label="Fermer le menu">✕</button>
    <a class="brand dash-brand" href="/"><span class="dash-bolt">${authBolt}</span><span>NovaDZ</span></a>
    <div class="dash-store">
      <div class="dash-tile">${esc((store.name || "?")[0].toUpperCase())}</div>
      <div><b>${esc(store.name)}</b><span>${vitrine ? `<i class="dash-kind">Vitrine</i>` : ""}${user.support ? "vue admin" : (store.domain ? esc(store.domain) : "/" + esc(store.slug))}</span></div>
    </div>
    ${(user.stores || []).length > 1 ? `<form class="store-switch" method="post" action="/dashboard/utiliser-boutique">
      <label>Boutique<select name="store_id" onchange="this.form.submit()">${user.stores.map((s) => `<option value="${s.id}"${s.id === store.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
    </form>` : ""}
    <nav class="dash-nav">
      ${vitrine ? `<p class="dash-group">Site</p>
      <a class="${active === "home" ? "on" : ""}" href="/dashboard">${icon("grid", 16)} Vue d'ensemble</a>
      <a class="${active === "visits" ? "on" : ""}" href="/dashboard/visites">${icon("chart", 16)} Visites</a>
      <p class="dash-group">Contenu</p>
      ${navIf(user, "design", `<a class="${active === "pages" ? "on" : ""}" href="/dashboard/pages">${icon("receipt", 16)} <span>Pages</span><b class="nav-count">${B.pages || 0}</b></a>`)}
      ${navIf(user, "design", `<a class="${active === "design" ? "on" : ""}" href="/dashboard/design/themes">${icon("palette", 16)} Design</a>`)}
      <p class="dash-group">Contact</p>
      <a class="${active === "leads" ? "on" : ""}" href="/dashboard/recus">${icon("chat", 16)} <span>Reçus</span>${BADGES.pill(B.leads)}</a>
      ${navIf(user, "shop", `<a class="${active === "social" ? "on" : ""}" href="/dashboard/reseaux">${icon("chat", 16)} Réseaux sociaux</a>`)}
      ${navIf(user, "settings", `<a class="${active === "mails" ? "on" : ""}" href="/dashboard/mails">${icon("chat", 16)} E-mails</a>`)}
      ${navIf(user, "team", `<a class="${active === "equipe" ? "on" : ""}" href="/dashboard/equipe">${icon("user", 16)} Équipe</a>`)}
      ${navIf(user, "settings", `<a class="${active === "settings" ? "on" : ""}" href="/dashboard/settings">${icon("settings", 16)} Réglages</a>`)}` : `<p class="dash-group">Ventes</p>
      <a class="${active === "home" ? "on" : ""}" href="/dashboard">${icon("grid", 16)} Vue d'ensemble</a>
      ${navIf(user, "orders", `<a class="${active === "stats" ? "on" : ""}" href="/dashboard/stats">${icon("chart", 16)} Statistiques</a>`)}
      ${navIf(user, "orders", `<a class="${active === "orders" ? "on" : ""}" href="/dashboard/orders" title="${B.toTreat} commande(s) à traiter">
        ${icon("receipt", 16)} <span>Commandes</span>${BADGES.pill(B.toTreat)}</a>`)}
      ${navIf(user, "orders", `<a class="${active === "paniers" ? "on" : ""}" href="/dashboard/paniers" title="${B.carts} panier(s) abandonné(s)">
        ${icon("cart", 16)} <span>Paniers abandonnés</span>${BADGES.pill(B.carts, "warn")}</a>`)}
      ${navIf(user, "orders", `<a class="${active === "relances" ? "on" : ""}" href="/dashboard/relances" title="${B.relances} relance(s) en attente">
        ${icon("history", 16)} <span>Relances</span>${BADGES.pill(B.relances, "warn")}</a>`)}

      ${navIf(user, "products", `<p class="dash-group">Catalogue</p>
      <a class="${active === "products" ? "on" : ""}" href="/dashboard/products" title="${B.products} produit(s)">
        ${icon("box", 16)} <span>Produits</span><b class="nav-count">${B.products}</b></a>
      <a class="${active === "stock" ? "on" : ""}" href="/dashboard/stock" title="${B.lowStock} produit(s) en stock faible ou rupture">
        ${icon("layers", 16)} <span>Stock</span>${BADGES.pill(B.lowStock, "danger")}</a>
      <a class="${active === "categories" ? "on" : ""}" href="/dashboard/categories">${icon("store", 16)} Catégories</a>
      <a class="${active === "promos" ? "on" : ""}" href="/dashboard/discounts">${icon("cash", 16)} Codes promo</a>`)}

      ${(canSee(user, "design") || canSee(user, "shop") || canSee(user, "settings") || canSee(user, "team")) ? `<p class="dash-group">Boutique</p>` : ""}
      ${navIf(user, "design", `<a class="${active === "design" ? "on" : ""}" href="/dashboard/design/themes">${icon("palette", 16)} Design</a>`)}
      ${navIf(user, "design", `<a class="${active === "form" ? "on" : ""}" href="/dashboard/formulaire">${icon("edit", 16)} Formulaire</a>`)}
      ${navIf(user, "shop", `<a class="${active === "transporteur" ? "on" : ""}" href="/dashboard/transporteur">${icon("truck", 16)} Transporteur</a>`)}
      ${navIf(user, "shop", `<a class="${active === "shipping" ? "on" : ""}" href="/dashboard/shipping">${icon("cash", 16)} Frais de livraison</a>`)}
      ${navIf(user, "shop", `<a class="${active === "paiement" ? "on" : ""}" href="/dashboard/paiement">${icon("card", 16)} Paiement</a>`)}
      ${navIf(user, "shop", `<a class="${active === "social" ? "on" : ""}" href="/dashboard/reseaux">${icon("chat", 16)} Réseaux sociaux</a>`)}
      ${navIf(user, "settings", `<a class="${active === "mails" ? "on" : ""}" href="/dashboard/mails">${icon("chat", 16)} E-mails</a>`)}
      ${navIf(user, "team", `<a class="${active === "equipe" ? "on" : ""}" href="/dashboard/equipe">${icon("user", 16)} Équipe</a>`)}
      ${navIf(user, "settings", `<a class="${active === "settings" ? "on" : ""}" href="/dashboard/settings">${icon("settings", 16)} Réglages</a>`)}

      ${(canSee(user, "design") || canSee(user, "shop") || canSee(user, "orders")) ? `<details class="dash-more" ${["pages", "landings", "reviews", "customers", "marketing", "livraison", "shipping"].includes(active) ? "open" : ""}>
        <summary>${icon("menuDots", 15)} Plus d'outils${BADGES.pill(B.reviews, "warn")}</summary>
        ${navIf(user, "design", `<a class="${active === "landings" ? "on" : ""}" href="/dashboard/landings">${icon("store", 15)} Pages de vente</a>`)}
        ${navIf(user, "design", `<a class="${active === "pages" ? "on" : ""}" href="/dashboard/pages">${icon("receipt", 15)} Pages</a>`)}
        ${navIf(user, "shop", `<a class="${active === "livraison" ? "on" : ""}" href="/dashboard/livraison">${icon("grid", 15)} Statistiques livraison</a>`)}
        ${navIf(user, "shop", `<a class="${active === "reviews" ? "on" : ""}" href="/dashboard/reviews" title="${B.reviews} avis en attente">
          ${icon("check", 15)} <span>Avis</span>${BADGES.pill(B.reviews, "warn")}</a>`)}
        ${navIf(user, "orders", `<a class="${active === "customers" ? "on" : ""}" href="/dashboard/customers">${icon("user", 15)} Clients</a>`)}
        ${navIf(user, "shop", `<a class="${active === "marketing" ? "on" : ""}" href="/dashboard/marketing">${icon("shield", 15)} Anti-fraude &amp; pixels</a>`)}
      </details>` : ""}`}
    </nav>
    <div class="dash-foot">
      <a href="/${esc(store.slug)}" target="_blank">${icon("external", 15)} ${user.support ? "Voir le site" : (vitrine ? "Voir mon site" : "Voir ma boutique")}</a>
      ${user.role === "admin" ? `<a href="/admin">${icon("shield", 15)} Admin plateforme</a>` : ""}
      <a href="/logout">${icon("logout", 15)} Déconnexion</a>
    </div>
  </aside>
  ${bellHtml(true)}
  <main class="dash-main">${user.support ? `<div class="support-bar"><span class="support-ico">${icon("shield", 15)}</span><p>Tu regardes <b>${esc(user.support.name)}</b>. Ce n'est pas ta boutique.</p><form method="post" action="/admin/quitter"><button class="btn btn-ghost btn-sm" type="submit">Quitter</button></form></div>` : ""}${user.flash ? `<div class="alert">${esc(user.flash)}</div>` : ""}${content}</main>
  <nav class="app-tab" aria-label="Navigation">
    ${tab("home", "/dashboard", "grid", "Accueil")}
    ${vitrine ? `${navIf(user, "design", tab("pages", "/dashboard/pages", "receipt", "Pages"))}
    ${navIf(user, "design", tab("design", "/dashboard/design/themes", "palette", "Design"))}` : `${navIf(user, "orders", tab("orders", "/dashboard/orders", "receipt", "Commandes", B.toTreat))}
    ${navIf(user, "products", tab("products", "/dashboard/products", "box", "Produits"))}
    ${navIf(user, "products", tab("stock", "/dashboard/stock", "layers", "Stock", B.lowStock, "bad"))}
    ${active === "relances" ? tab("relances", "/dashboard/relances", "history", "Relances", B.relances, "warn") : ""}`}
    <button type="button" id="appMore" class="${(vitrine ? ["home", "pages", "design"] : ["home", "orders", "products", "stock", "relances"]).includes(active) ? "" : "on"}">${icon("menu", 20)}<span>Plus</span></button>
  </nav>
  ${aiBall(vitrine ? "vitrine" : "")}
</div>
<script data-dash-nav>
(function () {
  var dash = document.querySelector('.dash')
  var side = document.getElementById('dashSide')
  var scrim = document.getElementById('dashScrim')
  var burger = document.getElementById('dashBurger')
  var close = document.getElementById('dashClose')
  if (!dash || !side || !burger) return
  function open(on) {
    dash.classList.toggle('nav-open', on)
    burger.setAttribute('aria-expanded', on ? 'true' : 'false')
    if (scrim) scrim.hidden = !on
    document.body.style.overflow = on ? 'hidden' : ''
  }
  burger.addEventListener('click', function () { open(!dash.classList.contains('nav-open')) })
  var more = document.getElementById('appMore')
  if (more) more.addEventListener('click', function () { open(true) })
  if (close) close.addEventListener('click', function () { open(false) })
  if (scrim) scrim.addEventListener('click', function () { open(false) })
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false) })
  side.addEventListener('click', function (e) { if (e.target.closest('a')) open(false) })
  /* téléphone : une petite ligne par enregistrement (titre + méta), pas une grande carte */
  document.querySelectorAll('.dash table.table').forEach(function (t) {
    if (t.classList.contains('fld-table')) return
    t.classList.add('m-list')
    var ths = t.querySelectorAll('thead th')
    var labels = Array.prototype.map.call(ths, function (th) { return th.textContent.trim() })
    t.querySelectorAll('tbody tr').forEach(function (tr) {
      var titleSet = false
      Array.prototype.forEach.call(tr.children, function (td, i) {
        if (td.tagName !== 'TD') return
        if (labels[i] && !td.getAttribute('data-label') && td.textContent.trim()) td.setAttribute('data-label', labels[i])
        var raw = td.textContent.replace(/\s+/g, ' ').trim()
        var more = td.classList.contains('stock-cell') || td.querySelector('.stock-form')
        /* une cellule avec une photo ET un nom n'est pas une vignette seule */
        var thumb = raw.length < 4 && (td.classList.contains('t-thumb') || (td.querySelector('img, .tile') && !td.querySelector('b, .stock-title, .stock-prod, .ord-item')))
        var act = td.classList.contains('t-actions') || td.classList.contains('right') || td.querySelector('.icon-btn, .btn, .link-danger')
        if (more) { td.classList.add('ml-more'); return }
        if (thumb && !titleSet) { td.classList.add('ml-thumb'); return }
        if (!titleSet) { td.classList.add('ml-title'); titleSet = true; return }
        if (act) { td.classList.add('ml-act'); return }
        var txt = td.textContent.replace(/\\s+/g, ' ').trim()
        if (!txt || txt === '—' || txt === '-' || txt === '–') { td.classList.add('ml-skip'); return }
        td.classList.add('ml-meta')
      })
      /* le prix, le stock, le statut passent sur une seule ligne sous le titre */
      var titleTd = tr.querySelector('.ml-title')
      var metas = tr.querySelectorAll('.ml-meta')
      if (!titleTd || !metas.length) return
      var parts = []
      var aside = null
      var sub = titleTd.querySelector('small, .muted')
      if (sub) {
        var st = sub.textContent.replace(/\\s+/g, ' ').trim()
        if (st && st.length <= 22 && st !== '—') parts.push(st)
      }
      Array.prototype.forEach.call(metas, function (td) {
        var sm = td.querySelector('small')
        var main = td.textContent.replace(/\\s+/g, ' ').trim()
        if (sm) {
          var rest = main.replace(sm.textContent, '').replace(/\\s+/g, ' ').trim()
          main = rest ? rest + ' · ' + sm.textContent.replace(/\\s+/g, ' ').trim() : sm.textContent.replace(/\\s+/g, ' ').trim()
        }
        var nice = { annulee: 'annulée', confirmee: 'confirmée', reportee: 'reportée', livree: 'livrée', a_verifier: 'à appeler', expediee: 'expédiée' }
        if (nice[main]) main = nice[main]
        var isDate = main.length >= 16 && main.charAt(4) === '-' && main.charAt(7) === '-' && main.charAt(10) === ' '
        if (isDate) {
          aside = main.slice(8, 10) + '/' + main.slice(5, 7) + ' ' + main.slice(11, 16)
        } else {
          var digits = main.length > 0
          for (var k = 0; k < main.length; k++) {
            var c = main.charCodeAt(k)
            if (c < 48 || c > 57) digits = false
          }
          if (digits) {
            var lab = (td.getAttribute('data-label') || '').toLowerCase()
            if (lab) main = lab + ' ' + main
          }
          if (main && main !== '—') parts.push(main)
        }
        td.classList.remove('ml-meta')
        td.classList.add('ml-skip')
      })
      if (parts.length) {
        var line = document.createElement('span')
        line.className = 'ml-line'
        line.textContent = parts.join(' · ')
        titleTd.appendChild(line)
      }
      if (aside) {
        var as = document.createElement('span')
        as.className = 'ml-aside'
        as.textContent = aside
        titleTd.appendChild(as)
      }
      if (tr.querySelector('.ml-more') && !tr.querySelector('.ml-adjust')) {
        var adj = document.createElement('button')
        adj.type = 'button'
        adj.className = 'ml-adjust'
        adj.setAttribute('aria-label', 'Ajuster le stock')
        adj.setAttribute('aria-expanded', 'false')
        adj.textContent = '±'
        adj.addEventListener('click', function (e) {
          e.preventDefault()
          var on = tr.classList.toggle('is-open')
          adj.setAttribute('aria-expanded', on ? 'true' : 'false')
        })
        titleTd.appendChild(adj)
      }
    })
  })
  /* un bout de carte coupé contre la barre disparaît ; dès qu'on scrolle, elle revient entière */
  var main = document.querySelector('.dash-main')
  function trimDock() {
    if (!main) return
    var wide = window.innerWidth > 920
    var boxes = main.querySelectorAll('.ord-card, .panel, .stat, .kpi, .m-list tbody tr, .form > label, .lang-opt')
    boxes.forEach(function (el) {
      el.classList.remove('dock-sliver')
      el.classList.remove('dock-clip')
      el.style.maxHeight = ''
    })
    if (wide) return
    var edge = main.getBoundingClientRect().bottom - 1
    boxes.forEach(function (el) {
      var r = el.getBoundingClientRect()
      var visible = edge - r.top
      var hidden = r.bottom - edge
      if (r.top >= edge - 2 || hidden < 8) return
      if (visible < 72) el.classList.add('dock-sliver')
      else if (hidden > 24 && (el.classList.contains('panel') || el.classList.contains('ord-card'))) {
        el.style.maxHeight = Math.max(72, Math.floor(visible - 12)) + 'px'
        el.classList.add('dock-clip')
      }
    })
  }
  if (main) {
    trimDock()
    main.addEventListener('scroll', trimDock, { passive: true })
    window.addEventListener('resize', trimDock)
  }
  /* 20 lignes, puis page 2, puis 20, puis page 3 — sur chaque liste */
  function pageList(host, nodes, size) {
    var rows = []
    for (var i = 0; i < nodes.length; i++) rows.push(nodes[i])
    if (rows.length <= size) return
    var pages = Math.ceil(rows.length / size)
    var nav = document.createElement('nav')
    nav.className = 'list-pages'
    nav.setAttribute('aria-label', 'Pages')
    var label = document.createElement('span')
    label.textContent = 'Page'
    nav.appendChild(label)
    var buttons = []
    function show(n) {
      for (var i = 0; i < rows.length; i++) rows[i].style.display = (i >= n * size && i < n * size + size) ? '' : 'none'
      for (var j = 0; j < buttons.length; j++) {
        var on = j === n
        buttons[j].classList.toggle('on', on)
        if (on) buttons[j].setAttribute('aria-current', 'page')
        else buttons[j].removeAttribute('aria-current')
      }
    }
    for (var p = 0; p < pages; p++) {
      var b = document.createElement('button')
      b.type = 'button'
      b.textContent = String(p + 1)
      b.setAttribute('aria-label', 'Page ' + (p + 1))
      b.addEventListener('click', function () { show(Number(this.textContent) - 1) })
      buttons.push(b)
      nav.appendChild(b)
    }
    host.insertAdjacentElement('afterend', nav)
    show(0)
  }
  document.querySelectorAll('.dash table.table').forEach(function (table) {
    if (table.classList.contains('fld-table') || table.getAttribute('data-nopage')) return
    pageList(table, table.querySelectorAll('tbody tr'), 20)
  })
  document.querySelectorAll('.ord-list').forEach(function (list) {
    pageList(list, list.querySelectorAll('.ord-card'), 20)
  })
})();
</script>`
  )
}

/**
 * Guide de démarrage : 4 étapes concrètes, avec l'état réel de la boutique.
 * Il disparaît une fois les 4 étapes terminées (le marchand n'a plus besoin d'être guidé).
 */
const startGuide = (store, stats) => {
  if (store.site_kind === "vitrine") {
    const steps = [
      { done: Boolean(store.theme), href: "/dashboard/design/themes", title: "Choisir le design",
        sub: "Couleurs, logo, mise en page. C'est le visage du site." },
      { done: stats.pageCount > 0, href: "/dashboard/pages", title: "Écrire une page",
        sub: "À propos, services, portfolio. Ce que les gens lisent." },
      { done: Boolean(String(store.phone || "").trim()), href: "/dashboard/settings", title: "Mettre le contact",
        sub: "Téléphone et wilaya : on sait comment vous joindre." },
      { done: stats.visits > 0, href: `/${store.slug}`, title: "Partager votre site",
        sub: `Votre adresse : /${store.slug}` },
    ]
    const done = steps.filter((s) => s.done).length
    if (done === steps.length) return ""
    return startBlock(store, steps, done)
  }
  const PAY = require("./payments")
  const steps = [
    { done: stats.productCount > 0, href: "/dashboard/products/new", title: "Ajouter un produit",
      sub: "Titre, prix, photo. C'est ce que vos clients verront." },
    { done: Boolean(String(store.phone || "").trim()), href: "/dashboard/settings", title: "Mettre vos coordonnées",
      sub: "Téléphone et wilaya : rassure l'acheteur et remplit la facture." },
    { done: PAY.list(store).length > 0, href: "/dashboard/paiement", title: "Choisir un moyen de paiement",
      sub: "À la livraison, CIB, CCP : vous décidez." },
    { done: stats.orderCount > 0, href: `/${store.slug}`, title: "Partager votre boutique",
      sub: `Votre adresse : /${store.slug}` },
  ]
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return ""
  return startBlock(store, steps, done)
}

const startBlock = (store, steps, done) => {
  return `
<section class="start">
  <div class="start-head">
    <div><h2>Pour commencer</h2><p>Quatre étapes, dans l'ordre. Vous pouvez tout changer ensuite.</p></div>
    <span class="start-progress">${done}/${steps.length}</span>
  </div>
  <div class="start-list">
    ${steps.map((s, i) => `<a class="start-item ${s.done ? "done" : ""}" href="${s.href}" ${s.href.startsWith("http") || s.href.startsWith("/" + store.slug) ? 'target="_blank" rel="noopener"' : ""}>
      <span class="start-dot">${s.done ? icon("check", 12) : i + 1}</span>
      <span><b>${esc(s.title)}</b><span>${esc(s.sub)}</span></span>
    </a>`).join("")}
  </div>
</section>`
}

const dashForm = (user, store, list, ok) => {
  const look = CF.lookOf(store)
  const typeName = (f) => f.type === "wilaya" ? "Wilaya" : f.type === "commune" ? "Commune" : f.type === "select" ? "Liste" : f.type === "tel" ? "Téléphone" : f.type === "email" ? "E-mail" : f.type === "textarea" ? "Texte long" : "Texte"
  const rows = CF.pieces(store, { all: true })
  const gone = CF.pieces(store, { all: true }).length
    ? CF.BLOCKS.filter((b) => (look.off || []).includes(b.id)).map((b) => ({ id: b.id, name: b.hint }))
    : []
  const have = new Set(list.map((f) => f.key))
  const missing = CF.DEFAULT_FIELDS.filter((f) => !have.has(f.key)).map((f) => ({ id: f.key, name: f.label }))
  const restore = [...gone, ...missing]
  const pieceRow = (p, i) => {
    const f = p.field
    const type = f ? f.type : p.id
    const wide = f && f.width === "full" ? "full" : "half"
    const opts = f && Array.isArray(f.options) ? f.options.join(", ") : ""
    const ph = f ? (f.placeholder || "") : ""
    return `<li class="fld-row" data-piece="${esc(p.id)}" data-kind="${esc(p.kind)}" data-type="${esc(type)}">
      <span class="fm-grip" aria-label="Glisser"></span>
      <input name="label_${i}" value="${esc(p.label)}" maxlength="${p.id === "paynote" ? 90 : 40}" class="fld-label" aria-label="Nom">
      <button type="button" class="fm-x" data-remove>Enlever</button>
      <input type="hidden" name="key_${i}" value="${esc(p.id)}">
      <input type="hidden" name="kind_${i}" value="${esc(p.kind)}">
      <input type="hidden" name="pos_${i}" value="${i}" data-pos>
      <input type="hidden" name="type_${i}" value="${esc(type)}">
      <input type="hidden" name="ph_${i}" value="${esc(ph)}" data-ph>
      <input type="hidden" name="width_${i}" value="${wide}">
      <input type="hidden" name="opt_${i}" value="${esc(opts)}" data-opt>
      <input type="hidden" name="label_ar_${i}" value="${esc(p.label_ar || "")}">
      <input type="checkbox" name="enabled_${i}" value="1" checked hidden>
      <input type="checkbox" name="req_${i}" value="1" ${f && f.required ? "checked" : ""} hidden>
      <input type="checkbox" name="del_${i}" value="1" hidden data-del>
    </li>`
  }
  const models = [
    ["classique", "Classique"],
    ["carte", "Cartes"],
    ["compact", "Lignes"],
    ["large", "Pilules"],
    ["ouvert", "Ouvert"],
    ["etapes", "Étapes"],
    ["ticket", "Ticket"],
    ["nuit", "Nuit"],
    ["bloc", "Bloc"],
    ["dedans", "Dedans"],
  ]
  const catalog = {}
  CF.DEFAULT_FIELDS.forEach((f) => {
    catalog[f.key] = { id: f.key, name: f.label, kind: "field", type: f.type, ph: f.placeholder || "", wide: f.width || "half" }
  })
  CF.BLOCKS.forEach((b) => {
    catalog[b.id] = { id: b.id, name: b.hint || b.label, kind: "block", type: b.id }
  })
  const shown = rows.filter((p) => p.on)
  const parked = [
    ...rows.filter((p) => !p.on).map((p) => catalog[p.id] || { id: p.id, name: p.label, kind: p.kind, type: p.field ? p.field.type : "text" }),
    ...restore.map((r) => catalog[r.id] || { id: r.id, name: r.name, kind: "field", type: "text" }),
  ]
  const boot = JSON.stringify({
    presets: CF.PRESETS.map((p) => ({ id: "f_" + p.id, name: p.label, kind: "field", type: p.type, opts: (p.options || []).join(", "), wide: p.type === "select" || p.type === "textarea" ? "full" : "half" })),
    parked,
  }).replace(/</g, "\\u003c")
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Formulaire</h1>
  <p class="muted">À gauche, tu choisis. À droite, le client voit le changement tout de suite.</p></div>
</header>
${ok ? `<div class="alert ok">Formulaire enregistré. Il est déjà sur la boutique.</div>` : ""}

<div class="fm-studio">
<form method="post" action="/dashboard/formulaire" class="form fm-side" id="fldForm">
  <section class="fm-block">
    <h2>Modèle</h2>
    <div class="fm-models">
      ${models.map(([id, name]) => `<label class="fm-card${look.model === id ? " on" : ""}">
        <input type="radio" name="form_model" value="${id}" ${look.model === id ? "checked" : ""}>
        <b>${name}</b>
      </label>`).join("")}
    </div>
  </section>

  <section class="fm-block">
    <h2>Couleur</h2>
    <div class="fm-colors">
      ${CF.FORM_COLORS.map(([name, hex]) => `<button type="button" class="fm-swatch${look.color.toLowerCase() === hex.toLowerCase() ? " on" : ""}" data-color="${hex}" style="background:${hex}" title="${name}" aria-label="${name}"></button>`).join("")}
      <label class="fm-custom">Autre<input type="color" name="form_color" value="${esc(look.color)}"></label>
    </div>
    <div class="fm-lang">
      <span>Langue</span>
      <label><input type="radio" name="form_lang" value="" ${!look.lang ? "checked" : ""}> Boutique</label>
      <label><input type="radio" name="form_lang" value="fr" ${look.lang === "fr" ? "checked" : ""}> Français</label>
      <label><input type="radio" name="form_lang" value="ar" ${look.lang === "ar" ? "checked" : ""}> Arabe</label>
    </div>
    <input type="checkbox" name="form_variants" value="1" ${look.variants ? "checked" : ""} hidden>
    <input type="checkbox" name="form_delivery" value="1" ${look.delivery ? "checked" : ""} hidden>
  </section>

  <section class="fm-block">
    <h2>Ajouter un détail</h2>
    <div class="fm-add">
      <input id="fmAddName" maxlength="40" placeholder="Pointure, cadeau, étage…" aria-label="Nom du détail">
      <select id="fmAddType" aria-label="Type">
        <option value="text">Texte</option>
        <option value="tel">Téléphone</option>
        <option value="email">E-mail</option>
        <option value="textarea">Texte long</option>
        <option value="select">Liste</option>
      </select>
      <input id="fmAddOpts" maxlength="120" placeholder="36, 37, 38" aria-label="Choix" hidden>
      <button type="button" class="btn btn-primary" id="fmAdd">Ajouter</button>
    </div>
    <div class="fm-presets" id="fmChips"></div>
  </section>

  <section class="fm-block">
    <h2>Ordre</h2>
    <p class="muted small">Glisse une ligne pour changer l'ordre.</p>
    <ol class="fld-order" id="fmOrder">
      ${shown.map(pieceRow).join("")}
    </ol>
    <button class="btn btn-primary btn-block" type="submit">Enregistrer</button>
  </section>
</form>

<aside class="fm-stage">
  <div class="fm-stage-top"><b>Aperçu</b><span>ce que le client voit</span></div>
  <div class="fm-phone">
    <div class="fm-preview ck-look ck-${look.model}" id="fmPreview" style="${CF.lookStyle(look)}"></div>
  </div>
</aside>
</div>
<script type="application/json" id="fmBoot">${boot}</script>
<script src="/formulaire.js"></script>`, "form")
}
const dashStats = (user, store, d) => {
  const max = Math.max(1, ...d.daily.map((x) => x.cents))
  const confRate = d.counts.total ? Math.round((d.counts.confirmed / d.counts.total) * 100) : 0
  const conv = d.visits ? (d.all.n / d.visits) * 100 : 0
  const fmtDay = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Statistiques</h1><p class="muted">Ce que la boutique rapporte vraiment : argent encaissé, commandes confirmées, produits qui partent.</p></div>
  <a class="btn btn-ghost" href="/dashboard/orders/export.csv">${icon("receipt", 15)} Exporter les commandes</a>
</header>

<div class="kpis">
  <div class="kpi"><span>Aujourd'hui</span><b>${money(d.today.cents, store.currency)}</b><i>${d.today.n} commande(s)</i></div>
  <div class="kpi"><span>7 derniers jours</span><b>${money(d.week.cents, store.currency)}</b><i>${d.week.n} commande(s)</i></div>
  <div class="kpi"><span>30 derniers jours</span><b>${money(d.month.cents, store.currency)}</b><i>${d.month.n} commande(s)</i></div>
  <div class="kpi"><span>Panier moyen</span><b>${money(d.average, store.currency)}</b><i>sur ${d.all.n} commande(s)</i></div>
</div>

<div class="kpis">
  <div class="kpi"><span>Taux de confirmation</span><b>${confRate}%</b><i>${d.counts.confirmed} confirmées / ${d.counts.total}</i></div>
  <div class="kpi"><span>Commandes livrées</span><b>${d.counts.shipped}</b><i>statut « livrée »</i></div>
  <div class="kpi"><span>Annulées</span><b>${d.counts.cancelled}</b><i>exclues du chiffre d'affaires</i></div>
  <div class="kpi"><span>Visites (30 j)</span><b>${d.visits}</b><i>conversion ${conv < 1 && conv > 0 ? conv.toFixed(1) : Math.round(conv)}%</i></div>
</div>

<section class="panel">
  <div class="panel-head"><h2>14 derniers jours</h2><span class="muted">chiffre d'affaires par jour</span></div>
  <div class="st-chart">
    ${d.daily.map((x) => `<div class="st-col" title="${fmtDay(x.day)} — ${money(x.cents, store.currency)} · ${x.n} commande(s)">
      <span class="st-bar${x.cents ? "" : " off"}" style="height:${x.cents ? Math.max(4, Math.round((x.cents / max) * 100)) : 2}%"></span>
      <em>${fmtDay(x.day)}</em>
    </div>`).join("")}
  </div>
</section>

<div class="st-cols">
  <section class="panel">
    <div class="panel-head"><h2>Meilleures ventes</h2><span class="muted">unités vendues</span></div>
    ${d.topProducts.length ? `<ul class="st-list">${d.topProducts.map((p, i) => `<li>
      <span class="st-rank">${i + 1}</span>
      <b>${esc(p.title)}</b>
      <span class="muted">${p.qty} ×</span>
      <span>${money(p.cents, store.currency)}</span></li>`).join("")}</ul>`
      : `<div class="empty-state">${icon("chart", 22)}<h3>Pas encore de vente</h3><p>Les produits vendus apparaîtront ici, du plus vendu au moins vendu.</p></div>`}
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Wilayas</h2><span class="muted">où ça commande</span></div>
    ${d.topWilayas.length ? `<ul class="st-list">${d.topWilayas.map((w) => `<li>
      <span class="st-rank">${w.n}</span>
      <b>${esc(w.wilaya)}</b>
      <span>${money(w.cents, store.currency)}</span></li>`).join("")}</ul>`
      : `<div class="empty-state">${icon("truck", 22)}<h3>Aucune commande géolocalisée</h3><p>Dès les premières commandes, tu vois les wilayas qui rapportent.</p></div>`}
  </section>
</div>`)
}

const themeLabel = (store) => {
  try {
    const t = require("./themes").THEMES.find((x) => x.id === store.theme)
    return t ? t.name : (store.theme || "—")
  } catch (_) { return store.theme || "—" }
}

const dashVisits = (user, store, d) => {
  const max = Math.max(1, ...d.daily.map((x) => x.n))
  const fmtDay = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Visites</h1><p class="muted">Qui ouvre ${esc(store.name)}. Pas de ventes ici : c'est un site vitrine.</p></div>
  <a class="btn btn-ghost" href="/${esc(store.slug)}" target="_blank" rel="noopener">${icon("external", 15)} Voir le site</a>
</header>
<div class="kpis">
  <div class="kpi"><span>30 derniers jours</span>${icon("chart", 16)}<b>${d.visits}</b><i>visite(s)</i></div>
  <div class="kpi"><span>Pages</span>${icon("receipt", 16)}<b>${d.pages}</b><i>sur le site</i></div>
</div>
<section class="panel">
  <div class="panel-head"><h2>14 derniers jours</h2><span class="muted">visites par jour</span></div>
  <div class="st-chart">
    ${d.daily.map((x) => `<div class="st-col" title="${fmtDay(x.day)} — ${x.n} visite(s)">
      <span class="st-bar${x.n ? "" : " off"}" style="height:${x.n ? Math.max(4, Math.round((x.n / max) * 100)) : 2}%"></span>
      <em>${fmtDay(x.day)}</em>
    </div>`).join("")}
  </div>
</section>`, "visits")
}

const dashLeads = (user, store, rows) => dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Reçus</h1><p class="muted">Les formulaires remplis sur ${esc(store.name)}. Rien ne part ailleurs.</p></div>
  <a class="btn btn-ghost" href="/${esc(store.slug)}#ecrire" target="_blank" rel="noopener">${icon("external", 15)} Voir le formulaire</a>
</header>
<section class="panel">
  ${rows.length ? `<table class="table">
    <thead><tr><th>Nom</th><th>Téléphone</th><th>E-mail</th><th>Message</th><th>Page</th><th>Date</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td><b>${esc(r.name)}</b></td>
      <td>${esc(r.phone || "—")}</td>
      <td>${esc(r.email || "—")}</td>
      <td>${esc(r.message)}</td>
      <td class="muted">${esc(r.page || "accueil")}</td>
      <td class="muted">${esc(String(r.created_at || "").slice(0, 16))}</td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("chat", 22)}<h3>Aucun formulaire</h3>
  <p>Quand quelqu'un écrit depuis le site, le message s'affiche ici.</p></div>`}
</section>`, "leads")

/** Aperçu du site dans le tableau de bord : ce que voit le visiteur,
    en ordinateur ou en téléphone, sans quitter l'interface.
    L'adresse ?preview=1 ne compte pas dans les visites. */
const sitePreview = (store) => `
<section class="panel prev-panel">
  <div class="panel-head">
    <h2>Aperçu du site</h2>
    <div class="prev-tools">
      <span class="prev-devices" role="group" aria-label="Taille de l'aperçu">
        <button type="button" class="prev-dev on" data-prev="desk">${icon("monitor", 14)} Ordinateur</button>
        <button type="button" class="prev-dev" data-prev="tel">${icon("smartphone", 14)} Téléphone</button>
      </span>
      <a href="/dashboard/design">Modifier le design</a>
      <a href="/${esc(store.slug)}" target="_blank" rel="noopener">Ouvrir le site ${icon("external", 13)}</a>
    </div>
  </div>
  <div class="prev-frame" data-prev-frame>
    <iframe src="/${esc(store.slug)}?preview=1" title="Aperçu de votre site"></iframe>
  </div>
  <p class="muted small">C'est ce que voient vos visiteurs sur <code>/${esc(store.slug)}</code> — vos passages ici ne sont pas comptés dans les visites.</p>
  <script>
  (function () {
    var frame = document.querySelector("[data-prev-frame]");
    if (!frame) return;
    var btns = document.querySelectorAll(".prev-dev");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        frame.classList.toggle("tel", b.getAttribute("data-prev") === "tel");
      });
    });
  })();
  </script>
</section>`

const dashHome = (user, store, stats, recentOrders) => store.site_kind === "vitrine"
  ? dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Bonjour, ${esc(user.name.split(" ")[0])}</h1><p class="muted">Voici le site de ${esc(store.name)}.</p></div>
  <a class="btn btn-primary" href="/dashboard/pages/new">${icon("plus", 15)} Nouvelle page</a>
</header>
${startGuide(store, stats)}
<div class="kpis">
  <div class="kpi"><span>Reçus</span>${icon("chat", 16)}<b>${stats.leadCount || 0}</b><i>${stats.unread || 0} ${(stats.unread || 0) > 1 ? "nouveaux" : "nouveau"}</i></div>
  <div class="kpi"><span>Visites</span>${icon("chart", 16)}<b>${stats.visits}</b><i>30 derniers jours</i></div>
  <div class="kpi"><span>Pages</span>${icon("receipt", 16)}<b>${stats.pageCount}</b><i>${stats.published} en ligne</i></div>
  <div class="kpi"><span>Contact</span>${icon("chat", 16)}<b>${String(store.phone || "").trim() ? "Oui" : "Non"}</b><i>${esc(store.phone || "téléphone manquant")}</i></div>
</div>
${sitePreview(store)}
<section class="panel">
  <div class="panel-head"><h2>Formulaires reçus</h2><a href="/dashboard/recus">Tout voir →</a></div>
  ${(stats.recentLeads || []).length ? `<table class="table">
    <thead><tr><th>Nom</th><th>Contact</th><th>Message</th><th>Date</th></tr></thead>
    <tbody>${stats.recentLeads.map((r) => `<tr>
      <td><b>${esc(r.name)}</b>${r.read_at ? "" : ` <span class="pill ok">Nouveau</span>`}<br><small class="muted">${esc(r.page || "accueil")}</small></td>
      <td>${esc(r.phone || "—")}<br><small class="muted">${esc(r.email || "")}</small></td>
      <td>${esc(r.message)}</td>
      <td class="muted">${esc(String(r.created_at || "").slice(0, 16))}</td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty small"><p>Rien reçu pour l'instant. Le formulaire du site arrive ici.</p>
      <code>/${esc(store.slug)}#ecrire</code></div>`}
</section>
<section class="panel">
  <div class="panel-head"><h2>Pages</h2><a href="/dashboard/pages">Tout voir →</a></div>
  ${recentOrders.length ? `<table class="table">
    <thead><tr><th>Titre</th><th>Adresse</th><th>Statut</th></tr></thead>
    <tbody>${recentOrders.map((p) => `<tr>
      <td><a class="link" href="/dashboard/pages/${p.id}"><b>${esc(p.title)}</b></a></td>
      <td class="muted">/${esc(store.slug)}/page/${esc(p.slug)}</td>
      <td>${p.published ? '<span class="pill ok">En ligne</span>' : '<span class="pill">Brouillon</span>'}</td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty small"><p>Aucune page pour l'instant. Partagez le lien de votre site :</p>
      <code>/${esc(store.slug)}</code></div>`}
</section>`, "home")
  : dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Bonjour, ${esc(user.name.split(" ")[0])}</h1><p class="muted">Voici l'activité de ${esc(store.name)}.</p></div>
  <a class="btn btn-primary" href="/dashboard/products/new">${icon("plus", 15)} Ajouter un produit</a>
</header>
${startGuide(store, stats)}
<div class="kpis">
  <div class="kpi"><span>Chiffre d'affaires</span>${icon("cash", 16)}<b>${money(stats.revenue, store.currency)}</b><i>sur ${stats.orderCount} commande(s)</i></div>
  <div class="kpi"><span>Commandes</span>${icon("receipt", 16)}<b>${stats.orderCount}</b><i>${stats.newOrders} nouvelle(s)</i></div>
  <div class="kpi"><span>Produits</span>${icon("box", 16)}<b>${stats.productCount}</b><i>${stats.lowStock} en stock faible</i></div>
  <div class="kpi"><span>Panier moyen</span>${icon("cart", 16)}<b>${money(stats.avgBasket, store.currency)}</b><i>par commande</i></div>
</div>
${sitePreview(store)}
<section class="panel">
  <div class="panel-head"><h2>Livraisons à suivre</h2><a href="/dashboard/orders">Toutes les commandes →</a></div>
  <div class="suivi-tiles">
    <a class="suivi-tile" href="/dashboard/orders?statut=nouvelle"><b>${(stats.newOrders || 0) + (stats.toCheck || 0)}</b><span>À traiter</span><i>commandes en attente d'appel</i></a>
    <a class="suivi-tile" href="/dashboard/orders?statut=expediee"><b>${stats.shipped || 0}</b><span>Colis en route</span><i>confiés au transporteur</i></a>
    <a class="suivi-tile ${(stats.lost || 0) > 0 ? "danger" : ""}" href="/dashboard/orders?statut=perdue"><b>${stats.lost || 0}</b><span>Colis perdus</span><i>à renvoyer ou rembourser</i></a>
  </div>
</section>
<section class="panel">
  <div class="panel-head"><h2>Dernières commandes</h2><a href="/dashboard/orders">Tout voir →</a></div>
  ${recentOrders.length ? `<table class="table">
    <thead><tr><th>Réf.</th><th>Client</th><th>Total</th><th>Statut</th><th>Date</th></tr></thead>
    <tbody>${recentOrders.map((o) => `<tr>
      <td><a class="link" href="/dashboard/orders/${o.id}"><b>#${esc(o.ref)}</b></a></td><td>${esc(o.customer_name)}<br><small class="muted">${esc(o.wilaya)}</small></td>
      <td>${money(o.total_cents, store.currency)}</td>
      <td><span class="status s-${esc(o.status)}">${esc(o.status)}</span></td>
      <td class="muted">${esc(o.created_at.slice(0, 16))}</td></tr>`).join("")}</tbody>
  </table>` : `<div class="empty small"><p>Aucune commande pour l'instant. Partagez le lien de votre boutique :</p>
      <code>/${esc(store.slug)}</code></div>`}
</section>`, "home")

/**
 * Vignette d'un produit : sa PHOTO PRINCIPALE dès qu'il en a une, sinon l'initiale
 * (pour ne jamais laisser un trou dans un tableau).
 */
const pThumb = (p, cls = "") => {
  const img = String((p && p.image) || "").trim()
  const letter = initial((p && p.title) || "?")
  if (!img) return letter
  /* un fichier absent ne doit pas laisser l'icône cassée du navigateur */
  return `<span class="t-ph">${letter}<img src="${esc(img)}" alt="" class="t-img${cls ? " " + cls : ""}" loading="lazy" onerror="this.remove()"></span>`
}

const dashProducts = (user, store, products) => dashLayout(user, store, `
<header class="dash-head"><div><h1>Produits</h1><p class="muted">${products.length} produit(s) dans votre boutique.</p></div>
<a class="btn btn-primary" href="/dashboard/products/new">${icon("plus", 15)} Ajouter un produit</a></header>
<section class="panel">
  ${products.length ? `<table class="table">
    <thead><tr><th></th><th>Produit</th><th>Prix</th><th>Stock</th><th>Statut</th><th></th></tr></thead>
    <tbody>${products.map((p) => `<tr>
      <td class="t-thumb">${pThumb(p)}</td>
      <td><b>${esc(p.title)}</b><br><small class="muted">${esc((p.description || "").slice(0, 60))}</small></td>
      <td>${money(p.price_cents, store.currency)}</td>
      <td>${p.stock}</td>
      <td><span class="status ${p.active ? "s-nouvelle" : "s-annulee"}">${p.active ? "en ligne" : "masqué"}</span></td>
      <td class="t-actions">
        <a class="icon-btn" href="/dashboard/products/${p.id}" title="Modifier" aria-label="Modifier">${icon("edit", 16)}</a>
        <form method="post" action="/dashboard/products/${p.id}/delete" onsubmit="return confirm('Supprimer ce produit ?')" class="inline">
          <button class="icon-btn danger" title="Supprimer" aria-label="Supprimer">${icon("trash", 16)}</button>
        </form>
      </td></tr>`).join("")}</tbody></table>`
      : `<div class="empty"><h3>Aucun produit</h3><p>Ajoutez votre premier produit pour ouvrir votre boutique.</p><a class="btn btn-primary" href="/dashboard/products/new">Ajouter un produit</a></div>`}
</section>`, "products")

const productForm = (user, store, product, extra = {}) => {
  const cats = extra.categories || []
  const gallery = extra.gallery || []
  const variants = extra.variants || []
  return dashLayout(user, store, `
<header class="dash-head"><div><h1>${product ? "Modifier le produit" : "Nouveau produit"}</h1>
<p class="muted">Photos, variantes et catégorie — tout se règle ici.</p></div>
<div class="head-actions">
  ${product ? `<form method="post" action="/dashboard/products/${product.id}/duplicate" class="inline" onsubmit="return confirm('Créer une copie de ce produit ?')"><button class="btn btn-ghost act-text">${icon("copy", 15)} Dupliquer</button></form>` : ""}
  <a class="btn btn-ghost act-text" href="/dashboard/products">${icon("arrowLeft", 15)} Retour</a>
</div></header>
<form class="panel form" method="post" action="${product ? `/dashboard/products/${product.id}` : "/dashboard/products"}">
  <div class="sub-block ph-block">
    <div class="sub-head"><b>Photos</b>
      <span>Glisse une photo pour la déplacer : la <b>première</b> est toujours la photo principale.</span></div>
    <div class="ph-grid" id="phGrid" aria-label="Photos du produit — glisser pour changer l'ordre"></div>
    <div class="ph-actions">
      <label class="btn btn-ghost img-btn">${icon("upload", 15)} Ajouter une photo<input type="file" id="phFile" accept="image/*" multiple hidden></label>
      <button type="button" class="btn btn-ghost img-btn" id="imgCrop">${icon("edit", 15)} Recadrer la principale</button>
      <span class="img-state" id="imgState"></span>
    </div>
    <p class="muted small">PNG, JPG ou WEBP · 2,5 Mo max · 9 photos. La première photo s'affiche dans la boutique et sur les vignettes.</p>
    <input type="hidden" name="image" id="imgUrl" value="${esc(product?.image || "")}">
    <input type="hidden" name="gallery" id="galJson">
  </div>

  <label>Titre du produit<input name="title" required value="${esc(product?.title || "")}" placeholder="Robe d'été fleurie"></label>
  <label>Description<textarea name="description" rows="3" placeholder="Matière, tailles, détails">${esc(product?.description || "")}</textarea></label>
  <div class="form-row two">
    <label>Prix (${esc(store.currency)})<input name="price" type="number" step="0.01" min="0" required value="${product ? (product.price_cents / 100).toFixed(2) : ""}" placeholder="4500.00"></label>
    <label>Stock<input name="stock" type="number" min="0" value="${product?.stock ?? 10}"></label>
    <label>Prix barré (${esc(store.currency)})<input name="compare" type="number" step="0.01" min="0" value="${product && product.compare_cents ? (product.compare_cents / 100).toFixed(2) : ""}" placeholder="5000.00">
      <span class="field-hint">Facultatif : affiche l'ancien prix barré + un badge « Promo ». Laisser vide s'il n'y a pas de promo.</span></label>
  </div>
  <div class="form-row two">
    <label>Catégorie
      <select name="category_id">
        <option value="0">— Aucune —</option>
        ${cats.map((c) => `<option value="${c.id}" ${product && product.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
    </label>
    <label>Cadrage de la photo
      <select name="focal">
        <option value="center" ${!product || product.focal === "center" ? "selected" : ""}>Centré</option>
        <option value="top" ${product && product.focal === "top" ? "selected" : ""}>Haut</option>
        <option value="bottom" ${product && product.focal === "bottom" ? "selected" : ""}>Bas</option>
      </select>
    </label>
  </div>

  <div class="sub-block">
    <div class="sub-head"><b>Souvent achetés ensemble</b><span>Jusqu'à 3 produits proposés avec celui-ci sur la fiche.</span></div>
    <div class="bundle-pick">
      ${(extra.products || []).length ? (extra.products || []).map((p) => `
        <label class="bundle-opt"><input type="checkbox" name="bundle_ids" value="${p.id}" ${product && String(product.bundle_ids || "").split(",").includes(String(p.id)) ? "checked" : ""}>
          <span>${esc(p.title)}</span></label>`).join("")
        : '<p class="muted">Ajoute d\'autres produits pour pouvoir les proposer en pack.</p>'}
    </div>
  </div>

  <div class="sub-block">
    <div class="sub-head"><b>Titres de variante</b>
      <span>Taille, Couleur… un titre par choix proposé, avec ses options. Le client choisira à la commande.</span></div>
    <div class="og-list" id="ogList"></div>
    <button type="button" class="btn btn-ghost img-btn" id="ogAdd">+ Ajouter un titre de variante</button>
    <input type="hidden" name="option_groups" id="ogJson">
  </div>

  <details class="sub-block var-legacy">
    <summary><b>Variantes avec leur prix et leur stock</b>
      <span class="muted">— facultatif : utile si un modèle coûte plus cher ou a moins de stock.</span></summary>
    <div class="var-editor" id="varList"></div>
    <button type="button" class="btn btn-ghost img-btn" id="varAdd">+ Ajouter une variante</button>
    <input type="hidden" name="variants" id="varJson">
  </details>

  <label class="check"><input type="checkbox" name="active" ${!product || product.active ? "checked" : ""}> Afficher dans la boutique</label>
  <div class="form-actions">
    <button class="btn btn-primary">${product ? "Enregistrer" : "Créer le produit"}</button>
    <a class="btn btn-ghost" href="/dashboard/products">Annuler</a>
  </div>
</form>

<div class="crop-modal" id="cropBox" hidden>
  <div class="crop-card" role="dialog" aria-label="Recadrer la photo">
    <div class="crop-head"><b>Recadrer la photo</b><button type="button" class="icon-btn" id="cropX" aria-label="Fermer">${icon("x", 15)}</button></div>
    <div class="crop-stage" id="cropStage"><img id="cropImg" alt="" hidden src="data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="><span class="crop-grid"></span></div>
    <div class="crop-zoom">
      <span>${icon("image", 14)}</span>
      <input type="range" id="cropZoom" min="1" max="3" step="0.01" value="1" aria-label="Zoom">
      <span class="muted-sm">Glisse la photo pour choisir la zone</span>
    </div>
    <div class="crop-actions">
      <button type="button" class="btn btn-ghost" id="cropReset">Réinitialiser</button>
      <button type="button" class="btn btn-primary" id="cropOk">Utiliser cette zone</button>
    </div>
  </div>
</div>
<script>
(function(){
  var GALLERY = ${JSON.stringify(gallery.map((g) => g.url))};
  var MAIN_PHOTO = ${JSON.stringify((product && product.image) || "")};
  var OPTION_GROUPS = ${JSON.stringify(extra.optionGroups || [])};
  var VARIANTS = ${JSON.stringify(variants.map((v) => ({ label: v.label, price: v.price_cents ? (v.price_cents / 100).toFixed(2) : "", stock: v.stock })))};
  var upload = function(file, cb){
    window.NDZUpload(file, function(url, err){
      if (url) cb(url); else alert(err || 'Envoi impossible');
    });
  };
  /* ---------- photos : une seule liste, la première est la photo principale ----------
     On glisse une vignette pour changer l'ordre (souris), ou on utilise les flèches
     (‹ ›) au doigt ou au clavier. */
  var PHOTOS = (function(){
    var first = MAIN_PHOTO;
    return (first ? [first] : []).concat(GALLERY);
  })();
  var phGrid = document.getElementById('phGrid'), hidden = document.getElementById('imgUrl');
  var galJson = document.getElementById('galJson'), state = document.getElementById('imgState');
  var MAX_PHOTOS = 9;

  function syncPhotos(){
    hidden.value = PHOTOS[0] || '';
    galJson.value = JSON.stringify(PHOTOS.slice(1));
  }
  function renderPhotos(){
    phGrid.innerHTML = PHOTOS.map(function(u, i){
      return '<figure class="ph-item'+(i === 0 ? ' is-main' : '')+'" draggable="true" data-i="'+i+'" data-url="'+u+'">' +
        '<img src="'+u+'" alt="Photo '+(i+1)+'" draggable="false">' +
        (i === 0 ? '<figcaption class="ph-badge">Photo principale</figcaption>' : '') +
        '<div class="ph-tools">' +
          '<button type="button" data-left="'+i+'" title="Déplacer à gauche" aria-label="Déplacer à gauche"'+(i === 0 ? ' disabled' : '')+'>\u2039</button>' +
          '<button type="button" data-right="'+i+'" title="Déplacer à droite" aria-label="Déplacer à droite"'+(i === PHOTOS.length-1 ? ' disabled' : '')+'>\u203A</button>' +
          '<button type="button" data-crop="'+i+'" title="Recadrer" aria-label="Recadrer cette photo">' + CROP_ICO + '</button>' +
          '<button type="button" data-del="'+i+'" class="ph-del" title="Retirer" aria-label="Retirer cette photo">\u2715</button>' +
        '</div></figure>';
    }).join('') || '<p class="muted small ph-empty">Aucune photo. Ajoute la première : ce sera la photo principale.</p>';
    syncPhotos();
  }
  function movePhoto(from, to){
    if (to < 0 || to >= PHOTOS.length || from === to) return;
    var u = PHOTOS.splice(from, 1)[0];
    PHOTOS.splice(to, 0, u);
    renderPhotos();
  }
  phGrid.addEventListener('click', function(e){
    var t = e.target.closest('button'); if (!t) return;
    var i;
    if ((i = t.getAttribute('data-del')) !== null) { PHOTOS.splice(+i, 1); renderPhotos(); return; }
    if ((i = t.getAttribute('data-left')) !== null) { movePhoto(+i, +i - 1); return; }
    if ((i = t.getAttribute('data-right')) !== null) { movePhoto(+i, +i + 1); return; }
    if ((i = t.getAttribute('data-crop')) !== null) {
      openCrop(PHOTOS[+i], function(u){ PHOTOS[+i] = u; renderPhotos(); });
    }
  });

  /* glisser-déposer */
  var dragFrom = -1;
  phGrid.addEventListener('dragstart', function(e){
    var it = e.target.closest('.ph-item'); if (!it) return;
    dragFrom = +it.getAttribute('data-i');
    it.classList.add('ph-drag');
    try { e.dataTransfer.setData('text/plain', String(dragFrom)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
  });
  phGrid.addEventListener('dragend', function(){ dragFrom = -1; renderPhotos(); });
  phGrid.addEventListener('dragover', function(e){
    e.preventDefault();
    var it = e.target.closest('.ph-item'); if (!it) return;
    Array.prototype.forEach.call(phGrid.querySelectorAll('.ph-item'), function(el){ el.classList.remove('ph-over'); });
    it.classList.add('ph-over');
  });
  phGrid.addEventListener('drop', function(e){
    e.preventDefault();
    var it = e.target.closest('.ph-item');
    if (it && dragFrom >= 0) movePhoto(dragFrom, +it.getAttribute('data-i'));
  });

  document.getElementById('phFile').addEventListener('change', function(e){
    var picked = Array.prototype.slice.call(e.target.files || []);
    if (!picked.length) return;
    if (PHOTOS.length >= MAX_PHOTOS) { state.textContent = 'Maximum ' + MAX_PHOTOS + ' photos.'; return; }
    state.textContent = 'Envoi…';
    var done = 0;
    picked.forEach(function(f){
      upload(f, function(url){
        if (PHOTOS.length < MAX_PHOTOS) PHOTOS.push(url);
        done++;
        if (done === picked.length) { state.textContent = 'Ajoutée(s)'; renderPhotos(); }
      });
    });
  });

  /* ---- recadrage : on choisit la zone gardée, l'image est réécrite côté navigateur ---- */
  var CROP_ICO = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>';
  var box = document.getElementById('cropBox'), stg = document.getElementById('cropStage');
  var cimg = document.getElementById('cropImg'), zsl = document.getElementById('cropZoom');
  var cropCb = null, cropSrc = '', nat = { w: 1, h: 1 }, zoom = 1, ox = 0, oy = 0, base = 1;
  var BW = 0, BH = 0;

  function draw() {
    if (!nat.w) return;
    var k = base * zoom, dw = nat.w * k, dh = nat.h * k;
    var mx = Math.max(0, (dw - BW) / 2), my = Math.max(0, (dh - BH) / 2);
    ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy));
    cimg.style.width = dw + 'px'; cimg.style.height = dh + 'px';
    cimg.style.left = (BW / 2 - dw / 2 + ox) + 'px';
    cimg.style.top = (BH / 2 - dh / 2 + oy) + 'px';
  }
  function openCrop(url, cb) {
    if (!url) return;
    cropCb = cb; cropSrc = url; zoom = 1; ox = 0; oy = 0;
    BW = stg.clientWidth || 300; BH = stg.clientHeight || 300;
    box.hidden = false;
    cimg.hidden = false;
    cimg.onload = function () {
      nat = { w: cimg.naturalWidth, h: cimg.naturalHeight };
      base = Math.max(BW / nat.w, BH / nat.h);
      zsl.value = 1; draw();
    };
    cimg.src = url;
  }
  function closeCrop() { box.hidden = true; cropCb = null; cimg.hidden = true; cimg.removeAttribute('src'); }
  zsl.addEventListener('input', function () { zoom = parseFloat(zsl.value) || 1; draw(); });
  document.getElementById('cropReset').addEventListener('click', function () { zoom = 1; ox = 0; oy = 0; zsl.value = 1; draw(); });
  document.getElementById('cropX').addEventListener('click', closeCrop);
  document.getElementById('cropOk').addEventListener('click', function () {
    var cb = cropCb; if (!cb) return closeCrop();
    var k = base * zoom;
    var sx = (k * nat.w / 2 - BW / 2 - ox) / k, sy = (k * nat.h / 2 - BH / 2 - oy) / k;
    var sw = BW / k, sh = BH / k;
    var side = Math.round(Math.min(sw, sh)), OUT = 1000;
    var cx = Math.max(0, Math.min(nat.w - side, sx + (sw - side) / 2));
    var cy = Math.max(0, Math.min(nat.h - side, sy + (sh - side) / 2));
    var cv = document.createElement('canvas'); cv.width = OUT; cv.height = OUT;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(cimg, cx, cy, side, side, 0, 0, OUT, OUT);
    cv.toBlob(function (blob) {
      if (!blob) return alert('Recadrage impossible');
      var f = new File([blob], 'photo-' + Date.now() + '.jpg', { type: 'image/jpeg' });
      var btn = document.getElementById('cropOk'); btn.disabled = true; btn.textContent = 'Envoi…';
      upload(f, function (u) {
        btn.disabled = false; btn.textContent = 'Utiliser cette zone';
        closeCrop(); cb(u);
      });
    }, 'image/jpeg', 0.9);
  });
  var drag = null;
  stg.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, ox: ox, oy: oy }; stg.setPointerCapture(e.pointerId);
  });
  stg.addEventListener('pointermove', function (e) {
    if (!drag) return; ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y); draw();
  });
  stg.addEventListener('pointerup', function () { drag = null; });
  stg.addEventListener('pointercancel', function () { drag = null; });
  document.getElementById('imgCrop').addEventListener('click', function () {
    if (!PHOTOS.length) return alert('Choisis une photo avant de la recadrer.');
    openCrop(PHOTOS[0], function (u) { PHOTOS[0] = u; state.textContent = 'Recadrée'; renderPhotos(); });
  });

  /* ---------- titres de variante : un titre, ses options ---------- */
  var varList = document.getElementById('varList'), varJson = document.getElementById('varJson');
  var ogList = document.getElementById('ogList'), ogJson = document.getElementById('ogJson');
  var GROUPS = (function(){
    var raw = OPTION_GROUPS;
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw || '[]'); } catch (_) { return []; }
  })();

  function syncGroups(){ ogJson.value = GROUPS.length ? JSON.stringify(GROUPS) : ''; }
  function renderGroups(){
    ogList.innerHTML = GROUPS.map(function(g, i){
      return '<div class="og-card" data-i="'+i+'">' +
        '<div class="og-head">' +
          '<input type="text" class="og-name" value="'+escHtml(g.name)+'" placeholder="Titre (ex. Taille)" ' +
            'data-i="'+i+'" data-k="name" maxlength="30" aria-label="Titre de variante">' +
          '<button type="button" class="og-del" data-rm="'+i+'" title="Supprimer ce titre" aria-label="Supprimer ce titre">\u2715</button>' +
        '</div>' +
        '<div class="og-chips">' +
          (g.options || []).map(function(o, j){
            return '<span class="og-chip">'+escHtml(o)+
              '<button type="button" data-rj="'+i+'" data-oj="'+j+'" title="Retirer cette option" aria-label="Retirer cette option">\u2715</button></span>';
          }).join('') +
          '<span class="og-addopt">' +
            '<input type="text" class="og-new" data-i="'+i+'" placeholder="Ajouter une option (ex. M)" maxlength="30" aria-label="Nouvelle option">' +
            '<button type="button" data-add="'+i+'" title="Ajouter cette option" aria-label="Ajouter cette option">+</button>' +
          '</span>' +
        '</div>' +
      '</div>';
    }).join('') || '<p class="muted small">Aucun titre de variante : le produit est vendu sans choix.</p>';
    syncGroups();
  }
  function escHtml(v){
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  ogList.addEventListener('input', function(e){
    var t = e.target, i = t.getAttribute('data-i');
    if (i === null || t.getAttribute('data-k') !== 'name') return;
    GROUPS[+i].name = t.value; syncGroups();
  });
  ogList.addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var t = e.target;
    if (t.classList.contains('og-new')) { e.preventDefault(); addOption(+t.getAttribute('data-i'), t.value, t); }
  });
  ogList.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    var i;
    if ((i = b.getAttribute('data-rm')) !== null) { GROUPS.splice(+i, 1); renderGroups(); return; }
    if ((i = b.getAttribute('data-add')) !== null) {
      var inp = ogList.querySelector('.og-new[data-i="'+i+'"]');
      addOption(+i, inp ? inp.value : '', inp); return;
    }
    var rj = b.getAttribute('data-rj');
    if (rj !== null) {
      GROUPS[+rj].options.splice(+b.getAttribute('data-oj'), 1);
      if (!GROUPS[+rj].options.length) GROUPS.splice(+rj, 1);
      renderGroups();
    }
  });
  function addOption(i, value, input){
    var g = GROUPS[i]; if (!g) return;
    var parts = String(value || '').split(',').map(function(v){ return v.trim(); }).filter(Boolean);
    parts.forEach(function(p){ if (g.options.indexOf(p) < 0 && g.options.length < 15) g.options.push(p.slice(0, 30)); });
    if (input) input.value = '';
    renderGroups();
    if (input) { var again = ogList.querySelector('.og-new[data-i="'+i+'"]'); if (again) again.focus(); }
  }
  document.getElementById('ogAdd').addEventListener('click', function(){
    if (GROUPS.length >= 3) return;
    GROUPS.push({ name: '', options: [] }); renderGroups();
    var f = ogList.querySelector('.og-name'); if (f) f.focus();
  });

  /* variantes avec prix et stock (facultatif) */
  function renderVar(){
    varList.innerHTML = VARIANTS.map(function(v, i){
      return '<div class="var-row">' +
        '<input type="text" placeholder="Taille M / Rouge" value="'+(v.label||'')+'" data-i="'+i+'" data-k="label">' +
        '<input type="number" step="0.01" min="0" placeholder="Prix" value="'+(v.price||'')+'" data-i="'+i+'" data-k="price">' +
        '<input type="number" min="0" placeholder="Stock" value="'+(v.stock!=null?v.stock:0)+'" data-i="'+i+'" data-k="stock">' +
        '<button type="button" data-del="'+i+'">\u2715</button></div>';
    }).join('') || '<span class="muted-sm">Aucune variante avec prix : le prix du produit s’applique.</span>';
    varJson.value = JSON.stringify(VARIANTS);
  }
  varList.addEventListener('input', function(e){
    var t = e.target, i = t.getAttribute('data-i'), k = t.getAttribute('data-k');
    if (i === null || !k) return;
    VARIANTS[+i][k] = t.value;
    varJson.value = JSON.stringify(VARIANTS);
  });
  varList.addEventListener('click', function(e){
    var b = e.target.closest('button[data-del]'); if (!b) return;
    VARIANTS.splice(+b.getAttribute('data-del'), 1); renderVar();
  });
  document.getElementById('varAdd').addEventListener('click', function(){
    VARIANTS.push({ label: '', price: '', stock: 0 }); renderVar();
  });
  renderPhotos(); renderGroups(); renderVar();
})();
</script>`, "products")
}

/* ------------------------------------------------------------------------- */
/* COMMANDES — liste de travail : relances, appels, origine de chaque vente.  */
/* ------------------------------------------------------------------------- */

/** Date courte « 20/10 20:04 » (l'horodatage SQLite est en UTC). */
const frDate = (ts) => {
  const d = new Date(String(ts || "").replace(" ", "T") + "Z")
  if (Number.isNaN(d.getTime())) return esc(ts || "")
  const p = (n) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Numéro de commande : visible, copiable d'un clic (utile au téléphone avec le client). */
const refChip = (o, cls = "") => `<span class="ord-refchip ${cls}" data-ref="#${esc(o.ref)}">
  <a href="/dashboard/orders/${o.id}" class="ord-ref">#${esc(o.ref)}</a>
  <button type="button" class="ord-copy" title="Copier le numéro de commande"
    aria-label="Copier le numéro de commande ${esc(o.ref)}"
    onclick="(function(b){var t=b.parentNode.getAttribute('data-ref')||'';var d=function(){b.classList.add('done');setTimeout(function(){b.classList.remove('done')},1200)};if(navigator.clipboard){navigator.clipboard.writeText(t).then(d,function(){})}else{var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);d()}})(this)">${icon("copy", 12)}</button>
</span>`

const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase()

/** Pastille d'origine : plateforme + campagne en petit. */
const sourceBadge = (o) => {
  const src = ORD.normSource(o.source)
  const camp = o.utm_campaign || ""
  return `<span class="ord-src" title="${esc(ORD.sourceLabel(src))}${camp ? " — " + esc(camp) : ""}">
    ${icon(ORD.sourceIcon(src), 13)}<span>${esc(ORD.sourceLabel(src))}</span></span>`
}

/**
 * Les boutons d'action d'une commande : WhatsApp, confirmer, reportée,
 * en attente, injoignable (compteur d'appels), annulée, commande de test.
 * `big` = version détail (icône + libellé).
 */
const orderActions = (store, o, big = false) => {
  const n = Number(o.attempts || 0)
  const max = ORD.MAX_ATTEMPTS
  const stopped = n >= max
  const phone = String(o.phone || "").replace(/[^0-9+]/g, "")
  const label = (text) => (big ? `<span>${text}</span>` : "")
  const post = (action, title, body, cls = "", ico = "check", show = false) =>
    `<form method="post" action="/dashboard/orders/${o.id}/${action}" class="ord-form">${body}${
      big ? '<input type="hidden" name="back" value="detail">' : ""}
       <button class="ord-act ${cls}" type="submit" title="${esc(title)}" aria-label="${esc(title)}">${icon(ico, 17)}${show || big ? `<span>${esc(title.split(" (")[0])}</span>` : ""}</button></form>`

  const wa = `<a class="ord-act wa" href="/dashboard/orders/${o.id}/whatsapp" target="_blank" rel="noopener"
      title="Écrire sur WhatsApp (${esc(phone)})" aria-label="Écrire sur WhatsApp">${icon("whatsapp", 17)}${label("WhatsApp")}</a>`

  const confirmBtn = post("status", "Confirmer", `<input type="hidden" name="status" value="confirmee">`,
    o.status === "confirmee" ? "on ok" : "ok", "check", true)
  const lateBtn = post("status", "Reportée", `<input type="hidden" name="status" value="reportee">`,
    o.status === "reportee" ? "on info" : "info", "clock")
  const waitBtn = post("status", "En attente", `<input type="hidden" name="status" value="nouvelle">`,
    o.status === "nouvelle" ? "on wait" : "wait", "hourglass")
  const cancelBtn = post("status", "Annuler la commande (le stock revient)",
    `<input type="hidden" name="status" value="annulee">`, o.status === "annulee" ? "on danger" : "danger", "x")

  const callBtn = stopped
    ? `<button class="ord-act danger on" disabled title="3 appels sans réponse : commande injoignable"
         aria-label="Injoignable, 3 appels sans réponse">${icon("phoneOff", 17)}<i class="ord-count">${n}/${max}</i></button>`
    : `<form method="post" action="/dashboard/orders/${o.id}/attempt" class="ord-form">
        <button class="ord-act warn" type="submit" title="Injoignable — appel sans réponse (${n + 1}/${max})"
          aria-label="Injoignable, appel ${n + 1} sur ${max}">${icon("phoneOff", 17)}<i class="ord-count">${n}/${max}</i></button></form>`

  const fakeBtn = post("fake", o.fake ? "N'est plus une commande de test" : "Marquer comme commande de test",
    "", o.fake ? "on test" : "test", "flask")

  return `<div class="ord-acts${big ? " big" : ""}">
    ${wa}${confirmBtn}${waitBtn}${lateBtn}${callBtn}${cancelBtn}${fakeBtn}
  </div>`
}

/** Première ligne produit d'une commande, pour l'appel téléphonique. */
const productLine = (o) => {
  const items = Array.isArray(o.items) ? o.items : []
  if (!items.length) return ""
  const first = items[0]
  const name = `${first.title}${Number(first.qty) > 1 ? ` ×${first.qty}` : ""}`
  if (items.length === 1) return name
  return `${name} et ${items.length - 1} autre${items.length > 2 ? "s" : ""}`
}

const dashOrders = (user, store, orders, opts = {}) => {
  const filter = opts.filter || {}
  const counts = ORD.tally(orders)
  const shown = opts.shown || orders
  const cur = filter.statut || ""
  const href = (patch = {}) => {
    const q = new URLSearchParams()
    const merged = { ...filter, ...patch }
    for (const k of ["statut", "src", "q", "test"]) if (merged[k]) q.set(k, merged[k])
    const s = q.toString()
    return "/dashboard/orders" + (s ? `?${s}` : "")
  }
  const sources = [...new Set(orders.map((o) => ORD.normSource(o.source)))].filter(Boolean).sort()
  const statuts = [
    ["", "Toutes", counts.real],
    ["nouvelle", "En attente", counts.nouvelle + counts.a_verifier],
    ["confirmee", "Confirmées", counts.confirmee],
    ["reportee", "Reportées", counts.reportee],
    ["injoignable", "Injoignables", counts.injoignable],
    ["annulee", "Annulées", counts.annulee],
    ["livree", "Livrées", counts.livree],
    ["retour", "Retours", counts.retour],
  ]
  const statutNow = filter.test ? "test" : (cur || "")

  return dashLayout(user, store, `
${opts.bulkDone ? `<div class="alert ok">${opts.bulkDone} commande(s) mises à jour.</div>` : ""}
<header class="dash-head ord-head">
  <div><h1>Commandes</h1>
    <p class="muted">${counts.real} commande(s) · ${counts.nouvelle + counts.a_verifier} à appeler</p>
  </div>
</header>
${(opts.sources && opts.sources.length) ? `<section class="panel ord-funnel">
  <div class="panel-head"><h2>D'où viennent les commandes</h2>
    <span class="muted">${esc(opts.devices && opts.devices.length ? opts.devices.map((d) => `${ORD.DEVICE_LABEL[d.device] || d.device} ${d.share} %`).join(" · ") : "")}</span></div>
  <div class="ord-funnel-rows">
    ${opts.sources.map((r) => `<a class="ord-funnel-row" href="/dashboard/orders?src=${encodeURIComponent(r.source)}${filter.statut ? `&statut=${encodeURIComponent(filter.statut)}` : ""}" title="Voir les commandes ${esc(ORD.sourceLabel(r.source))}">
      <span class="ord-funnel-src">${icon(ORD.sourceIcon(r.source), 14)} ${esc(ORD.sourceLabel(r.source))}</span>
      <span class="ord-funnel-bar"><i style="width:${Math.max(3, Math.min(100, r.rate))}%"></i></span>
      <b>${r.orders}</b>
      <span class="ord-funnel-txt">${r.rate} % confirmées</span>
      <span class="ord-funnel-txt">${money(r.cents, store.currency)}</span>
    </a>`).join("")}
  </div>
</section>` : ""}
<form id="fakeOrder" method="post" action="/dashboard/orders/fake" hidden></form>
<div class="ord-tools">
<form class="ord-filter" method="get" action="/dashboard/orders">
  <label class="ord-f-q">${icon("search", 15)}
    <input type="search" name="q" value="${esc(filter.q || "")}" placeholder="Réf, nom, téléphone…" aria-label="Rechercher une commande">
  </label>
  <select name="statut" aria-label="Statut" onchange="this.form.submit()">
    ${statuts.map(([id, text, n]) => `<option value="${id}" ${statutNow === id ? "selected" : ""}>${text} · ${n}</option>`).join("")}
    <option value="test" ${statutNow === "test" ? "selected" : ""}>Tests · ${counts.fake}</option>
  </select>
  <select name="src" aria-label="Plateforme" onchange="this.form.submit()">
    <option value="">Toutes les sources</option>
    ${sources.map((src) => `<option value="${esc(src)}" ${filter.src === src ? "selected" : ""}>${esc(ORD.sourceLabel(src))}</option>`).join("")}
  </select>
</form>
<button class="btn btn-ghost btn-sm" form="fakeOrder" type="submit" title="Créer une commande de test">Test</button>
<a class="btn btn-ghost btn-sm" href="/dashboard/orders/export.csv">CSV</a>
</div>

<form id="bulkForm" class="ord-bulk" method="post" action="/dashboard/orders/bulk">
  <span class="ord-bulkcount" id="ordCount"></span>
  <div class="ord-bulkacts">
    <button class="ord-do ok" type="submit" name="action" value="confirmee">Confirmer</button>
    <button class="ord-do" type="submit" name="action" value="reportee">Reporter</button>
    <button class="ord-do warn" type="submit" name="action" value="injoignable">Injoignable</button>
    <button class="ord-do danger" type="submit" name="action" value="annulee">Annuler</button>
  </div>
  <input type="hidden" name="ids" id="ordIds">
  <input type="checkbox" id="ordAll" hidden>
</form>

<section class="ord-list">
${shown.length ? shown.map((o) => `
  <article class="ord-card${o.fake ? " is-test" : ""}${o.status === "annulee" ? " is-dead" : ""}${o.status === "livree" ? " is-done" : ""}${["nouvelle", "a_verifier"].includes(ORD.norm(o.status)) ? " is-tocall" : " is-called"}${o.status === "injoignable" ? " is-missed" : ""}">
    <div class="ord-row">
      <input type="checkbox" class="ord-pick" name="ids" value="${o.id}" form="bulkForm" aria-label="Sélectionner la commande">
      ${refChip(o)}
      ${sourceBadge(o)}
      ${o.fake ? `<span class="ord-flag">${icon("flask", 12)} Test</span>` : ""}
      <span class="ord-date">${frDate(o.created_at)}</span>
      <span class="ord-total">${money(o.total_cents, store.currency)}</span>
      <span class="ord-status t-${ORD.tone(o.status)}">${esc(ORD.label(o.status))}</span>
      ${o.tracking ? `<span class="ord-track" title="${esc((o.carrier_name ? o.carrier_name + " · " : "") + o.tracking)}">${o.carrier_name ? esc(o.carrier_name) + " · " : ""}${esc(o.tracking)}</span>` : ""}
    </div>
    <span class="ord-prod">${esc(productLine(o) || "Article")}</span>
    <span class="ord-mini"><span class="ord-avatar av-${ORD.norm(o.status)}">${initials(o.customer_name)}</span><span class="ord-who">${esc(o.customer_name)}</span><span class="ord-status t-${ORD.tone(o.status)}">${esc(ORD.label(o.status))}</span></span>
    <span class="ord-price">${money(o.total_cents, store.currency)}</span>
    ${o.tracking ? `<span class="ord-track-m" title="${esc((o.carrier_name ? o.carrier_name + " · " : "") + o.tracking)}">${o.carrier_name ? esc(o.carrier_name) + " · " : ""}${esc(o.tracking)}</span>` : ""}
    <div class="ord-side">
      <button type="button" class="ord-more-btn" aria-label="Actions de la commande" aria-expanded="false">${icon("menuDots", 16)}</button>
      ${String(o.phone || "").replace(/[^\d+]/g, "") ? `<a class="ord-call" href="tel:${esc(String(o.phone).replace(/[^\d+]/g, ""))}" data-id="${o.id}" data-what="${esc(productLine(o) || "Article")}" data-price="${esc(money(o.total_cents, store.currency))}" data-ship="${esc(money(o.shipping_cents || 0, store.currency))}" data-where="${esc([o.delivery_type === "desk" ? "Au bureau" : "À domicile", [o.wilaya, o.commune].filter(Boolean).join(", ")].filter(Boolean).join(" · "))}" data-name="${esc(o.customer_name)}" data-attempts="${Number(o.attempts || 0)}">${icon("phone", 15)}<span>Appeler</span></a>` : ""}
    </div>
    <div class="ord-row two">
      <div class="ord-client">
        <span class="ord-avatar av-${ORD.norm(o.status)}">${initials(o.customer_name)}</span>
        <div>
          <b>${esc(o.customer_name)}</b>
          <span>${esc(o.phone)}${o.wilaya ? ` · ${esc(o.wilaya)}` : ""}${o.commune ? `, ${esc(o.commune)}` : ""}</span>
        </div>
      </div>
      <div class="ord-device" title="Appareil utilisé pour commander">
        ${icon(ORD.DEVICE_LABEL[o.device] ? (o.device === "mobile" ? "smartphone" : o.device === "tablet" ? "tablet" : "monitor") : "monitor", 13)}
        <span>${esc(ORD.DEVICE_LABEL[o.device] || "Inconnu")}</span>
        ${o.click_id ? `<i title="Venue d'une publicité">Pub</i>` : ""}
      </div>
      ${orderActions(store, o)}
    </div>
  </article>`).join("")
  : `<div class="empty-state">${icon("receipt", 22)}<h3>Aucune commande ici</h3>
     <p>${filter.q || filter.src || cur || filter.test ? "Aucun résultat pour ce filtre." : `Partagez votre boutique pour recevoir vos premières ventes : <code>/${esc(store.slug)}</code>`}</p>
     ${filter.q || filter.src || cur || filter.test ? `<a class="btn btn-ghost btn-sm" href="/dashboard/orders">Voir toutes les commandes</a>` : ""}</div>`}
</section>

<div class="ord-sheet" id="ordSheet" hidden>
  <div class="ord-sheet-card" role="dialog" aria-modal="true" aria-labelledby="ordSheetTitle">
    <b id="ordSheetTitle">Avant de confirmer</b>
    <p class="ord-sheet-sub" data-fill="name"></p>
    <p class="ord-sheet-prod" data-fill="what"></p>
    <p class="ord-sheet-where" data-fill="where"></p>
    <p class="ord-sheet-ship" data-fill="ship"></p>
    <p class="ord-sheet-price" data-fill="price"></p>
    <p class="ord-sheet-note">Ne confirme que s'il répète le montant à préparer.</p>
    <form method="post" data-kind="status"><input type="hidden" name="status" value="confirmee">
      <button class="ord-sheet-btn ok" type="submit">Confirmée</button></form>
    <form method="post" data-kind="status"><input type="hidden" name="status" value="annulee">
      <button class="ord-sheet-btn danger" type="submit" title="Annule la commande, le stock revient">Refusée</button></form>
    <form method="post" data-kind="status"><input type="hidden" name="status" value="reportee">
      <button class="ord-sheet-btn" type="submit">Reportée</button></form>
    <form method="post" data-kind="attempt">
      <button class="ord-sheet-btn warn" type="submit" data-fill="attempts">Injoignable</button></form>
    <form method="post" data-kind="status"><input type="hidden" name="status" value="nouvelle">
      <button class="ord-sheet-btn" type="submit">En attente</button></form>
    <button type="button" class="ord-sheet-later">Plus tard</button>
  </div>
</div>
<script>
(function(){
  var form = document.getElementById('bulkForm');
  if (!form) return;
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.ord-pick'));
  var all = document.getElementById('ordAll'), count = document.getElementById('ordCount');
  var apply = document.getElementById('ordApply'), ids = document.getElementById('ordIds');
  function sync(){
    var picked = boxes.filter(function(b){ return b.checked; });
    ids.value = picked.map(function(b){ return b.value; }).join(',');
    count.textContent = picked.length ? picked.length + ' sélectionnée' + (picked.length > 1 ? 's' : '')
      : 'Aucune sélection';
    if (apply) apply.disabled = picked.length === 0;
    form.classList.toggle('has-pick', picked.length > 0);
    boxes.forEach(function(b){
      var card = b.closest('.ord-card');
      if (card) card.classList.toggle('is-picked', b.checked);
    });
    if (all) all.checked = boxes.length > 0 && picked.length === boxes.length;
  }
  boxes.forEach(function(b){ b.addEventListener('change', sync); });
  if (all) all.addEventListener('change', function(){
    boxes.forEach(function(b){ b.checked = all.checked; });
    sync();
  });
  form.addEventListener('submit', function(e){
    if (!ids.value) { e.preventDefault(); return; }
    var a = e.submitter && e.submitter.name === 'action' ? e.submitter.value : '';
    if (a === 'annulee' && !confirm('Annuler ' + ids.value.split(',').length + ' commande(s) ? Le stock reviendra en vente.')) e.preventDefault();
  });
  sync();
})();
(function () {
  var sheet = document.getElementById('ordSheet')
  if (!sheet) return
  var pending = null
  var opened = false
  function digits(id) { return String(id || '').replace(/[^0-9]/g, '') }
  function openSheet(id) {
    id = digits(id)
    if (!id || opened) return
    if (window.matchMedia && !window.matchMedia('(max-width: 920px)').matches) return
    var btn = document.querySelector('.ord-call[data-id="' + id + '"]')
    if (!btn) return
    opened = true
    sheet.querySelector('[data-fill="what"]').textContent = btn.getAttribute('data-what') || ''
    sheet.querySelector('[data-fill="where"]').textContent = btn.getAttribute('data-where') || ''
    sheet.querySelector('[data-fill="ship"]').textContent = 'Livraison ' + (btn.getAttribute('data-ship') || '')
    sheet.querySelector('[data-fill="price"]').textContent = 'À préparer ' + (btn.getAttribute('data-price') || '')
    sheet.querySelector('[data-fill="name"]').textContent = btn.getAttribute('data-name') || ''
    var n = btn.getAttribute('data-attempts') || '0'
    var ib = sheet.querySelector('[data-fill="attempts"]')
    if (ib) ib.textContent = 'Injoignable ' + n + '/3'
    sheet.querySelectorAll('form').forEach(function (f) {
      f.action = '/dashboard/orders/' + id + '/' + f.getAttribute('data-kind')
    })
    sheet.hidden = false
    try { sessionStorage.removeItem('ndz-call') } catch (e) {}
  }
  function closeSheet() {
    sheet.hidden = true
    opened = false
    pending = null
    try { sessionStorage.removeItem('ndz-call') } catch (e) {}
  }
  function arm(id) {
    id = digits(id)
    if (!id) return
    pending = { id: id, left: false }
    try { sessionStorage.setItem('ndz-call', id) } catch (e) {}
    var stay = setTimeout(function () {
      if (pending && pending.id === id && !pending.left && !document.hidden) openSheet(id)
    }, 700)
    pending.stay = stay
  }
  document.querySelectorAll('.ord-call').forEach(function (a) {
    a.addEventListener('click', function () { arm(a.getAttribute('data-id')) })
  })
  document.addEventListener('visibilitychange', function () {
    if (!pending) return
    if (document.hidden) {
      pending.left = true
      if (pending.stay) clearTimeout(pending.stay)
    } else if (pending.left) openSheet(pending.id)
  })
  window.addEventListener('pageshow', function () {
    if (pending && pending.left) openSheet(pending.id)
  })
  window.addEventListener('focus', function () {
    if (pending && pending.left) openSheet(pending.id)
  })
  try {
    var saved = sessionStorage.getItem('ndz-call')
    if (saved) { pending = { id: saved, left: true }; openSheet(saved) }
  } catch (e) {}
  var later = sheet.querySelector('.ord-sheet-later')
  if (later) later.addEventListener('click', closeSheet)
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet() })
})()
document.querySelectorAll('.ord-more-btn').forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.preventDefault()
    var card = btn.closest('.ord-card')
    var on = !card.classList.contains('menu-open')
    document.querySelectorAll('.ord-card.menu-open').forEach(function (c) {
      c.classList.remove('menu-open')
      var b = c.querySelector('.ord-more-btn')
      if (b) b.setAttribute('aria-expanded', 'false')
    })
    if (on) {
      card.classList.add('menu-open')
      btn.setAttribute('aria-expanded', 'true')
    }
  })
})
</script>`, "orders")
}

const dashSettings = (user, store, saved, error, extra = {}) => dashLayout(user, store, `
<header class="dash-head"><div><h1>Réglages</h1><p class="muted">Personnalisez votre boutique.</p></div></header>
${saved ? `<div class="alert ok">Modifications enregistrées.</div>` : ""}
${error ? `<div class="alert">${esc(error)}</div>` : ""}
<form class="panel form" method="post" action="/dashboard/settings">
  <h3>Langue de la vitrine</h3>
  <div class="lang-choice">
    <label class="lang-opt"><input type="radio" name="lang_mode" value="both" ${(store.lang_mode || "both") === "both" ? "checked" : ""}>
      <span><b>Français + Arabe</b><span>Le client choisit avec le bouton FR / <bdi class="ar">ع</bdi>.</span></span></label>
    <label class="lang-opt"><input type="radio" name="lang_mode" value="fr" ${store.lang_mode === "fr" ? "checked" : ""}>
      <span><b>Français seulement</b><span>Une seule langue, plus simple.</span></span></label>
    <label class="lang-opt"><input type="radio" name="lang_mode" value="ar" ${store.lang_mode === "ar" ? "checked" : ""}>
      <span><b>Arabe seulement</b><span>Vitrine en arabe, avec écriture de droite à gauche.</span></span></label>
  </div>
  <h3>Identité</h3>
  <label>Nom de la boutique<input name="name" required value="${esc(store.name)}"></label>
  <label>Slogan<input name="tagline" value="${esc(store.tagline || "")}" placeholder="Élégance moderne, livrée chez vous."></label>
  <label>À propos<textarea name="about" rows="3">${esc(store.about || "")}</textarea></label>
  <div class="form-row two">
    <label>Téléphone<input name="phone" value="${esc(store.phone || "")}" placeholder="0555 12 34 56"></label>
    <label>Wilaya<input name="wilaya" value="${esc(store.wilaya || "")}" placeholder="Alger"></label>
  </div>
  <h3>Apparence de la vitrine</h3>
  <div class="theme-now">
    <span class="theme-now-dot theme-preview tpv-${esc(store.theme)}"></span>
    <div>
      <b>Thème actuel : ${esc((THEMES.find((t) => t.id === store.theme) || THEMES[0]).name)}</b>
      <span>Le thème, les couleurs, les textes et les blocs se règlent dans l'éditeur de design. Ici on ne touche plus au look : rien ne peut casser la vitrine.</span>
    </div>
    <div class="theme-now-actions">
      <a class="btn btn-ghost btn-sm" href="/dashboard/design/themes">Voir les thèmes</a>
      <a class="btn btn-primary btn-sm" href="/dashboard/design">Modifier le design</a>
    </div>
  </div>

  <h3>Informations légales</h3>
  <p class="muted">Affichées sur la page « Informations légales » et sur les factures.</p>
  <div class="form-row two">
    <label>Raison sociale<input name="legal_name" value="${esc(store.legal_name || "")}" placeholder="SARL Amina Mode"></label>
    <label>Adresse<input name="legal_address" value="${esc(store.legal_address || "")}" placeholder="12 rue Didouche, Alger"></label>
  </div>
  <div class="form-row three">
    <label>Registre de commerce<input name="legal_rc" value="${esc(store.legal_rc || "")}" placeholder="16/00-1234567B18"></label>
    <label>NIF<input name="legal_nif" value="${esc(store.legal_nif || "")}" placeholder="000116001234567"></label>
    <label>Délai de retour (jours)<input name="return_days" type="number" min="0" max="60" value="${store.return_days ?? 7}"></label>
  </div>

  <h3>Mesure d'audience</h3>
  <div class="form-row two">
    <label>Pixel Meta (ID)<input name="pixel_meta" value="${esc(store.pixel_meta || "")}" placeholder="123456789012345"></label>
    <label>Pixel TikTok (ID)<input name="pixel_tiktok" value="${esc(store.pixel_tiktok || "")}" placeholder="CXXXXXXXXXXXXXXXX"></label>
  </div>
  <h3>WhatsApp</h3>
  <p class="muted">Numéro affiché sur la boutique (bouton flottant) et pour prévenir le client.</p>
  <label>Numéro WhatsApp<input name="whatsapp" value="${esc(store.whatsapp || "")}" placeholder="0555 12 34 56"></label>

  <h3>Boutique</h3>
  <div class="form-row two">
    <label>Devise
      <select name="currency">${["DZD","EUR","USD"].map((c) => `<option ${store.currency === c ? "selected" : ""}>${c}</option>`).join("")}</select>
    </label>
    <label>Adresse (novadz.dz/<b>${esc(store.slug)}</b>)<input name="slug" value="${esc(store.slug)}" pattern="[a-z0-9-]+" title="minuscules, chiffres et tirets"></label>
  </div>
  <h3>Nom de domaine</h3>
  <p class="muted">Tes clients ouvrent la boutique avec ton adresse, sans /${esc(store.slug)}. NovaDZ ne l'achète pas et ne change pas le DNS à ta place.</p>
  <label>Domaine<input name="domain" value="${esc(store.domain || "")}" placeholder="boutique.dz"></label>
  <div class="dns-box">
    <b>Comment le relier</b>
    <ol class="domain-steps">
      <li><b class="n">1</b><span>Achète le nom, par exemple <b>boutique.dz</b>, chez un vendeur de domaines. Garde l'accès au panneau DNS.</span></li>
      <li><b class="n">2</b><span>NovaDZ doit tourner sur un serveur public. Sur ton ordinateur, le domaine ne peut pas arriver.</span></li>
      <li><b class="n">3</b><span>Dans le panneau DNS du vendeur, ajoute ces deux lignes. L'adresse IP, c'est celle du serveur, pas celle de ton téléphone.</span></li>
      <li><b class="n">4</b><span>Reviens ici, écris le domaine sans <b>https://</b> et sans <b>www</b>, puis enregistre. L'adresse /${esc(store.slug)} continue de marcher.</span></li>
      <li><b class="n">5</b><span>Le cadenas <b>https</b> ne se crée pas ici. Le plus simple : Cloudflare, si le vendeur laisse changer les DNS. Sinon, le certificat se pose sur le serveur.</span></li>
    </ol>
    <table class="table">
      <tr><th>Type</th><th>Nom</th><th>Valeur</th></tr>
      <tr><td>A</td><td>@</td><td>IP publique du serveur</td></tr>
      <tr><td>A</td><td>www</td><td>la même IP</td></tr>
    </table>
    ${(() => {
      let known = ""
      try { known = new URL(process.env.PUBLIC_URL || "").hostname.toLowerCase() } catch (_) {}
      if (!known || known === "localhost" || known.startsWith("127.")) {
        return `<p class="muted">Aucun serveur public n'est indiqué. Tant que NovaDZ n'est pas en ligne, ces lignes n'ont nulle part où pointer.</p>`
      }
      return `<p class="muted">Nom public connu de ce serveur : <b>${esc(known)}</b>. Le www peut aussi être un CNAME vers ce nom. Le @ doit rester un A vers son IP.</p>`
    })()}
  </div>
  <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
</form>`, "settings")

/* ============================== ADMIN ============================== */
const adminLogs = (user, rows, level = "") => page("Journaux — NovaDZ", `
<div class="dash">
  <aside class="dash-side">
    <a class="brand" href="/">${LOGO}<span>NovaDZ</span></a>
    <div class="dash-store"><div class="dash-tile">${icon("shield", 16)}</div><div><b>Plateforme</b><span>supervision</span></div></div>
    <nav class="dash-nav">
      <a href="/admin">${icon("store", 16)} Boutiques</a>
      <a href="/admin/health">${icon("grid", 16)} Santé</a>
      <a class="on" href="/admin/logs">${icon("receipt", 16)} Journaux</a>
    </nav>
  </aside>
  <main class="dash-main">
    <header class="dash-head">
      <div><h1>Journaux</h1><p class="muted">200 derniers événements — erreurs, lenteurs, commandes, connexions refusées.</p></div>
      <form method="post" action="/admin/logs/clear" class="inline">
        <button class="btn btn-ghost" onclick="return confirm('Vider tout le journal ?')">Vider</button>
      </form>
    </header>
    <div class="tabs-row">
      <a class="chip ${!level ? "on" : ""}" href="/admin/logs">Tout</a>
      <a class="chip ${level === "error" ? "on" : ""}" href="/admin/logs?level=error">Erreurs</a>
      <a class="chip ${level === "warn" ? "on" : ""}" href="/admin/logs?level=warn">Alertes</a>
      <a class="chip ${level === "slow" ? "on" : ""}" href="/admin/logs?level=slow">Lenteurs</a>
      <a class="chip ${level === "info" ? "on" : ""}" href="/admin/logs?level=info">Infos</a>
    </div>
    <section class="panel">
      ${rows.length ? `<table class="table">
        <thead><tr><th>Date</th><th>Niveau</th><th>Message</th><th>Détail</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="mono-sm">${esc(String(r.created_at).slice(5, 16))}</td>
          <td><span class="pill ${r.level === "error" ? "annulee" : r.level === "warn" ? "" : "ok"}">${esc(r.level)}</span></td>
          <td>${esc(r.message)}</td>
          <td class="wrap-cell mono-sm">${esc(r.meta || "")}</td>
        </tr>`).join("")}</tbody>
      </table>` : `<div class="empty-state">${icon("receipt", 22)}<h3>Journal vide</h3><p>Aucun événement pour le moment.</p></div>`}
    </section>
  </main>
</div>`)

const adminPage = (user, stores, totals) => page("Admin plateforme — NovaDZ", `
<div class="dash">
  <aside class="dash-side">
    <a class="brand" href="/">${LOGO}<span>NovaDZ</span></a>
    <div class="dash-store"><div class="dash-tile">${icon("shield", 16)}</div><div><b>Plateforme</b><span>vue globale</span></div></div>
    <nav class="dash-nav">
      <a class="on" href="/admin">${icon("store", 16)} Boutiques</a>
      <a href="/dashboard">${icon("grid", 16)} Mon tableau de bord</a>
      <a href="/admin/health">${icon("check", 16)} Santé</a>
      <a href="/admin/logs">${icon("receipt", 16)} Journaux</a>
      <a href="/logout">${icon("logout", 15)} Déconnexion</a>
    </nav>
  </aside>
  <main class="dash-main">
    <header class="dash-head"><div><h1>Admin plateforme</h1><p class="muted">Toutes les boutiques créées sur NovaDZ.</p></div></header>
    <div class="kpis">
      <div class="kpi"><span>Boutiques</span><b>${totals.stores}</b></div>
      <div class="kpi"><span>Marchands</span><b>${totals.merchants}</b></div>
      <div class="kpi"><span>Produits</span><b>${totals.products}</b></div>
      <div class="kpi"><span>Commandes</span><b>${totals.orders}</b></div>
    </div>
    <section class="panel">
      <table class="table">
        <thead><tr><th>Boutique</th><th>Lien</th><th>Propriétaire</th><th>Produits</th><th>Commandes</th><th>CA</th><th>Statut</th><th></th></tr></thead>
        <tbody>${stores.map((s) => `<tr>
          <td><b>${esc(s.name)}</b></td>
          <td><a href="/${esc(s.slug)}" target="_blank">/${esc(s.slug)}</a></td>
          <td>${esc(s.owner_email)}</td>
          <td>${s.product_count}</td><td>${s.order_count}</td>
          <td>${money(s.revenue || 0)}</td>
          <td><span class="status ${s.status === "active" ? "s-nouvelle" : "s-annulee"}">${esc(s.status)}</span></td>
          <td><form method="post" action="/admin/stores/${s.id}/toggle"><button class="link-danger">${s.status === "active" ? "Suspendre" : "Réactiver"}</button></form></td>
        </tr>`).join("")}</tbody>
      </table>
    </section>
  </main>
</div>`)


/* ============================== DASHBOARD : STOCK ============================== */
const dashStock = (user, store, data) => {
  const th = data.threshold
  const tone = (n) => (n <= 0 ? "off" : n <= th ? "low" : "ok")
  const label = (n) => (n <= 0 ? "Rupture" : n <= th ? "Faible" : "En stock")
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Stock</h1><p class="muted">Chaque entrée et sortie est enregistrée. Le stock descend à la commande, remonte à l'annulation.</p></div>
  <a class="btn btn-ghost" href="/dashboard/stock/export.csv">${icon("box", 15)} Exporter CSV</a>
</header>
<div class="kpis">
  <div class="kpi"><span>Unités en stock</span><b>${data.val.units}</b><i>${data.rows.length} référence(s)</i></div>
  <div class="kpi"><span>Valeur du stock</span><b>${money(data.val.cents, store.currency)}</b><i>au prix de vente</i></div>
  <div class="kpi"><span>Ruptures</span><b>${data.alerts.filter((a) => a.kind === "rupture").length}</b><i>à réapprovisionner</i></div>
  <div class="kpi"><span>Sous le seuil (${th})</span><b>${data.alerts.filter((a) => a.kind === "faible").length}</b><i>stock faible</i></div>
</div>

${data.alerts.length ? `<section class="panel panel-warn">
  <div class="panel-head"><h2>Alertes de stock</h2><span class="muted">Seuil : ${th}</span></div>
  <ul class="stock-alerts">${data.alerts.slice(0, 8).map((a) => `<li>
    <span class="pill ${a.kind === "rupture" ? "off" : "low"}">${a.kind === "rupture" ? "Rupture" : "Faible"}</span>
    <b>${esc(a.title)}</b>${a.variantLabel ? ` — ${esc(a.variantLabel)}` : ""}
    <span class="muted">${a.level} restant${a.level > 1 ? "s" : ""}</span>
  </li>`).join("")}</ul>
</section>` : ""}

<section class="panel">
  <div class="panel-head"><h2>Inventaire</h2><span class="muted">${data.rows.length} produit(s)</span></div>
  ${data.rows.length ? `<table class="table stock-table">
    <thead><tr><th>Produit</th><th>SKU</th><th>Variante</th><th>Stock</th><th>Vendu</th><th>État</th><th>Ajuster</th></tr></thead>
    <tbody>${data.rows.map((p) => {
      const lines = p.rows.map((r, i) => `<tr class="${i ? "sub-row" : ""}">
        <td>${i === 0
          ? `<span class="stock-prod"><span class="t-thumb">${pThumb(p)}</span><b class="stock-title">${esc(p.title)}</b></span>`
          : `<span class="stock-sub">↳ ${esc(r.label)}</span>`}</td>
        <td class="muted">${i === 0 && p.sku ? esc(p.sku) : ""}</td>
        <td>${r.variantId ? esc(r.label) : `<span class="muted">—</span>`}</td>
        <td><b>${r.stock}</b></td>
        <td class="muted">${i === 0 ? p.sold : ""}</td>
        <td><span class="pill ${tone(r.stock)}">${label(r.stock)}</span></td>
        <td class="stock-cell">
          <form class="stock-form" method="post" action="/dashboard/stock/adjust">
            <input type="hidden" name="product_id" value="${p.id}">
            <input type="hidden" name="variant_id" value="${r.variantId || 0}">
            <div class="stock-ctrl">
              <span class="stock-step">
                <button type="submit" name="act" value="minus" title="Retirer la quantité" aria-label="Retirer">−</button>
                <input name="value" type="number" step="1" min="1" value="1" aria-label="Quantité">
                <button type="submit" name="act" value="plus" title="Ajouter la quantité" aria-label="Ajouter">+</button>
              </span>
              <button type="submit" name="act" value="set" class="stock-set"
                title="Mettre le stock exactement à la quantité saisie">Définir</button>
            </div>
            <label class="stock-reason"><span>Motif</span>
              <select name="reason" aria-label="Motif du mouvement">
                <option value="reassort">Réassort</option>
                <option value="inventaire">Inventaire</option>
                <option value="retour">Retour</option>
              </select>
            </label>
          </form>
        </td>
      </tr>`).join("")
      return lines
    }).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("box", 22)}<h3>Aucun produit</h3><p>Ajoutez un produit pour suivre son stock.</p></div>`}
</section>

<section class="panel">
  <div class="panel-head"><h2>Seuil d'alerte</h2></div>
  <form class="inline-form" method="post" action="/dashboard/stock/settings">
    <label>Prévenir quand le stock atteint
      <input name="low_stock_threshold" type="number" min="0" max="999" value="${th}">
    </label>
    <button class="btn btn-primary">Enregistrer</button>
  </form>
</section>

<section class="panel">
  <div class="panel-head"><h2>Mouvements récents</h2><span class="muted">${data.movements.length} ligne(s)</span></div>
  ${data.movements.length ? `<table class="table">
    <thead><tr><th>Date</th><th>Produit</th><th>Variante</th><th>Mouvement</th><th>Nouveau niveau</th><th>Motif</th><th>Commande</th></tr></thead>
    <tbody>${data.movements.map((m) => `<tr>
      <td class="muted">${esc(String(m.created_at).slice(0, 16))}</td>
      <td>${esc(m.title || "—")}</td>
      <td>${m.variant_id ? esc(String(m.variant_id)) : `<span class="muted">—</span>`}</td>
      <td><b class="${m.delta > 0 ? "stock-pos" : "stock-neg"}">${m.delta > 0 ? "+" : ""}${m.delta}</b></td>
      <td>${m.level}</td>
      <td>${esc(data.reasonLabel[m.reason] || m.reason)}</td>
      <td>${m.order_id ? `<a class="link" href="/dashboard/orders/${m.order_id}">#${m.order_id}</a>` : `<span class="muted">—</span>`}</td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty-state"><h3>Aucun mouvement</h3><p>Les ventes, annulations et réassorts apparaîtront ici.</p></div>`}
</section>`, "stock")
}


/* ============================== DASHBOARD : LANDINGS ============================== */
const dashLandings = (user, store, rows, base) => dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Pages de vente</h1><p class="muted">Une page par publicité : prix propre, offres de quantité, formulaire court. C'est le format qui convertit en paiement à la livraison.</p></div>
  <a class="btn btn-primary" href="/dashboard/landings/new">${icon("plus", 15)} Nouvelle page</a>
</header>
${rows.length ? `<section class="panel">
  <table class="table">
    <thead><tr><th>Page</th><th>Produit</th><th>Prix d'appel</th><th>Visites</th><th>Commandes</th><th>CA</th><th>Statut</th><th></th></tr></thead>
    <tbody>${rows.map((l) => {
      const offers = (() => { try { return JSON.parse(l.offers || "[]") } catch (_) { return [] } })()
      const p0 = offers.length ? offers.sort((a, b) => a.qty - b.qty)[0] : null
      const conv = l.visits ? ((l.orders / l.visits) * 100).toFixed(1) + " %" : "—"
      return `<tr>
        <td><b>${esc(l.title)}</b><br><a class="link" target="_blank" href="/${esc(store.slug)}/l/${esc(l.slug)}">/${esc(store.slug)}/l/${esc(l.slug)}</a></td>
        <td>${esc(l.product_title)}</td>
        <td>${p0 ? money(p0.price, store.currency) : "—"}</td>
        <td>${l.visits}</td>
        <td>${l.orders}<br><small class="muted">${conv}</small></td>
        <td>${money(l.revenue || 0, store.currency)}</td>
        <td><span class="pill ${l.active ? "ok" : "annulee"}">${l.active ? "en ligne" : "masquée"}</span></td>
        <td class="t-actions"><a href="/dashboard/landings/${l.id}">Modifier</a>
          <form method="post" action="/dashboard/landings/${l.id}/delete" onsubmit="return confirm('Supprimer cette page ?')" class="inline"><button class="link-danger">Supprimer</button></form></td>
      </tr>` }).join("")}</tbody>
  </table>
</section>` : `<section class="panel"><div class="empty-state">${icon("store", 22)}<h3>Aucune page de vente</h3>
  <p>Créez une page dédiée à un produit : titre accrocheur, offre « 2 pièces », compte à rebours, puis un formulaire de 4 champs.</p>
  <a class="btn btn-primary" href="/dashboard/landings/new">Créer ma première page</a></div></section>`}`, "landings")

const landingForm = (user, store, landing, products, error) => {
  const offers = landing ? (() => { try { return JSON.parse(landing.offers || "[]") } catch (_) { return [] } })() : []
  const offer = (i) => offers.find((o) => Number(o.qty) === i) || {}
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>${landing ? "Modifier la page de vente" : "Nouvelle page de vente"}</h1>
  <p class="muted">Le formulaire est prêt : nom, téléphone, wilaya, adresse. Le stock est vérifié à la commande.</p></div>
  <a class="btn btn-ghost" href="/dashboard/landings">Retour</a>
</header>
${error ? `<div class="alert">${esc(error)}</div>` : ""}
<form method="post" action="${landing ? `/dashboard/landings/${landing.id}` : "/dashboard/landings"}">
<section class="panel">
  <div class="panel-head"><h2>Le produit</h2></div>
  <div class="grid-2">
    <label>Produit
      <select name="product_id" required>
        ${products.map((p) => `<option value="${p.id}" ${landing && landing.product_id === p.id ? "selected" : ""}>${esc(p.title)} — ${money(p.price_cents, store.currency)}</option>`).join("")}
      </select></label>
    <label>Adresse de la page
      <input name="slug" value="${esc(landing ? landing.slug : "")}" placeholder="robe-ete-offre">
      <small class="muted">/${esc(store.slug)}/l/<b>adresse</b></small></label>
  </div>
  <label>Titre accrocheur<input name="title" required value="${esc(landing ? landing.title : "")}" placeholder="La robe d'été qui tombe parfaitement"></label>
  <label>Accroche courte<input name="subtitle" value="${esc(landing ? landing.subtitle : "")}" placeholder="Coton léger, coupe fluide, livraison 48 h."></label>
  <label>Photo principale (URL)<input name="hero" value="${esc(landing ? landing.hero || "" : "")}" placeholder="/uploads/robe.jpg"></label>
  <label>Prix barré (DZD)<input name="compare" type="number" min="0" step="1" value="${landing && landing.compare_cents ? landing.compare_cents / 100 : ""}" placeholder="2900"></label>
  <label>Arguments (un par ligne)
    <textarea name="benefits" rows="5" placeholder="Coton respirant&#10;Livraison 48 h partout en Algérie&#10;Échange gratuit sous 7 jours">${esc(landing ? landing.benefits : "")}</textarea></label>
</section>
<section class="panel">
  <div class="panel-head"><h2>Offres de quantité</h2><span class="muted">Laissez vide pour utiliser le prix du produit</span></div>
  <div class="offer-grid">
    <div class="offer-col"><b>1 pièce</b>
      <input type="hidden" name="qty1" value="1">
      <label>Prix (DZD)<input name="price1" type="number" min="0" step="1" value="${offer(1).price ? offer(1).price / 100 : ""}"></label>
      <label>Étiquette<input name="label1" value="${esc(offer(1).label || "")}" placeholder=""></label>
    </div>
    <div class="offer-col"><b>2 pièces</b>
      <input type="hidden" name="qty2" value="2">
      <label>Prix total (DZD)<input name="price2" type="number" min="0" step="1" value="${offer(2).price ? offer(2).price / 100 : ""}"></label>
      <label>Étiquette<input name="label2" value="${esc(offer(2).label || "")}" placeholder="Économisez 9 %"></label>
    </div>
    <div class="offer-col"><b>3 pièces</b>
      <input type="hidden" name="qty3" value="3">
      <label>Prix total (DZD)<input name="price3" type="number" min="0" step="1" value="${offer(3).price ? offer(3).price / 100 : ""}"></label>
      <label>Étiquette<input name="label3" value="${esc(offer(3).label || "")}" placeholder="Livraison offerte"></label>
    </div>
  </div>
</section>
<section class="panel">
  <div class="panel-head"><h2>Conversion</h2></div>
  <div class="grid-2">
    <label>Compte à rebours (minutes)<input name="countdown_min" type="number" min="0" max="1440" value="${landing ? landing.countdown_min : 0}"></label>
    <label>Livraison offerte à partir de (pièces)<input name="free_ship_qty" type="number" min="0" max="9" value="${landing ? landing.free_ship_qty : 0}"></label>
  </div>
  <label class="ckv"><input type="checkbox" name="addressable" checked style="display:none"> </label>
  <label class="ckv"><input type="checkbox" name="active" ${!landing || landing.active ? "checked" : ""}> Page en ligne</label>
  <div class="form-actions"><button class="btn btn-primary">${landing ? "Enregistrer" : "Créer la page"}</button></div>
</section>
</form>`, "landings")
}

/* ============================== DASHBOARD : SÉCURITÉ & PIXELS ============================== */
const dashMarketing = (user, store, data) => dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Anti-fraude &amp; pixels</h1><p class="muted">Bloquez les fausses commandes et envoyez vos conversions depuis le serveur, pour ne rien perdre.</p></div>
</header>

<section class="panel">
  <div class="panel-head"><h2>CAPTCHA et vérifications</h2>
    <span class="pill ${store.captcha_enabled && store.captcha_site ? "ok" : "off"}">${store.captcha_enabled && store.captcha_site ? "actif" : "inactif"}</span></div>
  <form method="post" action="/dashboard/marketing/security">
    <div class="grid-2">
      <label>Activation
        <select name="captcha_enabled">
          <option value="0" ${!store.captcha_enabled ? "selected" : ""}>Désactivé</option>
          <option value="1" ${store.captcha_enabled ? "selected" : ""}>Activé</option>
        </select></label>
      <label>Type de CAPTCHA
        <select name="captcha_version">
          <option value="v3" ${store.captcha_version === "v3" ? "selected" : ""}>v3 — invisible, avec score</option>
          <option value="v2" ${store.captcha_version === "v2" ? "selected" : ""}>v2 — case à cocher</option>
          <option value="v2i" ${store.captcha_version === "v2i" ? "selected" : ""}>v2 — invisible</option>
        </select></label>
      <label>Clé du site (site key)<input name="captcha_site" value="${esc(store.captcha_site || "")}" placeholder="6Lc..."></label>
      <label>Clé secrète (secret key)<input name="captcha_secret" value="${esc(store.captcha_secret || "")}" placeholder="6Lc..."></label>
      <label>Score minimum v3<input name="captcha_min_score" type="number" min="0" max="1" step="0.1" value="${store.captcha_min_score || 0.5}"></label>
      <label>Téléphone strict
        <select name="phone_strict">
          <option value="0" ${!store.phone_strict ? "selected" : ""}>Souple</option>
          <option value="1" ${store.phone_strict ? "selected" : ""}>Refuser un numéro invalide</option>
        </select></label>
    </div>
    <p class="muted" style="font-size:12.5px">Les clés se créent sur <b>google.com/recaptcha/admin</b> (gratuit). Sans clé, la commande n'est pas bloquée : elle est marquée « à vérifier ».</p>
    <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
  </form>
</section>

<section class="panel">
  <div class="panel-head"><h2>Pixels serveur (Conversions API)</h2>
    <span class="pill ${data.providers.length ? "ok" : "off"}">${data.providers.length ? data.providers.join(" · ") + " actif(s)" : "aucun"}</span></div>
  <form method="post" action="/dashboard/marketing/pixels">
    <div class="grid-2">
      <label>Envoi serveur
        <select name="pixels_server">
          <option value="1" ${store.pixels_server ? "selected" : ""}>Activé</option>
          <option value="0" ${!store.pixels_server ? "selected" : ""}>Désactivé</option>
        </select></label>
      <label>Code de test (Events Manager)<input name="pixel_test_code" value="${esc(store.pixel_test_code || "")}" placeholder="TEST12345"></label>
      <label>Meta — Pixel ID<input name="pixel_meta" value="${esc(store.pixel_meta || "")}" placeholder="123456789012345"></label>
      <label>Meta — Jeton Conversions API<input name="meta_token" value="${esc(store.meta_token || "")}" placeholder="EAAG..."></label>
      <label>TikTok — Pixel ID<input name="pixel_tiktok" value="${esc(store.pixel_tiktok || "")}" placeholder="CXXXXXXXXXXXXX"></label>
      <label>TikTok — Jeton Events API<input name="tiktok_token" value="${esc(store.tiktok_token || "")}" placeholder="act.XXXX"></label>
      <label>Snapchat — Pixel ID<input name="snap_pixel" value="${esc(store.snap_pixel || "")}" placeholder="xxxx-xxxx"></label>
      <label>Snapchat — Jeton<input name="snap_token" value="${esc(store.snap_token || "")}" placeholder="eyJh..."></label>
    </div>
    <p class="muted" style="font-size:12.5px">Événements envoyés : <b>ViewContent</b>, <b>AddToCart</b>, <b>InitiateCheckout</b>, <b>Purchase</b>.
      Le téléphone est haché (SHA-256) avant l'envoi, comme l'exigent les trois régies.</p>
    <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
  </form>
</section>

<div class="kpis">
  <div class="kpi"><span>Événements envoyés (7 j)</span><b>${data.stats.ok}</b><i>${data.stats.erreur} en erreur</i></div>
  <div class="kpi"><span>Commandes à vérifier</span><b>${data.suspects.length}</b><i>score de risque ≥ 30</i></div>
  <div class="kpi"><span>Numéros bloqués</span><b>${data.blocked.length}</b><i>liste noire</i></div>
</div>

<section class="panel">
  <div class="panel-head"><h2>Commandes à vérifier</h2><a href="/dashboard/orders">Toutes les commandes →</a></div>
  ${data.suspects.length ? `<table class="table">
    <thead><tr><th>Réf.</th><th>Client</th><th>Téléphone</th><th>Motifs</th><th>Score</th><th>Position</th><th></th></tr></thead>
    <tbody>${data.suspects.map((o) => `<tr>
      <td><a class="link" href="/dashboard/orders/${o.id}"><b>#${esc(o.ref)}</b></a></td>
      <td>${esc(o.customer_name)}<br><small class="muted">${esc(o.wilaya || "")}</small></td>
      <td>${esc(o.phone)}</td>
      <td><small class="muted">${esc(String(o.risk_flags || "").split(",").filter(Boolean).join(" · ") || "—")}</small></td>
      <td><b>${o.risk_score}</b></td>
      <td>${o.geo_lat ? `<a class="link" target="_blank" href="https://maps.google.com/?q=${o.geo_lat},${o.geo_lng}">voir</a>` : `<small class="muted">absent</small>`}</td>
      <td class="t-actions">
        <form method="post" action="/dashboard/orders/${o.id}/status" class="inline"><input type="hidden" name="status" value="confirmee"><button class="btn btn-ghost btn-sm">Confirmer</button></form>
        <form method="post" action="/dashboard/marketing/block" class="inline"><input type="hidden" name="phone" value="${esc(o.phone)}"><button class="link-danger">Bloquer</button></form>
      </td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state">${icon("check", 22)}<h3>Aucune commande suspecte</h3><p>Les commandes normales passent directement en « nouvelle ».</p></div>`}
</section>

<section class="panel">
  <div class="panel-head"><h2>Numéros bloqués</h2></div>
  <form class="inline-form" method="post" action="/dashboard/marketing/block">
    <input name="phone" placeholder="0555 12 34 56" required>
    <button class="btn btn-ghost">Bloquer ce numéro</button>
  </form>
  ${data.blocked.length ? `<table class="table" style="margin-top:10px">
    <thead><tr><th>Téléphone</th><th>Motif</th><th>Date</th><th></th></tr></thead>
    <tbody>${data.blocked.map((b) => `<tr><td>${esc(b.phone)}</td><td>${esc(b.reason || "—")}</td>
      <td class="muted">${esc(String(b.created_at).slice(0, 10))}</td>
      <td class="right"><form method="post" action="/dashboard/marketing/unblock" class="inline">
        <input type="hidden" name="phone" value="${esc(b.phone)}"><button class="link-danger">Retirer</button></form></td></tr>`).join("")}</tbody>
  </table>` : `<p class="muted" style="font-size:13px">Aucun numéro bloqué.</p>`}
</section>

<section class="panel">
  <div class="panel-head"><h2>Journal des événements</h2><span class="muted">${data.events.length} dernier(s)</span></div>
  ${data.events.length ? `<table class="table">
    <thead><tr><th>Date</th><th>Régie</th><th>Événement</th><th>Commande</th><th>Statut</th><th>Réponse</th></tr></thead>
    <tbody>${data.events.map((e) => `<tr>
      <td class="muted">${esc(String(e.created_at).slice(0, 16))}</td>
      <td>${esc(e.provider)}</td>
      <td><b>${esc(e.event_name)}</b></td>
      <td>${e.order_id ? `<a class="link" href="/dashboard/orders/${e.order_id}">#${e.order_id}</a>` : `<span class="muted">—</span>`}</td>
      <td><span class="pill ${e.status === "ok" ? "ok" : "off"}">${esc(e.status)}</span></td>
      <td><small class="muted">${esc((e.message || "").slice(0, 80) || (e.code || ""))}</small></td>
    </tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><h3>Aucun événement</h3><p>Configurez un pixel et passez une commande de test : les envois apparaîtront ici avec leur code de réponse.</p></div>`}
</section>`, "marketing")


/* ============================== DASHBOARD : TRANSPORTEUR ============================== */
const dashCarrier = (user, store, data) => {
  const c = data.carrier || {}
  const flash = data.error
    ? `<div class="alert" style="margin-bottom:14px">${esc(data.error)}</div>`
    : ""
  const secretSet = (i) => Boolean(c[`header${i}_value_enc`])
  const manualCarrier = Boolean(c.id && !DZ.handles({ preset: c.preset }))
  return dashLayout(user, store, `
${flash}
<header class="dash-head">
  <div><h1>Transporteur</h1><p class="muted">Les sociétés viennent de dzship : Yalidine, ZR Express, Maystro, NOEST et tous les bureaux EcoTrack. Tu colles les jetons de ton compte, NovaDZ envoie le colis.</p></div>
  <div class="head-actions">
    ${data.carrier ? `<form method="post" action="/dashboard/transporteur/test" class="inline"><input type="hidden" name="id" value="${c.id || ""}"><button class="btn btn-ghost act-text">Tester la connexion</button></form>` : ""}
    <a class="btn btn-primary act-text" href="/dashboard/transporteur?carrier=0">+ Ajouter un transporteur</a>
  </div>
</header>

${(data.carriers || []).length ? `<section class="panel">
  <div class="panel-head"><h2>Sociétés de livraison connectées</h2>
    <span class="muted">${(data.carriers || []).length} société(s) — le client les voit à l'expédition</span></div>
  <div class="car-list">
    ${(data.carriers || []).map((x) => `<div class="car-row${data.carrier && x.id === data.carrier.id ? " is-on" : ""}">
      <b>${esc(x.label)}</b>
      <span class="muted">${esc((CARRIERS.presets.find((p) => p.key === x.preset) || {}).label || x.preset)}</span>
      <span class="pill ${x.enabled ? "ok" : "off"}">${x.enabled ? "active" : "désactivée"}</span>
      <span class="car-acts">
        <a class="btn btn-ghost btn-sm" href="/dashboard/transporteur?carrier=${x.id}">Modifier</a>
        <form method="post" action="/dashboard/transporteur/delete" class="inline"
              onsubmit="return confirm('Déconnecter ${esc(x.label).replace(/'/g, " ")} ?')">
          <input type="hidden" name="id" value="${x.id}">
          <button class="link-danger">Retirer</button>
        </form>
      </span>
    </div>`).join("")}
  </div>
</section>` : ""}

${data.saved ? `<div class="alert ok">Transporteur enregistré.</div>` : ""}
${data.testResult ? `<div class="alert ${data.testResult.ok ? "ok" : ""}">
  <b>${data.testResult.ok ? "Connexion réussie" : "Échec de connexion"}</b> — HTTP ${data.testResult.status || 0}
  ${data.testResult.count != null ? ` · ${data.testResult.count} bureau(x) reçus` : ""}
  ${data.testResult.error ? `<br><small>${esc(String(data.testResult.error).slice(0, 300))}</small>` : ""}
</div>` : ""}

<section class="panel">
  <div class="panel-head"><h2>Ma connexion</h2>
    ${data.carrier ? `<span class="pill ${c.enabled ? "ok" : "off"}">${c.enabled ? "actif" : "désactivé"}</span>` : ""}</div>
  <form method="post" action="/dashboard/transporteur">
    <input type="hidden" name="id" value="${c.id || ""}">
    ${c.id ? "" : '<input type="hidden" name="new" value="1">'}
    ${(() => {
      const catalog = CARRIERS.presets
      const picked = DZ.resolveKey(c.preset) || (catalog.some((p) => p.key === c.preset) ? c.preset : "") || "yalidine"
      const cur = catalog.find((p) => p.key === picked) || catalog[0] || { credentials: [], hint: "", requiresBaseUrl: false }
      const groups = []
      for (const p of catalog) {
        let g = groups.find((x) => x.name === p.group)
        if (!g) { g = { name: p.group, items: [] }; groups.push(g) }
        g.items.push(p)
      }
      const creds = cur.credentials || []
      const slot = (i) => {
        const name = creds[i - 1] || ""
        if (manualCarrier) return ""
        return `<label class="dz-cred" data-slot="${i}" ${name ? "" : "hidden"}>
          <span data-credlabel>${esc(DZ.credLabel(name) || "Jeton")}</span>
          <input name="header${i}_value" type="password" autocomplete="off"
            placeholder="${secretSet(i) ? "•••••• enregistré — laisser vide pour garder" : "colle le jeton de ton compte"}">
          <input type="hidden" name="header${i}_name" value="${esc(name)}" data-credname>
          <small class="muted">Chiffré en base, jamais renvoyé au navigateur.</small></label>`
      }
      const origin = c.origin_wilaya || ""
      return `<label>Société de livraison
        <input type="search" id="ndzCourierQ" placeholder="Chercher : Yalidine, DHD, ZR…" autocomplete="off">
        <select name="preset" id="ndzPreset" size="8" style="margin-top:8px">
          ${c.id && !DZ.handles({ preset: c.preset }) ? `<option value="${esc(c.preset || "custom")}" selected>Ancienne connexion manuelle</option>` : ""}
          ${groups.map((g) => `<optgroup label="${esc(g.name)}">${g.items.map((p) => `<option value="${p.key}" ${p.key === picked && DZ.handles({ preset: c.preset || picked }) ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</optgroup>`).join("")}
        </select></label>
      <label>Nom affiché
        <input name="label" value="${esc(c.label || "")}" placeholder="Yalidine Blida"></label>
      <p class="muted" style="font-size:12.5px" id="ndzPresetHint">${esc(cur.hint || "")}</p>
      <div class="grid-2">
        <label>Wilaya de départ
          <select name="origin_wilaya">
            <option value="">—</option>
            ${GEO.WILAYAS.map((w) => `<option value="${esc(w)}" ${origin === w ? "selected" : ""}>${esc(w)}</option>`).join("")}
          </select>
          <small class="muted">Obligatoire pour Yalidine et ses clones.</small></label>
        <label id="ndzBase" ${cur.requiresBaseUrl ? "" : "hidden"}>Adresse du bureau EcoTrack
          <input name="base_url" value="${esc(c.base_url || "")}" placeholder="https://ton-bureau.ecotrack.dz" ${cur.requiresBaseUrl ? "" : "disabled"}>
          <small class="muted">Seulement si tu choisis « Ecotrack (any tenant) ».</small></label>
      </div>
      <div class="grid-2" id="ndzCreds">${[1, 2, 3].map(slot).join("")}</div>
      <p class="muted" style="font-size:12.5px">Les jetons partent vers dzship le temps de l'appel, puis restent chiffrés ici. dzship ne les garde pas.</p>`
    })()}

    <fieldset ${manualCarrier ? "" : "disabled hidden"} style="border:0;margin:0;padding:0;min-width:0">
    <details class="adv">
      <summary><b>Réglages avancés</b> <span class="muted">— déjà remplis pour ce transporteur, tu n'y touches que si ton bureau te donne d'autres chemins</span></summary>
      <div class="grid-2">
        <label>En-tête 1 — nom<input name="header1_name" value="${esc(c.header1_name || "X-API-ID")}" placeholder="X-API-ID"></label>
        <label>En-tête 2 — nom<input name="header2_name" value="${esc(c.header2_name || "X-API-TOKEN")}" placeholder="X-API-TOKEN"></label>
        <label>En-tête 3 — nom (facultatif)<input name="header3_name" value="${esc(c.header3_name || "")}" placeholder="Accept"></label>
        <label>En-tête 3 — valeur<input name="header3_value" type="password" autocomplete="off"
          placeholder="${secretSet(3) ? "•••••• (enregistré)" : "application/json"}"></label>
      </div>
      <p class="muted" style="font-size:12.5px">Les jetons sont chiffrés en base (AES-256-GCM) et jamais renvoyés au navigateur.</p>

    <div class="panel-head" style="margin-top:14px"><h2>Création du colis</h2></div>
    <div class="grid-2">
      <label>Méthode
        <select name="create_method">
          ${["POST", "PUT", "PATCH"].map((m) => `<option ${c.create_method === m ? "selected" : ""}>${m}</option>`).join("")}
        </select></label>
      <label>Chemin<input name="create_path" value="${esc(c.create_path || "/parcels")}" placeholder="/parcels/"></label>
      <label>Mode d'envoi des champs
        <select name="create_body_mode">
          ${[["json", "JSON dans le corps (Yalidine, ZR, Maystro)"],
             ["query", "Query string dans l'URL (EcoTrack, DHD, NOEST)"],
             ["form", "Formulaire URL-encodé"]]
            .map(([v, l]) => `<option value="${v}" ${(c.create_body_mode || "json") === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></label>
      <label>Chemin du message d'erreur<input name="resp_message_path" value="${esc(c.resp_message_path || "message")}" placeholder="message"></label>
    </div>
    <label>Corps de la requête (JSON)
      <textarea name="create_body" rows="12" spellcheck="false" class="mono">${esc(c.create_body || "{}")}</textarea>
      <small class="muted">Variables : <code>{{ref}}</code> <code>{{firstName}}</code> <code>{{lastName}}</code>
        <code>{{fullName}}</code> <code>{{phone}}</code> <code>{{address}}</code> <code>{{wilaya}}</code>
        <code>{{commune}}</code> <code>{{communeId}}</code> <code>{{products}}</code> <code>{{price}}</code>
        <code>{{weight}}</code> <code>{{stopDesk}}</code> <code>{{deliveryType}}</code> <code>{{freeShipping}}</code> <code>{{note}}</code></small></label>

    <details style="margin-top:12px">
      <summary class="muted" style="cursor:pointer;font-size:12.5px">Avancé — plusieurs appels enchaînés (EcoTrack, NOEST, ZR nouvelle plateforme)</summary>
      <label style="margin-top:10px">Pipeline d'appels (JSON)
        <textarea name="create_steps" rows="14" spellcheck="false" class="mono">${esc(c.create_steps || "")}</textarea>
        <small class="muted">Laisser vide pour un seul appel. Chaque étape : <code>method</code>, <code>path</code>,
          <code>body</code>, <code>body_mode</code>, <code>capture</code>, <code>error_path</code>.
          <code>capture</code> mémorise une valeur de la réponse pour les étapes suivantes.</small></label>
    </details>

    <div class="panel-head" style="margin-top:14px"><h2>Lecture de la réponse</h2></div>
    <div class="grid-2">
      <label>Chemin du numéro de suivi<input name="resp_tracking_path" value="${esc(c.resp_tracking_path || "tracking")}" placeholder="data.0.tracking"></label>
      <label>Chemin du bordereau (PDF)<input name="resp_label_path" value="${esc(c.resp_label_path || "label")}" placeholder="data.0.label"></label>
      <label>Chemin du message d'erreur<input name="resp_error_path" value="${esc(c.resp_error_path || "message")}" placeholder="message"></label>
      <label>Chemin des communes<input name="centers_path" value="${esc(c.centers_path || "")}" placeholder="/centers/"></label>
      <label>Chemin du tableau des communes<input name="centers_list_path" value="${esc(c.centers_list_path || "")}" placeholder="data">
        <small class="muted">Laisser vide si la réponse est directement une liste</small></label>
      <label>Champ identifiant commune<input name="center_id_field" value="${esc(c.center_id_field || "id")}"></label>
      <label>Champ nom commune<input name="center_name_field" value="${esc(c.center_name_field || "name")}"></label>
    </div>

    <div class="panel-head" style="margin-top:14px"><h2>Suivi des colis</h2></div>
    <div class="grid-2">
      <label>Méthode du suivi
        <select name="status_method">
          ${["GET", "POST"].map((m) => `<option ${(c.status_method || "GET") === m ? "selected" : ""}>${m}</option>`).join("")}
        </select></label>
      <label>Chemin du statut<input name="status_path" value="${esc(c.status_path || "")}" placeholder="/histories/?tracking={tracking}">
        <small class="muted"><code>{tracking}</code> est remplacé par le numéro</small></label>
      <label>Champ du statut<input name="status_state_field" value="${esc(c.status_state_field || "status")}" placeholder="data.0.status"></label>
      <label>Méthode des communes
        <select name="centers_method">
          ${["GET", "POST"].map((m) => `<option ${(c.centers_method || "GET") === m ? "selected" : ""}>${m}</option>`).join("")}
        </select></label>
    </div>
    <div class="panel-head" style="margin-top:14px"><h2>Bordereau</h2></div>
    <div class="grid-2">
      <label>Chemin du bordereau<input name="label_path" value="${esc(c.label_path || "")}" placeholder="/get/order/label?tracking={tracking}">
        <small class="muted">Laisser vide si le bureau renvoie une URL dans la réponse de création</small></label>
      <label>Méthode
        <select name="label_method">
          ${["GET", "POST"].map((m) => `<option ${(c.label_method || "GET") === m ? "selected" : ""}>${m}</option>`).join("")}
        </select></label>
    </div>
    <label>Corps de la requête de bordereau (si POST)
      <textarea name="label_body" rows="4" spellcheck="false" class="mono">${esc(c.label_body || "")}</textarea></label>

    <label>Corps de la requête de suivi (pour les API en POST)
      <textarea name="status_body" rows="5" spellcheck="false" class="mono">${esc(c.status_body || "")}</textarea>
      <small class="muted">Laisser vide pour un GET. <code>{{tracking}}</code> y est remplacé.</small></label>
    <label>Correspondance des statuts (JSON)
      <textarea name="status_map" rows="8" spellcheck="false" class="mono">${esc(c.status_map || "{}")}</textarea>
      <small class="muted">À gauche le statut du transporteur, à droite le nôtre : <code>livree</code>, <code>expediee</code>, <code>annulee</code>.</small></label>

    </details>
    </fieldset>

    <label class="ckv"><input type="checkbox" name="enabled" ${!c.id || c.enabled ? "checked" : ""}> Transporteur actif</label>
    <div class="form-actions"><button class="btn btn-primary">${c.id ? "Enregistrer" : "Connecter ce transporteur"}</button></div>
  </form>
  ${data.carrier ? `<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
    <form method="post" action="/dashboard/transporteur/centres" class="inline"><input type="hidden" name="id" value="${c.id || ""}"><button class="btn btn-ghost btn-sm">Récupérer les bureaux</button></form>
    <form method="post" action="/dashboard/transporteur/sync" class="inline"><button class="btn btn-ghost btn-sm">Synchroniser les statuts</button></form>
    <form method="post" action="/dashboard/transporteur/delete" class="inline" onsubmit="return confirm('Déconnecter ce transporteur ?')"><input type="hidden" name="id" value="${c.id || ""}"><button class="link-danger">Déconnecter</button></form>
  </div>` : ""}
  ${data.centers.length ? `<p class="muted" style="font-size:12.5px;margin-top:8px">${data.centers.length} bureau(x) enregistré(s) — le client pourra choisir le sien à la commande.</p>` : ""}
  ${deskHelp(data.carrier)}
  ${sendDoc(data.carrier)}
</section>

<section class="panel">
  <div class="panel-head"><h2>Bureaux de livraison</h2>
    <span class="muted">${data.centers.length} bureau(x)</span></div>
  ${data.carrier ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
    <form method="post" action="/dashboard/transporteur/centres" class="inline">
      <input type="hidden" name="id" value="${c.id || ""}">
      <button class="btn btn-primary btn-sm">Importer les bureaux (dzship)</button>
    </form>
  </div>` : `<p class="muted">Connecte d'abord un transporteur pour importer ses bureaux.</p>`}

  ${data.centers.length ? `<table class="table">
    <thead><tr><th>Bureau</th><th>Wilaya</th><th>Commune</th><th>Adresse</th><th>Téléphone</th></tr></thead>
    <tbody>${data.centers.slice(0, 60).map((c) => `<tr>
      <td><b>${esc(c.name)}</b></td>
      <td>${esc(c.wilaya || "") || `<span class="muted">—</span>`}</td>
      <td>${esc(c.commune || "") || `<span class="muted">—</span>`}</td>
      <td class="muted">${esc(c.address || "")}</td>
      <td class="muted">${esc(c.phone || "")}</td>
    </tr>`).join("")}</tbody>
  </table>
  ${data.centers.length > 60 ? `<p class="muted small">60 premiers bureaux affichés sur ${data.centers.length}.</p>` : ""}`
    : `<div class="empty-state">${icon("truck", 22)}<h3>Aucun bureau importé</h3>
      <p>Importe-les depuis l'API de ton transporteur, ou colle la liste à la main ci-dessous.</p></div>`}

  <details class="mt-3">
    <summary><b>Coller la liste à la main</b> <span class="muted">— une ligne par bureau : nom ; wilaya ; commune ; adresse ; téléphone ; identifiant</span></summary>
    <form method="post" action="/dashboard/transporteur/centres/manual" class="form" style="margin-top:12px">
      <label>Liste des bureaux
        <textarea name="list" rows="6" placeholder="Agence Blida Centre ; Blida ; Blida ; 12 rue des Frères ; 025 00 00 00 ; BLD-01"></textarea>
        <small class="muted">Une ligne par bureau : nom ; wilaya ; commune ; adresse ; téléphone ; identifiant (facultatif — celui que le transporteur t'a donné).</small>
      </label>
      <button class="btn btn-ghost">Importer ces bureaux</button>
    </form>
  </details>
</section>

<section class="panel">
  <div class="panel-head"><h2>Derniers envois</h2><span class="muted">Synchronisés automatiquement toutes les 10 minutes</span></div>
  ${data.shipments.length ? `<table class="table">
    <thead><tr><th>Commande</th><th>Transporteur</th><th>Suivi</th><th>Statut</th><th>Envoyé</th><th>Synchronisé</th><th></th></tr></thead>
    <tbody>${data.shipments.map((s) => `<tr>
      <td><a class="link" href="/dashboard/orders/${s.order_id}"><b>#${esc(s.order_ref)}</b></a></td>
      <td>${esc(s.carrier_name || s.carrier_label || "")}</td>
      <td>${s.tracking ? `<b>${esc(s.tracking)}</b>` : `<span class="muted">—</span>`}</td>
      <td>${esc(s.state && s.state !== "envoye" ? s.state : "en attente")}</td>
      <td class="muted">${esc(String(s.created_at).slice(0, 16))}</td>
      <td class="muted">${esc(String(s.synced_at || "—").slice(0, 16))}</td>
      <td class="right">${s.label_url ? `<a class="link" target="_blank" rel="noopener" href="${esc(s.label_url)}">Bordereau</a>` : ""}</td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("truck", 22)}<h3>Aucun colis envoyé</h3>
    <p>Connecte un transporteur, puis ouvre une commande pour lui envoyer le colis.</p></div>`}
</section>
<script>
  (function () {
    var cat = ${JSON.stringify(CARRIERS.presets.map((p) => ({ k: p.key, h: p.hint, c: p.credentials || [], u: !!p.requiresBaseUrl, l: (p.credentials || []).map((k) => DZ.credLabel(k)) })))}
    var by = {}
    cat.forEach(function (p) { by[p.k] = p })
    var sel = document.getElementById("ndzPreset")
    var hint = document.getElementById("ndzPresetHint")
    var q = document.getElementById("ndzCourierQ")
    var base = document.getElementById("ndzBase")
    function apply() {
      if (!sel) return
      var p = by[sel.value]
      if (hint) hint.textContent = p ? p.h : ""
      if (base) {
        base.hidden = !(p && p.u)
        var bin = base.querySelector("input")
        if (bin) bin.disabled = !(p && p.u)
      }
      var slots = document.querySelectorAll(".dz-cred")
      slots.forEach(function (el, i) {
        var name = p && p.c[i]
        el.hidden = !name
        var lab = el.querySelector("[data-credlabel]")
        var hid = el.querySelector("[data-credname]")
        if (lab) lab.textContent = name ? (p.l[i] || name) : ""
        if (hid) hid.value = name || ""
      })
    }
    if (sel) sel.addEventListener("change", apply)
    if (q && sel) q.addEventListener("input", function () {
      var n = q.value.trim().toLowerCase()
      Array.prototype.forEach.call(sel.options, function (o) {
        var show = !n || o.textContent.toLowerCase().indexOf(n) !== -1 || (o.parentElement && o.parentElement.label && o.parentElement.label.toLowerCase().indexOf(n) !== -1)
        o.hidden = !show
      })
    })
    apply()
  })()
</script>`, "transporteur")
}


/** Ce que la documentation officielle dit des bureaux, selon la famille. */
const DESK_HELP = {
  yalidine: ["Yalidine attend deux choses : le drapeau <code>is_stopdesk = 1</code> et l'<b>identifiant</b> du bureau (<code>stopdesk_id</code>). Importe les bureaux : sans identifiant, le colis au bureau est refusé.", "/centers/"],
  ecotrack: ["EcoTrack ne publie pas de bureaux nommés : un bureau, c'est sa commune. Le colis part avec <code>stop_desk = 1</code> et la commune du bureau.", "/get/communes"],
  noest: ["NOEST attend <code>stop_desk = 1</code> et le <b>code station</b> du bureau (ex. <code>16A</code>, le numéro étant la wilaya). Importe les bureaux pour les avoir.", "/api/public/desks"],
  maystro: ["Maystro n'accepte aucun identifiant de bureau : <code>delivery_type = 2</code> (1 = domicile, 3 = point relais) et la commune du bureau font le travail.", ""],
  procolis: ["Cette plateforme (ZR Express ancienne, Abex, Colilog…) ne publie <b>aucune</b> liste de bureaux. Le client choisit une commune et le transporteur affecte le bureau à l'arrivée.", ""],
  "zr-new": ["Nouvelle plateforme ZR : le bureau se choisit par son <code>hubId</code> avec <code>deliveryType: &quot;pickup-point&quot;</code>. Importe les bureaux pour l'alimenter.", ""],
}

const deskHelp = (carrier) => {
  if (!carrier) return ""
  if (DZ.handles(carrier)) {
    return `<div class="desk-help"><b>Bureaux de retrait</b><p>${esc(DZ.deskNote(carrier))}</p></div>`
  }
  const h = DESK_HELP[carrier.preset]
  if (!h) return ""
  return `<div class="desk-help">
    <b>Bureaux de retrait — ce que demande ce transporteur</b>
    <p>${h[0]}</p>
    ${h[1] ? `<p class="muted">Chemin de la liste dans son API : <code>${esc(h[1])}</code></p>` : ""}
  </div>`
}


/** Champs que ce transporteur EXIGE pour accepter une commande (doc officielle). */
const sendDoc = (carrier) => {
  if (!carrier) return ""
  const fam = CARRIERS.familyOf(carrier)
  const req = (CARRIERS.FIELDS.REQUIRED[fam] || [])
  if (!req.length) return `<div class="desk-help" style="margin-top:12px">
    <b>Champs exigés</b><p>Transporteur maison : c'est ta configuration qui décide. Novadz t'offre toutes les variables
    (<code>{{firstName}}</code>, <code>{{phone}}</code>, <code>{{deskId}}</code>…) et n'impose aucun champ.</p></div>`
  const limit = CARRIERS.FIELDS.DESC_LIMIT[fam] || 300
  const deskRule = CARRIERS.FIELDS.DESK_ID_REQUIRED.includes(fam)
    ? "Identifiant du bureau obligatoire pour un retrait en bureau."
    : fam === "maystro" ? "La commune doit être l'identifiant numérique Maystro."
    : "Le retrait en bureau passe par la commune du bureau."
  return `<details class="desk-help" style="margin-top:12px">
    <summary><b>Champs exigés pour envoyer une commande</b>
      <span class="muted">— ${req.length} champs, description ${limit} caractères max</span></summary>
    <table class="psheet-rows" style="margin-top:10px">
      ${req.map((f) => `<tr><th>${esc(f.label)}<br><code>{{${esc(f.k)}}}</code></th>
        <td class="muted">${esc(f.how)}</td></tr>`).join("")}
      <tr><th>Bureau de retrait<br><code>{{stopDesk}}</code></th><td class="muted">${esc(deskRule)}</td></tr>
    </table>
    <p class="muted" style="font-size:12px;margin-top:8px">Une commande incomplète n'est jamais envoyée :
    la fiche commande affiche les champs manquants et bloque le bouton.</p>
  </details>`
}

/** Bloc « envoi du colis » ajouté dans la fiche commande. */
/** Récapitulatif « ce qui part chez le transporteur » + ce qui manque. */
const parcelSheetBlock = (sheet, error) => {
  if (!sheet) return ""
  const c = sheet.check
  return `<div class="psheet">
    <div class="psheet-head">
      <b>Ce qui part chez ${esc(sheet.family)}</b>
      <span class="${c.ok ? "tag-ok" : "tag-ko"}">${c.ok ? "Fiche complète" : c.missing.length + " champ(s) obligatoire(s) manquant(s)"}</span>
    </div>
    ${c.ok ? "" : `<ul class="psheet-missing">${c.missing.map((m) => `<li><b>${esc(m.label)}</b> <span class="muted">— ${esc(m.how)}</span></li>`).join("")}</ul>`}
    ${error && !c.ok ? "" : ""}
    <table class="psheet-rows">${sheet.rows.map((r) => `<tr>
      <th>${esc(r.label)}<br><code>${esc(r.var)}</code></th>
      <td>${esc(r.value || "—") || `<span class="muted">—</span>`}</td></tr>`).join("")}</table>
    ${c.warnings.length ? `<p class="muted small">${c.warnings.map(esc).join("<br>")}</p>` : ""}
  </div>`
}

const carrierBlock = (order, carrier, centers, shipment, sheet, error, carriers = []) => {
  if (!carrier) return ""
  /* menu des sociétés de livraison : tout ce qui est connecté, ni plus ni moins */
  const carrierPick = carriers.length > 1
    ? `<label class="ck-f ck-wide"><span>Société de livraison</span>
        <form method="get" action="/dashboard/orders/${order.id}" class="inline" style="margin:0">
          <select name="carrier" onchange="this.form.submit()" aria-label="Choisir la société de livraison">
            ${carriers.map((c) => `<option value="${c.id}" ${c.id === carrier.id ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
          </select>
        </form>
      </label>`
    : `<p class="muted small" style="margin:0 0 8px">Société de livraison : <b>${esc(carrier.label)}</b></p>`
  const confirmed = ORD.norm(order.status) === "confirmee"
  if (!confirmed && !shipment) {
    return `<div class="carrier-box">
      <b>Envoyer à ${esc(carrier.label)}</b>
      <p class="ord-hint warn">${icon("shield", 14)} Commande non confirmée : elle ne peut pas être expédiée.
        Confirme-la avec le client, puis reviens ici.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <form method="post" action="/dashboard/orders/${order.id}/status" class="inline">
          <input type="hidden" name="status" value="confirmee">
          <input type="hidden" name="back" value="detail">
          <button class="btn btn-primary btn-sm">${icon("check", 15)} Confirmer la commande</button>
        </form>
      </div>
      ${error ? `<p class="flash-ko">${esc(error)}</p>` : ""}
    </div>`
  }
  if (shipment) {
    const sentName = shipment.carrier_name || shipment.carrier_label || (carrier && carrier.label) || "Transporteur"
    const sentState = shipment.state && shipment.state !== "envoye" ? shipment.state : "en attente de suivi"
    return `<div class="carrier-box">
      <b>Colis envoyé — ${esc(sentName)}</b>
      <p class="muted">Numéro : <b>${esc(shipment.tracking || "—")}</b><br>Statut chez ${esc(sentName)} : ${esc(sentState)}</p>
      ${eventList(parcelEvents(shipment))}
      ${shipment.label_file
        ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="/dashboard/orders/${order.id}/bordereau">Ouvrir le bordereau (PDF)</a>`
        : shipment.label_url
          ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(shipment.label_url)}">Ouvrir le bordereau</a>`
          : ""}
    </div>`
  }
  return `<div class="carrier-box">
    <b>Envoyer à ${esc(carrier.label)}</b>
    ${error ? `<p class="flash-ko">${esc(error)}</p>` : ""}
    ${carrierPick}
    ${parcelSheetBlock(sheet, error)}
    <form method="post" action="/dashboard/orders/${order.id}/expedier" class="stack">
      <input type="hidden" name="carrier_id" value="${carrier.id}">
      ${centers.length
        ? `<label>Commune<select name="commune_id">${centers.map((c) => `<option value="${esc(c.external_id)}|${esc(c.name)}">${esc(c.name)}</option>`).join("")}</select></label>`
        : `<label>Commune<input name="commune" placeholder="Blida centre" required></label>`}
      <label>Type de livraison
        <select name="stopDesk"><option value="0">À domicile</option><option value="1">Stop desk (bureau)</option></select></label>
      ${centers.length
        ? `<label class="ckv-desk">Bureau de retrait (si au bureau)
            <select name="desk_id">
              <option value="">— aucun —</option>
              ${centers.map((c) => `<option value="${esc(c.external_id)}|${esc(c.name)}|${esc(c.commune || "")}">${esc(c.name)}${c.commune ? " — " + esc(c.commune) : ""}${c.wilaya ? " (" + esc(c.wilaya) + ")" : ""}</option>`).join("")}
            </select>
            <small class="muted">Envoyé à l'API : le bureau choisi, sa commune et son identifiant.</small>
          </label>`
        : `<p class="muted small">Ce transporteur ne publie pas de liste de bureaux : le client choisit une commune, le bureau est affecté à l'arrivée.</p>`}
      <label>Montant à encaisser (DZD)
        <input name="price" type="number" min="0" step="1" value="${Math.round(order.total_cents / 100)}"></label>
      <label class="ckv"><input type="checkbox" name="free_shipping" checked> Livraison déjà payée par le client (freeshipping)</label>
      <button class="btn btn-primary btn-block" ${sheet && !sheet.check.ok ? "disabled" : ""}>Envoyer le colis</button>
      ${sheet && !sheet.check.ok ? `<p class="muted small">Complète les champs ci-dessus pour débloquer l'envoi.</p>` : ""}
    </form>
  </div>`
}


/* ============================== DASHBOARD : PANIERS ABANDONNÉS ============================== */
const dashCarts = (user, store, data) => {
  const st = data.stats
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Paniers abandonnés</h1>
    <p class="muted">Les visiteurs qui ont rempli un panier sans commander. Relance en un clic par WhatsApp.</p></div>
  <form method="post" action="/dashboard/paniers/detecter" class="inline"><button class="btn btn-ghost">Détecter maintenant</button></form>
</header>

<div class="stat-grid">
  <div class="stat"><span>À relancer</span><b>${st.abandoned}</b><small>${money(st.value)} en jeu</small></div>
  <div class="stat"><span>Taux de conversion</span><b>${st.rate}%</b><small>${st.converted} panier(s) transformé(s)</small></div>
  <div class="stat"><span>Récupérés après relance</span><b>${st.recoveredCount}</b><small>${money(st.recoveredValue)} encaissés</small></div>
  <div class="stat"><span>En cours</span><b>${st.live}</b><small>visiteurs actifs</small></div>
</div>

<section class="panel">
  <div class="panel-head"><h2>À relancer</h2>
    <span class="muted">Délai : ${data.delay} min sans activité</span></div>
  ${data.carts.length ? `<table class="table">
    <thead><tr><th>Client</th><th>Panier</th><th>Montant</th><th>Dernière activité</th><th>Relances</th><th></th></tr></thead>
    <tbody>${data.carts.map((c) => `<tr>
      <td>
        <b>${esc(c.name || "Visiteur anonyme")}</b><br>
        <span class="muted">${esc(c.phone || "—")}</span>
      </td>
      <td class="muted" style="font-size:12px">${esc(articlesOf(c.items_json, 2))}</td>
      <td><b>${money(c.subtotal_cents)}</b></td>
      <td class="muted">${esc(humanAgo(c.last_seen))}</td>
      <td>${c.remind_count ? `<span class="pill">${c.remind_count}</span>` : `<span class="muted">—</span>`}</td>
      <td class="right" style="white-space:nowrap">
        ${c.phone
          ? `<a class="btn btn-primary btn-sm" href="/${esc(store.slug)}/panier/${esc(c.token)}/relancer" target="_blank" rel="noopener">Relancer</a>`
          : `<span class="muted" style="font-size:11.5px">sans téléphone</span>`}
      </td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("cart", 22)}<h3>Aucun panier abandonné</h3>
    <p>Les paniers en cours apparaîtront ici dès qu'un visiteur les laisse de côté.</p></div>`}
</section>

<section class="panel">
  <div class="panel-head"><h2>Comment ça marche</h2></div>
  <p class="muted" style="font-size:12.5px;max-width:62ch">
    Le panier est enregistré à chaque étape : ouverture du panier, changement de quantité, et
    saisie du nom / téléphone sur la page de commande. Un panier devient « abandonné » après
    ${data.delay} minutes sans activité. Le bouton <b>Relancer</b> ouvre WhatsApp avec le message
    déjà écrit et le lien de récupération du panier. Aucune API n'est nécessaire.
    Pour l'envoi 100 % automatique, configure ton fournisseur dans <a class="link" href="/dashboard/relances">Relances</a>.
  </p>
</section>`, "paniers")
}

const articlesOf = (json, max = 2) => {
  try {
    const items = JSON.parse(json || "[]")
    const parts = items.slice(0, max).map((i) => `${i.title} x${i.qty}`)
    return items.length > max ? parts.join(", ") + ` +${items.length - max}` : parts.join(", ")
  } catch (_) { return "" }
}

const humanAgo = (sqlDate) => {
  const t = Date.parse(String(sqlDate || "").replace(" ", "T") + "Z")
  if (!t) return "—"
  const min = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

/* ============================== DASHBOARD : RELANCES ============================== */
const dashRelances = (user, store, data) => {
  const msgRow = (m) => `<tr>
      <td><b>${esc(m.to_phone || "—")}</b></td>
      <td class="muted" style="font-size:12px;max-width:46ch">${esc(String(m.body || "").slice(0, 150))}${String(m.body || "").length > 150 ? "…" : ""}</td>
      <td class="muted">${esc(m.kind)}</td>
      <td><span class="pill ${m.status === "sent" ? "livree" : m.status === "failed" ? "annulee" : "nouvelle"}">${esc(m.status)}</span></td>
      <td class="right" style="white-space:nowrap">
        ${m.status !== "sent" && m.to_phone ? `<a class="link" target="_blank" rel="noopener" href="${esc(REL.waLink(m.to_phone, m.body))}">WhatsApp</a>` : ""}
        ${m.status === "pending" ? ` <form method="post" action="/dashboard/relances/${m.id}/envoye" class="inline"><button class="link">Marquer envoyé</button></form>` : ""}
      </td>
    </tr>`
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Relances</h1>
    <p class="muted">Sans API, tu cliques sur WhatsApp. Avec une API enregistrée, NovaDZ envoie seul, toutes les 10 minutes.</p></div>
</header>

${data.saved ? `<div class="alert ok">Réglages enregistrés.</div>` : ""}
${data.note ? `<div class="alert ${data.note.ok ? "ok" : ""}">${esc(data.note.text)}</div>` : ""}

<section class="panel">
  <div class="panel-head"><h2>Envoi</h2>
    <span class="pill ${store.msg_provider === "custom" ? "ok" : "off"}">${store.msg_provider === "custom" ? "Envoi automatique" : "manuel (WhatsApp)"}</span></div>
  <form method="post" action="/dashboard/relances">
    <div class="grid-2">
      <label>Mode d'envoi
        <select name="msg_provider">
          <option value="manual" ${store.msg_provider !== "custom" ? "selected" : ""}>Manuel — lien WhatsApp cliquable</option>
          <option value="custom" ${store.msg_provider === "custom" ? "selected" : ""}>Automatique — une API envoie à ma place</option>
        </select></label>
      <label>Délai avant « abandonné » (minutes)
        <input name="msg_delay_minutes" type="number" min="5" max="1440" value="${Number(store.msg_delay_minutes) || 45}"></label>
    </div>
    <div class="grid-2">
      <label>URL de l'API d'envoi
        <input name="msg_url" value="${esc(store.msg_url || "")}" placeholder="https://api.mon-fournisseur.dz/send">
        <small class="muted">WhatsApp Cloud API, passerelle SMS locale, Make/Zapier…</small></label>
      <label>En-tête d'authentification
        <input name="msg_header_name" value="${esc(store.msg_header_name || "Authorization")}" placeholder="Authorization"></label>
      <label>Valeur de l'en-tête
        <input name="msg_header_value" type="password" autocomplete="off"
          placeholder="${store.msg_header_value_enc ? "•••••• (enregistré, laisser vide pour garder)" : "Bearer ton_jeton"}"></label>
    </div>
    <label>Corps envoyé à l'API (JSON)
      <textarea name="msg_body" rows="5" spellcheck="false" class="mono">${esc(store.msg_body || '{\n  "to": "{{phone}}",\n  "message": "{{texte}}"\n}')}</textarea>
      <small class="muted"><code>{{phone}}</code> et <code>{{texte}}</code> sont remplacés.</small></label>

    <div class="panel-head" style="margin-top:14px"><h2>Messages</h2></div>
    <label>Relance de panier
      <textarea name="msg_template_cart" rows="4" class="mono">${esc(store.msg_template_cart || data.defaultCart)}</textarea>
      <small class="muted"><code>{{nom}}</code> <code>{{boutique}}</code> <code>{{articles}}</code> <code>{{total}}</code> <code>{{lien}}</code></small></label>
    <label>Suivi de commande
      <textarea name="msg_template_order" rows="3" class="mono">${esc(store.msg_template_order || data.defaultOrder)}</textarea>
      <small class="muted"><code>{{nom}}</code> <code>{{ref}}</code> <code>{{statut}}</code> <code>{{lien}}</code></small></label>

    <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
  </form>
</section>

<section class="panel">
  <div class="panel-head"><h2>Journal des messages</h2>
    ${store.msg_provider === "custom" ? `<form method="post" action="/dashboard/relances/envoyer" class="inline"><button class="btn btn-ghost btn-sm">Envoyer maintenant</button></form>` : ""}</div>
  ${data.messages.length ? `<table class="table">
    <thead><tr><th>Destinataire</th><th>Message</th><th>Type</th><th>État</th><th></th></tr></thead>
    <tbody>${data.messages.map(msgRow).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("receipt", 22)}<h3>Aucun message</h3><p>Les relances de panier apparaîtront ici.</p></div>`}
</section>`, "relances")
}

/* ============================== DASHBOARD : STATISTIQUES LIVRAISON ============================== */
const dashDeliveryStats = (user, store, data) => dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Statistiques de livraison</h1>
    <p class="muted">Quel bureau livre vraiment, et à quel prix pour toi.</p></div>
  <form method="post" action="/dashboard/livraison/sync" class="inline"><button class="btn btn-ghost">Synchroniser les statuts</button></form>
</header>

<div class="stat-grid">
  <div class="stat"><span>Colis envoyés</span><b>${data.overview.sent}</b></div>
  <div class="stat"><span>Livrés</span><b>${data.overview.delivered}</b><small>${data.overview.rate}% de réussite</small></div>
  <div class="stat"><span>Retours</span><b>${data.overview.returned}</b><small>colis revenus</small></div>
  <div class="stat"><span>Délai moyen</span><b>${data.overview.hours != null ? data.overview.hours + " h" : "—"}</b><small>jusqu'à la livraison</small></div>
</div>

${data.verdict ? `<div class="alert ok">
  <b>${esc(data.verdict.best)}</b> livre ${data.verdict.gap} points de mieux que <b>${esc(data.verdict.worst)}</b>
  (${data.verdict.bestRate}% contre ${data.verdict.worstRate}%). À volume égal, c'est de l'argent qui reste chez toi.
</div>` : ""}

<section class="panel">
  <div class="panel-head"><h2>Par transporteur</h2></div>
  ${data.carriers.length ? `<table class="table">
    <thead><tr><th>Transporteur</th><th>Envoyés</th><th>Livrés</th><th>Retours</th><th>En cours</th><th>Taux</th><th>Encaissé</th><th>Perdu</th></tr></thead>
    <tbody>${data.carriers.map((c) => `<tr>
      <td><b>${esc(c.carrier)}</b><br><span class="muted" style="font-size:11px">${esc(c.preset)}</span></td>
      <td>${c.sent}</td>
      <td>${c.delivered || 0}</td>
      <td>${c.returned || 0}</td>
      <td class="muted">${c.transit || 0}</td>
      <td><b>${c.rate}%</b></td>
      <td>${money(c.collected || 0)}</td>
      <td class="muted">${money(c.lost || 0)}</td>
    </tr>`).join("")}</tbody>
  </table>` : `<div class="empty-state">${icon("truck", 22)}<h3>Aucun colis envoyé</h3>
    <p>Connecte un transporteur et expédie une commande pour voir apparaître les chiffres.</p></div>`}
</section>

<section class="panel">
  <div class="panel-head"><h2>Par wilaya</h2><span class="muted">Là où tes colis se perdent</span></div>
  ${data.wilayas.length ? `<table class="table">
    <thead><tr><th>Wilaya</th><th>Envoyés</th><th>Livrés</th><th>Retours</th><th>Taux</th></tr></thead>
    <tbody>${data.wilayas.map((w) => `<tr>
      <td><b>${esc(w.wilaya)}</b></td>
      <td>${w.sent}</td>
      <td>${w.delivered || 0}</td>
      <td>${w.returned || 0}</td>
      <td><b>${w.rate}%</b></td>
    </tr>`).join("")}</tbody>
  </table>` : `<p class="muted">Aucune donnée pour l'instant.</p>`}
</section>`, "livraison")


/* ======================================================================
   MOYENS DE PAIEMENT — le marchand active ce qu'il propose
   ====================================================================== */
/**
 * Réseaux sociaux : les liens vivent ici (données), l'emplacement se règle
 * dans le Design. Comme sur Shopify : on remplit, puis on place.
 */
const dashSocial = (user, store, saved, error) => {
  const SOCIAL = require("./social")
  const links = SOCIAL.list(store.id)
  const byNet = Object.fromEntries(links.map((l) => [l.network, l]))
  const active = links.length
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Réseaux sociaux</h1><p class="muted">Collez vos adresses une fois. Ensuite, choisissez où elles s'affichent dans <a href="/dashboard/design">Design → Réseaux sociaux</a>.</p></div>
  <span class="pill ${active ? "ok" : "off"}">${active ? active + " lien(s)" : "aucun lien"}</span>
</header>
${saved ? `<div class="alert ok">Réseaux sociaux enregistrés${saved !== "1" ? " — " + esc(saved) : ""}.</div>` : ""}

<form method="post" action="/dashboard/reseaux">
  <section class="panel">
    <div class="panel-head"><h2>Mes comptes</h2><span class="muted">Laissez vide ce que vous n'utilisez pas.</span></div>
    <div class="social-grid">
      ${SOCIAL.NETWORKS.map((n) => {
        const row = byNet[n.id]
        return `<div class="social-row${row ? " on" : ""}">
          <span class="social-ico">${icon(n.icon, 20)}</span>
          <div class="social-fields">
            <label>${esc(n.name)}
              <textarea class="url-box" name="url_${n.id}" rows="2" placeholder="${esc(n.ph)}" autocomplete="off">${esc(row ? row.url : "")}</textarea>
            </label>
            <label>Nom affiché (facultatif)
              <input name="label_${n.id}" value="${esc(row ? row.label : "")}" placeholder="@maboutique" maxlength="40">
            </label>
          </div>
        </div>`
      }).join("")}
    </div>
    <p class="muted small">Une adresse sans « https:// » est complétée automatiquement. Seuls les liens http(s) sont acceptés.</p>
  </section>
  <div class="form-actions"><button class="btn btn-primary">Enregistrer</button>
    <a class="btn btn-ghost" href="/dashboard/design">Choisir l'emplacement dans le Design</a></div>
</form>`)
}

const dashPayments = (user, store, saved, error) => {
  const PAY = require("./payments")
  const on = (k) => (Number(store[k]) === 1 ? "checked" : "")
  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Paiement</h1><p class="muted">Choisissez ce que vos clients peuvent utiliser. Vous pouvez tout modifier à tout moment.</p></div>
</header>
${saved ? `<div class="alert ok">Réglages de paiement enregistrés.</div>` : ""}

<form method="post" action="/dashboard/paiement">
  <section class="panel">
    <div class="panel-head"><h2>Moyens acceptés</h2>
      <span class="pill ${PAY.list(store).length ? "ok" : "off"}">${PAY.list(store).length ? PAY.list(store).length + " actif(s)" : "aucun"}</span>
    </div>

    <label class="pay-card">
      <input type="checkbox" name="pay_cod" value="1" ${on("pay_cod")}>
      <span class="pay-card-body">
        <b>Paiement à la livraison</b>
        <span>Le client paie le livreur à la réception. Recommandé en Algérie.</span>
        <span class="pay-sub">
          <span class="pay-field">Frais ajoutés (DZD)
            <input type="number" name="pay_cod_fee" min="0" max="5000" step="50"
              value="${Math.round(Number(store.pay_cod_fee || 0) / 100)}">
          </span>
          <span class="pay-field">Texte affiché au client
            <input name="pay_cod_label" value="${esc(store.pay_cod_label || "")}" placeholder="Payez en espèces à la réception">
          </span>
        </span>
      </span>
    </label>

    <label class="pay-card">
      <input type="checkbox" name="pay_cib" value="1" ${on("pay_cib")}>
      <span class="pay-card-body">
        <b>Carte CIB / Edahabia</b>
        <span>Paiement par carte via la page de votre banque ou de votre prestataire.</span>
        <span class="pay-sub">
          <span class="pay-field full">Instructions affichées au client
            <textarea name="pay_cib_note" rows="2" placeholder="Vous serez redirigé vers la page de paiement sécurisée de la banque.">${esc(store.pay_cib_note || "")}</textarea>
          </span>
        </span>
      </span>
    </label>

    <label class="pay-card">
      <input type="checkbox" name="pay_bank" value="1" ${on("pay_bank")}>
      <span class="pay-card-body">
        <b>Virement / versement CCP</b>
        <span>Le client verse sur votre compte puis envoie le reçu (WhatsApp, téléphone).</span>
        <span class="pay-sub">
          <span class="pay-field full">Vos coordonnées bancaires
            <textarea name="pay_bank_note" rows="2" placeholder="CCP 0012345678 clé 12 — au nom de …">${esc(store.pay_bank_note || "")}</textarea>
          </span>
        </span>
      </span>
    </label>

    <label class="pay-card">
      <input type="checkbox" name="pay_online" value="1" ${on("pay_online")}>
      <span class="pay-card-body">
        <b>Paiement en ligne (votre prestataire)</b>
        <span>Vous collez l'adresse de paiement de votre prestataire (Chargily, SATAM, autre). Aucun prestataire n'est imposé.</span>
        <span class="pay-sub">
          <span class="pay-field">Adresse de paiement
            <input name="pay_online_url" value="${esc(store.pay_online_url || "")}" placeholder="https://…">
          </span>
          <span class="pay-field">Consigne affichée
            <input name="pay_online_note" value="${esc(store.pay_online_note || "")}" placeholder="Vous serez redirigé vers le paiement sécurisé.">
          </span>
        </span>
      </span>
    </label>

    <label class="pay-note">Message affiché à l'étape paiement (facultatif)
      <textarea name="pay_note" rows="2" placeholder="Exemple : pour les commandes hors wilaya, un acompte peut être demandé.">${esc(store.pay_note || "")}</textarea>
    </label>

    <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
  </section>
</form>`)
}


/* ======================================================================
   CHOIX DU THÈME (façon Shopify) — on choisit un modèle, puis on modifie
   ====================================================================== */
const dashThemes = (user, store, templates = []) => {
  const THEMES = require("./public-themes").present(require("./themes").THEMES)
  const fs = require("fs")
  const path = require("path")
  const draft = require("./sections").readDraft(store) || {}
  const trial = draft.theme && draft.theme !== store.theme ? draft.theme : ""
  const publicName = String(draft.publicThemeName || "").trim()
  const nowTh = THEMES.find((t) => t.id === store.theme) || THEMES[0]
  const trialTh = trial ? THEMES.find((t) => t.id === trial) : null

  /* les six thèmes prêts ont une vraie capture d'écran ; les autres gardent
     la petite maquette dessinée */
  const shot = (t, cls = "th-shot") => {
    const file = `/demo/theme-${t.id}.jpg`
    if (fs.existsSync(path.join(__dirname, "..", "public", "demo", `theme-${t.id}.jpg`)))
      return `<div class="${cls}"><img src="${file}" alt="Aperçu du thème ${esc(t.name)}" loading="lazy"></div>`
    /* pas de capture : la maquette du thème, pas trois pastilles vides */
    return `<div class="${cls} is-mock">
      <span class="theme-preview tpv-${esc(t.id)}" aria-hidden="true">
        <span class="tp-head"><i></i><i></i></span>
        <span class="tp-hero"></span>
        <span class="tp-grid"><i></i><i></i><i></i><i></i></span>
      </span>
    </div>`
  }

  const dots = (t) => `<div class="theme-dots">${t.dots.map((d) => `<i style="background:${esc(d)}"></i>`).join("")}</div>`

  const card = (t) => `
  <article class="th-card${t.id === store.theme ? " is-now" : ""}${t.id === trial ? " is-trial" : ""}" data-theme="${esc(t.id)}">
    ${shot(t)}
    <div class="th-body">
      <div class="th-name"><b>${esc(t.name)}</b>
        ${t.id === store.theme ? `<span class="pill livree">publié</span>` : ""}
        ${t.id === trial ? `<span class="pill confirmee">essai</span>` : ""}
      </div>
      <p class="th-ideal">${icon("store", 13)} <span>${esc(t.ideal)}</span></p>
      <p class="th-desc">${esc(t.desc)}</p>
      ${dots(t)}
      <div class="th-actions">
        ${t.id === store.theme
          ? `<a class="btn btn-primary btn-sm" href="/dashboard/design?reglages=1">Modifier ce thème</a>`
          : `<form method="post" action="/dashboard/design/theme" class="inline">
               <input type="hidden" name="theme" value="${esc(t.id)}">
               <button class="btn ${t.id === trial ? "btn-primary" : "btn-ghost"} btn-sm">${t.id === trial ? "Continuer l'essai" : "Choisir ce thème"}</button>
             </form>`}
      </div>
    </div>
  </article>`

  const PRETS = ["atelier", "electro", "bureau", "audio", "soin", "mode"]
  const prets = THEMES.filter((t) => PRETS.includes(t.id) && t.id !== store.theme)
  const groups = (prets.length ? `<section class="th-group">
      <div class="th-group-head"><h2>Les six thèmes prêts à l'emploi</h2><p>Chacun a sa structure, sa police et sa photo d'accueil — et une recette de blocs déjà remplie.</p></div>
      <div class="th-grid">${prets.map(card).join("")}</div>
    </section>` : "") +
    require("./themes").CATEGORIES.map(([id, title, desc]) => {
      const list = THEMES.filter((t) => t.cat === id && t.id !== store.theme && !PRETS.includes(t.id))
      if (!list.length) return ""
      return `<section class="th-group">
        <div class="th-group-head"><h2>${esc(title)}</h2><p>${esc(desc)}</p></div>
        <div class="th-grid">${list.map(card).join("")}</div>
      </section>`
    }).join("")

  return dashLayout(user, store, `
<header class="dash-head">
  <div><h1>Thèmes</h1><p class="muted">Ton thème publié est en haut. En dessous, tu choisis un autre thème d'un clic : tu le vois avec tes produits, puis tu publies — ou tu annules.</p></div>
  <div class="head-actions"><a class="btn btn-ghost" href="/dashboard/design">${icon("palette", 15)} Modifier le design</a></div>
</header>

${trialTh ? `<section class="th-trial">
  <div class="th-trial-txt">
    <b>Thème d'essai : ${esc(publicName || trialTh.name)}</b>
    <span>Il n'est pas encore visible par tes clients. Ta boutique en ligne est toujours sur <b>${esc(nowTh.name)}</b>.</span>
  </div>
  <div class="th-trial-actions">
    <a class="btn btn-primary btn-sm" href="/dashboard/design?trial=1">Le voir et publier</a>
    <form method="post" action="/dashboard/design/theme/cancel" class="inline">
      <button class="btn btn-ghost btn-sm">Annuler l'essai</button>
    </form>
  </div>
</section>` : ""}

<section class="th-now" data-theme="${esc(nowTh.id)}">
  ${shot(nowTh, "th-now-shot")}
  <div class="th-now-body">
    <span class="th-badge">${icon("check", 13)} Thème publié — c'est ce que voient tes clients</span>
    <h2>${esc(nowTh.name)}</h2>
    <p class="th-ideal">${icon("store", 13)} <span>${esc(nowTh.ideal)}</span></p>
    <p class="th-desc">${esc(nowTh.desc)}</p>
    ${dots(nowTh)}
    <div class="th-now-actions">
      <a class="btn btn-primary" href="/dashboard/design?reglages=1">Modifier ce thème</a>
      <a class="btn btn-ghost" href="/${esc(store.slug)}" target="_blank" rel="noopener">Voir la boutique</a>
    </div>
  </div>
</section>

<section class="th-group">
  <div class="th-group-head"><h2>Mes templates</h2>
    <p>${templates.length
      ? "Versions enregistrées depuis l'éditeur. Les appliquer ouvre un brouillon : les clients ne voient rien de nouveau avant Publier."
      : "Dans l'éditeur, « Enregistrer comme template » garde la boutique telle qu'elle est, pour la rouvrir plus tard."}</p></div>
  ${templates.length ? `<div class="tpl-list">${templates.map((t) => `<div class="tpl-row">
      <b>${esc(t.name)}</b>
      <span>${esc(String(t.created_at || "").slice(0, 16))}</span>
      <form method="post" action="/dashboard/design/template/${t.id}/apply" class="inline"><button class="btn btn-primary btn-sm">Ouvrir</button></form>
      <form method="post" action="/dashboard/design/template/${t.id}/delete" class="inline" onsubmit="return confirm('Retirer ce template ? La boutique en ligne ne change pas.')"><button class="link-danger">Retirer</button></form>
    </div>`).join("")}</div>` : ""}
</section>

${(() => {
    const SITES = require("./site-templates")
    const SEC = require("./sections")
    const live = SEC.readDesign(store).siteTemplate || ""
    const trialSite = (draft.design && draft.design.siteTemplate) || ""
    return `<section class="th-group">
      <div class="th-group-head"><h2>Templates sites complets</h2>
        <p>Des pages d'accueil entières, prêtes à l'emploi. Ton nom, tes produits, ton panier et la commande restent ceux de NovaDZ. Le choisir ouvre un brouillon : tes clients ne voient rien avant Publier.</p></div>
      <div class="th-grid">${SITES.LIST.map((t) => `<article class="th-card${t.id === live ? " is-now" : ""}${t.id === trialSite && t.id !== live ? " is-trial" : ""}">
        <div class="th-shot"><img src="/shots/${esc(t.id)}.jpg" alt="Aperçu ${esc(t.name)}" loading="lazy"></div>
        <div class="th-body">
          <div class="th-name"><b>${esc(t.name)}</b>
            ${t.id === live ? `<span class="pill livree">publié</span>` : ""}
            ${t.id === trialSite && t.id !== live ? `<span class="pill confirmee">essai</span>` : ""}
          </div>
          <p class="th-ideal">${icon("store", 13)} <span>${esc(t.niche)}</span></p>
          <p class="th-desc">${esc(t.line)}</p>
          <div class="th-actions">
            <a class="btn btn-ghost btn-sm" href="/templates/${esc(t.id)}.html" target="_blank" rel="noopener">Aperçu</a>
            <form method="post" action="/dashboard/design/site-template" class="inline">
              <input type="hidden" name="id" value="${esc(t.id)}">
              <button class="btn ${t.id === trialSite ? "btn-primary" : "btn-ghost"} btn-sm">${t.id === live ? "Déjà publié" : t.id === trialSite ? "Continuer l'essai" : "Choisir"}</button>
            </form>
          </div>
        </div>
      </article>`).join("")}</div>
      ${live || trialSite ? `<form method="post" action="/dashboard/design/site-template" class="inline" style="margin-top:14px">
        <input type="hidden" name="id" value="">
        <button class="btn btn-ghost btn-sm">Revenir à un thème classique</button>
      </form>` : ""}
    </section>`
  })()}

${(() => {
    let shared = []
    try { shared = require("./public-themes").publicList() } catch (_) { shared = [] }
    if (!shared.length) return ""
    const baseOf = (id) => THEMES.find((t) => t.id === id)
    return `<section class="th-group">
      <div class="th-group-head"><h2>Thèmes publics</h2>
        <p>Partagés par NovaDZ. Les choisir ouvre un essai avec tes produits. Tes clients ne voient rien avant Publier.</p></div>
      <div class="th-grid">${shared.map((row) => {
        const base = baseOf(row.base)
        return `<article class="th-card">
          <div class="th-shot is-mock" style="background:${esc(row.bg)}">
            <span class="theme-preview" aria-hidden="true">
              <span class="tp-head"><i></i><i></i></span>
              <span class="tp-hero" style="background:${esc(row.accent)}"></span>
              <span class="tp-grid"><i></i><i></i><i></i><i></i></span>
            </span>
          </div>
          <div class="th-body">
            <div class="th-name"><b>${esc(row.name)}</b>${row.id === Number(draft.publicThemeId) ? `<span class="pill confirmee">essai</span>` : ""}</div>
            <p class="th-ideal">${icon("store", 13)} <span>${esc(base ? base.name : "Mise en page")}</span></p>
            ${row.blurb ? `<p class="th-desc">${esc(row.blurb)}</p>` : ""}
            <div class="theme-dots"><i style="background:${esc(row.bg)}"></i><i style="background:${esc(row.accent)}"></i><i style="background:${esc(row.ink)}"></i></div>
            <div class="th-actions">
              <form method="post" action="/dashboard/design/theme/public" class="inline">
                <input type="hidden" name="id" value="${row.id}">
                <button class="btn btn-ghost btn-sm">Choisir ce thème</button>
              </form>
            </div>
          </div>
        </article>`
      }).join("")}</div>
    </section>`
  })()}

<div class="th-sec-head">
  <h2>Choisir un autre thème</h2>
  <p>Un clic sur « Choisir ce thème » l'ouvre dans l'éditeur, avec ton catalogue, ta bannière et tes textes.
     Rien ne change pour tes clients avant « Publier ».</p>
</div>

${groups}

<section class="th-help">
  <b>Tu ne sais pas lequel choisir ?</b>
  <p>Prends « Atelier » si tu vends des objets ou des vêtements (belles photos), « Électro » pour du matériel,
     « Boutique » pour du très neutre. De toute façon, tu peux changer les couleurs, la police, les arrondis
     et les sections après, sans changer de thème — tes produits et tes commandes restent en place.</p>
</section>`, "design")
}

const RIGHTS = [
  ["orders", "Commandes", "Commandes, clients, paniers, relances"],
  ["products", "Produits", "Catalogue, stock, catégories, promos"],
  ["design", "Design", "Thèmes, pages, formulaire"],
  ["shop", "Boutique", "Livraison, paiement, réseaux, marketing"],
  ["settings", "Réglages", "Réglages, domaine, e-mails"],
  ["team", "Équipe", "Inviter et retirer des personnes"],
]
const rightsBoxes = (on) => RIGHTS.map(([k, label, hint]) =>
  `<label class="check"><input type="checkbox" name="perm_${k}" value="1" ${on && on.has && on.has(k) ? "checked" : ""}><span><b>${label}</b><small>${hint}</small></span></label>`
).join("")

const waShare = (url, storeName, loginName) =>
  "https://wa.me/?text=" + encodeURIComponent(
    `Rejoins l'équipe ${storeName}. Ton identifiant : ${loginName || "celui indiqué"}. Tu choisis ton mot de passe ici : ${url}`
  )
const linkBox = (url, storeName, loginName) => `<div class="link-row">
  <input readonly value="${esc(url)}" aria-label="Lien d'invitation">
  <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(url)}">Copier</button>
  <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(waShare(url, storeName, loginName))}">WhatsApp</a>
</div>`

const dashTeam = (user, store, members, owner, saved, error, link, base, login) => dashLayout(user, store, `
<header class="dash-head"><div><h1>Équipe</h1><p class="muted">Qui peut entrer dans cette boutique, et pour faire quoi.</p></div></header>
<div class="dns-box">
  <b>Comment ça marche</b>
  <ol class="domain-steps">
    <li><b class="n">1</b><span>Tu coches les droits, tu donnes un prénom si tu veux, et tu crées un lien. Pas d'e-mail.</span></li>
    <li><b class="n">2</b><span>Tu copies le lien, ou tu l'ouvres dans WhatsApp et tu choisis la personne.</span></li>
    <li><b class="n">3</b><span>Elle ouvre le lien et choisit elle-même son identifiant, par exemple madame-sara ou sara2001, puis son mot de passe.</span></li>
    <li><b class="n">4</b><span>Tu changes ses droits plus tard, ou tu la retires. Le propriétaire garde tout.</span></li>
  </ol>
</div>
${saved ? `<div class="alert ok">Lien prêt. Copie-le ou envoie-le sur WhatsApp.</div>` : ""}
${link ? `<section class="panel">${linkBox(link, store.name, login)}</section>` : ""}
<section class="panel">
  <h3>Propriétaire</h3>
  <p><b>${esc(owner && owner.name || "")}</b> · ${esc(owner && owner.email || "")}</p>
  <p class="muted">Tous les droits. On ne peut pas le retirer.</p>
</section>
<section class="panel">
  <h3>Créer un lien</h3>
  <form method="post" action="/dashboard/equipe" class="form">
    <label>Prénom, pour t'en souvenir<input name="name" placeholder="Sara"></label>
    <p class="muted">Elle choisit son identifiant en ouvrant le lien. Toi, tu ne le tires pas au hasard.</p>
    <p class="muted">Coche seulement ce qu'elle peut faire. Rien de coché = elle voit l'accueil, sans modifier.</p>
    <div class="rights">${rightsBoxes(null)}</div>
    <div class="form-actions"><button class="btn btn-primary">Créer le lien</button></div>
  </form>
</section>
<section class="panel">
  <h3>Membres</h3>
  ${members.length ? members.map((m) => {
    let on = new Set()
    try { on = new Set(JSON.parse(m.perms || "[]")) } catch (_) {}
    const pending = m.status !== "active"
    const url = pending && m.token && base ? `${base}/rejoindre/${m.token}` : ""
    const ident = m.login_name || m.user_login || ""
    const who = ident ? `identifiant ${ident}` : (pending ? "en attente du lien" : "actif")
    return `<form class="member-row" method="post" action="/dashboard/equipe/${m.id}">
      <div class="member-who"><b>${esc(m.name || "Lien")}</b><span>${esc(who)}</span></div>
      ${url ? linkBox(url, store.name, ident) : ""}
      <div class="rights">${rightsBoxes(on)}</div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm">Enregistrer les droits</button>
        <button class="btn btn-ghost btn-sm" name="remove" value="1">Retirer</button>
      </div>
    </form>`
  }).join("") : `<p class="muted">Personne d'autre pour l'instant.</p>`}
</section>
<script>
document.querySelectorAll("[data-copy]").forEach(function (b) {
  b.addEventListener("click", function () {
    var v = b.getAttribute("data-copy") || ""
    var done = function () { b.textContent = "Copié" }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done).catch(function () {})
    else {
      var t = document.createElement("textarea")
      t.value = v
      document.body.appendChild(t)
      t.select()
      try { document.execCommand("copy"); done() } catch (e) {}
      t.remove()
    }
  })
})
</script>`, "equipe")

const dashMails = (user, store, rows, flags, saved, error) => dashLayout(user, store, `
<header class="dash-head"><div><h1>E-mails</h1><p class="muted">Prévenir la boutique et le client quand une commande arrive.</p></div></header>
${saved ? `<div class="alert ok">Enregistré.</div>` : ""}
<form class="panel form" method="post" action="/dashboard/mails">
  <h3>Quand envoyer</h3>
  <label class="check"><input type="checkbox" name="mail_merchant" value="1" ${flags.merchant ? "checked" : ""}><span>M'écrire à chaque nouvelle commande</span></label>
  <label class="check"><input type="checkbox" name="mail_customer" value="1" ${flags.customer ? "checked" : ""}><span>Écrire au client si son e-mail est dans la commande</span></label>
  <label class="check"><input type="checkbox" name="mail_status" value="1" ${flags.status ? "checked" : ""}><span>Écrire au client quand le statut change</span></label>
  <p class="muted">Le champ e-mail du formulaire est facultatif. S'il est masqué, activez-le dans Formulaire. Sans e-mail client, le téléphone et WhatsApp restent le canal.</p>
  <h3>Expéditeur</h3>
  <div class="form-row two">
    <label>Nom affiché<input name="mail_name" value="${esc(store.mail_name || store.name || "")}"></label>
    <label>Adresse d'envoi<input type="email" name="mail_from" value="${esc(store.mail_from || "")}" placeholder="commandes@boutique.dz"></label>
  </div>
  <h3>Serveur d'envoi (SMTP)</h3>
  <p class="muted">Sans ces champs, les messages sont gardés dans le journal ci-dessous, mais ils ne partent pas. Gmail : smtp.gmail.com, port 587, mot de passe d'application.</p>
  <div class="form-row two">
    <label>Serveur<input name="smtp_host" value="${esc(store.smtp_host || "")}" placeholder="smtp.gmail.com"></label>
    <label>Port<input name="smtp_port" type="number" value="${store.smtp_port || 587}"></label>
  </div>
  <div class="form-row two">
    <label>Utilisateur<input name="smtp_user" value="${esc(store.smtp_user || "")}"></label>
    <label>Mot de passe<input type="password" name="smtp_pass" placeholder="${store.smtp_pass ? "déjà enregistré" : ""}" autocomplete="new-password"></label>
  </div>
  <div class="form-actions"><button class="btn btn-primary">Enregistrer</button></div>
</form>
<form method="post" action="/dashboard/mails/test" class="form-actions">
  <button class="btn btn-ghost">Envoyer un essai</button>
</form>
<section class="panel">
  <h3>Journal</h3>
  ${rows.length ? `<table class="table"><tr><th>Quand</th><th>À</th><th>Sujet</th><th>État</th></tr>
    ${rows.map((r) => `<tr><td>${esc(r.created_at)}</td><td>${esc(r.to_email)}</td><td>${esc(r.subject)}</td><td>${esc(r.status)}${r.error ? " — " + esc(r.error) : ""}</td></tr>`).join("")}
  </table>` : `<p class="muted">Aucun e-mail pour l'instant.</p>`}
</section>`, "mails")

const joinPage = (row, error, fields = {}) => page("Rejoindre l'équipe — NovaDZ", `
<div class="auth-wrap">
  <main class="auth-main" style="margin:auto">
    <div class="auth-card">
      <h1>Rejoindre ${esc(row.store_name)}</h1>
      <p class="muted">Choisis ton identifiant et un mot de passe. Pas d'e-mail, pas de code au hasard.</p>
      ${error ? `<div class="alert">${esc(error)}</div>` : ""}
      <form method="post" action="/rejoindre/${esc(row.token)}">
        <label>Votre nom<input name="name" value="${esc(fields.name != null ? fields.name : (row.name && row.name !== "Lien" ? row.name : ""))}" required></label>
        <label>Identifiant<input name="login" required value="${esc(fields.login || "")}" placeholder="madame-sara"></label>
        <p class="muted">Par exemple madame-sara ou sara2001. Lettres, chiffres et tiret. Pas d'espace.</p>
        <label>Mot de passe<input type="password" name="password" required placeholder="6 caractères minimum"></label>
        <button class="btn btn-primary btn-block">Entrer dans l'équipe</button>
      </form>
    </div>
  </main>
</div>`)

const errorPage = (message) => page("Erreur — NovaDZ", `
<div class="auth-wrap">
  <main class="auth-main" style="margin:auto">
    <div class="auth-card">
      <h1>Ça n'a pas marché</h1>
      <div class="alert">${esc(message || "Erreur inconnue.")}</div>
      <p class="muted">Corrige ce point et réessaie. Si tu ne comprends pas, envoie cette phrase à celui qui gère le site.</p>
      <button class="btn btn-ghost btn-block" type="button" onclick="history.back()">Revenir</button>
    </div>
  </main>
</div>`)

const joinReady = (storeName, loginName) => page("Identifiant — NovaDZ", `
<div class="auth-wrap">
  <main class="auth-main" style="margin:auto">
    <div class="auth-card">
      <h1>C'est bon</h1>
      <p class="muted">Tu es dans ${esc(storeName)}. Note cet identifiant pour revenir plus tard.</p>
      <p class="ident">${esc(loginName)}</p>
      <a class="btn btn-primary btn-block" href="/dashboard">Entrer</a>
    </div>
  </main>
</div>`)

const dashHistory = (user, store, phone, h) => dashLayout(user, store, `
<header class="dash-head"><div><h1>Historique d'un numéro</h1>
  <p class="muted">Livré, annulé, retour. Toutes les boutiques. Pas le nom, pas l'adresse.</p></div></header>
<form class="ord-filter" method="get" action="/dashboard/historique">
  <label class="ord-f-q">${icon("search", 15)}
    <input type="search" name="phone" value="${esc(phone || "")}" placeholder="0555 12 34 56" aria-label="Numéro">
  </label>
  <button class="btn btn-primary">Voir</button>
</form>
${h && h.ok ? historyCard(phone) : phone ? `<p class="muted">Ce numéro n'est pas un mobile ou un fixe algérien.</p>` : `<p class="muted">Tape un numéro.</p>`}
`, "orders")

const dashAssistant = (user, store) => dashLayout(user, store, `
<header class="dash-head"><div>
  <h1>Assistant</h1>
  <p class="muted">Il répond avec ce qui est dans la boutique, et il signale dans la cloche. Pas de mail, pas de WhatsApp. Il ne parle pas au client.</p>
</div></header>
<div class="ai-app" id="aiApp">
  <div class="ai-log" id="aiLog" aria-live="polite">
    <div class="ai-msg ai-bot"><b>Assistant</b><p>Tu peux demander ce qu'il y a, le stock, les commandes, l'historique d'un numéro, ou me dire de signaler. Pour le site, le bouton IA est dans Design : il ne pose que des sections déjà là, en brouillon.</p></div>
  </div>
  <div class="ai-chips">
    <button type="button" data-ai="Ya quoi dans la boutique ?">Ya quoi</button>
    <button type="button" data-ai="Qu'est-ce qui est en rupture ?">Stock</button>
    <button type="button" data-ai="Combien de commandes en attente ?">Commandes</button>
    <button type="button" data-ai="Quels sont les produits et leurs prix ?">Produits</button>
    <button type="button" data-ai="Signale ce qui attend">Signaler</button>
  </div>
  <form class="ai-form" id="aiForm">
    <label class="sr" for="aiQ">Question</label>
    <textarea id="aiQ" name="q" rows="2" maxlength="500" placeholder="Pose une question sur la boutique" required></textarea>
    <button class="btn btn-primary" type="submit">Envoyer</button>
  </form>
</div>
<style>
.ai-app{display:flex;flex-direction:column;gap:12px;max-width:760px}
.ai-log{display:flex;flex-direction:column;gap:10px;min-height:220px}
.ai-msg{border:1px solid var(--line,#e6e1d8);border-radius:14px;padding:12px 14px;background:#fff}
.ai-msg b{display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6d675e;margin-bottom:4px}
.ai-msg p{margin:0;white-space:pre-wrap}
.ai-me{background:#111;color:#fff;border-color:#111;margin-left:48px}
.ai-me b{color:#c8c2b8}
.ai-chips{display:flex;flex-wrap:wrap;gap:6px}
.ai-chips button{border:1px solid var(--line,#ddd);background:#fff;border-radius:999px;padding:7px 10px;font:inherit;font-size:13px;cursor:pointer}
.ai-form{display:flex;gap:8px;align-items:flex-end}
.ai-form textarea{flex:1;border:1px solid var(--line,#ddd);border-radius:12px;padding:10px;font:inherit;resize:vertical}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style>
<script>
(function () {
  var log = document.getElementById("aiLog")
  var form = document.getElementById("aiForm")
  var box = document.getElementById("aiQ")
  function add(who, text, mine) {
    var d = document.createElement("div")
    d.className = "ai-msg" + (mine ? " ai-me" : " ai-bot")
    var b = document.createElement("b")
    b.textContent = who
    var p = document.createElement("p")
    p.textContent = text
    d.appendChild(b)
    d.appendChild(p)
    log.appendChild(d)
    d.scrollIntoView({ block: "nearest" })
  }
  function ask(text) {
    var q = String(text || "").trim()
    if (!q) return
    add("Toi", q, true)
    box.value = ""
    fetch("/dashboard/assistant/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ q: q })
    }).then(function (r) { return r.json() }).then(function (d) {
      add("Assistant", (d && d.answer) || "Pas de réponse.", false)
    }).catch(function () { add("Assistant", "Je n'arrive pas à répondre pour le moment.", false) })
  }
  form.addEventListener("submit", function (e) { e.preventDefault(); ask(box.value) })
  document.querySelectorAll("[data-ai]").forEach(function (b) {
    b.addEventListener("click", function () { ask(b.getAttribute("data-ai")) })
  })
})()
</script>
`, "assistant")

const noAccess = (user, store) => dashLayout(user, store, `
<header class="dash-head"><div><h1>Accès refusé</h1><p class="muted">Cette partie n'est pas dans vos droits. Demandez au propriétaire de la boutique.</p></div></header>`, "home")

const publicThemesPage = (rows, user) => {
  const cards = rows.length ? rows.map((row) => `<article class="pt-card">
    <div class="pt-swatch" style="background:${esc(row.bg)}">
      <i style="background:${esc(row.accent)}"></i>
      <i style="background:${esc(row.ink)}"></i>
    </div>
    <div>
      <b>${esc(row.name)}</b>
      ${row.blurb ? `<p>${esc(row.blurb)}</p>` : `<p>Thème partagé par NovaDZ.</p>`}
      ${user && user.role !== "admin"
        ? `<form method="post" action="/dashboard/design/theme/public"><input type="hidden" name="id" value="${row.id}"><button class="btn btn-primary" type="submit">L'ouvrir dans ma boutique</button></form>`
        : user
          ? `<a class="btn btn-ghost" href="/admin/themes/${row.id}">Voir dans l'admin</a>`
          : `<a class="btn btn-primary" href="/login">Se connecter pour l'utiliser</a>`}
    </div>
  </article>`).join("") : `<p class="pt-empty">Aucun thème public pour le moment.</p>`
  return page("Thèmes publics", `<style>
    .pt-wrap{max-width:880px;margin:0 auto;padding:32px 20px 64px}
    .pt-wrap h1{font-size:28px;margin:0 0 8px}
    .pt-swatch{height:84px;border-radius:8px;border:1px solid rgba(0,0,0,.08);display:flex;align-items:flex-end;gap:6px;padding:10px}
    .pt-swatch i{width:18px;height:18px;border-radius:50%;display:block;border:1px solid rgba(0,0,0,.12)}
    .pt-card{display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:center;border:1px solid #E4E4E7;border-radius:12px;padding:14px;background:#fff}
    .pt-card b{display:block;margin-bottom:4px}
    .pt-card p{margin:0 0 12px;color:#52525B;font-size:14px}
    .pt-list{display:grid;gap:12px}
    .pt-empty{color:#52525B}
    .pt-wrap .lead{color:#52525B;margin:0 0 28px;max-width:46ch}
    @media(max-width:640px){.pt-card{grid-template-columns:1fr}.pt-swatch{height:64px}}
  </style>
  <main class="pt-wrap">
    <h1>Thèmes publics</h1>
    <p class="lead">Partagés par NovaDZ. Un marchand les ouvre dans sa boutique, puis publie. Rien ne change chez lui avant ça.</p>
    <div class="pt-list">${cards}</div>
  </main>`, { bodyClass: "pub-themes" })
}

module.exports = {
  esc, money, dashPayments, dashSocial, dashThemes, authPage, welcomePage, logoutPage, storefront, productPage, cartPage,
  checkoutPage, orderDone, contentPage, favPage, dashHome, dashProducts, productForm, dashOrders,
  dashSettings, dashDesign, dashPages, pageForm, dashDiscounts, dashOrderDetail, adminPage,
  legalPage, customerAccount, orderTrack, invoice, dashStats, dashForm, dashCategories, dashShipping, dashReviews, dashCustomers, adminHealth, adminLogs, dashStock,
  dashLandings, landingForm, dashMarketing, dashCarrier, carrierBlock,
  dashCarts, dashRelances, dashDeliveryStats,
  dashTeam, dashMails, joinPage, joinReady, noAccess, errorPage, dashHistory, dashAssistant, dashVisits, dashLeads,
  publicThemesPage,
}
