"use strict"
/**
 * Plateforme en arabe (tableau de bord, connexion, réglages…).
 *
 * Même principe que `i18n.js` (qui traduit la vitrine) : les gabarits restent
 * écrits en français et une passe finale traduit le HTML rendu. Avantages :
 *   - un seul endroit à corriger, aucune vue dupliquée ;
 *   - le contenu du marchand (nom de la boutique, produits, adresses) reste
 *     intact : on ne remplace qu'un texte EXACT de l'interface ;
 *   - la couverture se mesure, donc elle peut s'améliorer écran par écran.
 *
 * Langue de l'interface ≠ langue de la vitrine : un marchand peut lire son
 * tableau de bord en arabe et garder sa boutique en français. D'où le cookie
 * séparé `ndz_ui` (bouton FR / ع en bas du menu).
 */

const I18N = require("./i18n")

const LANGS = [
  { id: "fr", label: "Français", short: "FR" },
  { id: "ar", label: "العربية", short: "ع" },
]
const isLang = (l) => LANGS.some((x) => x.id === l)

/** Langue demandée pour l'interface, sinon "" (français, comme avant). */
const wanted = (req) => {
  const q = req && req.query && req.query.uilang
  if (q && isLang(String(q))) return String(q)
  const c = req && req.cookies && req.cookies.ndz_ui
  return c && isLang(String(c)) ? String(c) : ""
}

/** La page courante est-elle une page de la plateforme (pas une vitrine) ? */
const isPlatform = (req) => {
  const p = String((req && req.path) || "/")
  return /^\/(dashboard|admin|login|signup|welcome|rejoindre|logout|mot-de-passe|verifier)/.test(p)
}

/** Langue effective : "" = français. Le Studio se dessine dans le navigateur,
    il a sa propre table (`studio-ar.js`) : on ne le traduit pas ici. */
const langNow = () => {
  const req = I18N.current().req
  if (!req || !isPlatform(req)) return ""
  const w = wanted(req)
  return w === "ar" ? "ar" : ""
}

/** Lien de bascule (même page, même état, seule la langue change). */
const switchHtml = (req) => {
  if (!req) return ""
  /* On enlève d'abord un éventuel ?uilang= déjà présent : sinon le lien
     empilerait « ?uilang=ar&uilang=fr » et la page ne changerait pas. */
  const here = String(req.originalUrl || req.path || "/")
    .replace(/([?&])uilang=[^&]*(&|$)/, (m, a, b) => (a === "?" && b === "&" ? "?" : a === "&" ? "&" : ""))
    .replace(/[?&]$/, "")
  const sep = here.includes("?") ? "&" : "?"
  const other = wanted(req) === "ar" ? "fr" : "ar"
  const meta = LANGS.find((l) => l.id === other)
  return `<a class="ndz-uilang" href="${here}${sep}uilang=${other}" rel="alternate" hreflang="${other}" title="${meta.label}">${meta.short}</a>`
}

/* ------------------------------------------------------------------ dictionnaire
   Clé = texte exact affiché (français). Valeur = arabe.
   On ne met ici que des phrases de l'INTERFACE : jamais un nom de boutique. */
