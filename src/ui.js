"use strict"
/** Helpers partagés : échappement, monnaie, coquille HTML. */

const { mark } = require("./icons")

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

const money = (cents, currency = "DZD") =>
  (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency

/** Prix affiché : le code devise est un span, pour pouvoir le masquer sans toucher au montant. */
const moneyHtml = (cents, currency = "DZD") => {
  const full = money(cents, currency)
  const cur = String(currency || "DZD")
  const amt = full.endsWith(" " + cur) ? full.slice(0, -(cur.length + 1)) : full
  return `<span class="ndz-money" data-cents="${Number(cents) || 0}"><span class="ndz-amt">${esc(amt)}</span> <span class="ndz-cur">${esc(cur)}</span></span>`
}

const WILAYAS = [
  "Alger", "Oran", "Constantine", "Blida", "Annaba", "Batna", "Sétif", "Tizi Ouzou",
  "Béjaïa", "Tlemcen", "Djelfa", "Biskra", "Tiaret", "Béchar", "Ghardaïa", "Ouargla",
]

const LOGO = mark(24)

/** Balises SEO / Open Graph / données structurées. */
const seoMeta = (o = {}) => {
  const desc = String(o.description || "").replace(/\s+/g, " ").slice(0, 300)
  const out = []
  if (desc) out.push(`<meta name="description" content="${esc(desc)}">`)
  if (o.url) out.push(`<link rel="canonical" href="${esc(o.url)}">`)
  out.push(`<meta property="og:type" content="${esc(o.type || "website")}">`)
  out.push(`<meta property="og:title" content="${esc(o.title || "")}">`)
  if (desc) out.push(`<meta property="og:description" content="${esc(desc)}">`)
  if (o.url) out.push(`<meta property="og:url" content="${esc(o.url)}">`)
  if (o.image) out.push(`<meta property="og:image" content="${esc(o.image)}">`)
  out.push(`<meta name="twitter:card" content="${o.image ? "summary_large_image" : "summary"}">`)
  if (o.jsonld) out.push(`<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, "\\u003c")}</script>`)
  return out.join("\n")
}

const page = (title, body, { bodyClass = "", seo = null } = {}) => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${seo ? seoMeta({ title, ...seo }) : ""}
<link rel="stylesheet" href="/inter-font.css">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/ndz-merchant.css">
<link rel="stylesheet" href="/horizon-panel.css">
<script src="/horizon-panel.js"></script>
<script src="/upimg.js" defer></script>
</head>
<body class="${bodyClass}">${body}
<script>(function(){if(document.querySelector(".ndz-mnav"))return;var nav=document.querySelector("header nav,.tpx-nav,.mn-nav");var head=document.querySelector("header,.tpx-head,.tpx-hrow");if(!nav||!head)return;var d=document.createElement("details");d.className="ndz-mnav";d.innerHTML='<summary aria-label="Menu"><span></span><span></span><span></span></summary>';var box=document.createElement("div");box.className="ndz-mnav-box";box.appendChild(nav.cloneNode(true));d.appendChild(box);head.appendChild(d);})();</script>
</body>
</html>`

/* Script injecté en aperçu (?preview=1) : contour des sections + sélection au clic. */
const PREVIEW_SCRIPT = `<script>
(function(){
  var STACKS = {
    inter: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'SF Mono', 'Cascadia Mono', Consolas, monospace"
  };
  document.documentElement.classList.add('sh-preview');
  function live(d){
    var r = document.documentElement;
    var stack = d.fontStack || STACKS[d.font] || STACKS.inter;
    var gf = document.getElementById('ndzGf');
    if (d.fontHref) {
      if (!gf) {
        var pre = document.createElement('link');
        pre.rel = 'preconnect';
        pre.href = 'https://fonts.googleapis.com';
        document.head.appendChild(pre);
        gf = document.createElement('link');
        gf.id = 'ndzGf';
        gf.rel = 'stylesheet';
        document.head.appendChild(gf);
      }
      if (gf.getAttribute('href') !== d.fontHref) gf.setAttribute('href', d.fontHref);
    } else if (gf) gf.remove();
    var bg = d.bg || '#FFFFFF', ink = d.ink || '#111111';
    var headBg = d.headBg || ((d.headStyle === 'transparent' || d.headStyle === 'ligne') ? 'transparent' : bg);
    var accent = d.accent || '#111111';
    var lum = function (hex) {
      var v = [1, 3, 5].map(function (i) { return parseInt(String(hex).slice(i, i + 2), 16) / 255 })
        .map(function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    var vars = {
      '--s-font': stack,
      '--s-accent': accent,
      '--s-accent-ink': lum(accent) > 0.6 ? '#111111' : '#FFFFFF',
      '--s-bg': bg,
      '--s-ink': ink,
      '--s-head-bg': headBg,
      '--s-head-ink': d.headInk || ink,
      '--s-logo': (Number(d.logoSize) || 28) + 'px',
      '--s-text': d.textScale || 1,
      '--s-radius': (d.radiusPx != null ? d.radiusPx : 12) + 'px',
      '--s-container': (d.containerWidth || 1240) + 'px',
      '--tpx-max': (d.containerWidth || 1240) + 'px',
      '--ndz-title': d.scale || 1,
      '--s-zoom': d.scale || 1,
    };
    Object.keys(vars).forEach(function (k) { r.style.setProperty(k, vars[k]) });
    document.body.style.fontFamily = stack;
    document.body.style.zoom = "";
    Array.prototype.forEach.call(document.querySelectorAll('input[type="search"], .ndz-search input, .ndz-searchbar input'), function (n) {
      if (d.searchHint != null) n.setAttribute('placeholder', d.searchHint);
    });
    r.setAttribute('data-cart', d.cartMode || 'deux');
    r.setAttribute('data-cartlink', d.showCartLink === false ? 'off' : 'on');
    var themeEl = document.querySelector('.theme');
    if (themeEl) {
      ['plein', 'ligne', 'transparent', 'flottant'].forEach(function (k) {
        themeEl.classList.toggle('d-head-' + k, (d.headStyle || 'plein') === k)
      })
      ;['noir', 'gris', 'contour'].forEach(function (k) {
        themeEl.classList.toggle('d-btn-' + k, (d.button || 'noir') === k)
      })
    }
    r.setAttribute('data-brandname', d.showName === false ? 'off' : 'on')
    r.setAttribute('data-brandlogo', d.showLogo === false ? 'off' : 'on')
    r.setAttribute('data-logoplace', d.logoPlace || 'gauche')
    if (d.exampleImage) r.setAttribute('data-exemple', d.exampleImage)
    r.setAttribute('data-heroalign', d.heroAlign || 'def')
    r.setAttribute('data-align', d.textAlign || 'def')
    r.setAttribute('data-title', String(d.scale || 1) !== '1' ? 'on' : 'off')
    r.setAttribute('data-mtext', d.mobileText || 'normal')
    r.setAttribute('data-mtitle', d.mobileTitle || 'normal')
    r.setAttribute('data-mpad', d.mobilePad || 'normal')
    r.setAttribute('data-mcols', String(d.mobileCols || 2))
    r.setAttribute('data-cards', d.cardStyle || 'classique')
    r.setAttribute('data-search', d.searchPlace || 'entete')
    r.setAttribute('data-variant', d.variantStyle || 'boutons')
    r.setAttribute('data-swatch', d.swatchImg ? '1' : '0')
    if (Array.isArray(d.mobileOrder)) {
      d.mobileOrder.forEach(function (id, i) {
        var slot = document.querySelector('[data-slot="' + id + '"]')
        if (slot) slot.style.setProperty('--m-order', String(i))
      })
    }
    r.setAttribute('data-searchalign', d.searchAlign || 'droite')
    r.setAttribute('data-headh', d.headHeight || 'normale')
    r.setAttribute('data-headalign', d.headAlign || 'gauche')
    r.setAttribute('data-wide', String(d.containerWidth || 1240) !== '1240' ? 'on' : 'off')
    r.style.setProperty('--ndz-title', d.scale || 1)
    r.style.setProperty('--tpx-max', (d.containerWidth || 1240) + 'px')
    var wideOn = String(d.containerWidth || 1240) !== '1240'
    Array.prototype.forEach.call(document.querySelectorAll('.zn-wrap, .wrap, .tpx-wrap, .mn-wrap, .fav-wrap'), function (n) {
      if (wideOn) {
        n.style.setProperty('max-width', 'min(' + d.containerWidth + 'px, 100%)', 'important')
        n.style.setProperty('width', 'min(' + d.containerWidth + 'px, 100%)', 'important')
        n.style.setProperty('margin-left', 'auto', 'important')
        n.style.setProperty('margin-right', 'auto', 'important')
      } else {
        n.style.removeProperty('max-width')
        n.style.removeProperty('width')
      }
    })
    r.setAttribute('data-radius', String(d.radiusPx != null ? d.radiusPx : 12) !== '12' ? 'on' : 'off')
    r.setAttribute('data-weight', String(d.weight || '600') !== '600' ? 'on' : 'off')
    r.setAttribute('data-track', (d.tracking || 'normal') !== 'normal' ? 'on' : 'off')
    r.setAttribute('data-foot', (d.footBg || d.footInk) ? 'on' : 'off')
    r.setAttribute('data-accent', String(d.accent || '#111111').toLowerCase() !== '#111111' ? 'on' : 'off')
    r.setAttribute('data-headbg', d.headBg ? 'on' : 'off')
    var track = d.tracking === 'serre' ? '-0.045em' : d.tracking === 'aere' ? '0.025em' : '-0.022em';
    r.style.setProperty('--s-weight', d.weight || '600')
    r.style.setProperty('--s-track', track)
    r.style.setProperty('--s-foot-bg', d.footBg || 'transparent')
    r.style.setProperty('--s-foot-ink', d.footInk || 'inherit')
    var st = document.getElementById('ndzLiveStyle');
    if (!st) { st = document.createElement('style'); st.id = 'ndzLiveStyle' }
    document.body.appendChild(st)
    st.textContent =
      '.theme h1,.theme h2,.theme h3,.theme .sec-hero h1,.theme .p-name,.theme .sec-head h2,.theme .sec-btitle{' +
      'font-weight:' + (d.weight || '600') + ';letter-spacing:' + track + '}' +
      '.theme .btn-primary,.theme .sec-cta:not(.ghost),.theme .p-add,.theme .promo-btn,.theme .ct-btn.big{' +
      'background:' + accent + ';border-color:' + accent + '}' +
      '.theme{background:' + bg + ';color:' + ink + '}' +
      '.theme p,.theme li,.theme .p-desc,.theme .sec p{font-size:calc(' + (d.textScale || 1) + ' * 15px)}';
    if (window.ndzHorizonCss) {
      var hz = document.getElementById('ndzHorizonCss');
      if (!hz) { hz = document.createElement('style'); hz.id = 'ndzHorizonCss'; document.head.appendChild(hz); }
      hz.textContent = window.ndzHorizonCss(d);
    }
    var custom = document.getElementById('ndzCustomCss');
    if (d.customCss) {
      if (!custom) { custom = document.createElement('style'); custom.id = 'ndzCustomCss'; document.head.appendChild(custom); }
      custom.textContent = String(d.customCss);
    } else if (custom) custom.textContent = '';
    var logoSrc = (d.headStyle === 'transparent' && d.logoInverse) ? d.logoInverse : d.logo;
    if (logoSrc) {
      Array.prototype.forEach.call(document.querySelectorAll('img.mn-logo, img.ed-logo, img.ct-logo, img.ca-logo, img.mo-logo, img.ga-logo, img.bt-logo, img.zn-logo, img.cd-logo, img.th-logo, img.mr-logo, img.mq-logo, img.nr-logo, img.tpx-logo'), function (img) {
        img.src = logoSrc;
      });
    }
    if (d.cartEmptyUrl) {
      var href = String(d.cartEmptyUrl);
      var head = href.slice(0, 8).toLowerCase();
      var abs = head.indexOf('http://') === 0 || head.indexOf('https://') === 0 || href.charAt(0) === '/';
      if (!abs) {
        var slug = (location.pathname.split('/')[1] || '');
        while (href.charAt(0) === '/') href = href.slice(1);
        href = '/' + slug + '/' + href;
      }
      Array.prototype.forEach.call(document.querySelectorAll('a.ndz-empty-link'), function (a) { a.setAttribute('href', href); });
    }
    r.setAttribute('data-drawer', d.cartType || 'page');
    r.setAttribute('data-drawer-open', d.cartOpenDrawer ? '1' : '0');
    r.setAttribute('data-parts', d.installOn ? String(d.installN || 3) : '0');
    r.setAttribute('data-accel', d.payDirect ? '1' : '0');
    if (!document.querySelector('script[src="/ndz-store.js"]')) {
      var sc = document.createElement('script');
      sc.src = '/ndz-store.js';
      sc.onload = function () { document.dispatchEvent(new Event('ndz-design')); };
      document.body.appendChild(sc);
    }
    document.dispatchEvent(new Event('ndz-design'));
  }
  var TEXTMODE = false;
  function textEl(node) {
    var el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    if (!el || !el.closest) return null;
    if (el.closest('img, svg, video, input, textarea, select, script, style')) return null;
    var tags = { H1:1, H2:1, H3:1, H4:1, P:1, A:1, BUTTON:1, SPAN:1, B:1, STRONG:1, EM:1, LI:1, LABEL:1, SMALL:1, FIGCAPTION:1, BLOCKQUOTE:1, TD:1, TH:1, DT:1, DD:1 };
    var cur = el;
    while (cur && cur !== document.body) {
      if (tags[cur.tagName] && String(cur.innerText || '').trim()) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function selectorOf(el) {
    if (!el || el === document.body) return '';
    if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id)) return '#' + el.id;
    var parts = [];
    var node = el;
    var guard = 0;
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement && guard < 7) {
      guard++;
      var sec = node.getAttribute && node.getAttribute('data-section');
      if (sec && /^[A-Za-z0-9_-]{1,20}$/.test(sec)) {
        parts.unshift('[data-section=\"' + sec + '\"]');
        break;
      }
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) break;
      var same = [];
      for (var i = 0; i < parent.children.length; i++) {
        if (parent.children[i].tagName === node.tagName) same.push(parent.children[i]);
      }
      parts.unshift(tag + ':nth-of-type(' + (same.indexOf(node) + 1) + ')');
      node = parent;
      if (node && node.classList && node.classList.contains('theme')) {
        parts.unshift('.theme');
        break;
      }
    }
    return parts.join(' > ');
  }
  function applySizes(list) {
    var page = document.documentElement.getAttribute('data-page') || 'home';
    var st = document.getElementById('ndzTextSizes');
    if (!st) { st = document.createElement('style'); st.id = 'ndzTextSizes'; document.head.appendChild(st); }
    var css = [];
    var zeros = [];
    (list || []).forEach(function (r) {
      if (!r || !r.sel) return;
      if (r.page && r.page !== page && r.page !== '*') return;
      var n = Math.round(Number(r.size));
      if (!isFinite(n)) return;
      n = Math.max(0, Math.min(100, n));
      css.push(r.sel + '{font-size:' + n + 'px!important;line-height:' + (n === 0 ? '0' : '1.2') + '!important' + (n === 0 ? ';color:transparent!important' : '') + '}');
      if (n === 0) zeros.push(r.sel);
    });
    st.textContent = css.join('\\n');
    Array.prototype.forEach.call(document.querySelectorAll('[data-ndz-zero]'), function (n) { n.removeAttribute('data-ndz-zero'); });
    zeros.forEach(function (sel) {
      try {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function (n) { n.setAttribute('data-ndz-zero', '1'); });
      } catch (err) {}
    });
  }
  function buildMenu(){
    if (document.querySelector('.ndz-mnav')) return;
    var nav = document.querySelector('header nav, .tpx-nav, .mn-nav');
    var head = document.querySelector('header, .tpx-head, .tpx-hrow');
    if (!nav || !head) return;
    var d = document.createElement('details');
    d.className = 'ndz-mnav';
    d.innerHTML = '<summary aria-label="Menu"><span></span><span></span><span></span></summary>';
    var box = document.createElement('div');
    box.className = 'ndz-mnav-box';
    box.appendChild(nav.cloneNode(true));
    d.appendChild(box);
    head.appendChild(d);
  }
  buildMenu();
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if (d.t === 'outline') document.documentElement.classList.toggle('sh-preview', !!d.on);
    if (d.t === 'style' && d.design) { live(d.design); if (d.design.textSizes) applySizes(d.design.textSizes); }
    if (d.t === 'phone') document.documentElement.classList.toggle('ndz-phone', !!d.on);
    if (d.t === 'menu' || d.t === 'phone') buildMenu();
    if (d.t === 'field') {
      var sec = document.querySelector('[data-section="' + d.id + '"]');
      if (sec) Array.prototype.forEach.call(sec.querySelectorAll('[data-field="' + d.key + '"]'), function (n) { n.textContent = d.value || ''; });
    }
    if (d.t === 'foot') {
      var col = document.querySelector('.ndz-fcol[data-footcol="' + d.col + '"]');
      if (col && d.part === 'title') { var b = col.querySelector('[data-foot="title"]'); if (b) b.textContent = d.value || ''; }
      if (col && d.part === 'label') { var a = col.querySelector('[data-i="' + d.i + '"]'); if (a) a.textContent = d.value || ''; }
      if (d.part === 'brand') { var p = document.querySelector('[data-footbrand]'); if (p) p.textContent = d.value || ''; }
      if (d.part === 'note') { var s = document.querySelector('[data-footnote]'); if (s) s.textContent = d.value || ''; }
    }
    if (d.t === 'secstyle') {
      var box = document.querySelector('[data-section="' + d.id + '"]');
      if (box) {
        ['gauche','centre','droite'].forEach(function (a) { box.classList.remove('ndz-al-' + a); });
        if (d.align) box.classList.add('ndz-al-' + d.align);
        ['etroite','large','pleine'].forEach(function (w) { box.classList.remove('ndz-wide-' + w); });
        if (d.wide) box.classList.add('ndz-wide-' + d.wide);
        if (d.tsize) box.style.setProperty('--sec-title', d.tsize); else box.style.removeProperty('--sec-title');
        if (d.pad != null && d.pad !== '') box.style.setProperty('--sec-pad', d.pad + 'px'); else box.style.removeProperty('--sec-pad');
      }
    }
    if (d.t === 'textmode') TEXTMODE = !!d.on;
    if (d.t === 'sizes') applySizes(d.list || []);
    if (d.t === 'select') {
      Array.prototype.forEach.call(document.querySelectorAll('.sh-sel'), function(n){ n.classList.remove('sh-sel') });
      var el = document.querySelector('[data-section="' + d.id + '"]');
      if (el) el.classList.add('sh-sel')
    }
  });
  /* ------------------------------------------------------------------
     « Où je clique, c'est ça que je modifie ».
     Chaque règle associe un morceau de la page à un réglage précis.
     ------------------------------------------------------------------ */
  var LABELS = {
    brand: 'Logo et nom', search: 'Recherche', nav: 'Barre de navigation',
    cartlink: 'Panier', social: 'Réseaux sociaux', footer: 'Pied de page', header: 'En-tête',
    productPhotos: 'Photos du produit', productTitle: 'Titre du produit',
    productPrice: 'Prix du produit', productDesc: 'Description du produit',
    variants: 'Choix des variantes', buy: 'Boutons d’achat', reviews: 'Avis clients',
    form: 'Champs du formulaire', cart: 'Panier'
  };
  var PAGE = document.documentElement.getAttribute('data-page') || 'home';
  var COMMON = [
    ['.ndz-search-btn, .ndz-search, .ndz-searchbar, .ndz-searchlay, [data-searchopen]', { area: 'search' }],
    ['.brand-name, [class$="-brand"], [class$="-logo"], [class$="-tile"], [class$="-mark"]', { area: 'brand' }],
    ['header nav, header [class$="-nav"], header [class$="-links"], header [class$="-menu"]', { area: 'nav' }],
    ['header [class$="-cartlink"], header a[href$="/cart"], header a[href$="/checkout"]', { area: 'cartlink' }],
    ['.ndz-social, [class$="-social"], [class^="ndz-social"]', { area: 'social' }],
    ['footer', { area: 'footer' }],
    ['header', { area: 'header' }]
  ];
  var RULES = COMMON;
  if (PAGE === 'product') {
    RULES = [
      ['.varpick, .varselect, select[name="variant_id"]', { area: 'variants' }],
      ['.p-reviews, [class^="review"], [class*=" review"], [class*="reviews"], [id*="review"]', { area: 'reviews' }],
      ['[class*="gallery"] img, .p-img, [class$="-thumb"] img', { area: 'productPhotos' }],
      ['h1', { area: 'productTitle' }],
      ['[class$="-price"], .p-price', { area: 'productPrice' }],
      ['[class$="-desc"], .p-desc, [class*="description"]', { area: 'productDesc' }],
      ['form[action$="/cart"], .p-add, [class$="-buy"], a[href$="/checkout"]', { area: 'buy' }]
    ].concat(COMMON);
  }
  if (PAGE === 'cart') {
    RULES = [['form, table, [class*="cart"]', { area: 'cart' }]].concat(COMMON);
  }
  if (PAGE === 'checkout') {
    RULES = [['form input, form select, form textarea, .ck-field, label', { area: 'form' }]].concat(COMMON);
  }

  function pickOf(el) {
    if (!el || !el.closest) return null;
    for (var i = 0; i < RULES.length; i++) {
      var hit = el.closest(RULES[i][0]);
      if (hit) return { area: RULES[i][1].area, el: hit };
    }
    var sec = el.closest('[data-section]');
    if (sec) return { id: sec.getAttribute('data-section'), el: sec };
    return null;
  }

  function labelOf(hit) {
    if (!hit) return '';
    if (hit.id) return hit.el.getAttribute('data-label') || 'Section';
    return LABELS[hit.area] || 'Modifier';
  }

  /* étiquette qui suit la souris : elle dit ce qu'on va modifier, sans rien déplacer */
  var hotEl = null, tag = null;
  function tagBox() {
    if (!tag) {
      tag = document.createElement('div');
      tag.id = 'shPickTag';
      document.body.appendChild(tag);
    }
    return tag;
  }
  function clearHot() {
    if (hotEl) hotEl.classList.remove('sh-hot');
    hotEl = null;
    if (tag) tag.style.display = 'none';
  }
  document.addEventListener('mousemove', function (e) {
    if (!document.documentElement.classList.contains('sh-preview')) return;
    if (TEXTMODE) {
      var tel = textEl(e.target);
      var boxT = tagBox();
      if (!tel) { clearHot(); document.body.style.cursor = ''; return; }
      document.body.style.cursor = 'pointer';
      boxT.textContent = 'Taille de ce texte';
      boxT.style.display = 'block';
      boxT.style.left = Math.min(e.clientX + 14, window.innerWidth - boxT.offsetWidth - 8) + 'px';
      boxT.style.top = Math.max(6, e.clientY - 32) + 'px';
      return;
    }
    var hit = pickOf(e.target);
    var box = tagBox();
    if (!hit) { clearHot(); document.body.style.cursor = ''; return; }
    if (hotEl !== hit.el) {
      if (hotEl) hotEl.classList.remove('sh-hot');
      hotEl = hit.el;
      hotEl.classList.add('sh-hot');
    }
    document.body.style.cursor = 'pointer';
    box.textContent = 'Modifier : ' + labelOf(hit);
    box.style.display = 'block';
    box.style.left = Math.min(e.clientX + 14, window.innerWidth - box.offsetWidth - 8) + 'px';
    box.style.top = Math.max(6, e.clientY - 32) + 'px';
  }, true);
  document.addEventListener('mouseleave', clearHot, true);
  window.addEventListener('scroll', clearHot, true);

  function actBar(kind) {
    var bar = document.getElementById('ndzAct');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ndzAct';
      document.body.appendChild(bar);
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-act]');
        if (!b) return;
        ev.preventDefault();
        ev.stopPropagation();
        parent.postMessage({ t: 'act', what: b.getAttribute('data-what'), op: b.getAttribute('data-act'), value: b.getAttribute('data-val') || '' }, '*');
      });
    }
    var title = kind === 'search' ? 'Recherche' : 'Logo';
    bar.innerHTML = '<b>' + title + '</b>' +
      '<button type="button" data-what="' + kind + '" data-act="place" data-val="gauche">Gauche</button>' +
      '<button type="button" data-what="' + kind + '" data-act="place" data-val="centre">Centre</button>' +
      '<button type="button" data-what="' + kind + '" data-act="place" data-val="droite">Droite</button>' +
      '<button type="button" data-what="' + kind + '" data-act="delete">Supprimer</button>';
    bar.style.display = 'flex';
  }
  document.addEventListener('click', function (e) {
    if (TEXTMODE) {
      var tel = textEl(e.target);
      if (!tel) return;
      e.preventDefault();
      e.stopPropagation();
      var sel = selectorOf(tel);
      if (!sel) return;
      Array.prototype.forEach.call(document.querySelectorAll('.sh-textsel'), function (n) { n.classList.remove('sh-textsel'); });
      tel.classList.add('sh-textsel');
      var label = String(tel.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 42);
      var px = Math.round(parseFloat(window.getComputedStyle(tel).fontSize) || 16);
      var scope = tel.closest('header, footer') ? '*' : PAGE;
      parent.postMessage({ t: 'textpick', page: scope, sel: sel, label: label, px: px }, '*');
      return;
    }
    var hit = pickOf(e.target);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    var product = document.documentElement.getAttribute('data-product') || '';
    if (hit.area === 'search' || hit.area === 'brand') actBar(hit.area);
    if (hit.id) parent.postMessage({ t: 'pick', id: hit.id, product: product }, '*');
    else parent.postMessage({ t: 'pick', area: hit.area, product: product, label: labelOf(hit) }, '*');
  }, true);
})();
</script>`

module.exports = { esc, money, moneyHtml, WILAYAS, LOGO, page, PREVIEW_SCRIPT }
