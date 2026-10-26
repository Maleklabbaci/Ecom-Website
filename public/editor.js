"use strict"
/* Éditeur de thème NovaDZ — façon Shopify :
   barre du haut (appareil, annuler/rétablir, enregistrement), rail gauche
   (sections + blocs + réglages), aperçu cliquable à droite.
   Données fournies par le serveur dans window.ED_DATA. */
;(function () {
  var D = window.ED_DATA || {}
  var TYPES = D.types || []
  var FIELDS = D.fields || {}
  var BLOCKS = D.blocks || {}
  var PRODUCTS = D.products || []
  var STORE_PAGES = D.pages || []
  var SLUG = D.slug || ""

  var SECTIONS_BY_PAGE = D.sectionsByPage || { home: D.sections || [] }
  function normalizeMap(map) {
    var out = {}
    Object.keys(map || {}).forEach(function (k) { out[k] = normalize(map[k]) })
    return out
  }
  var stateMap = normalizeMap(SECTIONS_BY_PAGE)
  function bindPage(key) {
    if (!stateMap[key]) stateMap[key] = []
    state = stateMap[key]
  }
  function syncPage() { stateMap[CURRENT_PAGE] = state }
  var state = []
  var design = Object.assign({
    button: "noir", radius: "normal", radiusPx: 12, footerNote: "", showNovadz: true, logo: "",
    logoSize: 28, font: "inter", scale: 1, textScale: 1, tracking: "normal", weight: "600",
    footerStyle: "theme", footerBrand: "", footerCols: [],
    accent: "#111111", bg: "#FFFFFF", ink: "#111111", headBg: "", headInk: "", footBg: "", footInk: "",
    headStyle: "plein", headHeight: "normale", headAlign: "gauche", containerWidth: 1240,
    cartMode: "deux", payDirect: false, customCss: "", htmlHead: "", htmlFooter: "", pageCss: {}, hide: {}, dict: [],
    textAlign: "def", searchAlign: "droite", searchPlace: "entete",
    showLogo: true, showName: true, heroLogo: true, heroAlign: "def", variantStyle: "boutons",
    mobileOrder: [], textSizes: [],
  }, D.design || {})
  design.textSizes = Array.isArray(design.textSizes) ? design.textSizes : []
  design.pageCss = design.pageCss || {}
  design.pageCode = design.pageCode && typeof design.pageCode === "object" ? design.pageCode : {}
  design.hide = design.hide || {}
  design.dict = Array.isArray(design.dict) ? design.dict : []
  design.footerCols = Array.isArray(design.footerCols) ? design.footerCols : []
  var TAB = "sections"
  try {
    if (/[?&](trial|reglages)=1/.test(location.search || "")) TAB = "theme"
  } catch (eTab) {}
  var PREVIEWS = (window.ED_DATA && window.ED_DATA.previewPages) || []
  var CURRENT_PAGE = PREVIEWS.length ? PREVIEWS[0].key : "home"
  bindPage(CURRENT_PAGE)
  design.mobileOrder = (design.mobileOrder || []).slice()
  var selected = null
  var openModal = false
  var saveTimer = null
  var past = []
  var future = []
  var dragId = null

  var $ = function (id) { return document.getElementById(id) }

  /* téléphone : le panneau de réglages se replie pour voir l'aperçu en entier */
  ;(function railToggle() {
    var app = document.querySelector(".ed-app")
    var btn = $("edRailToggle")
    if (!app || !btn) return
    btn.addEventListener("click", function () {
      var off = app.classList.toggle("rail-off")
      btn.setAttribute("aria-pressed", off ? "false" : "true")
    })
    if (window.matchMedia("(max-width: 760px)").matches) {
      app.classList.add("rail-off")
      btn.setAttribute("aria-pressed", "false")
    }
  })()
  var rail = $("edRail")
  var frame = $("edFrame")
  var saveState = $("edSave")

  /* ------------------------------- utils ------------------------------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    })
  }
  function uid(p) { return (p || "s") + Math.random().toString(36).slice(2, 8) }
  function typeOf(t) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === t) return TYPES[i]
    return { id: t, name: t, desc: "" }
  }
  function normalize(arr) {
    if (!Array.isArray(arr)) return []
    return arr.filter(function (s) { return s && s.type }).map(function (s) {
      return {
        id: s.id || uid(),
        type: s.type,
        hidden: !!s.hidden,
        align: s.align || "",
        pad: s.pad == null ? null : s.pad,
        tsize: s.tsize == null ? null : s.tsize,
        wide: s.wide || "",
        imgH: s.imgH == null ? null : s.imgH,
        settings: s.settings || {},
        blocks: Array.isArray(s.blocks) ? s.blocks.map(function (b) { return { id: b.id || uid("b"), settings: b.settings || {} } }) : [],
      }
    })
  }
  function snapshot() {
    return JSON.stringify({ sections: state, design: design })
  }
  function push() {
    past.push(snapshot())
    if (past.length > 60) past.shift()
    future.length = 0
    syncUndo()
  }
  function syncUndo() {
    $("edUndo").disabled = !past.length
    $("edRedo").disabled = !future.length
  }
  function apply(str) {
    var o = JSON.parse(str)
    if (o.sections && !Array.isArray(o.sections) && typeof o.sections === "object") {
      stateMap = normalizeMap(o.sections)
      bindPage(CURRENT_PAGE)
    } else {
      stateMap.home = normalize(o.sections)
      bindPage(CURRENT_PAGE)
    }
    design = Object.assign(design, o.design || {})
    renderRail()
    syncFields()
    save()
  }

  /* ------------------------------ rendu rail ------------------------------ */
  function fieldHtml(scope, ownerKey, f, value) {
    var common = 'data-scope="' + scope + '" data-owner="' + ownerKey + '" data-key="' + f.key + '"'
    var id = scope + "-" + ownerKey + "-" + f.key
    if (f.type === "textarea") {
      return '<label class="ed-f">' + esc(f.label) +
        '<textarea rows="3" ' + common + ' placeholder="' + esc(f.placeholder || "") + '">' + esc(value || "") + "</textarea></label>"
    }
    if (f.type === "select") {
      return '<label class="ed-f">' + esc(f.label) + '<select ' + common + ">" +
        (f.options || []).map(function (o) {
          var ov = typeof o === "object" ? o.value : o
          var ol = typeof o === "object" ? o.label : o
          return '<option value="' + esc(ov) + '"' + (String(value) === String(ov) ? " selected" : "") + ">" + esc(ol) + "</option>"
        }).join("") + "</select></label>"
    }
    if (f.type === "number") {
      return '<label class="ed-f">' + esc(f.label) + '<input type="number" min="0" ' + common + ' value="' + esc(value == null ? "" : value) + '"></label>'
    }
    if (f.type === "checkbox") {
      return '<label class="ed-check"><input type="checkbox" ' + common + (value ? " checked" : "") + "> " + esc(f.label) + "</label>"
    }
    if (f.type === "image") {
      return '<div class="ed-img"><div class="ed-imgbox">' +
        (value ? '<img src="' + esc(value) + '" alt="">' : "<span>Aucune image</span>") + "</div>" +
        '<div class="ed-imgside"><label class="ed-file">Choisir une image<input type="file" accept="image/*" data-img="' + scope + "|" + ownerKey + "|" + f.key + '"></label>' +
        (value ? '<button type="button" class="ed-link" data-imgclear="' + scope + "|" + ownerKey + "|" + f.key + '">Retirer</button>' : "") +
        '<span class="ed-hint">PNG / JPG / WebP, 2,5 Mo max.</span></div></div>'
    }
    if (f.type === "product") {
      return '<label class="ed-f">' + esc(f.label) + '<select ' + common + ">" +
        '<option value="0">— Premier produit —</option>' +
        PRODUCTS.map(function (p) {
          return '<option value="' + p.id + '"' + (String(value) === String(p.id) ? " selected" : "") + ">" + esc(p.title) + "</option>"
        }).join("") + "</select></label>"
    }
    if (f.type === "products") {
      var picked = String(value || "").split(",").filter(Boolean)
      if (!PRODUCTS.length) return "<p class=\"ed-hint\">Ajoute d'abord des produits.</p>"
      return '<div class="ed-prods"><b>' + esc(f.label) + '</b>' + PRODUCTS.map(function (p) {
        var on = picked.indexOf(String(p.id)) !== -1
        return '<label class="ed-check"><input type="checkbox" data-prod="' + p.id + '" data-owner="' + ownerKey + '"' + (on ? " checked" : "") + "> " + esc(p.title) + "</label>"
      }).join("") + '<p class="ed-hint2">Seuls les produits cochés défilent. Tout décocher laisse le carrousel vide.</p></div>'
    }
    return '<label class="ed-f">' + esc(f.label) + '<input type="text" ' + common + ' value="' + esc(value || "") +
      '" placeholder="' + esc(f.placeholder || "") + '"></label>'
  }

  function sizeRow(s) {
    var pads = [["", "Auto"], ["0", "Aucun"], ["12", "12 px"], ["24", "24 px"], ["40", "40 px"], ["64", "64 px"], ["96", "96 px"]]
    var tsz = [["", "Auto"], ["0.8", "Petit"], ["1", "Normal"], ["1.25", "Grand"], ["1.5", "Très grand"]]
    var wds = [["", "Auto"], ["etroite", "Étroite"], ["large", "Large"], ["pleine", "Pleine largeur"]]
    var imh = [["", "Auto"], ["180", "180 px"], ["260", "260 px"], ["360", "360 px"], ["480", "480 px"], ["620", "620 px"]]
    function opts(list, val) {
      return list.map(function (o) {
        return '<option value="' + o[0] + '"' + (String(s[val] == null ? "" : s[val]) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"
      }).join("")
    }
    return '<div class="ed-sizegrid">' +
      '<label>Espacement haut/bas<select data-secprop="pad" data-secid="' + s.id + '">' + opts(pads, "pad") + "</select></label>" +
      '<label>Taille du titre<select data-secprop="tsize" data-secid="' + s.id + '">' + opts(tsz, "tsize") + "</select></label>" +
      '<label class="wide">Largeur du contenu<select data-secprop="wide" data-secid="' + s.id + '">' + opts(wds, "wide") + "</select></label>" +
      '<label class="wide">Hauteur du visuel<select data-secprop="imgH" data-secid="' + s.id + '">' + opts(imh, "imgH") + "</select></label>" +
      ((s.type === "grid" || s.type === "cats")
        ? '<label class="wide">Colonnes (ordinateur)<select data-secprop="cols" data-secid="' + s.id + '">' +
          opts([["", "Thème"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]], "cols") + "</select></label>"
        : "") +
      "</div>"
  }

  function alignRow(s) {
    var opts = [["", "Thème"], ["gauche", "Gauche"], ["centre", "Centre"], ["droite", "Droite"]]
    return '<div class="ed-alignrow"><span>Alignement</span><div class="ed-seg" data-alignsec="' + s.id + '">' +
      opts.map(function (o) {
        var on = (s.align || "") === o[0] ? " on" : ""
        return '<button type="button" class="' + on.trim() + '" data-alval="' + o[0] + '">' + o[1] + "</button>"
      }).join("") + "</div></div>"
  }

  function sectionFields(s) {
    var defs = FIELDS[s.type] || []
    return alignRow(s) + sizeRow(s) + defs.map(function (f) { return fieldHtml("section", s.id, f, s.settings[f.key]) }).join("")
  }

  function blocksHtml(s) {
    var def = BLOCKS[s.type]
    if (!def) return ""
    var count = (s.blocks || []).length
    return '<div class="ed-blocks"><div class="ed-blocks-head"><b>' + esc(def.name) + "s</b><span>" + count + "/" + def.max + "</span></div>" +
      (s.blocks || []).map(function (b, i) {
        return '<div class="ed-block" draggable="true" data-block="' + b.id + '" data-parent="' + s.id + '">' +
          '<div class="ed-block-head"><span class="ed-grip">⋮⋮</span><b>Bloc ' + (i + 1) + "</b>" +
          '<button type="button" class="ed-x" data-delblock="' + b.id + '" data-parent="' + s.id + '">Supprimer</button></div>' +
          '<div class="ed-block-body">' +
          def.fields.map(function (f) { return fieldHtml("block", b.id, f, b.settings[f.key]) }).join("") +
          "</div></div>"
      }).join("") +
      (count < def.max ? '<button type="button" class="ed-addblock" data-addblock="' + s.id + '">+ Ajouter ' + esc(def.name.toLowerCase()) + "</button>" : "") +
      "</div>"
  }

  function renderRail() {
    var html = state.map(function (s, i) {
      var t = typeOf(s.type)
      var open = selected === s.id
      return '<div class="ed-card' + (open ? " open" : "") + (s.hidden ? " off" : "") + '" data-id="' + s.id + '" draggable="true">' +
        '<div class="ed-card-head">' +
        '<span class="ed-grip" title="Glisser pour déplacer">⋮⋮</span>' +
        '<button type="button" class="ed-card-title" data-select="' + s.id + '">' + esc(t.name) + "</button>" +
        '<button type="button" class="ed-eye" data-hide="' + s.id + '" title="' + (s.hidden ? "Afficher" : "Masquer") + '">' + (s.hidden ? "◌" : "◉") + "</button>" +
        '<button type="button" class="ed-eye" data-dup="' + s.id + '" title="Dupliquer">⧉</button>' +
        '<button type="button" class="ed-eye danger" data-del="' + s.id + '" title="Supprimer">✕</button>' +
        "</div>" +
        (open ? '<div class="ed-card-body">' + sectionFields(s) + blocksHtml(s) + "</div>" : "") +
        "</div>"
    }).join("")

    rail.innerHTML = html +
      '<button type="button" class="ed-addsection" id="edAddSection">+ Ajouter une section</button>' +
      globalPanel()
    syncUndo()
    var mob = $("edMobile")
    if (mob) mob.innerHTML = mobileHtml()
  }

  /* =============================== ONGLETS =============================== */
  var TABS = [
    ["sections", "Sections"],
    ["head", "En-tête"],
    ["theme", "Paramètres"],
    ["pages", "Pages"],
    ["code", "Code"],
    ["texts", "Textes"],
  ]

  function tabsBar() {
    return '<div class="ed-tabs" role="tablist">' + TABS.map(function (t) {
      return '<button type="button" role="tab" class="ed-tab' + (TAB === t[0] ? " on" : "") +
        '" data-tab="' + t[0] + '" aria-selected="' + (TAB === t[0]) + '">' + t[1] + "</button>"
    }).join("") + "</div>"
  }

  function chipRow(key, value, options) {
    return '<div class="ed-chips">' + options.map(function (o) {
      var on = String(value) === String(o[0]) ? " on" : ""
      return '<button type="button" class="ed-chip' + on + '" data-chip="' + key + '" data-val="' + o[0] + '">' + esc(String(o[1])) + "</button>"
    }).join("") + "</div>"
  }
  function row(label, control, hint) {
    return '<div class="ed-row"><span class="ed-row-l">' + esc(label) + "</span>" +
      '<span class="ed-row-c">' + control + "</span>" +
      (hint ? '<span class="ed-row-h">' + esc(hint) + "</span>" : "") + "</div>"
  }
  function sel(key, value, options) {
    return '<select data-scope="design" data-key="' + key + '">' + options.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(value) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"
    }).join("") + "</select>"
  }
  function colorRow(label, key) {
    var v = design[key] || ""
    return '<div class="ed-row"><span class="ed-row-l">' + esc(label) + "</span>" +
      '<span class="ed-row-c ed-colors"><input type="color" data-scope="design" data-key="' + key + '" value="' +
      esc(v || "#FFFFFF") + '"><input type="text" class="ed-hex" data-scope="design" data-key="' + key +
      '" value="' + esc(v) + '" maxlength="7" placeholder="auto"></span></div>'
  }
  function rangeRow(label, key, min, max, step, value, suffix) {
    return '<div class="ed-row"><span class="ed-row-l">' + esc(label) + "</span>" +
      '<span class="ed-row-c"><input type="range" min="' + min + '" max="' + max + '" step="' + step +
      '" data-scope="design" data-key="' + key + '" value="' + esc(value) + '">' +
      '<b class="ed-rangev" data-v="' + key + '">' + esc(value) + (suffix || "") + "</b></span></div>"
  }

  /* -------------------------------- THÈME -------------------------------- */
  var PALETTES = [
    ["Clair", { bg: "#FFFFFF", ink: "#111111", headBg: "", headInk: "", accent: "#111111" }],
    ["Nuit", { bg: "#0E0E0E", ink: "#F5F5F5", headBg: "#0E0E0E", headInk: "#FFFFFF", accent: "#FFD400" }],
    ["Sable", { bg: "#FAF7F2", ink: "#1C1917", headBg: "#FAF7F2", headInk: "#1C1917", accent: "#9A3412" }],
    ["Forêt", { bg: "#F5F8F5", ink: "#14261A", headBg: "#F5F8F5", headInk: "#14261A", accent: "#15803D" }],
    ["Rose", { bg: "#FDF6F7", ink: "#2A1B1F", headBg: "#FDF6F7", headInk: "#2A1B1F", accent: "#BE123C" }],
    ["Bleu", { bg: "#F4F7FC", ink: "#0B1220", headBg: "#0B1220", headInk: "#FFFFFF", accent: "#2563EB" }],
  ]

  /* 12 apparences prêtes : une palette + des arrondis + une police,
     appliquées en un clic. Tout reste modifiable ensuite. */
  /* Apparences prêtes : chaque paire texte/fond est contrastée (ratio >= 4.5),
     l'accent reste distinct du fond et du texte, et la police est toujours posée. */
  var PRESETS = [
    ["Clair",    { bg: "#FFFFFF", ink: "#111111", accent: "#111111", headBg: "#FFFFFF", headInk: "#111111", footBg: "#F7F7F8", footInk: "#111111", radiusPx: 10, radius: "normal", font: "inter", button: "noir" }],
    ["Nuit",     { bg: "#0E0E10", ink: "#F5F5F7", accent: "#E8B007", headBg: "#0E0E10", headInk: "#F5F5F7", footBg: "#08080A", footInk: "#EDEDF0", radiusPx: 12, radius: "doux", font: "grotesque", button: "contour" }],
    ["Sable",    { bg: "#FAF7F0", ink: "#241E17", accent: "#8C6E4A", headBg: "#FAF7F0", headInk: "#241E17", footBg: "#F0E9DD", footInk: "#241E17", radiusPx: 6, radius: "net", font: "palatino", button: "noir" }],
    ["Pastel",   { bg: "#FDF2F8", ink: "#3B172E", accent: "#BE185D", headBg: "#FDF2F8", headInk: "#3B172E", footBg: "#FBE7EF", footInk: "#3B172E", radiusPx: 18, radius: "doux", font: "humanist", button: "noir" }],
    ["Forêt",    { bg: "#F3F6F3", ink: "#12251A", accent: "#166534", headBg: "#F3F6F3", headInk: "#12251A", footBg: "#E6EEE6", footInk: "#12251A", radiusPx: 12, radius: "normal", font: "geometric", button: "noir" }],
    ["Tech",     { bg: "#FFFFFF", ink: "#0B1220", accent: "#0B63CE", headBg: "#FFFFFF", headInk: "#0B1220", footBg: "#F1F5F9", footInk: "#0B1220", radiusPx: 8, radius: "net", font: "grotesque", button: "noir" }],
    ["Néo-brut", { bg: "#FFFDF5", ink: "#111111", accent: "#FFD400", headBg: "#FFFDF5", headInk: "#111111", footBg: "#FFF6D8", footInk: "#111111", radiusPx: 0, radius: "net", font: "condensed", button: "noir" }],
    ["Édito",    { bg: "#FFFFFF", ink: "#141414", accent: "#B91C1C", headBg: "#FFFFFF", headInk: "#141414", footBg: "#F7F7F7", footInk: "#141414", radiusPx: 4, radius: "net", font: "serif", button: "contour" }],
    ["Mono",     { bg: "#F5F5F4", ink: "#171717", accent: "#404040", headBg: "#F5F5F4", headInk: "#171717", footBg: "#EAEAE9", footInk: "#171717", radiusPx: 0, radius: "net", font: "mono", button: "noir" }],
    ["Doré",     { bg: "#14110E", ink: "#F6F0E6", accent: "#C9A227", headBg: "#14110E", headInk: "#F6F0E6", footBg: "#0F0D0A", footInk: "#F6F0E6", radiusPx: 10, radius: "doux", font: "didone", button: "contour" }],
    ["Océan",    { bg: "#F1F7FA", ink: "#0B2B3A", accent: "#0E7490", headBg: "#F1F7FA", headInk: "#0B2B3A", footBg: "#E4EFF4", footInk: "#0B2B3A", radiusPx: 14, radius: "doux", font: "system", button: "noir" }],
    ["Corail",   { bg: "#FFF7F4", ink: "#2A1613", accent: "#C2410C", headBg: "#FFF7F4", headInk: "#2A1613", footBg: "#FFEDE5", footInk: "#2A1613", radiusPx: 14, radius: "normal", font: "geometric", button: "noir" }],
  ]


  /* Sections repliables : le rail montre d'abord une liste courte et lisible.
     Les trois premières sont ouvertes, le reste s'ouvre au clic. */
  var OPEN_SECS = {}

  var FOOT_STYLES = [
    ["theme", "Celui du thème", "Le pied déjà prévu par le thème"],
    ["colonnes", "Colonnes", "Nom, boutique, aide, contact"],
    ["centre", "Centré", "Tout au milieu"],
    ["sombre", "Sombre", "Bandeau noir"],
    ["magazine", "Magazine", "Grand nom, liens en ligne"],
    ["ligne", "Une ligne", "Tout sur une seule ligne"],
    ["cartes", "Cartes", "Chaque colonne dans une carte"],
    ["contact", "Contact", "Le téléphone en grand"],
  ]
  function seedFooter() {
    if (design.footerCols && design.footerCols.length) return
    design.footerCols = [
      { title: "Boutique", links: [{ label: "Accueil", url: "" }, { label: "Nouveautés", url: "" }] },
      { title: "Aide", links: [{ label: "Livraison", url: "legal#livraison" }, { label: "Retours", url: "legal#retours" }] },
      { title: "Contact", links: [{ label: "Nous écrire", url: "" }] },
    ]
  }
  function footerPick() {
    return '<div class="ed-footpick">' + FOOT_STYLES.map(function (s) {
      var on = (design.footerStyle || "theme") === s[0]
      return '<button type="button" data-footstyle="' + s[0] + '"' + (on ? ' class="on"' : "") + "><b>" + esc(s[1]) + "</b><i>" + esc(s[2]) + "</i></button>"
    }).join("") + "</div>"
  }
  function footerColsHtml() {
    if ((design.footerStyle || "theme") === "theme") return ""
    var cols = design.footerCols || []
    return cols.map(function (col, i) {
      return '<div class="ed-block"><div class="ed-block-head"><b>Colonne ' + (i + 1) + '</b>' +
        '<button type="button" class="ed-x" data-footdel="' + i + '">Supprimer</button></div>' +
        '<label class="ed-f">Titre<input type="text" data-foot="' + i + '.title" value="' + esc(col.title || "") + '" placeholder="Titre"></label>' +
        (col.links || []).map(function (l, j) {
          return '<div class="ed-navrow"><input type="text" data-foot="' + i + "." + j + '.label" value="' + esc(l.label || "") + '" placeholder="Texte du lien">' +
            '<input type="text" data-foot="' + i + "." + j + '.url" value="' + esc(l.url || "") + '" placeholder="Adresse">' +
            '<button type="button" class="ed-x" data-linkdel="' + i + ":" + j + '">✕</button></div>'
        }).join("") +
        '<button type="button" class="ed-linkbtn" data-linkadd="' + i + '">+ Lien</button></div>'
    }).join("") + '<button type="button" class="ed-addblock" data-coladd="1">+ Colonne</button>'
  }

  function themeMini(id) {
    return '<span class="theme-preview ed-mini tpv-' + esc(id) + '" aria-hidden="true">' +
      '<span class="tp-top"></span>' +
      '<span class="tp-head"><i></i><i></i><i></i></span>' +
      '<span class="tp-hero"></span>' +
      '<span class="tp-grid"><i></i><i></i><i></i><i></i></span>' +
      '</span>'
  }

  function themeGallery() {
    var themes = D.themes || []
    var cur = D.currentTheme || ""
    if (!themes.length) return ""
    return '<p class="ed-hint">La structure de la boutique. Un clic l\'essaie avec tes produits, pas avec des articles inventés. Tes couleurs et tes textes restent. Rien n\'est publié avant Publier.</p>' +
      '<div class="ed-themes">' + themes.map(function (t) {
        var on = t.id === cur
        return '<button type="button" class="ed-theme' + (on ? " on" : "") + '" data-pick-theme="' + esc(t.id) + '">' +
          themeMini(t.id) +
          '<span class="ed-theme-meta"><b>' + esc(t.name) + '</b><span>' + esc(t.ideal || t.desc || "") + '</span></span>' +
          (on ? '<em>en cours</em>' : "") +
          '</button>'
      }).join("") + '</div>'
  }

  function foldSections(html) {
    html = html.replace('<div class="ed-pane">', '<div class="ed-pane folded">')
    var out = []
    var re = /<section class="ed-sec">(<h3>[\s\S]*?<\/h3>)/g
    var last = 0, m
    while ((m = re.exec(html))) {
      out.push(html.slice(last, m.index))
      var head = m[1]
      var title = head.replace(/<[^>]+>/g, "")
      out.push('<section class="ed-sec open"><button type="button" class="ed-sec-h" data-sec="' + esc(title) + '">' +
        head + '<i class="ed-sec-arrow"></i></button>')
      last = m.index + m[0].length
    }
    out.push(html.slice(last))
    return out.join("")
  }

  function novaAcc(title, body) {
    return '<section class="ed-sec' + (OPEN_SECS[title] ? " open" : "") + '">' +
      '<button type="button" class="ed-sec-h" data-sec="' + esc(title) + '"><h3>' + esc(title) + '</h3><i class="ed-sec-arrow"></i></button>' +
      body + "</section>"
  }

  function chipWide(key, value, options) {
    return '<div class="ed-chips wide">' + options.map(function (o) {
      var on = String(value) === String(o[0]) ? " on" : ""
      return '<button type="button" class="ed-chip' + on + '" data-chip="' + key + '" data-val="' + o[0] + '">' + esc(String(o[1])) + "</button>"
    }).join("") + "</div>"
  }

  function novaSlots() {
    var d = design
    return {
      "Logo et favicon":
        rangeRow("Taille du logo", "logoSize", 14, 96, 2, d.logoSize || 28, " px") +
        row("Place", sel("logoPlace", d.logoPlace || "gauche", [["gauche", "À gauche"], ["centre", "Au centre"], ["droite", "À droite"]])) +
        '<label class="hz-toggle"><span class="ed-row-l">Logo dans la bannière</span><input type="checkbox" data-scope="design" data-key="heroLogo"' + (d.heroLogo !== false ? " checked" : "") + "></label>",
      "Typographie":
        '<p class="hz-sub">Titres</p>' +
        '<p class="ed-hint">Taille, graisse, interlettrage. Une police Google si la liste ne suffit pas.</p>' +
        chipWide("scale", d.scale, [[0.8, "Petite"], [1, "Normale"], [1.35, "Grande"], [1.6, "Très grande"], [2, "Énorme"]]) +
        row("Graisse des titres", sel("weight", d.weight, [["500", "Fine"], ["600", "Moyenne"], ["700", "Grasse"]])) +
        row("Interlettrage", sel("tracking", d.tracking, [["serre", "Serré"], ["normal", "Normal"], ["aere", "Aéré"]])) +
        row("Google Fonts", '<input data-scope="design" data-key="googleFamily" maxlength="40" placeholder="Cairo, Amiri…" value="' + esc(d.googleFamily || "") + '">') +
        '<div class="ed-row"><span class="ed-row-l">Chercher</span><span class="ed-row-c"><input id="edGfQ" maxlength="40" placeholder="cairo"><button type="button" class="ed-btn" id="edGfGo">Chercher</button></span></div>' +
        '<div id="edGfOut" class="ed-hint"></div>',
      "Recherche":
        row("Alignement", sel("searchAlign", d.searchAlign || "droite", [["gauche", "À gauche"], ["centre", "Au centre"], ["droite", "À droite"]])) +
        row("Texte d'aide", '<input data-scope="design" data-key="searchHint" value="' + esc(d.searchHint == null ? "" : d.searchHint) + '" maxlength="40" placeholder="Laisser vide pour aucun texte">') +
        '<button type="button" class="ed-link" data-search-del="1">Supprimer la barre de recherche</button>',
      "Panier":
        '<p class="hz-sub">Mode de commande</p>' +
        '<p class="ed-hint">Avec panier, sans panier, ou les deux boutons. Le tiroir et l\'achat direct sont juste au-dessus.</p>' +
        ["panier", "deux", "direct"].map(function (m) {
          var meta = {
            panier: ["Avec panier", "Le client ajoute plusieurs articles puis commande."],
            deux: ["Les deux", "« Ajouter au panier » et « Acheter maintenant » côte à côte."],
            direct: ["Sans panier", "Chaque bouton envoie droit au formulaire de commande."],
          }[m]
          return '<label class="ed-radio"><input type="radio" name="edCartMode" data-scope="design" data-key="cartMode" value="' + m + '"' +
            (d.cartMode === m ? " checked" : "") + "><span><b>" + meta[0] + "</b><span>" + meta[1] + "</span></span></label>"
        }).join(""),
      "Sélecteurs de variantes":
        '<p class="hz-sub">Façon de choisir</p>' +
        '<div class="ed-vpick">' +
        [["boutons", "Boutons"], ["cartes", "Cartes avec prix"], ["radio", "Boutons radio"], ["liste", "Liste déroulante"]].map(function (o) {
          return '<button type="button" class="ed-vopt' + ((d.variantStyle || "boutons") === o[0] ? " on" : "") +
            '" data-vstyle="' + o[0] + '"><i class="ed-vico v-' + o[0] + '"></i><b>' + o[1] + "</b></button>"
        }).join("") + "</div>",
    }
  }

  function novaThemeTail() {
    var d = design
    return novaAcc("Thèmes", themeGallery() || '<p class="ed-hint">Aucun thème chargé.</p>') +
      novaAcc("En-tête",
        '<p class="ed-hint">La barre. Les couleurs sont dans Palette.</p>' +
        row("Barre", sel("headStyle", d.headStyle, [["plein", "Pleine (couleur)"], ["ligne", "Fond transparent + ligne"], ["transparent", "Transparente (sur l'image)"], ["flottant", "Collante au défilement"]])) +
        row("Hauteur", sel("headHeight", d.headHeight, [["compacte", "Compacte"], ["normale", "Normale"], ["large", "Large"]])) +
        row("Disposition", sel("headAlign", d.headAlign, [["gauche", "Logo à gauche"], ["centre", "Menu centré"], ["etale", "Étalé"]]))) +
      novaAcc("Photo d'exemple",
        '<p class="ed-hint">Illustration quand un produit n\'a pas encore de photo, ou si le fichier manque.</p>' +
        '<div class="hz-img"><div class="ed-img"><div class="ed-imgbox logo">' +
        '<img src="' + esc(d.exampleImage || "/demo/exemple.jpg") + '" alt="">' +
        '</div><div class="ed-imgside"><label class="ed-file">Choisir<input type="file" accept="image/*" data-img="design||exampleImage"></label>' +
        '<button type="button" class="ed-link" data-lib="design||exampleImage">Bibliothèque</button>' +
        (d.exampleImage ? '<button type="button" class="ed-link" data-imgclear="design||exampleImage">Revenir à l\'illustration Nova</button>' : "") +
        "</div></div></div>") +
      novaAcc("Bannière d'accueil",
        '<p class="ed-hint">Le texte de la bannière. Image, titre et bouton : onglet Sections.</p>' +
        row("Texte", sel("heroAlign", d.heroAlign, [["def", "Comme la section"], ["gauche", "À gauche"], ["centre", "Au centre"], ["droite", "À droite"]]))) +
      novaAcc("Formes et largeur",
        row("Boutons", sel("button", d.button, [["noir", "Noir plein"], ["gris", "Gris anthracite"], ["contour", "Contour seul"]])) +
        rangeRow("Arrondis", "radiusPx", 0, 32, 1, d.radiusPx, " px") +
        '<p class="hz-sub">Largeur de la page</p>' +
        chipWide("containerWidth", d.containerWidth, [[960, "Étroite"], [1100, "Moyenne"], [1240, "Normale"], [1440, "Large"], [1600, "Pleine"]]) +
        rangeRow("Largeur précise", "containerWidth", 960, 1600, 20, d.containerWidth, " px")) +
      novaAcc("Cartes de produit",
        '<p class="ed-hint">La forme des produits dans les grilles.</p>' +
        row("Style", sel("cardStyle", d.cardStyle, [["classique", "Classique (image + texte)"], ["carte", "Carte blanche"], ["ombre", "Image détachée (ombre)"], ["bordee", "Encadrée (trait net)"], ["compacte", "Compacte (horizontale)"]]))) +
      novaAcc("Fiche produit",
        '<p class="ed-hint">Comment le client commande depuis la fiche.</p>' +
        row("Achat", sel("productForm", d.productForm, [["bouton", "Boutons (panier / achat direct)"], ["inline", "Formulaire de commande sur la fiche"]])) +
        '<p class="ed-hint">En mode formulaire, les champs sont ceux de <a href="/dashboard/formulaire" target="_blank">votre formulaire</a>.</p>') +
      novaAcc("Texte",
        '<p class="ed-hint">Alignement des textes de la boutique.</p>' +
        chipWide("textAlign", d.textAlign || "def", [["gauche", "Gauche"], ["centre", "Centre"], ["droite", "Droite"], ["justifie", "Justifié"]])) +
      novaAcc("Pied de page",
        '<p class="ed-hint">Choisis un style, puis modifie chaque texte. Un champ vide reste vide.</p>' +
        footerPick() +
        colorRow("Fond du pied", "footBg") +
        colorRow("Texte du pied", "footInk") +
        '<label class="ed-f">Texte sous le nom<textarea rows="2" data-scope="design" data-key="footerBrand" placeholder="Une phrase sur la boutique">' + esc(d.footerBrand || "") + "</textarea></label>" +
        footerColsHtml() +
        '<label class="ed-f">Mention en bas<input type="text" data-scope="design" data-key="footerNote" value="' + esc(d.footerNote || "") + '" placeholder="Fait à Blida, livré partout."></label>' +
        '<label class="hz-toggle"><span class="ed-row-l">Afficher « Propulsé par NovaDZ »</span><input type="checkbox" data-scope="design" data-key="showNovadz"' + (d.showNovadz ? " checked" : "") + "></label>") +
      novaAcc("Réseaux sociaux",
        '<p class="ed-hint">Les liens se saisissent dans <a href="/dashboard/reseaux" target="_blank">Réglages → Réseaux sociaux</a>. Ici, seulement où ils apparaissent.</p>' +
        row("Afficher", sel("socialWhere", d.socialWhere, [["aucun", "Nulle part"], ["entete", "Dans l'en-tête"], ["pied", "Dans le pied de page"], ["deux", "Les deux"]])) +
        row("Style", sel("socialStyle", d.socialStyle, [["icones", "Icônes seules"], ["noms", "Icônes + nom"]])) +
        row("Taille", sel("socialSize", d.socialSize, [["petit", "Petite"], ["normal", "Normale"], ["grand", "Grande"]])) +
        '<p class="ed-hint">Aucune icône tant qu\'un lien n\'est pas enregistré.</p>') +
      novaAcc("Ordre sur mobile",
        '<p class="ed-hint">Différent de l\'ordre sur ordinateur.</p>' +
        '<div class="ed-mobile" id="edMobile">' + mobileHtml() + "</div>")
  }

  function themeTab() {
    var d = design
    if (!window.horizonPanel) return ""
    return window.horizonPanel(d, {
      fonts: (window.ED_DATA && window.ED_DATA.fonts) || [],
      presets: (typeof PRESETS !== "undefined" ? PRESETS : []),
      open: OPEN_SECS,
      slots: novaSlots(),
      tail: novaThemeTail(),
    })
  }

  /* ------------------------------- EN-TÊTE ------------------------------- */
  function row2(label, html) { return row(label, html) }

  function headTab() {
    var extra = (design.navAdd || [])
    var row = function (l, i, isExtra) {
      var a = isExtra ? " data-addlabel=\"" + i + "\" data-addurl=\"" + i + "\"" : " data-nav-label=\"" + i + "\" data-nav-url=\"" + i + "\""
      return '<div class="ed-navrow2">' +
        '<input type="text" value="' + esc(l.label || "") + '" placeholder="Titre du lien" data-' + (isExtra ? "addlabel" : "nav-label") + '="' + i + '">' +
        '<input type="text" value="' + esc(l.url || "") + '" placeholder="page/contact ou https://…" data-' + (isExtra ? "addurl" : "nav-url") + '="' + i + '">' +
        '<button type="button" class="ed-x" data-' + (isExtra ? "adddel" : "navdel") + '="' + i + '" title="Supprimer">✕</button></div>'
    }
    return '<div class="ed-pane">' +
      '<section class="ed-sec"><h3>Barre de navigation</h3>' +
      '<p class="ed-hint">Ce sont les liens affichés dans la barre du haut. Supprime, renomme, ou pointe vers n\'importe quelle adresse.</p>' +
      '<div class="ed-navlist">' + nav.map(function (l, i) { return row(l, i, false) }).join("") + "</div>" +
      '<button type="button" class="ed-addblock" data-addnav="1">+ Ajouter un lien</button></section>' +

      (extra.length ? '<section class="ed-sec"><h3>Liens ajoutés</h3>' +
        '<div class="ed-navlist">' + extra.map(function (l, i) { return row(l, i, true) }).join("") + "</div></section>" : "") +

      (extra.length ? "" : '<section class="ed-sec"><h3>Ajouter un lien direct</h3>' +
        '<p class="ed-hint">Une page, un produit, un dossier WhatsApp, une promo… collez l\'adresse.</p>' +
        '<div class="ed-navrow2"><input type="text" id="edNewNavLabel" placeholder="Titre (ex. Promo)">' +
        '<input type="text" id="edNewNavUrl" placeholder="page/promo ou https://wa.me/…">' +
        '<button type="button" class="ed-x" data-addnav="1" title="Ajouter">+</button></div></section>') +

      '<section class="ed-sec"><h3>Ce que la barre affiche</h3>' +
      '<label class="ed-check"><input type="checkbox" data-scope="design" data-key="showCartLink"' + (design.showCartLink === false ? "" : " checked") + '> Lien « Panier » dans l\'en-tête</label>' +
      '<label class="ed-check"><input type="checkbox" data-scope="design" data-key="logo"' + (design.logo ? " checked" : "") + ' disabled> Logo (onglet Thème)</label>' +
      '<p class="ed-note">Le mode panier, le tiroir et les réseaux se règlent dans l\'onglet Paramètres.</p></section>' +

      '<section class="ed-sec"><h3>Style de la barre</h3>' +
      row2("Barre", sel("headStyle", design.headStyle, [["plein", "Pleine"], ["ligne", "Ligne fine"], ["transparent", "Transparente"], ["flottant", "Collante"]])) +
      row2("Hauteur", sel("headHeight", design.headHeight, [["compacte", "Compacte"], ["normale", "Normale"], ["large", "Large"]])) +
      row2("Disposition", sel("headAlign", design.headAlign, [["gauche", "Logo à gauche"], ["centre", "Menu centré"], ["etale", "Étalé"]])) +
      "</section>" +

      '<section class="ed-sec"><h3>Version téléphone</h3>' +
      '<p class="ed-hint">Réglages propres au petit écran (moins de 520 px). Ils ne touchent pas la version ordinateur.</p>' +
      row2("Texte", sel("mobileText", design.mobileText, [["petit", "Petit"], ["normal", "Normal"], ["grand", "Grand"]])) +
      row2("Titres", sel("mobileTitle", design.mobileTitle, [["petit", "Petit"], ["normal", "Normal"], ["grand", "Grand"]])) +
      row2("Espacement des blocs", sel("mobilePad", design.mobilePad, [["serre", "Serré"], ["normal", "Normal"], ["aere", "Aéré"]])) +
      row2("Produits par ligne", sel("mobileCols", design.mobileCols, [[1, "1"], [2, "2"]])) +
      '<p class="ed-note">L\'ordre des blocs sur téléphone se règle dans l\'aperçu téléphone (flèches ↑ ↓).</p>' +
      "</section></div>"
  }

  /* -------------------------------- PAGES -------------------------------- */
  var PAGE_LIST = [
    ["home", "Accueil", false],
    ["product", "Fiche produit", true],
    ["cart", "Panier", true],
    ["checkout", "Page de commande", true],
    ["done", "Confirmation", false],
    ["legal", "Mentions légales / CGV", false],
    ["account", "Compte client", false],
  ]
  var HIDE_LIST = [
    ["productReviews", "Fiche produit : masquer les avis"],
    ["productRelated", "Fiche produit : masquer les produits similaires"],
    ["productDesc", "Fiche produit : masquer la description longue"],
    ["cartPromo", "Panier : masquer le champ code promo"],
    ["checkoutNote", "Commande : masquer le champ « note »"],
    ["checkoutGeo", "Commande : masquer le bouton de position"],
    ["checkoutEta", "Commande : masquer le délai annoncé"],
  ]

  function pagesTab() {
    return '<div class="ed-pane">' +
      '<section class="ed-sec"><h3>Éléments à masquer</h3>' +
      HIDE_LIST.map(function (h) {
        return '<label class="ed-check"><input type="checkbox" data-hide-key="' + h[0] + '"' +
          (design.hide[h[0]] ? " checked" : "") + "> " + esc(h[1]) + "</label>"
      }).join("") + "</section>" +
      '<section class="ed-sec"><h3>CSS par page</h3>' +
      '<p class="ed-hint">Chaque page a son propre CSS. Le sélecteur <code>.theme</code> est le conteneur de la page.</p>' +
      PAGE_LIST.map(function (p) {
        return '<details class="ed-page" data-page-key="' + p[0] + '"' + (p[0] === CURRENT_PAGE ? " open" : "") + '><summary>' + esc(p[1]) + "</summary>" +
          '<p class="ed-hint"><button type="button" class="ed-linkbtn" data-goto-page="' + p[0] + '">Afficher cette page dans l\'aperçu</button></p>' +
          '<textarea rows="5" spellcheck="false" data-deep="pageCss.' + p[0] + '" placeholder="' +
          esc(p[0] === "product" ? ".p-name{font-size:34px}" : "/* CSS de cette page */") + '">' +
          esc(design.pageCss[p[0]] || "") + "</textarea></details>"
      }).join("") + "</section></div>"
  }

  /* -------------------------------- CODE --------------------------------- */
  function codeTab() {
    return '<div class="ed-pane">' +
      '<section class="ed-sec"><h3>Code de cette page</h3>' +
      '<p class="ed-hint">Le HTML réel de la page affichée à droite. Enregistrer le remplace. Revenir au thème annule.</p>' +
      '<textarea id="edRailCode" class="ed-code" rows="14" spellcheck="false" placeholder="Chargement du code de la page…"></textarea>' +
      '<div class="ed-code-actions">' +
      '<button type="button" class="ed-btn" id="edRailCodeOpen">Agrandir</button>' +
      '<button type="button" class="ed-btn" id="edRailCodeClear">Revenir au thème</button>' +
      '<button type="button" class="ed-btn ed-btn-primary" id="edRailCodeSave">Enregistrer</button>' +
      '</div></section>' +
      '<section class="ed-sec"><h3>CSS de la boutique</h3>' +
      '<p class="ed-hint">CSS de tout le site. Le HTML de chaque page est le bouton Code, en haut. Ex : <code>.theme h1{text-transform:uppercase}</code></p>' +
      '<textarea class="ed-code" rows="10" spellcheck="false" data-scope="design" data-key="customCss" placeholder=".theme .p-add{letter-spacing:.02em}">' +
      esc(design.customCss || "") + "</textarea></section>" +
      '<section class="ed-sec"><h3>HTML dans l&rsquo;en-tête</h3>' +
      '<p class="ed-hint">Balises meta, polices, vérifications de site (Search Console, pixels).</p>' +
      '<textarea class="ed-code" rows="6" spellcheck="false" data-scope="design" data-key="htmlHead" placeholder="<meta name=&quot;google-site-verification&quot; content=&quot;...&quot;>">' +
      esc(design.htmlHead || "") + "</textarea></section>" +
      '<section class="ed-sec"><h3>HTML en pied de page</h3>' +
      '<p class="ed-hint">Widget de chat, scripts de suivi autorisés, bandeau d&rsquo;information.</p>' +
      '<textarea class="ed-code" rows="6" spellcheck="false" data-scope="design" data-key="htmlFooter" placeholder="<div>Mon bandeau</div>">' +
      esc(design.htmlFooter || "") + "</textarea></section>" +
      '<section class="ed-sec"><div class="ed-note">Les balises <b>&lt;script&gt;</b> et les attributs <b>onclick</b> sont retirés ' +
      "automatiquement : ils sont la première cause de page cassée. Utilise les sections et le CSS pour tes effets.</div></section>" +
      "</div>"
  }

  /* -------------------------------- TEXTES ------------------------------- */
  function textsTab() {
    var rows = design.dict.length ? design.dict : [{ from: "", to: "" }]
    var sizes = design.textSizes || []
    var sizeList = sizes.length
      ? sizes.map(function (r, i) {
          return '<div class="ed-tsize-line"><b>' + esc(r.label || "Texte") + '</b>' +
            '<span>' + (r.page === "*" ? "toutes les pages" : esc(r.page || "")) + '</span>' +
            '<button type="button" data-tsz-i="' + i + '" data-tsz-v="0">0</button>' +
            '<input type="number" min="0" max="100" step="1" data-tsz-num="' + i + '" value="' + esc(r.size) + '">' +
            '<button type="button" data-tsz-i="' + i + '" data-tsz-v="100">100</button>' +
            '<button type="button" class="ed-x" data-tsz-del="' + i + '" title="Remettre automatique">✕</button></div>'
        }).join("")
      : '<p class="ed-hint">Aucun texte réglé. Clique <b>Taille</b>, puis le texte dans l’aperçu.</p>'
    return '<div class="ed-pane">' +
      '<section class="ed-sec"><h3>Taille exacte</h3>' +
      '<p class="ed-hint">N’importe quel texte. La taille va de 0 à 100 : 0 le cache, 100 est la plus grande, le chiffre est la taille exacte.</p>' +
      sizeList +
      '</section>' +
      '<section class="ed-sec"><h3>Réécrire les textes</h3>' +
      '<p class="ed-hint">Écris le texte affiché à gauche, ton texte à droite. Il s&rsquo;applique sur toutes les pages : ' +
      "titres, boutons, mentions, messages.</p>" +
      rows.map(function (r, i) {
        return '<div class="ed-dict"><input type="text" data-dict-from="' + i + '" value="' + esc(r.from) +
          '" placeholder="Ajouter au panier"><span>→</span><input type="text" data-dict-to="' + i + '" value="' +
          esc(r.to) + '" placeholder="Commander"><button type="button" class="ed-x" data-dict-del="' + i + '">✕</button></div>'
      }).join("") +
      '<button type="button" class="ed-addblock" id="edDictAdd">+ Ajouter une ligne</button>' +
      "</section></div>"
  }

  /* ------------------------------ RENDU RAIL ----------------------------- */
  function sectionsTab() {
    var html = state.map(function (s, i) {
      var t = typeOf(s.type)
      var open = selected === s.id
      return '<div class="ed-card' + (open ? " open" : "") + (s.hidden ? " off" : "") + '" data-id="' + s.id + '" draggable="true">' +
        '<div class="ed-card-head">' +
        '<button type="button" class="ed-card-title" data-select="' + s.id + '">' + esc(t.name) + "</button>" +
        '<button type="button" class="ed-remove" data-del="' + s.id + '">Enlever</button>' +
        "</div>" +
        (open ? '<div class="ed-card-body">' + sectionFields(s) + blocksHtml(s) + "</div>" : "") +
        "</div>"
    }).join("")
    var pageLabel = ""
    for (var i = 0; i < PREVIEWS.length; i++) if (PREVIEWS[i].key === CURRENT_PAGE) pageLabel = PREVIEWS[i].label
    var FIXED = {
      product: ["Galerie photos", "Titre, prix, stock", "Boutons d'achat ou formulaire", "Description", "Avis clients", "Produits similaires"],
      cart: ["Articles du panier", "Code promo", "Total et bouton commander"],
      checkout: ["Formulaire client", "Livraison", "Paiement", "Récapitulatif"],
      account: ["Commandes du client", "Ses informations"],
      legal: ["Conditions de vente", "Mentions légales", "Retours", "Cookies"],
    }
    var fixed = FIXED[CURRENT_PAGE] || []
    var fixedBox = fixed.length
      ? '<div class="ed-fixedbox"><b>Ce que la page affiche déjà</b><ul>' +
        fixed.map(function (x) { return "<li>" + esc(x) + "</li>" }).join("") + "</ul>" +
        '<span>Pour en retirer un, va dans l\'onglet <b>Pages</b> (éléments à masquer). ' +
        "Les blocs ajoutés ici s\'affichent sous cette structure.</span></div>"
      : ""
    var empty = state.length ? "" :
      '<div class="ed-empty"><b>Aucun bloc ajouté sur « ' + esc(pageLabel || "cette page") + ' »</b>' +
      '<span>Cette page fonctionne déjà sans blocs. Tu peux en ajouter pour la compléter : ils n\'apparaîtront que sur cette page.</span></div>'
    var homeTree = CURRENT_PAGE === "home"
      ? '<div class="hz-tree"><b>Page d\'accueil</b>' +
        '<button type="button" class="hz-tree-add" data-tab="head">En-tête · barre et navigation</button>' +
        '<div class="hz-tree-sec"><span>Modèle</span><button type="button" class="ed-addsection" id="edAddSection">Ajouter une section</button></div>' +
        '<button type="button" class="hz-tree-add" data-tab="theme">Pied de page · dans Paramètres du thème</button></div>'
      : ""
    return homeTree + '<p class="ed-page-note">Sections de : <b>' + esc(pageLabel || "Accueil") + '</b></p>' +
      (CURRENT_PAGE === "home" ? "" : fixedBox) +
      html + empty + (CURRENT_PAGE === "home" ? "" : '<button type="button" class="ed-addsection" id="edAddSection">Ajouter</button>')
  }

  function renderRail() {
    var y = rail.scrollTop
    var body = TAB === "sections" ? sectionsTab()
      : TAB === "head" ? headTab()
      : TAB === "theme" ? themeTab()
        : TAB === "pages" ? pagesTab()
          : TAB === "code" ? codeTab()
            : textsTab()
    rail.innerHTML = tabsBar() + '<div class="ed-tabpane">' + body + "</div>"
    if (y) rail.scrollTop = y
    syncUndo()
    if (TAB === "code") fillPageCode(document.getElementById("edRailCode"))
  }

  /* ------------------------------ navigation ------------------------------ */
  var nav = Array.isArray(D.nav) ? D.nav.slice() : [{ id: uid("n"), label: "Boutique", url: "" }]

  function renderNav() {
    $("edNavBody").innerHTML = nav.map(function (l, i) {
      return '<div class="ed-navrow">' +
        '<input type="text" value="' + esc(l.label) + '" placeholder="Accueil" data-nav-label="' + i + '">' +
        '<input type="text" value="' + esc(l.url || "") + '" placeholder="page/a-propos" data-nav-url="' + i + '">' +
        '<button type="button" class="ed-x" data-navdel="' + i + '">✕</button></div>'
    }).join("")
  }

  /* ------------------------------ sauvegarde ------------------------------ */
  var saveQuiet = false
  var saveReload = false
  function save(opts) {
    saveReload = !!(opts && opts.reload)
    saveQuiet = !saveReload
    saveState.textContent = "Enregistrement…"
    saveState.className = "ed-save busy"
    clearTimeout(saveTimer)
    saveTimer = setTimeout(function () {
      fetch("/dashboard/design/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: (syncPage(), stateMap), design: design, nav: nav }),
      })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (d && d.ok) {
            saveState.textContent = "Enregistré"
            saveState.className = "ed-save ok"
            markDirty()
            delete generatedCode[CURRENT_PAGE]
            if (!design.pageCode[CURRENT_PAGE]) refreshOpenCode()
            if (saveReload) refresh()
            else liveStyle()
            saveQuiet = false
            saveReload = false
          } else {
            saveState.textContent = "Erreur"
            saveState.className = "ed-save err"
          }
        })
        .catch(function () {
          saveState.textContent = "Hors ligne"
          saveState.className = "ed-save err"
        })
    }, 500)
  }
  function currentUrl() {
    /* on recharge la page qu'on est en train de modifier : accueil reste accueil,
       fiche produit reste fiche produit, panier reste panier. */
    var p = null
    for (var i = 0; i < PREVIEWS.length; i++) if (PREVIEWS[i].key === CURRENT_PAGE) p = PREVIEWS[i]
    if (!p) return "/" + SLUG + "?preview=1&editor=1"
    var u = p.url
    return u + (u.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now()
  }
  function softRefresh() {
    var y = 0
    var ry = rail.scrollTop
    try { y = frame.contentWindow.scrollY || 0 } catch (e) {}
    fetch(currentUrl(), { credentials: "same-origin" })
      .then(function (r) { return r.text() })
      .then(function (html) {
        var doc = frame.contentDocument
        if (!doc) { frame.src = currentUrl(); return }
        var next = new DOMParser().parseFromString(html, "text/html")
        var oldT = doc.querySelector(".theme")
        var newT = next.querySelector(".theme")
        if (!oldT || !newT) { frame.src = currentUrl(); return }
        oldT.className = newT.className
        oldT.innerHTML = newT.innerHTML
        ;["data-align", "data-title", "data-wide", "data-heroalign", "data-mtext", "data-mtitle", "data-mpad", "data-mcols", "data-logoplace"].forEach(function (a) {
          if (next.documentElement.hasAttribute(a)) doc.documentElement.setAttribute(a, next.documentElement.getAttribute(a))
        })
        try { frame.contentWindow.scrollTo(0, y) } catch (e2) {}
        rail.scrollTop = ry
        liveStyle()
        try { frame.contentWindow.postMessage({ t: "menu" }, "*") } catch (e3) {}
      })
      .catch(function () { frame.src = currentUrl() })
  }
  function refresh() { softRefresh() }
  function goPage(key) {
    var p = null
    for (var i = 0; i < PREVIEWS.length; i++) if (PREVIEWS[i].key === key) p = PREVIEWS[i]
    if (!p) return
    syncPage()
    CURRENT_PAGE = p.key
    bindPage(CURRENT_PAGE)
    selected = null
    if (p.url) {
      frame.src = p.url + (p.url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now()
      /* on arrive toujours en haut de la page choisie */
      frame.addEventListener("load", function topOnce() {
        frame.removeEventListener("load", topOnce)
        try { frame.contentWindow.scrollTo(0, 0) } catch (e) {}
      })
    }
    if (pageSelect) pageSelect.value = p.key
    if (railCodeKey !== CURRENT_PAGE) { railCodeKey = ""; railCodeVal = "" }
    renderRail()
    if ($("edCodeModal") && $("edCodeModal").classList.contains("open")) openCodeModal()
  }
  var refreshTimer = null
  function refreshSoon() {
    /* Un rechargement automatique faisait sauter l'aperçu en bas. Les textes
       passent par un message, sans recharger la page. */
  }

  /* ------------------------------ interactions ------------------------------ */
  function findSection(id) {
    for (var i = 0; i < state.length; i++) if (state[i].id === id) return state[i]
    return null
  }
  function findBlock(bid) {
    for (var i = 0; i < state.length; i++) {
      var bs = state[i].blocks || []
      for (var j = 0; j < bs.length; j++) if (bs[j].id === bid) return bs[j]
    }
    return null
  }

  rail.addEventListener("click", function (e) {
    var gfGo = e.target.closest("#edGfGo")
    var gfPick = e.target.closest("[data-gffamily]")
    if (gfGo || gfPick) {
      if (gfPick) {
        design.googleFamily = gfPick.getAttribute("data-gffamily") || ""
        var box = document.querySelector('[data-key="googleFamily"]')
        if (box) box.value = design.googleFamily
        liveStyle()
        save({ quiet: true })
        return
      }
      var q = (document.getElementById("edGfQ") || {}).value || ""
      var out = document.getElementById("edGfOut")
      if (out) out.textContent = "Recherche…"
      fetch("/dashboard/fonts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ q: q })
      }).then(function (r) { return r.json() }).then(function (d) {
        if (!out) return
        if (!d || !d.ok) { out.textContent = (d && d.error) || "Impossible."; return }
        if (!d.families || !d.families.length) { out.textContent = "Aucune police."; return }
        out.innerHTML = d.families.map(function (name) {
          return '<button type="button" class="ed-chip" data-gffamily="' + esc(name) + '">' + esc(name) + "</button>"
        }).join(" ")
      }).catch(function () { if (out) out.textContent = "Impossible pour le moment." })
      return
    }
    var chip = e.target.closest("[data-chip]")
    if (chip) {
      var key = chip.getAttribute("data-chip")
      var raw = chip.getAttribute("data-val")
      design[key] = (key === "scale" || key === "containerWidth" || key === "mobileCols") ? Number(raw) : raw
      var kids = chip.parentNode.querySelectorAll("[data-chip]")
      for (var ci = 0; ci < kids.length; ci++) kids[ci].classList.toggle("on", kids[ci] === chip)
      liveStyle()
      save(key === "cartType" ? { reload: true } : { quiet: true })
      return
    }
    var sdel = e.target.closest("[data-search-del]")
    if (sdel) {
      design.searchPlace = "aucune"
      renderRail()
      save()
      toast("Recherche retirée de la boutique")
      return
    }
    var sh = e.target.closest("[data-sec]")
    if (sh) {
      var box = sh.parentNode
      var name = sh.getAttribute("data-sec")
      if (box.classList.contains("open")) { box.classList.remove("open"); delete OPEN_SECS[name] }
      else { box.classList.add("open"); OPEN_SECS[name] = true }
      return
    }
    var vb = e.target.closest("[data-vstyle]")
    if (vb) {
      design.variantStyle = vb.getAttribute("data-vstyle")
      document.querySelectorAll("[data-vstyle]").forEach(function (x) { x.classList.remove("on") })
      vb.classList.add("on")
      push(); liveStyle(); save({ reload: true })
      renderRail()
      return
    }
    var al = e.target.closest("[data-alignsec] button")
    if (al) {
      var box = al.closest("[data-alignsec]")
      var sec = findSection(box.getAttribute("data-alignsec"))
      push()
      sec.align = al.getAttribute("data-alval") || ""
      if (frame.contentWindow) frame.contentWindow.postMessage({ t: "secstyle", id: sec.id, align: sec.align, tsize: sec.tsize, wide: sec.wide, pad: sec.pad }, "*")
      renderRail(); save({ quiet: true })
      return
    }
    var footStyle = e.target.closest("[data-footstyle]")
    if (footStyle) {
      design.footerStyle = footStyle.getAttribute("data-footstyle")
      if (design.footerStyle !== "theme") seedFooter()
      renderRail(); save({ reload: true }); return
    }
    var footDel = e.target.closest("[data-footdel]")
    if (footDel) {
      design.footerCols.splice(+footDel.getAttribute("data-footdel"), 1)
      renderRail(); save(); return
    }
    var linkDel = e.target.closest("[data-linkdel]")
    if (linkDel) {
      var lp = linkDel.getAttribute("data-linkdel").split(":")
      design.footerCols[+lp[0]].links.splice(+lp[1], 1)
      renderRail(); save(); return
    }
    var linkAdd = e.target.closest("[data-linkadd]")
    if (linkAdd) {
      design.footerCols[+linkAdd.getAttribute("data-linkadd")].links.push({ label: "", url: "" })
      renderRail(); return
    }
    var colAdd = e.target.closest("[data-coladd]")
    if (colAdd) {
      design.footerCols = design.footerCols || []
      if (design.footerCols.length < 4) design.footerCols.push({ title: "", links: [{ label: "", url: "" }] })
      renderRail(); save(); return
    }
    var pb = e.target.closest("[data-preset]")
    if (pb) {
      var nome = pb.getAttribute("data-preset")
      var found = null
      for (var pi = 0; pi < PRESETS.length; pi++) if (PRESETS[pi][0] === nome) found = PRESETS[pi][1]
      if (found) {
        push()
        for (var k in found) if (Object.prototype.hasOwnProperty.call(found, k)) design[k] = found[k]
        renderRail(); liveStyle(); save()
      }
      return
    }
    var t = e.target
    var pickTheme = t.closest("[data-pick-theme]")
    if (pickTheme) { chooseTheme(pickTheme); return }
    var railOpen = t.closest("#edRailCodeOpen")
    if (railOpen) { openCodeModal(); return }
    var railClear = t.closest("#edRailCodeClear")
    if (railClear) { clearPageCode(); return }
    var railSave = t.closest("#edRailCodeSave")
    if (railSave) {
      var boxR = $("edRailCode")
      savePageCode(boxR ? boxR.value : "")
      return
    }
    var sel = t.closest("[data-select]")
    if (sel) {
      var id = sel.getAttribute("data-select")
      selected = selected === id ? null : id
      renderRail()
      frame.contentWindow && frame.contentWindow.postMessage({ t: "select", id: id }, "*")
      return
    }
    var hide = t.closest("[data-hide]")
    if (hide) {
      var s1 = findSection(hide.getAttribute("data-hide"))
      push(); s1.hidden = !s1.hidden; noteStructure(); renderRail(); save(); return
    }
    var dup = t.closest("[data-dup]")
    if (dup) {
      var s2 = findSection(dup.getAttribute("data-dup"))
      push()
      var copy = JSON.parse(JSON.stringify(s2))
      copy.id = uid()
      copy.blocks = copy.blocks.map(function (b) { b.id = uid("b"); return b })
      state.splice(state.indexOf(s2) + 1, 0, copy)
      selected = copy.id
      noteStructure()
      renderRail(); save({ reload: true }); return
    }
    var del = t.closest("[data-del]")
    if (del) {
      push()
      state = state.filter(function (s) { return s.id !== del.getAttribute("data-del") })
      noteStructure()
      renderRail(); save({ reload: true }); return
    }
    var navdel2 = t.closest("[data-navdel]")
    if (navdel2) {
      push()
      nav.splice(+navdel2.getAttribute("data-navdel"), 1)
      renderRail(); save(); return
    }
    var adddel = t.closest("[data-adddel]")
    if (adddel) {
      push()
      design.navAdd.splice(+adddel.getAttribute("data-adddel"), 1)
      renderRail(); save(); refreshSoon(); return
    }
    var addnav = t.closest("[data-addnav]")
    if (addnav) {
      var nl = document.getElementById("edNewNavLabel")
      var nu = document.getElementById("edNewNavUrl")
      push()
      design.navAdd = design.navAdd || []
      if (nl && nu) {
        if (!nl.value.trim()) { alert("Donne un titre au lien."); return }
        design.navAdd.push({ label: nl.value.trim(), url: (nu.value || "").trim() })
      } else {
        design.navAdd.push({ label: "Nouveau lien", url: "" })
      }
      renderRail(); save(); refreshSoon(); return
    }
    var pageLink = t.closest("[data-goto-page]")
    if (pageLink) {
      var sel2 = document.getElementById("edPageSelect")
      goPage(pageLink.getAttribute("data-goto-page"))
      return
    }
    var addb = t.closest("[data-addblock]")
    if (addb) {
      var s3 = findSection(addb.getAttribute("data-addblock"))
      var def = BLOCKS[s3.type]
      push()
      s3.blocks.push({ id: uid("b"), settings: Object.assign({}, def.defaults || {}) })
      noteStructure()
      renderRail(); save(); return
    }
    var delb = t.closest("[data-delblock]")
    if (delb) {
      var s4 = findSection(delb.getAttribute("data-parent"))
      push()
      s4.blocks = s4.blocks.filter(function (b) { return b.id !== delb.getAttribute("data-delblock") })
      noteStructure()
      renderRail(); save(); return
    }
    var sw = t.closest("[data-accent]")
    if (sw) {
      push()
      design.accent = sw.getAttribute("data-accent")
      renderRail(); liveStyle(); save()
      return
    }
    var mv = t.closest("[data-move]")
    if (mv) {
      var parts = mv.getAttribute("data-move").split(":")
      var from = +parts[0], dir = +parts[1]
      var to = from + dir
      var list = mobileOrder()
      if (to < 0 || to >= list.length) return
      push()
      var tmp = list[from]; list[from] = list[to]; list[to] = tmp
      design.mobileOrder = list
      noteStructure()
      renderRail(); liveStyle(); save()
      return
    }
    var tab = t.closest("[data-tab]")
    if (tab) {
      TAB = tab.getAttribute("data-tab")
      renderRail()
      if (TAB === "texts") setTextMode(true)
      return
    }
    var pal = t.closest("[data-palette]")
    if (pal) {
      var preset = null
      for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i][0] === pal.getAttribute("data-palette")) preset = PALETTES[i][1]
      if (!preset) return
      push()
      Object.keys(preset).forEach(function (k) { design[k] = preset[k] })
      renderRail(); liveStyle(); save()
      return
    }
    var dadd = t.closest("#edDictAdd")
    if (dadd) { design.dict.push({ from: "", to: "" }); renderRail(); return }
    var ddel = t.closest("[data-dict-del]")
    if (ddel) { design.dict.splice(+ddel.getAttribute("data-dict-del"), 1); renderRail(); save(); return }
    var add = t.closest("#edAddSection, .ed-addsection")
    if (add) { showPalette(); return }
    var navdel = t.closest("[data-navdel]")
    if (navdel) {
      nav.splice(+navdel.getAttribute("data-navdel"), 1)
      renderNav(); save(); return
    }
    var clear = t.closest("[data-imgclear]")
    if (clear) {
      var parts = clear.getAttribute("data-imgclear").split("|")
      setImage(parts[0], parts[1], parts[2], "")
      return
    }
    var lib = t.closest("[data-lib]")
    if (lib) {
      openLibrary(lib.getAttribute("data-lib").split("|"))
      return
    }
  })

  rail.addEventListener("input", function (e) {
    var t = e.target
    if (t.getAttribute("data-nav-label") !== null) { nav[+t.getAttribute("data-nav-label")].label = t.value; save(); return }
    if (t.getAttribute("data-nav-url") !== null) { nav[+t.getAttribute("data-nav-url")].url = t.value; save(); return }
    if (t.getAttribute("data-nav-label") !== null) { nav[+t.getAttribute("data-nav-label")].label = t.value; renderRail(); save(); return }
    if (t.getAttribute("data-nav-url") !== null) { nav[+t.getAttribute("data-nav-url")].url = t.value; save(); refreshSoon(); return }
    if (t.getAttribute("data-addlabel") !== null) { design.navAdd[+t.getAttribute("data-addlabel")].label = t.value; save(); refreshSoon(); return }
    if (t.getAttribute("data-addurl") !== null) { design.navAdd[+t.getAttribute("data-addurl")].url = t.value; save(); refreshSoon(); return }
    var deep = t.getAttribute("data-deep")
    if (deep) {
      var dparts = deep.split(".")
      design[dparts[0]] = design[dparts[0]] || {}
      design[dparts[0]][dparts[1]] = t.value
      save(); refreshSoon(); return
    }
    var hk = t.getAttribute("data-hide-key")
    if (hk) { design.hide[hk] = t.checked; save(); refreshSoon(); return }
    if (t.getAttribute("data-dict-from") !== null) {
      var di = +t.getAttribute("data-dict-from")
      design.dict[di] = design.dict[di] || { from: "", to: "" }
      design.dict[di].from = t.value
      save(); refreshSoon(); return
    }
    if (t.getAttribute("data-dict-to") !== null) {
      var dj = +t.getAttribute("data-dict-to")
      design.dict[dj] = design.dict[dj] || { from: "", to: "" }
      design.dict[dj].to = t.value
      save(); refreshSoon(); return
    }
    var foot = t.getAttribute("data-foot")
    if (foot) {
      var fp = foot.split(".")
      design.footerCols = design.footerCols || []
      if (fp.length === 2) design.footerCols[+fp[0]][fp[1]] = t.value
      else if (fp.length === 3 && design.footerCols[+fp[0]] && design.footerCols[+fp[0]].links[+fp[1]]) design.footerCols[+fp[0]].links[+fp[1]][fp[2]] = t.value
      if (frame.contentWindow) frame.contentWindow.postMessage({ t: "foot", col: fp[0], i: fp[1], part: fp.length === 2 ? fp[1] : fp[2], value: t.value }, "*")
      save()
      return
    }
    var scope = t.getAttribute("data-scope")
    if (!scope) return
    var key = t.getAttribute("data-key")
    var val = t.type === "checkbox" ? t.checked : t.value
    var NUM_KEYS = { scale: 1, textScale: 1, containerWidth: 1, logoSize: 1, radiusPx: 1, mobileCols: 1, badgeRadius: 1, btnBorderW: 1, btnRadius: 1, btn2BorderW: 1, btn2Radius: 1, swatchW: 1, swatchH: 1, swatchRadius: 1, swatchBorderW: 1, swatchBorderOp: 1, varBtnBorderW: 1, varBtnRadius: 1, inputBorderW: 1, inputRadius: 1, popRadius: 1, popBorderW: 1, cartMediaRadius: 1 }
    if (scope === "design") design[key] = NUM_KEYS[key] ? Number(val) : val
    else if (scope === "section") {
      var s = findSection(t.getAttribute("data-owner"))
      if (s) s.settings[key] = val
      if (frame.contentWindow) frame.contentWindow.postMessage({ t: "field", id: t.getAttribute("data-owner"), key: key, value: val }, "*")
    }
    else { var b = findBlock(t.getAttribute("data-owner")); if (b) b.settings[key] = val }
    if (scope === "design") {
      var badge = rail.querySelector('[data-v="' + key + '"]')
      if (badge) {
        var unit = badge.getAttribute("data-unit")
        badge.textContent = val + (unit != null ? unit : (key === "logoSize" || key === "radiusPx" || key === "containerWidth" ? " px" : key === "textScale" ? "×" : ""))
      }
      if (t.type === "color" || t.classList.contains("ed-hex")) {
        var box = t.closest(".ed-colors")
        if (box) {
          var picker = box.querySelector('input[type="color"]')
          var hex = box.querySelector(".ed-hex")
          if (t.type === "color" && hex && hex !== t) hex.value = t.value
          if (t.classList.contains("ed-hex") && picker && /^#[0-9a-f]{6}$/i.test(t.value)) picker.value = t.value
        }
      }
      liveStyle()
      var liveKeys = { scale: 1, textScale: 1, textAlign: 1, heroAlign: 1, containerWidth: 1, weight: 1, tracking: 1, font: 1, googleFamily: 1, accent: 1, bg: 1, ink: 1, radiusPx: 1, button: 1, headStyle: 1, headHeight: 1, headAlign: 1, logoSize: 1, logoPlace: 1, headBg: 1, headInk: 1, footBg: 1, footInk: 1, mobileText: 1, mobileTitle: 1, mobilePad: 1, mobileCols: 1, cardStyle: 1, searchAlign: 1 }
      if (key === "footerBrand" || key === "footerNote") {
        if (frame.contentWindow) frame.contentWindow.postMessage({ t: "foot", part: key === "footerBrand" ? "brand" : "note", value: val }, "*")
      }
      if (key === "searchHint" && frame.contentWindow) frame.contentWindow.postMessage({ t: "style", design: design }, "*")
      if (key === "payDirect" || key === "installOn" || key === "installN" || key === "cartOpenDrawer" || key === "cartNote" || key === "cartDiscount" || key === "cartMode" || key === "productForm" || key === "searchPlace" || key === "cardStyle" || key === "socialWhere" || key === "socialStyle" || key === "socialSize" || key === "heroLogo" || key === "showLogo" || key === "showName" || key === "logoPlace") { save({ reload: true }); return }
      if (liveKeys[key] || key === "searchHint" || key === "footerBrand" || key === "footerNote") { save({ quiet: true }); return }
    }
    save()
  })

  rail.addEventListener("change", function (e) {
    var t = e.target
    if (t.getAttribute("data-secprop")) {
      var sc = findSection(t.getAttribute("data-secid"))
      if (!sc) return
      var key = t.getAttribute("data-secprop")
      var v = t.value
      push()
      if (key === "pad") sc.pad = v === "" ? null : parseInt(v, 10)
      else if (key === "tsize") sc.tsize = v === "" ? null : parseFloat(v)
      else if (key === "imgH") sc.imgH = v === "" ? null : parseInt(v, 10)
      else if (key === "cols") sc.cols = v === "" ? null : parseInt(v, 10)
      else sc.wide = v
      if (frame.contentWindow) frame.contentWindow.postMessage({ t: "secstyle", id: sc.id, align: sc.align, tsize: sc.tsize, wide: sc.wide, pad: sc.pad }, "*")
      save({ quiet: true })
      return
    }
    if (t.getAttribute("data-prod")) {
      var owner = t.getAttribute("data-owner")
      var secP = findSection(owner)
      if (!secP) return
      var ids = []
      rail.querySelectorAll('[data-prod][data-owner="' + owner + '"]').forEach(function (c) { if (c.checked) ids.push(c.getAttribute("data-prod")) })
      secP.settings.ids = ids.length ? ids.join(",") : "0"
      save({ reload: true })
      return
    }
    if (t.getAttribute("data-scope") && t.tagName === "SELECT") {
      t.dispatchEvent(new Event("input", { bubbles: true }))
      return
    }
    if (!t.files || !t.files[0]) return
    var target = t.getAttribute("data-img")
    if (!target) return
    var parts = target.split("|")
    var f = t.files[0]
    if (f.size > 2.5 * 1024 * 1024) { alert("Image trop lourde (2,5 Mo max)."); return }
    var fr = new FileReader()
    fr.onload = function () {
      fetch("/dashboard/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: fr.result }),
      })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (!d.ok) { alert(d.error || "Envoi impossible"); return }
          setImage(parts[0], parts[1], parts[2], d.url)
        })
    }
    fr.readAsDataURL(f)
  })

  function openLibrary(parts) {
    fetch("/dashboard/media", { credentials: "same-origin" })
      .then(function (r) { return r.json() })
      .then(function (d) { paintLibrary(parts, (d && d.images) || []) })
      .catch(function () { paintLibrary(parts, []) })
  }
  function paintLibrary(parts, images) {
    var old = document.getElementById("ndzLib")
    if (old) old.remove()
    var box = document.createElement("div")
    box.id = "ndzLib"
    box.className = "ed-modal open"
    var cards = images.length
      ? images.map(function (u) {
        return '<button type="button" data-pick="' + esc(u) + '"><img src="' + esc(u) + '" alt=""></button>'
      }).join("")
      : '<p class="ed-hint">Aucune image dans la boutique. Envoie un fichier.</p>'
    box.innerHTML = '<div class="ed-modal-card ndz-lib-card"><div class="ed-modal-head"><h3>Bibliothèque</h3><button type="button" class="ed-modal-x" data-x>×</button></div><div class="ndz-lib">' + cards + "</div></div>"
    document.body.appendChild(box)
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.closest("[data-x]")) { box.remove(); return }
      var b = e.target.closest("[data-pick]")
      if (!b) return
      setImage(parts[0], parts[1], parts[2], b.getAttribute("data-pick"))
      box.remove()
    })
  }
  function setImage(scope, owner, key, url) {
    push()
    if (scope === "design") design[key] = url
    else if (scope === "section") { var s = findSection(owner); if (s) s.settings[key] = url }
    else {
      var b = findBlock(owner)
      if (b) b.settings[key] = url
    }
    renderRail()
    save()
  }

  /* ------------------------------ ordre mobile ------------------------------ */
  function mobileOrder() {
    var ids = state.map(function (s) { return s.id })
    var ordered = (design.mobileOrder || []).filter(function (id) { return ids.indexOf(id) !== -1 })
    ids.forEach(function (id) { if (ordered.indexOf(id) === -1) ordered.push(id) })
    design.mobileOrder = ordered
    return ordered
  }
  function mobileHtml() {
    return mobileOrder().map(function (id, i) {
      var s = findSection(id)
      if (!s) return ""
      return '<div class="ed-mrow"><b>' + esc(typeOf(s.type).name) + (s.hidden ? " (masquée)" : "") + "</b>" +
        '<button type="button" data-move="' + i + ':-1"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" data-move="' + i + ':1"' + (i === design.mobileOrder.length - 1 ? " disabled" : "") + ">↓</button></div>"
    }).join("")
  }
  function fontPack(d) {
    var meta = window.ED_DATA.fontMeta || {}
    var custom = String(d.googleFamily || "").trim()
    var fams = []
    if (/^[A-Za-z0-9 ]{2,40}$/.test(custom)) fams.push(custom)
    ;[d.font, d.fontTitle, d.fontSub, d.fontAccent].forEach(function (id) {
      var g = (meta[id] || {}).google || ""
      if (g && fams.indexOf(g) < 0) fams.push(g)
    })
    var stack = /^[A-Za-z0-9 ]{2,40}$/.test(custom)
      ? "'" + custom.replace(/'/g, "") + "', system-ui, sans-serif"
      : ((meta[d.font] || {}).stack || "'Inter', system-ui, sans-serif")
    var href = fams.length
      ? "https://fonts.googleapis.com/css2?family=" + fams.map(function (f) {
          return encodeURIComponent(f).replace(/%20/g, "+") + ":wght@400;700"
        }).join("&family=") + "&display=swap"
      : ""
    return { fontStack: stack, fontHref: href }
  }
  function liveStyle() {
    if (!frame.contentWindow) return
    var extra = fontPack(design)
    var payload = {}
    Object.keys(design).forEach(function (k) { payload[k] = design[k] })
    payload.fontStack = extra.fontStack
    payload.fontHref = extra.fontHref
    frame.contentWindow.postMessage({ t: "style", design: payload }, "*")
  }


  /* ------------------- vignettes d'aperçu (façon Shopify) ------------------- */
  var WIRE = {
    cats: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="12" y="18" width="34" height="34" rx="6" fill="#DDE0E5"/>' +
      '<rect x="52" y="18" width="34" height="34" rx="6" fill="#DDE0E5"/>' +
      '<rect x="92" y="18" width="34" height="34" rx="6" fill="#DDE0E5"/>' +
      '<rect x="132" y="18" width="24" height="34" rx="6" fill="#E7E9ED"/>' +
      '<rect x="14" y="58" width="24" height="4" rx="2" fill="#B9BEC7"/>' +
      '<rect x="54" y="58" width="24" height="4" rx="2" fill="#B9BEC7"/>' +
      '<rect x="94" y="58" width="24" height="4" rx="2" fill="#B9BEC7"/>' +
      '<rect x="12" y="76" width="144" height="12" rx="6" fill="#FFD400"/></svg>',
    hero: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="10" y="10" width="148" height="58" rx="6" fill="#DDE0E5"/>' +
      '<rect x="46" y="26" width="76" height="7" rx="3.5" fill="#1A1A1A"/>' +
      '<rect x="60" y="39" width="48" height="4" rx="2" fill="#B9BEC7"/>' +
      '<rect x="66" y="49" width="36" height="11" rx="5.5" fill="#FFD400"/>' +
      '<rect x="52" y="78" width="64" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="64" y="87" width="40" height="4" rx="2" fill="#D6DAE0"/></svg>',
    grid: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="10" y="8" width="50" height="6" rx="3" fill="#1A1A1A"/>' +
      [[10,22],[88,22],[10,60],[88,60]].map(function (c) {
        return '<rect x="' + c[0] + '" y="' + c[1] + '" width="70" height="24" rx="5" fill="#DDE0E5"/>' +
          '<rect x="' + (c[0] + 6) + '" y="' + (c[1] + 28) + '" width="34" height="4" rx="2" fill="#C2C7CF"/>'
      }).join("") + "</svg>",
    featured: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="10" y="10" width="74" height="84" rx="6" fill="#DDE0E5"/>' +
      '<rect x="94" y="26" width="58" height="7" rx="3.5" fill="#1A1A1A"/>' +
      '<rect x="94" y="40" width="64" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="94" y="49" width="52" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="94" y="62" width="34" height="11" rx="5.5" fill="#FFD400"/></svg>',
    text: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="34" y="24" width="100" height="8" rx="4" fill="#1A1A1A"/>' +
      '<rect x="26" y="42" width="116" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="34" y="51" width="100" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="46" y="60" width="76" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="66" y="74" width="36" height="9" rx="4.5" fill="#FFD400"/></svg>',
    html: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="10" y="10" width="90" height="84" rx="6" fill="#DDE0E5"/>' +
      '<circle cx="55" cy="52" r="14" fill="#FFFFFF" opacity=".85"/>' +
      '<path d="M51 45l11 7-11 7z" fill="#1A1A1A"/>' +
      '<rect x="108" y="16" width="50" height="7" rx="3.5" fill="#1A1A1A"/>' +
      '<rect x="108" y="30" width="46" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="108" y="39" width="38" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="108" y="52" width="50" height="30" rx="5" fill="#FFFFFF" stroke="#DDE0E5"/></svg>',
    banner: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="0" y="38" width="168" height="28" fill="#1A1A1A"/>' +
      '<rect x="34" y="47" width="66" height="4" rx="2" fill="#FFFFFF" opacity=".9"/>' +
      '<rect x="34" y="55" width="42" height="4" rx="2" fill="#FFFFFF" opacity=".55"/>' +
      '<rect x="114" y="47" width="30" height="11" rx="5.5" fill="#FFD400"/>' +
      '<rect x="10" y="74" width="60" height="4" rx="2" fill="#D6DAE0"/>' +
      '<rect x="10" y="20" width="48" height="4" rx="2" fill="#D6DAE0"/></svg>',
    benefits: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      [0, 1, 2].map(function (i) {
        var x = 12 + i * 50
        return '<circle cx="' + (x + 14) + '" cy="34" r="11" fill="#DDE0E5"/>' +
          '<rect x="' + x + '" y="52" width="40" height="5" rx="2.5" fill="#1A1A1A"/>' +
          '<rect x="' + x + '" y="63" width="34" height="4" rx="2" fill="#C2C7CF"/>' +
          '<rect x="' + x + '" y="72" width="28" height="4" rx="2" fill="#C2C7CF"/>'
      }).join("") + "</svg>",
    faq: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="34" y="10" width="72" height="6" rx="3" fill="#1A1A1A"/>' +
      [0, 1, 2].map(function (i) {
        var y = 26 + i * 24
        return '<rect x="14" y="' + y + '" width="140" height="18" rx="5" fill="#FFFFFF" stroke="#DDE0E5"/>' +
          '<rect x="22" y="' + (y + 7) + '" width="66" height="4" rx="2" fill="#C2C7CF"/>' +
          '<path d="M140 ' + (y + 6) + 'l4 4 4-4" stroke="#9AA0AA" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
      }).join("") + "</svg>",
    gallery: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      [0, 1, 2].map(function (i) {
        var x = 10 + i * 50
        return '<rect x="' + x + '" y="22" width="44" height="44" rx="5" fill="#DDE0E5"/>' +
          '<rect x="' + x + '" y="72" width="30" height="4" rx="2" fill="#C2C7CF"/>'
      }).join("") + "</svg>",
    carousel: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="10" y="10" width="56" height="6" rx="3" fill="#1A1A1A"/>' +
      [0, 1, 2].map(function (i) {
        var x = 10 + i * 50
        return '<rect x="' + x + '" y="26" width="42" height="42" rx="5" fill="#DDE0E5"/>' +
          '<rect x="' + x + '" y="74" width="30" height="4" rx="2" fill="#C2C7CF"/>'
      }).join("") +
      '<circle cx="150" cy="47" r="10" fill="#FFFFFF" stroke="#DDE0E5"/>' +
      '<path d="M147 43l6 4-6 4z" fill="#1A1A1A"/></svg>',
    media_text: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="10" y="16" width="70" height="72" rx="6" fill="#DDE0E5"/>' +
      '<rect x="92" y="30" width="60" height="7" rx="3.5" fill="#1A1A1A"/>' +
      '<rect x="92" y="44" width="66" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="92" y="53" width="54" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="92" y="68" width="38" height="11" rx="5.5" fill="#FFD400"/></svg>',
    reviews: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="12" y="10" width="30" height="14" rx="3" fill="#1A1A1A"/>' +
      '<rect x="46" y="14" width="60" height="6" rx="3" fill="#E8B007"/>' +
      [[10, 34], [88, 34]].map(function (c) {
        return '<rect x="' + c[0] + '" y="' + c[1] + '" width="70" height="54" rx="6" fill="#FFFFFF" stroke="#DDE0E5"/>' +
          '<rect x="' + (c[0] + 8) + '" y="' + (c[1] + 10) + '" width="34" height="5" rx="2.5" fill="#E8B007"/>' +
          '<rect x="' + (c[0] + 8) + '" y="' + (c[1] + 22) + '" width="54" height="4" rx="2" fill="#C2C7CF"/>' +
          '<rect x="' + (c[0] + 8) + '" y="' + (c[1] + 30) + '" width="46" height="4" rx="2" fill="#C2C7CF"/>' +
          '<circle cx="' + (c[0] + 15) + '" cy="' + (c[1] + 45) + '" r="6" fill="#DDE0E5"/>'
      }).join("") + "</svg>",
    shipping: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="0" y="40" width="168" height="26" fill="#1A1A1A"/>' +
      '<circle cx="22" cy="53" r="6" fill="#FFD400"/>' +
      '<rect x="34" y="50" width="52" height="5" rx="2.5" fill="#FFFFFF" opacity=".9"/>' +
      '<rect x="96" y="50" width="30" height="5" rx="2.5" fill="#FFFFFF" opacity=".55"/>' +
      '<rect x="132" y="50" width="26" height="5" rx="2.5" fill="#FFFFFF" opacity=".55"/>' +
      '<rect x="14" y="18" width="70" height="5" rx="2.5" fill="#D6DAE0"/>' +
      '<rect x="14" y="78" width="46" height="5" rx="2.5" fill="#D6DAE0"/></svg>',
    offer: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="10" y="14" width="66" height="76" rx="6" fill="#DDE0E5"/>' +
      '<rect x="86" y="20" width="52" height="6" rx="3" fill="#1A1A1A"/>' +
      [0, 1, 2, 3].map(function (i) {
        return '<rect x="' + (86 + i * 20) + '" y="34" width="16" height="18" rx="4" fill="#1A1A1A"/>' +
          '<rect x="' + (86 + i * 20 + 4) + '" y="38" width="8" height="5" rx="2" fill="#FFD400"/>'
      }).join("") +
      '<rect x="86" y="62" width="44" height="10" rx="5" fill="#FFD400"/></svg>',
    whatsapp: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="14" y="16" width="140" height="34" rx="6" fill="#DDE0E5"/>' +
      '<rect x="0" y="66" width="168" height="30" fill="#128C7E"/>' +
      '<rect x="16" y="77" width="72" height="6" rx="3" fill="#FFFFFF" opacity=".85"/>' +
      '<rect x="112" y="72" width="44" height="16" rx="8" fill="#FFFFFF"/>' +
      '<rect x="120" y="78" width="28" height="4" rx="2" fill="#0B6B5F"/></svg>',
    stats: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      [0, 1, 2].map(function (i) {
        var x = 10 + i * 50
        return '<rect x="' + x + '" y="28" width="44" height="48" rx="6" fill="#FFFFFF" stroke="#DDE0E5"/>' +
          '<rect x="' + (x + 8) + '" y="40" width="26" height="9" rx="4" fill="#1A1A1A"/>' +
          '<rect x="' + (x + 8) + '" y="56" width="30" height="4" rx="2" fill="#C2C7CF"/>'
      }).join("") + "</svg>",
    steps: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      [0, 1, 2].map(function (i) {
        var x = 14 + i * 50
        return '<circle cx="' + (x + 10) + '" cy="34" r="10" fill="#1A1A1A"/>' +
          '<rect x="' + x + '" y="52" width="36" height="5" rx="2.5" fill="#1A1A1A"/>' +
          '<rect x="' + x + '" y="63" width="30" height="4" rx="2" fill="#C2C7CF"/>' +
          (i < 2 ? '<rect x="' + (x + 24) + '" y="33" width="40" height="2" fill="#DDE0E5"/>' : "")
      }).join("") + "</svg>",
    quote: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<circle cx="84" cy="52" r="26" fill="#DDE0E5"/>' +
      '<rect x="40" y="42" width="88" height="6" rx="3" fill="#1A1A1A"/>' +
      '<rect x="52" y="55" width="64" height="5" rx="2.5" fill="#C2C7CF"/>' +
      '<rect x="70" y="70" width="28" height="4" rx="2" fill="#C2C7CF"/></svg>',
    columns: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      [0, 1, 2].map(function (i) {
        var x = 10 + i * 50
        return '<rect x="' + x + '" y="14" width="40" height="34" rx="5" fill="#DDE0E5"/>' +
          '<rect x="' + x + '" y="54" width="32" height="5" rx="2.5" fill="#1A1A1A"/>' +
          '<rect x="' + x + '" y="65" width="38" height="4" rx="2" fill="#C2C7CF"/>' +
          '<rect x="' + x + '" y="74" width="26" height="4" rx="2" fill="#C2C7CF"/>'
      }).join("") + "</svg>",
    video: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="14" y="16" width="140" height="64" rx="7" fill="#1A1A1A"/>' +
      '<circle cx="84" cy="48" r="16" fill="#FFFFFF" opacity=".9"/>' +
      '<path d="M79 40l14 8-14 8z" fill="#1A1A1A"/>' +
      '<rect x="14" y="88" width="70" height="4" rx="2" fill="#C2C7CF"/></svg>',
    social: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="58" y="20" width="52" height="6" rx="3" fill="#1A1A1A"/>' +
      [0, 1, 2, 3, 4].map(function (i) {
        var x = 22 + i * 26
        return '<circle cx="' + (x + 9) + '" cy="56" r="11" fill="#DDE0E5"/>' +
          '<circle cx="' + (x + 9) + '" cy="56" r="4" fill="#9AA0AA"/>'
      }).join("") +
      '<rect x="46" y="80" width="76" height="4" rx="2" fill="#C2C7CF"/></svg>',
    cta: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="36" y="28" width="96" height="8" rx="4" fill="#1A1A1A"/>' +
      '<rect x="48" y="44" width="72" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="54" y="60" width="60" height="16" rx="8" fill="#1A1A1A"/>' +
      '<rect x="66" y="66" width="36" height="4" rx="2" fill="#FFFFFF"/></svg>',
    spacer: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="14" y="22" width="60" height="8" rx="4" fill="#DDE0E5"/>' +
      '<rect x="14" y="76" width="60" height="8" rx="4" fill="#DDE0E5"/>' +
      '<path d="M84 34v38" stroke="#9AA0AA" stroke-width="1.6" stroke-dasharray="4 4"/>' +
      '<path d="M84 30l-3 5h6z" fill="#9AA0AA"/><path d="M84 76l-3-5h6z" fill="#9AA0AA"/>' +
      '<rect x="98" y="46" width="56" height="4" rx="2" fill="#C2C7CF"/>' +
      '<rect x="98" y="56" width="40" height="4" rx="2" fill="#C2C7CF"/></svg>',
    generic: '<svg viewBox="0 0 168 104" aria-hidden="true"><rect width="168" height="104" rx="9" fill="#F3F4F6"/>' +
      '<rect x="16" y="16" width="136" height="30" rx="5" fill="#DDE0E5"/>' +
      '<rect x="16" y="56" width="64" height="32" rx="5" fill="#DDE0E5"/>' +
      '<rect x="88" y="56" width="64" height="32" rx="5" fill="#DDE0E5"/></svg>'
  }
  function wire(t) { return WIRE[t] || WIRE.generic }

  /* ------------------------------ palette ------------------------------ */
  var LOOKS = {
    reviews: [
      ["cartes", "Cartes", "Étoiles, prénom, photo", "/demo/exemple.jpg"],
      ["citation", "Citation", "Une grande phrase, le reste en dessous", "/demo/demo-robe.jpg"],
      ["liste", "Liste", "Avis en lignes compactes", "/demo/demo-foulard.jpg"],
      ["bandeau", "Défilement", "Les avis glissent sur le côté", "/demo/demo-sac.jpg"],
      ["note", "Note à gauche", "La moyenne en grand, les avis à droite", "/demo/demo-sandales.jpg"],
      ["polaroid", "Polaroïd", "La photo au-dessus du texte", "/demo/demo-robe.jpg"],
    ],
    benefits: [
      ["ligne", "Icônes en ligne", "Icône, titre, détail", "/demo/exemple.jpg"],
      ["cartes", "Cartes", "Chaque argument dans une carte", "/demo/demo-sac.jpg"],
      ["numeros", "Numéros", "01, 02, 03", "/demo/demo-foulard.jpg"],
      ["bandeau", "Bandeau sombre", "Une bande noire", "/demo/demo-sandales.jpg"],
      ["colonnes", "Grandes colonnes", "Titre fort, sans icône", "/demo/demo-robe.jpg"],
      ["pastilles", "Pastilles", "Icône ronde au-dessus", "/demo/exemple.jpg"],
    ],
    faq: [
      ["accordeon", "Accordéon", "On ouvre la question", "/demo/exemple.jpg"],
      ["colonnes", "Deux colonnes", "Les questions côte à côte", "/demo/demo-foulard.jpg"],
      ["ouvertes", "Réponses ouvertes", "Tout est déjà visible", "/demo/demo-robe.jpg"],
      ["liste", "Liste simple", "Question en gras, réponse dessous", "/demo/demo-sac.jpg"],
      ["bordee", "Filet", "Un trait à gauche", "/demo/demo-sandales.jpg"],
      ["sombre", "Fond sombre", "Questions sur fond noir", "/demo/exemple.jpg"],
      ["cartes", "Cartes", "Chaque question dans une carte", "/demo/demo-robe.jpg"],
    ],
  }
  function exampleBlocks(type, look) {
    if (type === "reviews") return [
      { name: "Amina", city: "Blida", rating: 5, text: "Livraison rapide, la pièce est encore plus belle que sur la photo.", image: "/demo/exemple.jpg" },
      { name: "Yacine", city: "Oran", rating: 5, text: "Bien emballé, taille juste.", image: "" },
      { name: "Sara", city: "Alger", rating: 4, text: "Je recommande, le tissu est doux.", image: "/demo/demo-foulard.jpg" },
    ].map(function (s) { return { id: uid("b"), settings: s } })
    if (type === "benefits") return [
      { icon: "camion", title: "Livraison 58 wilayas", text: "Chez vous ou au bureau" },
      { icon: "paiement", title: "Paiement à la livraison", text: "Vous payez en recevant" },
      { icon: "retour", title: "Échange 7 jours", text: "Si la pièce ne convient pas" },
    ].map(function (s) { return { id: uid("b"), settings: s } })
    if (type === "faq") return [
      { q: "Quels sont les délais ?", a: "2 à 5 jours selon la wilaya." },
      { q: "Je paie comment ?", a: "À la livraison, en espèces." },
      { q: "Puis-je échanger ?", a: "Oui, sous 7 jours, article non porté." },
    ].map(function (s) { return { id: uid("b"), settings: s } })
    return null
  }
  function addSection(type, look) {
    var def = typeOf(type)
    push()
    var s = { id: uid(), type: type, settings: Object.assign({}, def.defaults || {}), blocks: [] }
    if (look) s.settings.look = look
    if (type === "carousel") s.settings.ids = PRODUCTS.map(function (p) { return p.id }).join(",")
    var samples = exampleBlocks(type, look)
    if (samples) s.blocks = samples
    else {
      var bdef = BLOCKS[type]
      if (bdef) {
        var n = bdef.min || 1
        for (var i = 0; i < n; i++) s.blocks.push({ id: uid("b"), settings: Object.assign({}, bdef.defaults || {}) })
      }
    }
    state.push(s)
    selected = s.id
    $("edModal").classList.remove("open")
    noteStructure()
    renderRail()
    save({ reload: true })
    toast("Bloc ajouté. Tu peux modifier chaque texte.")
  }
  function showLooks(type) {
    var looks = LOOKS[type] || []
    var box = $("edPalette")
    box.innerHTML = '<p class="ed-hint">Choisis le style avant de le poser. Tu pourras changer les textes ensuite.</p><div class="ed-looks">' +
      looks.map(function (l) {
        return '<button type="button" class="ed-look" data-look="' + l[0] + '" data-looktype="' + type + '">' +
          '<span class="ed-look-sketch sk-' + l[0] + '" aria-hidden="true"></span>' +
          '<span><b>' + esc(l[1]) + '</b><i>' + esc(l[2]) + '</i></span></button>'
      }).join("") + '</div><button type="button" class="ed-linkbtn" data-lookback="1">Retour</button>'
  }
  var PICK_GROUPS = [
    ["Bannières", [["hero", "Bannière principale"], ["banner", "Barre d'annonces"], ["offer", "Offre du jour"]]],
    ["Produits", [["grid", "Collection en vedette : Grille"], ["carousel", "Carrousel"], ["featured", "Produit en vedette"], ["cats", "Liste de collections"]]],
    ["Narration", [["gallery", "Galerie"], ["video", "Vidéo"], ["quote", "Citation"], ["columns", "Multicolonne"], ["reviews", "Avis"], ["steps", "Notre histoire"], ["stats", "Chiffres"]]],
    ["Texte", [["text", "Texte enrichi"], ["faq", "FAQ"], ["benefits", "Icônes avec texte"], ["shipping", "Bandeau"], ["cta", "Appel à l'action"], ["social", "Réseaux"], ["spacer", "Séparateur"]]],
    ["Mise en page", [["html", "HTML personnalisé"], ["whatsapp", "Bouton WhatsApp"]]],
  ]
  function showPalette() {
    var card = document.querySelector("#edModal .ed-modal-card")
    if (card) card.classList.add("hz-picker")
    var known = {}
    TYPES.forEach(function (t) { known[t.id] = t })
    var items = []
    PICK_GROUPS.forEach(function (g) {
      var rows = g[1].filter(function (r) { return known[r[0]] })
      if (!rows.length) return
      items.push('<div class="hz-group">' + esc(g[0]) + "</div>")
      rows.forEach(function (r) {
        items.push('<button type="button" class="hz-item" data-type="' + r[0] + '" data-wire="' + r[0] + '">' + esc(r[1]) + "</button>")
      })
    })
    var first = (PICK_GROUPS[0][1][0] || ["hero"])[0]
    $("edPalette").innerHTML =
      '<div class="hz-pick">' +
      '<div class="hz-pick-side">' +
      '<input class="hz-search" id="hzSearch" placeholder="Rechercher des sections" aria-label="Rechercher des sections">' +
      '<div class="hz-tabs"><button type="button" class="on" data-picktab="sections">Sections</button><button type="button" data-picktab="apps">Applications</button></div>' +
      '<div class="hz-list" id="hzList">' + items.join("") + "</div>" +
      '<div class="hz-apps" id="hzApps" hidden>Aucune application installée. On n\'ajoute pas de fausses apps.</div>' +
      "</div>" +
      '<div class="hz-preview"><div class="hz-preview-card" id="hzPreview">' + wire(first) + "</div></div>" +
      "</div>"
    $("edModal").classList.add("open")
    var search = $("hzSearch")
    if (search) search.addEventListener("input", function () {
      var q = search.value.toLowerCase()
      document.querySelectorAll("#hzList .hz-item").forEach(function (b) {
        b.hidden = q && b.textContent.toLowerCase().indexOf(q) === -1
      })
    })
    $("edPalette").onmouseover = function (e) {
      var b = e.target.closest && e.target.closest("[data-wire]")
      var prev = $("hzPreview")
      if (b && prev) prev.innerHTML = wire(b.getAttribute("data-wire"))
    }
    $("edPalette").onclick = function (e) {
      var pickTab = e.target.closest && e.target.closest("[data-picktab]")
      if (!pickTab) return
      var which = pickTab.getAttribute("data-picktab")
      var list = $("hzList"), apps = $("hzApps")
      if (list) list.hidden = which === "apps"
      if (apps) apps.hidden = which !== "apps"
      var tabs = pickTab.parentNode.querySelectorAll("[data-picktab]")
      for (var ti = 0; ti < tabs.length; ti++) tabs[ti].classList.toggle("on", tabs[ti] === pickTab)
      e.stopPropagation()
    }
  }
  $("edModalX").addEventListener("click", function () { $("edModal").classList.remove("open") })
  $("edModal").addEventListener("click", function (e) { if (e.target.id === "edModal") e.currentTarget.classList.remove("open") })
  $("edPalette").addEventListener("click", function (e) {
    if (e.target.closest("[data-lookback]")) { showPalette(); return }
    var lookBtn = e.target.closest("[data-look]")
    if (lookBtn) { addSection(lookBtn.getAttribute("data-looktype"), lookBtn.getAttribute("data-look")); return }
    var b = e.target.closest("[data-type]")
    if (!b) return
    var type = b.getAttribute("data-type")
    addSection(type)
  })

  /* ------------------------------ glisser-déposer ------------------------------ */
  rail.addEventListener("dragstart", function (e) {
    var card = e.target.closest(".ed-card")
    if (!card || e.target.closest(".ed-block")) {
      var blk = e.target.closest(".ed-block")
      if (blk) { dragId = "block:" + blk.getAttribute("data-block"); e.dataTransfer.effectAllowed = "move" }
      return
    }
    dragId = "section:" + card.getAttribute("data-id")
    card.classList.add("dragging")
    e.dataTransfer.effectAllowed = "move"
  })
  rail.addEventListener("dragend", function (e) {
    var card = e.target.closest(".ed-card")
    if (card) card.classList.remove("dragging")
    dragId = null
  })
  rail.addEventListener("dragover", function (e) {
    var card = e.target.closest(".ed-card")
    if (!card || !dragId) return
    e.preventDefault()
    card.classList.add("drop")
  })
  rail.addEventListener("dragleave", function (e) {
    var card = e.target.closest(".ed-card")
    if (card) card.classList.remove("drop")
  })
  rail.addEventListener("drop", function (e) {
    var card = e.target.closest(".ed-card")
    if (!card || !dragId) return
    e.preventDefault()
    card.classList.remove("drop")
    var targetId = card.getAttribute("data-id")
    if (dragId.indexOf("section:") === 0) {
      var src = dragId.slice(8)
      if (src === targetId) return
      push()
      var item = findSection(src)
      state = state.filter(function (s) { return s.id !== src })
      var idx = state.findIndex(function (s) { return s.id === targetId })
      state.splice(idx < 0 ? state.length : idx, 0, item)
      noteStructure()
      renderRail(); save()
    } else {
      var bid = dragId.slice(6)
      var parent = card.getAttribute("data-id")
      var parentSec = findSection(parent)
      var from = null, fromSec = null
      state.forEach(function (s) {
        s.blocks.forEach(function (b) { if (b.id === bid) { from = b; fromSec = s } })
      })
      if (!from || !parentSec || !parentSec.blocks || fromSec !== parentSec) return
      push()
      parentSec.blocks = parentSec.blocks.filter(function (b) { return b.id !== bid })
      parentSec.blocks.push(from)
      noteStructure()
      renderRail(); save()
    }
  })

  /* ------------------------------ aperçu ------------------------------ */
  /* petite bulle de confirmation, en bas de l'éditeur */
  var toastBox = null, toastTimer = null
  function showInRail(el) {
    if (!el || !rail) return
    var top = 0, n = el
    while (n && n !== rail) { top += n.offsetTop || 0; n = n.offsetParent }
    rail.scrollTop = Math.max(0, top - 48)
  }
  function toast(msg) {
    if (!toastBox) {
      toastBox = document.createElement("div")
      toastBox.id = "edToast"
      document.body.appendChild(toastBox)
    }
    toastBox.textContent = msg
    toastBox.classList.add("on")
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { toastBox.classList.remove("on") }, 2600)
  }

  /* ouvre une section de l'onglet Thème et la montre (même si elle était repliée) */
  function openThemeSec(name) {
    TAB = "theme"
    OPEN_SECS[name] = true
    renderRail()
    var heads = rail.querySelectorAll("[data-sec]")
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getAttribute("data-sec") === name) {
        var box = heads[i].parentNode
        box.classList.add("open", "flash")
        showInRail(box)
        setTimeout(function () { box.classList.remove("flash") }, 1400)
        return
      }
    }
  }

  /* où chaque zone de l'aperçu renvoie */
  var AREA_SEC = {
    brand: "Logo et favicon",
    search: "Recherche",
    social: "Réseaux sociaux",
    footer: "Pied de page",
    cartlink: "Panier",
    cart: "Panier",
    buy: "Fiche produit",
    variants: "Sélecteurs de variantes",
    header: null,
  }

  window.addEventListener("message", function (e) {
    var d = e.data || {}
    if (d.t === "act") {
      if (d.what === "search" && d.op === "delete") {
        design.searchPlace = "aucune"
        toast("Recherche retirée")
      } else if (d.what === "search" && d.op === "place") {
        design.searchAlign = d.value || "droite"
        if (design.searchPlace === "aucune") design.searchPlace = "icone"
        toast("Recherche déplacée")
      } else if (d.what === "logo" && d.op === "delete") {
        design.showLogo = false
        design.logo = ""
        toast("Logo retiré")
      } else if (d.what === "logo" && d.op === "place") {
        design.logoPlace = d.value || "gauche"
        design.showLogo = true
        toast("Logo déplacé")
      } else return
      if (TAB === "theme") renderRail()
      save()
      return
    }
    if (d.t !== "pick") return

    /* section de page : on la sélectionne dans l'onglet Sections */
    if (d.id) {
      selected = d.id
      if (TAB !== "sections") { TAB = "sections" }
      renderRail()
      var card = rail.querySelector('[data-id="' + d.id + '"]')
      if (card) showInRail(card)
      return
    }

    /* barre de navigation et en-tête */
    if (d.area === "nav" || d.area === "header") {
      TAB = "head"
      renderRail()
      var pane = rail.querySelector(".ed-pane")
      if (pane) showInRail(pane)
      if (d.area === "nav") toast("Barre de navigation : les liens se modifient ici")
      return
    }

    /* données du produit : ça s'édite dans la fiche produit, pas dans le design */
    if (d.area === "productTitle" || d.area === "productPrice" || d.area === "productDesc" || d.area === "productPhotos") {
      var fields = {
        productTitle: ["Titre", "title"], productPrice: ["Prix", "price"],
        productDesc: ["Description", "description"], productPhotos: ["Photos", "photos"],
      }
      var f = fields[d.area]
      if (d.product) {
        window.open("/dashboard/products/" + d.product, "_blank")
        toast(f[0] + " : la fiche produit s'ouvre dans un nouvel onglet")
      } else {
        toast("Ouvre un produit dans la liste pour modifier son " + f[0].toLowerCase())
      }
      return
    }

    /* avis, description longue : cases à cocher de l'onglet Pages */
    if (d.area === "reviews") {
      TAB = "pages"
      renderRail()
      var hide = rail.querySelector('[data-hide-key="productReviews"]')
      if (hide) {
        var lab = hide.closest("label") || hide
        lab
        lab.classList.add("flash")
        setTimeout(function () { lab.classList.remove("flash") }, 1400)
      }
      return
    }

    /* champs du formulaire de commande */
    if (d.area === "form") {
      window.open("/dashboard/formulaire", "_blank")
      toast("Champs du formulaire : ils s'ouvrent dans un nouvel onglet")
      return
    }

    var name = AREA_SEC[d.area]
    if (name) {
      openThemeSec(name)
      toast(d.label ? d.label + " : modifiable ici" : "Modifiable ici")
    }
  })

  /* --------------------------- SÉLECTEUR DE PAGE --------------------------- */
  var pageSelect = document.getElementById("edPageSelect")
  if (pageSelect && PREVIEWS.length) {
    pageSelect.innerHTML = PREVIEWS.map(function (p) {
      return '<option value="' + p.key + '">' + esc(p.label) + "</option>"
    }).join("")
    pageSelect.value = CURRENT_PAGE
    pageSelect.addEventListener("change", function () {
      goPage(pageSelect.value)
      if (TAB === "pages") {
        renderRail()
        var d = rail.querySelector('[data-page-key="' + CURRENT_PAGE + '"]')
        if (d) { d.open = true; showInRail(d) }
      }
    })
  }

  var pageCssBtn = document.getElementById("edPageCss")
  if (pageCssBtn) pageCssBtn.addEventListener("click", function () {
    TAB = "pages"; renderRail()
    var d = rail.querySelector('[data-page-key="' + CURRENT_PAGE + '"]')
    if (d) { d.open = true; showInRail(d) }
  })

  var PAGE_VARS = [
    ["logo", "Logo"], ["nom", "Nom"], ["menu", "Menu"], ["recherche", "Recherche"],
    ["produits", "Produits"], ["contenu", "Page du thème"], ["formulaire", "Formulaire"],
    ["panier", "Panier"], ["achat", "Achat"], ["pied", "Pied"], ["telephone", "Téléphone"], ["wilaya", "Wilaya"],
  ]
  var STARTERS = {
    home: "<section class=\"ndz-page\">\n  {{logo}}\n  <h1>{{nom}}</h1>\n  {{recherche}}\n  {{menu}}\n  {{produits}}\n  {{pied}}\n</section>\n",
    product: "<section class=\"ndz-page\">\n  {{logo}}\n  {{menu}}\n  {{achat}}\n</section>\n",
    cart: "<section class=\"ndz-page\">\n  {{menu}}\n  {{panier}}\n</section>\n",
    checkout: "<section class=\"ndz-page\">\n  {{logo}}\n  <h1>Commander</h1>\n  {{formulaire}}\n</section>\n",
  }
  function pageLabelNow() {
    for (var i = 0; i < PREVIEWS.length; i++) if (PREVIEWS[i].key === CURRENT_PAGE) return PREVIEWS[i].label
    return "Page"
  }
  function insertAt(el, text) {
    var start = el.selectionStart || 0
    var end = el.selectionEnd || 0
    el.value = el.value.slice(0, start) + text + el.value.slice(end)
    el.focus()
    el.selectionStart = el.selectionEnd = start + text.length
  }
  var generatedCode = {}
  var sourceFlight = {}
  var codeHand = {}
  var railCodeKey = ""
  var railCodeVal = ""
  function normCode(s) { return String(s || "").replace(/\s+/g, " ").trim() }
  function paintVars() {
    var box = $("edVars")
    if (!box) return
    box.innerHTML = PAGE_VARS.map(function (v) {
      return '<button type="button" data-var="' + v[0] + '">' + esc(v[1]) + ' <code>{{' + v[0] + '}}</code></button>'
    }).join("")
  }
  function ensureSource(key) {
    if (design.pageCode[key]) return Promise.resolve(design.pageCode[key])
    if (generatedCode[key]) return Promise.resolve(generatedCode[key])
    if (sourceFlight[key]) return sourceFlight[key]
    sourceFlight[key] = fetch("/dashboard/design/source?page=" + encodeURIComponent(key))
      .then(function (r) { return r.json() })
      .then(function (d) {
        generatedCode[key] = (d && d.html) || ""
        return generatedCode[key]
      })
      .catch(function () { return "" })
      .then(function (html) { delete sourceFlight[key]; return html })
    return sourceFlight[key]
  }
  function sectionNames() {
    return state.filter(function (s) { return !s.hidden }).map(function (s) {
      var t = typeOf(s.type)
      return (t && t.name) || s.type
    })
  }
  function refreshOpenCode() {
    var box = $("edCodeBox")
    var modal = $("edCodeModal")
    if (box && modal && modal.classList.contains("open") && document.activeElement !== box) fillPageCode(box)
    var rail = $("edRailCode")
    if (rail && document.activeElement !== rail) fillPageCode(rail)
  }
  /* un glisser ou un ajout dans l'affichage se retrouve dans le code */
  function noteStructure() {
    delete generatedCode[CURRENT_PAGE]
    if (!codeHand[CURRENT_PAGE]) {
      delete design.pageCode[CURRENT_PAGE]
      if (railCodeKey === CURRENT_PAGE) { railCodeKey = ""; railCodeVal = "" }
      return
    }
    if (!design.pageCode[CURRENT_PAGE]) return
    var note = "<!-- Blocs de l'affichage : " + sectionNames().join(" · ") + " -->"
    var cur = String(design.pageCode[CURRENT_PAGE]).replace(/<!-- Blocs de l'affichage :[\s\S]*?-->\n?/, "")
    design.pageCode[CURRENT_PAGE] = note + "\n" + cur
    railCodeKey = CURRENT_PAGE
    railCodeVal = design.pageCode[CURRENT_PAGE]
  }
  function fillPageCode(el) {
    if (!el) return
    if (railCodeKey === CURRENT_PAGE && railCodeVal && railCodeVal.indexOf("Chargement du code") !== 0) {
      el.value = railCodeVal
      return
    }
    if (design.pageCode[CURRENT_PAGE]) {
      el.value = design.pageCode[CURRENT_PAGE]
      return
    }
    el.value = "Chargement du code de la page…"
    var key = CURRENT_PAGE
    ensureSource(key).then(function (html) {
      if (!el.isConnected || CURRENT_PAGE !== key) return
      if (document.activeElement === el && el.value.indexOf("Chargement du code") !== 0) return
      el.value = html || ""
    })
  }
  function openCodeModal() {
    $("edCodeTitle").textContent = "Code — " + pageLabelNow()
    paintVars()
    $("edCodeModal").classList.add("open")
    var box = $("edCodeBox")
    if (railCodeKey === CURRENT_PAGE && railCodeVal && railCodeVal.indexOf("Chargement du code") !== 0) {
      box.value = railCodeVal
    } else {
      fillPageCode(box)
    }
    box.focus()
  }
  function savePageCode(value) {
    value = value || ""
    if (value.indexOf("Chargement du code") === 0) return
    var gen = generatedCode[CURRENT_PAGE] || ""
    var had = !!design.pageCode[CURRENT_PAGE]
    var same = !value.trim() || (gen && normCode(value) === normCode(gen))
    if (same) {
      codeHand[CURRENT_PAGE] = false
      if (!had) {
        var stay = $("edCodeModal")
        if (stay) stay.classList.remove("open")
        return
      }
      delete design.pageCode[CURRENT_PAGE]
    } else {
      codeHand[CURRENT_PAGE] = true
      design.pageCode[CURRENT_PAGE] = value
    }
    railCodeKey = CURRENT_PAGE
    railCodeVal = value
    var modal = $("edCodeModal")
    if (modal) modal.classList.remove("open")
    push(); save(); refreshSoon()
  }
  function clearPageCode() {
    var had = !!design.pageCode[CURRENT_PAGE]
    delete design.pageCode[CURRENT_PAGE]
    delete generatedCode[CURRENT_PAGE]
    railCodeKey = ""
    railCodeVal = ""
    var box = $("edCodeBox")
    var railBox = $("edRailCode")
    if (box && $("edCodeModal") && $("edCodeModal").classList.contains("open")) fillPageCode(box)
    if (railBox) fillPageCode(railBox)
    if (had) { push(); save(); refreshSoon() }
  }
  var codeBtn = $("edPageCode")
  if (codeBtn) codeBtn.addEventListener("click", openCodeModal)
  function chooseTheme(btn) {
    var tid = btn.getAttribute("data-pick-theme")
    if (!tid || tid === (D.currentTheme || "")) return
    var tname = (btn.querySelector("b") || {}).textContent || tid
    if (!confirm("Essayer « " + tname + " » ? La structure d'accueil repart de ce thème. Tes couleurs, tes textes et tes produits restent. Rien n'est publié.")) return
    syncPage()
    fetch("/dashboard/design/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: stateMap, design: design, nav: nav }),
    }).finally(function () {
      var f = document.createElement("form")
      f.method = "post"
      f.action = "/dashboard/design/theme"
      var i = document.createElement("input")
      i.type = "hidden"
      i.name = "theme"
      i.value = tid
      f.appendChild(i)
      document.body.appendChild(f)
      f.submit()
    })
  }
  var themesBtn = $("edThemes")
  if (themesBtn) themesBtn.addEventListener("click", function () { openThemeSec("Thèmes") })
  var themeRow = $("edThemeRow")
  if (themeRow) themeRow.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-pick-theme]")
    if (btn) chooseTheme(btn)
  })
  rail.addEventListener("input", function (e) {
    if (e.target && e.target.id === "edRailCode") {
      railCodeKey = CURRENT_PAGE
      railCodeVal = e.target.value
    }
  })
  var varsBox = $("edVars")
  if (varsBox) varsBox.addEventListener("click", function (e) {
    var b = e.target.closest("[data-var]")
    if (!b) return
    insertAt($("edCodeBox"), "{{" + b.getAttribute("data-var") + "}}")
  })
  if ($("edCodeX")) $("edCodeX").addEventListener("click", function () { $("edCodeModal").classList.remove("open") })
  if ($("edCodeStarter")) $("edCodeStarter").addEventListener("click", function () {
    var key = CURRENT_PAGE.indexOf("page:") === 0 ? "page" : CURRENT_PAGE
    $("edCodeBox").value = STARTERS[key] || "<section class=\"ndz-page\">\n  {{menu}}\n  {{contenu}}\n</section>\n"
    $("edCodeBox").focus()
  })
  if ($("edCodeClear")) $("edCodeClear").addEventListener("click", clearPageCode)
  if ($("edCodeSave")) $("edCodeSave").addEventListener("click", function () {
    savePageCode($("edCodeBox").value || "")
  })
  if ($("edSaveTpl")) $("edSaveTpl").addEventListener("click", function () {
    var more = document.querySelector(".ed-more")
    if (more) more.open = false
    $("edTplErr").hidden = true
    $("edTplName").value = ""
    $("edTplModal").classList.add("open")
    $("edTplName").focus()
  })
  if ($("edTplX")) $("edTplX").addEventListener("click", function () { $("edTplModal").classList.remove("open") })
  if ($("edTplSave")) $("edTplSave").addEventListener("click", function () {
    var name = ($("edTplName").value || "").trim()
    var err = $("edTplErr")
    if (!name) { err.hidden = false; err.textContent = "Donne un nom."; return }
    syncPage()
    fetch("/dashboard/design/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, sections: stateMap, design: design, nav: nav }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d } }) })
      .then(function (res) {
        if (!res.ok || !res.d || !res.d.ok) {
          err.hidden = false
          err.textContent = (res.d && res.d.error) || "Enregistrement impossible."
          return
        }
        $("edTplModal").classList.remove("open")
        saveState.textContent = "Template « " + res.d.name + " »"
        saveState.className = "ed-save ok"
        markDirty()
      })
      .catch(function () {
        err.hidden = false
        err.textContent = "Hors ligne."
      })
  })

  function syncFields() {
    $("edOutline").checked = true
    frame.contentWindow && frame.contentWindow.postMessage({ t: "outline", on: true }, "*")
  }

  var devices = { desktop: "100%", tablet: "834px", mobile: "390px" }
  document.querySelectorAll("[data-device]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-device]").forEach(function (x) { x.classList.remove("on") })
      b.classList.add("on")
      var mode = b.getAttribute("data-device")
      var box = $("edFrameBox")
      box.style.maxWidth = devices[mode]
      box.classList.toggle("is-phone", mode === "mobile")
      if (frame.contentWindow) frame.contentWindow.postMessage({ t: "phone", on: mode === "mobile" }, "*")
    })
  })

  $("edOutline").addEventListener("change", function (e) {
    frame.contentWindow && frame.contentWindow.postMessage({ t: "outline", on: e.target.checked }, "*")
  })
  $("edUndo").addEventListener("click", function () {
    if (!past.length) return
    future.push(snapshot())
    apply(past.pop())
    syncUndo()
  })
  $("edRedo").addEventListener("click", function () {
    if (!future.length) return
    past.push(snapshot())
    apply(future.pop())
    syncUndo()
  })
  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey
    if (!mod) return
    if (e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? $("edRedo").click() : $("edUndo").click() }
    if (e.key.toLowerCase() === "s") { e.preventDefault(); save() }
  })

  $("edReset").addEventListener("click", function () {
    if (!confirm("Revenir aux sections par défaut du thème ?")) return
    fetch("/dashboard/design/reset", { method: "POST" }).then(function () { location.reload() })
  })

  $("edNavToggle").addEventListener("click", function () {
    $("edNavPanel").classList.toggle("open")
  })
  $("edNavBody").addEventListener("click", function (e) { })
  $("edNavBody").addEventListener("input", function (e) {
    var t = e.target
    if (t.getAttribute("data-nav-label") !== null) { nav[+t.getAttribute("data-nav-label")].label = t.value; save() }
    if (t.getAttribute("data-nav-url") !== null) { nav[+t.getAttribute("data-nav-url")].url = t.value; save() }
  })
  $("edNavBody").addEventListener("click", function (e) {
    var d = e.target.closest("[data-navdel]")
    if (!d) return
    nav.splice(+d.getAttribute("data-navdel"), 1)
    renderNav(); save()
  })
  $("edAddNav").addEventListener("click", function () {
    nav.push({ id: uid("n"), label: "Nouveau lien", url: "" })
    renderNav(); save()
  })

  /* ------------------------------ publication ------------------------------ */
  var pubBtn = $("edPublish")
  var pubState = $("edPubState")
  function markDirty() {
    if (!pubState) return
    pubState.textContent = "Brouillon non publié"
    pubState.className = "ed-pub dirty"
  }
  function markLive() {
    if (!pubState) return
    pubState.textContent = "En ligne"
    pubState.className = "ed-pub live"
  }
  if (pubBtn) {
    pubBtn.addEventListener("click", function () {
      pubBtn.disabled = true
      pubBtn.textContent = "Publication…"
      fetch("/dashboard/design/publish", { method: "POST" })
        .then(function (r) { return r.json() })
        .then(function (d) {
          pubBtn.disabled = false
          pubBtn.textContent = "Publier"
          if (d && d.ok) {
            markLive()
            saveState.textContent = "Publié"
            saveState.className = "ed-save ok"
          }
        })
        .catch(function () { pubBtn.disabled = false; pubBtn.textContent = "Publier" })
    })
  }

  /* ------------------------------ historique ------------------------------ */
  var histModal = $("edHistModal")
  var histList = $("edHistList")
  $("edHistX").addEventListener("click", function () { histModal.classList.remove("open") })
  histModal.addEventListener("click", function (e) { if (e.target === histModal) histModal.classList.remove("open") })
  $("edHistory").addEventListener("click", function () {
    histModal.classList.add("open")
    histList.textContent = "Chargement…"
    fetch("/dashboard/design/versions")
      .then(function (r) { return r.json() })
      .then(function (d) {
        var vs = (d && d.versions) || []
        histList.innerHTML = vs.length
          ? vs.map(function (v) {
              return '<div class="ed-hrow"><span>' + esc(String(v.created_at).slice(0, 16)) + "</span>" +
                '<button type="button" class="ed-btn" data-ver="' + v.id + '">Restaurer</button></div>'
            }).join("")
          : '<p class="ed-hint">Aucune version publiée pour le moment. Clique sur « Publier ».</p>'
      })
      .catch(function () { histList.textContent = "Erreur de chargement." })
  })
  histList.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ver]")
    if (!b) return
    if (!confirm("Restaurer cette version comme brouillon ? Tu pourras la publier ensuite.")) return
    fetch("/dashboard/design/restore/" + b.getAttribute("data-ver"), { method: "POST" })
      .then(function (r) { return r.json() })
      .then(function () { location.reload() })
  })

  /* --------- clic dans l'aperçu → ouvre le bloc à modifier --------- */
  window.addEventListener("message", function (e) {
    var d = e.data || {}
    if (d.ndz === "section" && d.id) {
      var exists = state.some(function (s) { return String(s.id) === String(d.id) })
      if (!exists) return
      selected = String(d.id)
      TAB = "sections"
      renderRail()
      var card = rail.querySelector('.ed-card[data-id="' + selected + '"]')
      if (card) showInRail(card)
      return
    }
    if (d.ndz === "logo") {
      selected = null
      TAB = "theme"
      renderRail()
      var btn = rail.querySelector('[data-img="design||logo"]')
      if (btn) {
        var sec = btn.closest(".ed-sec")
        if (sec) showInRail(sec)
        btn.classList.add("pulse")
        setTimeout(function () { btn.classList.remove("pulse") }, 1400)
      }
    }
    if (d.ndz === "page" && d.name) {
      TAB = "pages"
      renderRail()
      var det = rail.querySelectorAll(".ed-page")
      for (var i = 0; i < det.length; i++) {
        if (det[i].getAttribute("data-page-key") === d.name) det[i].open = true
      }
    }
  })

  /* ------------------------------ démarrage ------------------------------ */
  renderRail()
  renderNav()
  syncUndo()
  function showTop() {
    try { frame.contentWindow.scrollTo(0, 0) } catch (e) {}
  }
  frame.addEventListener("load", function () {
    showTop()
    frame.contentWindow && frame.contentWindow.postMessage({ t: "outline", on: $("edOutline").checked }, "*")
    liveStyle()
    if (frame.contentWindow) frame.contentWindow.postMessage({ t: "textmode", on: textModeOn }, "*")
    liveSizes()
    setTimeout(showTop, 40)
  })
  if (frame.contentDocument && frame.contentDocument.readyState === "complete") showTop()

  /* -------- taille exacte de n'importe quel texte : 0, 100, ou le chiffre -------- */
  var textModeOn = false
  var textPick = null
  var textPushed = false
  function liveSizes() {
    if (frame.contentWindow) frame.contentWindow.postMessage({ t: "sizes", list: design.textSizes || [] }, "*")
  }
  function setTextMode(on) {
    textModeOn = !!on
    var btn = $("edTextMode")
    var box = $("edTsize")
    if (btn) btn.setAttribute("aria-pressed", textModeOn ? "true" : "false")
    if (btn) btn.classList.toggle("on", textModeOn)
    if (box) box.hidden = !textModeOn
    document.querySelector(".ed-app").classList.toggle("textmode", textModeOn)
    if (frame.contentWindow) frame.contentWindow.postMessage({ t: "textmode", on: textModeOn }, "*")
    if (!textModeOn) textPick = null
    if (textModeOn && window.matchMedia("(max-width: 760px)").matches) {
      var app = document.querySelector(".ed-app")
      var toggle = $("edRailToggle")
      if (app) app.classList.add("rail-off")
      if (toggle) toggle.setAttribute("aria-pressed", "false")
    }
    paintTextDock()
  }
  function paintTextDock() {
    var label = $("edTsizeLabel")
    var range = $("edTsizeRange")
    var num = $("edTsizeNum")
    var controls = $("edTsizeControls")
    if (!textPick) {
      if (label) label.textContent = "Clique un texte dans l'aperçu."
      if (controls) controls.hidden = true
      return
    }
    if (controls) controls.hidden = false
    var where = textPick.page === "*" ? "toutes les pages" : "cette page"
    if (label) label.textContent = (textPick.label || "Texte") + " · " + where
    if (range) range.value = textPick.size
    if (num) num.value = textPick.size
  }
  function writeTextSize(size, drop) {
    if (!textPick) return
    if (!textPushed) { push(); textPushed = true }
    design.textSizes = (design.textSizes || []).filter(function (r) {
      return !(r.sel === textPick.sel && r.page === textPick.page)
    })
    if (!drop) {
      var n = Math.max(0, Math.min(100, Math.round(Number(size))))
      textPick.size = n
      design.textSizes.push({
        page: textPick.page, sel: textPick.sel, size: n, label: textPick.label || "",
      })
    }
    if (design.textSizes.length > 80) design.textSizes = design.textSizes.slice(-80)
    paintTextDock()
    liveSizes()
    save({ quiet: true })
    if (TAB === "texts") renderRail()
  }
  var tBtn = $("edTextMode")
  if (tBtn) tBtn.addEventListener("click", function () { setTextMode(!textModeOn) })
  var tX = $("edTsizeX")
  if (tX) tX.addEventListener("click", function () { setTextMode(false) })
  var tRange = $("edTsizeRange")
  var tNum = $("edTsizeNum")
  if (tRange) {
    tRange.addEventListener("pointerdown", function () { textPushed = false })
    tRange.addEventListener("input", function () {
      if (tNum) tNum.value = tRange.value
      writeTextSize(tRange.value)
    })
    tRange.addEventListener("change", function () { textPushed = false })
  }
  if (tNum) {
    tNum.addEventListener("focus", function () { textPushed = false })
    tNum.addEventListener("input", function () {
      var n = Math.max(0, Math.min(100, Math.round(Number(tNum.value))))
      if (tNum.value === "") return
      if (tRange) tRange.value = n
      writeTextSize(n)
    })
  }
  var tBox = $("edTsize")
  if (tBox) tBox.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tsz]")
    if (b) { textPushed = false; writeTextSize(b.getAttribute("data-tsz")); return }
    if (e.target.closest("#edTsizeAuto")) { textPushed = false; writeTextSize(0, true) }
  })
  rail.addEventListener("click", function (e) {
    var del = e.target.closest("[data-tsz-del]")
    var set = e.target.closest("[data-tsz-i]")
    if (!del && !set) return
    var i = Number((del || set).getAttribute(del ? "data-tsz-del" : "data-tsz-i"))
    var row = (design.textSizes || [])[i]
    if (!row) return
    push()
    if (del) design.textSizes.splice(i, 1)
    else row.size = Math.max(0, Math.min(100, Math.round(Number(set.getAttribute("data-tsz-v")))))
    liveSizes()
    save({ quiet: true })
    renderRail()
  })
  rail.addEventListener("change", function (e) {
    var inp = e.target.closest("[data-tsz-num]")
    if (!inp) return
    var i = Number(inp.getAttribute("data-tsz-num"))
    var row = (design.textSizes || [])[i]
    if (!row) return
    push()
    row.size = Math.max(0, Math.min(100, Math.round(Number(inp.value) || 0)))
    liveSizes()
    save({ quiet: true })
    renderRail()
  })
  window.addEventListener("message", function (e) {
    var d = e.data || {}
    if (d.t !== "textpick" || !d.sel) return
    if (!textModeOn) setTextMode(true)
    var found = null
    ;(design.textSizes || []).forEach(function (r) {
      if (r.sel === d.sel && r.page === d.page) found = r
    })
    var px = Math.max(0, Math.min(100, Math.round(Number(d.px) || 16)))
    textPick = {
      page: d.page || CURRENT_PAGE,
      sel: d.sel,
      label: d.label || "Texte",
      size: found ? found.size : px,
    }
    textPushed = false
    paintTextDock()
  })
})()
