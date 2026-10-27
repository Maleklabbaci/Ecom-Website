/* Assistant du studio : comprend des ordres simples en français (et quelques mots d'arabe) et les applique à l'élément choisi.
   Ce n'est pas une IA générative : des règles claires, prévisibles, qui n'envoient rien à l'extérieur. */
(function () {
  "use strict"
  var fold = function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") }
  var COLORS = {
    "bleu ciel": "#38bdf8", "gris clair": "#e5e7eb", "gris fonce": "#374151", "vert clair": "#86efac", "rose clair": "#fbcfe8",
    noir: "#111111", blanc: "#ffffff", rouge: "#e11d48", bleu: "#2563eb", vert: "#16a34a", jaune: "#facc15", orange: "#f97316",
    violet: "#7c3aed", rose: "#ec4899", gris: "#6b7280", beige: "#e8dcc8", marron: "#7c4a2d", turquoise: "#14b8a6", dore: "#d4af37", or: "#d4af37", transparent: "transparent",
    "أسود": "#111111", "أبيض": "#ffffff", "أحمر": "#e11d48", "أزرق": "#2563eb", "أخضر": "#16a34a", "أصفر": "#facc15", "برتقالي": "#f97316", "بنفسجي": "#7c3aed", "وردي": "#ec4899", "رمادي": "#6b7280",
  }
  var CKEYS = Object.keys(COLORS).sort(function (a, b) { return b.length - a.length })
  var BLOCKS = [["bouton acheter", "buy"], ["acheter", "buy"], ["panier", "cartb"], ["whatsapp", "wa"], ["bouton", "btn"], ["titre", "h2"], ["paragraphe", "p"], ["texte", "p"], ["galerie", "gal"], ["image", "img"], ["photo", "img"],
    ["banniere", "hero"], ["hero", "hero"], ["bandeau", "hero"], ["colonnes", "c2"], ["cartes", "c3"], ["avantages", "c3"], ["temoignage", "tem"], ["avis", "tem"], ["faq", "faq"], ["questions", "faq"],
    ["formulaire", "form"], ["contact", "ctc"], ["video", "vid"], ["youtube", "vid"], ["separateur", "hr"], ["espace", "sp"], ["produits", "prod"], ["section", "sec"]]
  var FONTS = ["Inter", "Geist", "Urbanist", "Archivo", "Jost", "Space Grotesk", "Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Estedad", "Georgia", "Arial"]

  function colorIn(t) {
    var h = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.exec(t); if (h) return h[0]
    for (var i = 0; i < CKEYS.length; i++) { if (t.indexOf(fold(CKEYS[i])) >= 0 || t.indexOf(CKEYS[i]) >= 0) return COLORS[CKEYS[i]] }
    return null
  }
  function rgb(c) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || ""); if (m) { var x = m[1]; if (x.length === 3) x = x.replace(/./g, "$&$&"); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)] }
    var r = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c || ""); return r ? [+r[1], +r[2], +r[3]] : null
  }
  function nearest(list, target) {
    var t = rgb(target), best = null
    list.forEach(function (it) { var v = rgb(it.c); if (!v || !t) return; var d = Math.hypot(v[0] - t[0], v[1] - t[1], v[2] - t[2]); if (!best || d < best.d) best = { d: d, c: it.c } })
    return best && best.d < 170 ? best.c : null
  }
  function px(v) { return Math.round(parseFloat(v) || 0) }

  function run(input, F, ui) {
    var out = [], quotes = []
    var raw = String(input || "").replace(/["«“]([^"»”]+)["»”]/g, function (m, q) { quotes.push(q); return " §" + (quotes.length - 1) + " " })
    var clauses = raw.split(/\s*(?:[,;]|\bet\b|\bpuis\b|\bensuite\b|\bavec\b)\s*|\s+و(?=\s)/i).filter(function (x) { return x.trim() })
    clauses.forEach(function (c0) {
      var c = fold(c0).replace(/’/g, "'"), el = F.selected(), done = []
      var q = /§(\d+)/.exec(c), quoted = q ? quotes[+q[1]] : null
      var need = function () { if (!el) { out.push("✗ Sélectionne d'abord un élément dans la page."); return false } return true }
      var ok = function (m) { done.push(m) }

      if (/\bannul|\bundo\b/.test(c)) { F.undo(); return out.push("✓ Annulé") }
      if (/mobile/.test(c) && /(adapt|auto|optimis|responsive)/.test(c)) { var n = ui.autoMobile(); return out.push(n === -1 ? "✗ Passe en vue Mobile puis redis-le." : "✓ Adapté au mobile (" + n + " réglages)") }
      var rep = /(?:remplace|change|transforme)\s+(?:le|la|les|l')?\s*(?:couleur\s+)?(.+?)\s+(?:par|en)\s+(.+)/.exec(c)
      if (rep && colorIn(rep[1]) && colorIn(rep[2])) {
        var from = nearest(F.scanColors(), colorIn(rep[1])); if (!from) return out.push("✗ Je ne trouve pas cette couleur sur le site.")
        F.replaceColor(from, colorIn(rep[2])); return out.push("✓ Couleur remplacée partout")
      }
      if (/\b(ajout|insere|rajoute|mets? un|met un|cree)/.test(c)) {
        for (var i = 0; i < BLOCKS.length; i++) if (c.indexOf(BLOCKS[i][0]) >= 0) { F.insert(BLOCKS[i][1], false); return out.push("✓ Bloc ajouté : " + BLOCKS[i][0]) }
        return out.push("✗ Quel bloc ajouter ? (titre, bouton, image, FAQ, formulaire, vidéo…)")
      }
      if (/supprim|efface|enleve|retire|احذف/.test(c)) { if (need()) { F.del(); out.push("✓ Supprimé") } return }
      if (/dupliq|copie/.test(c)) { if (need()) { F.dup(); out.push("✓ Dupliqué") } return }
      if (/\bmonte\b|plus haut/.test(c)) { if (need()) { F.move("up"); out.push("✓ Monté") } return }
      if (/descend|plus bas/.test(c)) { if (need()) { F.move("down"); out.push("✓ Descendu") } return }
      if (/\bcache|\bmasque|disparait/.test(c)) { if (need()) { F.setStyle("display", "none"); out.push("✓ Masqué sur cet appareil") } return }
      if (/\baffiche|\bmontre|reaffiche/.test(c)) { if (need()) { F.setStyle("display", ""); out.push("✓ Réaffiché") } return }
      if (quoted !== null && /(ecri|texte|remplace|mets|met\b|dis|titre)/.test(c)) {
        if (need()) { if (F.editable(el)) { F.setText(quoted); out.push("✓ Texte changé") } else out.push("✗ Cet élément contient d'autres blocs : choisis le texte lui-même.") }
        return
      }
      if (!need()) return
      var cs = F.win.getComputedStyle(el), col = colorIn(c)
      var pf = /police\s+([a-z ]+)/.exec(c)
      if (pf) { var f = FONTS.filter(function (n) { return fold(n).indexOf(fold(pf[1]).trim()) === 0 })[0]; if (f) { F.setStyle("font-family", "'" + f + "',system-ui,sans-serif", true); ok("police " + f) } }
      if (col) {
        if (/fond|arriere|background|خلفية/.test(c)) { F.setStyle("background-color", col, true); ok("fond " + col) }
        else if (/bordure|contour|cadre/.test(c)) { F.setStyle("border-color", col, true); F.setStyle("border-style", "solid", true); if (!parseFloat(cs.borderTopWidth)) F.setStyle("border-width", "2px", true); ok("bordure " + col) }
        else { F.setStyle("color", col, true); ok("couleur du texte " + col) }
      }
      var fx = /\b(tres|bien|enorme|beaucoup|super)\b/.test(c)
      if (/(grand|gros|agrandi|augment|plus large|كبر)/.test(c) && !/plus large/.test(c) || /plus grand/.test(c)) {
        var isTxt = !/^(IMG|VIDEO|DIV|SECTION)$/.test(el.tagName) || (!el.children.length && (el.textContent || "").trim())
        if (isTxt) { F.setStyle("font-size", px(cs.fontSize) * (fx ? 1.6 : 1.25) + "px", true); ok("texte plus grand") }
        else { F.setStyle("width", Math.round(el.getBoundingClientRect().width * (fx ? 1.4 : 1.2)) + "px", true); ok("plus grand") }
      } else if (/(petit|reduis|diminu|rapetiss|صغر)/.test(c)) {
        var isT2 = !/^(IMG|VIDEO|DIV|SECTION)$/.test(el.tagName) || (!el.children.length && (el.textContent || "").trim())
        if (isT2) { F.setStyle("font-size", Math.max(8, px(cs.fontSize) * (fx ? 0.6 : 0.8)) + "px", true); ok("texte plus petit") }
        else { F.setStyle("width", Math.round(el.getBoundingClientRect().width * (fx ? 0.6 : 0.8)) + "px", true); ok("plus petit") }
      }
      var sz = /(\d{1,3})\s*px/.exec(c); if (sz && /(taille|police|texte)/.test(c)) { F.setStyle("font-size", sz[1] + "px", true); ok("taille " + sz[1] + "px") }
      if (/\bgras|bold|غامق/.test(c)) { F.setStyle("font-weight", "700", true); ok("gras") } else if (/\bfin\b|light/.test(c)) { F.setStyle("font-weight", "300", true); ok("fin") }
      if (/italique/.test(c)) { F.setStyle("font-style", "italic", true); ok("italique") }
      if (/souligne/.test(c)) { F.setStyle("text-decoration", "underline", true); ok("souligné") }
      if (/majuscule/.test(c)) { F.setStyle("text-transform", "uppercase", true); ok("majuscules") }
      var anim = /apparition|fade|fondu|glisse|slide|survol|hover/.test(c)
      if (anim) { /* « par la gauche » parle d'animation, pas d'alignement */ }
      else if (/centr|وسط/.test(c)) { F.setStyle("text-align", "center", true); if (cs.display === "flex") F.setStyle("justify-content", "center", true); ok("centré") }
      else if (/a gauche|gauche/.test(c)) { F.setStyle("text-align", "left", true); ok("à gauche") }
      else if (/a droite|droite/.test(c)) { F.setStyle("text-align", "right", true); ok("à droite") }
      if (/sans ombre/.test(c)) { F.setStyle("box-shadow", "none", true); ok("sans ombre") }
      else if (/ombre/.test(c)) { F.setStyle("box-shadow", "0 8px 24px rgba(0,0,0,.18)", true); ok("ombre") }
      if (/cercle|pilule|tout rond/.test(c)) { F.setStyle("border-radius", "999px", true); ok("très arrondi") }
      else if (/carre|angle droit|sans arrondi/.test(c)) { F.setStyle("border-radius", "0", true); ok("angles droits") }
      else if (/arrondi|arrondis|rond/.test(c)) { F.setStyle("border-radius", "16px", true); ok("arrondi") }
      if (/plus d'espace|aere|respire|marge interne|padding/.test(c)) { F.setStyle("padding", "40px", true); ok("plus d'espace") }
      else if (/compact|serre|moins d'espace/.test(c)) { F.setStyle("padding", "12px", true); ok("compact") }
      if (/pleine largeur|100%|toute la largeur/.test(c)) { F.setStyle("width", "100%", true); ok("pleine largeur") }
      var op = /transparen\w*\s*(\d+)?/.exec(c); if (op && !col) { F.setStyle("opacity", op[1] ? String(Math.min(1, op[1] / 100)) : "0.6", true); ok("transparence") }
      if (/apparition|fade|fondu|glisse|slide/.test(c)) { var k = /gauche/.test(c) ? "left" : /droite/.test(c) ? "right" : /zoom/.test(c) ? "zoom" : /fondu|fade/.test(c) ? "fade" : "up"; F.setAttr("data-fx", k); ok("animation " + k) }
      if (/survol|hover/.test(c)) { var hv = /zoom/.test(c) ? "zoom" : /lueur|glow|brille/.test(c) ? "glow" : "lift"; F.setAttr("data-fx-hover", hv); ok("effet au survol " + hv) }
      if (done.length) { F.commit("Assistant"); out.push("✓ " + done.join(", ")) }
      else out.push("✗ Je n'ai pas compris « " + c0.trim() + " »")
    })
    return out
  }
  window.StudioAssistant = { run: run, examples: ["fond noir et texte blanc", "plus grand, en gras, centré", "arrondi avec ombre", "ajoute une FAQ", "remplace le bleu par le rouge", "écris « Bienvenue »", "apparition par la gauche", "cache ça sur mobile"] }
})()
