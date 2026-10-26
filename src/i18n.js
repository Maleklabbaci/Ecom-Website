"use strict"
/**
 * Bilingue FR / AR pour la vitrine (le tableau de bord reste en français).
 *
 * Principe : les gabarits écrivent le français, et une passe finale traduit le
 * HTML rendu vers l'arabe quand la langue de la page est `ar`. Avantages :
 *   - aucun gabarit à dupliquer, donc aucun risque de divergence entre thèmes ;
 *   - seules les chaînes de l'interface sont traduites, le contenu du marchand
 *     (titres de produits, textes de sections) reste intact ;
 *   - on peut vérifier la couverture par un test automatique.
 *
 * Le sens d'écriture est porté par <html dir="rtl"> et la police Estedad
 * (auto-hébergée dans public/fonts, licence OFL).
 */

const { AsyncLocalStorage } = require("node:async_hooks")

/* Contexte de requête (pour connaître la langue sans la passer partout). */
const ALS = new AsyncLocalStorage()
const run = (ctx, fn) => ALS.run(ctx, fn)
const current = () => ALS.getStore() || {}

const LANGS = [
  { id: "fr", label: "Français", short: "FR", dir: "ltr", html: "fr" },
  { id: "ar", label: "العربية", short: "ع", dir: "rtl", html: "ar" },
]

const isLang = (l) => LANGS.some((x) => x.id === l)
const dirOf = (l) => (l === "ar" ? "rtl" : "ltr")

/** Langues proposées par la boutique : fr, ar, ou les deux (défaut). */
const storeLangs = (store) => {
  const mode = store && store.lang_mode
  if (mode === "fr") return ["fr"]
  if (mode === "ar") return ["ar"]
  return ["fr", "ar"]
}

const defaultLang = (store) => (store && store.lang_mode === "ar" ? "ar" : "fr")

/** Langue de la page : ?lang=… puis cookie, sinon défaut de la boutique. */
const langOf = (store, req) => {
  const asked = req && ((req.query && req.query.lang) || (req.cookies && req.cookies.ndz_lang))
  const offered = storeLangs(store)
  if (asked && offered.includes(String(asked))) return String(asked)
  return offered.includes(defaultLang(store)) ? defaultLang(store) : offered[0]
}

/* ----------------------------------------------------------------------------
   Dictionnaire interface FR → AR
   Clés = chaînes exactes écrites dans les gabarits.
   -------------------------------------------------------------------------- */
