# Lot A — Vendre plus (livré)

Quatre choses ajoutées, visibles tout de suite en boutique.

## 1. Prix barré + badge « Promo »
- Fiche produit → **Modifier le produit** → nouveau champ **« Prix barré »**.
- Si tu remplis (ex. 5500) et que le prix est 4500, la boutique affiche :
  **4 500 DZD** ~~5 500 DZD~~ **-18 %**.
- Le badge prend la couleur d'accent du thème. Champ vide = rien ne s'affiche.
- Ça marche sur la fiche **et** dans les listes de produits des 13 thèmes (le prix
  affiché est centralisé, donc aucun thème n'est oublié).

## 2. « Souvent achetés ensemble »
- Fiche produit → section **« Souvent achetés ensemble »** : coche jusqu'à 3 produits.
- En boutique, sous le bouton d'achat : le produit + les produits liés, le total, et un
  bouton **« Ajouter les N au panier »** qui remplit le panier en un clic.
- Démo : Robe d'été (id 1) propose Sac + Foulard ; Écouteurs propose Chargeur + Montre.

## 3. Stock bas
- Sous le bouton d'achat : **« Plus que 2 en stock »** (ou « Dernière pièce disponible »).
- Seuil réglable dans le Design (`stockAlert`, 5 par défaut), 0 = jamais afficher.
- Démo : la Montre connectée de Tech DZ est à 2 en stock.

## 4. Favoris
- Bouton **♡ Mes favoris** sur chaque fiche produit (devient **♥ Dans mes favoris**).
- Page **`/{boutique}/favoris`** : les produits enregistrés, avec « Ajouter au panier »
  et « Voir la fiche ».
- Tout vit dans le navigateur du client : pas de compte, pas de données envoyées.
- Pour mettre le lien dans le menu : Design → En-tête → + Nouveau lien → `/amina-mode/favoris`.

## Fichiers touchés
- `src/db.js` : colonnes `products.compare_cents`, `products.bundle_ids` (migration auto).
- `src/layouts.js` : `priceWithCompare`, `stockNote`, `bundleBlock`, `favButton`, `favPage`.
- `server.js` : champs produit (prix barré, pack), route `POST /{slug}/cart/bundle`, route `GET /{slug}/favoris`.
- `src/views.js` : champs du formulaire produit + sélection du pack.
- `src/sections.js` : réglage `stockAlert`.
- `src/seed.js` : démo avec un prix barré, un pack et un stock bas.
- `public/styles.css` : bloc 32 (promo, stock, pack, favoris).

## Vérifié
- `npm test` → **120 / 120** (5 nouveaux tests : prix barré, pack, ajout groupé,
  stock bas, favoris).
- En live sur `/amina-mode/p/1` : prix barré, badge -18 %, pack, bouton favori.
- `/amina-mode/favoris` → 200.

## Suite prévue
Lot C — Pilotage : page **Statistiques** (CA jour / 30 jours, panier moyen, taux de
confirmation, top produits, wilayas) + file **« à faire »** sur le tableau de bord.
Puis B (éditeur), puis D (perf + aperçu tablette).
