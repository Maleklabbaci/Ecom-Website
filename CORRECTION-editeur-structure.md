# Correction de l'éditeur et de la structure

## 1. « Page en cours d'édition » : plus de grande barre
La bande qui prenait toute la largeur a disparu. Le choix de page est maintenant un
**petit sélecteur dans la barre d'outils**, à côté des boutons Ordinateur / Tablette /
Mobile. À côté, une icône `</>` ouvre le CSS de la page affichée.

## 2. Chaque page a ses propres sections
Avant, la liste des sections était commune : modifier la fiche produit modifiait l'accueil.
Maintenant :

- tu choisis la page dans le sélecteur (Accueil, Fiche produit, Panier, Page de commande,
  CGV, Compte client, + chaque page CMS) ;
- **la liste des sections change avec la page** — un bloc ajouté sur « Fiche produit »
  n'apparaît que sur la fiche produit ;
- la page garde sa structure de thème (fiche, panier, tunnel) et les sections viennent
  s'ajouter dessous ;
- si la page n'a aucune section : « Aucune section sur *cette page* » + bouton
  **Ajouter une section**.

Stockage : `sections` devient `{ home: [...], product: [...], cart: [...], checkout: [...],
legal: [...], account: [...] }`. Les boutiques existantes (ancien format tableau) restent
compatibles — l'accueil est lu normalement.

## 3. Interface de design revue
- barre du haut : retour, annuler/rétablir, **sélecteur de page**, tailles d'écran,
  contours, CSS de la page, Enregistré/Brouillon, Publier ;
- onglets : Sections · En-tête · Thème · Pages · Code · Textes ;
- l'onglet Sections affiche en clair **« Sections de : Accueil / Panier / … »** ;
- plus de texte collé : libellés au-dessus, une seule colonne, arrondis partout.

## 4. Apparences prêtes : contrastes garantis
- Bug corrigé : les apparences posaient `fontFamily`, alors que le moteur lit `font` —
  **la police n'était jamais appliquée**. C'est réparé : chaque apparence pose sa police.
- Les 12 apparences ont été recalculées : texte/fond toujours contrastés, accent distinct
  du fond et du texte.
- Garde-fou permanent côté serveur : si le marchand choisit un texte de la même couleur
  que le fond (ou presque), le rendu force la couleur lisible (noir ou blanc).
  Idem pour l'en-tête et le pied de page.

## 5. Structure de la boutique
- **En-tête sur une ligne** : logo + menu à gauche, recherche à droite, `align-items:center`,
  pas de retour à la ligne. Sous 900 px la recherche de l'en-tête se masque (elle reste
  accessible par la variante « icône »).
- **Un seul fond** : les sections ne posent plus de blanc/gris qui jurait ; vignettes et
  images prennent une teinte du fond du thème.
- **« Pièce en vedette »** : grille 2 colonnes, image 4/5 en `object-fit:cover` à gauche,
  texte aligné en haut à droite, gap 44 px ; une colonne sous 860 px.
- **Une seule barre de recherche** : la recherche des filtres est masquée quand une
  recherche d'en-tête existe (plus de double contour).

## Vérifié
- `npm test` → **129 / 129** (4 nouveaux tests : sections par page, recherche dans
  l'en-tête + barre unique, correction de contraste, apparences avec police et sans
  `fontFamily`).
- En live : `/dashboard/design` affiche le sélecteur compact (plus de `.ed-pagebar`),
  l'accueil garde ses sections, la fiche produit affiche ses propres blocs.

## À savoir
Le changement de thème réinitialise toujours les réglages Design (comportement existant) :
les sections par page, elles, sont conservées.
