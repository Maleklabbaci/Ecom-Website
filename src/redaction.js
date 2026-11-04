"use strict"
/**
 * « L'assistant écrit ma page ».
 *
 * Pourquoi ce fichier : un débutant sait dire ce qu'il vend, à qui et où il
 * livre. Il ne sait pas écrire un titre qui donne envie. Ici, trois réponses
 * courtes deviennent les textes de la page d'accueil (titre, phrase
 * d'explication, bouton, puis la première partie de la page).
 *
 * Ce n'est pas un modèle de langage : rien ne part sur Internet, rien n'est
 * inventé sur le dos du marchand. Les phrases sont assemblées à partir de ses
 * réponses et des produits qu'il a déjà saisis. C'est donc gratuit, instantané
 * et vérifiable — et ça marche aussi bien en français qu'en arabe.
 */

const clean = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max || 120)

/** « robes, sacs et foulard » → « robes, sacs et foulard » (on garde ses mots) */
const lister = (s) => clean(s, 90).replace(/[.;!?]+$/, "")

/** Ville : « Blida » → « à Blida » (arabe : « في البليدة ») */
const villeFr = (v) => (v ? ` à ${v}` : " partout en Algérie")
const villeAr = (v) => (v ? ` في ${v}` : " في كل ولايات الوطن")

const articlesFr = (n) => (n > 1 ? `${n} produits` : n === 1 ? "1 produit" : "")

const plans = {
  /* ------------------------------------------------------------------ FR */
  fr: ({ activite, ville, atout, name, nProducts, priceFrom }) => {
    const quoi = lister(activite) || "des articles choisis avec soin"
    const titre = quoi.charAt(0).toUpperCase() + quoi.slice(1)
    /* On ne répète pas ce que le marchand vient de dire : s'il a déjà parlé
       du paiement ou de la livraison, la phrase ne le redit pas. */
    const dit = clean(atout, 110).replace(/[.;!?]+$/, "")
    const dejaPaye = /paiement|pay|livraison|livr/i.test(dit)
    const phrase = dit
      ? `${dit.charAt(0).toUpperCase()}${dit.slice(1)}. ${dejaPaye ? `Livraison${villeFr(ville)}.` : `Livraison${villeFr(ville)}, paiement à la réception.`}`
      : `Commande simple, livraison${villeFr(ville)} et paiement à la réception.`
    return {
      hero: { title: titre, text: phrase, cta: "Voir les produits" },
      about: {
        title: "Pourquoi commander ici",
        text: `${name || "Ma boutique"} propose ${quoi}. ${nProducts ? `Tout est en ligne : ${articlesFr(nProducts)}${priceFrom ? `, à partir de ${priceFrom}` : ""}.` : ""} Vous choisissez, vous commandez, vous payez en recevant.`.replace(/\s+/g, " ").trim(),
      },
      banner: { text: `Livraison${villeFr(ville)} — paiement à la réception`, cta: "Commander" },
    }
  },
  /* ------------------------------------------------------------------ AR */
  ar: ({ activite, ville, atout, name, nProducts, priceFrom }) => {
    const quoi = lister(activite) || "منتجات مختارة بعناية"
    const dit = clean(atout, 110).replace(/[.;!?،]+$/, "")
    const dejaPaye = /الدفع|التوصيل|استلام/.test(dit)
    const phrase = dit
      ? `${dit}. ${dejaPaye ? `التوصيل${villeAr(ville)}.` : `التوصيل${villeAr(ville)} والدفع عند الاستلام.`}`
      : `اطلب بسهولة، التوصيل${villeAr(ville)} والدفع عند الاستلام.`
    return {
      hero: { title: quoi, text: phrase, cta: "تصفح المنتجات" },
      about: {
        title: "لماذا تطلب من هنا",
        text: `${name || "متجري"} يقدم ${quoi}. ${nProducts ? `كل شيء معروض: ${nProducts} منتج${priceFrom ? `، ابتداءً من ${priceFrom}` : ""}.` : ""} تختار، تطلب، وتدفع عند الاستلام.`.replace(/\s+/g, " ").trim(),
      },
      banner: { text: `التوصيل${villeAr(ville)} — الدفع عند الاستلام`, cta: "اطلب الآن" },
    }
  },
}

/**
 * Rend les textes de la page. `answers` vient du Studio (3 cases).
 * Renvoie aussi `manques` : ce qui reste à écrire à la main, en clair.
 */
const write = (store, answers, lang) => {
  const a = answers || {}
  const activite = clean(a.activite, 90)
  if (activite.length < 3) {
    return { ok: false, error: lang === "ar" ? "اكتب ماذا تبيع، ولو بكلمتين." : "Écrivez ce que vous vendez, même en deux mots." }
  }
  const nProducts = Number(a.nProducts || 0) || 0
  const priceFrom = clean(a.priceFrom, 24)
  const plan = (plans[lang] || plans.fr)({
    activite, ville: clean(a.ville, 40), atout: clean(a.atout, 140),
    name: clean(a.name || (store && store.name), 60), nProducts, priceFrom,
  })
  const manques = []
  if (!a.ville) manques.push(lang === "ar" ? "المدن التي توصل إليها" : "les villes où vous livrez")
  if (!a.atout) manques.push(lang === "ar" ? "ما يطمئن الزبون (دفع عند الاستلام، تبديل…)" : "ce qui rassure vos clients (paiement à la livraison, échange…)")
  return { ok: true, lang: lang === "ar" ? "ar" : "fr", plan, manques }
}

module.exports = { write }