const WORDS = [
  /* ---- menu du tableau de bord ---- */
  ["Montrer ce que vous vendez", "أظهر ما تبيعه"],
  ["Vérifier le numéro de téléphone", "تحقق من رقم الهاتف"],
  ["Accueil", "الرئيسية"], ["Commandes", "الطلبات"], ["Produits", "المنتجات"],
  ["Stock", "المخزون"], ["Paniers", "السلال"], ["Relances", "المتابعات"],
  ["Statistiques", "الإحصائيات"], ["Catégories", "الفئات"], ["Codes promo", "أكواد الخصم"],
  ["Design", "التصميم"], ["Formulaire", "الاستمارة"], ["Transporteur", "شركة التوصيل"],
  ["Livraison", "التوصيل"], ["Paiement", "الدفع"], ["Réseaux", "الشبكات"],
  ["Réseaux sociaux", "شبكات التواصل"], ["Réglages", "الإعدادات"],
  ["Pages de vente", "صفحات البيع"], ["Pages", "الصفحات"], ["Avis", "التقييمات"],
  ["Clients", "الزبائن"], ["Marketing", "التسويق"], ["E-mails", "الرسائل"],
  ["Équipe", "الفريق"], ["Assistant", "المساعد"], ["Visites", "الزيارات"],
  ["Reçus", "الموارد"], ["Plus d'outils", "أدوات أخرى"], ["Plus", "المزيد"],
  ["Voir ma boutique", "رؤية متجري"], ["Voir mon site", "رؤية موقعي"],
  ["Déconnexion", "خروج"], ["Notifications", "الإشعارات"], ["Tout lu", "تمّت القراءة"],
  ["Rien pour le moment.", "لا شيء حاليًا."], ["Vitrine", "موقع تعريفي"],
  ["E-commerce", "متجر إلكتروني"], ["Catalogue", "الكتالوج"], ["Ventes", "المبيعات"],
  ["Vue d'ensemble", "نظرة عامة"], ["Paniers abandonnés", "السلال المتروكة"],
  ["Statistiques livraison", "إحصائيات التوصيل"], ["Frais de livraison", "تكلفة التوصيل"],
  ["Anti-fraude & pixels", "مكافحة الغش والبيكسل"], ["Ouvert", "مفتوح"],

  /* ---- accueil du tableau de bord ---- */
  ["Chiffre d'affaires", "رقم الأعمال"], ["Panier moyen", "متوسط السلة"],
  ["Aperçu du site", "معاينة الموقع"], ["Ouvrir le site", "فتح الموقع"],
  ["Lien d'aperçu", "رابط المعاينة"], ["Copier", "نسخ"], ["Copié", "تم النسخ"],
  ["Dernières commandes", "آخر الطلبات"], ["Tout voir →", "عرض الكل ←"],
  ["Livraisons à suivre", "توصيلات للمتابعة"], ["À traiter", "للمعالجة"],
  ["Colis en route", "طرود في الطريق"], ["Colis perdus", "طرود مفقودة"],
  ["commandes en attente d'appel", "طلبات في انتظار الاتصال"],
  ["confiés au transporteur", "مسلّمة لشركة التوصيل"],
  ["à renvoyer ou rembourser", "لإرجاعها أو تعويضها"],
  ["Commandes à vérifier", "طلبات للتأكد"], ["Numéros bloqués", "أرقام محظورة"],
  ["Ajouter un produit", "إضافة منتج"], ["Modifier le design", "تعديل التصميم"],
  ["Toutes les commandes →", "كل الطلبات ←"], ["Statut", "الحالة"],
  ["Client", "الزبون"], ["Total", "المجموع"], ["Date", "التاريخ"], ["Réf.", "المرجع"],
  ["Produit", "المنتج"], ["Nom", "الاسم"], ["En ligne", "على الإنترنت"],

  /* ---- commandes ---- */
  ["Toutes", "الكل"], ["En attente", "في الانتظار"], ["Confirmée", "مؤكّد"],
  ["Confirmées", "مؤكّدة"], ["Reportée", "مؤجّل"], ["Reportées", "مؤجّلة"],
  ["Injoignable", "غير قابل للاتصال"], ["Injoignables", "غير قابلين للاتصال"],
  ["Annulée", "ملغى"], ["Annulées", "ملغاة"], ["Livrée", "مسلَّم"], ["Livrées", "مسلَّمة"],
  ["Retours", "المرتجعات"], ["Tests", "الاختبارات"], ["Toutes les sources", "كل المصادر"],
  ["Test", "اختبار"], ["Confirmer", "تأكيد"], ["Annuler", "إلغاء"], ["Reporter", "تأجيل"],
  ["Plus tard", "لاحقًا"], ["Refusée", "مرفوض"], ["Appeler", "اتصال"],
  ["Avant de confirmer", "قبل التأكيد"], ["Enregistrer", "حفظ"], ["Retour", "رجوع"],

  /* ---- produits / stock ---- */
  ["Prix", "السعر"], ["En stock", "متوفّر"], ["Définir", "تحديد"], ["Motif", "السبب"],
  ["Réassort", "إعادة التزويد"], ["Publier", "نشر"], ["Activé", "مفعّل"],
  ["Désactivé", "معطّل"], ["Inventaire", "الجرد"], ["Quantité", "الكمية"],
  ["Rechercher", "بحث"], ["Filtrer", "تصفية"], ["Modifier", "تعديل"],
  ["Supprimer", "حذف"], ["Ajouter", "إضافة"], ["Nouveau", "جديد"], ["Enregistrée", "محفوظ"],

  /* ---- réglages ---- */
  ["Identité", "الهوية"], ["Nom de la boutique", "اسم المتجر"], ["Slogan", "الشعار النصي"],
  ["À propos", "نبذة"], ["Wilaya", "الولاية"], ["Langue de la vitrine", "لغة المتجر"],
  ["Français seulement", "الفرنسية فقط"], ["Arabe seulement", "العربية فقط"],
  ["Français + Arabe", "الفرنسية + العربية"],
  ["Apparence de la vitrine", "مظهر المتجر"], ["Voir les thèmes", "عرض القوالب"],
  ["Informations légales", "المعلومات القانونية"], ["Raison sociale", "الاسم القانوني"],
  ["Adresse", "العنوان"], ["Registre de commerce", "السجل التجاري"],
  ["Délai de retour (jours)", "مدة الإرجاع (أيام)"], ["Mesure d'audience", "قياس الزيارات"],
  ["Devise", "العملة"], ["Nom de domaine", "اسم النطاق"], ["Domaine", "النطاق"],
  ["Type", "النوع"], ["Adresse e-mail", "البريد الإلكتروني"], ["Téléphone", "الهاتف"],
  ["Mot de passe", "كلمة السر"], ["Enregistrer les réglages", "حفظ الإعدادات"],
  ["Compte", "الحساب"], ["Sécurité", "الأمان"], ["Boutique", "المتجر"],

  /* ---- connexion / inscription ---- */
  ["Connexion", "تسجيل الدخول"], ["Se connecter", "دخول"], ["Créer un compte", "إنشاء حساب"],
  ["Créer mon compte", "إنشاء حسابي"], ["S'inscrire", "التسجيل"],
  ["Mot de passe oublié ?", "نسيت كلمة السر؟"], ["Déjà inscrit ?", "لديك حساب؟"],
  ["Pas encore de compte ?", "ليس لديك حساب؟"], ["E-mail", "البريد الإلكتروني"],
  ["Créer un site", "إنشاء موقع"],

  /* ---- mots transversaux ---- */
  ["Oui", "نعم"], ["Non", "لا"], ["Fermer", "إغلاق"], ["Suivant", "التالي"],
  ["Précédent", "السابق"], ["Valider", "تأكيد"], ["Envoyer", "إرسال"],
  ["Chargement…", "جار التحميل…"], ["Aujourd'hui", "اليوم"], ["Hier", "أمس"],
  ["Actions", "إجراءات"], ["Détails", "التفاصيل"], ["Aide", "المساعدة"],

  /* ---- accueil : bandeaux et petites phrases ---- */
  ["Voici l'activité de", "هذا نشاط"],
  ["par commande", "لكل طلب"],
  ["Ordinateur", "حاسوب"], ["Mobile", "هاتف"],
  ["Anti-fraude & pixels", "مكافحة الغش والبيكسل"],
  ["C'est ce que voient vos visiteurs sur", "هذا ما يراه زوّارك على"],
  ["— vos passages ici ne sont pas comptés dans les visites.", "— زياراتك أنت لا تُحسب في الإحصائيات."],
  ["À envoyer sur WhatsApp : la personne voit votre site, sans compte.", "أرسله على واتساب: يرى الشخص موقعك دون حساب."],
  ["Valeur", "القيمة"], ["D'où viennent les commandes", "من أين تأتي الطلبات"],
  ["Le client choisit avec le bouton", "الزبون يختار بزر"],
  ["Le thème, les couleurs, les textes et les blocs se règlent dans l'éditeur de design. Ici on ne touche plus au look : rien ne peut casser la vitrine.",
    "القالب والألوان والنصوص والأقسام تُعدّل في محرّر التصميم. هنا لا نلمس الشكل: لا شيء يمكن أن يُفسد المتجر."],
  ["Modifier le design", "تعديل التصميم"], ["Créer un site", "إنشاء موقع"],
  ["Le client choisit avec le bouton FR /", "الزبون يختار بزر FR /"],
  ["Le cadenas", "القفل"], ["et sans", "ودون"],
  ["Reviens ici, écris le domaine sans", "عُد إلى هنا، اكتب النطاق دون"],
  ["puis enregistre. L'adresse /amina-mode continue de marcher.", "ثم احفظ. العنوان /amina-mode يبقى يعمل."],
  ["chez un vendeur de domaines. Garde l'accès au panneau DNS.", "عند بائع نطاقات. احتفظ بالوصول إلى لوحة DNS."],
  ["Ya quoi", "ما رأيك"], ["Signaler", "إبلاغ"], ["en ligne", "على الإنترنت"], ["Voir", "عرض"],
  ["nouvelle", "جديد"], ["confirmee", "مؤكّد"], ["annulee", "ملغى"],
  ["livree", "مسلَّم"], ["reportee", "مؤجّل"], ["injoignable", "غير قابل للاتصال"],

  /* ---- réglages ---- */
  ["Personnalisez votre boutique.", "خصّص متجرك."],
  ["Une seule langue, plus simple.", "لغة واحدة، أبسط."],
  ["Vitrine en arabe, avec écriture de droite à gauche.", "متجر بالعربية، بالكتابة من اليمين إلى اليسار."],
  ["Affichées sur la page « Informations légales » et sur les factures.", "تظهر في صفحة «المعلومات القانونية» وفي الفواتير."],
  ["Comment le relier", "كيف تربطه"],
  ["Achète le nom, par exemple", "اشترِ الاسم، مثلًا"],
  ["Numéro WhatsApp", "رقم واتساب"],
  ["Numéro affiché sur la boutique (bouton flottant) et pour prévenir le client.", "الرقم المعروض في المتجر (زر عائم) ولإبلاغ الزبون."],
  ["Ne confirme que s'il répète le montant à préparer.", "لا تؤكّد إلا إذا كرّر المبلغ المطلوب تحضيره."],
  ["Moyens acceptés", "طرق الدفع المقبولة"],
  ["Paiement à la livraison", "الدفع عند التسليم"],
  ["Le client paie le livreur à la réception. Recommandé en Algérie.", "الزبون يدفع لعامل التوصيل عند الاستلام. الأنسب في الجزائر."],
  ["Frais ajoutés (DZD)", "رسوم مضافة (دج)"],
  ["Texte affiché au client", "نصّ يظهر للزبون"],
  ["Carte CIB / Edahabia", "بطاقة CIB / الذهبية"],
  ["Virement / versement CCP", "تحويل / إيداع بريدي"],
  ["Instructions affichées au client", "تعليمات تظهر للزبون"],
  ["Exporter CSV", "تصدير CSV"],
  ["Unités en stock", "وحدات في المخزون"],
  ["Valeur du stock", "قيمة المخزون"],
  ["au prix de vente", "بسعر البيع"],
  ["Ruptures", "نفدت الكمية"],
  ["à réapprovisionner", "لإعادة التزويد"],
  ["stock faible", "مخزون ضعيف"],
  ["Sous le seuil", "تحت الحد"],
  ["Thème actuel :", "القالب الحالي:"],
  ["CAPTCHA et vérifications", "كابتشا والتحقق"],
  ["inactif", "غير مفعّل"], ["Activation", "التفعيل"],
  ["Type de CAPTCHA", "نوع الكابتشا"],
  ["Clé du site (site key)", "مفتاح الموقع"],
  ["Clé secrète (secret key)", "المفتاح السري"],
  ["IP publique du serveur", "العنوان IP العام للخادم"],
  ["la même IP", "نفس العنوان"],
  ["Changer de thème", "تغيير القالب"],
  ["Code", "الشيفرة"], ["Contours", "الحدود"], ["Taille", "الحجم"],
  ["Brouillon", "مسودة"], ["Enregistré", "محفوظ"],

  /* ---- le tour de toutes les pages (menu, cloche, aide) ---- */
  ["Ouvrir le menu", "فتح القائمة"], ["Fermer le menu", "إغلاق القائمة"],
  ["Ouvrir l'assistant", "فتح المساعد"], ["Une question", "سؤال"], ["Navigation", "التنقل"],
  ["Français", "الفرنسية"], ["Rechercher une commande", "ابحث عن طلب"],
  ["Rechercher une page", "ابحث عن صفحة"], ["Rechercher un produit", "ابحث عن منتج"],
  ["Je réponds avec ce qui est dans la boutique. Signaler met une ligne dans la cloche. Pas de mail, pas de WhatsApp.",
    "أجيب بما هو موجود في المتجر. «إبلاغ» يضيف سطرًا في الجرس. لا بريد، لا واتساب."],
  ["Aucune sélection", "لا اختيار"], ["Plateforme", "المنصة"],
  ["Créer une commande de test", "إنشاء طلب تجريبي"],
  ["Réf, nom, téléphone…", "المرجع، الاسم، الهاتف…"],
  ["Sélectionner la commande", "تحديد الطلب"],
  ["Copier le numéro de commande", "نسخ رقم الطلب"],
  ["Copier le numéro de commande de la commande", "نسخ رقم الطلب"],
  ["Actions de la commande", "إجراءات الطلب"],
  ["Appareil utilisé pour commander", "الجهاز المستخدم للطلب"],
  ["Écrire sur WhatsApp", "الكتابة على واتساب"],
  ["Marquer comme commande de test", "تعليم كطلب تجريبي"],
  ["Annuler la commande (le stock revient)", "إلغاء الطلب (يعود المخزون)"],
  ["Annule la commande, le stock revient", "يلغي الطلب، ويعود المخزون"],

  /* ---- détail d'une commande ---- */
  ["Commande", "الطلب"], ["Facture", "الفاتورة"], ["Bon de livraison", "وصل التسليم"],
  ["À dire au téléphone", "ما يُقال في الهاتف"],
  ["Ce numéro, partout", "هذا الرقم في كل مكان"],
  ["Livré, annulé, retour. Pas le nom, pas l'adresse, pas la boutique.",
    "مُسلَّم، ملغى، مُرتجع. بلا اسم، بلا عنوان، بلا متجر."],
  ["Vérifier un autre numéro", "التحقق من رقم آخر"],
  ["Action rapide", "إجراء سريع"], ["Annuler la commande", "إلغاء الطلب"],
  ["Aucun appel enregistré. Le bouton « injoignable » compte les appels : au 3ᵉ, la commande passe en injoignable.",
    "لا مكالمات مسجّلة. زر «غير قابل للاتصال» يعدّ المكالمات: عند الثالثة يصبح الطلب غير قابل للاتصال."],
  ["Modifier la commande", "تعديل الطلب"],
  ["— infos du client, articles, quantités, tarifs", "— معلومات الزبون، المنتجات، الكميات، الأسعار"],
  ["Commune", "البلدية"], ["Note interne", "ملاحظة داخلية"],
  ["Type de livraison", "نوع التوصيل"],
  ["À domicile", "إلى المنزل"], ["Au bureau", "إلى المكتب"],
  ["Articles", "المنتجات"],
  ["— Choisir un produit à ajouter —", "— اختر منتجًا لإضافته —"],
  ["+ Ajouter à la commande", "+ إضافة إلى الطلب"],
  ["Frais de livraison (DZD)", "تكلفة التوصيل (دج)"],
  ["Remise (DZD)", "الخصم (دج)"], ["Nouveau total", "المجموع الجديد"],
  ["Enregistrer les modifications", "حفظ التعديلات"],
  ["Le stock des produits n'est pas modifié ici : la commande seule est corrigée.",
    "مخزون المنتجات لا يتغيّر هنا: الطلب وحده يُعدّل."],
  ["Sous-total", "المجموع الفرعي"], ["Note", "ملاحظة"],
  ["Commande de démonstration", "طلب تجريبي"], ["Commande réelle", "طلب حقيقي"],
  ["Changer le statut", "تغيير الحالة"],
  ["Expédiée", "مُرسل"], ["Colis perdu", "طرد مفقود"], ["Remboursée", "مُعوَّض"],
  ["À vérifier", "للتحقق"], ["D'où vient cette commande", "من أين جاء هذا الطلب"],
  ["Appareil", "الجهاز"],
  ["Aucune campagne détectée : le client est arrivé directement ou depuis un lien sans paramètre. Ajoutez",
    "لا حملة مكتشفة: الزبون وصل مباشرة أو من رابط بلا معامل. أضف"],
  ["à vos liens de publicité pour tout suivre ici.", "إلى روابط إعلاناتك لتتابع كل شيء هنا."],
  ["Historique", "السجل"], ["Commande reçue (démonstration)", "استُلم الطلب (تجريبي)"],
  ["Désignation", "البيان"], ["Retirer cet article", "حذف هذا المنتج"],
  ["Produit à ajouter", "منتج لإضافته"],

  /* ---- nouveau produit ---- */
  ["Nouveau produit", "منتج جديد"],
  ["Photos, variantes et catégorie — tout se règle ici.", "الصور، الخيارات والفئة — كل شيء يُعدّل هنا."],
  ["Photos", "الصور"],
  ["Aucune photo. Ajoute la première : ce sera la photo principale.",
    "لا صورة. أضف الأولى: ستكون الصورة الرئيسية."],
  ["Ajouter une photo", "إضافة صورة"], ["Recadrer la principale", "قصّ الرئيسية"],
  ["Titre du produit", "اسم المنتج"], ["Description", "الوصف"],
  ["Prix (DZD)", "السعر (دج)"], ["Prix barré (DZD)", "السعر المشطوب (دج)"],
  ["Facultatif : affiche l'ancien prix barré + un badge « Promo ». Laisser vide s'il n'y a pas de promo.",
    "اختياري: يُظهر السعر القديم مشطوبًا مع شارة «تخفيض». اتركه فارغًا إن لم يكن هناك تخفيض."],
  ["Catégorie", "الفئة"], ["— Aucune —", "— لا شيء —"],
  ["Cadrage de la photo", "قصّ الصورة"],
  ["Centré", "وسط"], ["Haut", "أعلى"], ["Bas", "أسفل"],
  ["Souvent achetés ensemble", "يُشترى معه غالبًا"],
  ["Jusqu'à 3 produits proposés avec celui-ci sur la fiche.",
    "حتى 3 منتجات تُقترح مع هذا المنتج في صفحته."],
  ["Titres de variante", "عناوين الخيارات"],
  ["Taille, Couleur… un titre par choix proposé, avec ses options. Le client choisira à la commande.",
    "المقاس، اللون… عنوان لكل خيار، مع قيمه. الزبون يختار عند الطلب."],
  ["Aucun titre de variante : le produit est vendu sans choix.", "لا خيارات: المنتج يُباع دون اختيار."],
  ["+ Ajouter un titre de variante", "+ إضافة عنوان خيار"],
  ["Variantes avec leur prix et leur stock", "الخيارات بأسعارها ومخزونها"],
  ["Aucune variante avec prix : le prix du produit s’applique.", "لا خيار بسعر: سعر المنتج هو المعتمد."],
  ["+ Ajouter une variante", "+ إضافة خيار"],
  ["Afficher dans la boutique", "إظهار في المتجر"],
  ["Créer le produit", "إنشاء المنتج"],
  ["Recadrer la photo", "قصّ الصورة"],
  ["Glisse la photo pour choisir la zone", "اسحب الصورة لاختيار المنطقة"],
  ["Réinitialiser", "إرجاع"], ["Utiliser cette zone", "استخدام هذه المنطقة"],
  ["Matière, tailles, détails", "المادة، المقاسات، التفاصيل"], ["Zoom", "تكبير"],
  ["Photos du produit — glisser pour changer l'ordre", "صور المنتج — اسحب لتغيير الترتيب"],

  /* ---- stock ---- */
  ["Chaque entrée et sortie est enregistrée. Le stock descend à la commande, remonte à l'annulation.",
    "كل دخول وخروج مسجّل. المخزون ينقص عند الطلب ويعود عند الإلغاء."],
  ["Sous le seuil", "تحت الحد"], ["Variante", "الخيار"],
  ["Vendu", "مُباع"], ["État", "الحالة"], ["Ajuster", "تعديل"],
  ["Seuil d'alerte", "حد التنبيه"],
  ["Prévenir quand le stock atteint", "التنبيه عندما يبلغ المخزون"],
  ["Mouvements récents", "الحركات الأخيرة"], ["Mouvement", "الحركة"],
  ["Nouveau niveau", "المستوى الجديد"], ["Vente", "بيع"],
  ["Ajuster le stock", "تعديل المخزون"],
  ["Retirer la quantité", "سحب الكمية"], ["Retirer", "سحب"],
  ["Ajouter la quantité", "إضافة الكمية"],
  ["Motif du mouvement", "سبب الحركة"],

  /* ---- avis, clients, pages, pages de vente ---- */
  ["Avis clients", "تقييمات الزبائن"],
  ["Aucun avis", "لا تقييمات"],
  ["Les avis arrivent depuis la fiche produit.", "التقييمات تأتي من صفحة المنتج."],
  ["Aucun client inscrit", "لا زبون مسجّل"],
  ["Le compte client permet le suivi de commande et l'historique.",
    "حساب الزبون يسمح بمتابعة الطلب وسجله."],
  ["À propos, Contact, conditions de vente…", "من نحن، اتصل بنا، شروط البيع…"],
  ["Nouvelle page", "صفحة جديدة"], ["Aucune page", "لا صفحات"],
  ["Créer une page", "إنشاء صفحة"],
  ["Créer ma première page", "إنشاء صفحتي الأولى"],
  ["Aucune page de vente", "لا صفحات بيع"],

  /* ---- catégories / codes promo ---- */
  ["Ranger le catalogue et filtrer la boutique.", "ترتيب الكتالوج وتصفية المتجر."],
  ["Robes, Sacs, Chaussures…", "فساتين، حقائب، أحذية…"],
  ["Remises appliquées au panier par vos clients.", "خصومات تُطبَّق على سلة زبائنك."],
  ["Pourcentage (%)", "نسبة مئوية (%)"],
  ["Montant fixe (DZD)", "مبلغ ثابت (دج)"],
  ["Panier minimum", "أدنى مبلغ للسلة"],
  ["Utilisations max", "أقصى عدد استعمالات"],
  ["Produit concerné", "المنتج المعني"],
  ["Tout le panier", "كل السلة"],
  ["Créer", "إنشاء"], ["Aucun code promo", "لا كود خصم"],
  ["0 = illimité", "0 = بلا حد"],

  /* ---- paiement ---- */
  ["Choisissez ce que vos clients peuvent utiliser. Vous pouvez tout modifier à tout moment.",
    "اختر ما يستطيع زبائنك استعماله. يمكنك تعديل كل شيء في أي وقت."],
  ["Paiement par carte via la page de votre banque ou de votre prestataire.",
    "الدفع بالبطاقة عبر صفحة بنكك أو مزوّدك."],
  ["Le client verse sur votre compte puis envoie le reçu (WhatsApp, téléphone).",
    "الزبون يحوّل إلى حسابك ثم يرسل الوصل (واتساب، هاتف)."],
  ["Vos coordonnées bancaires", "بياناتك البنكية"],
  ["Paiement en ligne (votre prestataire)", "الدفع الإلكتروني (مزوّدك)"],
  ["Adresse de paiement", "عنوان الدفع"], ["Consigne affichée", "تعليمة معروضة"],
  ["Payez en espèces à la réception", "ادفع نقدًا عند الاستلام"],
  ["Vous serez redirigé vers la page de paiement sécurisée de la banque.",
    "ستُنقل إلى صفحة الدفع الآمن للبنك."],
  ["Vous serez redirigé vers le paiement sécurisé.", "ستُنقل إلى الدفع الآمن."],

  /* ---- livraison ---- */
  ["Statistiques de livraison", "إحصائيات التوصيل"],
  ["Synchroniser les statuts", "مزامنة الحالات"],
  ["Colis envoyés", "طرود مُرسلة"], ["colis revenus", "طرود عائدة"],
  ["Délai moyen", "المدة المتوسطة"], ["jusqu'à la livraison", "حتى التسليم"],
  ["Par transporteur", "حسب شركة التوصيل"], ["Aucun colis envoyé", "لا طرود مُرسلة"],
  ["Par wilaya", "حسب الولاية"], ["Là où tes colis se perdent", "حيث تضيع طرودك"],
  ["Aucune donnée pour l'instant.", "لا بيانات حاليًا."],

  /* ---- petites phrases restantes ---- */
  ["Sans publicité", "بدون إعلان"],
  ["appel sans réponse", "مكالمة بلا رد"],
  ["livré", "مُسلَّم"], ["annulé", "ملغى"], ["retour", "مرتجع"],
  ["Nouvelle commande", "طلب جديد"],

  /* ---- design ---- */
  ["Accueil", "الرئيسية"], ["Fiche produit", "صفحة المنتج"], ["Panier", "السلة"],
  ["Page de commande", "صفحة الطلب"], ["CGV / mentions légales", "الشروط والإشعارات القانونية"],
  /* la page de fin de commande, telle qu'elle s'affiche dans le Studio */
  ["Commande confirmée", "تم تأكيد الطلب"], ["Merci", "شكراً"],
  ["Récapitulatif", "الملخص"], ["Confirmation", "تأكيد الطلب"],
  ["Compte client", "حساب الزبون"],
  ["Clique dans l'aperçu : ça ouvre le bon réglage", "اضغط في المعاينة: يفتح الإعداد المناسب"],
  ["Enregistrer comme template", "حفظ كقالب"],
  ["Modifier la navigation", "تعديل القائمة"],
  ["Historique des publications", "سجل النشر"],
  ["Réinitialiser le design", "إرجاع التصميم"],
  ["Sections", "الأقسام"], ["En-tête", "الرأس"], ["Paramètres", "الإعدادات"],
  ["Code", "الشيفرة"], ["Textes", "النصوص"],
  ["Page d'accueil", "الصفحة الرئيسية"],
  ["En-tête · barre et navigation", "الرأس · الشريط والقائمة"],
  ["Modèle", "القالب"], ["Ajouter une section", "إضافة قسم"],
  ["Pied de page · dans Paramètres du thème", "التذييل · في إعدادات القالب"],
  ["Sections de :", "أقسام:"], ["Bannière d'accueil", "لافتة الترحيب"],
  ["Enlever", "إزالة"], ["Produit en vedette", "منتج مميّز"],
  ["Grille de produits", "شبكة المنتجات"], ["Points forts", "نقاط القوة"],
  ["Navigation de l'en-tête", "قائمة الرأس"],
  ["+ Ajouter un lien", "+ إضافة رابط"],
  ["Adresse vide = accueil. Sinon", "عنوان فارغ = الرئيسية. وإلا"],
  ["ou une URL complète.", "أو رابط كامل."],
  ["Taille du texte", "حجم النص"],
  ["Clique un texte dans l'aperçu.", "اضغط على نص في المعاينة."],
  ["0 le cache. 100 est la plus grande. Le chiffre du milieu est la taille exacte.",
    "0 يُخفيه. 100 الأكبر. الرقم في الوسط هو الحجم الفعلي."],
  ["Exact", "دقيق"], ["Auto", "تلقائي"],
  ["Choisis un bloc : il s'ajoute à ta page et tu le modifies tout de suite.",
    "اختر قسمًا: يُضاف إلى صفحتك وتعدّله فورًا."],
  ["La boutique telle qu'elle est maintenant est gardée. Rien n'est publié.",
    "المتجر كما هو الآن يُحفظ. لا شيء يُنشر."],
  ["Code de la page", "شيفرة الصفحة"], ["Insérer le modèle", "إدراج القالب"],
  ["Revenir au thème", "العودة إلى القالب"], ["Enregistrer ce code", "حفظ هذه الشيفرة"],
  ["Versions publiées", "النسخ المنشورة"],
  ["Créer avec les sections déjà là", "إنشاء بالأقسام الموجودة"],
  ["Poser le brouillon", "وضع المسودة"],
  ["Tableau de bord", "لوحة التحكم"], ["Retour au tableau de bord", "العودة إلى لوحة التحكم"],
  ["Annuler (Ctrl+Z)", "تراجع (Ctrl+Z)"], ["Rétablir (Ctrl+Maj+Z)", "إعادة (Ctrl+Maj+Z)"],
  ["Rétablir", "إعادة"], ["Taille de l'aperçu", "حجم المعاينة"], ["Tablette", "لوحي"],
  ["Page à modifier", "الصفحة المراد تعديلها"], ["CSS de cette page", "CSS هذه الصفحة"],
  ["Code HTML de cette page", "شيفرة HTML هذه الصفحة"],
  ["Créer la page avec les sections déjà là", "إنشاء الصفحة بالأقسام الموجودة"],
  ["Régler la taille d'un texte", "ضبط حجم نص"],
  ["Afficher ou cacher les réglages", "إظهار أو إخفاء الإعدادات"],
  ["Plus d'actions", "إجراءات أخرى"], ["Aperçu de la boutique", "معاينة المتجر"],
  ["Taille de 0 à 100", "الحجم من 0 إلى 100"],
  ["Chargement du code de la page…", "جار تحميل شيفرة الصفحة…"],

  /* ---- formulaire de commande ---- */
  ["À gauche, tu choisis. À droite, le client voit le changement tout de suite.",
    "على اليمين تختار. وعلى اليسار يرى الزبون التغيير فورًا."],
  ["Classique", "كلاسيكي"], ["Cartes", "بطاقات"], ["Lignes", "أسطر"],
  ["Pilules", "أقراص"], ["Étapes", "خطوات"], ["Ticket", "تذكرة"], ["Nuit", "ليلي"],
  ["Bloc", "كتلة"], ["Dedans", "داخلي"], ["Couleur", "اللون"], ["Autre", "آخر"],
  ["Langue", "اللغة"], ["Arabe", "العربية"], ["Ajouter un détail", "إضافة تفصيل"],
  ["Texte", "نص"], ["Texte long", "نص طويل"], ["Liste", "قائمة"],
  ["+ Taille", "+ المقاس"], ["+ Couleur", "+ اللون"], ["+ Point de repère", "+ علامة مميزة"],
  ["+ Heure de livraison", "+ وقت التوصيل"], ["+ 2e téléphone", "+ هاتف ثانٍ"],
  ["+ Maison ou bureau", "+ منزل أو مكتب"],
  ["Ordre", "الترتيب"], ["Glisse une ligne pour changer l'ordre.", "اسحب سطرًا لتغيير الترتيب."],
  ["Aperçu", "معاينة"], ["ce que le client voit", "ما يراه الزبون"],
  ["Nom complet", "الاسم الكامل"], ["Adresse complète", "العنوان الكامل"],
  ["Note (facultatif)", "ملاحظة (اختياري)"], ["Ma position", "موقعي"],
  ["Paiement à la livraison. On vous appelle pour confirmer.",
    "الدفع عند التسليم. نتصل بك للتأكيد."],
  ["Commander", "اطلب"], ["noir", "أسود"], ["vert", "أخضر"], ["bleu", "أزرق"],
  ["bordeaux", "عنابي"], ["sable", "رملي"], ["violet", "بنفسجي"],
  ["Pointure, cadeau, étage…", "المقاس، هدية، الطابق…"],
  ["Nom du détail", "اسم التفصيل"], ["Choix", "الخيار"], ["Glisser", "اسحب"],
  ["Repère, horaire de livraison", "علامة، وقت التوصيل"],

  /* ---- réseaux sociaux ---- */
  ["Mes comptes", "حساباتي"],
  ["Laissez vide ce que vous n'utilisez pas.", "اترك فارغًا ما لا تستعمله."],
  ["Nom affiché (facultatif)", "الاسم المعروض (اختياري)"],
  ["Autre site", "موقع آخر"],
  ["Choisir l'emplacement dans le Design", "اختيار المكان في التصميم"],

  /* ---- paniers abandonnés ---- */
  ["Détecter maintenant", "اكتشاف الآن"], ["À relancer", "للمتابعة"],
  ["Taux de conversion", "نسبة التحويل"],
  ["Récupérés après relance", "مُستعاد بعد المتابعة"],
  ["En cours", "جارٍ"], ["visiteurs actifs", "زائر نشط"],
  ["Délai : 45 min sans activité", "المدة: 45 دقيقة بلا نشاط"],
  ["Aucun panier abandonné", "لا سلة متروكة"],
  ["Les paniers en cours apparaîtront ici dès qu'un visiteur les laisse de côté.",
    "السلال الجارية تظهر هنا عندما يتركها زائر."],
  ["Comment ça marche", "كيف يعمل"], ["Relancer", "متابعة"],

  /* ---- marketing ---- */
  ["Bloquez les fausses commandes et envoyez vos conversions depuis le serveur, pour ne rien perdre.",
    "أوقف الطلبات الوهمية وأرسل تحويلاتك من الخادم، دون أن يضيع شيء."],
  ["v3 — invisible, avec score", "v3 — خفي، مع نتيجة"],
  ["v2 — case à cocher", "v2 — مربع اختيار"], ["v2 — invisible", "v2 — خفي"],
  ["Score minimum v3", "أدنى نتيجة v3"],
  ["Téléphone strict", "هاتف صارم"], ["Souple", "مرن"],
  ["Refuser un numéro invalide", "رفض رقم غير صحيح"],
  ["Les clés se créent sur", "المفاتيح تُنشأ على"],
  ["(gratuit). Sans clé, la commande n'est pas bloquée : elle est marquée « à vérifier ».",
    "(مجانًا). بلا مفتاح، الطلب لا يُوقف: يُعلَّم «للتحقق»."],
  ["Pixels serveur (Conversions API)", "بيكسلات الخادم (Conversions API)"],
  ["aucun", "لا شيء"], ["Envoi serveur", "إرسال من الخادم"],
  ["Code de test (Events Manager)", "كود الاختبار (Events Manager)"],
  ["Événements envoyés :", "الأحداث المُرسلة:"],
  ["Événements envoyés (7 j)", "الأحداث المُرسلة (7 أيام)"],
  ["0 en erreur", "0 بخطأ"],
  ["score de risque ≥ 30", "درجة خطر ≥ 30"], ["liste noire", "قائمة سوداء"],
  ["Aucune commande suspecte", "لا طلب مشبوه"],
  ["Les commandes normales passent directement en « nouvelle ».",
    "الطلبات العادية تذهب مباشرة إلى «جديد»."],
  ["Bloquer ce numéro", "حظر هذا الرقم"], ["Aucun numéro bloqué.", "لا رقم محظور."],
  ["Journal des événements", "سجل الأحداث"],
  ["Aucun événement", "لا أحداث"],

  /* ---- relances ---- */
  ["Mode d'envoi", "طريقة الإرسال"],
  ["Manuel — lien WhatsApp cliquable", "يدوي — رابط واتساب قابل للنقر"],
  ["Automatique — une API envoie à ma place", "تلقائي — واجهة ترسل بدلاً مني"],
  ["URL de l'API d'envoi", "عنوان واجهة الإرسال"],
  ["En-tête d'authentification", "ترويسة التوثيق"],
  ["Valeur de l'en-tête", "قيمة الترويسة"],
  ["Corps envoyé à l'API (JSON)", "المتن المُرسل إلى الواجهة (JSON)"],
  ["sont remplacés.", "تُستبدل."],
  ["Messages", "الرسائل"], ["Relance de panier", "متابعة السلة"],
  ["Suivi de commande", "متابعة الطلب"],
  ["Journal des messages", "سجل الرسائل"], ["Aucun message", "لا رسائل"],
  ["Les relances de panier apparaîtront ici.", "متابعات السلة تظهر هنا."],
  ["Envoi", "الإرسال"],

  /* ---- statistiques / visites ---- */
  ["Ce que la boutique rapporte vraiment : argent encaissé, commandes confirmées, produits qui partent.",
    "ما يجلبه المتجر فعلاً: المال المُحصّل، الطلبات المؤكدة، المنتجات التي تُباع."],
  ["Exporter les commandes", "تصدير الطلبات"],
  ["7 derniers jours", "آخر 7 أيام"], ["30 derniers jours", "آخر 30 يومًا"],
  ["Taux de confirmation", "نسبة التأكيد"],
  ["Commandes livrées", "طلبات مُسلَّمة"],
  ["exclues du chiffre d'affaires", "مستبعدة من رقم الأعمال"],
  ["14 derniers jours", "آخر 14 يومًا"],
  ["chiffre d'affaires par jour", "رقم الأعمال يوميًا"],
  ["Meilleures ventes", "الأكثر بيعًا"], ["unités vendues", "وحدة مباعة"],
  ["Wilayas", "الولايات"], ["où ça commande", "من أين تأتي الطلبات"],

  /* ---- e-mails ---- */
  ["Prévenir la boutique et le client quand une commande arrive.",
    "إبلاغ المتجر والزبون عند وصول طلب."],
  ["Quand envoyer", "متى يُرسل"],
  ["M'écrire à chaque nouvelle commande", "راسلني عند كل طلب جديد"],
  ["Écrire au client si son e-mail est dans la commande", "الكتابة للزبون إذا كان بريده في الطلب"],
  ["Écrire au client quand le statut change", "الكتابة للزبون عند تغيّر الحالة"],
  ["Expéditeur", "المرسل"], ["Nom affiché", "الاسم المعروض"],
  ["Adresse d'envoi", "عنوان الإرسال"],
  ["Serveur d'envoi (SMTP)", "خادم الإرسال (SMTP)"],
  ["Serveur", "الخادم"], ["Port", "المنفذ"], ["Utilisateur", "المستخدم"],
  ["Envoyer un essai", "إرسال تجربة"], ["Journal", "السجل"],
  ["Quand", "متى"], ["Sujet", "الموضوع"],

  /* ---- équipe ---- */
  ["Qui peut entrer dans cette boutique, et pour faire quoi.",
    "من يستطيع الدخول إلى هذا المتجر، ولأي عمل."],
  ["Propriétaire", "المالك"],
  ["Tous les droits. On ne peut pas le retirer.", "كل الحقوق. لا يمكن إزالته."],
  ["Créer un lien", "إنشاء رابط"],
  ["Prénom, pour t'en souvenir", "الاسم، لتتذكّره"],
  ["Créer le lien", "إنشاء الرابط"], ["Membres", "الأعضاء"],
  ["Personne d'autre pour l'instant.", "لا أحد آخر حاليًا."],

  /* ---- historique ---- */
  ["Historique d'un numéro", "سجل رقم"],
  ["Livré, annulé, retour. Toutes les boutiques. Pas le nom, pas l'adresse.",
    "مُسلَّم، ملغى، مُرتجع. كل المتاجر. بلا اسم، بلا عنوان."],
  ["Tape un numéro.", "اكتب رقمًا."], ["Numéro", "الرقم"],

  /* ---- transporteurs (les noms de sociétés restent en latin) ---- */
  ["+ Ajouter un transporteur", "+ إضافة شركة توصيل"],
  ["Ma connexion", "اتصالي"], ["Société de livraison", "شركة التوصيل"],
  ["Test (aucun vrai colis)", "تجربة (بلا طرد حقيقي)"],
  ["Jetons : Identifiant API + Jeton API. L'adresse du bureau est déjà connue. Les bureaux de retrait se récupèrent ici.",
    "الرموز: معرّف API + رمز API. عنوان المكتب معروف. مكاتب الاستلام تُجلب من هنا."],
  ["Wilaya de départ", "ولاية الانطلاق"],
  ["Obligatoire pour Yalidine et ses clones.", "إلزامي لـ Yalidine وما شابهها."],
  ["Adresse du bureau EcoTrack", "عنوان مكتب EcoTrack"],
  ["Identifiant API", "معرّف API"], ["Jeton API", "رمز API"],
  ["Chiffré en base, jamais renvoyé au navigateur.", "مشفّر في قاعدة البيانات، لا يُرسل إلى المتصفح."],
  ["Réglages avancés", "إعدادات متقدمة"],
  ["En-tête 1 — nom", "ترويسة 1 — الاسم"],
  ["En-tête 2 — nom", "ترويسة 2 — الاسم"],
  ["En-tête 3 — nom (facultatif)", "ترويسة 3 — الاسم (اختياري)"],
  ["En-tête 3 — valeur", "ترويسة 3 — القيمة"],

  /* ---- les 69 wilayas (mêmes noms, en arabe) ---- */
  ["Adrar", "أدرار"], ["Chlef", "الشلف"], ["Laghouat", "الأغواط"],
  ["Oum El Bouaghi", "أم البواقي"], ["Batna", "باتنة"], ["Béjaïa", "بجاية"],
  ["Biskra", "بسكرة"], ["Béchar", "بشار"], ["Blida", "البليدة"], ["Bouira", "البويرة"],
  ["Tamanrasset", "تمنراست"], ["Tébessa", "تبسة"], ["Tlemcen", "تلمسان"],
  ["Tiaret", "تيارت"], ["Tizi Ouzou", "تيزي وزو"], ["Alger", "الجزائر"],
  ["Djelfa", "الجلفة"], ["Jijel", "جيجل"], ["Sétif", "سطيف"], ["Saïda", "سعيدة"],
  ["Skikda", "سكيكدة"], ["Sidi Bel Abbès", "سيدي بلعباس"], ["Annaba", "عنابة"],
  ["Guelma", "قالمة"], ["Constantine", "قسنطينة"], ["Médéa", "المدية"],
  ["Mostaganem", "مستغانم"], ["M'Sila", "المسيلة"], ["Mascara", "معسكر"],
  ["Ouargla", "ورقلة"], ["Oran", "وهران"], ["El Bayadh", "البيض"], ["Illizi", "إليزي"],
  ["Bordj Bou Arreridj", "برج بوعريريج"], ["Boumerdès", "بومرداس"], ["El Tarf", "الطارف"],
  ["Tindouf", "تندوف"], ["Tissemsilt", "تيسمسيلت"], ["El Oued", "الوادي"],
  ["Khenchela", "خنشلة"], ["Souk Ahras", "سوق أهراس"], ["Tipaza", "تيبازة"],
  ["Mila", "ميلة"], ["Aïn Defla", "عين الدفلى"], ["Naâma", "النعامة"],
  ["Aïn Témouchent", "عين تموشنت"], ["Ghardaïa", "غرداية"], ["Relizane", "غليزان"],
  ["Timimoun", "تيميمون"], ["Bordj Badji Mokhtar", "برج باجي مختار"],
  ["Ouled Djellal", "أولاد جلال"], ["Béni Abbès", "بني عباس"],
  ["In Salah", "عين صالح"], ["In Guezzam", "عين قزام"], ["Touggourt", "تقرت"],
  ["Djanet", "جانت"], ["El M'Ghair", "المغير"], ["El Meniaa", "المنيعة"],
  /* ---- les 11 wilayas de 2026 ---- */
  ["Aflou", "أفلو"], ["Barika", "بريكة"], ["El Kantara", "القنطرة"],
  ["Bir El Ater", "بئر العاتر"], ["El Aricha", "العريشة"], ["Ksar Chellala", "قصر الشلالة"],
  ["Aïn Ouessara", "عين وسارة"], ["Messaad", "مسعد"], ["Ksar El Boukhari", "قصر البخاري"],
  ["Bou Saâda", "بوسعادة"], ["El Abiodh Sidi Cheikh", "الأبيض سيدي الشيخ"],
  /* ---- livraison (tarifs) ---- */
  ["Deux façons de livrer : à domicile, ou au bureau. Un tarif pour tout le pays suffit dans la plupart des cas.",
    "طريقتان للتوصيل: إلى المنزل أو إلى المكتب. سعر واحد لكل البلاد يكفي في معظم الحالات."],
  ["Ce que vous proposez", "ما تعرضه"],
  ["Livraison à domicile", "التوصيل إلى المنزل"],
  ["Le livreur vient à l'adresse indiquée par le client.", "عامل التوصيل يأتي إلى العنوان الذي يكتبه الزبون."],
  ["Retrait au bureau", "الاستلام من المكتب"],
  ["Le client retire son colis dans l'agence de sa wilaya — souvent moins cher.",
    "الزبون يستلم طرده من وكالة ولايته — غالبًا أرخص."],
  ["Tarifs", "الأسعار"], ["Tarif à domicile (DZD)", "سعر التوصيل إلى المنزل (دج)"],
  ["500 = 500 DZD partout, à domicile.", "500 = 500 دج في كل مكان، إلى المنزل."],
  ["Tarif au bureau (DZD)", "سعر المكتب (دج)"],
  ["Généralement 100 DZD de moins.", "عادة 100 دج أقل."],
  ["Délai annoncé (jours)", "المدة المعلنة (أيام)"],
  ["Appliquer partout", "تطبيق في كل مكان"],
  ["Tarif wilaya par wilaya", "سعر لكل ولاية"],
  ["— 69 wilayas, seulement si tu veux des prix différents", "— 69 ولاية، فقط إن أردت أسعارًا مختلفة"],
  ["Domicile", "المنزل"], ["Bureau", "المكتب"], ["Délai (j)", "المدة (أيام)"],
  ["Délai minimum", "أدنى مدة"], ["Délai maximum", "أقصى مدة"],

  /* ---- réseaux : deux phrases coupées par des liens ---- */
  ["Collez vos adresses une fois. Ensuite, choisissez où elles s'affichent dans",
    "الصق عناوينك مرة واحدة. ثم اختر أين تظهر في"],
  ["Design → Réseaux sociaux", "التصميم ← شبكات التواصل"],
  ["aucun lien", "لا رابط"],
  ["Une adresse sans « https:// » est complétée automatiquement. Seuls les liens http(s) sont acceptés.",
    "العنوان بلا «https://» يُكمل تلقائيًا. تُقبل روابط http(s) فقط."],
  ["Aperçu de votre site", "معاينة موقعك"],
  ["Aucune sélection", "لا اختيار"],
  [". Le téléphone est haché (SHA-256) avant l'envoi, comme l'exigent les trois régies.",
    ". يُشفّر الهاتف (SHA-256) قبل الإرسال، كما تشترط المنصات الثلاث."],
  ["Configurez un pixel et passez une commande de test : les envois apparaîtront ici avec leur code de réponse.",
    "اضبط بيكسلًا وأرسل طلبًا تجريبيًا: تظهر الإرسالات هنا مع رمز الرد."],
  ["Tu coches les droits, tu donnes un prénom si tu veux, et tu crées un lien. Pas d'e-mail.",
    "تحدد الحقوق، وتكتب اسمًا إن أردت، وتنشئ رابطًا. بلا بريد إلكتروني."],
  ["Tu copies le lien, ou tu l'ouvres dans WhatsApp et tu choisis la personne.",
    "تنسخ الرابط، أو تفتحه في واتساب وتختار الشخص."],
  ["Elle ouvre le lien et choisit elle-même son identifiant, par exemple madame-sara ou sara2001, puis son mot de passe.",
    "تفتح الرابط وتختار بنفسها معرّفها، مثل madame-sara أو sara2001، ثم كلمة سرها."],
  ["Tu changes ses droits plus tard, ou tu la retires. Le propriétaire garde tout.",
    "تغيّر حقوقها لاحقًا أو تزيلها. المالك يحتفظ بكل شيء."],
  ["Elle choisit son identifiant en ouvrant le lien. Toi, tu ne le tires pas au hasard.",
    "هي تختار معرّفها عند فتح الرابط. أنت لا تخترعه."],
  ["Coche seulement ce qu'elle peut faire. Rien de coché = elle voit l'accueil, sans modifier.",
    "حدد فقط ما تستطيع فعله. بلا تحديد = ترى الصفحة الرئيسية دون تعديل."],
  ["Commandes, clients, paniers, relances", "الطلبات، الزبائن، السلال، المتابعات"],
  ["Catalogue, stock, catégories, promos", "الكتالوج، المخزون، الفئات، الخصومات"],
  ["Thèmes, pages, formulaire", "القوالب، الصفحات، الاستمارة"],
  ["Livraison, paiement, réseaux, marketing", "التوصيل، الدفع، الشبكات، التسويق"],
  ["Réglages, domaine, e-mails", "الإعدادات، النطاق، الرسائل"],
  ["Inviter et retirer des personnes", "دعوة الأشخاص وإزالتهم"],
  ["Qté", "الكمية"],
  ["Glisse une photo pour la déplacer : la", "اسحب صورة لتغيير ترتيبها:"],
  ["première", "الأولى"],
  ["est toujours la photo principale.", "هي دائمًا الصورة الرئيسية."],
  ["PNG, JPG ou WEBP · 2,5 Mo max · 9 photos. La première photo s'affiche dans la boutique et sur les vignettes.",
    "PNG أو JPG أو WEBP · 2,5 ميغا كأقصى · 9 صور. الصورة الأولى تظهر في المتجر وفي المصغرات."],
  ["— facultatif : utile si un modèle coûte plus cher ou a moins de stock.",
    "— اختياري: مفيد إذا كان مقاس أغلى أو مخزونه أقل."],
  ["Mettre le stock exactement à la quantité saisie", "ضبط المخزون على الكمية المكتوبة تمامًا"],

  ["Affiché au client : « Livraison estimée : 2 à 4 jours ».", "يظهر للزبون: «التوصيل المقدر: 2 إلى 4 أيام»."],

  /* ---- transporteur : panneau technique ---- */
  ["EcoTrack (n'importe quel bureau)", "EcoTrack (أي مكتب)"],
  ["Seulement si tu choisis « Ecotrack (any tenant) ».", "فقط إن اخترت «Ecotrack (any tenant)»."],
  ["Les jetons partent vers dzship le temps de l'appel, puis restent chiffrés ici. dzship ne les garde pas.",
    "الرموز تُرسل إلى dzship مدة الاستدعاء، ثم تبقى مشفّرة هنا. dzship لا يحتفظ بها."],
  ["— déjà remplis pour ce transporteur, tu n'y touches que si ton bureau te donne d'autres chemins",
    "— معبّأة مسبقًا لهذه الشركة، لا تغيّرها إلا إذا أعطاك مكتبك مسارات أخرى"],
  ["Les jetons sont chiffrés en base (AES-256-GCM) et jamais renvoyés au navigateur.",
    "الرموز مشفّرة في قاعدة البيانات (AES-256-GCM) ولا تُرسل إلى المتصفح أبدًا."],
  ["Création du colis", "إنشاء الطرد"], ["Méthode", "الطريقة"], ["Chemin", "المسار"],
  ["Mode d'envoi des champs", "طريقة إرسال الحقول"],
  ["Formulaire URL-encodé", "استمارة مرمّزة URL"],
  ["Chemin du message d'erreur", "مسار رسالة الخطأ"],
  ["Corps de la requête (JSON)", "متن الطلب (JSON)"],
  ["Variables :", "المتغيرات:"],
  ["Pipeline d'appels (JSON)", "سلسلة الاستدعاءات (JSON)"],
  ["Laisser vide pour un seul appel. Chaque étape :", "اتركه فارغًا لاستدعاء واحد. كل خطوة:"],
  ["mémorise une valeur de la réponse pour les étapes suivantes.", "يحفظ قيمة من الرد للخطوات التالية."],
  ["Lecture de la réponse", "قراءة الرد"],
  ["Chemin du numéro de suivi", "مسار رقم التتبع"],
  ["Chemin du bordereau (PDF)", "مسار الوصل (PDF)"],
  ["Chemin des communes", "مسار البلديات"],
  ["Chemin du tableau des communes", "مسار جدول البلديات"],
  ["Laisser vide si la réponse est directement une liste", "اتركه فارغًا إذا كان الرد قائمة مباشرة"],
  ["Champ identifiant commune", "حقل معرّف البلدية"],
  ["Champ nom commune", "حقل اسم البلدية"],
  ["Suivi des colis", "تتبع الطرود"], ["Méthode du suivi", "طريقة التتبع"],
  ["Chemin du statut", "مسار الحالة"],
  ["est remplacé par le numéro", "يُستبدل برقم التتبع"],
  ["Champ du statut", "حقل الحالة"], ["Méthode des communes", "طريقة البلديات"],
  ["Bordereau", "الوصل"],
  ["Laisser vide si le bureau renvoie une URL dans la réponse de création",
    "اتركه فارغًا إذا أعاد المكتب رابطًا في رد الإنشاء"],
  ["Corps de la requête de bordereau (si POST)", "متن طلب الوصل (إن كان POST)"],
  ["Corps de la requête de suivi (pour les API en POST)", "متن طلب التتبع (للواجهات POST)"],
  ["Laisser vide pour un GET.", "اتركه فارغًا لـ GET."],
  ["y est remplacé.", "يُستبدل هناك."],
  ["Correspondance des statuts (JSON)", "مطابقة الحالات (JSON)"],
  ["À gauche le statut du transporteur, à droite le nôtre :", "على اليمين حالة شركة التوصيل، وعلى اليسار حالتنا:"],
  ["Transporteur actif", "شركة التوصيل مفعّلة"],
  ["Connecter ce transporteur", "ربط شركة التوصيل هذه"],
  ["Bureaux de livraison", "مكاتب التوصيل"],
  ["Connecte d'abord un transporteur pour importer ses bureaux.",
    "اربط شركة توصيل أولًا لاستيراد مكاتبها."],
  ["Aucun bureau importé", "لا مكتب مستورد"],
  ["Importe-les depuis l'API de ton transporteur, ou colle la liste à la main ci-dessous.",
    "استوردها من واجهة شركة التوصيل، أو الصق القائمة يدويًا أدناه."],
  ["Coller la liste à la main", "لصق القائمة يدويًا"],
  ["Liste des bureaux", "قائمة المكاتب"],
  ["Importer ces bureaux", "استيراد هذه المكاتب"],
  ["Derniers envois", "آخر الإرسالات"],
  ["Synchronisés automatiquement toutes les 10 minutes", "تُزامن تلقائيًا كل 10 دقائق"],
  ["Connecte un transporteur, puis ouvre une commande pour lui envoyer le colis.",
    "اربط شركة توصيل، ثم افتح طلبًا لإرسال الطرد إليها."],
]

