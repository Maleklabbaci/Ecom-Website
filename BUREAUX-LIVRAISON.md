# Bureaux de livraison — ce que demande chaque transporteur

Vérifié contre la documentation publique des transporteurs (octobre 2026).

> Pour les **champs exigés à l'envoi d'une commande** (nom, prénom, téléphone, wilaya, commune,
> produits, montant, poids…), voir **`CHAMPS-ENVOI-COLIS.md`**.

Ce document est la référence du code : `src/carriers.js` (variables), `src/carriers-presets.js`
(corps envoyé à chaque API) et `src/views.js` (écrans marchand).

## L'idée en une phrase

Un bureau de retrait (stop desk) ne s'envoie **jamais de la même façon** selon le transporteur :
certains veulent un **identifiant** de bureau, d'autres seulement la **commune** du bureau,
d'autres n'ont **aucune** notion de bureau. Novadz applique la bonne méthode par famille.

## Tableau de référence

| Famille (préréglages) | Ce que l'API exige pour un colis au bureau | Identifiant de bureau | Ce que Novadz envoie | Liste des bureaux |
|---|---|---|---|---|
| **Yalidine** et ses marques blanches : Yalitec, Guepex, Economiqua, Easy & Speed | `is_stopdesk = 1` **et** `stopdesk_id` valide (le colis est refusé sans identifiant) | **oui**, `center_id` (ex. `BLD-01`) | `is_stopdesk = 1`, `stopdesk_id`, et la **commune forcée à celle du bureau** | `GET /v1/centers` (+ import manuel, 6ᵉ colonne) |
| **Famille EcoTrack** : EcoTrack, DHD, Conexlog, MSM Go, World Express, Anderson, Speed Delivery, Rex, Golivri, Areex, Prest | `stop_desk = 1` ; **aucun champ `stopdesk_id`** : c'est la **commune du bureau** qui désigne le bureau | **non** | `stop_desk = 1` + `commune` du bureau | l'API ne publie que les **communes desservies** (pas de bureaux nommés) |
| **Famille Procolis** : ZR Express (ancienne), Abex, Colilog, Flash, Leopard | `TypeLivraison` : **1 = bureau**, 0 = domicile. Aucun identifiant, aucune liste | **non** | `TypeLivraison = 1` | aucune API de liste |
| **ZR Express — nouvelle plateforme** (`api.zrexpress.app`) | `deliveryType: "pickup-point"` + **`hubId`** (refus si le hub est introuvable, jamais de repli domicile) | **oui**, `hubId` | `deliveryType`, `hubId` (préréglage `zrexpress-v2`, marqué *à vérifier*) | recherche de hubs à brancher |
| **NOEST** | `stop_desk = 1` + **`station_code`** (le chiffre du code est la wilaya, ex. `16A`) | **oui**, `station_code` | `stop_desk = 1`, `station_code` | API NOEST (nom, adresse, téléphone) |
| **Maystro** | `delivery_type` : **1 = domicile, 2 = bureau, 3 = point relais**. Aucun champ bureau | **non** (mais la commune doit être l'**ID numérique** Maystro) | `delivery_type = 2` + commune du bureau | approximation : la commune « centre » de chaque wilaya |
| **Custom (API maison)** | libre : le marchand écrit son corps | au choix | `{{stopDesk}}`, `{{deskId}}`, `{{deskName}}`, `{{deskCommune}}` | import manuel |

Légende de la colonne « identifiant » : **oui** = sans identifiant le transporteur refuse le colis au bureau.
**non** = le bureau s'exprime par la commune (ou le type de livraison).

## Variables disponibles dans un corps personnalisé

| Variable | Contenu | Exemple |
|---|---|---|
| `{{stopDesk}}` | `1` si retrait au bureau, `0` sinon | `1` |
| `{{deliveryType}}` | `stopdesk` ou `home` | `stopdesk` |
| `{{deliveryTypeNum}}` | `2` au bureau, `1` à domicile (format Maystro) | `2` |
| `{{deskId}}` | identifiant du bureau chez le transporteur | `BLD-01` |
| `{{deskName}}` | nom du bureau | `Agence Blida Centre` |
| `{{deskCommune}}` | commune du bureau | `Blida` |
| `{{deskAddress}}` | adresse du bureau | `12 rue des Frères` |

## Le parcours marchand

1. **Transporteur** → connecter le transporteur : un encart jaune rappelle, pour ce transporteur
   précis, ce qu'exige sa documentation et le chemin de sa liste de bureaux.
2. **Bureaux de livraison** → « Importer depuis l'API du transporteur », ou coller la liste :
   une ligne par bureau, séparée par `;` —
   `nom ; wilaya ; commune ; adresse ; téléphone ; identifiant`.
   La **6ᵉ colonne (identifiant)** est indispensable pour Yalidine, NOEST et ZR v2.
3. **Checkout** : le client choisit « à domicile » ou « au bureau » (deux tarifs), puis son bureau
   dans une liste filtrée par la wilaya choisie.
4. **Fiche commande** → « Bureau de retrait » reste modifiable ; l'envoi du colis transmet le bon
   champ selon la famille, et si le marchand ne choisit rien, on retombe sur le bureau saisi par le client.

## Ce qui reste ouvert (honnêtement)

- **Yalidine `/v1/centers`** : la pagination n'est pas gérée (on garde la première page). Wilaya d'origine
  du colis non transmise si le marchand ne la renseigne pas.
- **ZR nouvelle plateforme (`zrexpress-v2`)** : les chemins et le nom du paramètre de hub ne sont pas
  confirmés par un test réel — le préréglage est marqué *à vérifier* et le tenant/clé restent à saisir.
- **EcoTrack** : `centers_path` ne renvoie pas de bureaux nommés, seulement des communes desservies.
  Aucun picker « bureau nommé » n'est donc possible pour cette famille.
- **Procolis / Abex / Colilog / Flash / Leopard et Maystro** : aucune liste de bureaux à importer ;
  le choix se fait par commune.
- **Maystro** : la commune doit être l'identifiant numérique du transporteur ; la conversion
  nom → ID n'est pas automatique.
- **NOEST** : la validation en second appel (création puis `/valid/order`) n'est pas encore enchaînée.
