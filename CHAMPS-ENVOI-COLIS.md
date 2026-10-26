# Envoyer une commande au transporteur — la documentation complète

Ce fichier répond à une seule question : **quels champs faut-il remplir pour qu'une commande
soit acceptée par le transporteur, et où Novadz les prend-il ?**

Vérifié contre la documentation publique des transporteurs (octobre 2026).
Code concerné : `src/parcel-fields.js` (règles et nettoyage), `src/carriers.js` (variables),
`src/carriers-presets.js` (corps de requête), `src/views.js` (écrans).

Deux documents à lire ensemble :
- **ce fichier** : les champs exigés pour *envoyer* une commande ;
- **`BUREAUX-LIVRAISON.md`** : comment chaque transporteur traite un retrait en bureau.

---

## 1. Ce que Novadz remplit tout seul

| Champ | Ce que fait Novadz |
|---|---|
| Nom du client | Coupé en **prénom** + **nom** pour Yalidine (`firstname` / `familyname`), gardé entier pour les autres |
| Téléphone | Nettoyé : `+213 555 12 34 56`, `00213…`, `0555-12-34-56` → **`0555123456`**. Un numéro faux bloque l'envoi |
| Liste des produits | Générée depuis les articles : `Foulard en soie x2, Robe d'été x1`, **coupée à la limite exacte du transporteur** |
| Wilaya | Nom + code numérique (1 à 58) selon ce que demande l'API |
| Commune | Celle du client — ou **celle du bureau** quand c'est un retrait en bureau |
| Montant | Le total à encaisser (produits + livraison), modifiable commande par commande |
| Wilaya de départ | Celle réglée dans le transporteur, sinon celle de la boutique |
| Note | Nettoyée, ramenée à 200 caractères |

**Règle d'or** : une fiche incomplète **n'est jamais envoyée**. La fiche commande affiche la liste
des champs manquants et le bouton « Envoyer le colis » reste désactivé.

---

## 2. Yalidine — et ses marques blanches
*Yalidine, Yalitec, Guepex, Economiqua, Easy & Speed*

`POST /v1/parcels/` — en-têtes `X-API-ID` + `X-API-TOKEN` — **corps = tableau JSON `[…]`**.
La réponse est indexée par la référence : `{ "NDZ-ABC123": { "success": true, "tracking": "…" } }`.

| Champ | Obligatoire | Contenu | Variable Novadz |
|---|---|---|---|
| `order_id` | oui | ta référence de commande | `{{ref}}` |
| `from_wilaya_name` | **oui** | wilaya d'expédition (défaut Alger) | `{{fromWilaya}}` |
| `firstname` | oui | prénom | `{{firstName}}` |
| `familyname` | oui | nom | `{{lastName}}` |
| `contact_phone` | oui | téléphone | `{{phone}}` |
| `address` | oui | adresse de livraison | `{{addressLine}}` |
| `to_wilaya_name` | oui | wilaya du client | `{{wilaya}}` |
| `to_commune_name` | oui | commune (ou **commune du bureau**) | `{{commune}}` |
| `product_list` | oui | **150 caractères maximum** | `{{products}}` |
| `price` | oui | montant à encaisser (entier DZD) | `{{price}}` |
| `weight` | non | poids en kg | `{{weight}}` |
| `freeshipping` | non | livraison déjà payée | `{{freeShipping}}` |
| `is_stopdesk` | si bureau | 1 = retrait au bureau | `{{stopDesk}}` |
| `stopdesk_id` | **si bureau** | identifiant du bureau (`center_id`) | `{{deskId}}` |
| `do_insurance` / `declared_value` | non | assurance | `false` / `{{price}}` |
| `has_exchange` | non | échange | `false` |

Limites : `product_list` 150 caractères, dimensions maximales, poids ≤ limites Yalidine.
Liste des bureaux : `GET /v1/centers` (nom, adresse, téléphone par wilaya).

---

## 3. Famille EcoTrack
*EcoTrack, DHD (`platform.dhd-dz.com`), Conexlog (`app.conexlog-dz.com`), MSM Go, World Express,
Anderson Delivery, Speed Delivery, Rex Livraison, Golivri, Areex, Prest*

`POST /api/v1/create/order` — **les champs passent en query string, pas en JSON** — 1 seul jeton Bearer.
Le colis n'existe vraiment qu'après un **second appel** `POST /api/v1/valid/order`.

