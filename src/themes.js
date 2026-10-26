"use strict"
/**
 * Thèmes de vitrine — chaque marchand choisit le sien dans Réglages.
 * Tous restent dans la palette neutre (noir / blanc / gris) : ce sont
 * la typographie, les surfaces et la densité qui changent, pas du vernis coloré.
 */

const THEMES = [
  {
    id: "atelier",
    name: "Calme",
    desc: "Grand visuel, beaucoup d'air, le texte en bas. Pour n'importe quelle boutique.",
    dots: ["#FFFFFF", "#EFEDE8", "#141414"],
  },
  {
    id: "electro",
    name: "Claire",
    desc: "Barre d'annonce, recherche dans l'en-tête, cartes aérées. Pour n'importe quelle boutique.",
    dots: ["#14532D", "#F6F1E8", "#FFFFFF"],
  },
  {
    id: "bureau",
    name: "Centré",
    desc: "Logo au milieu, bannière courte, articles en liste. Pour n'importe quelle boutique.",
    dots: ["#F7C948", "#F4F1EA", "#1B1B1B"],
  },
  {
    id: "audio",
    name: "Affiche",
    desc: "Très grand titre, pied de page sombre. Pour n'importe quelle boutique.",
    dots: ["#FFFFFF", "#101010", "#D8D2C4"],
  },
  {
    id: "soin",
    name: "Séparé",
    desc: "Le texte d'un côté, la photo de l'autre. Pour n'importe quelle boutique.",
    dots: ["#3A231F", "#F3EDE6", "#C9A68B"],
  },
  {
    id: "mode",
    name: "Large",
    desc: "Bannière pleine largeur, en-tête posé dessus. Pour n'importe quelle boutique.",
    dots: ["#F2F0EB", "#8A7A63", "#171717"],
  },
  {
    id: "minimal",
    name: "Boutique",
    desc: "Header classique, hero centré, grille de cartes avec bouton « Ajouter ».",
    dots: ["#FFFFFF", "#E4E4E7", "#111111"],
  },
  {
    id: "editorial",
    name: "Magazine",
    desc: "Logo centré, sommaire, une pièce en vedette, liste numérotée. Pour n'importe quelle boutique.",
    dots: ["#FFFFFF", "#F4F4F5", "#111111"],
  },
  {
    id: "contrast",
    name: "Vitrine",
    desc: "Header à onglets, hero scindé avec mosaïque, produits en grandes lignes, fiche avec panneau d'achat collant.",
    dots: ["#111111", "#3F3F46", "#FFFFFF"],
  },
  {
    id: "mono",
    name: "Solo",
    desc: "Une seule pièce en grand, le prix, le bouton. Pour n'importe quelle boutique.",
    dots: ["#FFFFFF", "#F1F1F0", "#0A0A0A"],
  },
  {
    id: "galerie",
    name: "Galerie",
    desc: "Photo plein écran, texte discret, typographie fine. Pour n'importe quelle boutique.",
    dots: ["#FAF9F7", "#E7E3DC", "#1A1A1A"],
  },
  {
    id: "bento",
    name: "Bento",
    desc: "Grille de tuiles asymétriques, header en pilules, une tuile par produit. Moderne, très visuel.",
    dots: ["#F6F6F4", "#FFFFFF", "#141414"],
  },
  {
    id: "zen",
    name: "Zen",
    desc: "Colonne unique très aérée, grande typographie, une pièce par ligne. Pour n'importe quelle boutique.",
    dots: ["#FCFCFB", "#EFEEEA", "#1C1C1C"],
  },
  {
    id: "cod",
    name: "Vente directe",
    desc: "Un produit, des preuves, formulaire court, bouton en bas. Pour n'importe quelle boutique.",
    dots: ["#FFFFFF", "#FFF3C4", "#111111"],
  },
  {
    id: "tech",
    name: "Tech",
    desc: "Fiche en tableau, comparaison, catalogue dense. Pour n'importe quelle boutique.",
    dots: ["#FFFFFF", "#EEF2F7", "#0B63CE"],
  },
  {
    id: "marche",
    name: "Marché",
    desc: "Prix forts, badges, bandeau défilant. Pour n'importe quelle boutique.",
    dots: ["#FFFFFF", "#FFE9E1", "#E5491B"],
  },
  {
    id: "catalogue",
    name: "Catalogue",
    desc: "Barre de recherche, grille dense 5 colonnes, fiches compactes avec tableau de caractéristiques.",
    dots: ["#FFFFFF", "#E4E4E7", "#52525B"],
  },
  {
    id: "mosaique",
    name: "Mosaïque",
    desc: "Tuiles inégales, une grande pièce à la une. Pour n'importe quelle boutique.",
    dots: ["#F6F6F4", "#DEDEDA", "#141414"],
  },
  {
    id: "noir",
    name: "Noir",
    desc: "Fond sombre, très grands titres, photo plein cadre et boutons clairs. Pour n'importe quelle boutique.",
    dots: ["#0D0D0F", "#2A2A2E", "#F5F5F5"],
  },
]


