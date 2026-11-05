"use strict"
/**
 * LES THÈMES DU STUDIO — les mêmes que ceux de la plateforme.
 *
 * Avant : le Studio avait ses six styles à lui (Épuré, Chaleureux, Nuit,
 * Doux, Nature, Contrasté), inventés dans la maquette. Le marchand choisissait
 * « Nuit » et rien ne changeait ailleurs : le reste de la plateforme (les pages
 * produits, les pages supplémentaires, le partage) continuait avec ses vrais
 * thèmes. Deux mondes qui ne se parlaient pas.
 *
 * Maintenant : le Studio affiche les thèmes de src/themes.js, avec leur vrai
 * identifiant. Un seul endroit décide de la liste, et le choix fait dans le
 * Studio est écrit dans la boutique (store.theme) : tout suit.
 *
 * La palette (couleurs, arrondis, police) reste ici parce qu'elle sert à
 * dessiner l'aperçu du Studio ; elle ne remplace pas le thème, elle le montre.
 */
const PLATFORM = require("./themes")

/* les six gardés, dans l'ordre où on les présente. « Claire » est le défaut :
   c'est le plus neutre, celui qui va avec le plus de produits. */
const KEPT = ["electro", "atelier", "bureau", "audio", "soin", "mode"]

const PALETTE = {
  /* Claire — barre d'annonce, recherche en tête, cartes aérées */
  electro: { bg: "#ffffff", ph: "#f2f4f6", ink: "#0f1115", mut: "#8a9099", acc: "#0f1115", rad: 0, font: "Jost" },
  /* Calme — grand visuel, beaucoup d'air, le texte en bas */
  atelier: { bg: "#fbfaf8", ph: "#efede8", ink: "#1a1a1a", mut: "#8b877f", acc: "#3a3a3a", rad: 6, font: "Jost" },
  /* Centré — logo au milieu, bannière courte, articles en liste */
  bureau: { bg: "#f6f5f2", ph: "#e8e6e0", ink: "#22201c", mut: "#8b857a", acc: "#7a6a52", rad: 10, font: "serif" },
  /* Affiche — très grand titre, pied de page sombre */
  audio: { bg: "#0e0e10", ph: "#1c1c20", ink: "#ffffff", mut: "#9b9ba5", acc: "#e8ff5a", rad: 4, font: "Jost" },
  /* Séparé — le texte d'un côté, la photo de l'autre */
  soin: { bg: "#ffffff", ph: "#f0f4f2", ink: "#17211c", mut: "#7d8b83", acc: "#2f6b4f", rad: 8, font: "Jost" },
  /* Large — bannière pleine largeur, en-tête posé dessus */
  mode: { bg: "#ffffff", ph: "#f4f1ee", ink: "#14100e", mut: "#8d8177", acc: "#14100e", rad: 0, font: "serif" },
}

const DEFAULT_ID = "electro"

/** La liste servie au Studio : id et nom venus de la plateforme, palette d'ici. */
const list = () => {
  const all = (PLATFORM.THEMES || []).slice()
  const order = {}
  KEPT.forEach((id, i) => { order[id] = i })
  return all
    .filter((t) => KEPT.includes(t.id))
    .sort((a, b) => order[a.id] - order[b.id])
    .map((t) => Object.assign({}, t, PALETTE[t.id] || {}))
    .map((t) => ({
      id: t.id,
      n: t.name,
      desc: t.desc || "",
      bg: t.bg || "#ffffff",
      ph: t.ph || "#f2f4f6",
      ink: t.ink || "#111111",
      mut: t.mut || "#8a8a92",
      acc: t.acc || "#111111",
      rad: typeof t.rad === "number" ? t.rad : 0,
      font: t.font || "Jost",
    }))
}

/** Les identifiants connus de la plateforme (pour écrire le choix dans la boutique). */
const ids = () => (PLATFORM.THEMES || []).map((t) => t.id)

module.exports = { list, ids, DEFAULT_ID, KEPT, PALETTE }