| Champ | Obligatoire | Contenu | Variable |
|---|---|---|---|
| `reference` | oui | ta référence | `{{ref}}` |
| `nom_client` | oui | nom complet | `{{fullName}}` |
| `telephone` | oui | téléphone | `{{phone}}` |
| `adresse` | oui | adresse | `{{addressLine}}` |
| `code_wilaya` | oui | code numérique | `{{wilayaCode}}` |
| `commune` | oui | commune (ou commune du bureau) | `{{commune}}` |
| `montant` | oui | **total** de la commande | `{{price}}` |
| `produit` | oui | **255 caractères max** | `{{products}}` |
| `type` | oui | `1` | — |
| `stop_desk` | si bureau | 1 = bureau (**aucun identifiant de bureau**) | `{{stopDesk}}` |
| `weight` | non | poids | `{{weight}}` |
| `remarque` | non | note au livreur | `{{note}}` |
| 2ᵉ appel | oui | `valid/order` : `tracking` + `ask_collection=1` | `{{tracking}}` |

Bureaux : l'API ne publie **aucun bureau nommé**, seulement les communes desservies (`/get/communes`).

---

## 4. Famille Procolis
*ZR Express (ancienne plateforme), ABEX Express, Colilog, Flash Delivery, Leopard Express*

`POST /add_colis` — en-têtes `token` + `key` — corps `{ "Colis": [ … ] }`.
**C'est toi qui fournis le numéro de suivi** (on utilise la référence de commande).
⚠️ Un refus peut arriver en **HTTP 200** : c'est `MessageRetour` qui parle (`"Good"` = accepté).

| Champ | Obligatoire | Contenu | Variable |
|---|---|---|---|
| `Tracking` | oui | numéro de suivi | `{{ref}}` |
| `TypeLivraison` | oui | **1 = bureau**, 0 = domicile | `{{stopDesk}}` |
| `TypeColis` | oui | `0` | — |
| `Confrimee` | oui | `1` (confirmer directement) | — |
| `Client` | oui | nom complet | `{{fullName}}` |
| `MobileA` | oui | mobile | `{{phone}}` |
| `MobileB` | non | second mobile | `""` |
| `Adresse` | oui | adresse | `{{addressLine}}` |
| `IDWilaya` | oui | code wilaya | `{{wilayaCode}}` |
| `Commune` | oui | commune | `{{commune}}` |
| `Total` | oui | **total** | `{{price}}` |
| `Produit` | oui | **250 caractères max** | `{{products}}` |
| `Note` | non | remarque | `{{note}}` |
| `id_Externe` / `Source` | oui | `{{ref}}` / `NovaDZ` | — |

Aucune liste de bureaux, aucun poids.

---

## 5. ZR Express — nouvelle plateforme (`api.zrexpress.app`)
*Préréglage `zrexpress-v2` — chemins encore à confirmer avec ton compte*

En-têtes `X-Api-Key` (Secret Key) + `X-Tenant` (UUID du tenant).

| Champ | Obligatoire | Contenu | Variable |
|---|---|---|---|
| `reference` | oui | ta référence | `{{ref}}` |
| `customer.name` | oui | nom | `{{fullName}}` |
| `customer.phone` | oui | téléphone | `{{phone}}` |
| `customer.address` | oui | adresse | `{{addressLine}}` |
| `destination.wilaya` | oui | wilaya | `{{wilayaCode}}` |
| `destination.commune` | oui | commune | `{{commune}}` |
| `deliveryType` | oui | **`pickup-point`** (bureau) ou `home` | `{{deliveryTypeZr}}` |
| `hubId` | **si pickup-point** | identifiant du hub — **refus si introuvable**, jamais de repli domicile | `{{deskId}}` |
| `amount` | oui | montant | `{{price}}` |
| `products` | oui | **100 caractères max** | `{{products}}` |

---

## 6. NOEST
*API propre (pas EcoTrack). Bearer + `user_guid` dans le corps.*

`POST /api/public/create/order` puis `POST /api/public/valid/order` (sinon le colis reste en brouillon).

| Champ | Obligatoire | Contenu | Variable |
|---|---|---|---|
| `api_token` | oui | jeton | `{{apiToken}}` |
| `user_guid` | oui | GUID | `{{userGuid}}` |
| `reference` | oui | ta référence | `{{ref}}` |
| `client` | oui | nom complet | `{{fullName}}` |
| `phone` | oui | téléphone | `{{phone}}` |
| `adresse` | oui | adresse | `{{addressLine}}` |
| `wilaya_id` | oui | wilaya | `{{wilayaCode}}` |
| `commune` | oui | commune | `{{commune}}` |
| `montant` | oui | **total** | `{{price}}` |
| `produit` | oui | **255 caractères max** | `{{products}}` |
| `type_id` | oui | toujours `1` | — |
| `stop_desk` | si bureau | 1 = bureau | `{{stopDesk}}` |
| `station_code` | **si bureau** | code du bureau, ex. `16A` (le chiffre = la wilaya) | `{{deskId}}` |
| `poids` | oui | **kilos entiers** (arrondi vers le bas, min 1) | `{{weightInt}}` |
| `remarque` | non | note | `{{note}}` |
| `can_open` | non | `1` | — |