const DICT = [
  /* navigation / général */
  ["Panier", "السلة"],
  ["Mon compte", "حسابي"],
  ["Rechercher", "بحث"],
  ["Recherche", "بحث"],
  ["Boutique", "المتجر"],
  ["Boutiques", "المتاجر"],
  ["Accueil", "الرئيسية"],
  ["Retour à la boutique", "العودة إلى المتجر"],
  ["Continuer mes achats", "متابعة التسوق"],
  ["Voir la collection", "تصفح المجموعة"],
  ["Voir le catalogue", "تصفح الكتالوج"],
  ["Voir tout", "عرض الكل"],
  ["Tout voir", "عرض الكل"],
  ["Fermer", "إغلاق"],
  ["Oui", "نعم"],
  ["Non", "لا"],
  ["Envoyer", "إرسال"],
  ["Valider", "تأكيد"],
  ["Retour", "رجوع"],
  ["Suivant", "التالي"],
  ["Précédent", "السابق"],
  ["Chargement…", "جار التحميل…"],
  ["Nouveau", "جديد"],
  ["Promotion", "تخفيض"],
  ["Rupture de stock", "نفدت الكمية"],
  ["En stock", "متوفر"],
  ["Stock faible", "الكمية محدودة"],
  ["Épuisé", "نفدت الكمية"],
  ["Produit", "المنتج"],
  ["Produits", "المنتجات"],
  ["Prix", "السعر"],
  ["Quantité", "الكمية"],
  ["Total", "المجموع"],
  ["Sous-total", "المجموع الفرعي"],
  ["Réduction", "الخصم"],
  ["Remise", "الخصم"],
  ["Livraison", "التوصيل"],
  ["Frais de livraison", "تكاليف التوصيل"],
  ["Livraison offerte", "توصيل مجاني"],
  ["Gratuit", "مجاني"],
  ["Adresse", "العنوان"],
  ["Adresse complète", "العنوان الكامل"],
  ["Commune", "البلدية"],
  ["Wilaya", "الولاية"],
  ["Téléphone", "الهاتف"],
  ["Nom complet", "الاسم الكامل"],
  ["Nom", "الاسم"],
  ["Email", "البريد الإلكتروني"],
  ["Note (facultatif)", "ملاحظة (اختياري)"],
  ["Message", "الرسالة"],
  ["Avis", "التقييمات"],
  ["Avis clients", "تقييمات العملاء"],
  ["Donner mon avis", "أضف تقييمك"],
  ["Questions fréquentes", "الأسئلة الشائعة"],
  ["Points forts", "المزايا"],
  ["Galerie", "معرض الصور"],
  ["Bandeau d'annonce", "شريط الإعلان"],
  ["Nos produits", "منتجاتنا"],
  ["Pièce en vedette", "منتج مميز"],
  ["La collection", "المجموعة"],
  ["Catalogue", "الكتالوج"],
  ["Tous les produits", "كل المنتجات"],
  ["Aucun produit pour le moment.", "لا يوجد منتج حاليا."],
  ["Aucun résultat.", "لا توجد نتيجة."],
  ["Aucun résultat pour cette recherche.", "لا توجد نتيجة لهذا البحث."],
  ["La maison", "الدار"],
  ["Notre histoire", "قصتنا"],
  ["Livraison 48 wilayas", "التوصيل إلى 58 ولاية"],
  ["Paiement à la livraison", "الدفع عند الاستلام"],
  ["Paiement à la livraison partout en Algérie.", "الدفع عند الاستلام في كل الجزائر."],

  /* fiche produit */
  ["Ajouter au panier", "أضف إلى السلة"],
  ["Ajouter", "أضف"],
  ["Ajouté au panier", "أضيف إلى السلة"],
  ["Acheter maintenant", "اشتر الآن"],
  ["Commander maintenant", "اطلب الآن"],
  ["Choisir une option", "اختر خيارا"],
  ["Description", "الوصف"],
  ["Détails", "التفاصيل"],
  ["Retours", "المرتجعات"],
  ["Livraison et retours", "التوصيل والمرتجعات"],
  ["Produits similaires", "منتجات مشابهة"],
  ["Vous aimerez aussi", "قد يعجبك أيضا"],

  /* panier */
  ["Votre panier", "سلتك"],
  ["Votre panier est vide", "سلتك فارغة"],
  ["Votre panier est vide.", "سلتك فارغة."],
  ["Panier vide", "السلة فارغة"],
  ["Retirer", "حذف"],
  ["Supprimer", "حذف"],
  ["Code promo", "رمز التخفيض"],
  ["J'ai un code promo", "لدي رمز تخفيض"],
  ["Appliquer", "تطبيق"],
  ["Récapitulatif", "ملخص الطلب"],
  ["Passer commande", "إتمام الطلب"],
  ["Commander", "اطلب"],
  ["Commander · ", "اطلب · "],
  ["Commander directement", "اطلب مباشرة"],
  ["Finaliser la commande", "إتمام الطلب"],
  ["Vos informations", "معلوماتك"],
  ["Votre commande", "طلبك"],
  ["Confirmer · ", "تأكيد · "],
  ["Confirmer la commande", "تأكيد الطلب"],
  ["Mode de livraison", "طريقة التوصيل"],
  ["Moyen de paiement", "طريقة الدفع"],
  ["Paiement", "الدفع"],
  ["Frais de paiement", "رسوم الدفع"],
  ["à domicile", "إلى المنزل"],
  ["Au bureau", "مكتب التوصيل"],
  ["À domicile", "إلى المنزل"],
  ["Le livreur vient à l'adresse indiquée.", "المحضر يأتي إلى العنوان المذكور."],
  ["Retrait dans l'agence de livraison de votre wilaya.", "الاستلام من مكتب التوصيل في ولايتك."],
  ["Aucun moyen de paiement activé. Contactez la boutique.", "لا توجد طريقة دفع مفعلة. اتصل بالمتجر."],
  ["J'accepte les", "أوافق على"],
  ["et la", "و"],
  ["politique de retour", "سياسة الإرجاع"],
  ["CGV", "الشروط العامة للبيع"],
  ["Mentions légales", "المعلومات القانونية"],
  ["Choisissez votre wilaya", "اختر ولايتك"],

  /* confirmation */
  ["Commande confirmée", "تم تأكيد الطلب"],
  ["Commande enregistrée", "تم تسجيل الطلب"],
  ["Merci", "شكرا"],
  ["Total à payer", "المبلغ الإجمالي"],
  ["Numéro de commande", "رقم الطلب"],
  ["Suivre ma commande", "تتبع طلبي"],
  ["Suivi de commande", "تتبع الطلب"],
  ["Statut", "الحالة"],
  ["Votre commande est", "طلبك"],
  ["en cours de préparation", "قيد التحضير"],
  ["expédiée", "تم إرسالها"],
  ["livrée", "تم توصيلها"],
  ["annulée", "ملغاة"],
  ["Nouvelle commande", "طلب جديد"],
  ["Confirmée", "مؤكد"],
  ["Expédiée", "تم الإرسال"],
  ["Livrée", "تم التوصيل"],
  ["Annulée", "ملغاة"],

  /* compte / divers */
  ["Mes commandes", "طلباتي"],
  ["Aucune commande pour le moment.", "لا توجد طلبات حاليا."],
  ["Se connecter", "تسجيل الدخول"],
  ["Se déconnecter", "تسجيل الخروج"],
  ["Mot de passe", "كلمة المرور"],
  ["Créer un compte", "إنشاء حساب"],
  ["Propulsé par", "مدعوم بواسطة"],
  ["Mentions", "معلومات"],
  ["Nous contacter", "اتصل بنا"],
  ["Appeler", "اتصل"],
  ["WhatsApp", "واتساب"],
  ["Poser une question", "اطرح سؤالا"],
  ["Politique de retour", "سياسة الإرجاع"],
  ["Retour sous", "الإرجاع خلال"],
  ["jours", "أيام"],
  ["Besoin d'aide ?", "تحتاج مساعدة؟"],
  ["Position", "الموقع"],
  ["Ma position", "موقعي"],
  ["Utiliser ma position", "استعمل موقعي"],
  ["Position enregistrée", "تم تسجيل الموقع"],
  ["Si vous acceptez la position, la wilaya et la commune se remplissent.", "إذا قبلت الموقع، تُملأ الولاية والبلدية."],
  ["Autorisez la position pour remplir la wilaya.", "اسمح بالموقع لملء الولاية."],
  ["Wilaya et commune remplies.", "تم ملء الولاية والبلدية."],
  ["Position refusée. Choisissez la wilaya.", "تم رفض الموقع. اختر الولاية."],
  ["Position trop loin. Choisissez la wilaya.", "الموقع بعيد. اختر الولاية."],
  ["Position indisponible. Choisissez la wilaya.", "الموقع غير متاح. اختر الولاية."],
  ["Voir sur la carte", "اعرض على الخريطة"],
  ["Suivez vos commandes et retrouvez vos achats.", "تابع طلباتك واطلع على مشترياتك."],
  ["Créer mon compte", "إنشاء حسابي"],
  ["Vous avez commandé sans compte ?", "هل طلبت دون حساب؟"],
  ["Retrouvez votre commande", "استرجع طلبك"],
  ["avec sa référence.", "برقم المرجع."],
  ["E-mail", "البريد الإلكتروني"],
  ["Mot de passe", "كلمة المرور"],
  ["Suivre", "تتبع"],
  ["Articles", "المنتجات"],
  ["Voir la facture", "عرض الفاتورة"],
  ["Bon de livraison", "وصل التسليم"],
  ["Facture", "الفاتورة"],
  ["Référence de commande", "مرجع الطلب"],
  ["Détail de la commande", "تفاصيل الطلب"],
  ["Ma commande", "طلبي"],
  ["Votre commande est enregistrée.", "تم تسجيل طلبك."],
  ["Nous vous appelons pour confirmer.", "سنتصل بك للتأكيد."],
  ["Position GPS envoyée par le client", "موقع GPS أرسله العميل"],
  ["Boutique en ligne", "متجر إلكتروني"],
  ["Le livreur vous trouve plus vite.", "سيجدك المحضر أسرع."],
  ["Commande", "الطلب"],
  ["Panier", "السلة"],
  ["Voir la pièce", "اعرض القطعة"],
  ["Voir le produit", "اعرض المنتج"],
  ["Ce site utilise des cookies de mesure d'audience.", "هذا الموقع يستعمل ملفات تعريف الارتباط لقياس الزيارات."],
  ["En savoir plus", "اعرف المزيد"],
  ["Refuser", "رفض"],
  ["Accepter", "قبول"],
  ["Pas encore d'avis", "لا توجد تقييمات بعد"],
  ["Laisser un avis", "اترك تقييمك"],
  ["Votre nom", "اسمك"],
  ["Votre avis", "تقييمك"],
  ["Note", "التقييم"],
  ["5 — Excellent", "5 — ممتاز"],
  ["4 — Très bien", "4 — جيد جدا"],
  ["3 — Correct", "3 — مقبول"],
  ["2 — Moyen", "2 — متوسط"],
  ["1 — Décevant", "1 — ضعيف"],
  ["Trier par", "ترتيب حسب"],
  ["Filtrer", "تصفية"],
  ["Toutes les catégories", "كل الفئات"],
  ["Prix croissant", "السعر تصاعدي"],
  ["Prix décroissant", "السعر تنازلي"],
  ["Nouveautés", "الجديد"],
  ["Découvrir", "اكتشف"],
  ["À payer", "المبلغ المطلوب"],
  ["À payer à la livraison", "يُدفع عند الاستلام"],
  ["Commande reçue", "تم استلام الطلب"],
  ["Votre commande est confirmée", "تم تأكيد طلبك"],
  ["Référence", "المرجع"],
  ["Quantité indisponible", "الكمية غير متوفرة"],
  ["Choisir", "اختر"],
  ["Taille", "المقاس"],
  ["Couleur", "اللون"],
  ["Ajouter aux favoris", "أضف إلى المفضلة"],
  ["Partager", "شارك"],
  ["Imprimer", "اطبع"],
  ["Livraison estimée", "مدة التوصيل المتوقعة"],
  ["Estimation de livraison", "تقدير التوصيل"],
  ["Bureau", "المكتب"],
  ["facultatif", "اختياري"],
  ["Variante", "الخيار"],
  ["Tapez votre commune", "اكتب بلديتك"],
  ["Paiement à la livraison. On vous appelle pour confirmer.", "الدفع عند الاستلام. نتصل بك للتأكيد."],
  ["Maison ou bureau", "المنزل أو المكتب"],
  ["Amine Benali", "أمين بن علي"],
  ["Repère, horaire de livraison", "معلم أو وقت التوصيل"],
]

