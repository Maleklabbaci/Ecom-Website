"use strict"
/**
 * Sections de vitrine — briques déplaçables (éditeur type Shopify).
 * Une section = type + réglages + blocs (liste répétable, ex. FAQ, points forts).
 * Le rendu est commun, l'allure vient du thème (CSS).
 */

const { icon, initial } = require("./icons")
const { esc, money, moneyHtml } = require("./ui")
const { ndzHorizonCss } = require("../public/horizon-panel")

/* Petits libellés locaux (pas d'accès base ici : sections.js reste pur). */
const PAY_LABELS = [
  ["pay_cod", "Paiement à la livraison", "pay_cod_label"],
  ["pay_cib", "Carte CIB / Edahabia", "pay_cib_note"],
  ["pay_bank", "Virement CCP", "pay_bank_note"],
  ["pay_online", "Paiement en ligne", "pay_online_note"],
]
const SOCIAL = require("./social")

const payNames = (store) =>
  PAY_LABELS.filter(([flag]) => Number(store && store[flag]) === 1).map(([, name]) => name)

const uid = (p = "s") => p + Math.random().toString(36).slice(2, 8)

/* ------------------------------- types ------------------------------- */
const TYPES = {
  hero: {
    name: "Bannière d'accueil",
    desc: "Image de fond, titre, sous-titre et bouton.",
    fields: [
      { key: "image", label: "Image de fond", type: "image" },
      { key: "kicker", label: "Sur-titre", type: "text", placeholder: "Nouvelle collection" },
      { key: "heading", label: "Titre", type: "text", placeholder: "Laissez vide pour le nom de la boutique" },
      { key: "sub", label: "Sous-titre", type: "textarea" },
      { key: "ctaLabel", label: "Texte du bouton", type: "text", placeholder: "Voir la collection" },
      { key: "align", label: "Côté du texte", type: "select", options: [
        { value: "", label: "Comme la boutique" },
        { value: "gauche", label: "À gauche" },
        { value: "centre", label: "Au centre" },
        { value: "droite", label: "À droite" }] },
      { key: "height", label: "Hauteur", type: "select", options: ["normale", "grande", "pleine"] },
    ],
    defaults: { image: "", kicker: "", heading: "", sub: "", ctaLabel: "Voir la collection", align: "", height: "normale" },
  },
  cats: {
    name: "Bandeau de catégories",
    desc: "Les rayons de la boutique, en tuiles, pastilles, cartes ou rondes.",
    fields: [
      { key: "heading", label: "Titre (facultatif)", type: "text", placeholder: "Nos rayons" },
      { key: "style", label: "Présentation", type: "select", options: [
        { value: "tiles", label: "Tuiles" },
        { value: "pill", label: "Pastilles" },
        { value: "cards", label: "Cartes" },
        { value: "round", label: "Rondes" },
      ] },
      { key: "count", label: "Nombre de catégories", type: "number" },
    ],
    defaults: { heading: "", style: "tiles", count: 4 },
  },
  grid: {
    name: "Grille de produits",
    desc: "Le catalogue, en cartes ou en lignes selon le thème.",
    fields: [
      { key: "heading", label: "Titre de section", type: "text", placeholder: "Nos produits" },
      { key: "count", label: "Nombre de produits", type: "number" },
      { key: "columns", label: "Colonnes", type: "select", options: [2, 3, 4, 5] },
      { key: "showDesc", label: "Afficher les descriptions", type: "checkbox" },
      { key: "showPrice", label: "Afficher les prix", type: "checkbox" },
      { key: "showAdd", label: "Bouton d'ajout rapide", type: "checkbox" },
    ],
    defaults: { heading: "Nos produits", count: 8, columns: 4, showDesc: false, showPrice: true, showAdd: true },
  },
  featured: {
    name: "Produit en vedette",
    desc: "Un produit mis en avant sur deux colonnes.",
    fields: [
      { key: "heading", label: "Sur-titre", type: "text", placeholder: "Pièce en vedette" },
      { key: "productId", label: "Produit", type: "product" },
      { key: "sub", label: "Texte libre", type: "textarea" },
      { key: "reverse", label: "Image à droite", type: "checkbox" },
    ],
    defaults: { heading: "Pièce en vedette", productId: 0, sub: "", reverse: false },
  },
  text: {
    name: "Bloc de texte",
    desc: "Un paragraphe éditorial.",
    fields: [
      { key: "heading", label: "Titre", type: "text", placeholder: "Notre histoire" },
      { key: "body", label: "Texte", type: "textarea" },
      { key: "align", label: "Alignement", type: "select", options: ["centre", "gauche"] },
    ],
    defaults: { heading: "Notre histoire", body: "", align: "centre" },
  },
  html: {
    name: "HTML personnalisé",
    desc: "Bloc libre : vidéo, carte, tableau, mise en page maison.",
    fields: [
      { key: "html", label: "Code HTML", type: "textarea", max: 8000, placeholder: "<div class=\"ma-bande\">…</div>" },
      { key: "width", label: "Largeur", type: "select", options: ["pleine", "contenue"] },
      { key: "pad", label: "Espacement", type: "select", options: ["aucun", "normal", "large"] },
    ],
    defaults: { html: "", width: "contenue", pad: "normal" },
  },
  banner: {
    name: "Bandeau d'annonce",
    desc: "Une ligne pleine largeur pour une promo.",
    fields: [
      { key: "text", label: "Texte", type: "text", placeholder: "Livraison offerte dès 5 000 DZD" },
      { key: "ctaLabel", label: "Lien (texte)", type: "text", placeholder: "En profiter" },
      { key: "ctaUrl", label: "Adresse du lien", type: "text", placeholder: "#catalogue" },
    ],
    defaults: { text: "Livraison 48 wilayas — paiement à la livraison.", ctaLabel: "", ctaUrl: "#catalogue" },
  },
  benefits: {
    name: "Points forts",
    desc: "Des arguments en ligne — chaque bloc est modifiable.",
    fields: [
      { key: "look", label: "Style", type: "select", options: [
        { value: "ligne", label: "Icônes en ligne" },
        { value: "cartes", label: "Cartes" },
        { value: "numeros", label: "Numéros" },
        { value: "bandeau", label: "Bandeau sombre" },
        { value: "colonnes", label: "Grandes colonnes" },
        { value: "pastilles", label: "Pastilles" },
      ] },
      { key: "heading", label: "Titre (facultatif)", type: "text" },
    ],
    blocks: {
      name: "Point fort",
      min: 3,
      max: 6,
      fields: [
        { key: "icon", label: "Icône", type: "select", options: ["camion", "paiement", "retour", "colis", "bouclier", "caddie"] },
        { key: "title", label: "Titre", type: "text", placeholder: "Livraison 48 wilayas" },
        { key: "text", label: "Détail (facultatif)", type: "text" },
      ],
      defaults: { icon: "camion", title: "Livraison 48 wilayas", text: "" },
    },
    defaults: { heading: "", look: "ligne" },
  },
  faq: {
    name: "Questions fréquentes",
    desc: "Accordéon de questions / réponses.",
    fields: [
      { key: "look", label: "Style", type: "select", options: [
        { value: "accordeon", label: "Accordéon" },
        { value: "colonnes", label: "Deux colonnes" },
        { value: "ouvertes", label: "Réponses ouvertes" },
        { value: "liste", label: "Liste simple" },
        { value: "bordee", label: "Filet à gauche" },
        { value: "sombre", label: "Fond sombre" },
        { value: "cartes", label: "Cartes" },
      ] },
      { key: "heading", label: "Titre", type: "text", placeholder: "Questions fréquentes" },
    ],
    blocks: {
      name: "Question",
      min: 3,
      max: 12,
      fields: [
        { key: "q", label: "Question", type: "text", placeholder: "Quels sont les délais de livraison ?" },
        { key: "a", label: "Réponse", type: "textarea", placeholder: "2 à 3 jours ouvrés." },
      ],
      defaults: { q: "Question", a: "Réponse" },
    },
    defaults: { heading: "Questions fréquentes", look: "accordeon" },
  },
  gallery: {
    name: "Galerie",
    desc: "Une rangée d'images, avec légendes.",
    fields: [{ key: "heading", label: "Titre (facultatif)", type: "text" }],
    blocks: {
      name: "Image",
      min: 3,
      max: 8,
      fields: [
        { key: "image", label: "Image", type: "image" },
        { key: "caption", label: "Légende", type: "text" },
      ],
      defaults: { image: "", caption: "" },
    },
    defaults: { heading: "" },
  },
  carousel: {
    name: "Carrousel de produits",
    desc: "Défilement horizontal, taillé pour le mobile.",
    fields: [
      { key: "heading", label: "Titre", type: "text", placeholder: "Nos coups de cœur" },
      { key: "ids", label: "Produits à faire défiler", type: "products" },
      { key: "count", label: "Nombre max si aucun n'est coché", type: "number" },
      { key: "showPrice", label: "Afficher les prix", type: "checkbox" },
      { key: "showAdd", label: "Bouton d'ajout rapide", type: "checkbox" },
    ],
    defaults: { heading: "Nos coups de cœur", ids: "", count: 10, showPrice: true, showAdd: true },
  },
  media_text: {
    name: "Image + texte",
    desc: "Photo et texte côte à côte, inversables gauche / droite.",
    fields: [
      { key: "image", label: "Image", type: "image" },
      { key: "kicker", label: "Sur-titre", type: "text", placeholder: "Notre atelier" },
      { key: "heading", label: "Titre", type: "text", placeholder: "Fabriqué à Blida" },
      { key: "body", label: "Texte", type: "textarea" },
      { key: "ctaLabel", label: "Texte du bouton", type: "text" },
      { key: "ctaUrl", label: "Adresse du bouton", type: "text", placeholder: "https://…" },
      { key: "reverse", label: "Image à droite", type: "checkbox" },
    ],
    defaults: { image: "", kicker: "", heading: "Notre atelier", body: "", ctaLabel: "", ctaUrl: "", reverse: false },
  },
  reviews: {
    name: "Avis clients",
    desc: "Note globale en gros + avis avec photo du client.",
    fields: [
      { key: "look", label: "Style", type: "select", options: [
        { value: "cartes", label: "Cartes" },
        { value: "citation", label: "Grande citation" },
        { value: "liste", label: "Liste" },
        { value: "bandeau", label: "Défilement" },
        { value: "note", label: "Note à gauche" },
        { value: "polaroid", label: "Polaroïd" },
      ] },
      { key: "heading", label: "Titre", type: "text", placeholder: "Ils nous ont fait confiance" },
      { key: "big", label: "Afficher la note en grand", type: "checkbox" },
    ],
    blocks: {
      name: "Avis",
      min: 3,
      max: 12,
      fields: [
        { key: "name", label: "Prénom", type: "text", placeholder: "Amina" },
        { key: "city", label: "Wilaya", type: "text", placeholder: "Blida" },
        { key: "rating", label: "Note", type: "select", options: [5, 4, 3, 2, 1] },
        { key: "text", label: "Avis", type: "textarea" },
        { key: "image", label: "Photo du client (facultatif)", type: "image" },
      ],
      defaults: { name: "Client", city: "", rating: 5, text: "Très bonne qualité, livraison rapide.", image: "" },
    },
    defaults: { heading: "Ils nous ont fait confiance", big: true, look: "cartes" },
  },
  shipping: {
    name: "Bandeau livraison",
    desc: "Délais réels réglés par wilaya + moyens de paiement activés.",
    fields: [
      { key: "prefix", label: "Texte", type: "text", placeholder: "Paiement à la livraison" },
      { key: "showEta", label: "Afficher le délai réel", type: "checkbox" },
      { key: "showPay", label: "Afficher les moyens de paiement", type: "checkbox" },
      { key: "showWilayas", label: "Afficher « 58 wilayas »", type: "checkbox" },
    ],
    defaults: { prefix: "Paiement à la livraison", showEta: true, showPay: true, showWilayas: true },
  },
  offer: {
    name: "Offre du jour (compte à rebours)",
    desc: "Un produit, une date de fin, un compteur qui défile.",
    fields: [
      { key: "heading", label: "Titre", type: "text", placeholder: "Offre du jour" },
      { key: "productId", label: "Produit", type: "product" },
      { key: "endsAt", label: "Fin de l'offre (AAAA-MM-JJ)", type: "text", placeholder: "2026-12-31" },
      { key: "note", label: "Petit texte", type: "text", placeholder: "Stock limité" },
      { key: "ctaLabel", label: "Bouton", type: "text", placeholder: "J'en profite" },
    ],
    defaults: { heading: "Offre du jour", productId: 0, endsAt: "", note: "Stock limité", ctaLabel: "J'en profite" },
  },
  whatsapp: {
    name: "Bouton WhatsApp collant",
    desc: "Bandeau fixé en bas de l'écran, un clic ouvre la discussion.",
    fields: [
      { key: "text", label: "Texte", type: "text", placeholder: "Une question ? Écrivez-nous" },
      { key: "message", label: "Message pré-rempli", type: "text", placeholder: "Bonjour, je veux commander…" },
    ],
    defaults: { text: "Une question ? Commandez sur WhatsApp", message: "Bonjour, je voudrais commander." },
  },
  stats: {
    name: "Chiffres qui rassurent",
    desc: "Deux à quatre chiffres clés, en gros.",
    fields: [{ key: "heading", label: "Titre (facultatif)", type: "text" }],
    blocks: {
      name: "Chiffre",
      min: 2,
      max: 4,
      fields: [
        { key: "value", label: "Chiffre", type: "text", placeholder: "4 200" },
        { key: "label", label: "Légende", type: "text", placeholder: "clients livrés" },
      ],
      defaults: { value: "4 200", label: "clients livrés" },
    },
    defaults: { heading: "" },
  },
  steps: {
    name: "Notre histoire en 3 étapes",
    desc: "Une frise simple : 1, 2, 3.",
    fields: [{ key: "heading", label: "Titre", type: "text", placeholder: "Comment ça marche" }],
    blocks: {
      name: "Étape",
      min: 2,
      max: 4,
      fields: [
        { key: "title", label: "Titre", type: "text", placeholder: "Vous commandez" },
        { key: "text", label: "Détail", type: "textarea" },
      ],
      defaults: { title: "Étape", text: "" },
    },
    defaults: { heading: "Comment ça marche" },
  },
  quote: {
    name: "Citation / manifeste",
    desc: "Une phrase forte, en grand.",
    fields: [
      { key: "text", label: "Citation", type: "textarea" },
      { key: "author", label: "Signature", type: "text", placeholder: "— La maison" },
    ],
    defaults: { text: "Nous ne vendons que ce que nous porterions nous-mêmes.", author: "" },
  },
  columns: {
    name: "Colonnes (2 ou 3)",
    desc: "Image + titre + texte, en colonnes libres.",
    fields: [{ key: "heading", label: "Titre (facultatif)", type: "text" }],
    blocks: {
      name: "Colonne",
      min: 2,
      max: 3,
      fields: [
        { key: "image", label: "Image", type: "image" },
        { key: "title", label: "Titre", type: "text" },
        { key: "text", label: "Texte", type: "textarea" },
      ],
      defaults: { image: "", title: "Colonne", text: "" },
    },
    defaults: { heading: "" },
  },
  video: {
    name: "Vidéo",
    desc: "Un fichier MP4 ou un lien YouTube.",
    fields: [
      { key: "url", label: "Lien de la vidéo", type: "text", placeholder: "https://…/demo.mp4 ou YouTube" },
      { key: "heading", label: "Titre (facultatif)", type: "text" },
      { key: "note", label: "Légende (facultatif)", type: "text" },
    ],
    defaults: { url: "", heading: "", note: "" },
  },
  social: {
    name: "Réseaux sociaux",
    desc: "Les comptes du marchand (Facebook, Instagram, TikTok…).",
    fields: [
      { key: "heading", label: "Titre (facultatif)", type: "text", placeholder: "Suivez-nous" },
      { key: "style", label: "Affichage", type: "select", options: ["icones", "noms"] },
      { key: "align", label: "Alignement", type: "select", options: ["centre", "gauche"] },
    ],
    defaults: { heading: "Suivez-nous", style: "icones", align: "centre" },
  },
  cta: {
    name: "Appel à l'action",
    desc: "Un titre, une phrase, un bouton.",
    fields: [
      { key: "heading", label: "Titre", type: "text", placeholder: "Voir la collection" },
      { key: "text", label: "Phrase", type: "text", placeholder: "Les pièces ajoutées apparaissent dans le catalogue." },
      { key: "ctaLabel", label: "Texte du bouton", type: "text", placeholder: "Voir la collection" },
      { key: "ctaUrl", label: "Adresse du bouton", type: "text", placeholder: "#catalogue" },
      { key: "tone", label: "Fond", type: "select", options: [
        { value: "papier", label: "Papier" },
        { value: "sombre", label: "Sombre" },
      ] },
      { key: "align", label: "Alignement", type: "select", options: ["centre", "gauche"] },
    ],
    defaults: { heading: "Voir la collection", text: "", ctaLabel: "Voir la collection", ctaUrl: "#catalogue", tone: "papier", align: "centre" },
  },
  spacer: {
    name: "Espace / séparateur",
    desc: "Pour respirer entre deux blocs.",
    fields: [
      { key: "size", label: "Hauteur", type: "select", options: ["petit", "normal", "grand"] },
      { key: "line", label: "Afficher un trait", type: "checkbox" },
    ],
    defaults: { size: "normal", line: false },
  },
}

