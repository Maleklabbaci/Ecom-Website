"use strict"
/**
 * SIX THÈMES PRÊTS À L'EMPLOI — inspirés de vraies boutiques (mobilier, high-tech,
 * papeterie, audio, soin, mode).
 *
 * Ce ne sont pas des palettes : chaque thème a son en-tête, sa bande d'annonce,
 * sa façon de poser la bannière, sa fiche produit, son panier et son pied de page.
 * Le contenu vient du catalogue du marchand ; rien n'est inventé.
 *
 * Les pages produit / panier / commande / confirmation partagent une même
 * charpente (classes `tpx-*`) que chaque thème rhabille en CSS : une seule
 * implémentation à maintenir, six allures différentes.
 */
module.exports = (H) => {
  const {
    esc, money, page, PREVIEW_SCRIPT, icon, img, initial,
    readDesign, storeStyle, designClass, navLinks, socialBar, footerExtras, legalBar,
    trustInline, galleryHtml, addFormV, reviewsHtml, promoBox, discountRow,
    deliveryBlock, payBlock, CF, homeFromSections, categories, price, slug, emptyCartHref,
  } = H

  const D0 = (store) => readDesign(store)
  const logoHtml = (store, cls = "tpx-logo") => {
    const D = D0(store)
    const logoSrc = D.headStyle === "transparent" && D.logoInverse ? D.logoInverse : D.logo
    const showLogo = D.showLogo !== false && !!logoSrc
    const showName = D.showName !== false
    const img = showLogo ? `<img class="${cls}" src="${esc(logoSrc)}" alt="${esc(store.name)}">` : ""
    const name = showName ? `<span class="${cls} tpx-logo-txt brand-name">${esc(store.name)}</span>` : ""
    return img || name || `<span class="sr-only">${esc(store.name)}</span>`
  }
  const cartA = (store, n, cls = "tpx-icobtn") =>
    `<a class="${cls} tpx-cartico" href="${slug(store)}/cart" aria-label="Panier">
       ${icon("cart", 19)}${n ? `<b class="tpx-count">${n}</b>` : ""}</a>`
  const searchA = (store, cls = "tpx-icobtn") =>
    `<a class="${cls}" href="${slug(store)}?q=" aria-label="Rechercher">${icon("search", 19)}</a>`
  const userA = (store, cls = "tpx-icobtn") =>
    `<a class="${cls}" href="${slug(store)}/account" aria-label="Mon compte">${icon("user", 19)}</a>`

  /* ------------------------------------------------------------------ *
   * Charpente commune                                                    *
   * ------------------------------------------------------------------ */
  const shell = (cfg, store, content, { title, cartCount = 0, preview = false, seo = null } = {}) => {
    const D = D0(store)
    /* En-tête posé sur la photo : le bandeau d'annonce doit rester au-dessus de
       l'en-tête (comme sur les boutiques de référence), sinon il passerait sous
       la barre de navigation. */
    /* l'en-tête posé sur la photo ne concerne QUE l'accueil : sur la fiche
       produit, le panier ou la commande, il redevient une barre normale. */
    const isHome = !title
    let body = content
    /* une barre de filtres (recherche, rayon choisi) prend toute la largeur en
       haut de l'accueil : l'en-tête redevient alors une barre pleine, sinon
       les deux se chevauchent. */
    const hasFilters = /class="filters"/.test(body)
    /* l'en-tête « transparente (sur l'image) » choisie dans l'éditeur : même
       tenue que les thèmes posés sur la bannière */
    const overlayNow = cfg.overlay || (D.headStyle === "transparent" && isHome && !hasFilters)
    let leadBanner = ""
    if (overlayNow) {
      /* la bannière est le premier bloc de la page : on la sort de la liste
         (elle reste un bloc éditable) pour la poser AU-DESSUS de l'en-tête */
      const m = body.match(/\s*<div class="sec-slot"[^>]*>\s*<section class="sec sec-banner"[\s\S]*?<\/section>\s*<\/div>/)
      if (m) {
        /* on ne garde que la <section> : le conteneur « sec-slot » part avec */
        const start = m[0].indexOf("<section")
        const end = m[0].lastIndexOf("</section>") + "</section>".length
        leadBanner = m[0].slice(start, end)
        body = body.slice(0, m.index) + body.slice(m.index + m[0].length)
      }
      /* première bannière photo : on la marque pour poser le voile du haut */
      body = body.replace('class="sec sec-hero', 'class="sec sec-hero tpx-first-hero')
    }
    return page(
      title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || "Boutique en ligne"}`,
      `
<div class="theme theme-${cfg.id} tp tpx-${cfg.id}${overlayNow && isHome ? " tpx-overlaid" : ""} ${designClass(D)}">
<link rel="stylesheet" href="/theme-fonts.css">
<link rel="stylesheet" href="/themes-pro.css">
<!-- les réglages du marchand passent après le CSS du thème : ils gagnent -->
${storeStyle(D, store.theme)}
${cfg.top ? cfg.top(store) : ""}
${leadBanner}
<div class="tpx-headwrap${overlayNow && (!isHome || hasFilters) ? " tpx-head-solid" : ""}">${cfg.head(store, cartCount)}</div>
<main class="tpx-main">${body}</main>
${cfg.foot(store)}
${footerExtras(store, { ask: false, legal: false, social: false })}
</div>${preview ? PREVIEW_SCRIPT : ""}`,
      { seo }
    )
  }

  /* ---------------- en-têtes ---------------- */
  const headCentered = (store, n) => `
<header class="tpx-head tpx-head-center">
  <div class="tpx-wrap tpx-hrow">
    ${logoHtml(store)}
    <nav class="tpx-nav">${navLinks(store)}</nav>
    <div class="tpx-actions">${searchA(store)}${userA(store)}${cartA(store, n)}</div>
  </div>
</header>`

  const headDark = (store, n) => `
<header class="tpx-head tpx-head-dark">
  <div class="tpx-wrap tpx-hrow">
    ${logoHtml(store)}
    <form class="tpx-search" method="get" action="/${esc(store.slug)}" role="search">
      ${icon("search", 17)}<input name="q" placeholder="Que cherchez-vous ?" aria-label="Rechercher">
    </form>
    <div class="tpx-actions">${userA(store)}${cartA(store, n)}</div>
  </div>
  ${navLinks(store) === `<a href="/${esc(store.slug)}">Boutique</a>` ? "" : `<div class="tpx-wrap tpx-hnav"><nav class="tpx-nav">${navLinks(store)}</nav></div>`}
</header>`

  /* Boutique claire : logo, les rayons du marchand, recherche, compte, panier. */
  const headShop = (store, n) => {
    const D = D0(store)
    const homeOnly = navLinks(store) === `<a href="/${esc(store.slug)}">Boutique</a>`
    let links = homeOnly ? "" : navLinks(store)
    if (homeOnly) {
      let cats = []
      try { cats = categories(store.id) || [] } catch (_) { cats = [] }
      links = cats.slice(0, 5).map((c) => `<a href="${slug(store)}?cat=${esc(c.slug)}">${esc(c.name)}</a>`).join("")
    }
    const place = D.searchPlace || "entete"
    const search = place === "entete"
      ? `<form class="tpx-search" method="get" action="${slug(store)}" role="search">${icon("search", 16)}<input name="q" placeholder="${esc(D.searchHint || "Rechercher un produit")}" aria-label="Rechercher"></form>`
      : ""
    const hasLogo = D.showLogo !== false && !!D.logo
    const letter = esc(String(store.name || "B").trim().charAt(0).toUpperCase() || "B")
    const mark = hasLogo ? "" : `<span class="tpx-mark" aria-hidden="true">${letter}</span>`
    return `
<header class="tpx-head tpx-head-shop">
  <div class="tpx-wrap tpx-hrow">
    <a class="tpx-brand" href="${slug(store)}">${mark}${logoHtml(store)}</a>
    ${links ? `<nav class="tpx-nav">${links}</nav>` : ""}
    ${search}
    <div class="tpx-actions">
      <a class="tpx-textbtn" href="${slug(store)}/account">${icon("user", 18)}<span>Compte</span></a>
      <a class="tpx-textbtn tpx-cartico" href="${slug(store)}/cart" aria-label="Panier">${icon("cart", 18)}<span>Panier</span>${n ? `<b class="tpx-count">${n}</b>` : ""}</a>
    </div>
  </div>
</header>`
  }

  const headOverlay = (store, n) => `
<header class="tpx-head tpx-head-overlay">
  <div class="tpx-wrap tpx-hrow">
    <nav class="tpx-nav">${navLinks(store)}</nav>
    ${logoHtml(store, "tpx-logo tpx-logo-mid")}
    <div class="tpx-actions">${searchA(store)}${userA(store)}${cartA(store, n)}</div>
  </div>
</header>`

  /* Bureau : le nom est au milieu de la page, pas entre deux blocs inégaux. */
  const headBureau = (store, n) => `
<header class="tpx-head tpx-head-bureau">
  <div class="tpx-wrap tpx-hrow">
    <div class="tpx-side tpx-side-l">${searchA(store)}</div>
    ${logoHtml(store, "tpx-logo tpx-logo-mid")}
    <div class="tpx-actions">${userA(store)}${cartA(store, n)}</div>
  </div>
</header>`

  const headLeft = (store, n) => `
<header class="tpx-head tpx-head-left">
  <div class="tpx-wrap tpx-hrow">
    ${logoHtml(store)}
    <nav class="tpx-nav">${navLinks(store)}</nav>
    <div class="tpx-actions">${searchA(store)}${userA(store)}${cartA(store, n)}</div>
  </div>
</header>`

  /* Atelier : logo au centre. Rien d'autre que la recherche et la langue. */
  const headAtelier = (store) => `
<header class="tpx-head tpx-head-atelier">
  <div class="tpx-wrap tpx-hrow">
    <div class="tpx-side tpx-side-l">${searchA(store)}</div>
    ${logoHtml(store, "tpx-logo tpx-logo-mid")}
    <div class="tpx-actions"></div>
  </div>
</header>`

  /* ---------------- bandeaux du haut ---------------- */
  const topLine = (left, mid, right) => `
<div class="tpx-top">
  <div class="tpx-wrap tpx-toprow">
    <span class="tpx-top-l">${left}</span>
    <span class="tpx-top-m">${mid}</span>
    <span class="tpx-top-r">${right}</span>
  </div>
</div>`

  /* ---------------- pied de page ---------------- */
  const footRich = (store) => {
    const D = D0(store)
    return `
<footer class="tpx-foot">
  <div class="tpx-wrap tpx-fgrid">
    <div class="tpx-fbrand">
      ${logoHtml(store, "tpx-logo tpx-logo-foot")}
      <p>${esc(store.tagline || store.about || "")}</p>
      <span class="tpx-fcontact">${esc(store.phone || "")}${store.wilaya ? ` · ${esc(store.wilaya)}` : ""}</span>
    </div>
    <div class="tpx-fcol">
      <b>Boutique</b>
      ${navLinks(store)}
    </div>
    <div class="tpx-fcol">
      <b>Aide</b>
      <a href="/${esc(store.slug)}/legal#livraison">Livraison</a>
      <a href="/${esc(store.slug)}/legal#retours">Retours</a>
      <a href="/${esc(store.slug)}/legal#cgv">CGV</a>
      <a href="/${esc(store.slug)}/account">Mon compte</a>
    </div>
    <div class="tpx-fcol tpx-fcol-social">
      <b>Suivez-nous</b>
      ${socialBar(store, "pied")}
    </div>
  </div>
  <div class="tpx-wrap tpx-fbottom">
    <span>© ${new Date().getFullYear()} ${esc(store.name)}</span>
    <span>${D.footerNote ? esc(D.footerNote) : ""}${D.showNovadz ? ` Propulsé par <a href="/">NovaDZ</a>` : ""}</span>
  </div>
  ${legalBar(store)}
</footer>`
  }

  const footSimple = (store) => {
    const D = D0(store)
    return `
<footer class="tpx-foot tpx-foot-simple">
  <div class="tpx-wrap tpx-fgrid">
    <div class="tpx-fbrand">${logoHtml(store, "tpx-logo tpx-logo-foot")}<span class="tpx-fcontact">${esc(store.phone || "")}</span></div>
    <div class="tpx-fcol">${navLinks(store)}</div>
    <div class="tpx-fcol"><a href="/${esc(store.slug)}/legal#cgv">CGV</a><a href="/${esc(store.slug)}/legal#retours">Retours</a></div>
  </div>
  <div class="tpx-wrap tpx-fbottom">
    <span>© ${new Date().getFullYear()} ${esc(store.name)}</span>
    <span>${D.footerNote ? esc(D.footerNote) : ""}${D.showNovadz ? ` Propulsé par <a href="/">NovaDZ</a>` : ""}</span>
  </div>
  ${socialBar(store, "pied")}
  ${legalBar(store)}
</footer>`
  }

  /* ---------------- fiche produit (commune) ---------------- */
  const T = (store, txt) => String(txt || "")
  const productPage = (store, p, related = [], extra = {}) => `
<div class="tpx-wrap tpx-pwrap">
  <a class="tpx-back" href="${slug(store)}">${icon("arrowLeft", 14)} Retour</a>
  <div class="tpx-pgrid">
    <div class="tpx-pmedia">${galleryHtml(store, p, extra)}</div>
    <div class="tpx-pinfo">
      <h1>${esc(p.title)}</h1>
      <div class="tpx-pprice">${price(store, p.price_cents)}${p.compare_cents ? `<s>${price(store, p.compare_cents)}</s>` : ""}</div>
      <p class="tpx-pdesc">${esc(p.description || "")}</p>
      <p class="tpx-pstock">${p.stock > 0 ? `En stock · ${p.stock} disponible${p.stock > 1 ? "s" : ""}` : "Rupture de stock"}</p>
      ${addFormV(store, p, "btn tpx-buy", "Ajouter au panier", extra.variants)}
      <ul class="tpx-trust">${trustInline()}</ul>
    </div>
  </div>
  ${reviewsHtml(store, p, extra)}
</div>

${related && related.length ? `
<section class="tpx-wrap tpx-related">
  <h2>Vous aimerez aussi</h2>
  <div class="tpx-rgrid">${related.slice(0, 4).map((r) => `
    <a class="tpx-rcard" href="/${esc(store.slug)}/p/${r.id}">
      <span class="tpx-rthumb">${img(r.image, "p-img", r.title)}</span>
      <b>${esc(r.title)}</b><span>${price(store, r.price_cents)}</span>
    </a>`).join("")}</div>
</section>` : ""}`

  /* ---------------- panier (commun) ---------------- */
  const cartPage = (store, items, totals, promoMsg) => `
<div class="tpx-wrap tpx-cartwrap">
  <h1 class="tpx-title">Votre panier</h1>
  ${promoBox(store, totals, promoMsg)}
  ${!items.length
      ? `<div class="tpx-empty"><h3>Votre panier est vide</h3><p>Ajoutez des articles depuis la boutique.</p>
         <a class="btn tpx-buy ndz-empty-link" href="${emptyCartHref(store)}">Voir les produits</a></div>`
      : `<div class="tpx-cartgrid">
      <div class="tpx-citems">
        ${items.map((it) => `
        <div class="tpx-crow">
          <div class="tpx-cthumb">${img(it.image, "cart-img", it.title)}</div>
          <div class="tpx-cinfo">
            <b>${esc(it.title)}</b>
            <span class="tpx-cunit">${price(store, it.price_cents)}</span>
            <form method="post" action="${slug(store)}/cart/${encodeURIComponent(it.key)}" class="tpx-qty">
              <button name="delta" value="-1" aria-label="Moins">−</button><span>${it.qty}</span>
              <button name="delta" value="1" aria-label="Plus">+</button>
            </form>
          </div>
          <div class="tpx-cline">${price(store, it.price_cents * it.qty)}</div>
        </div>`).join("")}
      </div>
      <aside class="tpx-summary">
        <h3>Récapitulatif</h3>
        <div class="tpx-srow"><span>Sous-total</span><span>${price(store, totals.subtotal)}</span></div>
        <div class="tpx-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
        ${discountRow("tpx-srow", store, totals)}
        <div class="tpx-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
        <div class="tpx-srow tpx-total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
        <a class="btn tpx-buy tpx-block" href="${slug(store)}/checkout">Commander</a>
        <a class="tpx-continue" href="${slug(store)}">Continuer mes achats</a>
      </aside>
    </div>`}
</div>`

  /* ---------------- commande (commune) ---------------- */
  const checkoutPage = (store, items, totals, error, extra = {}) => `
<div class="tpx-wrap tpx-cartwrap">
  <h1 class="tpx-title">Finaliser la commande</h1>
  ${error ? `<div class="tpx-alert">${esc(error)}</div>` : ""}
  <div class="tpx-cartgrid">
    <form class="tpx-form" method="post" action="${slug(store)}/checkout">
      <h3>Vos informations</h3>
      ${CF.fields(store, extra)}
      ${deliveryBlock(store, extra)}
      ${payBlock(store, extra)}
      <button class="btn tpx-buy tpx-block">Confirmer · ${price(store, totals.total)}</button>
    </form>
    <aside class="tpx-summary">
      <h3>Votre commande</h3>
      ${items.map((it) => `<div class="tpx-srow"><span>${esc(it.title)} × ${it.qty}</span><span>${price(store, it.price_cents * it.qty)}</span></div>`).join("")}
      <div class="tpx-srow"><span>Livraison</span><span data-ship>${price(store, totals.shipping)}</span></div>
      ${discountRow("tpx-srow", store, totals)}
      <div class="tpx-srow" data-payrow style="display:none"><span>Frais de paiement</span><span data-payfee></span></div>
      <div class="tpx-srow tpx-total"><span>Total</span><span data-total data-base="${totals.total}">${price(store, totals.total)}</span></div>
    </aside>
  </div>
</div>`

  const donePage = (store, order) => `
<div class="tpx-wrap tpx-cartwrap">
  <div class="tpx-done">
    <div class="tpx-done-ico">${icon("check", 26)}</div>
    <h1>Commande confirmée</h1>
    <p>Merci ${esc(order.customer_name)}. Votre commande <b>#${esc(order.ref)}</b> est enregistrée.</p>
    <div class="tpx-summary tpx-donebox">
      <div class="tpx-srow"><span>Total à payer</span><span><b>${price(store, order.total_cents)}</b></span></div>
      <div class="tpx-srow"><span>Livraison</span><span>${esc(order.wilaya)} — ${esc(order.address)}</span></div>
      <div class="tpx-srow"><span>Contact</span><span>${esc(order.phone)}</span></div>
    </div>
    <a class="btn tpx-buy" href="${slug(store)}">Retour à la boutique</a>
  </div>
</div>`

  /** Fabrique un thème complet à partir de son en-tête et de ses bandeaux. */
  const make = (cfg) => ({
    shell: (store, content, opts) => shell(cfg, store, content, opts),
    home: (store, products, meta) => cfg.pre(store, products) + homeFromSections(store, products, meta) + cfg.post(store, products),
    product: (store, p, related, extra) => productPage(store, p, related, extra),
    cart: (store, items, totals, promoMsg) => cartPage(store, items, totals, promoMsg),
    checkout: (store, items, totals, error, extra) => checkoutPage(store, items, totals, error, extra),
    done: (store, order) => donePage(store, order),
  })

  const none = () => ""

  /* ================================================================== *
   * 1. ATELIER — maison / mobilier, grand visuel, tuiles de matières    *
   * ================================================================== */
  const atelier = make({
    id: "atelier",
    /* une seule annonce : le bandeau de section. Pas une deuxième barre noire. */
    top: () => "",
    head: headAtelier,
    foot: footRich,
    pre: none,
    post: none,
  })

  /* ================================================================== *
   * 2. ELECTRO — high-tech, en-tête sombre, recherche centrale          *
   * ================================================================== */
  const electro = make({
    id: "electro",
    top: (store) => topLine(
      store.phone ? `<a href="tel:${esc(String(store.phone).replace(/\s/g, ""))}">${icon("phone", 14)}<span>${esc(store.phone)}</span></a>` : `<a href="/${esc(store.slug)}/legal#livraison">Livraison</a>`,
      `<span>Livraison offerte dès 10 000 DZD · garantie 6 mois.</span>`,
      store.wilaya ? `<span>${esc(store.wilaya)}</span>` : `<a href="/${esc(store.slug)}/account">Mon compte</a>`
    ),
    head: headShop,
    foot: footRich,
    pre: none,
    post: none,
  })

  /* ================================================================== *
   * 3. BUREAU — papeterie / objets, bandeau jaune, en-tête transparent  *
   * ================================================================== */
  const bureau = make({
    id: "bureau",
    overlay: false,
    top: () => `<div class="tpx-top"><div class="tpx-wrap tpx-toprow tpx-toprow-center"><span>Nouveautés en ligne · réassort chaque semaine.</span></div></div>`,
    head: headBureau,
    foot: footSimple,
    pre: none,
    post: none,
  })

  /* ================================================================== *
   * 4. AUDIO — son / image, hero arrondi, cartes de familles            *
   * ================================================================== */
  const audio = make({
    id: "audio",
    top: (store) => topLine(
      socialBar(store, "entete") || `<a href="/${esc(store.slug)}/legal#retours">Retours sous 7 jours</a>`,
      `<span>Paiement à la livraison</span>`,
      `<a href="/${esc(store.slug)}/cart">Panier</a>`
    ),
    head: headCentered,
    foot: footRich,
    pre: none,
    post: none,
  })

  /* ================================================================== *
   * 5. SOIN — cosmétique, bannière coupée, galerie ronde                 *
   * ================================================================== */
  const soin = make({
    id: "soin",
    top: (store) => topLine("", `<span>Livraison offerte dès 8 000 DZD</span>`, `<a href="/${esc(store.slug)}/account">Mon compte</a>`),
    head: headLeft,
    foot: footSimple,
    pre: none,
    post: none,
  })

  /* ================================================================== *
   * 6. MODE — prêt-à-porter, bannière pleine largeur, en-tête transparent
   * ================================================================== */
  const mode = make({
    id: "mode",
    overlay: true,
    top: (store) => topLine(
      `<a href="/${esc(store.slug)}/legal#retours">Retours sous 7 jours</a>`,
      `<a href="/${esc(store.slug)}/legal#livraison">Livraison 58 wilayas</a>`,
      `<a href="/${esc(store.slug)}/account">Mon compte</a>`
    ),
    head: headOverlay,
    foot: footRich,
    pre: none,
    post: none,
  })

  return { atelier, electro, bureau, audio, soin, mode }
}