/** Pour qui / pour quoi : la question que se pose un marchand, pas un vocabulaire de designer. */
const USE = {
  atelier:   { tag: "Prêt à l'emploi", for: "Toute boutique", cat: "visuel" },
  electro:   { tag: "Prêt à l'emploi", for: "Toute boutique", cat: "catalogue" },
  bureau:    { tag: "Prêt à l'emploi", for: "Toute boutique", cat: "visuel" },
  audio:     { tag: "Prêt à l'emploi", for: "Toute boutique", cat: "visuel" },
  soin:      { tag: "Prêt à l'emploi", for: "Toute boutique", cat: "visuel" },
  mode:      { tag: "Prêt à l'emploi", for: "Toute boutique", cat: "visuel" },
  minimal:   { tag: "Le classique", for: "Toute boutique", cat: "polyvalent" },
  editorial: { tag: "Le magazine", for: "Toute boutique", cat: "visuel" },
  contrast:  { tag: "Le contraste", for: "Toute boutique", cat: "visuel" },
  mono:      { tag: "Une seule pièce", for: "Toute boutique", cat: "direct" },
  galerie:   { tag: "La galerie", for: "Toute boutique", cat: "visuel" },
  bento:     { tag: "Le bento", for: "Toute boutique", cat: "polyvalent" },
  zen:       { tag: "Le zen", for: "Toute boutique", cat: "visuel" },
  cod:       { tag: "Vente directe", for: "Toute boutique", cat: "direct" },
  tech:      { tag: "Le tech", for: "Toute boutique", cat: "catalogue" },
  marche:    { tag: "Le marché", for: "Toute boutique", cat: "direct" },
  catalogue: { tag: "Le catalogue", for: "Toute boutique", cat: "catalogue" },
  mosaique:  { tag: "La mosaïque", for: "Toute boutique", cat: "polyvalent" },
  noir:      { tag: "Le noir", for: "Toute boutique", cat: "visuel" },
}

const CATEGORIES = [
  ["direct", "Vendre vite (COD)", "Un produit, un formulaire court, un bouton d'achat."],
  ["visuel", "Montrer de belles photos", "Grandes images, peu de texte, prix discrets."],
  ["catalogue", "Présenter un grand catalogue", "Recherche, grilles denses, fiches techniques."],
  ["polyvalent", "Un peu de tout", "Bon départ pour n'importe quelle boutique."],
]

for (const t of THEMES) {
  const u = USE[t.id] || {}
  t.tag = u.tag || t.name
  t.ideal = u.for || "Toute boutique"
  t.cat = u.cat || "polyvalent"
}

const DEFAULT_THEME = "minimal"
const isTheme = (id) => THEMES.some((t) => t.id === id)

/** Sélecteur visuel pour la page Réglages. */
const themePicker = (current, tileOf) => `
<fieldset class="theme-picker">
  ${THEMES.map(
    (t) => `
  <label class="theme-option">
    <input type="radio" name="theme" value="${t.id}" ${t.id === (current || DEFAULT_THEME) ? "checked" : ""}>
    <span class="theme-card">
      <span class="theme-preview tpv-${t.id}">
        <span class="tp-head"><i></i><i></i></span>
        <span class="tp-hero"></span>
        <span class="tp-grid">
          <i></i><i></i><i></i><i></i>
        </span>
      </span>
      <span class="theme-meta">
        <b>${t.name}</b>
        <span>${t.desc}</span>
        <span class="theme-dots">${t.dots.map((d) => `<i style="background:${d}"></i>`).join("")}</span>
      </span>
    </span>
  </label>`
  ).join("")}
</fieldset>`

module.exports = { THEMES, CATEGORIES, DEFAULT_THEME, isTheme, themePicker }