const ICONS = {
  camion: "truck", paiement: "cash", retour: "refresh",
  colis: "box", bouclier: "shield", caddie: "cart",
}

/* ------------------------------------------------------------------ *
 * SIX THÈMES PRÊTS : une page d'accueil courte dès l'application.
 * Bandeau, bannière, produits du marchand, trois promesses.
 * Aucun article, aucun avis, aucune photo inventés.
 * ------------------------------------------------------------------ */
const PRO_RECIPES = {
  /* Accueil court : bandeau, bannière, produits du marchand, trois promesses.
     Aucune robe, aucun sac, aucun avis inventé. La photo d'accueil est une
     photo réelle de villa, en plein jour — pas le premier article. */
  atelier: [
    { type: "banner", settings: { text: "58 wilayas, chez vous.", ctaLabel: "Voir" } },
    { type: "hero", settings: { image: "auto", kicker: "", heading: "", sub: "Des pièces choisies une par une.", ctaLabel: "Voir la collection", align: "gauche", height: "grande" } },
    { type: "carousel", settings: { heading: "Nos produits", count: 8, showPrice: true, showAdd: false } },
    { type: "benefits", settings: { heading: "" }, blocks: [
      { icon: "camion", title: "Livraison soignée", text: "Chaque colis part protégé." },
      { icon: "retour", title: "Échange 14 jours", text: "Vous changez d'avis, on reprend." },
      { icon: "paiement", title: "Paiement à la livraison", text: "Vous vérifiez, puis vous payez." },
    ] },
  ],
  electro: [
    { type: "banner", settings: { text: "Paiement à la livraison · garantie sur le matériel.", ctaLabel: "Voir" } },
    { type: "hero", settings: { image: "auto", kicker: "", heading: "", sub: "", ctaLabel: "Voir les articles", align: "gauche", height: "normale" } },
    { type: "cats", settings: { heading: "", style: "tiles", count: 4 } },
    { type: "grid", settings: { heading: "Les articles", columns: 4, count: 8, showPrice: true, showAdd: true, showDesc: true } },
    { type: "benefits", settings: { heading: "" }, blocks: [
      { icon: "camion", title: "Livraison 48 h", text: "Sur les wilayas couvertes." },
      { icon: "bouclier", title: "Garantie 6 mois", text: "Sur le matériel vendu." },
      { icon: "paiement", title: "Paiement à la livraison", text: "Espèces au livreur." },
    ] },
  ],
  bureau: [
    { type: "banner", settings: { text: "Nouveautés en ligne · réassort chaque semaine.", ctaLabel: "Voir" } },
    { type: "hero", settings: { image: "auto", kicker: "", heading: "", sub: "", ctaLabel: "Voir les articles", align: "gauche", height: "normale" } },
    { type: "grid", settings: { heading: "Les articles", columns: 4, count: 8, showPrice: true, showAdd: true, showDesc: true } },
    { type: "benefits", settings: { heading: "" }, blocks: [
      { icon: "camion", title: "Emballage soigné", text: "Prêt à offrir." },
      { icon: "retour", title: "Échange 7 jours", text: "On reprend si ça ne convient pas." },
      { icon: "paiement", title: "Paiement à la livraison", text: "Réglez au livreur." },
    ] },
  ],
  audio: [
    { type: "banner", settings: { text: "Livraison dans les 58 wilayas.", ctaLabel: "Voir" } },
    { type: "hero", settings: { image: "auto", kicker: "", heading: "", sub: "", ctaLabel: "Voir les articles", align: "gauche", height: "pleine" } },
    { type: "grid", settings: { heading: "Les articles", columns: 3, count: 6, showPrice: true, showAdd: true } },
    { type: "benefits", settings: { heading: "" }, blocks: [
      { icon: "bouclier", title: "Choix court", text: "On ne met en ligne que ce qu'on a vérifié." },
      { icon: "retour", title: "Essai 7 jours", text: "Vous testez chez vous." },
      { icon: "paiement", title: "Paiement à la livraison", text: "Vous vérifiez, puis vous payez." },
    ] },
  ],
  soin: [
    { type: "banner", settings: { text: "Livraison dans les 58 wilayas.", ctaLabel: "Voir" } },
    { type: "hero", settings: { image: "auto", kicker: "", heading: "", sub: "", ctaLabel: "Voir les articles", align: "gauche", height: "grande" } },
    { type: "grid", settings: { heading: "Les articles", columns: 3, count: 6, showPrice: true, showAdd: true } },
    { type: "benefits", settings: { heading: "" }, blocks: [
      { icon: "bouclier", title: "Fiche claire", text: "Les détails sont sur la fiche." },
      { icon: "retour", title: "Conseil avant achat", text: "Écrivez-nous, on répond." },
      { icon: "paiement", title: "Paiement à la livraison", text: "Partout en Algérie." },
    ] },
  ],
  mode: [
    { type: "banner", settings: { text: "Livraison 58 wilayas · paiement à la livraison.", ctaLabel: "Voir" } },
    { type: "hero", settings: { image: "auto", kicker: "", heading: "", sub: "", ctaLabel: "Voir les articles", align: "gauche", height: "pleine" } },
    { type: "grid", settings: { heading: "Les articles", columns: 3, count: 6, showPrice: true, showAdd: true } },
    { type: "benefits", settings: { heading: "" }, blocks: [
      { icon: "camion", title: "Livraison soignée", text: "Le colis part plié, pas tassé." },
      { icon: "retour", title: "Échange 7 jours", text: "La première pièce est changée." },
      { icon: "paiement", title: "Paiement à la livraison", text: "Vous vérifiez, puis vous payez." },
    ] },
  ],
}

const DEFAULTS_BY_THEME = {
  ...PRO_RECIPES,
  minimal: [
    { type: "hero", settings: { heading: "", sub: "", ctaLabel: "Voir la collection" } },
    { type: "featured", settings: { heading: "Pièce en vedette" } },
    { type: "grid", settings: { heading: "Nos produits", columns: 4, count: 8 } },
    { type: "benefits", settings: {} },
  ],
  editorial: [
    { type: "hero", settings: { kicker: "Collection", heading: "La sélection", sub: "" } },
    { type: "featured", settings: { heading: "Pièce en vedette" } },
    { type: "grid", settings: { heading: "La collection", columns: 3, count: 9, showDesc: true } },
    { type: "text", settings: { heading: "La maison", body: "" } },
  ],
  contrast: [
    { type: "hero", settings: { kicker: "En ligne", heading: "Le catalogue", sub: "", ctaLabel: "Voir le catalogue" } },
    { type: "banner", settings: { text: "Paiement à la livraison partout en Algérie." } },
    { type: "grid", settings: { heading: "Catalogue", columns: 1, count: 8, showDesc: true } },
    { type: "benefits", settings: {} },
  ],
  catalogue: [
    { type: "banner", settings: { text: "Livraison 48 wilayas — paiement à la livraison." } },
    { type: "grid", settings: { heading: "Tous les produits", columns: 5, count: 20 } },
  ],
  cod: [
    { type: "benefits", settings: {} },
    { type: "reviews", settings: { heading: "Ils ont commandé" } },
    { type: "shipping", settings: {} },
    { type: "faq", settings: { heading: "Avant de commander" } },
  ],
  tech: [
    { type: "grid", settings: { heading: "Catalogue", columns: 4, count: 12 } },
    { type: "shipping", settings: {} },
    { type: "stats", settings: {} },
  ],
  marche: [
    { type: "carousel", settings: { heading: "Les bonnes affaires" } },
    { type: "grid", settings: { heading: "Tout le stock", columns: 5, count: 20 } },
    { type: "reviews", settings: {} },
  ],
  bento: [
    { type: "carousel", settings: { heading: "Nouveautés" } },
    { type: "stats", settings: {} },
  ],
  zen: [
    { type: "media_text", settings: { heading: "Notre approche" } },
    { type: "quote", settings: {} },
    { type: "shipping", settings: {} },
  ],
  galerie: [
    { type: "media_text", settings: { heading: "La maison" } },
    { type: "gallery", settings: {} },
  ],
  mono: [
    { type: "reviews", settings: {} },
    { type: "offer", settings: {} },
  ],
}

const blockOf = (type, settings = {}) => {
  const b = TYPES[type] && TYPES[type].blocks
  return { id: uid("b"), settings: { ...(b ? b.defaults : {}), ...settings } }
}

const makeSection = (type, settings = {}, blocks) => {
  const t = TYPES[type] || TYPES.grid
  let list = []
  if (t.blocks) {
    list = blocks || Array.from({ length: type === "benefits" ? 3 : 2 }, (_, i) =>
      blockOf(type, type === "benefits" ? ["camion", "paiement", "retour"][i] ? { icon: ["camion", "paiement", "retour"][i] } : {} : {})
    )
  }
  return { id: uid(), type: t === TYPES[type] ? type : "grid", settings: { ...t.defaults, ...settings }, blocks: list }
}

const defaultSections = (theme) =>
  (DEFAULTS_BY_THEME[theme] || DEFAULTS_BY_THEME.minimal).map((s) =>
    makeSection(
      s.type,
      s.settings,
      (s.blocks || []).map((b) => blockOf(s.type, b))
    ))

const cleanList = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .filter((s) => s && TYPES[s.type])
    .map((s) => ({
      id: s.id || uid(), type: s.type, hidden: !!s.hidden,
      align: ["gauche", "centre", "droite"].includes(s.align) ? s.align : "",
      pad: Number.isFinite(+s.pad) && s.pad !== null && s.pad !== "" ? Math.max(0, Math.min(140, Math.round(+s.pad))) : null,
      tsize: Number.isFinite(+s.tsize) && s.tsize !== null && s.tsize !== "" ? Math.max(0.6, Math.min(2.2, +s.tsize)) : null,
      wide: ["etroite", "large", "pleine"].includes(s.wide) ? s.wide : "",
      imgH: Number.isFinite(+s.imgH) && s.imgH !== null && s.imgH !== "" ? Math.max(80, Math.min(900, Math.round(+s.imgH))) : null,
      cols: Number.isFinite(+s.cols) && s.cols !== null && s.cols !== "" ? Math.max(1, Math.min(5, Math.round(+s.cols))) : null,
      settings: s.settings || {}, blocks: Array.isArray(s.blocks) ? s.blocks : [],
    }))

/** Sections d'une page. « home » retombe sur le modèle du thème s'il n'y a rien. */
const readSections = (store, page = "home") => {
  if (!store || !store.sections) {
    return page === "home" ? defaultSections(store && store.theme) : []
  }
  let parsed
  try { parsed = JSON.parse(store.sections) } catch (_) { parsed = null }
  /* le marchand peut vider une page : on ne remet pas le modèle du thème */
  if (Array.isArray(parsed)) return page === "home" ? cleanList(parsed) : []
  if (parsed && typeof parsed === "object") return cleanList(parsed[page])
  return page === "home" ? defaultSections(store.theme) : []
}

/** Toutes les pages en une fois (éditeur). */
const readSectionsAll = (store) => {
  let parsed = null
  try { parsed = store && store.sections ? JSON.parse(store.sections) : null } catch (_) { parsed = null }
  const out = {}
  for (const k of ["home", "product", "cart", "checkout", "legal", "account"]) out[k] = []
  if (Array.isArray(parsed)) out.home = cleanList(parsed)
  else if (parsed && typeof parsed === "object") {
    for (const k of Object.keys(out)) out[k] = cleanList(parsed[k])
  }
  /* (on garde l'info en local : la mettre dans l'objet casserait l'éditeur) */
  if (!out.home.length && !parsed) out.home = defaultSections(store && store.theme)
  return out
}

/* ------------------------------ navigation ------------------------------ */
const DEFAULT_NAV = [{ id: "n1", label: "Boutique", url: "" }]

const readNav = (store) => {
  if (!store || !store.nav) return DEFAULT_NAV
  try {
    const arr = JSON.parse(store.nav)
    /* une barre de navigation volontairement vide reste vide */
    if (!Array.isArray(arr)) return DEFAULT_NAV
    return arr.filter((l) => l && l.label).slice(0, 8).map((l) => ({ id: l.id || uid("n"), label: String(l.label).slice(0, 40), url: String(l.url || "").slice(0, 200) }))
  } catch {
    return DEFAULT_NAV
  }
}

const sanitizeNav = (input) => {
  if (!Array.isArray(input)) return null
  return input
    .filter((l) => l && String(l.label || "").trim())
    .slice(0, 8)
    .map((l) => ({ id: String(l.id || uid("n")).slice(0, 14), label: String(l.label).trim().slice(0, 40), url: String(l.url || "").trim().slice(0, 200) }))
}

