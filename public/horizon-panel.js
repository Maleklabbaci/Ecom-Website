"use strict"
/* Panneau de réglages du thème. Même éditeur NovaDZ.
   Les détails (tiroir, échéances, achat direct, bibliothèque) écrivent dans design.
   extras.slots ajoute les réglages déjà dans Nova, sans deuxième panneau. */

function hzEsc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  })
}

function hzHex(v, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : (fallback || "")
}

function hzRow(label, control) {
  return '<div class="ed-row"><span class="ed-row-l">' + label + '</span><span class="ed-row-c">' + control + "</span></div>"
}

function hzColor(label, key, value) {
  var v = hzHex(value, "")
  var chip = v || "#FFFFFF"
  return hzRow(label,
    '<span class="ed-colors' + (v ? "" : " is-auto") + '">' +
    '<input type="color" data-scope="design" data-key="' + key + '" value="' + hzEsc(chip) + '" aria-label="' + hzEsc(label) + '">' +
    '<input type="text" class="ed-hex" data-scope="design" data-key="' + key + '" value="' + hzEsc(v) + '" placeholder="auto" maxlength="7">' +
    "</span>")
}

function hzRange(label, key, min, max, step, value, unit) {
  var n = value == null || value === "" ? min : value
  return hzRow(label,
    '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + hzEsc(n) + '" data-scope="design" data-key="' + key + '">' +
    '<span class="ed-rangev" data-v="' + key + '" data-unit=" ' + hzEsc(unit) + '">' + hzEsc(n) + " " + unit + "</span>")
}

function hzSel(label, key, value, options) {
  return hzRow(label,
    '<select data-scope="design" data-key="' + key + '">' + options.map(function (o) {
      return '<option value="' + hzEsc(o[0]) + '"' + (String(value) === String(o[0]) ? " selected" : "") + ">" + hzEsc(o[1]) + "</option>"
    }).join("") + "</select>")
}

function hzSeg(label, key, value, options) {
  return '<div class="ed-row"><span class="ed-row-l">' + label + '</span><span class="ed-chips">' +
    options.map(function (o) {
      var on = String(value) === String(o[0]) ? " on" : ""
      return '<button type="button" class="ed-chip' + on + '" data-chip="' + key + '" data-val="' + hzEsc(o[0]) + '">' + hzEsc(o[1]) + "</button>"
    }).join("") + "</span></div>"
}

function hzToggle(label, key, on, hint) {
  return '<label class="hz-toggle"><span class="ed-row-l">' + label +
    (hint ? '<span class="ed-hint">' + hint + "</span>" : "") +
    '</span><input type="checkbox" data-scope="design" data-key="' + key + '"' + (on ? " checked" : "") + "></label>"
}

function hzOff(label, why) {
  return '<div class="hz-toggle is-off"><span class="ed-row-l">' + label +
    '<span class="ed-hint">' + why + "</span></span><input type=\"checkbox\" disabled></div>"
}

function hzFile(label, key, url, btn) {
  return '<div class="hz-img"><span class="ed-row-l">' + label + "</span>" +
    '<div class="ed-img"><div class="ed-imgbox logo">' +
    (url ? '<img src="' + hzEsc(url) + '" alt="">' : "<span>Aucune</span>") +
    '</div><div class="ed-imgside"><label class="ed-file">' + (btn || "Choisir") +
    '<input type="file" accept="image/*" data-img="design||' + key + '"></label>' +
    '<button type="button" class="ed-link" data-lib="design||' + key + '">Bibliothèque</button>' +
    (url ? '<button type="button" class="ed-link" data-imgclear="design||' + key + '">Retirer</button>' : "") +
    '<span class="ed-hint">Tes images, ou un fichier à toi.</span></div></div></div>'
}

function hzSub(label) {
  return '<p class="hz-sub">' + label + "</p>"
}

function hzAcc(title, body, open) {
  return '<section class="ed-sec' + (open ? " open" : "") + '">' +
    '<button type="button" class="ed-sec-h" data-sec="' + hzEsc(title) + '"><h3>' + title + '</h3><i class="ed-sec-arrow"></i></button>' +
    body + "</section>"
}

