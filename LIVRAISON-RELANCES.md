# Livraison, paniers abandonnés, relances

Trois modules ajoutés : le bordereau PDF, la récupération des paniers abandonnés, et les
statistiques par transporteur. Aucune API externe n'est nécessaire pour démarrer — mais tout
est prêt pour en brancher une.

---

## 1. Bordereau PDF

### Le problème

Les bureaux ne renvoient pas tous l'étiquette de la même façon :

| Bureau | Ce qu'il renvoie |
|---|---|
| Yalidine, ZR Express, Maystro | une **URL** dans la réponse JSON |
| **DHD, EcoTrack, NOEST** | le **PDF brut** dans le corps de la réponse |

Avant, la plateforme ne stockait qu'une URL. Chez DHD et les ~82 bureaux EcoTrack, le bouton
« Bordereau » était donc vide : le PDF était jeté.

### Ce qui a changé

`src/carriers/generic.js → label()` détecte les octets `%PDF` et le moteur écrit le fichier
dans `data/labels/<boutique>/<commande>-<suivi>.pdf`. La route
`GET /dashboard/orders/:id/bordereau` sert le fichier, toujours sous contrôle de la boutique.

Réglage dans **Transporteur → Bordereau** :

| Champ | Exemple EcoTrack / DHD |
|---|---|
| Chemin du bordereau | `/get/order/label?tracking={tracking}` |
| Méthode | `GET` |
| Corps (si POST) | `{"tracking": "{{tracking}}"}` |

Yalidine et ZR n'ont rien à remplir : l'URL arrive avec la réponse de création.

**Un bordereau manquant n'annule jamais l'envoi** : le colis part, l'étiquette est simplement absente.

---

## 2. Paniers abandonnés

Le panier vivait uniquement dans la session HTTP. Dès que le visiteur fermait son navigateur,
tout disparaissait — impossible de le relancer.

Il est maintenant copié en base à chaque étape :

- ouverture du panier et du formulaire de commande ;
- chaque changement de quantité ;
- **quand le client tape son nom, son téléphone ou son adresse** — un petit script envoie ces
  champs (sans bloquer la saisie, 4 secondes minimum entre deux envois).

Un panier devient **abandonné** après le délai réglé (45 minutes par défaut), s'il contient des
articles et n'a pas donné lieu à une commande.

### Écran Paniers abandonnés

`Tableau de bord → Paniers abandonnés`

- nombre de paniers à relancer et **montant en jeu** ;
- taux de conversion des paniers ;
- montant récupéré après relance ;
- la liste, triée par montant décroissant : client, téléphone, articles, somme, dernière activité,
  nombre de relances déjà faites.

### Le lien de récupération

Chaque panier a un jeton. Le message contient un lien `/<boutique>/panier/<jeton>` qui **remet les
articles dans le panier du client** et l'envoie directement au panier. C'est ce qui transforme une
relance en commande.

### Le bouton Relancer

Un clic sur **Relancer** :

1. écrit le message dans le journal ;
2. ouvre WhatsApp avec le message déjà rempli (`wa.me`, numéro converti en `213…`) ;
3. incrémente le compteur de relances.

Pas d'API, pas de fournisseur, pas de compte à créer.

---

## 3. Relances : manuel maintenant, API quand tu veux

`Tableau de bord → Relances`

### Mode manuel (par défaut)

Le clic sur un lien WhatsApp ouvre l'application. Rien à configurer.

### Mode API

Le même message part tout seul. Tu colles :

| Champ | Exemple |
|---|---|
| URL de l'API | `https://api.mon-fournisseur.dz/send` |
| En-tête | `Authorization` |
| Valeur de l'en-tête | `Bearer …` (chiffrée en base) |
| Corps (JSON) | `{"to":"{{phone}}","message":"{{texte}}"}` |

Ça marche avec WhatsApp Cloud API, une passerelle SMS locale, Make, Zapier, n8n — n'importe quoi
qui accepte un POST JSON.

### Modèles de messages

Variables : `{{nom}}` `{{boutique}}` `{{articles}}` `{{total}}` `{{lien}}` pour les paniers,
`{{ref}}` `{{statut}}` pour le suivi de commande.

### Journal

Chaque message est conservé avec son destinataire, son contenu, son type et son état
(`pending`, `sent`, `failed`, `cancelled`), plus le code d'erreur du fournisseur le cas échéant.
Rien n'est jamais marqué « envoyé » sans l'être.

### Le job

Toutes les 10 minutes, la plateforme repère les paniers abandonnés et **prépare** la relance
(message en attente). En mode API, elles partent au passage suivant ou au clic sur
« Envoyer les messages en attente ».

---

## 4. Statistiques de livraison

`Tableau de bord → Statistiques livraison`

Ce que tu ne peux pas voir aujourd'hui : **quel bureau livre vraiment**.

| Vue | Question à laquelle elle répond |
|---|---|
| Par transporteur | envoyés, livrés, retours, en cours, **taux de livraison**, montant encaissé, montant perdu |
| Par wilaya | où tes colis se perdent, wilaya par wilaya |
| Délai moyen | combien d'heures jusqu'à la livraison |
| Verdict | « tel bureau livre 35 points de mieux que tel autre » — affiché seulement à partir de 3 colis par bureau, pour ne pas conclure sur du hasard |

Un colis retourné coûte deux fois : l'aller, puis le retour, plus le stock immobilisé. Ces
chiffres-là se discutent avec le bureau.

---

## 5. Fichiers

```
src/relance.js                  paniers, messages, liens wa.me, fournisseur d'API
src/stats.js                    taux de livraison par transporteur et par wilaya
src/carriers/generic.js         label() : PDF binaire ou URL, fillPath()
src/carriers/index.js           téléchargement et stockage du PDF, labelFile()
tests/relance.test.js           13 tests (dont un vrai PDF et un vrai POST d'API)
```

`npm test` → **45/45**.
