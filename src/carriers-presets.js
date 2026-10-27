"use strict"
/**
 * Préréglages transporteurs.
 *
 * Chaque préréglage est un POINT DE DÉPART modifiable : le marchand peut tout
 * changer à l'écran (URL, en-têtes, corps, chemins). Aucun n'est codé en dur
 * dans le moteur.
 *
 * `verified` dit ce qu'on sait vraiment :
 *   true  → structure des appels confirmée par une source publique (client
 *           open-source ou documentation officielle). Reste à valider avec TON compte.
 *   false → domaine ou format à confirmer auprès du bureau ; le bouton
 *           « Tester la connexion » te le dira en une seconde.
 */

/* ------------------------------------------------------------------ */
/* vocabulaire commun : libellés FR → statuts NovaDZ                    */
/* ------------------------------------------------------------------ */
const COMMON_STATUS_MAP = {
  livré: "livree", livree: "livree", "livraison effectuée": "livree",
  "livré partiellement": "livree", "colis livré": "livree", delivered: "livree",
  "sorti en livraison": "expediee", "en cours de livraison": "expediee",
  expédié: "expediee", expedie: "expediee", "en transit": "expediee",
  "prêt à expédier": "expediee", "en préparation": "expediee", shipped: "expediee",
  "retourné au vendeur": "annulee", "retour vers vendeur": "annulee",
  annulé: "annulee", annule: "annulee", "colis annulé": "annulee",
  "tentative échouée": "", "reporté": "", "en attente": "",
}

/* ------------------------------------------------------------------ */
/* 1. Famille Yalidine : Yalidine, Guepex, Yalitec, Economiqua…        */
/* ------------------------------------------------------------------ */
const yalidineBody = {
  order_id: "{{ref}}",
  from_wilaya_name: "{{fromWilaya}}",
  firstname: "{{firstName}}",
  familyname: "{{lastName}}",
  contact_phone: "{{phone}}",
  address: "{{addressLine}}",
  to_commune_name: "{{commune}}",
  to_wilaya_name: "{{wilaya}}",
  product_list: "{{products}}",
  price: "{{price}}",
  do_insurance: false,
  declared_value: "{{price}}",
  length: 1,
  width: 1,
  height: 1,
  weight: "{{weight}}",
  freeshipping: "{{freeShipping}}",
  is_stopdesk: "{{stopDesk}}",
  /* sans stopdesk_id, Yalidine refuse le colis : « لا يوجد مكتب استلام (Stop Desk) متاح ».
     La commune part aussi du bureau (voir buildVars) pour que l'id et la commune collent. */
  stopdesk_id: "{{deskId}}",
  has_exchange: false,
}

const yalidineFamily = (key, label, base, hint, verified) => ({
  key, label, hint, verified, family: "yalidine",
  config: {
    base_url: base,
    header1_name: "X-API-ID",
    header2_name: "X-API-TOKEN",
    header3_name: "",
    origin_wilaya: "",
    create_steps: "",
    create_method: "POST",
    create_path: "/parcels/",
    create_body_mode: "json",
    /* Yalidine attend un TABLEAU, et répond indexé par order_id :
       { "NDZ-ABC123": { success: true, tracking: "...", label: "..." } }
       d'où les chemins « {ref}.tracking ». */
    create_body: JSON.stringify([yalidineBody], null, 2),
    resp_tracking_path: "{ref}.tracking",
    resp_label_path: "{ref}.label",
    resp_error_path: "{ref}.message",
    resp_message_path: "{ref}.message",
    centers_path: "/centers/",
    centers_method: "GET",
    centers_list_path: "data",
    center_id_field: "center_id",
    center_name_field: "name",
    status_method: "GET",
    status_path: "/histories/?tracking={tracking}&page_size=20",
    status_body: "",
    status_state_field: "data.0.status",
    status_map: JSON.stringify({
      "livré": "livree", "livraison effectuée": "livree",
      "sorti en livraison": "expediee", "en cours de livraison": "expediee",
      "retourné au vendeur": "annulee", "retour vers vendeur": "annulee",
    }, null, 2),
  },
})

/* ------------------------------------------------------------------ */
/* 2. Famille EcoTrack : DHD, Conexlog, MSM Go + ~78 autres             */
/* ------------------------------------------------------------------ */
/**
 * EcoTrack n'accepte PAS de JSON : les champs partent en query string, et le
 * colis n'existe pour le transporteur qu'après un second appel /valid/order.
 * Aucun numéro de suivi n'est possible avant. D'où les deux étapes.
 */
