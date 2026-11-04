"use strict"
/**
 * La police arabe du site, choisie par le marchand.
 *
 * Pourquoi un fichier à part : la même liste sert au tableau de bord (le
 * choix), au rendu du site (le style) et au Studio (l'aperçu). Une seule
 * source, donc pas de décalage entre ce qu'on choisit et ce qu'on voit.
 *
 * Toutes ces polices sont libres (licence OFL) et hébergées sur le serveur :
 * aucun appel à Google Fonts, aucune fuite de visiteurs vers un tiers.
 */

const FONTS = [
  {
    id: "cairo", family: "Cairo", name: "Cairo", shot: "Moderne",
    fr: "Moderne et très répandue",
    note: "Ronde et franche. C'est la police la plus utilisée dans le commerce en ligne arabe : elle ne surprend personne.",
  },
  {
    id: "tajawal", family: "Tajawal", name: "Tajawal", shot: "Aérée",
    fr: "Géométrique et aérée",
    note: "Lignes droites, beaucoup d'air. Un site net, presque « suisse ».",
  },
  {
    id: "almarai", family: "Almarai", name: "Almarai", shot: "Douce",
    fr: "Douce et très lisible",
    note: "Pensée pour les petits écrans : les prix et les chiffres se lisent sans effort.",
  },
  {
    id: "ibm-plex", family: "IBM Plex Sans Arabic", name: "IBM Plex Sans Arabic", shot: "Sobre",
    fr: "Sobre et professionnelle",
    note: "Un peu plus sérieuse, un peu plus « entreprise ». Elle rassure sans crier.",
  },
  {
    id: "amiri", family: "Amiri", name: "Amiri", shot: "Classique",
    fr: "Classique (calligraphie)",
    note: "La calligraphie traditionnelle du livre. Élégante et artisanale, moins « écran ».",
  },
]

/* La police du site, quand le marchand n'a rien choisi : Cairo, la plus
   répandue dans le commerce en ligne arabe. Les cinq polices ci-dessus sont
   celles qu'il peut choisir, une par une, depuis le Studio. */
const DEFAULT = "cairo"

/* La police de la PLATEFORME elle-même (Studio, tableau de bord, messages en
   arabe) : Amiri, choisie par le propriétaire. Ce n'est pas un réglage du
   marchand — son site garde la police qu'il a choisie. */
const UI = "amiri"
const uiStack = () => `"${byId(UI).family}","Segoe UI",Tahoma,sans-serif`
const byId = (id) => FONTS.find((f) => f.id === id) || null
const valid = (id) => !!byId(String(id || ""))
/** Police choisie par la boutique (jamais une valeur inventée). */
const of = (store) => byId(store && store.arabic_font) || byId(DEFAULT)
/** Pile CSS prête à écrire : la police choisie, puis des secours sûrs. */
const stack = (store) => `"${of(store).family}","Segoe UI",Tahoma,sans-serif`
/** Toutes les polices viennent de /arabic-fonts.css : on le charge toujours en arabe. */
const needsCss = () => true

module.exports = { FONTS, DEFAULT, UI, of, uiStack, valid, stack, needsCss }