/* Textes avec un nombre ou un nom : traduits par motif. */
const PATTERNS = [
  [/^sur (\d+) commande\(s\)$/, "على $1 طلب"],
  [/^Bonjour, (.+)$/, "مرحبًا، $1"],
  [/^(.+) — Tableau de bord$/, "$1 — لوحة التحكم"],
  [/^(.+) — Réglages$/, "$1 — الإعدادات"],
  [/^(.+) — Commandes$/, "$1 — الطلبات"],
  [/^(.+) — Produits$/, "$1 — المنتجات"],
  [/^Tout voir \((\d+)\)$/, "عرض الكل ($1)"],
  [/^(\d+) %$/, "$1 ب%"],
  [/^(\d+) % confirmées$/, "$1 % مؤكّدة"],
  [/^(\d+) commande\(s\) · (\d+) à appeler$/, "$1 طلب · $2 للاتصال"],
  [/^Mobile (\d+) %$/, "هاتف $1 %"],
  [/^Ordinateur (\d+) %$/, "حاسوب $1 %"],
  [/^([\d\s.,]+) DZD$/, "$1 دج"],
  [/^(\d+) en stock faible$/, "مخزون ضعيف: $1"],
  [/^(\d+) nouvelle\(s\)$/, "جديد: $1"],
  [/^(\d+) produit\(s\) dans votre boutique\.$/, "$1 منتج في متجرك."],
  [/^(\d+) commande\(s\)$/, "$1 طلب"],
  [/^Nouvelle commande (NDZ-[A-Z0-9]+)$/, "طلب جديد $1"],
  [/^(\d+) commande\(s\) à traiter$/, "$1 طلب للمعالجة"],
  [/^(\d+) panier\(s\) abandonné\(s\)$/, "$1 سلة متروكة"],
  [/^(\d+) relance\(s\) en attente$/, "$1 متابعة في الانتظار"],
  [/^(\d+) produit\(s\)$/, "$1 منتج"],
  [/^(\d+) produit\(s\) en stock faible ou rupture$/, "$1 منتج بمخزون ضعيف أو نافد"],
  [/^(\d+) avis en attente$/, "$1 تقييم في الانتظار"],
  [/^(\d+) référence\(s\)$/, "$1 مرجع"],
  [/^(\d+) ligne\(s\)$/, "$1 سطر"],
  [/^Voir les commandes (.+)$/, "عرض طلبات $1"],
  [/^Copier le numéro de commande (NDZ-[A-Z0-9]+)$/, "نسخ رقم الطلب $1"],
  [/^Écrire sur WhatsApp \((.+)\)$/, "الكتابة على واتساب ($1)"],
  [/^Injoignable, appel (\d+) sur (\d+)$/, "غير قابل للاتصال، مكالمة $1 من $2"],
  [/^Sous le seuil \((\d+)\)$/, "تحت الحد ($1)"],
  [/^Livraison ([\d\s.,]+) DZD$/, "التوصيل $1 دج"],
  [/^À préparer ([\d\s.,]+) DZD$/, "للتحضير $1 دج"],
  [/^Rembourser ([\d\s.,]+) DZD$/, "تعويض $1 دج"],
  [/^(\d+) modifier$/, "تعديل $1"],
  [/^(\d+) en attente de validation\.$/, "$1 في انتظار الموافقة."],
  [/^(\d+) compte\(s\) créé\(s\) dans la boutique\.$/, "$1 حساب في المتجر."],
  [/^(\d+) actif\(s\)$/, "$1 مفعّل"],
  [/^(\d+) % de réussite$/, "$1 % نجاح"],
  [/^([\d\s.,]+) DZD en jeu$/, "$1 دج في السلال"],
  [/^([\d\s.,]+) DZD encaissés$/, "$1 دج مُحصّلة"],
  [/^(\d+) panier\(s\) transformé\(s\)$/, "$1 سلة تحوّلت"],
  [/^(\d+) panier\(s\) abandonné\(s\)$/, "$1 سلة متروكة"],
  [/^(\d+) (?:en cours)$/, "$1 جارٍ"],
  [/^Délai minimum (.+)$/, "أدنى مدة $1"],
  [/^Délai maximum (.+)$/, "أقصى مدة $1"],
  [/^(\d+) = (\d+) DZD partout, à domicile\.$/, "$1 = $2 دج في كل مكان، إلى المنزل."],
  [/^ZR Express \(nouvelle plateforme\)$/, "ZR Express (منصة جديدة)"],
  [/^([\d.]+) dernier\(s\)$/, "$1 أخير"],
  [/^appel sans réponse \((\d+)\/(\d+)\)$/, "مكالمة بلا رد ($1/$2)"],
  [/^Un code de bienvenue de 10 % convertit souvent mieux qu'une remise affichée partout\.$/,
    "كود ترحيب بـ 10 % يحوّل أكثر من تخفيض معروض في كل مكان."],
  [/^Créez « À propos », « Livraison » ou « Conditions de vente » pour rassurer vos clients\.$/,
    "أنشئ «من نحن» أو «التوصيل» أو «شروط البيع» ليطمئن زبائنك."],
  [/^Thème actuel : (.+)$/, "القالب الحالي: $1"],
  [/^Voici l'activité de (.+)\.$/, "هذا نشاط $1."],
]

const MAP = new Map(WORDS)
const LOW = new Map(WORDS.map(([fr, ar]) => [fr.toLowerCase(), ar]))
/** Traduit une chaîne isolée (pour le JavaScript injecté). */
const t = (fr) => MAP.get(fr) || fr

/* En arabe, un montant « 23 300,00 » se coupe en deux et s'affiche
   « 300,00 23 ». On isole le nombre (U+2066 … U+2069) pour qu'il reste lu
   de gauche à droite, comme sur tous les sites arabes soignés. */
const iso = (t) => String(t || "").replace(/([0-9][0-9\u00A0 .,]*?)\s*دج/g, (m, n) => "\u2066" + n.trim() + "\u2069 دج")

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/* Le HTML rendu contient « &amp; », « &#39; » … : on teste aussi la version
   décodée, sinon une phrase avec une apostrophe ne serait jamais trouvée. */
/* Espaces invisibles et espaces insécables : les éditeurs en glissent partout,
   et « Enregistrer » n'est alors plus « Enregistrer ». On les ramène à un
   espace normal avant de chercher. */
const clean = (s) => String(s || "").replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00A0]/g, " ").replace(/\s+/g, " ")
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
const unescAr = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')