const ecotrackConfig = (base) => ({
  base_url: base,
  header1_name: "Authorization",
  header2_name: "",
  header3_name: "",
  origin_wilaya: "",
  create_body_mode: "query",
  create_steps: JSON.stringify([
    {
      method: "POST",
      path: "/create/order",
      body_mode: "query",
      body: {
        reference: "{{ref}}",
        nom_client: "{{fullName}}",
        telephone: "{{phone}}",
        adresse: "{{addressLine}}",
        code_wilaya: "{{wilayaCode}}",
        commune: "{{commune}}",
        montant: "{{price}}",
        produit: "{{products}}",
        type: "1",
        /* EcoTrack n'a AUCUN identifiant de bureau : un colis au bureau se décrit
           par la commune du bureau + stop_desk = 1 (la commune est déjà remplacée). */
        stop_desk: "{{stopDesk}}",
        weight: "{{weight}}",
        remarque: "{{note}}",
      },
      capture: { tracking: "tracking" },
      error_path: "message",
    },
    {
      method: "POST",
      path: "/valid/order",
      body_mode: "query",
      body: { tracking: "{{tracking}}", ask_collection: "1" },
      error_path: "message",
    },
  ], null, 2),
  create_method: "POST",
  create_path: "/create/order",
  create_body: "{}",
  resp_tracking_path: "tracking",
  resp_label_path: "label",
  resp_error_path: "message",
  resp_message_path: "message",
  label_path: "/get/order/label?tracking={tracking}",
  label_method: "GET",
  label_body: "",
  centers_path: "/get/communes",
  centers_method: "GET",
  centers_list_path: "",
  center_id_field: "code_postal",
  center_name_field: "nom",
  status_method: "GET",
  status_path: "/get/trackings/info?trackings[]={tracking}",
  status_body: "",
  status_state_field: "{tracking}.activity.0.status",
  status_map: JSON.stringify({
    "livré": "livree", "livraison effectuée": "livree",
    "sorti en livraison": "expediee", "en cours de livraison": "expediee",
    "retourné au vendeur": "annulee", "retour vers vendeur": "annulee",
  }, null, 2),
})

const ecotrackFamily = (key, label, base, hint, verified) => ({
  key, label, hint, verified, family: "ecotrack",
  config: ecotrackConfig(base),
})

/* ------------------------------------------------------------------ */
/* 3. Procolis : ZR Express (ancienne plateforme), ABEX, Colilog…       */
/* ------------------------------------------------------------------ */
const procolisConfig = (base) => ({
  base_url: base,
  /* Procolis attend deux en-têtes nommés littéralement « token » et « key » */
  header1_name: "token",
  header2_name: "key",
  header3_name: "",
  origin_wilaya: "",
  create_method: "POST",
  create_path: "/add_colis",
  create_body_mode: "json",
  create_steps: "",
  /* C'est TOI qui choisis le numéro de suivi : on utilise la référence de commande */
  create_body: JSON.stringify({
    Colis: [{
      Tracking: "{{ref}}",
      /* Procolis : TypeLivraison = 1 pour un bureau, 0 pour le domicile.
         Cette plateforme ne publie AUCUNE liste de bureaux : le client choisit
         une commune, ZR affecte le bureau à l'arrivée. */
      TypeLivraison: "{{stopDesk}}",
      TypeColis: "0",
      Confrimee: "1",
      Client: "{{fullName}}",
      MobileA: "{{phone}}",
      MobileB: "",
      Adresse: "{{addressLine}}",
      IDWilaya: "{{wilayaCode}}",
      Commune: "{{commune}}",
      Total: "{{price}}",
      Note: "{{note}}",
      Produit: "{{products}}",
      id_Externe: "{{ref}}",
      Source: "NovaDZ",
    }],
  }, null, 2),
  resp_tracking_path: "Colis.0.Tracking",
  resp_label_path: "",
  resp_error_path: "Colis.0.MessageRetour",
  resp_message_path: "Colis.0.MessageRetour",
  centers_path: "",
  centers_method: "GET",
  centers_list_path: "",
  center_id_field: "id",
  center_name_field: "name",
  status_method: "POST",
  status_path: "/lire",
  status_body: JSON.stringify({ Colis: [{ Tracking: "{{tracking}}" }] }, null, 2),
  status_state_field: "Colis.0.Situation",
  status_map: JSON.stringify({
    "livré": "livree", "livree": "livree",
    "en cours de livraison": "expediee", "sorti en livraison": "expediee",
    "retourné": "annulee", "annulé": "annulee", "retour vers vendeur": "annulee",
  }, null, 2),
})

