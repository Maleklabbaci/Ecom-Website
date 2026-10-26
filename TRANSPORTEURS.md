# Connecter un bureau de livraison

Les sociétés passent par **[dzship](https://github.com/DZBuild-com/dzship)** (API gratuite,
`freeship.dzbuild.com`). Tableau de bord → Transporteur : tu choisis la société dans la liste
(Yalidine, ZR, Maystro, NOEST, EcoTrack…), tu colles tes jetons, tu testes. L'envoi et le suivi
utilisent le numéro que le bureau renvoie — pas la référence de commande.

Une ancienne connexion saisie à la main reste en place tant que tu ne l'enregistres pas comme
une société dzship.

```
Tableau de bord → Transporteur → tu choisis un préréglage → URL + jetons
→ « Tester la connexion » → « Récupérer les communes » → « Enregistrer »
```

Ensuite chaque commande affiche **Envoyer à <ton bureau>**. Le suivi se met à jour tout seul
toutes les 10 minutes.

---

## 1. Le problème réel : trois familles d'API, pas une

La plupart des plateformes e-commerce algériennes ne savent parler qu'à une seule. Voici ce que
j'ai trouvé en lisant les clients open-source qui parlent à ces bureaux — et ce que le moteur
gère maintenant :

| Famille | Bureaux | Comment ils parlent |
|---|---|---|
| **Yalidine & clones** | Yalidine, Guepex, Yalitec, Economiqua, Easy & Speed | POST d'un **tableau** JSON, en-têtes `X-API-ID` / `X-API-TOKEN`, réponse indexée par ta référence |
| **EcoTrack** | **DHD**, Conexlog, MSM Go, World Express, Anderson, Speed Delivery, Rex, Areev, Prest… **~82 bureaux** | POST en **query string** (pas de JSON !) puis **2ᵉ appel `/valid/order`** obligatoire |
| **Procolis** | **ZR Express** (ancienne plateforme), ABEX, Colilog, Flash, Leopard | POST d'un objet `{"Colis":[…]}` avec en-têtes `token` + `key`, échec renvoyé en **HTTP 200** |
| **NOEST** | NOEST Express | Bearer + `user_guid` **dans le corps**, création puis validation |
| **Maystro** | Maystro Delivery | Jeton brut, commune = identifiant numérique |

C'est pour ça que le moteur a trois modes d'envoi : `json`, `query`, `form`.

### Les deux pièges qui font échouer les intégrations

1. **DHD / EcoTrack n'acceptent pas de JSON.** Si tu envoies `{"montant": 5200}`, le bureau
   répond « unauthorized » ou crée un colis vide. Les champs doivent partir dans l'URL.
2. **Un colis créé n'est pas un colis expédié.** Chez EcoTrack et NOEST il faut un second appel
   `/valid/order`, sinon le colis reste en brouillon et ne sera **jamais** ramassé.

Le moteur gère les deux : `body_mode: "query"` et un **pipeline d'étapes** (`create_steps`).

---

## 2. Ce que tu remplis

| Champ | À quoi ça sert |
|---|---|
| URL de base | racine de l'API, sans slash final |
| Wilaya de départ | obligatoire chez Yalidine ; sinon déduite de ta boutique |
| En-tête 1 / 2 / 3 | nom + valeur (jeton, identifiant, `Bearer …`) |
| Méthode + chemin | où l'on poste le colis |
| Mode d'envoi | `json`, `query` (EcoTrack/DHD), `form` |
| Corps (JSON) | le format **de ton** bureau, avec des variables |
| Pipeline d'appels | pour enchaîner plusieurs appels (avancé) |
| Chemins de lecture | où trouver le numéro de suivi, le bordereau, l'erreur |
| Chemin des communes + chemin du tableau | liste des communes / points de retrait |
| Méthode + chemin + corps du suivi | certaines API veulent un POST pour lire un statut |
| Correspondance des statuts | traduit leur vocabulaire vers le nôtre |

### Variables disponibles

`{{ref}}` `{{firstName}}` `{{lastName}}` `{{fullName}}` `{{phone}}` `{{address}}` `{{addressLine}}`
`{{wilaya}}` `{{wilayaCode}}` `{{commune}}` `{{communeId}}` `{{products}}` `{{qty}}`
`{{price}}` `{{weight}}` `{{stopDesk}}` `{{deliveryType}}` `{{freeShipping}}` `{{note}}`
`{{fromWilaya}}` `{{apiToken}}` `{{userGuid}}`