/** Traduction d'un texte isolé : le dictionnaire, puis les motifs.
 *  `sep` : « Toutes · 4 », « Commandes — Amina Mode »… on traduit chaque
 *  morceau séparément et on recolle, pour ne jamais toucher au nom du marchand. */
const one = (txt, depth) => {
  const s = clean(txt).trim()
  if (!s || s.length > 200) return ""
  const plain = unesc(s)
  if (MAP.has(plain)) return iso(MAP.get(plain))
  if (MAP.has(s)) return iso(MAP.get(s))
  if (s !== s.toLowerCase() && LOW.has(s.toLowerCase())) return LOW.get(s.toLowerCase())
  /* « Délai minimum Blida » : le mot change, la wilaya aussi. */
  const delai = /^Délai (minimum|maximum) (.+)$/.exec(s)
  if (delai) {
    const reste = MAP.get(delai[2]) || one(delai[2], (depth || 0) + 1) || delai[2]
    return iso((delai[1] === "minimum" ? "أدنى مدة " : "أقصى مدة ") + reste)
  }
  for (const [re, to] of PATTERNS) {
    if (re.test(s)) return iso(s.replace(re, to))
  }
  if ((depth || 0) < 2) {
    for (const sep of [" · ", " — "]) {
      if (!s.includes(sep)) continue
      const parts = s.split(sep)
      let hit = false
      const out = parts.map((x) => {
        const ar = one(x, (depth || 0) + 1)
        if (ar) { hit = true; return ar }
        return x
      })
      if (hit) return iso(out.join(sep))
    }
  }
  return ""
}
/** Traduit le HTML d'une page de la plateforme : jamais les <script> ni les <style>. */
const localize = (html) => {
  if (typeof html !== "string") return html
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/i)
  return parts
    .map((chunk, i) => {
      if (i % 2) return chunk
      /* 1. le texte entre deux balises */
      let out = chunk.replace(/>([^<>]+)</g, (m, txt) => {
        const ar = one(txt)
        if (!ar) return m
        const head = txt.match(/^\s*/)[0]
        const tail = txt.match(/\s*$/)[0]
        return ">" + head + ar + tail + "<"
      })
      /* 2. les libellés invisibles (infobulles, champs, lecteurs d'écran) */
      for (const a of ["placeholder", "title", "aria-label", "value", "alt"]) {
        out = out.replace(new RegExp(a + '="([^"]{2,200})"', "g"), (m, v) => {
          const ar = one(v)
          return ar ? a + '="' + ar + '"' : m
        })
      }
      return out
    })
    .join("")
}