const procolisFamily = (key, label, base, hint, verified) => ({
  key, label, hint, verified, family: "procolis",
  config: procolisConfig(base),
})


/* ------------------------------------------------------------------ */
/* 3 bis. ZR Express — nouvelle plateforme (api.zrexpress.app)          */
/* ------------------------------------------------------------------ */
/**
 * Deux plateformes coexistent chez ZR : l'ancienne (Procolis, ci-dessus) et la
 * nouvelle, qui parle en UUID de territoire et attend :
 *   deliveryType: "home" | "pickup-point" + hubId (le bureau de retrait).
 * Les identifiants se lisent « Secret Key » + « Tenant ID » (un UUID).
 * Chemins exacts à confirmer avec ton compte : le bouton « Tester » le dit.
 */
const zrNewConfig = {
  base_url: "",
  header1_name: "X-Api-Key",
  header2_name: "X-Tenant",
  header3_name: "",
  header1_value_hint: "Secret Key (nouvelle plateforme ZR)",
  header2_value_hint: "Tenant ID (UUID)",
  origin_wilaya: "",
  create_steps: "",
  create_method: "POST",
  create_path: "/parcels",
  create_body_mode: "json",
  create_body: JSON.stringify({
    reference: "{{ref}}",
    customer: { name: "{{fullName}}", phone: "{{phone}}", address: "{{addressLine}}" },
    destination: { wilaya: "{{wilayaCode}}", commune: "{{commune}}" },
    /* « pickup-point » au bureau, « home » à domicile */
    deliveryType: "{{deliveryTypeZr}}",
    hubId: "{{deskId}}",
    amount: "{{price}}",
    products: "{{products}}",
    note: "{{note}}",
  }, null, 2),
  resp_tracking_path: "tracking",
  resp_label_path: "label",
  resp_error_path: "message",
  resp_message_path: "message",
  centers_path: "",
  centers_method: "GET",
  centers_list_path: "",
  center_id_field: "id",
  center_name_field: "name",
  status_method: "GET",
  status_path: "/parcels/{tracking}",
  status_body: "",
  status_state_field: "status",
  status_map: JSON.stringify({
    "livré": "livree", delivered: "livree",
    "en cours de livraison": "expediee", "prêt à expédier": "expediee",
    "retourné": "annulee", returned: "annulee",
  }, null, 2),
}

/* ------------------------------------------------------------------ */
/* 4. NOEST                                                            */
/* ------------------------------------------------------------------ */
const noestConfig = {
  base_url: "https://app.noest-dz.com",
  header1_name: "Authorization",
  header2_name: "",
  header3_name: "",
  origin_wilaya: "",
  create_steps: JSON.stringify([
    {
      method: "POST",
      path: "/api/public/create/order",
      body_mode: "json",
      body: {
        api_token: "{{apiToken}}",
        user_guid: "{{userGuid}}",
        reference: "{{ref}}",
        client: "{{fullName}}",
        phone: "{{phone}}",
        adresse: "{{addressLine}}",
        wilaya_id: "{{wilayaCode}}",
        commune: "{{commune}}",
        montant: "{{price}}",
        produit: "{{products}}",
        type_id: 1,
        /* NOEST attend le code du bureau, ex. « 16A » (le numéro = la wilaya) */
        stop_desk: "{{stopDesk}}",
        station_code: "{{deskId}}",
        /* NOEST n'accepte que des kilos entiers (arrondi vers le bas) */
        poids: "{{weightInt}}",
        remarque: "{{note}}",
      },
      capture: { tracking: "tracking" },
      error_path: "message",
    },
    {
      method: "POST",
      path: "/api/public/valid/order",
      body_mode: "json",
      body: { api_token: "{{apiToken}}", user_guid: "{{userGuid}}", tracking: "{{tracking}}" },
      error_path: "message",
    },
  ], null, 2),
  create_method: "POST",
  create_path: "/api/public/create/order",
  create_body: "{}",
  create_body_mode: "json",
  resp_tracking_path: "tracking",
  resp_label_path: "label",
  resp_error_path: "message",
  resp_message_path: "message",
  label_path: "/api/public/get/order/label?tracking={tracking}&api_token={{apiToken}}&user_guid={{userGuid}}",
  label_method: "GET",
  label_body: "",
  centers_path: "/api/public/desks",
  centers_method: "GET",
  centers_list_path: "",
  center_id_field: "code",
  center_name_field: "name",
  status_method: "POST",
  status_path: "/api/public/get/trackings/info",
  status_body: JSON.stringify({
    api_token: "{{apiToken}}",
    user_guid: "{{userGuid}}",
    trackings: ["{{tracking}}"],
  }, null, 2),
  status_state_field: "{tracking}.activity.0.status",
  status_map: JSON.stringify({
    "livré": "livree", "livraison effectuée": "livree",
    "sorti en livraison": "expediee", "en cours de livraison": "expediee",
    "retourné au vendeur": "annulee",
  }, null, 2),
}

