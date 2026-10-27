# Design — vérification point par point

Tout ce qui suit est déjà en place dans le dépôt (`novadz-repo-final`) et vérifié par les
tests (`npm test` → **146/146**) et par des appels HTTP réels sur la démo.

| # | Ce que tu demandais | Où ça se passe | État |
|---|---|---|---|
| 1 | Plus de thèmes, grande variété | `/dashboard/design` → onglet **Thème** (ou `/dashboard/design/themes`) | **13 modèles** |
| 2 | Modifier le code (CSS / HTML) | onglet **Code** | fait |
| 3 | « Open modif » | les 6 onglets + éditeur de blocs dans l'aperçu | fait — nav supprimable, alignement libre |
| 4 | Modifier toutes les pages | **liste de pages** en haut de l'aperçu (`#edPageSelect`) + onglet **Pages** | fait — blocs ajoutables sur chaque page |
| 5 | Boutons de paiement directs | **Thème** → mode d'achat + page `/dashboard/paiement` | fait |
| 6 | Pouvoir supprimer le panier | **En-tête** → case « Lien Panier » + mode d'achat « Achat direct » | fait |
| 7 | Interface du design refaite | nouvel éditeur à 6 onglets, panneau aéré | fait |
| 8 | Couleur libre, barre d'en-tête, logo, taille logo, taille texte | onglet **Thème** | fait |

---

## 1. Les 13 thèmes
`/dashboard/design` → onglet **Thème** → *Changer de modèle*.

Boutique · Magazine · Vitrine · Solo · Galerie · Bento · Zen · Vente directe · Tech · Marché ·
Catalogue · **Mosaïque** *(nouveau)* · **Noir** *(nouveau)*.

Les deux nouveaux changent vraiment la mise en page :
- **Mosaïque** : grille de tuiles inégales, une grande pièce à la une, tuile « service », tuile
  marque — pour les accessoires et le high-tech.
- **Noir** : fond sombre, très grands titres, photo plein cadre, bouton d'achat clair — pour la
  mode, les bijoux, le parfum.

Chaque modèle a sa vignette dans le sélecteur, et chaque modèle rend l'accueil **et** la fiche
produit sans erreur (test automatique sur les 13).

## 2. Modifier le code
Onglet **Code** :
- CSS de toute la boutique ;
- CSS **page par page** (bouton « CSS de cette page » à côté de la liste des pages) ;
- HTML dans le `<head>` (pixels, vérification de domaine) ;
- HTML en bas de page ;
- remplacements de textes (FR/AR).

Publier → le code part en ligne ; l'aperçu le montre tout de suite.

## 3. « Open modif »
- Clic sur un bloc dans l'aperçu → son panneau s'ouvre.
- Clic sur la **barre de navigation** → panneau de la barre.
- Ajouter / supprimer des sections, réordonner, dupliquer, masquer.
- Chaque champ modifiable est écrit dans le brouillon puis publié avec **Publier**.

## 4. Toutes les pages
En haut de l'aperçu, la liste **Page** :
Accueil · Fiche produit · Panier · Page de commande · CGV / mentions légales · Compte client ·
**+ chaque page CMS** de la boutique (À propos, Contact, …).

On choisit → l'aperçu s'ouvre sur cette page (`?preview=1&editor=1`), l'onglet **Pages** se
positionne sur la bonne page, et le bouton **CSS de cette page** écrit uniquement pour elle.

La page de commande s'affiche même avec un panier vide (un produit d'exemple) pour pouvoir la
mettre en forme.

## 5. Boutons de paiement directs
- **Page produit** : mode d'achat → *Panier seulement* / *Achat direct* / *Les deux*.
  En « les deux », deux boutons : **Ajouter au panier** et **Acheter maintenant**
  (ce dernier saute le panier et va droit à la commande : `POST /{slug}/direct`).
- **Tunnel** : moyens de paiement activés sur `/dashboard/paiement` (COD, CCP/BaridiMob,
  virement, Stripe…). Seuls ceux cochés s'affichent, dans l'ordre choisi, avec les frais
  éventuels (« +200 DZD à la livraison »).