/* Formes avec apostrophe échappée dans les attributs HTML. */
const escVariants = (s) => (s.includes("'") ? [s, s.replace(/'/g, "&#39;")] : [s])

const buildDict = () => {
  const pairs = []
  for (const [fr, ar] of DICT) {
    for (const v of escVariants(fr)) pairs.push([v, ar])
  }
  /* les plus longues d'abord : « Ajouter au panier » avant « Ajouter » */
  return pairs.sort((a, b) => b[0].length - a[0].length)
}
const PAIRS = buildDict()

/* Motifs avec variables (déjà présents dans le texte rendu). */
const PATTERNS = [
  [/(\d+)\s+articles?\b/g, "$1 منتج"],
  [/(\d+)\s+en stock/g, "$1 متوفر"],
  [/(\d+)\s+restants?/g, "بقي $1"],
  [/Paiement à la livraison/g, "الدفع عند الاستلام"],
  [/Commande (#[A-Z0-9-]+)/g, "الطلب $1"],
  [/Référence (#?[A-Z0-9-]+)/g, "المرجع $1"],
  [/(\d+)\s+articles? au panier/g, "$1 منتج في السلة"],
  [/Livraison estimée\s*:\s*/g, "مدة التوصيل: "],
  [/(\d+)\s*à\s*(\d+)\s+jours ouvrés/g, "$1 إلى $2 أيام عمل"],
  [/(\d+)\s*à\s*(\d+)\s+jours/g, "$1 إلى $2 أيام"],
  [/(\d+)\s+jour ouvrés?/g, "$1 يوم عمل"],
  [/(\d+)\s+jours?/g, "$1 أيام"],
  [/\bDZD\b/g, "دج"],
]

const MAP = new Map(DICT)
/** Traduit une chaîne isolée (utile dans le JavaScript injecté). */
const t = (lang, fr) => (lang === "ar" ? MAP.get(fr) || fr : fr)

/** Langue de la boutique en cours de rendu. */
const langNow = (store) => langOf(store, current().req)

/** Traduit le HTML rendu (interface uniquement). */
const localize = (html, lang) => {
  if (lang !== "ar" || typeof html !== "string") return html
  /* on ne touche jamais au contenu des <script> : la logique doit rester intacte */
  const parts = html.split(/(<script[\s\S]*?<\/script>|<!--ndz-lock-->[\s\S]*?<!--\/ndz-lock-->)/i)
  return parts.map((chunk, i) => (i % 2 ? chunk : translateChunk(chunk))).join("")
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const RX_TEXT = PAIRS.map(([fr, ar]) => [new RegExp(">(\\s*)" + escRe(fr) + "(\\s*)<", "g"), ">$1" + ar + "$2<"])
const RX_ATTR = ["placeholder", "title", "aria-label", "value", "alt"].flatMap((a) =>
  PAIRS.map(([fr, ar]) => [new RegExp(a + '="' + escRe(fr) + '"', "g"), a + '="' + ar + '"'])
)

const translateChunk = (html) => {
  let out = html
  /* <title>Panier — Ma boutique</title> → <title>السلة — Ma boutique</title> */
  out = out.replace(/(<title>\s*)([^<—|]+?)(\s*[—|])/g, (m, a, word, c) => {
    const clean = word.trim()
    const whole = MAP.get(clean)
    if (whole) return a + whole + c
    /* « Commande NDZ-123 — Boutique » : on traduit le premier mot seulement */
    const first = clean.split(/\s+/)[0]
    const hit = MAP.get(first)
    return hit ? a + hit + clean.slice(first.length) + c : m
  })
  for (const [re, rep] of RX_TEXT) out = out.replace(re, rep)
  for (const [re, rep] of RX_ATTR) out = out.replace(re, rep)
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep)
  return out
}

/* ------------------------------------------------- remplacements du marchand */
/**
 * Le marchand peut réécrire n'importe quel texte de sa vitrine
 * (éditeur → Textes). On applique ses paires sur le HTML rendu,
 * hors <script>, avant la traduction automatique.
 */
const applyDict = (html, pairs) => {
  if (!Array.isArray(pairs) || !pairs.length || typeof html !== "string") return html
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/i)
  const clean = pairs
    .filter((r) => r && r.from && r.to !== undefined)
    .map((r) => [String(r.from), String(r.to)])
    .sort((a, b) => b[0].length - a[0].length)
  return parts
    .map((chunk, i) => {
      if (i % 2) return chunk
      let out = chunk
      for (const [from, to] of clean) {
        if (!from) continue
        out = out.split(`>${from}<`).join(`>${to}<`)
        out = out.split(`>${from} `).join(`>${to} `)
        out = out.split(` ${from}<`).join(` ${to}<`)
        /* libellés d'accessibilité et infobulles */
        out = out.split(`aria-label="${from}"`).join(`aria-label="${to}"`)
        out = out.split(`placeholder="${from}"`).join(`placeholder="${to}"`)
        out = out.split(`title="${from}"`).join(`title="${to}"`)
      }
      return out
    })
    .join("")
}

/* ---------------------------------------------------------------- sélecteur */
/** Lien de langue, à poser dans l'en-tête à côté de la recherche (pas en languette). */
const switchHtml = (store, req, lang) => {
  const offered = storeLangs(store)
  if (offered.length < 2) return ""
  const here = (req && req.originalUrl ? req.originalUrl : `/`).split("?")[0]
  const other = offered.filter((l) => l !== lang)[0] || "fr"
  const meta = LANGS.find((l) => l.id === other)
  return `<a class="lang-switch" href="${here}?lang=${other}" rel="alternate" hreflang="${other}" title="${meta.label}" aria-label="${meta.label}">${meta.short}</a>`
}

const htmlAttrs = (lang) => `lang="${lang === "ar" ? "ar" : "fr"}" dir="${dirOf(lang)}"`

module.exports = {
  LANGS, isLang, dirOf, storeLangs, defaultLang, langOf, langNow,
  localize, applyDict, switchHtml, htmlAttrs, DICT, t, run, current,
}