function horizonPanel(d, extras) {
  d = d || {}
  extras = extras || {}
  var fonts = extras.fonts && extras.fonts.length ? extras.fonts : [
    ["inter", "Inter"], ["serif", "Serif"], ["grotesque", "Grotesque"], ["system", "Système"],
  ]
  var fontOpts = fonts.map(function (f) { return [f[0], f[1]] })
  var caseOpts = [["def", "Par défaut"], ["upper", "Majuscules"], ["lower", "Minuscules"], ["caps", "Capitales"]]
  var fontRole = [["corps", "Corps de texte"], ["sous", "Sous-titre"], ["titre", "Titre"]]
  function fontVal(key) { return d[key] || d.font || "inter" }
  var titles = ["Logo et favicon", "Palette de couleurs", "Typographie", "Page", "Animations", "Badges", "Boutons", "Panier", "Tiroirs", "Icônes", "Champs de saisie", "Pop-overs et fenêtres modales", "Prix", "Recherche", "Sélecteurs de variantes", "CSS personnalisé"]
  var bag = extras.open || {}
  var any = titles.some(function (t) { return bag[t] })
  function acc(title, body) {
    if (extras.slots && extras.slots[title]) body += extras.slots[title]
    return hzAcc(title, body, bag[title] || (!any && title === "Logo et favicon"))
  }

  var palette = (extras.presets || []).map(function (p) {
    var v = p[1] || {}
    return '<button type="button" class="ed-preset" data-preset="' + hzEsc(p[0]) + '">' +
      '<span class="ed-preset-dots"><i style="background:' + hzEsc(v.bg || "#fff") + '"></i><i style="background:' + hzEsc(v.accent || "#111") + '"></i><i style="background:' + hzEsc(v.ink || "#111") + '"></i></span>' +
      "<b>" + hzEsc(p[0]) + "</b></button>"
  }).join("")

  var logo = acc("Logo et favicon",
    '<p class="ed-hint">Le nom de la boutique se règle avec les cases du logo, juste en dessous.</p>' +
    hzToggle("Afficher le logo", "showLogo", d.showLogo !== false) +
    hzToggle("Afficher le nom", "showName", d.showName !== false) +
    hzFile("Logo par défaut", "logo", d.logo, "Choisir un logo") +
    hzFile("Logo inversé", "logoInverse", d.logoInverse, "Choisir le logo inversé") +
    '<p class="ed-hint">Le logo inversé sert quand l\'en-tête est transparent.</p>' +
    hzFile("Favicon", "favicon", d.favicon, "Choisir un favicon") +
    '<p class="ed-hint">La bibliothèque, ce sont les photos déjà dans ta boutique.</p>')

  var colors = acc("Palette de couleurs",
    (palette ? '<div class="ed-presets">' + palette + "</div>" : "") +
    hzColor("Fond de la page", "bg", d.bg) +
    hzColor("Texte", "ink", d.ink) +
    hzColor("Accent", "accent", d.accent) +
    hzColor("Fond de l'en-tête", "headBg", d.headBg) +
    hzColor("Texte de l'en-tête", "headInk", d.headInk) +
    hzColor("Fond du pied", "footBg", d.footBg) +
    hzColor("Texte du pied", "footInk", d.footInk))

  var type = acc("Typographie",
    '<p class="ed-hint">Par défaut pour les sections du thème. Une section avec son propre fond ne prend cette couleur que si le contraste suffit.</p>' +
    hzColor("Texte", "ink", d.ink) +
    hzSel("Corps de texte", "font", d.font || "inter", fontOpts) +
    hzSel("Sous-titre", "fontSub", fontVal("fontSub"), fontOpts) +
    hzSel("Titre", "fontTitle", fontVal("fontTitle"), fontOpts) +
    hzSel("Accentuation", "fontAccent", fontVal("fontAccent"), fontOpts) +
    hzRange("Taille du texte", "textScale", 0.85, 1.35, 0.05, d.textScale == null ? 1 : d.textScale, "×") +
    hzSel("Casse des titres", "titleCase", d.titleCase || "def", caseOpts) +
    '<p class="ed-hint">Les tailles s\'adaptent à l\'écran. Le détail d\'un texte se règle avec le bouton Taille, dans l\'aperçu.</p>')

  var page = acc("Page",
    hzColor("Arrière-plan", "bg", d.bg) +
    hzSel("Largeur de la page", "pageWidth", d.pageWidth || "normal", [
      ["etroit", "Étroit"], ["normal", "Normale"], ["large", "Large"],
    ]))

  var anim = acc("Animations",
    hzToggle("Transition de page", "animPage", d.animPage === true) +
    hzToggle("Transition de la carte vers la fiche", "animCard", d.animCard === true) +
    hzToggle("Ajouter au panier", "animCart", d.animCart === true) +
    hzSel("Effet de survol de la carte", "cardHover", d.cardHover || "aucun", [
      ["aucun", "Aucun"], ["zoom", "Zoom"], ["lever", "Lever"],
    ]) +
    '<p class="ed-hint">S\'applique aux cartes de produit et de collection.</p>')

  var badges = acc("Badges",
    hzSel("Position sur les cartes", "badgePos", d.badgePos || "haut-droite", [
      ["haut-droite", "En haut à droite"], ["haut-gauche", "En haut à gauche"],
      ["bas-droite", "En bas à droite"], ["bas-gauche", "En bas à gauche"],
    ]) +
    hzRange("Rayon de la bordure", "badgeRadius", 0, 100, 1, d.badgeRadius == null ? 100 : d.badgeRadius, "px") +
    hzSub("Couleurs") +
    hzColor("Arrière-plan du badge de promotion", "badgePromoBg", d.badgePromoBg || "#FFFFFF") +
    hzColor("Texte du badge de promotion", "badgePromoInk", d.badgePromoInk || "#111111") +
    hzColor("Arrière-plan du badge Épuisé", "badgeSoldBg", d.badgeSoldBg || "#EEF1EA") +
    hzColor("Texte du badge Épuisé", "badgeSoldInk", d.badgeSoldInk || "#111111") +
    hzSel("Police", "badgeFont", d.badgeFont || "corps", fontRole) +
    hzSel("Casse", "badgeCase", d.badgeCase || "def", caseOpts))

  var buttons = acc("Boutons",
    hzSub("Bouton principal") +
    hzColor("Arrière-plan", "btnBg", d.btnBg) +
    hzColor("Texte", "btnInk", d.btnInk) +
    hzColor("Bordures", "btnBorder", d.btnBorder) +
    hzRange("Épaisseur de la bordure", "btnBorderW", 0, 4, 1, d.btnBorderW == null ? 0 : d.btnBorderW, "px") +
    hzRange("Rayon de la bordure", "btnRadius", 0, 40, 1, d.btnRadius == null ? 14 : d.btnRadius, "px") +
    hzSel("Police", "btnFont", d.btnFont || "corps", fontRole) +
    hzSel("Casse du texte", "btnCase", d.btnCase || "def", caseOpts) +
    hzSub("Bouton secondaire") +
    hzColor("Arrière-plan", "btn2Bg", d.btn2Bg) +
    hzColor("Texte", "btn2Ink", d.btn2Ink) +
    hzColor("Bordures", "btn2Border", d.btn2Border) +
    hzRange("Épaisseur de la bordure", "btn2BorderW", 0, 4, 1, d.btn2BorderW == null ? 1 : d.btn2BorderW, "px") +
    hzRange("Rayon de la bordure", "btn2Radius", 0, 40, 1, d.btn2Radius == null ? 14 : d.btn2Radius, "px") +
    hzSel("Police", "btn2Font", d.btn2Font || "corps", fontRole) +
    hzSel("Casse du texte", "btn2Case", d.btn2Case || "def", caseOpts) +
    '<p class="ed-hint">Vide = le thème garde son bouton. Dès qu\'une couleur est posée, elle gagne, y compris sur Atelier.</p>')

  var cart = acc("Panier",
    hzSeg("Type", "cartType", d.cartType || "page", [["page", "Page"], ["tiroir", "Tiroir"]]) +
    '<p class="ed-hint">Tiroir = le panier glisse sur la page, avec tes vrais articles. Page = la page panier.</p>' +
    hzSel("Casse du titre de produit", "cartTitleCase", d.cartTitleCase || "def", caseOpts) +
    hzSel("Police du prix", "cartPriceFont", d.cartPriceFont || "sous", fontRole) +
    hzToggle("« Ajouter au panier » ouvre automatiquement le tiroir", "cartOpenDrawer", d.cartOpenDrawer === true) +
    hzSub("Fonctionnalités du panier") +
    hzToggle("Autoriser une note au vendeur", "cartNote", d.cartNote === true) +
    hzToggle("Autoriser les réductions dans le panier", "cartDiscount", d.cartDiscount !== false) +
    hzToggle("Paiement en plusieurs fois", "installOn", d.installOn === true, "À la livraison. Aucune carte n'est débitée.") +
    hzSel("Nombre de fois", "installN", String(d.installN || 3), [["2", "2 fois"], ["3", "3 fois"], ["4", "4 fois"]]) +
    hzToggle("Achat direct", "payDirect", d.payDirect === true, "Un bouton par moyen déjà réglé. Ça ouvre le formulaire, sans caisse inventée.") +
    hzRow("Lien du bouton du panier vide", '<input type="text" data-scope="design" data-key="cartEmptyUrl" value="' + hzEsc(d.cartEmptyUrl || "") + '" placeholder="page/boutique ou une adresse" maxlength="200">') +
    hzSub("Support multimédia du produit") +
    hzSeg("Style de bordure", "cartMediaBorder", d.cartMediaBorder || "aucun", [["aucun", "Aucun"], ["plein", "Plein"]]) +
    hzRange("Rayon de la bordure", "cartMediaRadius", 0, 40, 1, d.cartMediaRadius == null ? 0 : d.cartMediaRadius, "px"))

  var drawers = acc("Tiroirs",
    hzColor("Couleur d'arrière-plan", "drawerBg", d.drawerBg) +
    hzColor("Couleur du texte", "drawerInk", d.drawerInk) +
    hzColor("Couleur de la bordure", "drawerBorder", d.drawerBorder) +
    '<p class="ed-hint">Le menu téléphone, et le tiroir du panier.</p>')

  var icons = acc("Icônes",
    hzSel("Contour", "iconWeight", d.iconWeight || "def", [
      ["fin", "Fin"], ["def", "Par défaut"], ["epais", "Épais"],
    ]))

  var fields = acc("Champs de saisie",
    hzColor("Arrière-plan", "inputBg", d.inputBg) +
    hzColor("Texte", "inputInk", d.inputInk) +
    hzColor("Bordures", "inputBorder", d.inputBorder) +
    hzRange("Épaisseur de la bordure", "inputBorderW", 0, 4, 1, d.inputBorderW == null ? 1 : d.inputBorderW, "px") +
    hzRange("Rayon de la bordure", "inputRadius", 0, 24, 1, d.inputRadius == null ? 4 : d.inputRadius, "px") +
    hzSel("Préréglage du texte", "inputPreset", d.inputPreset || "paragraphe", [
      ["paragraphe", "Paragraphe"], ["petit", "Petit"], ["grand", "Grand"],
    ]))

  var pops = acc("Pop-overs et fenêtres modales",
    hzColor("Couleur d'arrière-plan", "popBg", d.popBg) +
    hzColor("Couleur du texte", "popInk", d.popInk) +
    hzRange("Rayon de la bordure", "popRadius", 0, 28, 1, d.popRadius == null ? 14 : d.popRadius, "px") +
    hzColor("Couleur de la bordure", "popBorder", d.popBorder) +
    hzRange("Épaisseur de la bordure", "popBorderW", 0, 4, 1, d.popBorderW == null ? 1 : d.popBorderW, "px") +
    hzToggle("Ombre portée", "popShadow", d.popShadow === true) +
    hzColor("Ombre", "popShadowColor", d.popShadowColor || "#111111"))

  var price = acc("Prix",
    hzSub("Code de devise") +
    '<p class="ed-hint">Allumé = le code (DZD) reste à côté du montant. Éteint = on ne garde que le chiffre.</p>' +
    hzToggle("Pages de produits", "curProduct", d.curProduct !== false) +
    hzToggle("Cartes de produit", "curCard", d.curCard !== false) +
    hzToggle("Articles du panier", "curCartItem", d.curCartItem !== false) +
    hzToggle("Total du panier", "curCartTotal", d.curCartTotal !== false) +
    hzSub("Cartes de produit") +
    hzToggle("Ajout rapide", "quickAdd", d.quickAdd === "on" || d.quickAdd === true, "Laisse la section décider tant que tu n'y touches pas.") +
    hzToggle("Ajout rapide sur mobile", "quickAddMobile", d.quickAddMobile === "on" || d.quickAddMobile === true) +
    hzColor("Arrière-plan", "cardBg", d.cardBg) +
    hzColor("Texte", "cardInk", d.cardInk))

  var search = acc("Recherche",
    hzSel("Emplacement", "searchPlace", d.searchPlace || "entete", [
      ["entete", "Dans l'en-tête"], ["icone", "Icône"], ["dessous", "Sous l'en-tête"], ["aucune", "Aucune"],
    ]) +
    hzSub("Nuanciers") +
    hzToggle("Images de variantes", "swatchImg", d.swatchImg === true) +
    hzRange("Largeur", "swatchW", 16, 64, 1, d.swatchW == null ? 34 : d.swatchW, "px") +
    hzRange("Hauteur", "swatchH", 16, 64, 1, d.swatchH == null ? 34 : d.swatchH, "px") +
    hzRange("Rayon de la bordure", "swatchRadius", 0, 40, 1, d.swatchRadius == null ? 32 : d.swatchRadius, "px") +
    hzSeg("Bordures", "swatchBorder", d.swatchBorder || "aucun", [["aucun", "Aucun"], ["plein", "Plein"]]) +
    hzRange("Épaisseur de la bordure", "swatchBorderW", 0, 4, 1, d.swatchBorderW == null ? 1 : d.swatchBorderW, "px") +
    hzRange("Opacité de la bordure", "swatchBorderOp", 0, 100, 1, d.swatchBorderOp == null ? 10 : d.swatchBorderOp, "%"))

  var variants = acc("Sélecteurs de variantes",
    hzSub("Paramètres des variantes") +
    hzColor("Arrière-plan", "varBg", d.varBg) +
    hzColor("Texte", "varInk", d.varInk) +
    hzColor("Bordures", "varBorder", d.varBorder) +
    hzSub("Variantes sélectionnées") +
    hzColor("Arrière-plan", "varOnBg", d.varOnBg) +
    hzColor("Texte", "varOnInk", d.varOnInk) +
    hzColor("Bordures", "varOnBorder", d.varOnBorder) +
    hzSub("Boutons") +
    hzRange("Épaisseur de la bordure", "varBtnBorderW", 0, 4, 1, d.varBtnBorderW == null ? 1 : d.varBtnBorderW, "px") +
    hzRange("Rayon de la bordure", "varBtnRadius", 0, 40, 1, d.varBtnRadius == null ? 14 : d.varBtnRadius, "px") +
    hzSeg("Largeur", "varBtnWidth", d.varBtnWidth || "ajuster", [["ajuster", "Ajuster"], ["remplir", "Remplir"]]))

  var css = acc("CSS personnalisé",
    '<p class="ed-hint">Une seule case, pour toute la boutique. Une ligne peut casser la page. Vide = le thème tel quel.</p>' +
    '<textarea class="ed-code" rows="6" spellcheck="false" data-scope="design" data-key="customCss" placeholder=".theme .p-name{letter-spacing:.02em}">' +
    hzEsc(d.customCss || "") + "</textarea>")

  return '<div class="ed-pane folded hz">' +
    logo + colors + type + page + anim + badges + buttons + cart + drawers + icons + fields + pops + price + search + variants +
    (extras.tail || "") +
    css +
    "</div>"
}