/* ------------------------------------------------------------------ retour au français
   Une page de la boutique retouchée dans le Studio est enregistrée telle
   qu'elle s'affiche. Si le marchand travaille en arabe, les libellés de la
   plateforme (Panier, Commander, Récapitulatif…) seraient enregistrés en
   arabe — et resteraient en arabe quand il repasse en français. On remet donc
   ces libellés en français avant d'enregistrer : la page garde un seul
   contenu, et c'est l'affichage qui choisit la langue. */
const BACK = (() => {
  const m = new Map()
  for (const [fr, ar] of WORDS) if (!m.has(ar)) m.set(ar, fr)
  return m
})()
const unlocalize = (html) => {
  if (typeof html !== "string") return html
  const back = (txt) => {
    const t = clean(txt)
    if (!t) return ""
    /* la marque d'isolation des montants ne fait pas partie du texte */
    const bare = t.replace(/[\u2066-\u2069]/g, "")
    return BACK.get(bare) || BACK.get(t) || ""
  }
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/i)
  return parts
    .map((chunk, i) => {
      if (i % 2) return chunk
      let out = chunk.replace(/>([^<>]+)</g, (m, txt) => {
        const fr = back(txt)
        if (!fr) return m
        const head = txt.match(/^\s*/)[0]
        const tail = txt.match(/\s*$/)[0]
        return ">" + head + fr + tail + "<"
      })
      for (const a of ["placeholder", "title", "aria-label", "alt"]) {
        out = out.replace(new RegExp(a + '="([^"]{2,200})"', "g"), (m, v) => {
          const fr = back(v)
          return fr ? a + '="' + fr + '"' : m
        })
      }
      return out
    })
    .join("")
}