`{{wilayaCode}}` convertit « Blida » en `9`, « Tizi Ouzou » en `15` — sur les 58 wilayas.
`{{apiToken}}` / `{{userGuid}}` réinjectent tes jetons **dans le corps** (NOEST l'exige).

### Statuts compris

`livree` → commande livrée · `expediee` → commande expédiée · `annulee` → annulée **+ retour du stock** (une seule fois).
Tout le reste est affiché tel quel sans toucher à la commande.

---

## 3. Les préréglages fournis (24)

| Préréglage | Ce qui est prérempli | État |
|---|---|---|
| Yalidine | URL, en-têtes, tableau `order_id/firstname/…`, `/histories/`, `/centers/` | structure confirmée |
| Guepex, Yalitec, Economiqua, Easy & Speed | mêmes champs que Yalidine | URL à confirmer |
| DHD Livraison | pipeline EcoTrack complet (create + valid) | structure confirmée, domaine à vérifier |
| EcoTrack générique | le même pipeline, tu colles `TON-BUREAU.ecotrack.dz` | à valider |
| Conexlog, MSM Go, World Express, Anderson, Speed Delivery, Rex, Golivri, Areex, Prest | idem EcoTrack | à valider |
| ZR Express (Procolis) | `token` + `key`, `/add_colis`, `/lire` | structure confirmée |
| ABEX, Colilog, Flash Delivery, Leopard Express | idem Procolis | structure confirmée |
| NOEST | Bearer + `user_guid`, create + valid, `/api/public/desks` | structure confirmée |
| Maystro | `/orders/`, jeton brut, statuts numériques (41 = livré) | structure confirmée |
| Autre / API maison | tout vide, prêt à décrire | — |

« Structure confirmée » = les chemins et les champs viennent d'une source publique (client
open-source ou doc officielle). **Ça ne veut pas dire que ça marche avec ton compte** : ton jeton,
ta wilaya, tes tarifs. D'où le bouton *Tester la connexion*.

**ZR Express, les deux plateformes :** l'ancienne (Procolis, `procolis.com/api_v1`) est prête.
La nouvelle (`api.zrexpress.app`) fonctionne autrement : il faut créer un client, chercher les
territoires (UUID), puis le colis — 4 à 5 appels. Le moteur sait le faire avec `create_steps`,
mais je ne l'ai **pas validé**. Si tu es sur la nouvelle plateforme, dis-le : je l'écris et on le
teste ensemble.

---

## 4. Exemples réels

### A. DHD / EcoTrack — query string + validation

```jsonc
{
  "base_url": "https://platform.dhd-dz.com/api/v1",
  "header1_name": "Authorization", "header1_value": "Bearer <ton jeton>",
  "create_body_mode": "query",
  "create_steps": [
    { "method": "POST", "path": "/create/order", "body_mode": "query",
      "body": { "reference": "{{ref}}", "nom_client": "{{fullName}}", "telephone": "{{phone}}",
                "adresse": "{{addressLine}}", "code_wilaya": "{{wilayaCode}}", "commune": "{{commune}}",
                "montant": "{{price}}", "produit": "{{products}}", "type": "1",
                "stop_desk": "{{stopDesk}}", "weight": "{{weight}}", "remarque": "{{note}}" },
      "capture": { "tracking": "tracking" }, "error_path": "message" },
    { "method": "POST", "path": "/valid/order", "body_mode": "query",
      "body": { "tracking": "{{tracking}}", "ask_collection": "1" }, "error_path": "message" }
  ],
  "resp_tracking_path": "tracking",
  "centers_path": "/get/communes", "center_id_field": "code_postal", "center_name_field": "nom",
  "status_path": "/get/trackings/info?trackings[]={tracking}",
  "status_state_field": "{tracking}.activity.0.status"
}
```

`capture` est la clé : l'étape 1 récupère le numéro de suivi, l'étape 2 le réutilise.

### B. ZR Express (Procolis) — échec en HTTP 200

```jsonc
{
  "base_url": "https://procolis.com/api_v1",
  "header1_name": "token", "header1_value": "<ton token>",
  "header2_name": "key",   "header2_value": "<ta clé>",
  "create_path": "/add_colis",
  "create_body": { "Colis": [{
    "Tracking": "{{ref}}", "TypeLivraison": "{{stopDesk}}", "Confrimee": "1",
    "Client": "{{fullName}}", "MobileA": "{{phone}}", "Adresse": "{{addressLine}}",
    "IDWilaya": "{{wilayaCode}}", "Commune": "{{commune}}", "Total": "{{price}}",
    "Produit": "{{products}}", "id_Externe": "{{ref}}"
  }] },
  "resp_tracking_path": "Colis.0.Tracking",
  "status_method": "POST", "status_path": "/lire",
  "status_body": { "Colis": [{ "Tracking": "{{tracking}}" }] },
  "status_state_field": "Colis.0.Situation"
}
```

Ici c'est **toi** qui choisis le numéro de suivi : le moteur envoie ta référence `NDZ-…`.

### C. Un bureau maison

```json
{ "reference": "{{ref}}", "nom": "{{fullName}}", "tel": "{{phone}}",
  "adresse": "{{addressLine}}", "wilaya": "{{wilayaCode}}", "montant": "{{price}}" }
```

---

## 5. Ce qui est protégé

- Jetons **chiffrés** en base (AES-256-GCM), jamais renvoyés au navigateur (`••••••`).
- **Isolation par boutique** (testé).
- **Panne du transporteur ≠ commande cassée** : aucune exception, un message lisible.
- **Pas de double envoi** d'un colis.
- **Pas de double retour de stock** : `releaseOrder` est idempotent.
- **Un refus en HTTP 200 est détecté** (Procolis) : pas de colis fantôme.

---

## 6. Fichiers

```
src/carriers/index.js           persistance, envoi, synchronisation
src/carriers/generic.js         moteur : json/query/form, pipeline, captures, suivi POST
src/carriers/presets.js         24 préréglages
src/wilayas.js                  les 58 wilayas → codes officiels
src/secrets.js                  AES-256-GCM
src/refs.js                     références de commande uniques
tests/carriers.test.js          9 tests (moteur, écran, isolation)
tests/carriers-families.test.js 8 tests (Yalidine / EcoTrack / Procolis)
```

`npm test` → **32/32**.