/* ------------------------------------------------------------------ */
/* 5. Maystro                                                          */
/* ------------------------------------------------------------------ */
const maystroConfig = {
  base_url: "https://b.maystro-delivery.com/api",
  /* le jeton part brut, sans le mot « Bearer » */
  header1_name: "Authorization",
  header1_value_hint: "ton jeton Maystro, tel quel",
  header2_name: "",
  header3_name: "",
  origin_wilaya: "",
  create_steps: "",
  create_method: "POST",
  create_path: "/orders/",
  create_body_mode: "json",
  create_body: JSON.stringify({
    wilaya: "{{wilayaCode}}",
    commune: "{{communeId}}",
    destination_text: "{{addressLine}}",
    customer_phone: "{{phone}}",
    customer_name: "{{fullName}}",
    product_price: "{{price}}",
    /* 1 = domicile, 2 = bureau, 3 = point relais (et non 1/0) */
    delivery_type: "{{deliveryTypeNum}}",
    express: false,
    note_to_driver: "{{note}}",
    products: [{ quantity: "{{qty}}", logistical_description: "{{products}}" }],
    source: 4,
    external_order_id: "{{ref}}",
  }, null, 2),
  resp_tracking_path: "id",
  resp_label_path: "display_id",
  resp_error_path: "message",
  resp_message_path: "message",
  centers_path: "",
  centers_method: "GET",
  centers_list_path: "",
  center_id_field: "id",
  center_name_field: "name",
  status_method: "GET",
  status_path: "/orders/history_order/{tracking}",
  status_body: "",
  status_state_field: "results.0.status",
  status_map: JSON.stringify({
    "41": "livree", "31": "expediee", "9": "expediee",
    "50": "annulee", "53": "annulee",
  }, null, 2),
}

