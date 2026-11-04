"use strict"
/**
 * Les métiers proposés au tout premier écran (`/demarrer`).
 *
 * Pourquoi une liste figée plutôt qu'un champ libre ? Un débutant ne sait pas
 * ce qu'est un « thème » : il sait ce qu'il vend. On choisit donc À SA PLACE
 * la mise en page de départ et les deux phrases de présentation, qu'il pourra
 * changer ensuite dans le Studio.
 *
 * `theme` = ancienne mise en page (gardée pour les boutiques déjà créées),
 * `vitrineTheme` = son équivalent quand la personne montre son travail.
 *
 * `site` / `vitrineSite` = le MODÈLE DE SITE COMPLET posé d'office. C'est lui
 * qui ouvre le Studio : depuis 2026-10, un nouveau marchand arrive directement
 * dans le Studio, et n'a donc plus deux éditeurs différents selon le thème.
 */
const LIST = [
  {
    id: "mode", kinds: ["commerce", "vitrine"], label: "Vêtements et mode", icon: "store",
    theme: "mode", vitrineTheme: "editorial",
    tagline: "Des pièces choisies, livrées chez vous.",
    about: "Une sélection de vêtements pour tous les jours. Livraison dans toute l'Algérie, paiement à la réception.",
    site: "site6", vitrineSite: "site5"
  },
  {
    id: "beaute", kinds: ["commerce", "vitrine"], label: "Beauté et cosmétiques", icon: "palette",
    theme: "soin", vitrineTheme: "galerie",
    tagline: "Des produits testés, livrés partout en Algérie.",
    about: "Soins, maquillage et produits de beauté choisis un par un. Livraison dans les 58 wilayas, paiement à la réception.",
    site: "site13", vitrineSite: "site3"
  },
  {
    id: "bijoux", kinds: ["commerce", "vitrine"], label: "Bijoux et accessoires", icon: "target",
    theme: "atelier", vitrineTheme: "zen",
    tagline: "Des bijoux faits pour durer.",
    about: "Bijoux et accessoires faits à la main, en petites séries. Livraison partout en Algérie.",
    site: "site1", vitrineSite: "site3"
  },
  {
    id: "maison", kinds: ["commerce", "vitrine"], label: "Maison et décoration", icon: "layout",
    theme: "bento", vitrineTheme: "mosaique",
    tagline: "Ce qu'il faut pour se sentir bien chez soi.",
    about: "Décoration, linge et petits meubles pour la maison. Livraison dans toute l'Algérie.",
    site: "site10", vitrineSite: "site5"
  },
  {
    id: "tech", kinds: ["commerce"], label: "Téléphones et électronique", icon: "smartphone",
    theme: "tech", vitrineTheme: "contrast",
    tagline: "Du matériel testé, garanti, livré chez vous.",
    about: "Téléphones, accessoires et petit matériel électronique. Chaque appareil est testé avant l'envoi.",
    site: "site9", vitrineSite: "site4"
  },
  {
    id: "sport", kinds: ["commerce", "vitrine"], label: "Sport et fitness", icon: "play",
    theme: "mono", vitrineTheme: "noir",
    tagline: "De quoi bouger, sans se ruiner.",
    about: "Équipement et vêtements de sport pour s'entraîner à la maison ou en salle.",
    site: "site14", vitrineSite: "site16"
  },
  {
    id: "nourriture", kinds: ["commerce", "vitrine"], label: "Alimentation et pâtisserie", icon: "box",
    theme: "marche", vitrineTheme: "galerie",
    tagline: "Fait maison, commandé aujourd'hui, livré demain.",
    about: "Pâtisseries et spécialités faites maison, sur commande. Livraison dans la wilaya.",
    site: "site11", vitrineSite: "site3"
  },
  {
    id: "artisanat", kinds: ["commerce", "vitrine"], label: "Artisanat et fait main", icon: "layers",
    theme: "zen", vitrineTheme: "atelier",
    tagline: "Du fait main, pièce par pièce.",
    about: "Des pièces fabriquées à la main, en petites quantités. Chaque commande est préparée avec soin.",
    site: "site1", vitrineSite: "site16"
  },
  {
    id: "bebe", kinds: ["commerce"], label: "Bébé et enfants", icon: "card",
    theme: "catalogue", vitrineTheme: "mosaique",
    tagline: "Pour les petits, choisi avec soin.",
    about: "Vêtements et accessoires pour bébés et enfants. Livraison dans toute l'Algérie.",
    site: "site6", vitrineSite: "site3"
  },
  {
    id: "services", kinds: ["vitrine"], label: "Services (photo, coiffure, architecture…)", icon: "user",
    theme: "minimal", vitrineTheme: "editorial",
    tagline: "Je réponds à vos projets, partout en Algérie.",
    about: "Un travail soigné, expliqué simplement. Écrivez-moi pour parler de votre projet.",
    site: "site11", vitrineSite: "site8"
  },
]

const get = (id) => LIST.find((m) => m.id === id) || null

/**
 * Les métiers d'UN SEUL type de site.
 *
 * Pourquoi : une boutique qui vend n'a rien à faire d'un choix « photographe »,
 * et un site qui montre son travail n'a rien à faire d'un choix « téléphones et
 * électronique ». Deux listes séparées, donc, pour ne jamais mélanger les deux
 * formulaires. `kinds` est déclaré sur chaque métier.
 */
const forKind = (kind) => LIST.filter((m) => (m.kinds || ["commerce", "vitrine"]).includes(kind === "vitrine" ? "vitrine" : "commerce"))

/** Ce métier est-il proposé pour ce type de site ? */
const allows = (metier, kind) => !!metier && (metier.kinds || ["commerce", "vitrine"]).includes(kind === "vitrine" ? "vitrine" : "commerce")

/** Ancienne mise en page à appliquer selon le métier et le type de site. */
const themeFor = (metier, kind) => {
  if (!metier) return ""
  return kind === "vitrine" ? metier.vitrineTheme : metier.theme
}

/** Modèle de site complet (celui du Studio) conseillé pour ce métier. */
const siteFor = (metier, kind) => {
  if (!metier) return ""
  return (kind === "vitrine" ? metier.vitrineSite : metier.site) || ""
}

module.exports = { LIST, get, forKind, allows, themeFor, siteFor }
