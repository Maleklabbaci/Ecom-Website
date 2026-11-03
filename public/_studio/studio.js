/* Studio NovaDZ — interface (barre, ajout, calques, inspecteur). Pilote /_studio/frame.js dans l'iframe. */
(function () {
  "use strict"
  var root = document.getElementById("st"), cfg = root.dataset

  /* ---------- arabe ----------
     Le Studio se dessine ici, dans le navigateur. Plutôt que d'écrire deux
     fois chaque phrase, on remplace les mots de la plateforme après chaque
     affichage, à partir de la table envoyée par le serveur. Ce qui appartient
     au marchand (ses titres, ses produits) n'est jamais dans la table : il
     reste intact. */
  var LANG = cfg.lang || "fr"
  var AR = null
  if (LANG === "ar") {
    try {
      var raw = document.getElementById("st-ar")
      AR = raw ? JSON.parse(raw.textContent) : null
      if (AR) AR.patterns = AR.patterns.map(function (p) { return [new RegExp(p[0], p[1]), p[2]] })
    } catch (e) { AR = null }
  }
  function trLine(line) {
    var t = line.trim()
    if (!t) return line
    for (var i = 0; i < AR.words.length; i++) if (AR.words[i][0] === t) return line.replace(t, AR.words[i][1])
    for (var j = 0; j < AR.patterns.length; j++) {
      var m = t.match(AR.patterns[j][0])
      if (m) return line.replace(t, AR.patterns[j][1].replace(/\$(\d)/g, function (_, d) { return m[+d] || "" }))
    }
    return line
  }
  function tr(s) {
    if (!AR || !s) return s
    /* les questions posées avant une action tiennent sur plusieurs lignes :
       on traduit ligne par ligne, sinon rien ne serait reconnu */
    return String(s).split("\n").map(trLine).join("\n")
  }
  var SKIP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, TEXTAREA: 1, CODE: 1, PRE: 1 }
  function trNode(node) {
    var kids = node.childNodes || []
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i]
      if (n.nodeType === 3) {
        var v = tr(n.nodeValue)
        if (v !== n.nodeValue) n.nodeValue = v
      } else if (n.nodeType === 1 && !n.hasAttribute("data-noar")) {
        /* les attributs d'abord : même une iframe a un titre à traduire */
        if (n.hasAttribute("placeholder") || n.hasAttribute("title") || n.hasAttribute("aria-label")) {
          ["placeholder", "title", "aria-label"].forEach(function (a) {
            var v = n.getAttribute(a)
            if (!v) return
            var t = tr(v); if (t !== v) n.setAttribute(a, t)
          })
        }
        if (!SKIP[n.tagName]) trNode(n)
      }
    }
  }
  function translateUi() {
    if (!AR) return
    trNode(root)
  }
  /* Six polices pour le site, nommées par ce qu'elles donnent — pas par leur
     nom technique. Un débutant choisit une ambiance, pas une référence. */
  var FONTS = ["Inter", "Geist", "Urbanist", "Archivo", "Jost", "Space Grotesk", "Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Estedad", "Georgia", "Arial", "Courier New"]
  var FONTS_SITE = [
    ["Inter", "Simple et nette"],
    ["Jost", "Douce et ronde"],
    ["Space Grotesk", "Moderne"],
    ["Archivo", "Solide, bien lisible"],
    ["Playfair Display", "Chic, avec des fioritures"],
    ["Georgia", "Classique, comme un livre"],
  ]
  var WIDTH = { d: 1280, t: 820, m: 390 }
  var PX = /^(font-size|letter-spacing|padding-.*|margin-.*|border-radius|border-width|width|height|min-height|max-width|gap|top|left|right|bottom)$/
  var F = null, dev = "d", lTab = "sections", rTab = "content", dirty = false, saving = false, timer = 0
  var open = new WeakSet(), openSec = new WeakSet(), typing = false, secFirst = false, libCache = null
  var cur = "home", pages = [{ key: "home", name: "Accueil" }], products = [], simple = true
  var sharedInfo = { header: false, footer: false }
  var arFont = cfg.arFont || "cairo", arFonts = null
  var siteFontNow = ""       /* police choisie pour tout le site (onglet Mon site) */
  var metaFresh = false
  /* Les autres pages de la boutique. Elles sont dessinées par la plateforme,
     mais le marchand doit pouvoir y écrire : on les ouvre dans le même Studio,
     avec leurs zones vivantes encadrées « protégée ». Elles s'enregistrent
     tout de suite (elles sont déjà en ligne), d'où le préfixe p:. */
  var PAGES_SHOP = [["product", "Fiche produit"], ["cart", "Panier"], ["checkout", "Commande"], ["done", "Confirmation"]]
  function isShopPage(k) { return String(k || "").slice(0, 2) === "p:" }
  function shopKey(k) { return String(k || "").slice(2) }

  function h(tag, attrs) {
    var e = document.createElement(tag)
    for (var k in attrs || {}) {
      var v = attrs[k]
      if (k === "class") e.className = v
      else if (k.slice(0, 2) === "on") e[k] = v
      else if (v === true) e.setAttribute(k, "")
      else if (v !== false && v != null) e.setAttribute(k, v)
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i]; if (c == null || c === false) continue
      if (Array.isArray(c)) c.forEach(function (x) { x && e.appendChild(x.nodeType ? x : document.createTextNode(x)) })
      else e.appendChild(c.nodeType ? c : document.createTextNode(c))
    }
    return e
  }
  /* icônes vectorielles (aucune police d'icônes, aucun appel réseau) */
  var SVGNS = "http://www.w3.org/2000/svg"
  var ICON = {
    undo: '<path d="M4 7h8a4.5 4.5 0 0 1 0 9H7"/><path d="M7 3.5 3.5 7 7 10.5"/>',
    redo: '<path d="M16 7H8a4.5 4.5 0 0 0 0 9h5"/><path d="M13 3.5 16.5 7 13 10.5"/>',
    back: '<path d="M12 4.5 6.5 10 12 15.5"/>',
    help: '<circle cx="10" cy="10" r="7"/><path d="M7.9 7.7a2.1 2.1 0 1 1 2.9 1.95c-.5.24-.8.7-.8 1.25v.4"/><circle cx="10" cy="14.1" r=".9" fill="currentColor" stroke="none"/>',
    eye: '<path d="M1.8 10S4.9 4.8 10 4.8 18.2 10 18.2 10 15.1 15.2 10 15.2 1.8 10 1.8 10Z"/><circle cx="10" cy="10" r="2.4"/>',
    eyeOff: '<path d="M7.3 5.3A8.6 8.6 0 0 1 10 4.8c5.1 0 8.2 5.2 8.2 5.2a15 15 0 0 1-2.6 3.2"/><path d="M4.6 6.7A15.3 15.3 0 0 0 1.8 10S4.9 15.2 10 15.2c1 0 1.9-.2 2.7-.5"/><path d="M8.3 8.3a2.4 2.4 0 0 0 3.4 3.4"/><path d="M3.2 3.2l13.6 13.6"/>',
    down: '<path d="M5 7.5 10 12.5 15 7.5"/>',
    right: '<path d="M7.5 5 12.5 10 7.5 15"/>',
    close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
    jump: '<path d="M7.5 4.5 12 9l-4.5 4.5"/><path d="M4 13.5h5.5"/>',
    copy: '<rect x="6.5" y="6.5" width="9" height="9" rx="2"/><path d="M13.2 4.2a2 2 0 0 0-1.9-1.4H5.2a2 2 0 0 0-2 2v6.1c0 .9.5 1.6 1.3 1.9"/>',
    collapse: '<path d="M6 3.5 10 7.5 14 3.5"/><path d="M6 16.5l4-4 4 4"/>',
    text: '<path d="M4.5 6h11M4.5 10h11M4.5 14h7"/>',
    link: '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.1 2.1a3 3 0 0 0 4.2 4.2l1-1"/>',
    panel: '<rect x="3" y="3.5" width="14" height="13" rx="2"/><path d="M7.5 3.5v13"/>',
    screen: '<rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M2.5 7.5h15"/>',
    sliders: '<path d="M3 6.5h9M15 6.5h2M3 13.5h2M8 13.5h9"/><circle cx="13.2" cy="6.5" r="1.7"/><circle cx="6.2" cy="13.5" r="1.7"/>',
    pen: '<path d="M13.4 3.9a1.8 1.8 0 0 1 2.5 2.5l-7.6 7.6-3.2.7.7-3.2 7.6-7.6Z"/>',
    grip: '<circle cx="7.5" cy="5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="5" r="1.1" fill="currentColor" stroke="none"/><circle cx="7.5" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="7.5" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="15" r="1.1" fill="currentColor" stroke="none"/>',
  }
  function ico(name, size) {
    var s = document.createElementNS(SVGNS, "svg")
    s.setAttribute("viewBox", "0 0 20 20")
    s.setAttribute("width", size || 14); s.setAttribute("height", size || 14)
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor")
    s.setAttribute("stroke-width", "1.7"); s.setAttribute("stroke-linecap", "round")
    s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true")
    s.innerHTML = ICON[name] || ""
    return s
  }
  function gripIcon() {
    var g = h("span", { class: "grip", title: "Glisser pour déplacer" })
    g.appendChild(ico("grip", 12))
    return g
  }
  function iconize(btn, name, size) {
    btn.textContent = ""
    btn.appendChild(ico(name, size))
    return btn
  }

  /* Les boîtes du navigateur (confirmer, demander un nom) ne passent pas par
     la page : il faut leur donner le texte déjà traduit. */
  function ask(msg) { return window.confirm(tr(msg)) }
  function askText(msg, def) { return window.prompt(tr(msg), def) }
  function toast(msg, kind) {
    var t = h("div", { class: "toast " + (kind || "") }, tr(msg)); document.body.appendChild(t)
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove() }, 300) }, 3200)
  }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json() })
  }

  /* ---------- squelette ---------- */
  root.innerHTML = ""
  /* le bandeau sous la barre dit déjà où en est le site : ici, seulement
     l'état de l'enregistrement (pas de doublon « brouillon non publié ») */
  var status = h("span", { class: "status" }, "Enregistré")
  var bUndo = iconize(h("button", { class: "ib", title: "Annuler (Ctrl+Z)", onclick: function () { undo() } }), "undo", 15)
  var bRedo = iconize(h("button", { class: "ib", title: "Rétablir (Ctrl+Y)", onclick: function () { redo() } }), "redo", 15)
  var devBtns = [["d", "Ordinateur"], ["t", "Tablette"], ["m", "Mobile"]].map(function (x) {
    return h("button", { class: "seg" + (x[0] === dev ? " on" : ""), "data-d": x[0], onclick: function () { setDev(x[0]) } }, x[1])
  })
  var pageSel = h("select", { class: "pagesel", title: "Page", onchange: function () { switchPage(this.value) } })
  var bNewPage = h("button", { class: "btn sm", title: "Nouvelle page (copie de la page actuelle)", onclick: function () { newPage() } }, "+ Page")
  var bDelPage = h("button", { class: "btn sm", title: "Supprimer cette page", onclick: function () { delPage() } }, "Supprimer")
  var bSave = h("button", { class: "btn", onclick: function () { save() } }, "Enregistrer")
  var bPub = h("button", { class: "btn pri", onclick: publish }, "Publier")
  var top = h("header", { class: "top" },
    iconize(h("a", { class: "back", href: "/dashboard/design/themes", title: "Retour aux modèles" }), "back", 16),
    h("div", { class: "ttl" }, h("b", {}, "Studio"), h("span", {}, cfg.name + " · " + cfg.tplName)),
    pageSel, bNewPage, bDelPage,
    h("div", { class: "grp" }, devBtns), h("div", { class: "grp" }, bUndo, bRedo),
    h("span", { class: "sp" }), status,
    iconize(h("button", { class: "ib", title: "Raccourcis clavier", onclick: function () { help() } }), "help", 15),
    /* la langue : un seul bouton, il montre celle vers laquelle on bascule */
    /* Un seul bouton, mais il faut changer LES DEUX langues : celle de
       l'espace de gestion (uilang, cookie ndz_ui) et celle du site qu'on
       regarde (lang, cookie ndz_lang). Avant, seul « lang » passait : la page
       de la boutique restait dans l'autre langue, et au retour on pouvait
       enregistrer une page arabe en croyant être en français. */
    h("a", {
      class: "btn ib lang", href: "?uilang=" + (LANG === "ar" ? "fr" : "ar") + "&lang=" + (LANG === "ar" ? "fr" : "ar"),
      title: LANG === "ar" ? "Français" : "العربية", "aria-label": LANG === "ar" ? "Français" : "العربية",
      "data-noar": "1",
    }, LANG === "ar" ? "FR" : "ع"),
    h("a", { class: "btn", href: "#", onclick: function (e) { e.preventDefault(); preview() } }, "Aperçu"), bSave, bPub)
  var left = h("aside", { class: "left" }), right = h("aside", { class: "right" })
  var stage = h("div", { class: "stage" }), wrap = h("div", { class: "fwrap" })
  var frameEl = h("iframe", { class: "frame", title: "Page", src: "/dashboard/studio/frame?page=home" })
  wrap.appendChild(frameEl); stage.appendChild(wrap)
  root.appendChild(top); root.appendChild(left); root.appendChild(stage); root.appendChild(right)

  /* ---------- bandeau « où en est mon site » ----------
     Un débutant doit savoir à chaque seconde si ce qu'il fait est visible.
     Trois états seulement : jamais publié, publié, ou publié avec des
     changements pas encore en ligne. Toujours à l'écran, jamais un menu. */
  var liveUrl = "/" + cfg.slug
  var isLive = cfg.published === "1"
  var draftbar = h("div", { class: "draftbar", role: "status" })
  root.insertBefore(draftbar, left)
  function renderDraft() {
    var mod = dirty || (!isLive && cfg.unpublished === "1")
    draftbar.className = "draftbar" + (isLive && !mod ? " live" : "")
    draftbar.innerHTML = ""
    var txt = h("div", { class: "db-txt" })
    if (isShopPage(cur)) {
      /* fiche produit, panier, commande, confirmation : la page tourne déjà */
      txt.appendChild(h("b", {}, "Cette page est déjà en ligne."))
      txt.appendChild(h("span", {}, "Ce que vous changez ici se voit tout de suite. Les parties encadrées viennent de vos produits : elles restent en place."))
    } else if (!isLive) {
      txt.appendChild(h("b", {}, "Personne ne voit encore votre site."))
      txt.appendChild(h("span", {}, "Travaillez tranquillement : rien n'est visible tant que vous ne cliquez pas sur Publier."))
    } else if (mod) {
      txt.appendChild(h("b", {}, "Vos changements ne sont pas encore en ligne."))
      txt.appendChild(h("span", {}, "Vos clients voient la version précédente. Cliquez sur Publier quand tout vous plaît."))
    } else {
      txt.appendChild(h("b", {}, "Votre site est en ligne."))
      txt.appendChild(h("span", {}, "Ce que vous voyez est ce que voient vos clients."))
    }
    draftbar.appendChild(h("span", { class: "db-dot", "aria-hidden": "true" }))
    draftbar.appendChild(txt)
    draftbar.appendChild(h("a", {
      class: "db-link", href: isLive ? liveUrl : liveUrl + "?preview=1", target: "_blank", rel: "noopener",
    }, isLive ? "Voir ce qui est en ligne" : "Voir mon brouillon"))
    /* Sortie de secours : quand on ne sait plus où on en est, on revient
       exactement à ce que les clients voient. Rien n'est republié. */
    if (isLive && mod) draftbar.appendChild(h("button", {
      class: "db-back", type: "button", onclick: revertToLive,
    }, "Revenir à ce que voient mes clients"))
  }
  function revertToLive() {
    if (!ask("Revenir à ce que voient vos clients ?\n\nTout ce qui n'est pas encore en ligne sera effacé. Ce qui est en ligne ne bouge pas.")) return
    clearTimeout(timer)
    post("/dashboard/studio/revert").then(function (j) {
      if (!j.ok) return toast(j.error || "Impossible pour l'instant", "err")
      dirty = false; openPage(cur); renderDraft()
      toast("Vous voyez de nouveau ce que voient vos clients.", "ok")
    })
  }

  /* ---------- téléphone : un panneau à la fois ---------- */
  var mobBtns = [["left", "panel", "Ma page"], ["stage", "screen", "La page"], ["right", "sliders", "Réglages"]]
  var mobTabs = h("nav", { class: "mobtabs", "aria-label": "Panneaux du Studio" })
  /* Sur téléphone il n'y a pas de Ctrl+Z : sans ces deux boutons, une
     suppression faite au pouce était définitive. Ils sont donc toujours là. */
  var mobUndo = h("button", { type: "button", class: "mob-act", title: "Annuler la dernière action", onclick: function () { undo() } }, ico("undo", 17))
  var mobRedo = h("button", { type: "button", class: "mob-act", title: "Rétablir", onclick: function () { redo() } }, ico("redo", 17))
  mobUndo.setAttribute("aria-label", "Annuler")
  mobRedo.setAttribute("aria-label", "Rétablir")
  mobTabs.appendChild(mobUndo)
  var mobEls = mobBtns.map(function (x) {
    var b = h("button", { type: "button", onclick: function () { setMob(x[0]) } }, ico(x[1], 17), x[2])
    b.setAttribute("data-mob-go", x[0])
    mobTabs.appendChild(b)
    return b
  })
  mobTabs.appendChild(mobRedo)
  root.appendChild(mobTabs)
  function setMob(where) {
    document.body.setAttribute("data-mob", where)
    mobEls.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-mob-go") === where) })
    if (where === "stage") fit()
  }
  setMob("stage")

  function fit() {
    var w = WIDTH[dev], aw = stage.clientWidth - 32, s = Math.min(1, aw / w), ah = stage.clientHeight - 24
    frameEl.style.width = w + "px"; frameEl.style.height = Math.round(ah / s) + "px"
    frameEl.style.transform = "scale(" + s + ")"
    wrap.style.width = Math.round(w * s) + "px"; wrap.style.height = ah + "px"
  }
  addEventListener("resize", fit)
  function setDev(d) {
    dev = d; devBtns.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-d") === d) })
    fit(); F && F.setDevice(d); renderRight()
  }

  /* ---------- annuler / rétablir ---------- */
  /* Une seule fonction pour les boutons du bureau, ceux du téléphone et le
     clavier : impossible qu'un des trois chemins se comporte autrement. */
  function refreshHist() {
    var cu = !!(F && F.canUndo()), cr = !!(F && F.canRedo())
    bUndo.disabled = !cu; bRedo.disabled = !cr
    mobUndo.disabled = !cu; mobRedo.disabled = !cr
  }
  function undo() {
    if (!F || !F.canUndo()) return toast("Rien à annuler : vous êtes au début.")
    F.undo(); renderLeft(); renderRight(); refreshHist()
  }
  function redo() {
    if (!F || !F.canRedo()) return toast("Rien à rétablir.")
    F.redo(); renderLeft(); renderRight(); refreshHist()
  }

  /* ---------- enregistrer / publier / aperçu ---------- */
  function setStatus(t, cls) { status.textContent = t; status.className = "status " + (cls || "") }
  function save() {
    if (!F || saving) return Promise.resolve(false)
    saving = true; clearTimeout(timer); setStatus("Enregistrement…")
    var shop = isShopPage(cur)
    var url = shop ? "/dashboard/studio/plateforme" : "/dashboard/studio/save"
    var html = shop && F.htmlWithKeep ? F.htmlWithKeep() : F.getHtml()
    var body = shop ? { html: html, page: shopKey(cur) } : { html: html, page: cur }
    return post(url, body).then(function (j) {
      saving = false
      if (!j.ok) { setStatus("Non enregistré", "err"); toast(j.error || "Enregistrement impossible", "err"); return false }
      dirty = false
      setStatus(shop ? "Enregistré — cette page est déjà en ligne" : "Brouillon enregistré — pas encore en ligne", "ok")
      renderDraft(); return true
    }).catch(function () { saving = false; setStatus("Non enregistré", "err"); toast("Connexion perdue", "err"); return false })
  }
  function publish() {
    /* les pages de la boutique sont déjà en ligne : publier = enregistrer */
    if (isShopPage(cur)) { save().then(function (ok) { if (ok) toast("C'est en ligne : cette page est déjà publiée.", "ok") }); return }
    if (!ask("Publier votre site ?\n\nTout le monde pourra le voir, à l'adresse " + liveUrl + ".\nVous pourrez encore le modifier après.")) return
    save().then(function (ok) {
      if (!ok) return
      post("/dashboard/studio/publish").then(function (j) {
        if (!j.ok) return toast(j.error || "Publication impossible", "err")
        isLive = true; dirty = false
        bPub.classList.remove("todo"); setStatus("En ligne", "ok"); renderDraft()
        toast("Publié : votre site est en ligne.", "ok")
      })
    })
  }
  function preview() {
    if (isShopPage(cur)) {
      var k = shopKey(cur)
      var premier = (products || [])[0]
      var url = k === "product" ? "/" + cfg.slug + "/p/" + (premier ? premier.id : "") : "/" + cfg.slug + "/" + (k === "done" ? "" : k)
      window.open(url, "_blank"); return
    }
    save().then(function () { window.open("/" + cfg.slug + (cur === "home" ? "" : "/s/" + cur) + "?preview=1", "_blank") })
  }
  function frameUrl() {
    if (isShopPage(cur)) return "/dashboard/studio/plateforme?page=" + encodeURIComponent(shopKey(cur)) + (LANG === "ar" ? "&uilang=ar" : "")
    return "/dashboard/studio/frame?page=" + encodeURIComponent(cur)
  }
  function loadFrameSoon() { if (F) F.reload ? F.reload() : (F = null, (frameEl.src = frameUrl())) }
  function renderPages() {
    pageSel.innerHTML = ""
    var mine = h("optgroup", { label: "Mes pages" })
    pages.forEach(function (p) { mine.appendChild(h("option", { value: p.key }, p.name)) })
    pageSel.appendChild(mine)
    var shop = h("optgroup", { label: "Les pages de ma boutique" })
    PAGES_SHOP.forEach(function (p) { shop.appendChild(h("option", { value: "p:" + p[0] }, p[1])) })
    pageSel.appendChild(shop)
    pageSel.value = cur
    bDelPage.style.display = cur === "home" || isShopPage(cur) ? "none" : ""
  }
  function loadMeta() {
    return fetch("/dashboard/studio/meta").then(function (r) { return r.json() }).then(function (j) {
      pages = j.pages && j.pages.length ? j.pages : pages; products = j.products || []
      sharedInfo = j.shared || sharedInfo
      renderPages()
    })
  }
  function openPage(k) { cur = k; F = null; frameEl.src = frameUrl(); renderPages() }
  /* Un bloc qu'on vient de poser doit se voir tout de suite : on ouvre
     l'onglet « Ma page », la partie qui le contient se déplie, et on fait
     défiler la liste jusqu'à elle. Sans ça, le marchand restait sur la liste
     des blocs à ajouter et croyait que rien n'était arrivé. */
  function showInserted(el) {
    if (!el || !F) return
    var sec = el
    var list = sections()
    for (var i = 0; i < list.length; i++) if (list[i] === el || list[i].contains(el)) { sec = list[i]; break }
    openSec.add(sec)
    lTab = "sections"
    renderLeft(); renderRight()
    setTimeout(function () {
      var card = left.querySelector(".card.sel") || left.querySelector(".slist .card:last-of-type")
      if (card && card.scrollIntoView) card.scrollIntoView({ block: "nearest" })
    }, 60)
    toast("Bloc ajouté à votre page.", "ok")
  }
  function switchPage(k) { if (k === cur) return; save().then(function () { openPage(k) }) }
  function newPage() {
    var n = askText("Nom de la nouvelle page (ex. À propos) :"); if (!n) return
    save().then(function () { return post("/dashboard/studio/page", { name: n, from: cur }) }).then(function (j) {
      if (!j.ok) return toast(j.error || "Impossible de créer la page", "err")
      loadMeta().then(function () { openPage(j.key); toast("Page créée (copie de la précédente). Relie-la avec un lien : /" + cfg.slug + "/s/" + j.key, "ok") })
    })
  }
  function delPage() {
    if (cur === "home" || !ask("Supprimer cette page ?")) return
    post("/dashboard/studio/page/delete", { key: cur }).then(function () { dirty = false; cur = "home"; loadMeta().then(function () { openPage("home") }) })
  }
  function autoMobile() { return F ? F.autoMobile() : -1 }
  function changed() {
    dirty = true; setStatus("Modifié…"); bPub.classList.add("todo"); clearTimeout(timer); timer = setTimeout(save, 2500)
    refreshHist(); renderDraft()
  }
  addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = "" } })
  /* Changer de langue recharge la page : on enregistre d'abord, sinon le
     travail en cours serait perdu. La langue change, rien d'autre. */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a.ndz-uilang") : null
    if (!a || !dirty) return
    e.preventDefault()
    var go = a.getAttribute("href")
    save().then(function () { location.href = go }).catch(function () { location.href = go })
  }, true)
  renderDraft(); refreshHist()
  document.addEventListener("keydown", function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "")) return
    var m = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
    if (m && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo() }
    else if (m && k === "y") { e.preventDefault(); redo() }
    else if (m && k === "s") { e.preventDefault(); save() }
  })

  /* ---------- images ---------- */
  /* Deux façons de poser une image : la renvoyer, ou réutiliser une photo
     déjà envoyée (bibliothèque). Évite de re-téléverser la même photo. */
  function pickImage(cb) {
    function upload() {
      var inp = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" })
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return
        var img = new Image(), url = URL.createObjectURL(f)
        img.onload = function () {
          var s = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement("canvas")
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
          var png = f.type === "image/png", data = c.toDataURL(png ? "image/png" : "image/jpeg", 0.86)
          if (png && data.length > 3.2e6) data = c.toDataURL("image/jpeg", 0.86)
          URL.revokeObjectURL(url); toast("Envoi de l'image…")
          post("/dashboard/upload", { dataUrl: data }).then(function (j) {
            if (!j.ok) return toast(j.error || "Image refusée", "err")
            libCache = null; cb(j.url)
          })
        }
        img.src = url
      }
      inp.click()
    }

    var grid = h("div", { class: "ipick-grid" })
    var add = function (list) {
      grid.innerHTML = ""
      if (!list.length) { grid.appendChild(h("p", { class: "hint" }, "Aucune photo envoyée pour l'instant.")); return }
      list.forEach(function (u) {
        grid.appendChild(h("button", { class: "ipick-img", title: u, onclick: function () { close(); cb(u) } },
          h("img", { src: u, alt: "", loading: "lazy" })))
      })
    }
    var modal = h("div", { class: "ipick", role: "dialog", "aria-label": "Choisir une image" },
      h("div", { class: "ipick-in" },
        h("h4", {}, "Choisir une image"),
        h("p", { class: "hint" }, "Tes photos déjà envoyées. Un clic l'utilise sur la page."),
        grid,
        h("div", { class: "ipick-foot" },
          h("button", { class: "btn pri", onclick: function () { close(); upload() } }, "Envoyer une nouvelle image"),
          h("button", { class: "btn", onclick: function () { close() } }, "Fermer"))))
    function close() { modal.remove(); document.removeEventListener("keydown", esc) }
    function esc(e) { if (e.key === "Escape") close() }
    modal.addEventListener("click", function (e) { if (e.target === modal) close() })
    document.addEventListener("keydown", esc)
    document.body.appendChild(modal)
    grid.appendChild(h("p", { class: "hint" }, "Chargement…"))
    if (libCache) return add(libCache)
    fetch("/dashboard/studio/meta").then(function (r) { return r.json() }).then(function (j) {
      libCache = j.images || []; add(libCache)
    }).catch(function () { add([]) })
  }

  /* ---------- calques : sections → textes, images, boutons ----------
     La découpe est faite par la page elle-même (frame.js, API.sections/API.layers) :
     le panneau ne fait qu'afficher, donc tous les thèmes — fournis ou importés —
     sont traités pareil. */
  function sections() { return F ? F.sections() : [] }
  function collect(sec) { return F.layers(sec) }
  function plainText(el) { return F ? F.text(el) : (el.textContent || "").trim() }
  /* nom lisible d'une section : « En-tête », « Pied de page », sinon son premier
     titre, sinon un extrait de texte propre (jamais une bouillie de menu). */
  var NAVISH = /(^|[-_ ])(nav|navbar|menu|header|masthead|topbar|toolbar|breadcrumb)/i
  /* Texte d'une section entière, remis à plat.
     `textContent` colle les morceaux : un titre « Crewneck » suivi du prix
     donne « Crewneck85,00 € » dans la liste des blocs. `innerText` garde le
     saut de ligne entre les deux, on le transforme en espace. */
  function flatText(el) {
    var v = ""
    try { v = el.innerText } catch (_) {}
    if (!v) v = el.textContent || ""
    return v.replace(/\s+/g, " ").trim()
  }
  function secName(sec, i) {
    var tag = sec.tagName, cls = String(sec.getAttribute("class") || "") + " " + String(sec.id || "")
    if (tag === "HEADER" || sec.querySelector("nav") && sec.getBoundingClientRect().height < 220 || NAVISH.test(cls)) return (i + 1) + ". En-tête (menu)"
    if (tag === "FOOTER" || NAVISH.test(cls.replace(/header/gi, ""))) return (i + 1) + ". Pied de page"
    var t = "", hds = sec.querySelectorAll("h1,h2,h3,h4,h5")
    for (var k = 0; k < hds.length; k++) {
      var v = plainText(hds[k])
      if (v && v.length >= 3 && v.length <= 90) { t = v; break }
    }
    if (!t) t = sec.getAttribute("aria-label") || ""
    if (!t) {
      /* premier paragraphe lisible plutôt que le texte brut de toute la section */
      var ps = sec.querySelectorAll("p,blockquote,figcaption,li")
      for (var j = 0; j < ps.length && !t; j++) {
        var pv = plainText(ps[j])
        if (pv && pv.length >= 12) t = pv
      }
    }
    if (!t) t = flatText(sec)
    if (!t) {
      /* section surtout visuelle : on la nomme par sa photo */
      var im = sec.querySelectorAll("img")
      for (var i2 = 0; i2 < im.length && !t; i2++) {
        var alt = (im[i2].getAttribute("alt") || "").trim()
        if (alt && alt.length >= 3) t = alt
      }
      if (!t) t = im.length ? "Bandeau image" : ""
    }
    if (!t) {
      /* Aucun texte lisible : on nomme le bloc par ce qu'il montre, jamais par
         une classe CSS (« img.w-full » n'a aucun sens pour un marchand). */
      var hasImg = sec.querySelector("img,picture,video")
      t = hasImg ? "Photo" : sec.querySelector("a,button") ? "Bouton" : "Bloc"
    }
    /* un texte sans espace et très long = collage de liens : on garde 28 caractères */
    if (t.length > 46) t = t.slice(0, 46).replace(/\s+\S*$/, "") + "…"
    return (i + 1) + ". " + t
  }
  function hit(el, extra) {
    if (!el) return
    F.select(el)
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }) } catch (_) {}
    if (extra) renderLeft()
  }
  /* ---------- supprimer n'importe quoi, d'un clic ----------
     Un texte, une photo, un fond, un bouton : la petite croix à droite de la
     ligne l'enlève de la page. Ctrl+Z remet tout comme avant. */
  function killBtn(el, quoi) {
    return h("button", { class: "lay-act lay-del", title: "Supprimer " + quoi, onclick: function (e) {
      e.stopPropagation()
      if (!F.delEl(el)) return toast("Cette partie ne peut pas être supprimée.", "err")
      toast("Supprimé. Ctrl+Z pour revenir en arrière.", "ok")
      renderLeft(); renderRight()
    } }, "✕")
  }
  function textLayer(el) {
    var inp = h("input", { class: "lay-in" + (F.selected() === el ? " on" : ""), value: plainText(el), dir: "auto", title: "Modifie le texte ici" })
    inp.onfocus = function () { typing = true; F.select(el) }
    inp.oninput = function () { el.textContent = inp.value }
    inp.onchange = function () { typing = false; F.select(el); F.setText(inp.value) }
    inp.onblur = function () { typing = false }
    inp.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); inp.blur() } if (e.key === "Escape") { typing = false; inp.value = plainText(el); inp.blur() } }
    return h("div", { class: "lay" },
      iconize(h("button", { class: "lay-ico", title: "Voir dans la page", onclick: function () { hit(el, true) } }), "text", 13),
      inp,
      h("button", { class: "lay-act", title: "Voir dans la page", onclick: function () { hit(el) } }, "↗"),
      killBtn(el, "ce texte"))
  }
  function imgLayer(el, i) {
    /* la photo peut venir d'un srcset (modèles importés) : on montre la vraie
       adresse utilisée par le navigateur, et le remplacement efface le
       srcset — sinon l'ancienne photo reviendrait. */
    var src = el.currentSrc || el.getAttribute("src") || ""
    var alt = (el.getAttribute("alt") || "").trim()
    var file = (src.split("/").pop() || "").split("?")[0]
    var name = (alt || (file ? file.slice(0, 26) : "Photo " + ((i || 0) + 1))).slice(0, 34)
    var broken = el.complete && !el.naturalWidth
    var thumb = h("img", { class: "lay-thumb", src: src, alt: "", loading: "eager" })
    var chg = function () {
      pickImage(function (u) { F.select(el); F.setAttr("src", u); renderLeft() })
    }
    return h("div", { class: "lay thumb" },
      thumb,
      h("div", { class: "lay-meta", title: src + "\n" + Math.round(el.naturalWidth || 0) + " × " + Math.round(el.naturalHeight || 0), onclick: function () { hit(el, true) }, style: "cursor:pointer" },
        h("b", {}, name),
        h("span", {}, (broken ? "Photo introuvable · cliquez pour la remplacer" : "Photo · cliquer pour sélectionner"))),
      h("button", { class: "lay-act", title: "Remplacer cette image", onclick: chg }, "⟳"),
      h("button", { class: "lay-act", title: "Voir dans la page", onclick: function () { hit(el) } }, "↗"),
      killBtn(el, "cette photo"))
  }
  /* une photo posée en fond : même traitement, mais elle se remplace par le
     style (background-image), pas par un attribut src */
  function xBtn(el, title, quoi, fn) {
    return h("button", { class: "lay-act lay-del", title: title, onclick: function (e) {
      e.stopPropagation()
      fn()
      toast(quoi, "ok")
      renderLeft(); renderRight()
    } }, "✕")
  }
  function bgLayer(el, i) {
    var src = F.bgUrl(el)
    var file = (src.split("/").pop() || "").split("?")[0]
    var name = (file || "Fond " + ((i || 0) + 1)).slice(0, 34)
    return h("div", { class: "lay thumb" },
      h("img", { class: "lay-thumb bg", src: src, alt: "", loading: "eager" }),
      h("div", { class: "lay-meta", title: src, onclick: function () { hit(el, true) }, style: "cursor:pointer" },
        h("b", {}, name), h("span", {}, "Photo de fond · cliquer pour sélectionner")),
      h("button", { class: "lay-act", title: "Remplacer cette photo de fond", onclick: function () {
        pickImage(function (u) { F.setBg(el, u); renderLeft() })
      } }, "⟳"),
      h("button", { class: "lay-act", title: "Voir dans la page", onclick: function () { hit(el) } }, "↗"),
      /* une photo de fond se « supprime » sans emporter la section : on
         enlève l'image, le contenu reste */
      xBtn(el, "Supprimer cette photo de fond", "Photo de fond retirée. Ctrl+Z pour revenir en arrière.",
        function () { F.clearBg(el) }))
  }
  function linkLayer(el) {
    /* un lien qui enveloppe une carte (image + textes) ne se réécrit pas d'un
       bloc : on n'y règle que l'adresse, ses textes sont des calques à part */
    var carte = !!el.querySelector("img,picture,h1,h2,h3,h4,div,section,ul")
    var inp = h("input", { class: "lay-in" + (F.selected() === el ? " on" : ""), value: carte ? "Toute cette carte est cliquable" : plainText(el), dir: "auto", title: carte ? "On change seulement l'adresse : les textes se modifient dans « Les textes »" : "Écris ici le texte du bouton" })
    if (carte) { inp.readOnly = true; inp.style.color = "var(--faint)"; inp.style.cursor = "default" }
    if (!carte) {
      inp.onfocus = function () { typing = true; F.select(el) }
      inp.oninput = function () { el.textContent = inp.value }
      inp.onchange = function () { typing = false; F.select(el); F.setText(inp.value) }
      inp.onblur = function () { typing = false }
    }
    var href = function () {
      choisirLien(el, function () { F.select(el); renderLeft() })
    }
    return h("div", { class: "lay" },
      iconize(h("button", { class: "lay-ico", title: "Voir dans la page", onclick: function () { hit(el, true) } }), "link", 13),
      inp,
      h("button", { class: "lay-act", title: "Changer l'adresse du lien", onclick: href }, "🔗"),
      h("button", { class: "lay-act", title: "Voir dans la page", onclick: function () { hit(el) } }, "↗"),
      killBtn(el, "ce bouton"))
  }
  /* ---------- où va un bouton : on choisit une page, pas une adresse ----------
     Avant : une fenêtre demandait « https://… ». Maintenant : la liste des
     pages du site, des produits, du panier — un clic et le lien est posé. */
  function lienGroupes(a) {
    var actuel = (a && a.getAttribute("href")) || ""
    var base = "/" + cfg.slug
    var produits = (products || []).slice(0, 60).map(function (p) {
      return { v: base + "/p/" + p.id, l: p.title, petit: prixFr(p.price) }
    })
    return [
      { t: "Vos pages", items: [{ v: base, l: "Accueil" }].concat((pages || []).filter(function (p) { return p.key !== "home" }).map(function (p) {
        return { v: base + "/s/" + p.key, l: p.name }
      })) },
      produits.length ? { t: "Vos produits", items: produits } : null,
      { t: "Le panier", items: [{ v: base + "/cart", l: "Panier" }, { v: base + "/checkout", l: "Commander" }] },
      { t: "Sur cette page", items: [{ v: "#ndz-boutique", l: "Les produits, plus bas" }] }
    ].filter(Boolean).map(function (g) { g.actuel = actuel; return g })
  }
  function prixFr(cents) {
    var n = Number(cents || 0) / 100
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }
  /* la liste, réutilisée dans le panneau de droite et dans la fenêtre de choix */
  function lienListe(a, done) {
    var box = h("div", { class: "lien-g" }), actuel = (a && a.getAttribute("href")) || ""
    lienGroupes(a).forEach(function (g) {
      box.appendChild(h("div", { class: "lien-t" }, g.t))
      var ul = h("div", { class: "lien-l" })
      g.items.forEach(function (it) {
        var on = it.v === g.actuel
        ul.appendChild(h("button", { class: "lien-i" + (on ? " on" : ""), onclick: function () {
          F.select(a); F.setAttr("href", it.v)
          if (done) done(it.v)
        } },
          h("span", { class: "lien-n" }, it.l),
          it.petit ? h("em", {}, it.petit) : null,
          on ? h("b", { class: "lien-ok" }, "✓") : null))
      })
      box.appendChild(ul)
    })
    var libre = h("input", { value: /^(https?:|tel:|mailto:)/.test(actuel) ? actuel : "", placeholder: "https://instagram.com/…  ou  tel:+213555123456" })
    libre.onchange = function () {
      var v = libre.value.trim()
      if (v && !/^(https?:|tel:|mailto:|\/|#)/.test(v)) v = "https://" + v
      F.select(a); F.setAttr("href", v); if (done) done(v)
    }
    box.appendChild(h("div", { class: "lien-t" }, "Un autre site, un numéro, un e-mail"))
    box.appendChild(libre)
    return box
  }
  function choisirLien(el, done) {
    var mask = h("div", { class: "ndzmask" })
    var close = function () { mask.remove() }
    mask.onclick = function (e) { if (e.target === mask) close() }
    var carte = h("div", { class: "ndm" },
      h("div", { class: "ndm-h" }, h("b", {}, "Où va ce bouton ?"), iconize(h("button", { class: "mini", onclick: close }), "close", 13)),
      h("p", { class: "hint" }, "Choisissez la page. Le lien se remplit tout seul — rien à taper."),
      lienListe(el, function () { close(); if (done) done() }),
      h("button", { class: "btn wide", onclick: close }, "Fermer"))
    mask.appendChild(carte)
    document.body.appendChild(mask)
  }

  /* ---------- un produit cliqué dans « Nos produits » ---------- */
  function produitPanel(body, el) {
    var p = F.produit(el)
    if (!p) {
      body.appendChild(h("p", { class: "hint" }, "Ce bloc affiche vos produits. Cliquez sur un produit pour changer son nom ou son prix."))
      return
    }
    var nom = h("input", { value: p.titre })
    var pr = h("input", { value: prixFr(p.prix), inputmode: "decimal" })
    /* le champ se sélectionne au clic : on tape le nouveau prix sans effacer */
    nom.onfocus = function () { this.select() }
    pr.onfocus = function () { this.select() }
    var etat = h("p", { class: "hint" }, "Le nom et le prix changent tout de suite dans la boutique, même avant de publier.")
    var enreg = h("button", { class: "btn pri wide", onclick: function () {
      var brut = String(pr.value || "").replace(/\s|\u00a0/g, "").replace(",", ".")
      if (!/^\d+(\.\d{1,2})?$/.test(brut)) return toast("Le prix doit être un nombre, par exemple 2500.", "err")
      if (nom.value.trim().length < 2) return toast("Écrivez le nom du produit.", "err")
      enreg.disabled = true
      post("/dashboard/studio/produit", { id: p.id, titre: nom.value.trim(), prix: brut }).then(function (j) {
        enreg.disabled = false
        if (!j || !j.ok) return toast((j && j.error) || "Enregistrement impossible.", "err")
        p.titre = j.titre; p.prix = j.prix; nom.value = j.titre; pr.value = prixFr(j.prix)
        F.majProduit(j.id, j.titre, j.prix, j.prixTxt)
        etat.textContent = "Enregistré : " + j.titre + " — " + j.prixTxt
        toast("Produit enregistré.", "ok")
      }).catch(function () { enreg.disabled = false; toast("Enregistrement impossible.", "err") })
    } }, "Enregistrer ce produit")
    body.appendChild(h("div", { class: "produit" },
      h("div", { class: "produit-h" }, h("b", {}, "Votre produit"), h("em", {}, "n° " + p.id))))
    body.appendChild(fld("Nom du produit", nom))
    body.appendChild(fld("Prix (" + "DZD" + ")", pr))
    body.appendChild(enreg)
    body.appendChild(etat)
    body.appendChild(h("button", { class: "btn sm wide", onclick: function () { window.open("/dashboard/products/" + p.id, "_blank") } }, "Photo, description, stock…"))
    body.appendChild(h("p", { class: "hint" }, "La photo, la description et le stock se règlent sur la fiche complète : elle s'ouvre dans un autre onglet, le Studio reste ouvert ici."))
  }

  function secCard(sec, i, total) {
    var isOpen = openSec.has(sec), isSel = F.selected() === sec || (F.selected() && sec.contains(F.selected()) && sec !== F.win.document.body)
    var hidden = F.win.getComputedStyle(sec).display === "none"
    var card = h("div", { class: "card" + (isSel ? " sel" : "") + (hidden ? " off" : "") })
    var eye = h("button", { class: "mini" + (hidden ? "" : " on"), title: hidden ? "Réafficher cette section" : "Masquer cette section", onclick: function (e) {
      e.stopPropagation(); F.select(sec); F.setStyle("display", hidden ? "" : "none"); openSec.add(sec); renderLeft()
    } })
    iconize(eye, hidden ? "eyeOff" : "eye", 14)
    var carBtn = h("span", { class: "car", title: "Déplier / replier", onclick: function (e) {
      e.stopPropagation(); isOpen ? openSec.delete(sec) : openSec.add(sec); renderLeft()
    } })
    if (true) iconize(carBtn, isOpen ? "down" : "right", 13)
    var delBtn = h("button", { class: "mini act", title: "Supprimer la section", onclick: function (e) {
      e.stopPropagation(); if (!ask("Supprimer « " + secName(sec, i) + " » ?")) return
      F.select(sec); F.del()
    } })
    iconize(delBtn, "close", 13)
    var head = h("div", { class: "card-h", draggable: true },
      gripIcon(),
      carBtn,
      h("button", { class: "card-name", dir: "auto", title: "Sélectionner la section", onclick: function () { hit(sec, true) } }, secName(sec, i)),
      eye,
      iconize(h("button", { class: "mini act", title: "Dupliquer la section", onclick: function (e) { e.stopPropagation(); F.select(sec); F.dup() } }), "copy", 14),
      delBtn)
    head.onclick = function () { isOpen ? openSec.delete(sec) : openSec.add(sec); hit(sec, true) }
    /* survol : la section se dessine dans la page, avant même le clic */
    card.onmouseenter = function () { if (F && F.preview) F.preview(sec) }
    card.onmouseleave = function () { if (F && F.previewOff) F.previewOff() }
    head.ondragstart = function (e) { e.dataTransfer.setData("text/plain", "sec"); window.__dragSec = sec }
    head.ondragover = function (e) { e.preventDefault(); var r = head.getBoundingClientRect(); card.classList.toggle("drop-b", e.clientY < r.top + r.height / 2); card.classList.toggle("drop-a", e.clientY >= r.top + r.height / 2) }
    head.ondragleave = function () { card.classList.remove("drop-b"); card.classList.remove("drop-a") }
    head.ondrop = function (e) {
      e.preventDefault(); var pos = card.classList.contains("drop-b") ? "before" : "after"
      card.classList.remove("drop-b"); card.classList.remove("drop-a")
      if (window.__dragSec) F.moveTo(window.__dragSec, sec, pos); window.__dragSec = null
    }
    var L = collect(sec)
    card.appendChild(head)
    /* sous le nom : ce qu'il y a à modifier, en mots simples (plus de T3 / P1 / L1) */
    var morceaux = [], nPhoto = L.imgs.length + (L.bgs || []).length
    if (L.texts.length) morceaux.push(L.texts.length + " texte" + (L.texts.length > 1 ? "s" : ""))
    if (nPhoto) morceaux.push(nPhoto + " photo" + (nPhoto > 1 ? "s" : ""))
    if (L.links.length) morceaux.push(L.links.length + " bouton" + (L.links.length > 1 ? "s" : ""))
    card.appendChild(h("div", { class: "card-sub" }, morceaux.length ? morceaux.join(" · ") : "à compléter"))
    if (isOpen) {
      var body = h("div", { class: "card-b" })
      var grp = function (title, rows) {
        if (!rows.length) return
        body.appendChild(h("div", { class: "grp-t" }, title + " (" + rows.length + ")", h("i")))
        rows.forEach(function (r) { body.appendChild(r) })
      }
      grp("Les textes", L.texts.map(textLayer))
      grp("Les photos", L.imgs.map(function (el, i) { return imgLayer(el, i) }))
      grp("Les photos de fond", (L.bgs || []).map(function (el, i) { return bgLayer(el, i) }))
      grp("Les boutons", L.links.map(linkLayer))
      if (!L.texts.length && !L.imgs.length && !(L.bgs || []).length && !L.links.length) body.appendChild(h("p", { class: "hint" }, "Rien à modifier ici pour l'instant."))
      card.appendChild(body)
    }
    return card
  }
  /* ---------- « Ma boutique est-elle prête ? » ----------
     Quatre choses très concrètes, en mots de tous les jours, sans jargon. */
  function avancement(body) {
    if (!F) return
    var d = F.win.document, B = d.body
    var textes = B.querySelectorAll("h1,h2,h3,p,li")
    var photos = B.querySelectorAll("img")
    var tel = (B.innerText.match(/(0[5-7][\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2})/) || [])[0]
    var produit = B.querySelector('[data-ndz="produits"], [data-ndz-produits], .grid, .products')
    var etapes = [
      { ok: photos.length >= 2, label: "Ajouter vos photos", why: "au moins 2 photos dans la page",
        /* on ouvre directement la fenêtre des photos : « Ajouter » ne servait à
           rien, il n'y a pas de bloc « photo » dans la liste */
        act: function () { pickImage(function (u) { F.insertImage(u) }) }, actLbl: "Ajouter une photo" },
      { ok: textes.length >= 4, label: "Écrire vos textes", why: "le nom, ce que vous faites, comment vous joindre",
        act: function () { lTab = "sections"; renderLeft() }, actLbl: "Écrire" },
      { ok: !!produit, label: "Montrer ce que vous vendez", why: "une grille de produits ou de services",
        /* la grille vient de « Produits » : on ne peut pas la dessiner deux fois */
        act: function () { window.open("/dashboard/products", "_blank") }, actLbl: "Ajouter" },
      { ok: !!tel, label: "Mettre un numéro de téléphone", why: "pour que les clients puissent vous appeler",
        act: function () { lTab = "sections"; renderLeft() }, actLbl: "Où ?" },
    ]
    var faites = etapes.filter(function (e) { return e.ok }).length
    var reste = etapes.length - faites
    var box = h("div", { class: "ready" + (reste ? "" : " done") })
    box.appendChild(h("div", { class: "ready-top" },
      h("b", {}, reste ? "Il reste " + reste + " chose" + (reste > 1 ? "s" : "") + " à faire" : "Votre page est prête"),
      h("span", { dir: "ltr" }, faites + " / " + etapes.length)))
    var bar = h("div", { class: "ready-bar" }, h("i", { style: "width:" + Math.round(faites / etapes.length * 100) + "%" }))
    box.appendChild(bar)
    if (reste) {
      etapes.filter(function (e) { return !e.ok }).forEach(function (e) {
        box.appendChild(h("button", { class: "ready-row", title: e.why, onclick: e.act },
          h("span", { class: "ready-dot" }), e.label, h("em", {}, e.actLbl)))
      })
    } else {
      box.appendChild(h("p", { class: "ready-note" }, "Vous pouvez maintenant appuyer sur « Publier », en haut à droite."))
    }
    body.appendChild(box)
  }

  /* ---------- l'assistant écrit la page ----------
     Un débutant sait dire ce qu'il vend ; il ne sait pas écrire un titre.
     Trois cases, un bouton, et le haut de la page se remplit. Rien ne part
     sur Internet : les phrases sont assemblées à partir de ses réponses.

     Pourquoi une bulle et pas un cadre dans le panneau : posé dans la liste
     des blocs, il poussait tout vers le bas et on ne voyait plus la page ni ce
     qu'il venait d'écrire. Ici il flotte, on l'ouvre, on le referme. */
  var ecrire = { activite: "", ville: "", atout: "", done: false, open: false, wrap: null, card: null, note: null, btn: null }
  function bubbleOpen(open) {
    if (!ecrire.wrap) return
    ecrire.open = open
    ecrire.wrap.classList.toggle("on", open)
    if (open) {
      var first = ecrire.card.querySelector("input")
      if (first) setTimeout(function () { first.focus() }, 120)
    }
  }
  function assistantBubble() {
    if (ecrire.wrap) return
    var wrap = h("div", { class: "abub", id: "abub" })
    var card = h("div", { class: "abub-card", role: "dialog", "aria-label": "L'assistant écrit ma page" })
    card.appendChild(h("div", { class: "abub-top" },
      ico("pen", 15),
      h("b", {}, "L'assistant écrit ma page"),
      h("button", { class: "abub-x", type: "button", title: "Fermer", "aria-label": "Fermer", onclick: function () { bubbleOpen(false) } }, "✕")))
    card.appendChild(h("p", { class: "abub-sub" }, "Trois réponses : il écrit le grand titre, la phrase d'en dessous et le bouton."))
    var f1 = h("input", { placeholder: "Ce que vous vendez (robes, gâteaux…)", value: ecrire.activite })
    var f2 = h("input", { placeholder: "Votre ville (Blida)", value: ecrire.ville })
    var f3 = h("input", { placeholder: "Ce qui rassure (paiement à la livraison…)", value: ecrire.atout })
    ;[f1, f2, f3].forEach(function (f) {
      f.addEventListener("keydown", function (e) { if (e.key === "Enter") run() })
      card.appendChild(h("label", { class: "abub-f" }, f))
    })
    var note = h("p", { class: "abub-note" }, "Vous relisez et vous corrigez un mot en cliquant le texte dans la page.")
    note.style.display = ecrire.done ? "block" : "none"
    var btn = h("button", { class: "btn wide pri", type: "button", onclick: function () { run() } }, ecrire.done ? "Réécrire avec ces réponses" : "Écrire ma page")
    card.appendChild(btn)
    card.appendChild(note)
    function run() {
      ecrire.activite = f1.value; ecrire.ville = f2.value; ecrire.atout = f3.value
      if (!f1.value.trim()) return toast("Dites d'abord ce que vous vendez.", "err")
      btn.disabled = true; btn.textContent = "Il écrit…"
      post("/dashboard/studio/ecrire", { activite: f1.value, ville: f2.value, atout: f3.value }).then(function (j) {
        btn.disabled = false; btn.textContent = "Écrire ma page"
        if (!j.ok) return toast(j.error || "Je n'ai pas réussi. Réessayez.", "err")
        var n = F && F.fill ? F.fill(j.plan) : 0
        if (!n) return toast("Rien à écrire ici : ajoutez un bloc, puis réessayez.", "err")
        ecrire.done = true; btn.textContent = "Réécrire avec ces réponses"; note.style.display = "block"
        bubbleOpen(false)
        toast(n > 1 ? "C'est écrit : " + n + " textes. Ctrl+Z pour revenir en arrière." : "C'est écrit. Ctrl+Z pour revenir en arrière.", "ok")
      }).catch(function () { btn.disabled = false; btn.textContent = "Écrire ma page"; toast("Connexion perdue", "err") })
    }
    var pill = h("button", { class: "abub-pill", type: "button", onclick: function () { bubbleOpen(!ecrire.open) } },
      ico("pen", 14), h("span", {}, "L'assistant écrit ma page"))
    wrap.appendChild(card); wrap.appendChild(pill)
    /* dans #st (et pas dans <body>) : la traduction arabe parcourt #st */
    root.appendChild(wrap)
    ecrire.wrap = wrap; ecrire.card = card; ecrire.note = note; ecrire.btn = btn
  }

  function sectionsTab(body) {
    if (!F) return
    var list = sections()
    body.appendChild(h("div", { class: "rail-head" },
      h("div", {}, h("h2", {}, "Les blocs de votre page"), h("span", {}, "Cliquez sur un texte pour le modifier")),
      iconize(h("button", { class: "mini", title: "Tout replier", onclick: function () { sections().forEach(function (s) { openSec.delete(s) }); renderLeft() } }), "collapse", 14)))
    avancement(body)
    var wrap = h("div", { class: "slist" })
    if (!list.length) wrap.appendChild(h("div", { class: "empty-sec" }, "Page vide pour l'instant. Utilise « Ajouter » pour poser un premier bloc."))
    if (!secFirst) { secFirst = true; if (list[0]) openSec.add(list[0]) }
    list.forEach(function (sec, i) { wrap.appendChild(secCard(sec, i, list.length)) })
    wrap.appendChild(h("button", { class: "sec-add", onclick: function () {
      F.select(F.win.document.body); F.insert("sec")
    } }, "+ Ajouter un bloc à ma page"))
    body.appendChild(wrap)
  }

  /* ---------- aide : sept réponses courtes, aucun mot compliqué ---------- */
  var helpOpen = { txt: true }
  var HELP = [
    { id: "txt", q: "Changer un texte",
      steps: ["Cliquez sur le texte, dans la page au milieu.",
        "Tapez votre nouveau texte à gauche, dans la case.",
        "Appuyez sur « Enregistrer », en haut à droite."],
      go: ["Voir ma page", function () { lTab = "sections"; renderLeft() }] },
    { id: "img", q: "Changer une photo",
      steps: ["Cliquez sur la photo, dans la page.",
        "À gauche, appuyez sur la flèche ronde ⟳ (ou sur « Remplacer l'image » à droite).",
        "Choisissez une photo de votre téléphone ou de votre ordinateur, puis « Enregistrer »."] },
    { id: "prix", q: "Changer un prix",
      steps: ["Cliquez sur le prix du produit, dans la page.",
        "Tapez le nouveau prix à droite, puis « Enregistrer ce produit ».",
        "La photo et le stock sont sur la fiche complète : « Photo, description, stock… »."] },
    { id: "lien", q: "Choisir la page où va un bouton",
      steps: ["Cliquez sur le bouton, dans la page.",
        "À droite, « Où va ce bouton ? » : cliquez la page voulue.",
        "Le lien se remplit tout seul — rien à taper."] },
    { id: "add", q: "Ajouter une partie à ma page",
      steps: ["Ouvrez l'onglet « Ajouter ».",
        "Cliquez sur ce que vous voulez poser : un titre, des produits, un formulaire…",
        "La partie arrive en bas de la page. Remontez-la avec « Monter », à droite."],
      go: ["Ajouter", function () { lTab = "add"; renderLeft() }] },
    { id: "style", q: "Changer les couleurs ou la police",
      steps: ["Ouvrez l'onglet « Mon site ».",
        "Cliquez sur une couleur : elle change partout où elle sert.",
        "Pour la police, choisissez-en une autre dans la liste."],
      go: ["Mon site", function () { lTab = "site"; renderLeft() }] },
    { id: "pub", q: "Mettre ma page en ligne",
      steps: ["« Enregistrer » garde votre travail pour vous : personne ne le voit.",
        "« Publier » montre la page à vos clients.",
        "Tant que vous n'avez pas publié, vos clients voient l'ancienne version."] },
    { id: "cmd", q: "Une commande est arrivée",
      steps: ["Ouvrez « Commandes », dans le menu du tableau de bord.",
        "Vous y voyez le nom, le téléphone et l'adresse du client.",
        "Appelez le client pour confirmer, puis marquez la commande comme traitée."] },
    { id: "err", q: "Je me suis trompé",
      steps: ["Ctrl + Z (ou ⌘ + Z sur Mac) annule la dernière action.",
        "« Restaurer le modèle d'origine », dans l'onglet Mon site, remet la page comme au départ.",
        "Attention : cela efface aussi ce que vous avez déjà écrit."] }
  ]

  function helpTab(body) {
    body.appendChild(h("div", { class: "rail-head" },
      h("div", {}, h("h2", {}, "Comment faire"),
        h("span", {}, "Des réponses courtes, sans mots compliqués"))))
    var wrap = h("div", { class: "help" })
    HELP.forEach(function (c) {
      var open2 = !!helpOpen[c.id]
      var card = h("div", { class: "help-card" + (open2 ? " open" : "") })
      card.appendChild(h("button", { class: "help-q", "aria-expanded": open2 ? "true" : "false",
        onclick: function () { helpOpen[c.id] = !helpOpen[c.id]; renderLeft() } },
        h("span", { class: "help-q-t" }, c.q),
        iconize(h("span", { class: "chev" }), "down", 14)))
      if (open2) {
        var ol = h("ol", { class: "help-steps" })
        c.steps.forEach(function (t) { ol.appendChild(h("li", {}, t)) })
        card.appendChild(ol)
        if (c.go) card.appendChild(h("button", { class: "btn sm help-go", onclick: c.go[1] }, c.go[0]))
      }
      wrap.appendChild(card)
    })
    body.appendChild(wrap)

    /* le raccourci « je l'écris en une phrase » reste disponible, plus bas */
    var ta = h("textarea", { rows: 2, placeholder: "ex. mets le titre plus grand et en gras" }), log = h("div", { class: "alog" })
    var go = function () {
      if (!ta.value.trim() || !F) return
      window.StudioAssistant.run(ta.value, F, { autoMobile: autoMobile }).forEach(function (m) { log.insertBefore(h("div", { class: m[0] === "✓" ? "okm" : "nom" }, m), log.firstChild) })
      ta.value = ""; renderRight()
    }
    ta.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go() } }
    /* La phrase libre est comprise en français seulement. En arabe, mieux
       vaut ne pas la proposer que de laisser croire qu'elle marche. */
    if (LANG === "ar") { body.appendChild(log); return }
    body.appendChild(h("h4", { class: "help-h4" }, "Vous préférez écrire ?"))
    body.appendChild(h("p", { class: "hint" }, "Cliquez d'abord sur un texte ou une photo, puis dites en une phrase ce que vous voulez. Exemple : « mets le titre en plus grand »."))
    body.appendChild(ta)
    body.appendChild(h("button", { class: "btn pri wide", onclick: go }, "Le faire pour moi"))
    if (window.StudioAssistant && window.StudioAssistant.examples) {
      body.appendChild(h("div", { class: "chips" }, window.StudioAssistant.examples.map(function (x) {
        return h("button", { onclick: function () { ta.value = x; ta.focus() } }, x)
      })))
    }
    body.appendChild(log)
  }

  /* ---------- panneau gauche ---------- */
  function renderLeft() {
    if (F && F.previewOff) F.previewOff()
    left.innerHTML = ""
    var tabs = [["sections", "Ma page"], ["add", "Ajouter"], ["site", "Mon site"], ["assist", "Aide"]]
    left.appendChild(h("nav", { class: "tabs" }, tabs.map(function (t) {
      return h("button", { class: lTab === t[0] ? "on" : "", onclick: function () { lTab = t[0]; renderLeft() } }, t[1])
    })))
    if (lTab === "sections") { sectionsTab(left); return }
    var body = h("div", { class: "pbody" }); left.appendChild(body)
    if (!F) return
    if (lTab === "add") {
      var inside = h("input", { type: "checkbox", id: "inside" })
      body.appendChild(h("label", { class: "chk" }, inside, "Ajouter à l'intérieur de l'élément sélectionné"))
      var groups = {}
      F.blocks.forEach(function (b) { (groups[b.group] = groups[b.group] || []).push(b) })
      Object.keys(groups).forEach(function (g) {
        body.appendChild(h("h4", {}, g))
        body.appendChild(h("div", { class: "blocks" }, groups[g].map(function (b) {
          return h("button", { class: "blk", onclick: function () { F.insert(b.id, inside.checked) } }, b.label)
        })))
      })
      body.appendChild(h("p", { class: "hint" }, "Sans sélection, le bloc va en bas de la page. Sinon il se place juste après l'élément choisi."))
    } else if (lTab === "assist") {
      helpTab(body)
    } else if (lTab === "layers") {
      var ul = h("ul", { class: "tree" }); body.appendChild(ul)
      var sel = F.selected(); for (var p = sel; p && p !== F.win.document.body; p = p.parentElement) open.add(p.parentElement || p)
      open.add(F.win.document.body); node(ul, F.win.document.body, 0)
    } else {
      siteTab(body)
    }
  }
  function nodeLabel(el) {
    var t = el.tagName.toLowerCase(), txt = ""
    if (!el.children.length) txt = (el.textContent || "").trim().slice(0, 22)
    else if (el.firstElementChild && !el.firstElementChild.children.length && el.children.length === 1) txt = (el.textContent || "").trim().slice(0, 22)
    var c = (el.getAttribute("class") || "").split(/\s+/)[0]
    return t + (el.id ? "#" + el.id : c ? "." + c.slice(0, 14) : "") + (txt ? " · " + txt : "")
  }
  function node(ul, el, depth) {
    if (depth > 40) return
    var kids = [].slice.call(el.children).filter(function (c) { return !/^(SCRIPT|STYLE|LINK|META|NOSCRIPT)$/.test(c.tagName) && !c.hasAttribute("data-studio-ui") && el.tagName !== "SVG" })
    var isOpen = open.has(el), li = h("li", {})
    var row = h("div", { class: "lrow" + (F.selected() === el ? " on" : ""), draggable: el !== F.win.document.body, style: "padding-left:" + (depth * 12 + 4) + "px" },
      h("span", { class: "car", onclick: function (e) { e.stopPropagation(); isOpen ? open.delete(el) : open.add(el); renderLeft() } }, kids.length ? (isOpen ? "▾" : "▸") : "·"),
      h("span", { class: "lab" }, nodeLabel(el)))
    row.onclick = function () { F.select(el); el.scrollIntoView && el.scrollIntoView({ block: "center", behavior: "smooth" }) }
    row.ondragstart = function (e) { e.dataTransfer.setData("text/plain", "x"); window.__drag = el }
    row.ondragover = function (e) { e.preventDefault(); var r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height; row.dataset.z = y < .3 ? "b" : y > .7 ? "a" : "i" }
    row.ondragleave = function () { delete row.dataset.z }
    row.ondrop = function (e) {
      e.preventDefault(); var z = row.dataset.z; delete row.dataset.z
      if (window.__drag) F.moveTo(window.__drag, el, z === "b" ? "before" : z === "a" ? "after" : "inside"); window.__drag = null
    }
    li.appendChild(row); ul.appendChild(li)
    if (isOpen && kids.length) {
      var sub = h("ul", {}); li.appendChild(sub)
      kids.slice(0, 250).forEach(function (c) { node(sub, c, depth + 1) })
    }
  }
  function hex(c) {
    var m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c || ""); if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c : ""
    return "#" + [1, 2, 3].map(function (i) { return ("0" + (+m[i]).toString(16)).slice(-2) }).join("")
  }
  function siteTab(body) {
    /* le partage d'en-tête est calculé à l'enregistrement : si le marchand
       ouvre « Mon site » après avoir modifié sa page, la fiche est encore
       vide. On la redemande une fois, puis on réaffiche. */
    if (!sharedInfo.header && !sharedInfo.footer && !metaFresh) {
      metaFresh = true
      loadMeta().then(function () { if (lTab === "site") renderLeft() })
    }
    var meta = F.getMeta()
    body.appendChild(h("h4", {}, "Page"))
    body.appendChild(fld("Titre de l'onglet", h("input", { value: meta.title, onchange: function () { F.setMeta({ title: this.value, desc: F.getMeta().desc }) } })))
    body.appendChild(fld("Description (Google)", h("textarea", { rows: 3, onchange: function () { F.setMeta({ title: F.getMeta().title, desc: this.value }) } }, meta.desc)))
    body.appendChild(h("h4", {}, "Couleurs du site"))
    body.appendChild(h("p", { class: "hint" }, "Change une couleur, elle change partout où elle est utilisée."))
    var cw = h("div", { class: "sw" }); body.appendChild(cw)
    F.scanColors().forEach(function (c) {
      var hx = hex(c.c); if (!hx) return
      var inp = h("input", { type: "color", value: hx, title: c.c + " · " + c.n + " usages" })
      inp.onchange = function () { F.replaceColor(c.c, inp.value); renderLeft() }
      cw.appendChild(inp)
    })
    /* ---- la couleur des prix ----
       Un seul réglage : le prix est répété sur chaque carte, chaque fiche, le
       panier. Le changer ici le change partout, dans toute la boutique. */
    body.appendChild(h("h4", {}, "Couleur des prix"))
    body.appendChild(h("p", { class: "hint" }, "Le prix apparaît sur chaque produit : une seule couleur pour tous. Elle suit aussi la fiche produit, le panier et la commande."))
    var prixNow = cfg.prix || "#111111"
    var prixPick = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(prixNow) ? prixNow : "#111111" })
    var prixTxt = h("input", { type: "text", value: prixNow, placeholder: "#111111", spellcheck: "false", "aria-label": "Couleur des prix" })
    var prixBox = h("div", { class: "sw prix" }, prixPick, prixTxt,
      h("button", { class: "btn sm", onclick: function () {
        var v = String(prixTxt.value || "").trim()
        if (!/^#[0-9a-f]{6}$/i.test(v)) return toast("Écrivez une couleur comme #b91c1c.", "err")
        post("/dashboard/studio/couleur", { prix: v }).then(function (j) {
          if (!j || !j.ok) return toast((j && j.error) || "Impossible pour l'instant.", "err")
          cfg.prix = j.prix
          toast("Couleur des prix changée partout.", "ok")
          loadFrameSoon()
        })
      } }, "Appliquer"))
    prixPick.oninput = function () { prixTxt.value = prixPick.value }
    body.appendChild(prixBox)
    body.appendChild(h("h4", {}, "Police du site"))
    body.appendChild(h("p", { class: "hint" }, "Une police pour tout le site. L'arabe garde la sienne (choisie plus bas)."))
    var fsel = h("select", {}, [h("option", { value: "" }, "Celle du modèle")].concat(FONTS_SITE.map(function (f) {
      return h("option", { value: f[0], selected: siteFontNow === f[0] }, f[1])
    })))
    fsel.onchange = function () {
      if (!fsel.value) return
      siteFontNow = fsel.value
      F.setSiteFont(fsel.value)
      toast("Police appliquée. Le bouton ↩ en haut annule.", "ok")
    }
    body.appendChild(fld("Choisir", fsel))
    /* ---- menu commun à toutes les pages ----
       Le marchand change son menu une fois : il vaut pour toutes les pages. */
    body.appendChild(h("h4", {}, "Menu de toutes les pages"))
    var hasShared = !!(sharedInfo.header || sharedInfo.footer)
    body.appendChild(h("p", { class: "hint" }, hasShared
      ? "Votre en-tête et votre pied de page sont les mêmes sur toutes les pages. Modifiez-les ici : le changement suit partout."
      : "Cette page n'a pas d'en-tête reconnu. Modifiez le menu de l'accueil : il s'appliquera à toutes les pages."))
    if (hasShared) {
      body.appendChild(h("button", { class: "btn wide", onclick: function () {
        if (!ask("Chaque page retrouvera son propre en-tête ?")) return
        post("/dashboard/studio/shared/off").then(function (j) {
          toast(j && j.ok ? "Chaque page a de nouveau son propre en-tête." : "Impossible pour l'instant.", j && j.ok ? "ok" : "err")
          loadFrameSoon()
        })
      } }, "Séparer les en-têtes"))
    }

    /* ---- la police arabe ----
       Le marchand voit cinq lignes écrites dans cinq polices différentes, puis
       clique. Sa page se recharge derrière : il juge sur son propre site, pas
       sur une image. La police de la plateforme, elle, ne bouge pas. */
    body.appendChild(h("h4", {}, "Police arabe du site"))
    body.appendChild(h("p", { class: "hint" }, "Cinq polices, toutes gratuites et sur votre serveur. Cliquez une ligne : votre site change tout de suite, en arabe seulement."))
    var fWrap = h("div", { class: "arfonts" })
    body.appendChild(fWrap)
    var drawFonts = function (list) {
      fWrap.innerHTML = ""
      list.forEach(function (f) {
        var on = arFont === f.id
        fWrap.appendChild(h("button", {
          class: "arfont" + (on ? " on" : ""), type: "button",
          style: "font-family:'" + f.family + "',serif",
          onclick: function () {
            if (arFont === f.id) return
            post("/dashboard/studio/police", { id: f.id }).then(function (j) {
              if (!j.ok) return toast(j.error || "Impossible pour l'instant", "err")
              arFont = f.id
              drawFonts(list); renderLeft(); loadFrameSoon()
              toast("Police appliquée : " + f.name, "ok")
            })
          },
        },
          h("span", { class: "arfont-n" }, f.name),
          h("span", { class: "arfont-s", dir: "rtl" }, "فساتين وأحذية · ", h("span", { dir: "ltr" }, "4 500"), " دج"),
          h("span", { class: "arfont-d" }, f.fr)))
      })
    }
    if (arFonts) drawFonts(arFonts)
    else fetch("/dashboard/studio/polices").then(function (r) { return r.json() }).then(function (j) {
      if (!j.ok) return
      arFonts = j.fonts; arFont = j.current; if (lTab === "site") drawFonts(arFonts)
    }).catch(function () {})

    body.appendChild(h("h4", {}, "Mobile"))
    body.appendChild(h("button", { class: "btn wide", onclick: function () {
      setDev("m"); setTimeout(function () { var n = F.autoMobile(); toast(n > 0 ? "Adapté au mobile : " + n + " réglages. Ctrl+Z pour annuler." : "Rien à corriger sur mobile.", n > 0 ? "ok" : "") }, 700)
    } }, "Adapter automatiquement au mobile"))
    if (cur === "home") body.appendChild(h("h4", {}, "Modèle"))
    if (cur === "home") body.appendChild(h("button", { class: "btn wide", onclick: function () {
      if (!ask("Revenir au modèle d'origine ? Tes modifications (brouillon et version en ligne) seront perdues.")) return
      post("/dashboard/studio/reset").then(function () { dirty = false; location.reload() })
    } }, "Restaurer le modèle d'origine"))
  }

  /* ---------- inspecteur ---------- */
  function fld(label, ctl) { return h("label", { class: "fld" }, h("span", {}, label), ctl) }
  function cs() { return F.win.getComputedStyle(F.selected()) }
  function normVal(p, v) { v = v.trim(); return PX.test(p) && /^-?\d+(\.\d+)?$/.test(v) ? v + "px" : v }
  function mark(box, p) { box.classList.toggle("set", !!F.own(p)) }
  function tx(label, p, ph) {
    var inp = h("input", { value: F.own(p), placeholder: ph || cs().getPropertyValue(p) })
    var rs = h("button", { class: "x", title: "Retirer", onclick: function (e) { e.preventDefault(); F.setStyle(p, ""); inp.value = ""; mark(box, p) } }, "×")
    var box = h("label", { class: "fld" + (F.own(p) ? " set" : "") }, h("span", {}, label), h("div", { class: "in" }, inp, rs))
    inp.onchange = function () { F.setStyle(p, normVal(p, inp.value)); inp.value = F.own(p); mark(box, p) }
    return box
  }
  function col(label, p) {
    var cur = hex(cs().getPropertyValue(p)), own = F.own(p)
    var pick = h("input", { type: "color", value: hex(own) || cur || "#ffffff" })
    var inp = h("input", { value: own, placeholder: cs().getPropertyValue(p) })
    var rs = h("button", { class: "x", onclick: function (e) { e.preventDefault(); F.setStyle(p, ""); inp.value = ""; mark(box, p) } }, "×")
    var box = h("label", { class: "fld" + (own ? " set" : "") }, h("span", {}, label), h("div", { class: "in" }, pick, inp, rs))
    pick.oninput = function () { F.setStyle(p, pick.value, true); inp.value = pick.value; mark(box, p) }
    pick.onchange = function () { F.commit("Couleur") }
    inp.onchange = function () { F.setStyle(p, inp.value); mark(box, p) }
    return box
  }
  function sel(label, p, opts) {
    var s = h("select", {}, h("option", { value: "" }, "—"), opts.map(function (o) { var a = Array.isArray(o) ? o : [o, o]; return h("option", { value: a[0] }, a[1]) }))
    s.value = F.own(p)
    var box = h("label", { class: "fld" + (F.own(p) ? " set" : "") }, h("span", {}, label), s)
    s.onchange = function () { F.setStyle(p, s.value); mark(box, p) }
    return box
  }
  function seg(label, p, opts) {
    var box = h("div", { class: "fld" + (F.own(p) ? " set" : "") }, h("span", {}, label)), g = h("div", { class: "segs" })
    opts.forEach(function (o) {
      var b = h("button", { class: F.own(p) === o[0] ? "on" : "", title: o[2] || o[0], onclick: function (e) {
        e.preventDefault(); var v = F.own(p) === o[0] ? "" : o[0]; F.setStyle(p, v)
        ;[].forEach.call(g.children, function (x) { x.classList.remove("on") }); if (v) b.classList.add("on"); mark(box, p)
      } }, o[1])
      g.appendChild(b)
    })
    box.appendChild(g); return box
  }
  function quad(title, base) {
    return h("div", { class: "quad" }, h("span", {}, title), h("div", {}, ["top", "right", "bottom", "left"].map(function (s, i) {
      var p = base + "-" + s, inp = h("input", { value: F.own(p), placeholder: ["H", "D", "B", "G"][i], title: s })
      inp.onchange = function () { F.setStyle(p, normVal(p, inp.value)); inp.value = F.own(p) }
      return inp
    })))
  }
  function sect(title, kids, openIt) { var d = h("details", { class: "sect" }, h("summary", {}, title), h("div", { class: "sb" }, kids)); if (openIt) d.open = true; return d }

  function renderRight() {
    right.innerHTML = ""
    var el = F && F.selected()
    if (!el) {
      var go = function (t, fn) { return h("button", { class: "btn sm", onclick: fn }, t) }
      right.appendChild(h("div", { class: "empty" },
        h("b", {}, "Choisissez ce que vous voulez changer"),
        h("p", {}, "Cliquez sur un texte à gauche, ou cliquez directement dessus dans la page. Deux clics sur un texte dans la page et vous écrivez."),
        h("div", { class: "acts" },
          go("Voir ma page", function () { lTab = "sections"; renderLeft() }),
          go("Ajouter un bloc", function () { lTab = "add"; renderLeft() }),
          go("Voir le résultat", function () { preview() }))))
      return
    }
    /* une zone vivante d'une page de la boutique (bouton d'achat, panier,
       formulaire, récapitulatif) : elle ne se réécrit pas dans l'atelier */
    if (el.closest && el.closest("[data-ndz-keep]")) {
      var zone = el.closest("[data-ndz-keep]").getAttribute("data-ndz-keep")
      var quoi = { achat: ["Le bouton d'achat et le prix", "Ils viennent de votre fiche produit : nom, prix, photo, stock. Vous les changez dans « Produits »."],
        panier: ["Le panier", "Il montre les vrais articles du client et calcule le total. Il se remplit tout seul."],
        formulaire: ["Le formulaire de commande", "Nom, téléphone, adresse, paiement à la livraison : il envoie la commande dans votre tableau de bord."],
        commande: ["Le récapitulatif de commande", "Il reprend la commande du client : numéro, total, adresse."] }[zone] || ["Cette partie", "Elle est fabriquée par la plateforme."]
      right.appendChild(h("div", { class: "crumbs" }, h("button", { class: "on" }, "Zone protégée")))
      var kbody = h("div", { class: "pbody" })
      kbody.appendChild(h("h4", {}, quoi[0]))
      kbody.appendChild(h("p", { class: "hint" }, quoi[1]))
      kbody.appendChild(h("p", { class: "hint" }, "Vous pouvez écrire tout autour : ajouter un bloc au-dessus ou en dessous, changer les couleurs, les titres. Cette partie-là reste en place."))
      kbody.appendChild(h("div", { class: "acts" },
        h("button", { class: "btn sm", onclick: function () { preview() } }, "Voir la vraie page")))
      right.appendChild(kbody)
      return
    }
    /* un produit de la grille : panneau dédié, sans les onglets de style */
    if (el.closest && el.closest('[data-ndz="produits"]')) {
      var pv = F.produit(el)
      right.appendChild(h("div", { class: "crumbs" }, h("button", { class: "on" }, pv ? "Produit" : "Les produits")))
      var pbody = h("div", { class: "pbody" }); right.appendChild(pbody)
      rTab = "content"; produitPanel(pbody, el)
      return
    }
    var chain = [], p = el
    for (var i = 0; p && i < 4; i++, p = p.parentElement) chain.unshift(p)
    var mots = { h1: "Titre", h2: "Titre", h3: "Titre", h4: "Titre", p: "Texte", span: "Texte", a: "Bouton", button: "Bouton", img: "Photo", section: "Partie de la page", div: "", ul: "Liste", li: "Ligne", body: "Page" }
    /* pas de « Bloc › Bloc › Bloc » : on garde les noms utiles, sans doublon */
    var vus = {}, fil = []
    chain.forEach(function (c) {
      var t = c.tagName.toLowerCase(), nom = mots[t]
      if (!nom || vus[nom]) return
      vus[nom] = 1; fil.push(h("button", { class: c === el ? "on" : "", title: "Sélectionner", onclick: function () { F.select(c) } }, nom))
    })
    if (fil.length > 1) right.appendChild(h("div", { class: "crumbs" }, fil))
    var tabs = [["content", "Contenu"], ["style", "Apparence"]]
    right.appendChild(h("nav", { class: "tabs" }, tabs.map(function (t) {
      return h("button", { class: rTab === t[0] ? "on" : "", onclick: function () { rTab = t[0]; renderRight() } }, t[1])
    })))
    if (dev !== "d") right.appendChild(h("div", { class: "devnote" }, "Les styles s'appliquent à " + (dev === "t" ? "la tablette et plus petit" : "le mobile") + " seulement."))
    var body = h("div", { class: "pbody" }); right.appendChild(body)
    ;({ content: contentTab, style: styleTab })[rTab](body, el)
  }

  function actions(el) {
    var b = function (t, fn, cls) { return h("button", { class: "btn sm " + (cls || ""), onclick: fn }, t) }
    return h("div", { class: "acts" }, b("Dupliquer", function () { F.dup() }), b("Monter", function () { F.move("up") }), b("Descendre", function () { F.move("down") }), b("Supprimer", function () { F.del() }, "danger"))
  }
  function contentTab(body, el) {
    var t = el.tagName
    /* dans une boutique, la grille « Nos produits » vient de la base : elle a
       son propre panneau (nom + prix), sinon cliquer un prix ne faisait rien */
    if (el.closest && el.closest('[data-ndz="produits"]')) { produitPanel(body, el); return }
    body.appendChild(actions(el))
    if (t !== "BODY") body.appendChild(fld("Taille du texte", (function () {
      var s = h("select", {}, [["h1", "Très grand titre"], ["h2", "Grand titre"], ["h3", "Titre"], ["h4", "Petit titre"], ["p", "Texte normal"]].map(function (x) { return h("option", { value: x[0] }, x[1]) }))
      var cur = t.toLowerCase()
      if (!s.querySelector('[value="' + cur + '"]')) { s.value = "p"; s.disabled = true } else s.value = cur
      s.onchange = function () { F.setTag(s.value) }; return s
    })()))
    var txt = F.getText()
    if (txt !== null) body.appendChild(fld("Texte", h("textarea", { rows: 4, onchange: function () { F.setText(this.value) } }, txt)))
    else if (F.editable(el) === false && t !== "IMG" && t !== "BODY") body.appendChild(h("p", { class: "hint" }, "Ici il y a plusieurs textes : cliquez sur celui que vous voulez changer, directement dans la page."))
    if (t === "A" || el.closest("a")) {
      var a = t === "A" ? el : el.closest("a")
      if (a !== el) body.appendChild(h("p", { class: "hint" }, "Cet élément est dans un lien : sélectionne le lien (↖) pour changer l'adresse."))
      else {
        /* le champ n'était jamais affiché : le marchand ne voyait pas (et ne
           pouvait pas corriger) l'adresse de son bouton. Il est maintenant
           sous la liste des pages, et c'est lui qui fait foi. */
        var href = h("input", { value: a.getAttribute("href") || "", placeholder: "/ma-boutique/page/a-propos", spellcheck: "false" })
        href.onchange = function () {
          var v = String(this.value || "").trim()
          if (v && !/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(v)) { this.value = a.getAttribute("href") || ""; return toast("Une adresse commence par /page, https://… ou #.", "err") }
          F.setAttr("href", v); toast("Lien changé.", "ok")
        }
        body.appendChild(h("h4", {}, "Où va ce bouton ?"))
        body.appendChild(h("p", { class: "hint" }, "Choisissez la page : le lien se remplit tout seul, rien à taper."))
        body.appendChild(lienListe(a, function () { toast("Lien posé.", "ok"); renderRight() }))
        body.appendChild(fld("Adresse du lien", href))
        var mode = h("select", {}, [["", "Ouvrir le lien"], ["direct", "Acheter maintenant"], ["cart", "Ajouter au panier"]].map(function (o) { return h("option", { value: o[0] }, o[1]) }))
        var pid = h("select", {}, h("option", { value: "" }, "Produit…"), products.map(function (p) { return h("option", { value: String(p.id) }, p.title) }))
        mode.value = el.getAttribute("data-ndz-buy") || ""; pid.value = el.getAttribute("data-ndz-pid") || ""
        var apply = function () {
          F.setAttr("data-ndz-buy", mode.value); F.setAttr("data-ndz-pid", mode.value ? pid.value : "")
          /* chèque : sans action d'achat, on ne touche pas à l'adresse choisie
             dans la liste des pages (avant, elle était écrasée et le bouton
             renvoyait nulle part). */
          if (mode.value && pid.value) F.setAttr("href", "/" + cfg.slug + "/p/" + pid.value)
          href.value = a.getAttribute("href") || ""
        }
        mode.onchange = apply; pid.onchange = apply
        body.appendChild(h("h4", {}, "Action du bouton")); body.appendChild(mode); body.appendChild(h("div", { style: "height:6px" })); body.appendChild(pid)
        if (!products.length) body.appendChild(h("p", { class: "hint" }, "Ajoute d'abord des produits pour les relier à un bouton."))
        body.appendChild(h("label", { class: "chk" }, h("input", { type: "checkbox", checked: el.getAttribute("target") === "_blank", onchange: function () { F.setAttr("target", this.checked ? "_blank" : ""); F.setAttr("rel", this.checked ? "noopener" : "") } }), "Ouvrir dans un nouvel onglet"))
      }
    } else if (t !== "BODY") body.appendChild(h("button", { class: "btn sm wide", onclick: function () { F.wrapLink("#") } }, "Transformer en lien"))
    if (el.hasAttribute("data-ndz-video")) {
      var yt = h("input", { value: el.getAttribute("data-ndz-video") ? "https://youtu.be/" + el.getAttribute("data-ndz-video") : "", placeholder: "https://www.youtube.com/watch?v=…" })
      yt.onchange = function () {
        var m = /(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(yt.value) || /^([\w-]{11})$/.exec(yt.value.trim())
        if (!m) return toast("Lien YouTube non reconnu.", "err")
        F.setAttr("data-ndz-video", m[1]); toast("Vidéo ajoutée. Elle s'affiche dans l'aperçu.", "ok")
      }
      body.appendChild(h("h4", {}, "Vidéo")); body.appendChild(fld("Lien YouTube", yt))
    }
    if (t === "IMG") {
      body.appendChild(h("img", { class: "prev", src: el.currentSrc || el.src }))
      body.appendChild(h("button", { class: "btn pri wide", onclick: function () { pickImage(function (u) { F.setAttr("src", u); renderRight() }) } }, "Remplacer l'image"))
      var alt = h("input", { value: el.getAttribute("alt") || "" }); alt.onchange = function () { F.setAttr("alt", alt.value) }
      body.appendChild(fld("Texte alternatif", alt))
    } else if (t !== "BODY" || true) {
      var bg = F.own("background-image")
      body.appendChild(h("h4", {}, "Image de fond"))
      body.appendChild(h("div", { class: "acts" },
        h("button", { class: "btn sm", onclick: function () { pickImage(function (u) { F.setStyle("background-image", "url(" + u + ")"); F.setStyle("background-size", F.own("background-size") || "cover"); F.setStyle("background-position", "center"); renderRight() }) } }, bg ? "Changer" : "Choisir une image"),
        bg ? h("button", { class: "btn sm", onclick: function () { F.setStyle("background-image", ""); renderRight() } }, "Retirer") : null))
    }
  }

  var SHADOWS = [["none", "Aucune"], ["0 2px 8px rgba(0,0,0,.12)", "Douce"], ["0 8px 24px rgba(0,0,0,.18)", "Moyenne"], ["0 18px 48px rgba(0,0,0,.28)", "Forte"]]
  var BTN_P = [["Plein noir", { "background-color": "#111111", color: "#ffffff", "border-radius": "999px", padding: "14px 28px", "border-width": "0" }], ["Plein rouge", { "background-color": "#e11d48", color: "#ffffff", "border-radius": "999px", padding: "14px 28px", "border-width": "0" }], ["Contour", { "background-color": "transparent", color: "#111111", "border-style": "solid", "border-width": "2px", "border-color": "#111111", "border-radius": "999px", padding: "12px 26px" }], ["Doux", { "background-color": "#f1f0f6", color: "#111111", "border-radius": "12px", padding: "14px 24px", "border-width": "0" }], ["Carré", { "border-radius": "0" }]]
  var TXT_P = [["Titre XL", { "font-size": "64px", "font-weight": "800", "line-height": "1.05" }], ["Titre", { "font-size": "40px", "font-weight": "700", "line-height": "1.15" }], ["Sous-titre", { "font-size": "22px", "font-weight": "500", "line-height": "1.4" }], ["Texte", { "font-size": "17px", "font-weight": "400", "line-height": "1.6" }], ["Petit", { "font-size": "13px", "font-weight": "400", "line-height": "1.4" }]]
  var CARD_P = [["Carte ombre", { "background-color": "#ffffff", "border-radius": "16px", "box-shadow": "0 8px 24px rgba(0,0,0,.14)", padding: "24px" }], ["Carte bordure", { "background-color": "#ffffff", "border-style": "solid", "border-width": "1px", "border-color": "#e5e4ea", "border-radius": "16px", padding: "24px" }], ["Fond doux", { "background-color": "#f5f4f8", "border-radius": "16px", padding: "24px" }], ["Sombre", { "background-color": "#14131a", color: "#ffffff", "border-radius": "16px", padding: "24px" }]]
  function attrSel(label, name, opts, el) {
    var s = h("select", {}, opts.map(function (o) { return h("option", { value: o[0] }, o[1]) })); s.value = el.getAttribute(name) || ""
    s.onchange = function () { F.setAttr(name, s.value) }; return fld(label, s)
  }
  function animSect(el) {
    var d = h("input", { type: "number", min: 0, max: 3000, step: 100, value: el.getAttribute("data-fx-d") || "", placeholder: "0" }); d.onchange = function () { F.setAttr("data-fx-d", d.value) }
    return sect("Animation", [
      attrSel("À l'apparition", "data-fx", [["", "Aucune"], ["up", "Monte"], ["fade", "Fondu"], ["left", "Depuis la gauche"], ["right", "Depuis la droite"], ["zoom", "Zoom"]], el),
      fld("Délai (ms)", d),
      attrSel("Au survol", "data-fx-hover", [["", "Aucun"], ["lift", "Soulève"], ["zoom", "Zoom"], ["glow", "Lueur"]], el),
      h("p", { class: "hint" }, "Les animations se voient dans « Aperçu » (pas dans le studio)."),
    ], false)
  }
  function simpleStyle(body, el) {
    var t = el.tagName, isBtn = t === "A" || t === "BUTTON", isTxt = /^(H[1-6]|P|SPAN|LI|BLOCKQUOTE|LABEL|A|BUTTON)$/.test(t)
    var pre = isBtn ? BTN_P : isTxt ? TXT_P : CARD_P
    body.appendChild(h("h4", {}, isBtn ? "Style de bouton" : isTxt ? "Style de texte" : "Style de bloc"))
    body.appendChild(h("div", { class: "chips" }, pre.map(function (x) { return h("button", { onclick: function () { F.setStyles(x[1]); renderRight() } }, x[0]) })))
    var items = []
    if (isTxt) items.push(tx("Taille du texte", "font-size"), col("Couleur du texte", "color"), sel("Graisse", "font-weight", [["400", "Normal"], ["600", "Semi-gras"], ["700", "Gras"], ["800", "Très gras"]]), seg("Alignement", "text-align", [["left", "⇤", "Gauche"], ["center", "≡", "Centre"], ["right", "⇥", "Droite"]]))
    items.push(col("Couleur de fond", "background-color"), tx("Arrondi", "border-radius"), tx("Marge interne", "padding"))
    body.appendChild(h("div", { style: "margin-top:12px" }, items))
    body.appendChild(animSect(el))
    body.appendChild(h("div", { class: "acts" },
      h("button", { class: "btn sm", onclick: function () { F.setStyle("display", F.own("display") === "none" ? "" : "none"); renderRight() } }, F.own("display") === "none" ? "Réafficher ici" : "Masquer sur cet appareil"),
      h("button", { class: "btn sm", onclick: function () { simple = false; renderRight() } }, "Tous les réglages ▸")))
  }
  function styleTab(body, el) {
    if (simple) return simpleStyle(body, el)
    body.appendChild(h("button", { class: "btn sm", style: "margin-bottom:8px", onclick: function () { simple = true; renderRight() } }, "◂ Mode simple"))
    body.appendChild(animSect(el))
    body.appendChild(sect("Texte", [
      (function () {
        var s = h("select", {}, h("option", { value: "" }, "—"), FONTS.map(function (n) { return h("option", { value: n }, n) }))
        var own = (F.own("font-family") || "").split(",")[0].replace(/['"]/g, ""); s.value = FONTS.indexOf(own) >= 0 ? own : ""
        s.onchange = function () { F.setStyle("font-family", s.value ? "'" + s.value + "',system-ui,sans-serif" : "") }
        return fld("Police", s)
      })(),
      tx("Taille", "font-size"), sel("Graisse", "font-weight", [["300", "Fin"], ["400", "Normal"], ["500", "Moyen"], ["600", "Semi-gras"], ["700", "Gras"], ["800", "Très gras"], ["900", "Noir"]]),
      col("Couleur", "color"),
      seg("Alignement", "text-align", [["left", "⇤", "Gauche"], ["center", "≡", "Centre"], ["right", "⇥", "Droite"], ["justify", "☰", "Justifié"]]),
      tx("Interligne", "line-height"), tx("Espacement lettres", "letter-spacing"),
      seg("Casse", "text-transform", [["none", "Aa"], ["uppercase", "AA"], ["capitalize", "Ab"]]),
      seg("Style", "font-style", [["italic", "I", "Italique"], ["normal", "N"]]),
      seg("Soulignement", "text-decoration", [["underline", "S", "Souligné"], ["none", "∅"]]),
    ], true))
    body.appendChild(sect("Fond", [
      col("Couleur de fond", "background-color"),
      seg("Image de fond", "background-size", [["cover", "Remplir"], ["contain", "Contenir"], ["auto", "Auto"]]),
      tx("Opacité (0 à 1)", "opacity"),
    ], true))
    body.appendChild(sect("Espacement", [quad("Marge interne", "padding"), quad("Marge externe", "margin")], false))
    body.appendChild(sect("Taille", [tx("Largeur", "width"), tx("Hauteur", "height"), tx("Hauteur min.", "min-height"), tx("Largeur max.", "max-width"), sel("Ajustement image", "object-fit", ["cover", "contain", "fill", "none"])], false))
    body.appendChild(sect("Bordure et ombre", [
      tx("Arrondi", "border-radius"), tx("Épaisseur", "border-width"), sel("Style", "border-style", ["none", "solid", "dashed", "dotted"]), col("Couleur", "border-color"), sel("Ombre", "box-shadow", SHADOWS),
    ], false))
    body.appendChild(sect("Disposition", [
      sel("Affichage", "display", [["block", "Bloc"], ["flex", "Flex"], ["grid", "Grille"], ["inline-block", "En ligne"], ["none", "Masqué"]]),
      seg("Sens", "flex-direction", [["row", "→", "Ligne"], ["column", "↓", "Colonne"]]), seg("Retour à la ligne", "flex-wrap", [["wrap", "Oui"], ["nowrap", "Non"]]),
      sel("Alignement horizontal", "justify-content", [["flex-start", "Début"], ["center", "Centre"], ["flex-end", "Fin"], ["space-between", "Espacé"], ["space-around", "Réparti"]]),
      sel("Alignement vertical", "align-items", [["flex-start", "Haut"], ["center", "Centre"], ["flex-end", "Bas"], ["stretch", "Étiré"]]),
      tx("Écart", "gap"), tx("Colonnes (grille)", "grid-template-columns", "repeat(3, 1fr)"),
    ], false))
    body.appendChild(sect("Position", [
      sel("Position", "position", ["static", "relative", "absolute", "fixed", "sticky"]), tx("Haut", "top"), tx("Gauche", "left"), tx("Profondeur (z-index)", "z-index"),
      sel("Débordement", "overflow", ["visible", "hidden", "auto"]), tx("Transformation", "transform", "rotate(3deg)"),
    ], false))
    body.appendChild(h("div", { class: "acts" },
      h("button", { class: "btn sm", onclick: function () { F.setStyle("display", F.own("display") === "none" ? "" : "none"); renderRight() } }, F.own("display") === "none" ? "Réafficher ici" : "Masquer sur cet appareil"),
      h("button", { class: "btn sm", onclick: function () { F.clearStyles(); renderRight() } }, "Réinitialiser les styles")))
  }
  /* ---------- aide ---------- */
  function help() {
    var rows = [["Ctrl + S", "Enregistrer le brouillon"], ["Ctrl + Z", "Annuler"], ["Ctrl + Y", "Rétablir"],
      ["Échap", "Désélectionner"], ["Suppr", "Supprimer l'élément sélectionné"], ["Double-clic", "Modifier le texte"]]
    var modal = h("div", { class: "ipick", role: "dialog", "aria-label": "Raccourcis" },
      h("div", { class: "ipick-in" },
        h("h4", {}, "Raccourcis"),
        h("div", { class: "help-rows" }, rows.map(function (r) { return h("div", { class: "help-row" }, h("kbd", {}, r[0]), h("span", {}, r[1])) })),
        h("div", { class: "ipick-foot" }, h("button", { class: "btn pri", onclick: function () { modal.remove() } }, "Compris"))))
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove() })
    document.body.appendChild(modal)
  }

  /* ---------- démarrage ---------- */
  function init() {
    try { F = frameEl.contentWindow.StudioFrame } catch (_) { F = null }
    if (!F) return toast("Le studio n'a pas pu charger la page.", "err")
    F.on.insert = showInserted
    F.on.select = function () { renderRight(); if (!typing && (lTab === "sections" || lTab === "layers")) renderLeft() }
    F.on.change = function (l) { changed(); if (!typing && (lTab === "sections" || lTab === "layers")) renderLeft() }
    F.on.save = save
    F.setDevice(dev); fit(); renderLeft(); renderRight(); loadMeta().then(function () { renderRight() })
    bUndo.disabled = true; bRedo.disabled = true
    assistantBubble()
    setStatus(isShopPage(cur) ? "Cette page est déjà en ligne" : cfg.unpublished === "1" ? "Brouillon non publié" : cfg.published === "1" ? "En ligne" : "Pas encore publié")
  }
  frameEl.addEventListener("load", init)
  fit(); renderLeft(); renderRight(); renderPages()

  /* ---------- arabe : on traduit après chaque affichage ----------
     Un observateur plutôt que cinquante appels : le Studio se redessine
     souvent (chaque clic), et une seule traduction ratée laisserait un mot
     français au milieu de la phrase arabe. */
  if (AR) {
    var pending = false
    var obs = new MutationObserver(function () {
      if (pending) return
      pending = true
      requestAnimationFrame(function () { pending = false; translateUi() })
    })
    obs.observe(document.body, { childList: true, subtree: true, characterData: true })
    translateUi()
  }
})()