/* ------------------------------------------------------------------ */
/* liste                                                               */
/* ------------------------------------------------------------------ */
const presets = [
  yalidineFamily("yalidine", "Yalidine", "https://api.yalidine.app/v1",
    "En-têtes X-API-ID / X-API-TOKEN. Renseigne ta wilaya de départ, Yalidine l'exige.", true),
  yalidineFamily("guepex", "Guepex", "https://api.guepex.app/v1",
    "Famille Yalidine : mêmes champs. L'URL exacte de l'API t'est donnée par Guepex.", false),
  yalidineFamily("yalitec", "Yalitec", "https://api.yalitec.com/v1",
    "Famille Yalidine : mêmes champs. Confirme l'URL avec ton compte Yalitec.", false),
  yalidineFamily("economiqua", "Economiqua", "",
    "Famille Yalidine. Colle l'URL fournie par Economiqua, le reste est déjà rempli.", false),
  yalidineFamily("easyspeed", "Easy & Speed", "",
    "Famille Yalidine. Colle l'URL fournie par Easy & Speed.", false),

  ecotrackFamily("ecotrack", "EcoTrack (bureau générique)", "https://TON-BUREAU.ecotrack.dz/api/v1",
    "Remplace TON-BUREAU par le sous-domaine de ton bureau. Un seul jeton (Bearer).", false),
  ecotrackFamily("dhd", "DHD Livraison", "https://platform.dhd-dz.com/api/v1",
    "DHD tourne sur EcoTrack : un seul jeton. Si l'URL refuse, essaie https://TON-BUREAU.ecotrack.dz/api/v1.", false),
  ecotrackFamily("conexlog", "Conexlog", "https://app.conexlog-dz.com/api/v1",
    "EcoTrack : un seul jeton. URL à confirmer avec ton compte Conexlog.", false),
  ecotrackFamily("msmgo", "MSM Go", "https://msmgo.ecotrack.dz/api/v1",
    "EcoTrack : un seul jeton.", false),
  ecotrackFamily("worldexpress", "World Express", "https://worldexpress.ecotrack.dz/api/v1",
    "EcoTrack : un seul jeton.", false),
  ecotrackFamily("andersondelivery", "Anderson Delivery", "https://anderson.ecotrack.dz/api/v1",
    "EcoTrack : un seul jeton.", false),
  ecotrackFamily("speeddelivery", "Speed Delivery", "https://speeddelivery.ecotrack.dz/api/v1",
    "EcoTrack : un seul jeton.", false),
  ecotrackFamily("rexlivraison", "Rex Livraison", "https://rex.ecotrack.dz/api/v1",
    "EcoTrack : un seul jeton.", false),
  ecotrackFamily("golivri", "Golivri", "https://golivri.ecotrack.dz/api/v1",
    "EcoTrack : un seul jeton.", false),
  ecotrackFamily("areex", "Areex", "https://areex.ecotrack.dz/api/v1",
    "EcoTrack : un seul jeton.", false),
  ecotrackFamily("prest", "Prest", "https://prest.ecotrack.dz/api/v1",
    "EcoTrack : un seul jeton.", false),

  procolisFamily("zrexpress", "ZR Express (Procolis)", "https://procolis.com/api_v1",
    "Ancienne plateforme ZR : en-têtes « token » et « key ». Le numéro de suivi est ta référence de commande.", true),
  procolisFamily("abexexpress", "ABEX Express", "https://procolis.com/api_v1",
    "Plateforme Procolis (comme ZR legacy) : token + key.", true),
  procolisFamily("colilog", "Colilog", "https://procolis.com/api_v1",
    "Plateforme Procolis : token + key.", true),
  procolisFamily("flashdelivery", "Flash Delivery", "https://procolis.com/api_v1",
    "Plateforme Procolis : token + key.", true),
  procolisFamily("leopardexpress", "Leopard Express", "https://procolis.com/api_v1",
    "Plateforme Procolis : token + key.", true),
  {
    key: "zrexpress-v2",
    label: "ZR Express (nouvelle plateforme)",
    hint: "Secret Key + Tenant ID (UUID). Le bureau se choisit par hubId (« pickup-point »). Colle l'URL de base de ton compte : api.zrexpress.app/v1 selon la doc ZR.",
    verified: false,
    family: "zr-new",
    config: zrNewConfig,
  },

  { key: "noest", label: "NOEST Express", hint: "Bearer + user_guid. Deux appels : création puis validation.", verified: true, family: "noest", config: noestConfig },
  { key: "maystro", label: "Maystro Delivery", hint: "Jeton brut. La commune doit être l'identifiant numérique Maystro.", verified: true, family: "maystro", config: maystroConfig },

  {
    key: "custom",
    label: "Autre / API maison",
    hint: "N'importe quel bureau avec une API HTTP. Tu décris les appels et les réponses toi-même.",
    verified: false,
    family: "custom",
    config: {
      base_url: "", header1_name: "Authorization", header2_name: "", header3_name: "",
      origin_wilaya: "", create_steps: "", create_method: "POST", create_path: "/parcels",
      create_body_mode: "json",
      create_body: JSON.stringify({
        reference: "{{ref}}", nom: "{{fullName}}", telephone: "{{phone}}",
        adresse: "{{addressLine}}", wilaya: "{{wilayaCode}}", commune: "{{commune}}",
        montant: "{{price}}", produit: "{{products}}", stop_desk: "{{stopDesk}}",
      }, null, 2),
      resp_tracking_path: "tracking", resp_label_path: "label",
      resp_error_path: "message", resp_message_path: "message",
      centers_path: "", centers_method: "GET", centers_list_path: "",
      center_id_field: "id", center_name_field: "name",
      status_method: "GET", status_path: "/parcels/{tracking}", status_body: "",
      status_state_field: "status",
      status_map: JSON.stringify({ "livré": "livree", "expédié": "expediee", "retourné": "annulee" }, null, 2),
    },
  },
]

const byKey = (key) => presets.find((p) => p.key === key) || presets[presets.length - 1]

module.exports = { presets, byKey, COMMON_STATUS_MAP }