function ndzHorizonCss(d) {
  d = d || {}
  var css = []
  var hex = function (v) { return hzHex(v, "") }
  var changedNum = function (key, def) { return d[key] != null && d[key] !== "" && Number(d[key]) !== def }
  var btn = ".theme :is(.btn-primary,.sec-cta:not(.ghost),.tpx-buy,.p-add,.promo-btn),.theme .ndz-buy :is(.ndz-cart-add,.ndz-buy-now,.ndz-paybtn)"
  var btn2 = ".theme :is(.sec-cta.ghost,.btn-ghost,.tpx-continue)"
  if (hex(d.btnBg) || hex(d.btnInk) || hex(d.btnBorder) || changedNum("btnBorderW", 0) || changedNum("btnRadius", 14)) {
    var bg = hex(d.btnBg)
    var ink = hex(d.btnInk)
    var bd = hex(d.btnBorder) || bg
    css.push(btn + "{" +
      (bg ? "background:" + bg + "!important;border-color:" + (bd || bg) + "!important;" : "") +
      (ink ? "color:" + ink + "!important;" : "") +
      (changedNum("btnBorderW", 0) ? "border-width:" + Number(d.btnBorderW) + "px!important;border-style:solid!important;" : "") +
      (changedNum("btnRadius", 14) ? "border-radius:" + Number(d.btnRadius) + "px!important;" : "") +
      "}")
  }
  if (d.btnCase === "upper") css.push(btn + "{text-transform:uppercase!important}")
  if (d.btnCase === "lower") css.push(btn + "{text-transform:lowercase!important}")
  if (hex(d.btn2Ink) || hex(d.btn2Border) || changedNum("btn2Radius", 14)) {
    css.push(btn2 + "{" +
      (hex(d.btn2Bg) ? "background:" + hex(d.btn2Bg) + "!important;" : "") +
      (hex(d.btn2Ink) ? "color:" + hex(d.btn2Ink) + "!important;" : "") +
      (hex(d.btn2Border) ? "border-color:" + hex(d.btn2Border) + "!important;" : "") +
      (changedNum("btn2Radius", 14) ? "border-radius:" + Number(d.btn2Radius) + "px!important;" : "") +
      "}")
  }
  if (d.pageWidth === "etroit") css.push(".theme :is(.wrap,.tpx-wrap){max-width:960px!important}")
  if (d.pageWidth === "large") css.push(".theme :is(.wrap,.tpx-wrap){max-width:1440px!important}")
  if (d.cardHover === "zoom") css.push(".theme :is(.p-thumb,.sec-rail-thumb) img{transition:transform .35s}.theme :is(.p-item,.sec-rail-card):hover img{transform:scale(1.04)}")
  if (d.cardHover === "lever") css.push(".theme :is(.p-item,.sec-rail-card){transition:transform .25s}.theme :is(.p-item,.sec-rail-card):hover{transform:translateY(-3px)}")
  if (d.animCart === true) css.push(".theme .p-add:active,.theme .tpx-buy:active{transform:scale(.97)}")
  if (d.animPage === true) css.push(".theme{animation:ndzHzIn .35s ease}.@keyframes ndzHzIn{from{opacity:.01}to{opacity:1}}".replace(".@", "@"))
  var pos = { "haut-droite": "top:8px;right:8px;left:auto;bottom:auto", "haut-gauche": "top:8px;left:8px;right:auto;bottom:auto", "bas-droite": "bottom:8px;right:8px;top:auto;left:auto", "bas-gauche": "bottom:8px;left:8px;top:auto;right:auto" }
  if (d.badgePos && d.badgePos !== "haut-gauche") css.push(".theme .p-sold{" + (pos[d.badgePos] || pos["haut-droite"]) + "}")
  if (changedNum("badgeRadius", 100)) css.push(".theme .p-sold{border-radius:" + Number(d.badgeRadius) + "px!important}")
  if (hex(d.badgeSoldBg) && hex(d.badgeSoldBg) !== "#EEF1EA") css.push(".theme .p-sold{background:" + hex(d.badgeSoldBg) + "!important;color:" + (hex(d.badgeSoldInk) || "#111") + "!important}")
  if (hex(d.badgePromoBg) && hex(d.badgePromoBg) !== "#FFFFFF") css.push(".theme .p-badge,.theme .badge-promo{background:" + hex(d.badgePromoBg) + "!important;color:" + (hex(d.badgePromoInk) || "#111") + "!important}")
  if (d.titleCase === "upper") css.push(".theme :is(h1,h2,h3){text-transform:uppercase}")
  if (d.titleCase === "lower") css.push(".theme :is(h1,h2,h3){text-transform:lowercase}")
  if (d.iconWeight === "fin") css.push(".theme svg{stroke-width:1.2}")
  if (d.iconWeight === "epais") css.push(".theme svg{stroke-width:2.2}")
  if (hex(d.inputBg) || hex(d.inputInk) || hex(d.inputBorder) || changedNum("inputRadius", 4) || changedNum("inputBorderW", 1)) {
    css.push(".theme :is(input,select,textarea){" +
      (hex(d.inputBg) ? "background:" + hex(d.inputBg) + "!important;" : "") +
      (hex(d.inputInk) ? "color:" + hex(d.inputInk) + "!important;" : "") +
      (hex(d.inputBorder) ? "border-color:" + hex(d.inputBorder) + "!important;" : "") +
      (changedNum("inputBorderW", 1) ? "border-width:" + Number(d.inputBorderW) + "px!important;" : "") +
      (changedNum("inputRadius", 4) ? "border-radius:" + Number(d.inputRadius) + "px!important;" : "") +
      "}")
  }
  if (d.inputPreset === "petit") css.push(".theme :is(input,select,textarea){font-size:13px!important}")
  if (d.inputPreset === "grand") css.push(".theme :is(input,select,textarea){font-size:17px!important}")
  if (hex(d.drawerBg) || hex(d.drawerInk)) {
    css.push("#ndzDrawer .ndz-drawer,.theme .ndz-mnav-box,.theme .tpx-drawer{" +
      (hex(d.drawerBg) ? "background:" + hex(d.drawerBg) + "!important;" : "") +
      (hex(d.drawerInk) ? "color:" + hex(d.drawerInk) + "!important;" : "") +
      (hex(d.drawerBorder) ? "border-color:" + hex(d.drawerBorder) + "!important;" : "") +
      "}")
  }
  if (hex(d.cardBg) || hex(d.cardInk)) {
    css.push(".theme :is(.p-item,.sec-rail-card){" +
      (hex(d.cardBg) ? "background:" + hex(d.cardBg) + "!important;" : "") +
      (hex(d.cardInk) ? "color:" + hex(d.cardInk) + "!important;" : "") +
      "}")
  }
  if (d.quickAdd === "off" || d.quickAdd === false) css.push(".theme .p-add{display:none!important}")
  if (d.quickAdd === "on" || d.quickAdd === true) css.push(".theme .p-add{display:inline-flex!important}")
  if (d.quickAddMobile === "off" || d.quickAddMobile === false) css.push("@media(max-width:760px){.theme .p-add{display:none!important}}")
  if (changedNum("swatchW", 34) || changedNum("swatchH", 34) || changedNum("swatchRadius", 32) || d.swatchBorder === "plein") {
    css.push(".theme :is(.vp-swatch,.ndz-swatch){display:inline-block!important;width:" + (Number(d.swatchW) || 34) + "px!important;height:" + (Number(d.swatchH) || 34) + "px!important;border-radius:" + (d.swatchRadius == null ? 32 : Number(d.swatchRadius)) + "px!important;" +
      (d.swatchBorder === "plein" ? "border:" + (Number(d.swatchBorderW) || 1) + "px solid rgba(17,17,17," + ((Number(d.swatchBorderOp) || 10) / 100) + ");" : "") +
      "}")
  }
  var varSel = ".theme :is(.vp-box,.vp-opt)"
  if (hex(d.varBg) || hex(d.varInk) || hex(d.varBorder) || changedNum("varBtnRadius", 14) || d.varBtnWidth === "remplir") {
    css.push(varSel + "{" +
      (hex(d.varBg) ? "background:" + hex(d.varBg) + "!important;" : "") +
      (hex(d.varInk) ? "color:" + hex(d.varInk) + "!important;" : "") +
      (hex(d.varBorder) ? "border-color:" + hex(d.varBorder) + "!important;" : "") +
      (changedNum("varBtnBorderW", 1) ? "border-width:" + Number(d.varBtnBorderW) + "px!important;" : "") +
      (changedNum("varBtnRadius", 14) ? "border-radius:" + Number(d.varBtnRadius) + "px!important;" : "") +
      (d.varBtnWidth === "remplir" ? "width:100%!important;" : "") +
      "}")
  }
  if (hex(d.varOnBg) || hex(d.varOnInk) || hex(d.varOnBorder)) {
    css.push(".theme .vp-opt input:checked + .vp-box,.theme :is(.vp-opt.on,.vp-opt.is-on,.vp-box.on){" +
      (hex(d.varOnBg) ? "background:" + hex(d.varOnBg) + "!important;" : "") +
      (hex(d.varOnInk) ? "color:" + hex(d.varOnInk) + "!important;" : "") +
      (hex(d.varOnBorder) ? "border-color:" + hex(d.varOnBorder) + "!important;" : "") +
      "}")
  }
  if (hex(d.popBg) || d.popShadow === true || changedNum("popRadius", 14)) {
    css.push(".theme :is(.ndz-pop,.ed-modal-card){" +
      (hex(d.popBg) ? "background:" + hex(d.popBg) + "!important;" : "") +
      (hex(d.popInk) ? "color:" + hex(d.popInk) + "!important;" : "") +
      (hex(d.popBorder) ? "border-color:" + hex(d.popBorder) + "!important;" : "") +
      (changedNum("popRadius", 14) ? "border-radius:" + Number(d.popRadius) + "px!important;" : "") +
      (d.popShadow === true ? "box-shadow:0 16px 40px " + (hex(d.popShadowColor) || "rgba(0,0,0,.18)") + "!important;" : "") +
      "}")
  }
  if (d.cartTitleCase === "upper") css.push(".theme :is(.tpx-cinfo b,.cart-title){text-transform:uppercase}")
  if (d.cartMediaBorder === "plein") css.push(".theme :is(.tpx-cthumb,.cart-img){border:1px solid rgba(17,17,17,.2);border-radius:" + (Number(d.cartMediaRadius) || 0) + "px}")
  if (d.curCard === false) css.push(".theme .p-price .ndz-cur,.theme .sec-rail-row .ndz-cur{display:none}")
  if (d.curProduct === false) css.push(".theme .tpx-pprice .ndz-cur,.theme .sec-price .ndz-cur{display:none}")
  if (d.curCartItem === false) css.push(".theme .tpx-cunit .ndz-cur,.theme .tpx-cline .ndz-cur{display:none}")
  if (d.curCartTotal === false) css.push(".theme .tpx-total .ndz-cur{display:none}")
  var stacks = {
    inter: "'Inter', system-ui, sans-serif",
    system: "system-ui, sans-serif",
    grotesque: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    humanist: "'Segoe UI', Tahoma, Verdana, sans-serif",
    geometric: "Futura, 'Century Gothic', 'Avenir Next', sans-serif",
    condensed: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    didone: "'Didot', 'Bodoni MT', Georgia, serif",
    palatino: "Palatino, 'Palatino Linotype', Georgia, serif",
    times: "'Times New Roman', Times, serif",
    slab: "Rockwell, 'Roboto Slab', Georgia, serif",
    mono: "Consolas, 'Courier New', monospace",
    "gf-playfair": "'Playfair Display', Georgia, serif",
    "gf-cormorant": "'Cormorant Garamond', Georgia, serif",
    "gf-libre": "'Libre Baskerville', Georgia, serif",
    "gf-manrope": "'Manrope', system-ui, sans-serif",
    "gf-outfit": "'Outfit', system-ui, sans-serif",
    "gf-dm": "'DM Sans', system-ui, sans-serif",
    "gf-cairo": "'Cairo', system-ui, sans-serif",
    "gf-tajawal": "'Tajawal', system-ui, sans-serif",
    "gf-noto": "'Noto Naskh Arabic', serif",
    "gf-plex": "'IBM Plex Sans Arabic', system-ui, sans-serif",
    "gf-readex": "'Readex Pro', system-ui, sans-serif",
    "gf-amiri": "'Amiri', serif",
  }
  function stackOf(id) { return stacks[id] || "" }
  function roleStack(role) {
    var id = role === "titre" ? (d.fontTitle || d.font) : role === "sous" ? (d.fontSub || d.font) : (d.fontAccent || d.font)
    return stackOf(id)
  }
  function caseOf(v) {
    return v === "upper" ? "uppercase" : v === "lower" ? "lowercase" : v === "caps" ? "capitalize" : ""
  }
  if (stackOf(d.fontTitle)) css.push(".theme :is(h1,h2,h3,.sec-head h2,.tpx-title){font-family:" + stackOf(d.fontTitle) + "}")
  if (stackOf(d.fontSub)) css.push(".theme :is(.sec-sub,.sec-kicker,.p-desc,.tpx-sub){font-family:" + stackOf(d.fontSub) + "}")
  if (stackOf(d.fontAccent)) css.push(".theme :is(.sec-kicker,.p-badge,.badge-promo){font-family:" + stackOf(d.fontAccent) + "}")
  var tcase = caseOf(d.titleCase)
  if (tcase && d.titleCase !== "upper" && d.titleCase !== "lower") css.push(".theme :is(h1,h2,h3){text-transform:" + tcase + "}")
  var bcase = caseOf(d.badgeCase)
  if (bcase) css.push(".theme :is(.p-sold,.p-badge,.badge-promo){text-transform:" + bcase + "}")
  if (roleStack(d.badgeFont) && d.badgeFont && d.badgeFont !== "corps") css.push(".theme :is(.p-sold,.p-badge,.badge-promo){font-family:" + roleStack(d.badgeFont) + "}")
  if (roleStack(d.btnFont) && d.btnFont && d.btnFont !== "corps") css.push(btn + "{font-family:" + roleStack(d.btnFont) + "}")
  if (roleStack(d.btn2Font) && d.btn2Font && d.btn2Font !== "corps") css.push(btn2 + "{font-family:" + roleStack(d.btn2Font) + "}")
  var b2case = caseOf(d.btn2Case)
  if (b2case) css.push(btn2 + "{text-transform:" + b2case + "!important}")
  if (caseOf(d.btnCase) === "capitalize") css.push(btn + "{text-transform:capitalize!important}")
  if (changedNum("btn2BorderW", 1)) css.push(btn2 + "{border-width:" + Number(d.btn2BorderW) + "px!important;border-style:solid!important}")
  if (roleStack(d.cartPriceFont) && d.cartPriceFont && d.cartPriceFont !== "sous") css.push(".theme :is(.p-price,.tpx-cprice,.tpx-pprice,.sec-price){font-family:" + roleStack(d.cartPriceFont) + "}")
  var ccase = caseOf(d.cartTitleCase)
  if (ccase && d.cartTitleCase !== "upper") css.push(".theme :is(.tpx-cinfo b,.cart-title){text-transform:" + ccase + "}")
  if (d.animCard === true) css.push("@view-transition{navigation:auto}.theme :is(a.p-item,.sec-rail-card){transition:opacity .2s}.theme :is(a.p-item,.sec-rail-card):active{opacity:.7}")
  if (d.cartDiscount === false) css.push(".theme .promo{display:none!important}")
  return css.filter(Boolean).join("\n")
}

var api = { horizonPanel: horizonPanel, ndzHorizonCss: ndzHorizonCss, hzEsc: hzEsc }
if (typeof module !== "undefined" && module.exports) module.exports = api
if (typeof window !== "undefined") {
  window.horizonPanel = horizonPanel
  window.ndzHorizonCss = ndzHorizonCss
}