Bureaux : liste officielle avec nom, adresse, téléphone.

---

## 7. Maystro
*`Authorization: Token <valeur>` — le mot « Token » est exigé, pas « Bearer ».*

`POST /orders/`

| Champ | Obligatoire | Contenu | Variable |
|---|---|---|---|
| `wilaya` | oui | code wilaya | `{{wilayaCode}}` |
| `commune` | oui | **identifiant numérique Maystro**, pas le nom | `{{communeId}}` |
| `destination_text` | oui | adresse | `{{addressLine}}` |
| `customer_phone` | oui | téléphone | `{{phone}}` |
| `customer_name` | oui | nom complet | `{{fullName}}` |
| `product_price` | oui | **total** | `{{price}}` |
| `delivery_type` | oui | **1 = domicile, 2 = bureau, 3 = point relais** | `{{deliveryTypeNum}}` |
| `products[]` | oui | `quantity` + `logistical_description` | `{{qty}}`, `{{products}}` |
| `note_to_driver` | non | note | `{{note}}` |
| `source` | oui | `4` | — |
| `external_order_id` | oui | ta référence | `{{ref}}` |

Pas de poids, pas de champ bureau. Une commune au nom de ville **bloque l'envoi** avec un message clair.

---

## 8. Transporteur maison (« Autre / API maison »)

Aucun champ n'est imposé : le marchand écrit son URL, ses en-têtes et son corps.
Variables disponibles :

`{{ref}}` · `{{firstName}}` · `{{lastName}}` · `{{fullName}}` · `{{phone}}` · `{{addressLine}}` ·
`{{wilaya}}` · `{{wilayaCode}}` · `{{commune}}` · `{{communeId}}` · `{{products}}` · `{{qty}}` ·
`{{price}}` · `{{weight}}` · `{{weightInt}}` · `{{stopDesk}}` · `{{deliveryType}}` ·
`{{deliveryTypeNum}}` · `{{deliveryTypeZr}}` · `{{deskId}}` · `{{deskName}}` · `{{deskCommune}}` ·
`{{deskAddress}}` · `{{freeShipping}}` · `{{note}}` · `{{fromWilaya}}` · `{{shopName}}` ·
`{{apiToken}}` · `{{userGuid}}`

---

## 9. Les 6 erreurs qui faisaient échouer un envoi (corrigées)

| Erreur | Ce qui se passait | Correction |
|---|---|---|
| Téléphone avec `+213` | refus « numéro invalide » | normalisé en `0XXXXXXXXX` |
| `product_list` trop long | refus Yalidine (150 car.) / ZR v2 (100) | coupé net à la limite, article par article |
| Nom en un seul mot | prénom = nom chez Yalidine | avertissement visible sur la fiche |
| Wilaya de départ vide | refus Yalidine | reprise du réglage, sinon wilaya de la boutique |
| Colis au bureau sans identifiant | refus Yalidine / NOEST / ZR v2 | envoi bloqué + « Bureau de retrait » réclamé |
| Commune en texte chez Maystro | refus Maystro | blocage + demande de l'identifiant numérique |

## 10. Comment vérifier toi-même

1. **Transporteur** → l'encart « Champs exigés pour envoyer une commande » liste, pour le
   transporteur connecté, chaque champ avec sa variable.
2. **Commandes** → ouvre une commande : le bloc **« Ce qui part chez … »** montre la valeur exacte
   qui sera transmise. S'il manque quelque chose, c'est écrit en rouge et le bouton est désactivé.
3. Envoie : le suivi revient sur la commande, avec le bordereau si le transporteur en fournit un.

## 11. Reste ouvert

- **Yalidine** : `product_list` est coupé à 150 caractères (choix assumé : mieux vaut un colis accepté
  qu'un refus) ; pagination de `/v1/centers` non gérée.
- **ZR v2 (`zrexpress-v2`)** : chemins et nom du paramètre de hub **non confirmés** → préréglage marqué
  « à vérifier ».
- **EcoTrack** : pas de bureau nommé côté API.
- **Maystro** : conversion nom de commune → identifiant numérique pas automatique.
- **NOEST** : la validation en second appel est décrite dans le préréglage mais pas encore
  enchaînée automatiquement à la création.
