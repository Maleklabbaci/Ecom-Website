# NovaDZ — ce qu'il y a dedans

Résumé de la plateforme au 20 octobre 2026.
**10 809 lignes de JavaScript · 25 modules · 118 routes · 21 tables · 45 tests automatiques.**

C'est une plateforme multi-boutiques : plusieurs marchands, chacun avec sa boutique, son catalogue,
ses commandes. Node.js + Express + SQLite, sans dépendance externe lourde.

---

## 1. Côté marchand (tableau de bord)

| Écran | Ce qu'il permet |
|---|---|
| **Vue d'ensemble** | chiffre d'affaires, commandes du jour, produit qui marche |
| **Produits** | fiches produits, variantes, galerie, catégories, stock par variante |
| **Commandes** | liste, filtres, fiche détaillée, facture, bon de livraison, remboursement, export CSV |
| **Stock** | journal des mouvements, seuils d'alerte, export, valorisation |
| **Clients** | fiches, historique, montant dépensé |
| **Design** | éditeur de vitrine par sections, thèmes réellement différents, brouillon puis publication, versions |
| **Pages** | pages libres (CGV, à propos, contact) |
| **Landings** | pages de vente par produit, plusieurs offres (1/2/3 pièces), compte à rebours, avis |
| **Codes promo** | remises en pourcentage ou montant |
| **Avis clients** | modération avant publication |
| **Livraison** | tarifs par wilaya |
| **Transporteur** | connexion à n'importe quel bureau de livraison via API |
| **Statistiques livraison** | taux de livraison et montants par bureau et par wilaya |
| **Paniers abandonnés** | liste, montant en jeu, lien de récupération, relance en un clic |
| **Relances** | modèles de messages, mode manuel WhatsApp ou API, journal des envois |
| **Anti-fraude & pixels** | CAPTCHA, position, score de risque, liste noire, Meta/TikTok/Snapchat serveur |
| **Réglages** | nom, adresse, devise, thème, domaine |

---

## 2. Côté client (boutique publique)

- Vitrine avec **4 thèmes** réellement distincts (structure, pas juste des couleurs), sections
  réordonnables, responsive.
- Catalogue avec recherche, filtres, tri, SEO (données structurées, sitemap, balises Open Graph).
- Fiche produit : galerie, variantes, avis, stock en temps réel.
- **Panier** avec codes promo et calcul de livraison par wilaya.
- **Commande COD** : formulaire court, aucun compte obligatoire, anti-fausses commandes.
- **Pages de vente** (landings) par produit avec offres de quantité.
- Suivi de commande par référence, facture et bon de livraison en ligne.
- Compte client optionnel avec historique.
- Support multi-boutiques : chaque boutique a son adresse `/<boutique>`.

---

## 3. Anti-fausses commandes (le vrai différenciateur du marché algérien)

Le COD, c'est 95 % des ventes en Algérie — et un colis refusé coûte deux fois.

- **CAPTCHA** : reCAPTCHA v3 (invisible + score), v2 case à cocher, v2 invisible. Clés par boutique.
- **Position GPS** capturée au checkout et sur les landings.
- **Téléphone algérien** normalisé, mode strict, liste noire de numéros.
- **Score de risque** : doublon sous 15 minutes, rafale depuis une même IP, adresse trop courte,
  position absente, score CAPTCHA faible. Au-delà de 30 points → statut **à vérifier**.
- Rien n'est bloqué en silence : chaque commande garde ses motifs de risque, consultables.

---

## 4. Pixels serveur

Meta CAPI, TikTok Events API, Snapchat CAPI. Événements : ViewContent, AddToCart,
InitiateCheckout, Purchase. `event_id` partagé avec le navigateur pour éviter les doubles
comptages, téléphone haché en SHA-256, journal des envois avec code de réponse.

---

## 5. Transporteurs — n'importe quel bureau

Aucun transporteur codé en dur. Le marchand décrit sa connexion, le moteur l'exécute.
**24 préréglages** modifiables : Yalidine et ses clones (Guepex, Yalitec, Economiqua, Easy & Speed),
**DHD** et la famille EcoTrack (~82 bureaux : Conexlog, MSM Go, World Express, Anderson, Rex,
Golivri, Areex, Prest…), **ZR Express** (Procolis) + ABEX, Colilog, Flash, Leopard, **NOEST**, **Maystro**.

Le moteur gère les trois façons de parler de ces API :

| Mode | Qui |
|---|---|
| JSON dans le corps | Yalidine, ZR, Maystro |
| Query string dans l'URL | EcoTrack, DHD, NOEST |
| Pipeline de plusieurs appels | création + validation (EcoTrack, NOEST) |

Plus : jetons chiffrés (AES-256-GCM), conversion des 58 wilayas en codes, bordereau PDF récupéré
même quand le bureau renvoie des octets bruts, synchronisation des statuts toutes les 10 minutes,
retour de stock automatique sur « retourné » (une seule fois).

---

## 6. Détails qui évitent des ennuis

- **Références de commande uniques** (`NDZ-7KQ3XM` + index `UNIQUE(store_id, ref)`) — l'ancienne
  version pouvait afficher la mauvaise commande sur la page de suivi.
- **Isolation stricte par boutique** : un marchand ne voit jamais les données d'un autre.
- **Idempotence du stock** : un retour ne remet jamais le stock deux fois.
- **Panne d'un service externe ≠ commande cassée** : transporteur, pixel ou relance échouent
  proprement, sans casser la vente.
- **Journal** des erreurs et des requêtes lentes, consultable en admin.

---

## 7. Qualité

**45 tests automatiques** (`npm test`) qui démarrent un vrai serveur et vérifient le parcours réel :
connexion, catalogue, panier, commande, facture, stock, landings, CAPTCHA, pixels, transporteurs
(contre de faux bureaux imitant Yalidine, EcoTrack et Procolis), bordereau PDF, paniers abandonnés,
relances et statistiques.

---

## 8. Ce qui n'est pas encore là

| Manque | Effet |
|---|---|
| **Envoi automatique SMS / WhatsApp** | le schéma et l'écran sont prêts, il manque une API — le mode manuel WhatsApp fonctionne en attendant |
| **Webhooks transporteurs** | les statuts arrivent au mieux toutes les 10 minutes au lieu d'être instantanés |
| **Import produits CSV** | saisie manuelle uniquement |
| **Rôles et permissions** | un seul compte par boutique, pas d'agent de confirmation |
| **Facturation SaaS** | pas d'abonnement : la plateforme n'encaisse pas encore ses propres clients |
| **App mobile / livreur** | version web seulement |
| **Préréglages non validés** | 24 préréglages écrits d'après des sources publiques, aucun testé avec un vrai compte |

---

## 9. Lancer

```powershell
cd C:\chemin\vers\novadz-platform
npm install
npm start
```

Puis `http://localhost:4000`.
Comptes de démonstration : `demo@novadz.dz` / `demo1234` — `admin@novadz.dz` / `admin1234`.