## 6. Supprimer le panier
Deux niveaux, cumulables :
1. **Mode d'achat « Achat direct »** → plus aucun bouton panier, les boutons mènent à la commande.
2. **Onglet En-tête → case « Lien Panier dans l'en-tête » décochée** → le lien panier disparaît
   de la barre **et de la vraie vitrine** (pas seulement dans l'aperçu).

## 7. Interface du design (refaite)
- Barre du haut : retour, annuler/rétablir, liste des pages, aperçu mobile/bureau, enregistrer,
  publier.
- Panneau de droite à 6 onglets : **Sections · En-tête · Thème · Pages · Code · Textes**.
- Aperçu cliquable au centre, sans chevauchement de texte, arrondis partout, un seul accent.

## 8. Couleur, barre, logo, tailles
Onglet **Thème** :
- fond, texte, **couleur d'accent** libres (+ 6 pastilles prêtes) ;
- **barre d'en-tête** : style (plein / filet / transparent / flottant), hauteur, alignement ;
- **logo** : envoi d'image, **taille du logo** (curseur), ou nom en texte ;
- **taille du texte** (curseur), graisse, interlettrage, largeur du contenu, arrondi général ;
- police (Inter, Estedad, système), mode bilingue FR/AR.

Le tout s'applique en direct dans l'aperçu (`--s-accent`, `--s-logo`, `--s-text`…).

---

## Vérifications faites

```
npm test                      → 115 / 115
/dashboard/design             → 200
/{slug}?preview=1&editor=1    → 200
/{slug}/p/:id?preview=1       → 200
/{slug}/cart?preview=1        → 200
/{slug}/checkout?preview=1    → 200   (même panier vide)
/{slug}/legal?preview=1       → 200
/{slug}/account?preview=1     → 200
/{slug}/page/a-propos?preview=1 → 200
13 modèles : accueil + fiche produit → 200 pour chacun
```

---

## Corrigé le 20/10 — les 4 limites que tu as pointées

### a) Supprimer « Boutique » de la barre (vraiment)
Avant, `readNav` remettait « Boutique » dès que la liste était vide, et l'éditeur aussi.
Maintenant : **onglet En-tête → Barre de navigation → ✕ sur chaque lien**. Si tu vides la liste,
elle reste vide. Vérifié par test (`navigation : on peut supprimer « Boutique »`).

### b) La barre de recherche
Onglet **Thème → Recherche** :
- **Emplacement** : masquée / dans l'en-tête / sous l'en-tête / icône + superposition ;
- **Alignement** *(nouveau)* : à gauche, au centre, à droite ;
- **Texte d'aide** (le placeholder).

L'alignement est une vraie règle CSS (`.slot-gauche/.slot-centre/.slot-droite`), pas un texte
d'exemple.

### c) Aligner les textes où tu veux
Deux niveaux :
1. **Global** : onglet **Thème → Texte → Alignement** (thème / gauche / centre / droite / justifié).
2. **Section par section** : onglet **Sections** → ouvre une section → sélecteur **Alignement**
   en haut de son panneau (Thème / Gauche / Centre / Droite). La section est alors rendue avec
   `ndz-al-centre` etc.

### d) Les autres pages : « Aucune section sur Fiche produit »
C'était un vrai manque, pas une fatalité :
- l'onglet **Sections** affiche maintenant **ce que la page contient déjà** (galerie, prix, boutons,
  description, avis, produits similaires) avec le chemin pour en masquer un (onglet Pages) ;
- et **+ Ajouter un bloc** fonctionne désormais sur toutes les pages : les blocs ajoutés
  (avis, FAQ, HTML, galerie, chiffres, contact, newsletter…) s'affichent **sous la structure du
  thème**, page par page, à l'endroit exact où ils ont été déposés ;
- une page vidée volontairement reste vide (le thème ne remet pas ses sections par défaut).

Tests ajoutés : `sections : un bloc ajouté apparaît aussi sur la fiche produit`,
`sections : une page vidée par le marchand reste vide`, `alignement : par section et pour toute la boutique`.

---

## Taille des sections (ajouté le 20/10)

Ouvre une section dans l'onglet **Sections** : sous le sélecteur d'alignement, trois réglages
s'appliquent à **n'importe quel type de section** (hero, produits, avis, FAQ, HTML, chiffres…) :

| Réglage | Valeurs | Effet |
|---|---|---|
| **Espacement haut/bas** | Auto · Aucun · 12 · 24 · 40 · 64 · 96 px | rend la section plus haute ou plus compacte (`--sec-pad`) |
| **Taille du titre** | Auto · Petit (0,8×) · Normal · Grand (1,25×) · Très grand (1,5×) | grossit ou réduit le titre de la section (`--sec-title`) |
| **Largeur du contenu** | Auto · Étroite (780 px) · Large (1440 px) · Pleine largeur | agrandit la zone de contenu jusqu'aux bords (`ndz-wide-*`) |
| **Hauteur du visuel** | Auto · 180 · 260 · 360 · 480 · 620 px | hauteur de l'image de la bannière, de la galerie, des colonnes, de la vidéo (`--sec-img`) |

Le réglage est **par section** : tu peux avoir un hero très grand et une rangée de produits
compacte juste en dessous. Les valeurs sont bornées côté serveur (0-140 px, 0,6-2,2) : une valeur
absurde est ramenée dans la plage au lieu de casser la page.

Tests : `taille des sections : espacement, titre et largeur arrivent dans la vitrine` et
`taille des sections : une valeur absurde est ramenée dans les bornes`.

La **hauteur du visuel** s'applique à la bannière d'accueil (hauteur minimale du hero), aux images
de galerie, aux colonnes illustrées et à la vidéo. Les images sont recadrées (`object-fit: cover`) :
elles ne sont jamais déformées, quelle que soit la hauteur choisie. Valeur bornée à 80-900 px.