/* ------------------------------------------------------------------- habillage
   En arabe : écriture de droite à gauche, police Amiri (celle de la
   plateforme) et quelques repères remis du bon côté (menu, ombres, flèches). */
const CSS = `
html[dir="rtl"] .dash-side{border-right:0;border-left:1px solid var(--line,#e6e6e9)}
html[dir="rtl"] .dash-side nav a i{margin-left:0;margin-right:auto}
html[dir="rtl"] .dash-main{direction:rtl}
html[dir="rtl"] .kpi,html[dir="rtl"] .card,html[dir="rtl"] .box{text-align:right}
html[dir="rtl"] table th,html[dir="rtl"] table td{text-align:right}
html[dir="rtl"] .dash-store .dash-tile{margin-right:0;margin-left:10px}
html[dir="rtl"] .ndz-uilang{right:auto;left:16px}
.ndz-uilang{position:fixed;right:16px;bottom:16px;z-index:60;display:inline-flex;
  align-items:center;justify-content:center;min-width:44px;height:38px;padding:0 12px;
  border-radius:999px;background:#111;color:#fff;font:700 13px/1 system-ui,sans-serif;
  text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.22)}
.ndz-uilang:hover{background:#000}
html[dir="rtl"] body{font-family:'Amiri',serif}
`

