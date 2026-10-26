# Aujourd'hui — stock, cartes, recherche, statistiques

## 1. Page Stock remise d'aplomb
Le tableau `Stock` avait des contrôles empilés (champs au-dessus, bouton en dessous,
`+ / −` et motif qui débordaient). Nouvelle ligne d'ajustement, sur une seule ligne :

`[ − ] [ 1 ] [ + ]   [ Réassort ▾ ]   [ Définir ]`

- **−** retire la quantité saisie, **+** l'ajoute, **Définir** met le stock exactement
  à cette valeur. Plus de menu « mode » à deviner.
- Le bouton « Appliquer » a disparu : chaque bouton agit directement.
- Le libellé « Prévenir quand le stock atteint » ne passe plus par-dessus son bouton
  (formulaires en ligne réalignés : libellé au-dessus du champ, bouton à droite).

## 2. Style de carte produit (accueil)
Design → onglet **Thème** → **Cartes de produit** :

- **Classique** — image + texte, rien autour
- **Carte blanche** — fond blanc, bordure douce, arrondis
- **Image détachée** — image avec ombre portée
- **Encadrée** — trait net 1,5 px
- **Compacte** — petite image à gauche, texte à droite

Ça s'applique aux grilles de produits de la page d'accueil et au catalogue.

## 3. Recherche dans la boutique
Design → onglet **Thème** → **Recherche** :

- **Emplacement** : masquée · dans l'en-tête · sous l'en-tête · icône (+ superposition
  plein écran façon Shopify). Le marchand choisit, tout est appliqué aux 13 thèmes.
- **Texte d'aide** libre (« Trouver une pièce », « Chercher un produit »…).
- Le mot-clé **filtre vraiment** : `/amina-mode?q=robe` ne renvoie que les produits
  dont le titre ou la description contient « robe ». Le tri et les catégories restent
  combinables (`?q=sac&sort=prix-asc`).

## 4. Page Statistiques
`/dashboard/stats` (menu Ventes → Statistiques) :

- CA **aujourd'hui / 7 jours / 30 jours**, panier moyen ;
- **taux de confirmation**, commandes livrées, annulées (exclues du CA), visites 30 j
  et **conversion** ;
- **graphe** des 14 derniers jours (une barre par jour, montant au survol) ;
- **meilleures ventes** (unités + montant) et **wilayas** qui commandent.

## Vérifié
- `npm test` → **125 / 125** (5 nouveaux tests : ajustement de stock, style de carte,
  emplacements de recherche, mot-clé filtrant, page statistiques).
- En live : `/dashboard/stats` 200 avec graphe et classements, `/dashboard/stock` 200
  avec les nouveaux contrôles, `?q=robe` → 1 produit, `?q=xyzabc` → 0.

## Suite prévue
Lot B (éditeur : édition du texte dans l'aperçu, variantes de style par section,
duplication entre pages) puis Lot D (WebP + lazy, aperçu tablette).