Test : `hauteur du visuel : réglable et bornée`.

---

## Ce qui a été ajouté le 20/10 (2ᵉ série)

### 1. Style de carte produit (accueil)
`Design → onglet Apparence → Cartes de produit → Style` :

| Style | Rendu |
|---|---|
| **Classique** | image + texte, comme avant |
| **Carte blanche** | fond, bordure douce, coins arrondis, ombre au survol |
| **Image détachée** | image arrondie avec ombre, texte en dessous |
| **Encadrée** | trait net, coins quasi carrés, style catalogue |
| **Compacte** | carte horizontale (image à gauche), idéale pour les longues listes |

Le réglage est posé sur `<html data-cards="…">` : une seule règle CSS s'applique à **tous les thèmes**.
Test : `style de carte produit : le réglage change vraiment le rendu` (4 styles + valeur invalide → classique).

### 2. Page Stock : rangée d'ajustement refaite
Avant : `[−][1][+] [Réassort ▾] [Définir]` sur une seule ligne, qui débordait sur deux lignes et
collait les boutons au titre.
Maintenant : deux lignes propres — `[−] [quantité] [+] [Définir]` puis `Motif [Réassort ▾]`.
Test : `stock : les boutons − / + / Définir ajustent vraiment le stock` (stock réellement modifié, puis remis).

### 3. Barre de recherche dans la boutique
`Design → onglet Apparence → Recherche` :
- **Dans l'en-tête** (à droite) ;
- **Bande sous l'en-tête** (pleine largeur) ;
- **Icône** qui ouvre une recherche en superposition ;
- **Pas de barre**.

Le texte d'aide est modifiable. Un seul point d'injection dans le gabarit → identique sur les 13 thèmes.
Test : `recherche : la barre peut être choisie, et le mot-clé filtre`.

### 4. Recherche par mot-clé
- `?q=` filtre sur le titre **et** la description, insensible à la casse ;
- **insensible aux accents** : « ete » trouve « Robe d'été fleurie », « telephone » trouve « Téléphone » ;
- la page affiche « N résultats pour « … » » avec un lien **Effacer la recherche** ;
- zéro résultat → « Aucun résultat », sans page cassée.
Tests : `recherche : la barre peut être choisie…` et `recherche : insensible aux accents`.

### 5. Page Statistiques
`/dashboard/stats` (menu **Statistiques**) : chiffre d'affaires du jour / 7 / 30 jours, panier moyen,
commandes, visites, taux de confirmation, top produits, top wilayas, graphe des 14 derniers jours.
Test : `stats : la page affiche les chiffres clés après une commande`.

---

## Bugs trouvés en direct le 20/10 (soir) — corrigés

### 1. Éditeur vide : « on ne peut rien modifier »
**Cause exacte** : `readSectionsAll` renvoyait un objet `sectionsByPage` contenant une clé
technique (`__explicit: true`). L'éditeur fait `normalize(map)` → `(true || []).map(...)` →
`TypeError` au chargement → **tout l'éditeur s'arrêtait**, rail blanc, boutons inertes.
Message visible en console : `(arr || []).map is not a function`.

**Corrigé** : la clé technique est calculée en local, plus jamais dans l'objet envoyé.
`normalize()` de l'éditeur ignore désormais tout ce qui n'est pas un tableau (ceinture + bretelles).
Test : `éditeur : le rail s'ouvre (plus d'écran vide)…` (charge l'éditeur dans un DOM et vérifie
qu'aucune erreur ne sort et que le rail fait plus de 500 caractères).

### 2. Réglages de section perdus
`normalize()` ne gardait que id/type/settings/blocs : **alignement, espacement, taille de titre,
largeur et hauteur du visuel** disparaissaient dès que l'éditeur rechargeait. Corrigé et vérifié :
sauvegarde → relecture → les 5 réglages sont intacts.

### 3. Deux barres de recherche sur Catalogue et Tech
Ces deux thèmes ont déjà un champ de recherche. Le gabarit en injectait un second → en-tête cassé,
panier poussé hors cadre (c'est ce qu'on voit sur ta capture).
**Corrigé** : détection de la recherche du thème (`ca-search`, `th-search`) → aucune injection en
double ; et le champ du thème est devenu un **vrai formulaire** (`name="q"`, il cherche vraiment).
Si tu choisis « sous l'en-tête » ou « icône », la recherche du thème est masquée et la tienne posée.

### 4. Changer de thème cassait la page
Le nouveau thème gardait les blocs de l'ancien (structures différentes) → rendu bancal.
Désormais : choisir un thème = **brouillon** avec les blocs du nouveau thème, couleurs/polices/
textes conservés, boutique en ligne intacte. Deux issues : **Publier** ou **Annuler l'essai**.

### 5. Bouton « CSS de cette page » vide
L'icône `code` n'existait pas dans `src/icons.js` → carré blanc. Icône ajoutée.

**Tests : 146/146.**