/** La table envoyée au navigateur : les pages dessinées par du JavaScript
 *  (éditeur de design, formulaire, transporteurs) ne passent pas par le HTML
 *  du serveur. Même dictionnaire, appliqué après l'affichage. */
const table = () => ({
  words: WORDS,
  patterns: PATTERNS.map(([re, to]) => [re.source, "g", to]),
})

/* Le petit moteur côté navigateur : il traduit les textes et les libellés
   invisibles, puis surveille les ajouts (menus, lignes, fenêtres). */
const SCRIPT = String.raw`
(function () {
  var T = document.getElementById("ndz-ui-ar")
  if (!T) return
  var table = JSON.parse(T.textContent)
  var map = new Map(table.words)
  var LOW = new Map(table.words.map(function (w) { return [String(w[0]).toLowerCase(), w[1]] }))
  var pats = table.patterns.map(function (p) { return [new RegExp(p[0], p[1]), p[2]] })
  var skip = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1 }
  function iso(t) {
    return String(t || "").replace(/([0-9][0-9\u00A0 .,]*?)\s*دج/g, function (m, n) { return "\u2066" + n.trim() + "\u2069 دج" })
  }
  function one(s) {
    var v = String(s || "").replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00A0]/g, " ").replace(/\s+/g, " ").trim()
    if (!v || v.length > 200) return ""
    if (map.has(v)) return iso(map.get(v))
    /* un libellé passé en MAJUSCULES par le style : on cherche en minuscules */
    if (v !== v.toLowerCase()) {
      var hit = LOW.get(v.toLowerCase())
      if (hit) return iso(hit)
    }
    var cut = /^(.*\S)\s*·\s*(\d+)$/.exec(v)
    if (cut && map.has(cut[1])) return iso(map.get(cut[1]) + " · " + cut[2])
    for (var i = 0; i < pats.length; i++) if (pats[i][0].test(v)) return iso(v.replace(pats[i][0], pats[i][1]))
    return ""
  }
  function node(n) {
    var t = n.nodeValue
    if (!t || t.length > 220) return
    var ar = one(t)
    if (!ar) return
    var head = (t.match(/^\s*/) || [""])[0], tail = (t.match(/\s*$/) || [""])[0]
    n.nodeValue = head + ar + tail
  }
  function attrs(el) {
    if (!el.getAttribute) return
    ;["placeholder", "title", "aria-label"].forEach(function (a) {
      var v = el.getAttribute(a); if (!v) return
      var ar = one(v); if (ar) el.setAttribute(a, ar)
    })
    if (el.tagName === "INPUT" && (el.type === "submit" || el.type === "button")) {
      var ar2 = one(el.value); if (ar2) el.value = ar2
    }
  }
  function walk(root) {
    if (!root) return
    if (root.nodeType === 3) { node(root); return }
    if (root.nodeType !== 1) return
    if (skip[root.tagName]) return
    attrs(root)
    var it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n
    while ((n = it.nextNode())) {
      var p = n.parentNode
      if (p && !skip[p.tagName] && !p.isContentEditable) sure(node, n)
    }
    var els = root.querySelectorAll ? root.querySelectorAll("[placeholder],[title],[aria-label],input[type=submit],input[type=button]") : []
    for (var i = 0; i < els.length; i++) sure(attrs, els[i])
  }
  var busy = false, again = false
  function sure(fn, arg) { try { fn(arg) } catch (e) { if (window.console) console.warn("ndz-ar", e && e.message) } }
  function passe(ms) {
    ms.forEach(function (m) {
      if (m.type === "characterData") { sure(node, m.target); return }
      if (m.type === "attributes") { sure(attrs, m.target); return }
      for (var i = 0; i < m.addedNodes.length; i++) {
        var n = m.addedNodes[i]
        if (n.nodeType === 1 || n.nodeType === 3) sure(walk, n)
      }
    })
  }
  function start() {
    /* on surveille AVANT de traduire : si la première passe tombe sur un
       élément inattendu, les suivantes ne sont pas perdues. */
    new MutationObserver(function (ms) {
      /* une page qui se redessine (éditeur de design, transporteurs) envoie
         beaucoup de changements d'un coup : on ne perd rien, on repasse. */
      if (busy) { again = true; return }
      busy = true
      try { passe(ms) } finally { busy = false }
      if (again) { again = false; sure(walk, document.body) }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] })
    sure(walk, document.body)
    /* Certains écrans (l'éditeur de design) dessinent leur panneau après coup,
       sans que la page le signale. Quelques passes programmées, puis une passe
       à chaque clic : le marchand ne voit jamais de reste en français. */
    ;[300, 900, 1800, 3500, 6000].forEach(function (ms) { setTimeout(function () { sure(walk, document.body) }, ms) })
    var last = 0
    document.addEventListener("click", function () {
      var now = Date.now()
      if (now - last < 250) return
      last = now
      setTimeout(function () { sure(walk, document.body) }, 60)
    }, true)
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start)
  else start()
})()
`

/** Enveloppe une page de la plateforme. Ne fait rien en français. */
const wrap = (html) => {
  const lang = langNow()
  if (lang !== "ar") return html
  const req = I18N.current().req
  let out = html
  out = out.replace(/<html lang="fr">/i, '<html lang="ar" dir="rtl">')
  out = out.replace(/<\/head>/i, `<link rel="stylesheet" href="/arabic-fonts.css"><style>${CSS}</style></head>`)
  out = localize(out)
  const data = JSON.stringify(table()).replace(/</g, "\\u003c")
  out = out.replace(/<\/body>/i, `<script id="ndz-ui-ar" type="application/json">${data}</script><script>${SCRIPT}</script></body>`)
  const pill = switchHtml(req)
  if (pill) out = out.replace(/<\/body>/i, `${pill}</body>`)
  return out
}

module.exports = { LANGS, isLang, wanted, langNow, switchHtml, localize, unlocalize, wrap, table, WORDS, PATTERNS, t, CSS }