/* --------------------------- réglages globaux --------------------------- */
/**
 * Polices proposées au marchand.
 *
 * Les premières sont déjà sur l'appareil : rien à télécharger, plus rapide en 4G.
 * Inter est la seule police embarquée (public/inter-font.css).
 * Les entrées google se chargent seulement si le marchand les choisit,
 * via l'API CSS de Google Fonts. Le marchand ne voit jamais de clé.
 * La clé du catalogue, s'il y en a une, reste sur le serveur.
 */
const GOOGLE_FONTS = {
  "gf-playfair": { label: "Google — Playfair Display", family: "Playfair Display", stack: "'Playfair Display', Georgia, serif" },
  "gf-cormorant": { label: "Google — Cormorant", family: "Cormorant Garamond", stack: "'Cormorant Garamond', Georgia, serif" },
  "gf-libre": { label: "Google — Libre Baskerville", family: "Libre Baskerville", stack: "'Libre Baskerville', Georgia, serif" },
  "gf-manrope": { label: "Google — Manrope", family: "Manrope", stack: "'Manrope', system-ui, sans-serif" },
  "gf-outfit": { label: "Google — Outfit", family: "Outfit", stack: "'Outfit', system-ui, sans-serif" },
  "gf-dm": { label: "Google — DM Sans", family: "DM Sans", stack: "'DM Sans', system-ui, sans-serif" },
  "gf-cairo": { label: "Google — Cairo (arabe)", family: "Cairo", stack: "'Cairo', system-ui, sans-serif" },
  "gf-tajawal": { label: "Google — Tajawal (arabe)", family: "Tajawal", stack: "'Tajawal', system-ui, sans-serif" },
  "gf-noto": { label: "Google — Noto Naskh (arabe)", family: "Noto Naskh Arabic", stack: "'Noto Naskh Arabic', serif" },
  "gf-plex": { label: "Google — IBM Plex Arabic", family: "IBM Plex Sans Arabic", stack: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  "gf-readex": { label: "Google — Readex Pro (arabe)", family: "Readex Pro", stack: "'Readex Pro', system-ui, sans-serif" },
  "gf-amiri": { label: "Google — Amiri (arabe)", family: "Amiri", stack: "'Amiri', serif" },
}

const FONTS = {
  inter: { label: "Inter — neutre (défaut)", stack: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  system: { label: "Système — natif", stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  grotesque: { label: "Grotesque — Helvetica", stack: "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif" },
  humanist: { label: "Humaniste — Segoe / Verdana", stack: "'Segoe UI', Tahoma, Verdana, Geneva, sans-serif" },
  geometric: { label: "Géométrique — Futura / Century", stack: "Futura, 'Century Gothic', 'Avenir Next', 'Segoe UI', sans-serif" },
  condensed: { label: "Condensée — titres serrés", stack: "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif" },
  serif: { label: "Serif — éditorial", stack: "Georgia, 'Times New Roman', serif" },
  didone: { label: "Didone — magazine", stack: "'Didot', 'Bodoni MT', 'Playfair Display', Georgia, serif" },
  palatino: { label: "Palatino — livre", stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  times: { label: "Times — classique", stack: "'Times New Roman', Times, serif" },
  slab: { label: "Slab — affiche", stack: "Rockwell, 'Roboto Slab', 'Courier New', Georgia, serif" },
  mono: { label: "Mono — technique", stack: "'SF Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace" },
  ...Object.fromEntries(Object.entries(GOOGLE_FONTS).map(([id, g]) => [id, { label: g.label, stack: g.stack, google: g.family }])),
}

/** Nom de police Google : lettres, chiffres, espaces. Pas d'URL, pas de CSS. */
const safeFamily = (v) => {
  const s = String(v || "").replace(/\s+/g, " ").trim()
  return /^[A-Za-z0-9 ]{2,40}$/.test(s) ? s : ""
}

const fontFamilyOf = (d = {}) => {
  const custom = safeFamily(d.googleFamily)
  if (custom) return custom
  const known = FONTS[d.font] && FONTS[d.font].google
  return known || ""
}

const fontStackOf = (d = {}) => {
  const family = fontFamilyOf(d)
  if (family && safeFamily(d.googleFamily)) return `'${family}', system-ui, sans-serif`
  return (FONTS[d.font] || FONTS.inter).stack
}

/** Lien CSS de l'API Google Fonts. Vide si la police est locale. */
const fontFamilies = (d = {}) => {
  const out = []
  const custom = safeFamily(d.googleFamily)
  if (custom) out.push(custom)
  for (const id of [d.font, d.fontTitle, d.fontSub, d.fontAccent]) {
    const g = FONTS[id] && FONTS[id].google
    if (g && !out.includes(g)) out.push(g)
  }
  return out
}

const fontHref = (d = {}) => {
  const fams = fontFamilies(d)
  if (!fams.length) return ""
  const q = fams.map((f) => "family=" + encodeURIComponent(f).replace(/%20/g, "+") + ":wght@400;700").join("&")
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}

/** Liste prête à afficher dans l'éditeur (une seule source de vérité). */
const FONT_LIST = Object.entries(FONTS).map(([id, f]) => [id, f.label])

/**
 * Réglages de design de la vitrine.
 * Tout est modifiable par le marchand : couleurs, en-tête, logo, tailles,
 * formes, mode panier, CSS par page, codes HTML et remplacements de textes.
 */
const PAGE_KEYS = ["home", "product", "cart", "checkout", "done", "legal", "account", "page"]

const DESIGN_DEFAULTS = {
  /* boutons & formes */
  button: "noir",
  radius: "normal",
  radiusPx: 12,
  /* identité */
  logo: "",
  logoSize: 28,
  logoPlace: "gauche",     // gauche | centre | droite
  exampleImage: "",        // illustration de secours si un produit n'a pas de photo
  showLogo: true,          // afficher le logo (bloc image)
  showName: true,          // afficher le nom de la boutique à côté du logo
  heroLogo: true,          // afficher le logo dans la bannière d'accueil
  heroAlign: "def",        // def | gauche | centre | droite
  variantStyle: "boutons", // boutons | cartes | radio | liste
  footerNote: "",
  footerStyle: "theme",   // theme | colonnes | centre | sombre | magazine | ligne | cartes | contact
  footerBrand: "",
  footerCols: [],
  showNovadz: true,
  /* typographie */
  font: "inter",
  googleFamily: "",
  scale: 1,
  textScale: 1,
  tracking: "normal",
  weight: "600",
  /* couleurs */
  accent: "#111111",
  bg: "#FFFFFF",
  ink: "#111111",
  headBg: "",
  headInk: "",
  footBg: "",
  footInk: "",
  /* en-tête */
  headStyle: "plein",
  /* téléphone */
  mobileText: "normal",   // petit | normal | grand
  mobileTitle: "normal",  // petit | normal | grand
  mobilePad: "normal",    // serre | normal | aere
  mobileCols: 2,          // produits par ligne sur téléphone      // plein | ligne | transparent | flottant
  headHeight: "normale",   // compacte | normale | large
  headAlign: "gauche",     // gauche | centre | etale
  /* mise en page */
  containerWidth: 1240,
  /* réseaux sociaux (les liens vivent dans /dashboard/reseaux) */
  showCartLink: true,      // lien « Panier » dans l'en-tête
  stockAlert: 5,           // « Plus que N en stock » sous ce seuil
  cardStyle: "classique",  // classique | carte | ombre | bordee | compacte
  textAlign: "def",        // def | gauche | centre | droite | justifie
  searchAlign: "droite",   // gauche | centre | droite
  searchPlace: "entete",   // aucune | entete | dessous | icone
  searchHint: "Rechercher un produit…",
  productForm: "bouton",   // bouton | inline (formulaire de commande sur la fiche)
  navAdd: [],              // liens ajoutés à la main (label + url)
  socialWhere: "pied",     // aucun | entete | pied | deux
  socialStyle: "icones",   // icones | noms
  socialSize: "normal",    // petit | normal | grand
  /* panier */
  cartMode: "deux",        // panier | direct | deux
  payDirect: false,        // boutons d'achat direct par moyen de paiement
  /* personnalisation libre */
  customCss: "",
  htmlHead: "",
  htmlFooter: "",
  pageCss: {},
  pageCode: {},
  siteTemplate: "",        // id d'un template « site complet » (site1…site16) ou vide
  hide: {},
  dict: [],
  mobileOrder: [],
  /* taille exacte, de 0 à 100, pour n'importe quel texte cliqué dans l'aperçu */
  textSizes: [],
}

const HEX = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : fallback)
const num = (v, min, max, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback)

/** Nettoie un bloc de CSS : taille bornée, balises <script> retirées. */
const cleanCss = (v, max = 20000) =>
  String(v == null ? "" : v).replace(/<\/?script[^>]*>/gi, "").replace(/<\/style[^>]*>/gi, "").slice(0, max)

/** Nettoie un morceau de HTML : pas de script, pas de gestionnaire on*= */
const cleanHtml = (v, max = 12000) =>
  String(v == null ? "" : v)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?script[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .slice(0, max)

const HIDE_KEYS = [
  "productReviews", "productRelated", "productDesc",
  "cartPromo", "checkoutNote", "checkoutGeo", "checkoutEta",
]

const pageCodeKeyOk = (k) =>
  PAGE_KEYS.includes(k) || /^page:[a-z0-9-]{1,60}$/.test(String(k || ""))

const sanitizeDesign = (d = {}) => {
  const out = {
    button: oneOf(d.button, ["noir", "gris", "contour"], "noir"),
    radius: oneOf(d.radius, ["net", "normal", "doux"], "normal"),
    radiusPx: Math.round(num(d.radiusPx, 0, 32, 12)),
    footerNote: typeof d.footerNote === "string" ? d.footerNote.slice(0, 300) : "",
    footerStyle: oneOf(d.footerStyle, ["theme", "colonnes", "centre", "sombre", "magazine", "ligne", "cartes", "contact"], "theme"),
    footerBrand: typeof d.footerBrand === "string" ? d.footerBrand.slice(0, 400) : "",
    footerCols: Array.isArray(d.footerCols) ? d.footerCols.slice(0, 4).map((col) => ({
      title: String((col && col.title) || "").slice(0, 40),
      links: (Array.isArray(col && col.links) ? col.links : []).slice(0, 6).map((l) => ({
        label: String((l && l.label) || "").slice(0, 40),
        url: String((l && l.url) || "").slice(0, 200),
      })).filter((l) => l.label || l.url),
    })) : [],
    showNovadz: d.showNovadz !== false,
    logo: typeof d.logo === "string" ? d.logo.slice(0, 300) : "",
    logoSize: Math.round(num(d.logoSize, 14, 96, 28)),
    logoPlace: oneOf(d.logoPlace, ["gauche", "centre", "droite"], "gauche"),
    exampleImage: typeof d.exampleImage === "string" ? d.exampleImage.slice(0, 300) : "",
    showLogo: d.showLogo !== false,
    showName: d.showName !== false,
    heroLogo: d.heroLogo !== false,
    heroAlign: oneOf(d.heroAlign, ["def", "gauche", "centre", "droite"], "def"),
    variantStyle: oneOf(d.variantStyle, ["boutons", "cartes", "radio", "liste"], "boutons"),
    font: FONTS[d.font] ? d.font : "inter",
    googleFamily: safeFamily(d.googleFamily),
    scale: Math.round(num(d.scale, 0.75, 2, 1) * 100) / 100,
    textScale: Math.round(num(d.textScale, 0.85, 1.35, 1) * 100) / 100,
    tracking: oneOf(d.tracking, ["serre", "normal", "aere"], "normal"),
    weight: oneOf(String(d.weight), ["500", "600", "700"], "600"),
    accent: HEX(d.accent, "#111111"),
    bg: HEX(d.bg, "#FFFFFF"),
    ink: HEX(d.ink, "#111111"),
    headBg: d.headBg ? HEX(d.headBg, "") : "",
    headInk: d.headInk ? HEX(d.headInk, "") : "",
    footBg: d.footBg ? HEX(d.footBg, "") : "",
    footInk: d.footInk ? HEX(d.footInk, "") : "",
    headStyle: oneOf(d.headStyle, ["plein", "ligne", "transparent", "flottant"], "plein"),
    headHeight: oneOf(d.headHeight, ["compacte", "normale", "large"], "normale"),
    headAlign: oneOf(d.headAlign, ["gauche", "centre", "etale"], "gauche"),
    containerWidth: Math.round(num(d.containerWidth, 960, 1600, 1240)),
    mobileText: oneOf(d.mobileText, ["petit", "normal", "grand"], "normal"),
    mobileTitle: oneOf(d.mobileTitle, ["petit", "normal", "grand"], "normal"),
    mobilePad: oneOf(d.mobilePad, ["serre", "normal", "aere"], "normal"),
    mobileCols: oneOf(Number(d.mobileCols), [1, 2], 2),
    showCartLink: d.showCartLink !== false,
    stockAlert: Math.round(num(d.stockAlert, 0, 50, 5)),
    cardStyle: oneOf(d.cardStyle, ["classique", "carte", "ombre", "bordee", "compacte"], "classique"),
    textAlign: oneOf(d.textAlign, ["def", "gauche", "centre", "droite", "justifie"], "def"),
    searchAlign: oneOf(d.searchAlign, ["gauche", "centre", "droite"], "droite"),
    searchPlace: oneOf(d.searchPlace, ["aucune", "entete", "dessous", "icone"], "entete"),
    searchHint: d.searchHint == null ? "Rechercher un produit…" : String(d.searchHint).slice(0, 40),
    productForm: oneOf(d.productForm, ["bouton", "inline"], "bouton"),
    navAdd: Array.isArray(d.navAdd)
      ? d.navAdd.filter((l) => l && String(l.label || "").trim())
          .slice(0, 6)
          .map((l) => ({ label: String(l.label).trim().slice(0, 30), url: String(l.url || "").trim().slice(0, 200) }))
      : [],
    socialWhere: oneOf(d.socialWhere, ["aucun", "entete", "pied", "deux"], "pied"),
    socialStyle: oneOf(d.socialStyle, ["icones", "noms"], "icones"),
    socialSize: oneOf(d.socialSize, ["petit", "normal", "grand"], "normal"),
    cartMode: oneOf(d.cartMode, ["panier", "direct", "deux"], "deux"),
    payDirect: d.payDirect === true,
    customCss: cleanCss(d.customCss),
    htmlHead: cleanHtml(d.htmlHead),
    htmlFooter: cleanHtml(d.htmlFooter),
    pageCss: {},
    pageCode: {},
    siteTemplate: require("./site-templates").isSite(d.siteTemplate) ? d.siteTemplate : "",
    hide: {},
    dict: [],
    mobileOrder: Array.isArray(d.mobileOrder) ? d.mobileOrder.filter((x) => typeof x === "string").slice(0, 40) : [],
  }
  const pc = d.pageCss && typeof d.pageCss === "object" ? d.pageCss : {}
  PAGE_KEYS.forEach((k) => { if (pc[k]) out.pageCss[k] = cleanCss(pc[k], 8000) })
  const rawCode = d.pageCode && typeof d.pageCode === "object" ? d.pageCode : {}
  Object.keys(rawCode).slice(0, 40).forEach((k) => {
    if (!pageCodeKeyOk(k)) return
    const v = cleanHtml(rawCode[k], 40000).replace(/javascript:/gi, "")
    if (v.trim()) out.pageCode[k] = v
  })
  const hide = d.hide && typeof d.hide === "object" ? d.hide : {}
  HIDE_KEYS.forEach((k) => { if (hide[k]) out.hide[k] = true })
  if (Array.isArray(d.dict)) {
    out.dict = d.dict
      .filter((r) => r && typeof r.from === "string" && typeof r.to === "string" && r.from.trim())
      .slice(0, 60)
      .map((r) => ({ from: r.from.slice(0, 120), to: r.to.slice(0, 120) }))
  }
  out.textSizes = cleanTextSizes(d.textSizes)
  out.favicon = typeof d.favicon === "string" ? d.favicon.slice(0, 300) : ""
  out.logoInverse = typeof d.logoInverse === "string" ? d.logoInverse.slice(0, 300) : ""
  out.fontSub = FONTS[d.fontSub] ? d.fontSub : ""
  out.fontTitle = FONTS[d.fontTitle] ? d.fontTitle : ""
  out.fontAccent = FONTS[d.fontAccent] ? d.fontAccent : ""
  out.titleCase = oneOf(d.titleCase, ["def", "upper", "lower", "caps"], "def")
  out.pageWidth = oneOf(d.pageWidth, ["etroit", "normal", "large"], "normal")
  out.animPage = d.animPage === true
  out.animCard = d.animCard === true
  out.animCart = d.animCart === true
  out.cardHover = oneOf(d.cardHover, ["aucun", "zoom", "lever"], "aucun")
  out.badgePos = oneOf(d.badgePos, ["haut-droite", "haut-gauche", "bas-droite", "bas-gauche"], "haut-droite")
  out.badgeRadius = Math.round(num(d.badgeRadius, 0, 100, 100))
  out.badgePromoBg = HEX(d.badgePromoBg, "#FFFFFF")
  out.badgePromoInk = HEX(d.badgePromoInk, "#111111")
  out.badgeSoldBg = HEX(d.badgeSoldBg, "#EEF1EA")
  out.badgeSoldInk = HEX(d.badgeSoldInk, "#111111")
  out.badgeFont = oneOf(d.badgeFont, ["corps", "sous", "titre"], "corps")
  out.badgeCase = oneOf(d.badgeCase, ["def", "upper", "lower", "caps"], "def")
  out.btnBg = d.btnBg ? HEX(d.btnBg, "") : ""
  out.btnInk = d.btnInk ? HEX(d.btnInk, "") : ""
  out.btnBorder = d.btnBorder ? HEX(d.btnBorder, "") : ""
  out.btnBorderW = Math.round(num(d.btnBorderW, 0, 4, 0))
  out.btnRadius = Math.round(num(d.btnRadius, 0, 40, 14))
  out.btnFont = oneOf(d.btnFont, ["corps", "sous", "titre"], "corps")
  out.btnCase = oneOf(d.btnCase, ["def", "upper", "lower", "caps"], "def")
  out.btn2Bg = d.btn2Bg ? HEX(d.btn2Bg, "") : ""
  out.btn2Ink = d.btn2Ink ? HEX(d.btn2Ink, "") : ""
  out.btn2Border = d.btn2Border ? HEX(d.btn2Border, "") : ""
  out.btn2BorderW = Math.round(num(d.btn2BorderW, 0, 4, 1))
  out.btn2Radius = Math.round(num(d.btn2Radius, 0, 40, 14))
  out.btn2Font = oneOf(d.btn2Font, ["corps", "sous", "titre"], "corps")
  out.btn2Case = oneOf(d.btn2Case, ["def", "upper", "lower", "caps"], "def")
  out.cartType = oneOf(d.cartType, ["page", "tiroir"], "page")
  out.cartTitleCase = oneOf(d.cartTitleCase, ["def", "upper", "lower", "caps"], "def")
  out.cartPriceFont = oneOf(d.cartPriceFont, ["corps", "sous", "titre"], "sous")
  out.cartOpenDrawer = d.cartOpenDrawer === true
  out.installOn = d.installOn === true
  out.installN = [2, 3, 4].includes(Number(d.installN)) ? Number(d.installN) : 3
  out.cartNote = d.cartNote === true ? true : d.cartNote === false ? false : null
  out.cartDiscount = d.cartDiscount !== false
  out.cartEmptyUrl = typeof d.cartEmptyUrl === "string" ? d.cartEmptyUrl.slice(0, 200) : ""
  out.cartMediaBorder = oneOf(d.cartMediaBorder, ["aucun", "plein"], "aucun")
  out.cartMediaRadius = Math.round(num(d.cartMediaRadius, 0, 40, 0))
  out.drawerBg = d.drawerBg ? HEX(d.drawerBg, "") : ""
  out.drawerInk = d.drawerInk ? HEX(d.drawerInk, "") : ""
  out.drawerBorder = d.drawerBorder ? HEX(d.drawerBorder, "") : ""
  out.iconWeight = oneOf(d.iconWeight, ["fin", "def", "epais"], "def")
  out.inputBg = d.inputBg ? HEX(d.inputBg, "") : ""
  out.inputInk = d.inputInk ? HEX(d.inputInk, "") : ""
  out.inputBorder = d.inputBorder ? HEX(d.inputBorder, "") : ""
  out.inputBorderW = Math.round(num(d.inputBorderW, 0, 4, 1))
  out.inputRadius = Math.round(num(d.inputRadius, 0, 24, 4))
  out.inputPreset = oneOf(d.inputPreset, ["paragraphe", "petit", "grand"], "paragraphe")
  out.popBg = d.popBg ? HEX(d.popBg, "") : ""
  out.popInk = d.popInk ? HEX(d.popInk, "") : ""
  out.popRadius = Math.round(num(d.popRadius, 0, 28, 14))
  out.popBorder = d.popBorder ? HEX(d.popBorder, "") : ""
  out.popBorderW = Math.round(num(d.popBorderW, 0, 4, 1))
  out.popShadow = d.popShadow === true
  out.popShadowColor = HEX(d.popShadowColor, "#111111")
  out.curProduct = d.curProduct !== false
  out.curCard = d.curCard !== false
  out.curCartItem = d.curCartItem !== false
  out.curCartTotal = d.curCartTotal !== false
  out.quickAdd = d.quickAdd === true || d.quickAdd === "on" ? "on" : d.quickAdd === false || d.quickAdd === "off" ? "off" : ""
  out.quickAddMobile = d.quickAddMobile === true || d.quickAddMobile === "on" ? "on" : d.quickAddMobile === false || d.quickAddMobile === "off" ? "off" : ""
  out.cardBg = d.cardBg ? HEX(d.cardBg, "") : ""
  out.cardInk = d.cardInk ? HEX(d.cardInk, "") : ""
  out.swatchImg = d.swatchImg === true
  out.swatchW = Math.round(num(d.swatchW, 16, 64, 34))
  out.swatchH = Math.round(num(d.swatchH, 16, 64, 34))
  out.swatchRadius = Math.round(num(d.swatchRadius, 0, 40, 32))
  out.swatchBorder = oneOf(d.swatchBorder, ["aucun", "plein"], "aucun")
  out.swatchBorderW = Math.round(num(d.swatchBorderW, 0, 4, 1))
  out.swatchBorderOp = Math.round(num(d.swatchBorderOp, 0, 100, 10))
  out.varBg = d.varBg ? HEX(d.varBg, "") : ""
  out.varInk = d.varInk ? HEX(d.varInk, "") : ""
  out.varBorder = d.varBorder ? HEX(d.varBorder, "") : ""
  out.varOnBg = d.varOnBg ? HEX(d.varOnBg, "") : ""
  out.varOnInk = d.varOnInk ? HEX(d.varOnInk, "") : ""
  out.varOnBorder = d.varOnBorder ? HEX(d.varOnBorder, "") : ""
  out.varBtnBorderW = Math.round(num(d.varBtnBorderW, 0, 4, 1))
  out.varBtnRadius = Math.round(num(d.varBtnRadius, 0, 40, 14))
  out.varBtnWidth = oneOf(d.varBtnWidth, ["ajuster", "remplir"], "ajuster")
  return out
}

/** Sélecteur sûr : pas de CSS libre, seulement un chemin de texte. */
const cleanTextSel = (s) => {
  const v = String(s || "").trim().slice(0, 220)
  if (!v) return ""
  if (/[{}<;\\`]/.test(v)) return ""
  const low = v.toLowerCase()
  if (low.includes("url(") || low.includes("expression") || low.includes("javascript") || low.includes("@import") || low.includes("/*")) return ""
  const allowed = " _.:#[]=\"'>+~*()-"
  for (const ch of v) {
    const ok = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || allowed.includes(ch)
    if (!ok) return ""
  }
  return v
}

/** Tailles exactes (0 à 100) posées sur un texte précis. */
const cleanTextSizes = (list) => {
  if (!Array.isArray(list)) return []
  const out = []
  for (const r of list.slice(0, 80)) {
    if (!r || typeof r !== "object") continue
    const sel = cleanTextSel(r.sel)
    const page = r.page === "*" || PAGE_KEYS.includes(r.page) ? r.page : ""
    const n = Math.round(Number(r.size))
    if (!sel || !page || !Number.isFinite(n)) continue
    out.push({
      page,
      sel,
      size: Math.max(0, Math.min(100, n)),
      label: String(r.label || "").replace(/\s+/g, " ").trim().slice(0, 48),
    })
  }
  return out
}

const textSizeCss = (list) =>
  cleanTextSizes(list).map((r) => {
    const scope = r.page === "*" ? "html" : `html[data-page="${r.page}"][data-page="${r.page}"]`
    /* 0 reste le plus petit cran visible. Le sélecteur passe devant le
       plafond téléphone de ndz-merchant.css, sinon 1 et 100 redeviennent 32 px. */
    const size = r.size === 0 ? 1 : r.size
    const sel = `${scope} body .theme.theme ${r.sel}`
    return `${sel}{font-size:${size}px!important;line-height:1.2!important;overflow-wrap:anywhere;max-width:100%}`
  }).join("\n")

/** CSS produit par les réglages typographiques / couleurs / boutons. */
const luminance = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}

/** Clé de page à partir du chemin courant (pour le CSS par page). */
const pageKeyOfPath = (pathname, slug) => {
  const p = String(pathname || "/")
  if (!slug) return "home"
  const base = "/" + slug
  if (p === base || p === base + "/" || p === "/") return "home"
  if (p.startsWith(base + "/p/")) return "product"
  if (p.startsWith(base + "/cart") || p.startsWith(base + "/panier")) return "cart"
  if (p.startsWith(base + "/checkout")) return "checkout"
  if (p.startsWith(base + "/order/")) return "done"
  if (p.startsWith(base + "/legal")) return "legal"
  if (p.startsWith(base + "/account")) return "account"
  if (p.startsWith(base + "/pages/")) return "page"
  return "home"
}

/** Règles CSS produites par les cases à cocher « masquer ». */
const HIDE_CSS = {
  productReviews: ".theme .p-reviews,.theme .revs,.theme .sec-review,.theme .mo-reviews{display:none}",
  productRelated: ".theme .p-related,.theme .sec-related,.theme .mo-related{display:none}",
  productDesc: ".theme .p-desc,.theme .p-long{display:none}",
  cartPromo: ".theme .promo{display:none}",
  checkoutNote: ".theme .ck-note,[name=note].ck-f{display:none}",
  checkoutGeo: ".theme .ck-geo{display:none}",
  checkoutEta: ".theme .ck-eta{display:none}",
}

/** Deux couleurs trop proches = texte illisible : on force un contraste lisible. */
const contrastRatio = (a, b) => {
  const l1 = luminance(a), l2 = luminance(b)
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
const readableInk = (bg, fg) => {
  if (!bg || bg === "transparent") return fg
  return contrastRatio(bg, fg) >= 4 ? fg : (luminance(bg) > 0.55 ? "#111111" : "#FFFFFF")
}

/** Mélange deux couleurs hex (t = part de `b`). */
const hexRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ""))
  if (!m) return null
  const n = m[1]
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}
const mixHex = (a, b, t) => {
  const pa = hexRgb(a), pb = hexRgb(b)
  if (!pa || !pb) return a
  const c = pa.map((v, i) => Math.round(v * (1 - t) + pb[i] * t))
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("")
}

/** Les six thèmes « prêts » : leurs couleurs et leurs polices vivent dans
 *  themes-pro.css. Les réglages du marchand doivent passer devant — sinon
 *  l'éditeur ne change rien. On n'émet que ce qui a réellement été modifié :
 *  par défaut, chaque thème garde son identité. */
const TPX_SELECTOR = ".tp.tpx-atelier,.tp.tpx-electro,.tp.tpx-bureau,.tp.tpx-audio,.tp.tpx-soin,.tp.tpx-mode"
/* liste utilisable devant un descendant : :is(a,b) .x */
const TPX_ALL = ":is(" + TPX_SELECTOR + ")"
const tpxStyle = (d, ctx = {}) => {
  const headH = ctx.headH || "66px"
  const headJustify = ctx.headJustify || "flex-start"
  const track = ctx.track || "-0.022em"
  const changed = (k) => String(d[k] ?? "").toUpperCase() !== String(DESIGN_DEFAULTS[k] ?? "").toUpperCase()
  const vars = []
  const extra = []
  if (changed("accent")) {
    vars.push(`--tpx-accent:${d.accent}`)
    vars.push(`--tpx-accent-ink:${luminance(d.accent) > 0.6 ? "#111111" : "#FFFFFF"}`)
  }
  if (changed("bg")) {
    const ink = readableInk(d.bg, d.ink)
    vars.push(`--tpx-bg:${d.bg}`, `--tpx-ink:${ink}`)
    vars.push(`--tpx-soft:${mixHex(d.bg, ink, 0.06)}`, `--tpx-line:${mixHex(d.bg, ink, 0.14)}`)
    vars.push(`--tpx-mut:${mixHex(ink, d.bg, 0.42)}`)
  }
  if (changed("ink") && !changed("bg")) {
    const ink = readableInk(d.bg, d.ink)
    vars.push(`--tpx-ink:${ink}`, `--tpx-mut:${mixHex(ink, d.bg, 0.42)}`)
  }
  if (changed("font")) {
    const st = (FONTS[d.font] || FONTS.inter).stack
    vars.push(`--tpx-f:${st}`, `--tpx-f-head:${st}`, `--tpx-f-body:${st}`, `--tpx-head-f:${st}`)
  }
  if (changed("radiusPx")) {
    vars.push(`--tpx-r:${d.radiusPx}px`, `--tpx-r-lg:${d.radiusPx + 6}px`)
    /* les thèmes posent parfois un arrondi en dur (bouton pilule, vignette) :
       le choix du marchand doit gagner partout. */
    const sel = ":is(" + TPX_SELECTOR.split(",").map((x) => `.theme${x}`).join(",") + ")"
    extra.push(`${sel} :is(.sec-cta,.tpx-buy,.btn,button,input,select,textarea,.p-thumb,.tpx-cat,` +
      `.tpx-pill,.sec-card,.tpx-summary,.tpx-pinfo,.tpx-dlv,.tpx-pay,.tpx-cartbody,.sec-ben,.sec-cols-grid>div)` +
      `{border-radius:${d.radiusPx}px}`)
  }
  if (changed("containerWidth")) vars.push(`--tpx-max:${d.containerWidth}px`)
  /* --- en-tête : hauteur, disposition --- */
  if (changed("headHeight"))
    extra.push(`:root ${TPX_ALL} .tpx-hrow{min-height:${headH}!important}` +
      `:root ${TPX_ALL} .tpx-headwrap{min-height:${headH}!important}`)
  if (changed("headAlign")) {
    const navJ = d.headAlign === "centre" ? "center" : d.headAlign === "etale" ? "flex-end" : "flex-start"
    extra.push(`:root ${TPX_ALL} .tpx-hrow{justify-content:${headJustify}!important}`)
    extra.push(`:root ${TPX_ALL} .tpx-nav{justify-content:${navJ}!important}`)
  }
  /* --- téléphone : le marchand règle le petit écran lui-même --- */
  const MT = { petit: 0.88, normal: 1, grand: 1.12 }
  const MTI = { petit: 0.86, normal: 1, grand: 1.16 }
  const MP = { serre: 0.7, normal: 1, aere: 1.3 }
  const mob = []
  if (d.mobileText !== "normal" || d.mobileTitle !== "normal" || d.mobilePad !== "normal")
    mob.push(`@media (max-width:520px){` +
      `:root ${TPX_ALL} :is(p,li,.sec-sub,.p-desc,.sec-desc,.tpx-cat-txt,.sec-hero .sec-sub){font-size:calc(${MT[d.mobileText] || 1} * 15px)!important}` +
      `:root ${TPX_ALL} :is(h1){font-size:calc(${MTI[d.mobileTitle] || 1} * 26px)!important}` +
      `:root ${TPX_ALL} :is(.sec-head h2,.sec-btitle){font-size:calc(${MTI[d.mobileTitle] || 1} * 19px)!important}` +
      (d.mobilePad !== "normal" ? `:root ${TPX_ALL} .sec{padding-top:calc(${MP[d.mobilePad]} * 34px)!important;padding-bottom:calc(${MP[d.mobilePad]} * 34px)!important}` : "") +
      `}`)
  if (Number(d.mobileCols) !== 2)
    mob.push(`@media (max-width:520px){:root ${TPX_ALL} .sec-items{grid-template-columns:repeat(${Number(d.mobileCols) || 2},minmax(0,1fr))!important}}`)
  /* --- taille du texte --- */
  if (Number(d.textScale) !== Number(DESIGN_DEFAULTS.textScale))
    extra.push(`:root ${TPX_ALL} :is(p,li,dd,small,.sec-sub,.p-desc,.sec-desc,.tpx-cat-n,.tpx-cat-txt,.sec-hero .sec-sub)` +
      `{font-size:calc(${d.textScale} * 15px)!important}`)
  /* --- titres : interlettrage et graisse --- */
  if (d.tracking !== DESIGN_DEFAULTS.tracking)
    extra.push(`:root ${TPX_ALL} :is(h1,h2,h3,.p-name,.sec-btitle){letter-spacing:${track}!important}`)
  if (String(d.weight) !== String(DESIGN_DEFAULTS.weight))
    extra.push(`:root ${TPX_ALL} :is(h1,h2,h3,.sec-btitle){font-weight:${d.weight}!important}`)
  /* le téléphone passe en dernier : il gagne sur les réglages généraux */
  if (mob.length) extra.push(mob.join("\n"))
  if (changed("logoSize")) extra.push(`.tp .tpx-logo{height:${d.logoSize}px;width:auto}`)
  /* --- barre du haut : fond, couleur du texte, position --- */
  const HB = `:root ${TPX_ALL} .tpx-headwrap`
  if (d.headStyle === "ligne")
    extra.push(`${HB}{background:transparent!important;border-bottom:1px solid var(--tpx-line)!important}`)
  else if (d.headStyle === "transparent") {
    /* barre invisible : le fond de la page passe derrière le logo */
    extra.push(`${HB}{background:transparent!important;border-bottom:0!important}`)
    /* les thèmes dont l'en-tête est déjà posé sur la bannière : la barre flotte */
    extra.push(`:root ${TPX_ALL}.tpx-overlaid .tpx-headwrap` +
      `{position:absolute;left:0;right:0;top:0;z-index:30}`)
  }
  else if (d.headStyle === "flottant")
    extra.push(`${HB}{position:sticky!important;top:0;z-index:40}`)
  if (d.headBg) {
    extra.push(`${HB}{background:${d.headBg}!important;border-bottom-color:${d.headBg}!important}`)
    extra.push(`:root ${TPX_ALL} .tpx-headwrap :is(a,.tpx-logo-txt,.tpx-icobtn,.tpx-count){color:${readableInk(d.headBg, d.headInk || d.ink)}}`)
  } else if (d.headInk) {
    extra.push(`:root ${TPX_ALL} .tpx-headwrap :is(a,.tpx-logo-txt,.tpx-icobtn,.tpx-toprow){color:${d.headInk}!important}`)
  }
  if (d.footBg) {
    extra.push(`:root ${TPX_ALL} .tpx-foot{background:${d.footBg};color:${readableInk(d.footBg, d.footInk || d.ink)}}`)
    extra.push(`:root ${TPX_ALL} .tpx-foot a{color:inherit}`)
  } else if (d.footInk) {
    extra.push(`:root ${TPX_ALL} .tpx-foot{color:${d.footInk}}`)
  }
  const block = [vars.length ? `${TPX_SELECTOR}{${vars.join(";")}}` : "", ...extra].filter(Boolean).join("\n")
  return block ? "\n/* --- thèmes prêts : réglages du marchand --- */\n" + block : ""
}

/** Thèmes sombres : leurs couleurs servent de base tant que le marchand n'a rien choisi. */
const THEME_PALETTE = {
  noir: { bg: "#0D0D0F", ink: "#F2F2F2" },
  contrast: { bg: "#0E0E0E", ink: "#E4E4E7" },
}
/* Accent du thème tant que le marchand n'a pas choisi le sien. */
const THEME_ACCENT = {
  electro: "#14532D",
}

const storeStyle = (design, theme) => {
  const d0 = sanitizeDesign(design)
  const pal = THEME_PALETTE[theme]
  /* le marchand garde la main dès qu'il change la couleur de fond */
  const d = pal && String(d0.bg).toUpperCase() === String(DESIGN_DEFAULTS.bg).toUpperCase()
    ? { ...d0, bg: pal.bg, ink: pal.ink }
    : d0
  const f = { stack: fontStackOf(d) }
  const track = d.tracking === "serre" ? "-0.045em" : d.tracking === "aere" ? "0.025em" : "-0.022em"
  const accent = theme && THEME_ACCENT[theme] && String(d.accent).toUpperCase() === String(DESIGN_DEFAULTS.accent).toUpperCase()
    ? THEME_ACCENT[theme]
    : d.accent
  const accentInk = luminance(accent) > 0.6 ? "#111111" : "#FFFFFF"
  const ink = readableInk(d.bg, d.ink)
  const headBg = d.headBg || (d.headStyle === "transparent" || d.headStyle === "ligne" ? "transparent" : d.bg)
  const headInk = readableInk(headBg, d.headInk || ink)
  const footBg = d.footBg || ""
  const footInk = footBg ? readableInk(footBg, d.footInk || ink) : (d.footInk || ink)
  const headH = d.headHeight === "compacte" ? "56px" : d.headHeight === "large" ? "96px" : "72px"
  const headJustify = d.headAlign === "centre" ? "center" : d.headAlign === "etale" ? "space-between" : "flex-start"
  const hideCss = Object.keys(d.hide).map((k) => HIDE_CSS[k] || "").join("\n")
  return `<style>
:root{--s-font:${f.stack};--s-accent:${accent};--s-accent-ink:${accentInk};--s-zoom:${d.scale};
  --s-bg:${d.bg};--s-ink:${ink};--s-head-bg:${headBg};--s-head-ink:${headInk};
  --s-logo:${d.logoSize}px;--s-text:${d.textScale};--s-radius:${d.radiusPx}px;--s-container:${d.containerWidth}px;
  --s-weight:${d.weight};--s-track:${track};--s-foot-bg:${footBg || "transparent"};--s-foot-ink:${d.footInk || "inherit"};
  --r-sm:${Math.max(0, d.radiusPx - 3)}px;--r-md:${d.radiusPx}px;--r-lg:${d.radiusPx + 4}px;--r-xl:${d.radiusPx + 8}px}
body,.theme{font-family:var(--s-font)}
body:has(.theme){background:var(--s-bg)}
.theme{background:var(--s-bg);color:var(--s-ink)}
.theme .wrap{max-width:var(--s-container)}
.theme h1,.theme h2,.theme h3,.theme .p-name,.theme .sec-head h2,.theme .sec-btitle{
  font-weight:${d.weight};letter-spacing:${track};color:inherit}
/* La bannière a son propre fond. Le titre suit CE fond, jamais une encre
   claire (#F2F2F2) héritée d'un thème sombre et posée sur du blanc. */
.theme .sec-hero:not(.has-img){background:var(--s-bg);color:var(--s-ink)}
.theme .sec-hero:not(.has-img) :is(h1,.sec-sub,.sec-kicker,.sec-hero-text){color:inherit!important}
.theme:not(.tp) .sec-hero.has-img :is(h1,.sec-sub,.sec-kicker){color:#fff!important}
.theme p,.theme li,.theme dd,.theme small,.theme .p-desc,.theme .sec p,.theme .doc p,.theme .mn-muted{
  font-size:calc(var(--s-text) * 15px)}
/* --- en-tête personnalisable --- */
.theme > header{
  background:var(--s-head-bg);color:var(--s-head-ink);border-bottom-color:rgba(127,127,127,.22)!important}
.theme > header a,.theme > header button,.theme > header nav{color:inherit}
.theme > header > .wrap,.theme > header .wrap:first-child{min-height:${headH};justify-content:${headJustify}}
.theme > header nav{justify-content:${d.headAlign === "centre" ? "center" : d.headAlign === "etale" ? "flex-end" : "flex-start"}}
.theme.d-head-ligne > header,.theme.d-head-ligne .mn-head,.theme.d-head-ligne .ed-head,
.theme.d-head-ligne .ct-head,.theme.d-head-ligne .ca-head,.theme.d-head-ligne .mo-head,.theme.d-head-ligne .ga-head{
  border-bottom:1px solid rgba(127,127,127,.24)}
.theme.d-head-transparent > header{
  background:transparent;border-bottom:0;position:absolute;left:0;right:0;top:0;z-index:30}
.theme.d-head-flottant > header{
  position:sticky;top:0;z-index:40;background:var(--s-head-bg);backdrop-filter:saturate(1.4) blur(10px)}
/* --- logo --- */
.theme .mn-logo,.theme .ed-logo,.theme .ct-logo,.theme .ca-logo,.theme .mo-logo,.theme .ga-logo,.theme .br-logo{
  height:var(--s-logo);width:auto;max-width:none;object-fit:contain}
/* --- pied de page --- */
.theme .mn-foot,.theme .ed-foot,.theme .ct-foot,.theme .ca-foot,.theme .mo-foot,.theme .ga-foot{
  background:${d.footBg || "transparent"};color:${d.footInk || "inherit"}}
.theme .mn-foot a,.theme .mo-foot a,.theme .ga-foot a,.theme .ca-foot a{color:inherit}
/* --- boutons --- */
.theme .btn-primary,.theme .sec-cta:not(.ghost),.theme .p-add,.theme .promo-btn,.theme .add-btn,
.theme .ct-btn.big,.theme .ct-btn.wide:not(.ghost),.theme .ca-cart,.theme button.primary,.theme .mo-buy{
  background:var(--s-accent);border-color:var(--s-accent);color:var(--s-accent-ink);border-radius:var(--r-md)}
.theme .btn-primary:hover,.theme .sec-cta:not(.ghost):hover,.theme .ct-btn.big:hover{filter:brightness(1.08)}
.theme a:hover,.theme .link:hover,.theme .p-name:hover{color:var(--s-accent)}
.theme .card,.theme .p-card,.theme .sec-card,.theme .dlv-opt,.theme .pay-opt,.theme .ck-f input,
.theme .ck-f select,.theme .mn-form input,.theme .mn-form select,.theme .ct-form input{border-radius:var(--r-md)}
body:has(.theme){zoom:var(--s-zoom)}
.theme header [class$="-logo"]{height:var(--s-logo)!important;width:auto;object-fit:contain}
.theme.d-btn-noir .btn-primary,.theme.d-btn-noir .sec-cta:not(.ghost),.theme.d-btn-noir .p-add,
.theme.d-btn-noir .tpx-buy,.theme.d-btn-noir .promo-btn,.theme.d-btn-noir .add-btn,
.theme.d-btn-noir > header a[href$="/cart"],.theme.d-btn-noir > header a[href$="/checkout"]{
  background:var(--s-accent)!important;border-color:var(--s-accent)!important;color:var(--s-accent-ink)!important}
.theme.d-btn-gris .btn-primary,.theme.d-btn-gris .sec-cta:not(.ghost),.theme.d-btn-gris .p-add,
.theme.d-btn-gris .tpx-buy,.theme.d-btn-gris > header a[href$="/cart"],.theme.d-btn-gris > header a[href$="/checkout"]{
  background:#3F3F46!important;border-color:#3F3F46!important;color:#fff!important}
.theme.d-btn-contour .btn-primary,.theme.d-btn-contour .sec-cta:not(.ghost),.theme.d-btn-contour .p-add,
.theme.d-btn-contour .tpx-buy,.theme.d-btn-contour > header a[href$="/cart"],.theme.d-btn-contour > header a[href$="/checkout"]{
  background:transparent!important;color:var(--s-ink)!important;border:1px solid currentColor!important}
.theme.d-btn-noir > header a[href$="/cart"],.theme.d-btn-noir > header a[href$="/checkout"],
.theme.d-btn-gris > header a[href$="/cart"],.theme.d-btn-gris > header a[href$="/checkout"],
.theme.d-btn-contour > header a[href$="/cart"],.theme.d-btn-contour > header a[href$="/checkout"]{
  display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:8px 14px;text-decoration:none;
  font-weight:600;line-height:1;white-space:nowrap}
@media (max-width:760px){
  .sec-list{display:flex;flex-direction:column}
  .sec-list>.sec-slot{order:var(--m-order,50)}
  body:has(.theme){zoom:1}
  .theme p,.theme li,.theme .p-desc,.theme .sec p{font-size:calc(var(--s-text) * 16px)}
}
${hideCss}${tpxStyle(d, { headH, headJustify, track })}
${ndzHorizonCss(d)}
${theme === "electro" && !d.btnBg ? `
.theme.tp.tpx-electro .sec-grid .ndz-cart-add{
  width:auto;min-width:128px;height:40px;padding:0 18px;border-radius:999px!important;
  background:#fff!important;color:var(--s-accent)!important;border:1px solid #D7D7D7!important;
  font-size:0!important;display:inline-flex;align-items:center;justify-content:center}
.theme.tp.tpx-electro .sec-grid .ndz-cart-add::after{content:"Ajouter";font:600 13.5px/1 var(--s-font,inherit)}
.theme.tp.tpx-electro .sec-grid .ndz-buy-now{display:none!important}
` : ""}
</style>
${d.favicon ? `<link rel="icon" href="${esc(d.favicon)}">` : ""}
<link rel="stylesheet" href="/ndz-merchant.css">
<style>${textSizeCss(d.textSizes)}</style>`
}

const readDesign = (store) => {
  let d = {}
  if (store && store.design) {
    try { d = JSON.parse(store.design) || {} } catch { d = {} }
  }
  const out = { ...DESIGN_DEFAULTS, ...d, logo: (store && store.logo) || d.logo || "" }
  if (store && store.theme) {
    try {
      const PT = require("./public-themes")
      const edit = PT.editOf(store.theme)
      if (edit && PT.followsBuiltin(d, store.theme, { bg: edit.bg, accent: edit.accent, ink: edit.ink })) {
        out.bg = edit.bg
        out.accent = edit.accent
        out.ink = edit.ink
      }
    } catch (_) {}
  }
  return out
}

/** Brouillon en cours (design + sections + nav) ou null. */
const readDraft = (store) => {
  if (!store || !store.draft) return null
  try {
    const d = JSON.parse(store.draft)
    return d && typeof d === "object" ? d : null
  } catch { return null }
}

const pageCodeOf = (store, key) => {
  const code = readDesign(store).pageCode && readDesign(store).pageCode[key]
  return typeof code === "string" && code.trim() ? code : ""
}

const productGridHtml = (store, products) => {
  const list = (products || []).slice(0, 24)
  if (!list.length) return `<p class="ndz-var-empty">Aucun produit pour le moment.</p>`
  return `<div class="ndz-var-grid">${list.map((p) => `<a class="ndz-var-card" href="/${esc(store.slug)}/p/${p.id}">${p.image ? `<img src="${esc(p.image)}" alt="">` : ""}<b>${esc(p.title)}</b><span>${money(p.price_cents, store.currency)}</span></a>`).join("")}</div>`
}

/**
 * Remplace le corps d'une page par le code du marchand.
 * Les variables {{logo}}, {{formulaire}}, {{panier}}… restent celles de Nova.
 * Si le code est vide, la page du thème ne change pas.
 */
/** Un document complet collé dans le code ne doit pas se retrouver
 *  une seconde fois dans le shell du thème. */
const unwrapDocument = (code) => {
  if (!/^\s*(<!doctype|<html\b)/i.test(code)) return code
  const body = code.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  let inner = body ? body[1] : code
  inner = inner.replace(/<script[\s\S]*?<\/script>/gi, "")
  const headEnd = inner.search(/<\/header>/i)
  const foot = inner.search(/<footer\b/i)
  if (headEnd !== -1 && foot > headEnd) inner = inner.slice(headEnd + "</header>".length, foot)
  return inner.trim()
}

/** La racine est déjà dans le code : variable Nova, ou le vrai bloc rendu. */
const hasRoot = (code, name) => {
  if (new RegExp("\\{\\{\\s*" + name + "\\s*\\}\\}").test(code)) return true
  if (/\{\{\s*contenu\s*\}\}/.test(code)) return true
  if (name === "formulaire") return /<form\b[^>]*\/checkout/i.test(code)
  if (name === "panier") return /<form\b[^>]*\/cart/i.test(code) || /panier est vide|Votre panier|Mon panier/i.test(code)
  if (name === "achat") {
    return /class="[^"]*\b(ndz-buy|ndz-buyform|varform|optform)\b/i.test(code)
      || /name="buy_id"/i.test(code)
      || /formaction="[^"]*\/direct/i.test(code)
  }
  return false
}

const applyPageCode = (store, key, normal, extras = {}) => {
  const stored = pageCodeOf(store, key)
  if (!stored) return normal
  const code = unwrapDocument(stored)
  if (!code) return normal
  const D = readDesign(store)
  const slug = esc(store.slug || "")
  const logo = D.logo
    ? `<img class="ndz-var-logo" src="${esc(D.logo)}" alt="${esc(store.name || "")}" style="height:${Math.round(Number(D.logoSize) || 28)}px;width:auto">`
    : `<span class="ndz-var-mark">${esc(String(store.name || "?").trim().slice(0, 1).toUpperCase() || "?")}</span>`
  const menu = readNav(store).map((l) => {
    const u = String(l.url || "").trim()
    const href = !u ? `/${slug}` : /^https?:\/\//i.test(u) ? esc(u) : u.startsWith("/") ? esc(u) : `/${slug}/${esc(u.replace(/^\//, ""))}`
    return `<a href="${href}">${esc(l.label || "")}</a>`
  }).join("")
  let produits = extras.produits || ""
  if (!produits && /\{\{\s*produits\s*\}\}/.test(code)) {
    let rows = []
    try {
      rows = require("./db").prepare("SELECT id, title, price_cents, image FROM products WHERE store_id = ? AND active = 1 ORDER BY id DESC LIMIT 24").all(store.id)
    } catch (_) { rows = [] }
    produits = productGridHtml(store, rows)
  }
  const vars = {
    logo,
    nom: esc(store.name || ""),
    menu: `<nav class="ndz-var-menu">${menu}</nav>`,
    recherche: `<form class="ndz-search ndz-search-in" method="get" action="/${slug}" role="search"><input name="q" type="search" placeholder="${esc(D.searchHint == null ? "Rechercher un produit…" : D.searchHint)}" aria-label="Rechercher"></form>`,
    produits,
    contenu: normal || "",
    formulaire: extras.formulaire || `<a class="btn btn-primary" href="/${slug}/checkout">Commander</a>`,
    panier: extras.panier || `<a class="btn btn-ghost" href="/${slug}/cart">Voir le panier</a>`,
    achat: extras.achat || "",
    pied: esc(D.footerNote || ""),
    telephone: esc(store.phone || ""),
    wilaya: esc(store.wilaya || ""),
  }
  let html = code.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : ""
  ))
  if (key === "checkout" && extras.formulaire && !hasRoot(code, "formulaire")) html += extras.formulaire
  if (key === "cart" && extras.panier && !hasRoot(code, "panier")) html += extras.panier
  if (key === "product" && extras.achat && !hasRoot(code, "achat")) html += extras.achat
  return html
}

const renderPage = (store, key, normal, extras) => {
  if (!pageCodeOf(store, key)) return { html: normal, ownCode: false }
  return { html: applyPageCode(store, key, normal, extras), ownCode: true }
}

const designClass = (design) =>
  `d-btn-${["noir", "gris", "contour"].includes(design.button) ? design.button : "noir"}` +
  ` d-radius-${["net", "normal", "doux"].includes(design.radius) ? design.radius : "normal"}` +
  ` d-head-${["plein", "ligne", "transparent", "flottant"].includes(design.headStyle) ? design.headStyle : "plein"}` +
  (design.footerStyle && design.footerStyle !== "theme" ? ` d-foot-on d-foot-${design.footerStyle}` : "")

/** CSS propre à une page (éditable dans l'onglet « Pages »). */
const pageCssFor = (design, pageKey) => {
  const d = design && design.pageCss ? design.pageCss : {}
  return d[pageKey] ? `<style>${d[pageKey]}</style>` : ""
}

/* ------------------------------- rendu ------------------------------- */
/** Fichier local vraiment servi. Une URL /demo/ absente n'est pas une photo. */
const localImageOk = (url) => {
  const src = String(url || "").trim().split("?")[0]
  if (!src || !src.startsWith("/") || src.startsWith("//")) return false
  try {
    return require("fs").existsSync(require("path").join(__dirname, "..", "public", src.slice(1)))
  } catch (_) { return false }
}

const img = (url, cls, tileTitle) => {
  const src = String(url || "").trim()
  /* pas d'icône cassée, pas de photo inventée : un cadre vide tant que le fichier n'est pas là */
  if (!src || (src.startsWith("/") && !src.startsWith("//") && !localImageOk(src)))
    return `<span class="ph" aria-hidden="true"></span>`
  const fallback = "this.onerror=null;this.replaceWith(Object.assign(document.createElement('span'),{className:'ph'}))"
  return `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="${fallback}">`
}

const productItem = (store, p, s) => {
  const bare = !localImageOk(p.image)
  const showPrice = s.settings.showPrice !== false
  const plate = bare
    ? `<span class="ph-plate"><span class="ph-name">${esc(p.title)}</span>${showPrice ? `<span class="ph-price">${moneyHtml(p.price_cents, store.currency)}</span>` : ""}</span>`
    : img(p.image, "p-img", p.title)
  return `
<article class="p-item" data-title="${esc(String(p.title).toLowerCase())}">
  <a class="p-thumb${bare ? " no-photo" : ""}" href="/${esc(store.slug)}/p/${p.id}">
    ${plate}
    ${p.stock === 0 ? `<i class="p-sold">Rupture</i>` : ""}
  </a>
  <div class="p-meta">
    <a class="p-name" href="/${esc(store.slug)}/p/${p.id}">${esc(p.title)}</a>
    ${s.settings.showDesc !== false && s.settings.showDesc && p.description ? `<p class="p-desc">${esc(p.description.slice(0, 120))}</p>` : ""}
    <div class="p-row">
      ${s.settings.showPrice !== false ? `<span class="p-price">${moneyHtml(p.price_cents, store.currency)}</span>` : "<span></span>"}
      ${s.settings.showAdd !== false
        ? `<form class="ndz-buy" method="post" action="/${esc(store.slug)}/cart"><input type="hidden" name="product_id" value="${p.id}">
             <button class="p-add ndz-cart-add" ${p.stock === 0 ? "disabled" : ""} aria-label="Ajouter au panier">+</button>
             <button class="p-add ndz-buy-now" formaction="/${esc(store.slug)}/direct" ${p.stock === 0 ? "disabled" : ""} aria-label="Acheter maintenant">+</button></form>`
        : ""}
    </div>
  </div>
</article>`
}

const RENDER = {
  hero(store, s, { products = [], design }) {
    const st = s.settings
    /* « auto » : la bannière prend la photo du premier produit. Une boutique qui a
       des articles n'a donc jamais une bannière vide, même avant d'avoir choisi
       une photo d'accueil. */
    if (st.image && String(st.image).startsWith("/demo/")) {
      try {
        const abs = require("path").join(__dirname, "..", "public", String(st.image).slice(1))
        if (!require("fs").existsSync(abs)) st.image = "auto"
      } catch (_) { st.image = "auto" }
    }
    if (st.image === "auto") {
      const first = (products || []).find((p) => p && p.image && localImageOk(p.image))
      st.image = first ? first.image : ""
    }
    /* un chemin local absent ne doit pas peindre une bannière noire vide */
    if (st.image && String(st.image).startsWith("/") && !String(st.image).startsWith("//") && !localImageOk(st.image))
      st.image = ""
    /* l'alignement du texte : réglé sur la bannière, ou pour toute la boutique */
    const want = st.align || (design && design.heroAlign) || "centre"
    const align = want === "gauche" ? "left" : want === "droite" ? "right" : "center"
    const height = ["grande", "pleine"].includes(st.height) ? st.height : "normale"
    /* logo de la bannière : le marchand peut le retirer sans toucher à l'en-tête */
    const logo = design && design.logo && design.heroLogo !== false && design.showLogo !== false
    const heading = String(st.heading || "").trim()
    const sub = String(st.sub || "").trim()
    /* Champ vide = nom de la boutique. C'est ce que promet le placeholder
       du champ (« Laissez vide pour le nom de la boutique ») : le slogan
       reste affiché ailleurs (en-tête, métadonnées), pas en titre principal. */
    const title = heading || store.name || ""
    return `
<section class="sec sec-hero h-${height} a-${align}${st.image ? " has-img" : ""}" data-section="${s.id}" data-label="Bannière d'accueil">
  ${st.image ? `<div class="sec-hero-bg" style="background-image:url('${esc(st.image)}')"></div>` : ""}
  <div class="wrap sec-hero-in">
    <div class="sec-hero-text">
      ${logo ? `<img class="sec-hero-logo" src="${esc(logo)}" alt="${esc(store.name)}">` : ""}
      ${st.kicker ? `<p class="sec-kicker" data-field="kicker">${esc(st.kicker)}</p>` : ""}
      ${title ? `<h1 data-field="heading">${esc(title)}</h1>` : ""}
      ${sub ? `<p class="sec-sub" data-field="sub">${esc(sub)}</p>` : ""}
      ${st.ctaLabel ? `<a class="sec-cta" href="#catalogue">${esc(st.ctaLabel)}</a>` : ""}
    </div>
    ${
      store.theme === "contrast" && !st.image
        ? `<div class="sec-hero-media">${products.slice(0, 4).map((p) => `<a class="sec-mtile" href="/${esc(store.slug)}/p/${p.id}">${img(p.image, "p-img", p.title)}</a>`).join("") || `<span class="sec-mtile">${icon("box", 26)}</span>`}</div>`
        : ""
    }
  </div>
</section>`
  },

  cats(store, s, ctx = {}) {
    const st = s.settings
    const style = ["tiles", "pill", "cards", "round"].includes(st.style) ? st.style : "tiles"
    const n = Math.max(1, Math.min(12, parseInt(st.count, 10) || 4))
    /* les rayons viennent du contexte, sinon on les relit : un thème prêt
       (Soin, notamment) ne doit pas dire « Aucun rayon » alors qu'ils existent. */
    let cats = ctx.cats
    if (!Array.isArray(cats)) {
      try { cats = require("./shop").categories(store.id) || [] } catch (_) { cats = [] }
    }
    const list = (cats || []).slice(0, style === "pill" ? Math.max(n, 8) : n)
    /* aucun rayon : le bloc le dit clairement (jamais un trou muet) */
    if (!list.length) {
      /* Atelier : pas de pastilles vides. Les tuiles n'apparaissent que s'il y a des rayons. */
      if (store && store.theme === "atelier") return ""
      return `
<section class="sec sec-cats" id="rayons" data-section="${s.id}" data-label="Bandeau de catégories">
  <div class="tpx-cats tpx-cats-${style}"><div class="tpx-wrap"><div class="sec-empty">
    Aucun rayon pour le moment. Ajoutez des catégories dans Catalogue → Catégories, elles apparaîtront ici.</div></div></div>
</section>`
    }
    const items = style === "pill"
      ? list.map((c) => `<a class="tpx-pill" href="/${esc(store.slug)}?cat=${esc(c.slug)}">${icon("grid", 15)}<span>${esc(c.name)}</span></a>`).join("")
      : list.map((c) => `<a class="tpx-cat" href="/${esc(store.slug)}?cat=${esc(c.slug)}">
        <span class="tpx-cat-txt">${esc(c.name)}</span>
        <span class="tpx-cat-n">${c.n || 0} article${c.n > 1 ? "s" : ""}</span>
      </a>`).join("")
    const head = st.heading
      ? `<div class="tpx-wrap"><div class="sec-head"><h2>${esc(st.heading)}</h2><span>${list.length} rayon${list.length > 1 ? "s" : ""}</span></div></div>`
      : ""
    return `
<section class="sec sec-cats" id="rayons" data-section="${s.id}" data-label="Bandeau de catégories">
  <div class="tpx-cats tpx-cats-${style}">${head}<div class="tpx-wrap">${items}</div></div>
</section>`
  },
  grid(store, s, { products = [] }) {
    const st = s.settings
    const n = Math.max(1, Math.min(40, parseInt(st.count, 10) || 8))
    const list = products.slice(0, n)
    /* jamais plus de colonnes que d'articles : sinon la grille laisse un trou */
    const cols = Math.max(1, Math.min(5, parseInt(s.cols, 10) || parseInt(st.columns, 10) || 4, Math.max(1, list.length)))
    if (!list.length) {
      if (store && store.theme === "atelier") {
        return `<section class="sec sec-grid sec-grid-wait" id="catalogue" data-section="${s.id}" data-label="Grille de produits"><div class="wrap"><div class="sec-head">${st.heading ? `<h2 data-field="heading">${esc(st.heading)}</h2>` : ""}</div><p class="at-wait">Les pièces que vous ajoutez apparaîtront ici.</p></div></section>`
      }
      return `<section class="sec sec-grid" data-section="${s.id}" data-label="Grille de produits"><div class="wrap"><div class="sec-empty">Aucun produit pour le moment.</div></div></section>`
    }
    return `
<section class="sec sec-grid" id="catalogue" data-section="${s.id}" data-label="Grille de produits">
  <div class="wrap">
    <div class="sec-head">${st.heading ? `<h2 data-field="heading">${esc(st.heading)}</h2>` : ""}<span>${list.length} article${list.length > 1 ? "s" : ""}</span></div>
    <div class="sec-items${s.cols ? " cols-fixed" : ""}" style="--cols:${cols}">${list.map((p) => productItem(store, p, s)).join("")}</div>
  </div>
</section>`
  },

  featured(store, s, { products = [] }) {
    const st = s.settings
    const p = products.find((x) => String(x.id) === String(st.productId)) || products[0]
    if (!p) return ""
    const bare = !localImageOk(p.image)
    return `
<section class="sec sec-featured${st.reverse ? " rev" : ""}${bare ? " no-photo" : ""}" data-section="${s.id}" data-label="Produit en vedette">
  <div class="wrap sec-featured-in">
    ${bare ? "" : `<a class="sec-fig" href="/${esc(store.slug)}/p/${p.id}">${img(p.image, "sec-fig-img", p.title)}<span class="sec-figcap">${esc(p.title)}</span></a>`}
    <div class="sec-ftext">
      ${st.heading ? `<p class="sec-kicker">${esc(st.heading)}</p>` : ""}
      <h2><a href="/${esc(store.slug)}/p/${p.id}">${esc(p.title)}</a></h2>
      ${st.sub ? `<p data-field="sub">${esc(st.sub)}</p>` : ""}
      <div class="sec-price">${moneyHtml(p.price_cents, store.currency)}</div>
      <a class="sec-cta ghost" href="/${esc(store.slug)}/p/${p.id}">Voir la pièce</a>
    </div>
  </div>
</section>`
  },

  html(store, s) {
    const st = s.settings
    if (!st.html || !String(st.html).trim())
      return `<section class="sec sec-html" data-section="${s.id}" data-label=el="HTML personnalisé"><div class="wrap"><div class="sec-empty">Bloc HTML vide : collez votre code dans l'éditeur.</div></div></section>`
    const safe = String(st.html)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/javascript:/gi, "")
    const cls = `sec sec-html pad-${["aucun", "normal", "large"].includes(st.pad) ? st.pad : "normal"} w-${st.width === "pleine" ? "full" : "in"}`
    return `<section class="${cls}" data-section="${s.id}" data-label="HTML personnalisé">${safe}</section>`
  },

  text(store, s) {
    const st = s.settings
    return `
<section class="sec sec-text a-${st.align === "gauche" ? "left" : "center"}" data-section="${s.id}" data-label="Bloc de texte">
  <div class="wrap sec-text-in">
    ${st.heading ? `<h2 data-field="heading">${esc(st.heading)}</h2>` : ""}
    ${st.body ? `<p data-field="body">${esc(st.body)}</p>` : ""}
  </div>
</section>`
  },

  banner(store, s) {
    const st = s.settings
    if (!st.text) return ""
    const href = st.ctaUrl || "#catalogue"
    return `
<section class="sec sec-banner" data-section="${s.id}" data-label="Bandeau d'annonce">
  <div class="wrap sec-banner-in">
    <span>${esc(st.text)}</span>
    ${st.ctaLabel ? `<a href="${esc(href)}">${esc(st.ctaLabel)} ${icon("arrowRight", 13)}</a>` : ""}
  </div>
</section>`
  },

  benefits(store, s) {
    const blocks = s.blocks && s.blocks.length ? s.blocks : [blockOf("benefits")]
    const look = ["ligne", "cartes", "numeros", "bandeau", "colonnes", "pastilles"].includes(s.settings.look) ? s.settings.look : "ligne"
    return `
<section class="sec sec-benefits look-${look}" data-section="${s.id}" data-label="Points forts">
  <div class="wrap">
    ${s.settings.heading ? `<h2 class="sec-btitle" data-field="heading">${esc(s.settings.heading)}</h2>` : ""}
    <div class="sec-bgrid" style="--bn:${blocks.length}">
      ${blocks.map((b) => `<div class="sec-bitem">${icon(ICONS[b.settings.icon] || "truck", 18)}<span><b>${esc(b.settings.title || "")}</b>${b.settings.text ? `<i>${esc(b.settings.text)}</i>` : ""}</span></div>`).join("")}
    </div>
  </div>
</section>`
  },

  faq(store, s) {
    const blocks = s.blocks && s.blocks.length ? s.blocks : []
    if (!blocks.length) return ""
    const look = ["accordeon", "colonnes", "ouvertes", "liste", "bordee", "sombre", "cartes"].includes(s.settings.look) ? s.settings.look : "accordeon"
    const open = look === "ouvertes" || look === "liste" ? " open" : ""
    return `
<section class="sec sec-faq look-${look}" data-section="${s.id}" data-label="Questions fréquentes">
  <div class="wrap sec-faq-in">
    ${s.settings.heading ? `<h2 data-field="heading">${esc(s.settings.heading)}</h2>` : ""}
    ${blocks.map((b) => `<details class="sec-q"${open}><summary>${esc(b.settings.q || "")}</summary><p>${esc(b.settings.a || "")}</p></details>`).join("")}
  </div>
</section>`
  },

  gallery(store, s) {
    const blocks = (s.blocks || []).filter((b) => {
      const src = String((b.settings && b.settings.image) || "").trim()
      if (!src) return false
      if (src.startsWith("/") && !src.startsWith("//")) return localImageOk(src)
      return true
    })
    /* pas de cadre « ajoutez des images » sur la vitrine : une galerie vide n'existe pas pour le client */
    if (!blocks.length) return ""
    return `
<section class="sec sec-gallery" data-section="${s.id}" data-label="Galerie">
  <div class="wrap">
    ${s.settings.heading ? `<div class="sec-head"><h2>${esc(s.settings.heading)}</h2></div>` : ""}
    <div class="sec-ggrid" style="--gn:${blocks.length}">
      ${blocks.map((b) => `<figure class="sec-gitem"><img src="${esc(b.settings.image)}" alt=""><figcaption>${esc(b.settings.caption || "")}</figcaption></figure>`).join("")}
    </div>
  </div>
</section>`
  },

  carousel(store, s, { products = [] }) {
    const st = s.settings
    const n = Math.max(2, Math.min(30, parseInt(st.count, 10) || 10))
    const rawIds = String(st.ids || "")
    const picked = rawIds.split(",").map((x) => parseInt(x, 10)).filter(Boolean)
    const list = rawIds === "0" ? [] : picked.length
      ? picked.map((id) => products.find((p) => p.id === id)).filter(Boolean)
      : products.slice(0, n)
    if (!list.length) {
      if (store && store.theme === "atelier") {
        return `<section class="sec sec-carousel sec-grid-wait" id="catalogue" data-section="${s.id}" data-label="Carrousel de produits"><div class="wrap"><div class="sec-head">${st.heading ? `<h2 data-field="heading">${esc(st.heading)}</h2>` : ""}</div><p class="at-wait">Les pièces que vous ajoutez apparaîtront ici.</p></div></section>`
      }
      return `<section class="sec sec-carousel" data-section="${s.id}" data-label="Carrousel de produits"><div class="wrap"><div class="sec-empty">Cochez les produits du carrousel dans l'éditeur.</div></div></section>`
    }
    const slide = store && store.theme === "atelier"
    const arrows = slide
      ? `<div class="at-arrows"><button type="button" class="at-prev" aria-label="Précédent">‹</button><button type="button" class="at-next" aria-label="Suivant">›</button></div>`
      : ""
    const note = slide ? "" : `<span>${list.length} article${list.length > 1 ? "s" : ""}${list.length > 3 ? " · faites défiler" : ""}</span>`
    const script = slide ? `<script>(function(){var root=document.querySelector('[data-section="${s.id}"]');if(!root)return;var rail=root.querySelector(".sec-rail");function step(){var card=rail&&rail.querySelector(".sec-rail-card");if(!card)return 280;var g=parseFloat(getComputedStyle(rail).columnGap)||parseFloat(getComputedStyle(rail).gap)||18;return card.getBoundingClientRect().width+g}var prev=root.querySelector(".at-prev"),next=root.querySelector(".at-next");if(prev)prev.addEventListener("click",function(){rail.scrollBy({left:-step(),behavior:"smooth"})});if(next)next.addEventListener("click",function(){rail.scrollBy({left:step(),behavior:"smooth"})})})()</script>` : ""
    return `
<section class="sec sec-carousel"${slide ? " id=\"catalogue\"" : ""} data-section="${s.id}" data-label="Carrousel de produits">
  <div class="wrap">
    ${st.heading ? `<div class="sec-head"><h2 data-field="heading">${esc(st.heading)}</h2>${arrows || note}</div>` : arrows}
    <div class="sec-rail" role="list" tabindex="0" aria-label="${esc(st.heading || "Produits")} — faites défiler horizontalement">
      ${list.map((p) => `
      <article class="sec-rail-card" role="listitem">
        <a class="sec-rail-thumb" href="/${esc(store.slug)}/p/${p.id}">${img(p.image, "p-img", p.title)}${p.stock === 0 ? '<i class="p-sold">Rupture</i>' : ""}</a>
        <a class="sec-rail-name" href="/${esc(store.slug)}/p/${p.id}">${esc(p.title)}</a>
        <div class="sec-rail-row">
          ${st.showPrice !== false ? `<span>${moneyHtml(p.price_cents, store.currency)}</span>` : "<span></span>"}
          ${st.showAdd !== false && p.stock !== 0 ? `<form class="ndz-buy" method="post" action="/${esc(store.slug)}/cart"><input type="hidden" name="product_id" value="${p.id}"><button class="p-add ndz-cart-add" aria-label="Ajouter au panier">+</button><button class="p-add ndz-buy-now" formaction="/${esc(store.slug)}/direct" aria-label="Acheter maintenant">+</button></form>` : ""}
        </div>
      </article>`).join("")}
    </div>
  </div>
</section>${script}`
  },

  media_text(store, s, { products = [] } = {}) {
    const st = s.settings
    if (st.image && String(st.image).startsWith("/demo/")) {
      try {
        const abs = require("path").join(__dirname, "..", "public", String(st.image).slice(1))
        if (!require("fs").existsSync(abs)) st.image = "auto"
      } catch (_) { st.image = "auto" }
    }
    if (st.image === "auto") {
      const first = (products || []).find((p) => p && p.image)
      st.image = first ? first.image : ""
    }
    const media = st.image
      ? `<div class="sec-mtext-media">${img(st.image, "sec-mtext-img", st.heading)}</div>`
      : ""
    return `
<section class="sec sec-mtext${st.reverse ? " rev" : ""}" data-section="${s.id}" data-label="Image + texte">
  <div class="wrap sec-mtext-in${st.image ? "" : " no-media"}">
    ${media}
    <div class="sec-mtext-body">
      ${st.kicker ? `<p class="sec-kicker">${esc(st.kicker)}</p>` : ""}
      <h2>${esc(st.heading || "")}</h2>
      ${st.body ? `<p>${esc(st.body)}</p>` : ""}
      ${st.ctaLabel ? `<a class="sec-cta" href="${esc(st.ctaUrl || "#")}">${esc(st.ctaLabel)}</a>` : ""}
    </div>
  </div>
</section>`
  },

  reviews(store, s) {
    const st = s.settings
    const look = ["cartes", "citation", "liste", "bandeau", "note", "polaroid"].includes(st.look) ? st.look : "cartes"
    const list = (s.blocks || []).filter((b) => b.settings)
    const avg = list.length ? list.reduce((a, b) => a + (parseInt(b.settings.rating, 10) || 5), 0) / list.length : 0
    const starSvg = (on) => `<svg class="sec-star${on ? " on" : ""}" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.2" d="M10 1.6 12.5 7l5.8.5-4.4 3.7 1.4 5.5L10 13.8 4.7 16.7l1.4-5.5L1.7 7.5 7.5 7z"/></svg>`
    const stars = (n) => {
      const full = Math.max(0, Math.min(5, Math.round(Number(n) || 0)))
      return starSvg(true).repeat(full) + starSvg(false).repeat(5 - full)
    }
    return `
<section class="sec sec-reviews look-${look}" data-section="${s.id}" data-label="Avis clients">
  <div class="wrap">
    ${st.heading ? `<div class="sec-head"><h2 data-field="heading">${esc(st.heading)}</h2></div>` : ""}
    ${st.big !== false && list.length ? `<div class="sec-rating">
      <b>${avg.toFixed(1).replace(".", ",")}</b>
      <span class="sec-stars">${stars(avg)}</span>
      <span class="sec-rating-n">${list.length} avis vérifiés</span>
    </div>` : ""}
    <div class="sec-rgrid">
      ${list.map((b) => `<figure class="sec-rcard">
        <span class="sec-stars">${stars(parseInt(b.settings.rating, 10) || 5)}</span>
        <blockquote>${esc(b.settings.text || "")}</blockquote>
        <figcaption>
          ${b.settings.image ? `<img class="sec-ravatar" src="${esc(b.settings.image)}" alt="">` : `<span class="sec-ravatar sec-rinit">${esc((b.settings.name || "?").slice(0, 1))}</span>`}
          <span><b>${esc(b.settings.name || "")}</b>${b.settings.city ? ` · ${esc(b.settings.city)}` : ""}</span>
        </figcaption>
      </figure>`).join("") || `<div class="sec-empty">Ajoutez des avis dans l'éditeur.</div>`}
    </div>
  </div>
</section>`
  },

  shipping(store, s) {
    const st = s.settings
    const emin = parseInt(store.eta_min, 10) || 2
    const emax = parseInt(store.eta_max, 10) || 4
    const pays = payNames(store)
    return `
<section class="sec sec-shipbar" data-section="${s.id}" data-label="Bandeau livraison">
  <div class="wrap sec-ship-in">
    ${st.prefix ? `<b>${icon("truck", 16)} ${esc(st.prefix)}</b>` : ""}
    ${st.showEta !== false ? `<span>Livraison ${emin} à ${emax} jours</span>` : ""}
    ${st.showWilayas !== false ? `<span>${esc(store.wilaya ? store.wilaya + " et" : "")} 58 wilayas</span>` : ""}
    ${st.showPay !== false && pays.length ? `<span>${pays.map((p) => esc(p)).join(" · ")}</span>` : ""}
  </div>
</section>`
  },

  offer(store, s, { products = [] }) {
    const st = s.settings
    const p = products.find((x) => x.id === parseInt(st.productId, 10)) || products[0]
    const end = /^\d{4}-\d{2}-\d{2}$/.test(st.endsAt || "") ? new Date(st.endsAt + "T21:00:00").getTime() : 0
    return `
<section class="sec sec-offer" data-section="${s.id}" data-label="Offre du jour">
  <div class="wrap sec-offer-in">
    <div class="sec-offer-media">${p ? img(p.image, "sec-offer-img", p.title) : `<span class="sec-offer-img ph">${icon("cash", 30)}</span>`}</div>
    <div class="sec-offer-body">
      ${st.heading ? `<p class="sec-kicker" data-field="heading">${esc(st.heading)}</p>` : ""}
      <h2>${p ? esc(p.title) : "Choisissez un produit"}</h2>
      ${p ? `<div class="sec-offer-price">${moneyHtml(p.price_cents, store.currency)}</div>` : ""}
      ${st.note ? `<p class="sec-offer-note">${esc(st.note)}</p>` : ""}
      <div class="sec-count" id="ndzcd-${esc(s.id)}" ${end ? `data-end="${end}"` : ""}>
        <span><b data-cd="d">00</b><i>jours</i></span>
        <span><b data-cd="h">00</b><i>heures</i></span>
        <span><b data-cd="m">00</b><i>min</i></span>
        <span><b data-cd="s">00</b><i>sec</i></span>
      </div>
      ${p ? `<a class="sec-cta" href="/${esc(store.slug)}/p/${p.id}">${esc(st.ctaLabel || "J'en profite")}</a>` : ""}
    </div>
  </div>
</section>
${end ? `<script>(function(){var b=document.getElementById("ndzcd-${esc(s.id)}");if(!b)return;var t=+b.getAttribute("data-end");function p(n){return(n<10?"0":"")+n}function tick(){var d=t-Date.now();if(d<0)d=0;var u=Math.floor(d/864e5),h=Math.floor(d%864e5/36e5),m=Math.floor(d%36e5/6e4),x=Math.floor(d%6e4/1e3);var g=function(k,v){var e=b.querySelector('[data-cd="'+k+'"]');if(e)e.textContent=p(v)};g("d",u);g("h",h);g("m",m);g("s",x)}tick();setInterval(tick,1000)})()</script>` : ""}`
  },

  whatsapp(store, s) {
    const st = s.settings
    const num = String(store.whatsapp || store.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "213")
    if (!num) return ""
    const txt = encodeURIComponent(st.message || "Bonjour, je voudrais commander.")
    return `
<section class="sec sec-wabar" data-section="${s.id}" data-label="WhatsApp collant">
  <div class="sec-wabar-in">
    <span>${esc(st.text || "Une question ?")}</span>
    <a class="sec-wabar-btn" href="https://wa.me/${num}?text=${txt}" target="_blank" rel="noopener">${icon("chat", 16)} WhatsApp</a>
  </div>
</section>`
  },

  stats(store, s) {
    const list = (s.blocks || []).filter((b) => b.settings)
    return `
<section class="sec sec-stats" data-section="${s.id}" data-label="Chiffres">
  <div class="wrap">
    ${s.settings.heading ? `<div class="sec-head"><h2>${esc(s.settings.heading)}</h2></div>` : ""}
    <div class="sec-stats-grid" style="--sn:${Math.max(2, list.length)}">
      ${list.map((b) => `<div class="sec-stat"><b>${esc(b.settings.value || "")}</b><span>${esc(b.settings.label || "")}</span></div>`).join("") || `<div class="sec-empty">Ajoutez des chiffres.</div>`}
    </div>
  </div>
</section>`
  },

  steps(store, s) {
    const list = (s.blocks || []).filter((b) => b.settings)
    return `
<section class="sec sec-steps" data-section="${s.id}" data-label="Étapes">
  <div class="wrap">
    ${s.settings.heading ? `<div class="sec-head"><h2>${esc(s.settings.heading)}</h2></div>` : ""}
    <ol class="sec-steps-list">
      ${list.map((b, i) => `<li><span class="sec-step-n">${i + 1}</span><b>${esc(b.settings.title || "")}</b>${b.settings.text ? `<p>${esc(b.settings.text)}</p>` : ""}</li>`).join("")}
    </ol>
  </div>
</section>`
  },

  cta(store, s) {
    const st = s.settings || {}
    const tone = st.tone === "sombre" ? "sombre" : "papier"
    const align = st.align === "gauche" ? "left" : "center"
    let href = String(st.ctaUrl || "#catalogue").trim() || "#catalogue"
    if (/^(javascript|data):/i.test(href)) href = "#catalogue"
    return `
<section class="sec sec-call tone-${tone} a-${align}" data-section="${s.id}" data-label="Appel à l'action">
  <div class="wrap sec-call-in">
    ${st.heading ? `<h2 data-field="heading">${esc(st.heading)}</h2>` : ""}
    ${st.text ? `<p data-field="text">${esc(st.text)}</p>` : ""}
    ${st.ctaLabel ? `<a class="sec-cta" href="${esc(href)}">${esc(st.ctaLabel)}</a>` : ""}
  </div>
</section>`
  },

  quote(store, s) {
    const st = s.settings
    return `
<section class="sec sec-quote" data-section="${s.id}" data-label="Citation">
  <div class="wrap">
    <blockquote>${esc(st.text || "")}</blockquote>
    ${st.author ? `<p class="sec-quote-author">${esc(st.author)}</p>` : ""}
  </div>
</section>`
  },

  columns(store, s) {
    const list = (s.blocks || []).filter((b) => b.settings)
    return `
<section class="sec sec-cols" data-section="${s.id}" data-label="Colonnes">
  <div class="wrap">
    ${s.settings.heading ? `<div class="sec-head"><h2>${esc(s.settings.heading)}</h2></div>` : ""}
    <div class="sec-cols-grid" style="--cn:${Math.max(2, Math.min(3, list.length))}">
      ${list.map((b) => `<div class="sec-col">
        ${b.settings.image ? img(b.settings.image, "sec-col-img", b.settings.title) : ""}
        <b>${esc(b.settings.title || "")}</b>
        ${b.settings.text ? `<p>${esc(b.settings.text)}</p>` : ""}
      </div>`).join("") || `<div class="sec-empty">Ajoutez des colonnes.</div>`}
    </div>
  </div>
</section>`
  },

  video(store, s) {
    const st = s.settings
    const url = String(st.url || "")
    let media = ""
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/)
    if (yt) media = `<iframe src="https://www.youtube.com/embed/${esc(yt[1])}" title="${esc(st.heading || "Vidéo")}" loading="lazy" allowfullscreen></iframe>`
    else if (/\.(mp4|webm|ogv)(\?|$)/i.test(url)) media = `<video src="${esc(url)}" controls playsinline preload="metadata"></video>`
    else if (url) media = `<a class="sec-video-link" href="${esc(url)}" target="_blank" rel="noopener">${icon("play", 18)} Voir la vidéo</a>`
    return `
<section class="sec sec-video" data-section="${s.id}" data-label="Vidéo">
  <div class="wrap">
    ${st.heading ? `<div class="sec-head"><h2>${esc(st.heading)}</h2></div>` : ""}
    <div class="sec-video-frame">${media || `<div class="sec-empty">Ajoutez un lien de vidéo dans l'éditeur.</div>`}</div>
    ${st.note ? `<p class="sec-video-note">${esc(st.note)}</p>` : ""}
  </div>
</section>`
  },

  social(store, s) {
    const st = s.settings
    const html = SOCIAL.bar(store, { socialWhere: "deux", socialStyle: st.style, socialSize: "normal" }, "pied")
    return `
<section class="sec sec-social a-${st.align === "gauche" ? "left" : "center"}" data-section="${s.id}" data-label="Réseaux sociaux">
  <div class="wrap">
    ${st.heading ? `<div class="sec-head"><h2>${esc(st.heading)}</h2></div>` : ""}
    ${html || `<div class="sec-empty">Ajoutez vos réseaux sociaux dans « Réseaux sociaux » (menu Boutique).</div>`}
  </div>
</section>`
  },

  spacer(store, s) {
    const size = ["petit", "normal", "grand"].includes(s.settings.size) ? s.settings.size : "normal"
    return `<section class="sec sec-spacer sp-${size}${s.settings.line ? " has-line" : ""}" data-section="${s.id}" data-label="Espace"><div class="wrap"></div></section>`
  },
}

const renderSectionsRaw = (store, sections, ctx) =>
  sections
    .filter((s) => !s.hidden)
    .map((s) => (RENDER[s.type] ? RENDER[s.type](store, s, ctx || {}) : ""))
    .join("")

/**
 * Rendu avec ordre mobile : chaque section vit dans un « slot » dont l'ordre
 * vient de design.mobileOrder (glisser-déposer dans l'éditeur, onglet Mobile).
 */
const renderSections = (store, sections, ctx = {}) => {
  const design = ctx.design || readDesign(store)
  const order = Array.isArray(design.mobileOrder) ? design.mobileOrder : []
  const visible = sections.filter((s) => !s.hidden)
  const slots = visible
    .map((s, i) => {
      let html = RENDER[s.type] ? RENDER[s.type](store, s, ctx) : ""
      if (!html) return ""
      if (s.align) html = html.replace(/class="sec\b/, `class="sec ndz-al-${s.align}`)
      /* taille : espacement vertical, taille du titre, largeur du contenu */
      const vars = []
      if (s.pad != null) vars.push(`--sec-pad:${s.pad}px`)
      if (s.tsize) vars.push(`--sec-title:${s.tsize}`)
      if (s.imgH != null) vars.push(`--sec-img:${s.imgH}px`)
      if (s.cols != null) vars.push(`--cols:${s.cols}`)
      if (s.wide) html = html.replace(/class="sec\b/, `class="sec ndz-wide-${s.wide}`)
      if (vars.length) {
        html = html.replace(/<section class="([^"]*)"([^>]*)>/, (m, cls, rest) =>
          /style="/.test(rest)
            ? `<section class="${cls}"${rest.replace(/style="([^"]*)"/, (_x, st) => `style="${st};${vars.join(";")}"`)}>`
            : `<section class="${cls}" style="${vars.join(";")}"${rest}>`)
      }
      const at = order.indexOf(s.id)
      const ord = at === -1 ? 100 + i : at
      const label = String((TYPES[s.type] && TYPES[s.type].name) || s.type).replace(/--/g, "—")
      return `<div class="sec-slot" style="--m-order:${ord}" data-slot="${s.id}">\n<!-- ${label} -->\n${html}</div>`
    })
    .join("")
  const before = ctx.before ? `<div class="sec-slot" style="--m-order:0">${ctx.before}</div>` : ""
  return `<div class="sec-list" data-mobile-order="${order.length}">${before}${slots}</div>`
}

/* ------------------------------- validation ------------------------------- */
function cleanSettings(defs, src) {
  const out = {}
  for (const f of defs) {
    const v = src ? src[f.key] : undefined
    if (f.type === "checkbox") out[f.key] = !!v
    else if (f.type === "number") out[f.key] = Math.max(0, Math.min(9999, parseInt(v, 10) || 0))
    else if (f.type === "product") out[f.key] = parseInt(v, 10) || 0
    else if (f.type === "products") out[f.key] = String(v || "").split(",").map((n) => parseInt(n, 10)).filter(Boolean).slice(0, 24).join(",")
    else if (typeof v === "string") out[f.key] = v.slice(0, f.max || 800)
    else out[f.key] = v === 0 || v ? String(v).slice(0, f.max || 800) : ""
  }
  return out
}

const sanitize = (input) => {
  if (input && !Array.isArray(input) && typeof input === "object") {
    const out = {}
    for (const k of ["home", "product", "cart", "checkout", "legal", "account"]) {
      if (Array.isArray(input[k])) out[k] = sanitize(input[k])
    }
    return out
  }
  if (!Array.isArray(input)) return null
  const out = []
  for (const raw of input.slice(0, 24)) {
    if (!raw || !TYPES[raw.type]) continue
    const t = TYPES[raw.type]
    const sec = {
      id: String(raw.id || uid()).slice(0, 14),
      type: raw.type,
      hidden: !!raw.hidden,
      align: ["gauche", "centre", "droite"].includes(raw.align) ? raw.align : "",
      pad: Number.isFinite(+raw.pad) && raw.pad !== null && raw.pad !== "" ? Math.max(0, Math.min(140, Math.round(+raw.pad))) : null,
      tsize: Number.isFinite(+raw.tsize) && raw.tsize !== null && raw.tsize !== "" ? Math.max(0.6, Math.min(2.2, +raw.tsize)) : null,
      wide: ["etroite", "large", "pleine"].includes(raw.wide) ? raw.wide : "",
      imgH: Number.isFinite(+raw.imgH) && raw.imgH !== null && raw.imgH !== "" ? Math.max(80, Math.min(900, Math.round(+raw.imgH))) : null,
      cols: Number.isFinite(+raw.cols) && raw.cols !== null && raw.cols !== "" ? Math.max(1, Math.min(5, Math.round(+raw.cols))) : null,
      settings: { ...t.defaults, ...cleanSettings(t.fields, { ...t.defaults, ...(raw.settings || {}) }) },
      blocks: [],
    }
    if (t.blocks) {
      const list = Array.isArray(raw.blocks) ? raw.blocks.slice(0, t.blocks.max) : []
      sec.blocks = list.map((b) => ({
        id: String((b && b.id) || uid("b")).slice(0, 14),
        settings: cleanSettings(t.blocks.fields, { ...t.blocks.defaults, ...((b && b.settings) || {}) }),
      }))
    }
    out.push(sec)
  }
  return out
}

module.exports = {
  img, TYPES, ICONS, DEFAULT_NAV, readNav, sanitizeNav, DESIGN_DEFAULTS, makeSection, blockOf, defaultSections,
  readSections, readSectionsAll, readDesign, readDraft, sanitizeDesign, storeStyle, FONTS, FONT_LIST, DESIGN_DEFAULTS,
  fontHref, fontStackOf, fontFamilyOf, safeFamily, GOOGLE_FONTS,
  designClass, renderSections, renderSectionsRaw, sanitize, uid,
  PAGE_KEYS, HIDE_KEYS, pageKeyOfPath, pageCssFor, cleanCss, cleanHtml,
  pageCodeOf, applyPageCode, renderPage,
}
