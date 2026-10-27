# NovaDZ — plateforme SaaS multi-boutiques (style Shopify, marché algérien)

Un logiciel où **n'importe qui crée sa boutique en ligne** en deux minutes : chaque marchand
obtient sa vitrine (`/{slug}`), son tableau de bord et ses commandes.
Dinars (DZD), wilayas, paiement à la livraison, interface en français.

> Ce n'est pas *une* boutique : c'est la **plateforme** qui héberge les boutiques.

---

## Démarrage

```bash
npm install     # installe les dépendances
npm run fonts   # optionnel : retélécharge la police arabe Estedad si public/fonts est vide
npm start
```

➡️ http://localhost:3000

- Aucun Docker, aucun PostgreSQL, aucune variable obligatoire en local
  (optionnelles : voir `.env.example` — `PORT`, `NOVADZ_DEMO`, `NOVADZ_TRUST_PROXY`…).
- Base **SQLite** dans `data/novadz.db`, créée automatiquement au premier lancement.
- **Node.js 22 ou 24** (testé sur 22 et 24). Node 20 n'est plus supporté.
- SQLite : `better-sqlite3` (binaire précompilé) **ou**, s'il n'a pas pu s'installer, le
  SQLite intégré à Node (`node:sqlite`, présent depuis Node 22.5). Rien à configurer :
  voir `src/sqlite.js`. Forcer une implémentation : `NOVADZ_SQLITE=native` ou `NOVADZ_SQLITE=node`.

### Comptes de démonstration

Créés au premier démarrage **uniquement si `NOVADZ_DEMO=1`** (local seulement :
ces mots de passe sont publics). Sans cette variable, seul un admin est créé,
avec un mot de passe aléatoire affiché **une fois** dans la console.

| Rôle | Email | Mot de passe | Où |
|---|---|---|---|
| Marchand | `demo@novadz.dz` | `demo1234` | `/dashboard` — boutiques `amina-mode` et `tech-dz` |
| Admin plateforme | `admin@novadz.dz` | `admin1234` | `/admin` |

### Tests

```bash
npm test        # 233 tests : parcours, stock, transporteurs, relances, checkout bilingue, photos,
                #           vitrine libre (thèmes, CSS/HTML, pages, achat direct), interface de l'éditeur
```

---

## À lire avant de publier

Le fichier **`A-CORRIGER.md`** suit, point par point, les correctifs de la revue de code du 20/10
(la plupart corrigés et couverts par les tests). Avant une mise en ligne publique, lisez sa
section « Ce qui reste à faire » — en particulier la **sauvegarde de `data/novadz.db`**

---

## Ce que fait la plateforme

### Vitrine (côté client final)
- **Éditeur par page** : chaque page (accueil, fiche produit, panier, commande, CGV,
  compte) a sa propre liste de sections ; on choisit la page dans la barre de l'éditeur.
- **Page Statistiques** : CA du jour / 7 j / 30 j, panier moyen, taux de confirmation,
  visites et conversion, graphe des 14 derniers jours, meilleures ventes, wilayas.
- **Recherche de la boutique** : emplacement au choix (en-tête, sous l'en-tête, icône
  plein écran, masquée) et mot-clé qui filtre vraiment les produits.
- **Style de carte produit** : classique, carte blanche, image détachée, encadrée, compacte.
- **Prix barré + badge Promo**, **pack « souvent achetés ensemble »**, **stock bas**
  (« plus que 2 en stock »), **favoris client** (`/{boutique}/favoris`, sans compte).
- **13 thèmes** réellement différents — la mise en page change, pas seulement les couleurs :
  **Minimal** (Boutique), **Éditorial** (Magazine), **Contrast** (Vitrine), **Solo** (une pièce en majesté),
  **Galerie** (photo plein écran), **Bento** (grille de tuiles), **Zen** (colonne unique très aérée),
  **Vente directe** (page de vente COD : preuves, formulaire court, bouton d'achat collant),
  **Tech** (fiche technique en tableau, garantie, comparaison), **Marché** (dense, badges, prix forts,
  bandeau défilant), **Catalogue** (liste dense), **Mosaïque** (tuiles inégales, une pièce à la une),
  **Noir** (fond sombre, très grands titres, photo plein cadre).
- **Choix du modèle** comme sur Shopify : `/dashboard/design/themes` affiche les 13 modèles avec aperçu,
  on en choisit un, puis tout se modifie dans l'éditeur (le logo du marchand est conservé).
- **Vitrine libre (« open modif »)** : le marchand change *n'importe quoi* —
  toutes les couleurs (code hex libre), l'en-tête (style plein / ligne / transparent / flottant,
  hauteur, alignement), le logo et sa taille (14 → 96 px), la taille du texte (0,85 → 1,35),
  les arrondis, la largeur de page, le CSS de **chaque page** (accueil, fiche produit, panier,
  commande, confirmation, CGV, compte, pages), du **CSS libre**, du **HTML dans l'en-tête et le pied**
  (scripts automatiquement retirés), la **réécriture de n'importe quel texte** et le **masquage
  d'éléments** page par page.
- **Sans panier** : trois modes — *Avec panier*, *Les deux* (« Ajouter » + « Acheter maintenant »),
  *Sans panier* (chaque bouton va droit au formulaire de commande, les liens panier disparaissent),
  plus des **boutons directs par moyen de paiement** (« Commander · Carte CIB », « Commander · Paiement à la livraison »).
- **22 sections** modulaires, déplaçables, chacune avec sa vignette dans l'éditeur :
  bannière, produit en vedette, grille, **carrousel de produits**, **image + texte (inversable)**,
  **avis clients avec note globale et photos**, **bandeau livraison / paiement (délais réels)**,
  **offre du jour avec compte à rebours**, **bouton WhatsApp collant**, **chiffres qui rassurent**,
  **notre histoire en 3 étapes**, **citation**, **colonnes (2-3)**, **vidéo** (MP4 ou YouTube),
  **espace / séparateur**, **réseaux sociaux**, texte, bandeau, points forts, FAQ, galerie,
  **HTML personnalisé**.
- Recherche, filtres par catégorie, tris (prix, nouveautés).
- Fiche produit : galerie multi-images + point focal, **variantes avec stock et prix**,
  avis clients notés, ajout au panier.
- **Réseaux sociaux** : le marchand colle ses adresses une fois dans
  `/dashboard/reseaux` (Facebook, Instagram, TikTok, WhatsApp, YouTube, Snapchat, Telegram, X,
  LinkedIn, Pinterest, autre site) avec un nom affiché facultatif, puis choisit dans le Design
  où elles apparaissent — **en-tête, pied de page, les deux ou nulle part**, en icônes seules
  ou avec le nom, en trois tailles. Une adresse sans `https://` est complétée ; tout ce qui
  n'est pas http(s) est refusé. Aucune icône ne s'affiche tant qu'aucun lien n'est enregistré.
- **Photos** : compression automatique dans le navigateur (1600 px, WebP), envoi jusqu'à 8 Mo,
  contrôle de la vraie nature du fichier (signature binaire), chargement paresseux des images.
- Panier, code promo (remise sur tout le panier ou sur **un produit précis**).
- **Tunnel de commande adapté au terrain algérien** :
  - wilaya + **commune** (liste officielle des **1 530 communes**, noms FR et AR, saisie libre acceptée) ;
  - **position GPS en un clic** — si le client envoie sa position, l'adresse écrite devient facultative
    (cités sans nom de rue), lien Google Maps dans le tableau de bord et sur la facture ;
  - **frais de livraison par wilaya** calculés en direct, et **délai annoncé** par wilaya
    (« Livraison estimée : 2 à 4 jours »), réglable par le marchand.
- **Bilingue français / arabe** : bouton FR / ع dans la vitrine, écriture de droite à gauche,
  police **Estedad** auto-hébergée (aucun appel à Google), mentions légales et CGV aussi en arabe.
  Le tableau de bord reste en français. Réglage : Réglages → Langue de la vitrine.
- Compte client : inscription, historique, suivi de commande par référence.
- Facture et **bon de livraison** imprimables (Ctrl+P → PDF).
- Conformité : mentions légales, CGV, délai de retour, **bandeau cookies**,
  pixels Meta/TikTok chargés **uniquement après consentement**.

### Tableau de bord (marchand)
- Vue d'ensemble (CA, commandes, panier moyen), produits (photos, catégorie, variantes, galerie).
- Commandes : statut, détail, export CSV, facture/BL, **remboursement avec remise en stock**.
- **Pages de vente (`/dashboard/landings`)** : une landing par publicité, sur un produit —
  titre accrocheur, prix barré, **offres de quantité** (1 / 2 / 3 pièces), compte à rebours,
  livraison offerte à partir de N pièces, arguments, avis clients, et un **formulaire court**
  (nom, téléphone, wilaya, adresse) sans passage par le panier. URL `/<boutique>/l/<page>`.
  Le stock est vérifié à la commande, comme partout ailleurs.
- **Anti-fausses commandes (`/dashboard/marketing`)** :
  - **CAPTCHA** Google reCAPTCHA v3 (invisible + score), v2 case à cocher, ou v2 invisible ;
    clés par boutique, score minimum réglable. Si Google est injoignable, la commande
    n'est **pas** bloquée (elle est marquée à vérifier) : on ne perd pas la vente.
  - **Position GPS** capturée au checkout et à la landing, stockée avec la commande
    (lien Google Maps dans le tableau de bord).
  - **Téléphone** normalisé (`0X XX XX XX XX`), mode strict optionnel.
  - **Score de risque** : doublon de téléphone sous 15 min, rafale depuis la même IP,
    adresse trop courte, position absente, score CAPTCHA faible. Au-delà de 30 la commande
    arrive en **`a_verifier`** avec ses motifs ; liste noire de numéros, blocage en un clic.
- **Pixels serveur — Conversions API (`/dashboard/marketing`)** : Meta, TikTok et Snapchat
  reçoivent **ViewContent, AddToCart, InitiateCheckout et Purchase depuis le serveur**, avec
  le **même `event_id` que le navigateur** (dédoublonnage). Téléphone haché en SHA-256,
  code de test Events Manager, et **journal de chaque envoi** avec le code de réponse —
  on voit immédiatement si un jeton est expiré.
- **Stock (`/dashboard/stock`)** : niveau par produit et par variante, seuil d'alerte
  réglable, alertes rupture/stock faible, ajustement (+/− ou valeur exacte) avec motif
  (réassort, inventaire, retour), **journal de tous les mouvements**, valorisation du stock
  et export CSV. Le stock est **vérifié et décrémenté dans la même transaction** que la
  commande : impossible de survendre. Annulation et remboursement remettent les articles
  en stock, une seule fois.
- Catégories, frais de livraison par wilaya (58 wilayas), **modération des avis**, clients.
- Codes promo (pourcentage ou montant, panier minimum, limite d'utilisation, produit ciblé).
- Pages libres (À propos, Contact…), réglages boutique, informations légales, pixels, WhatsApp.
- **Éditeur de thème refait, en 5 onglets** : **Sections** (bibliothèque de vignettes,
  glisser-déposer, clic dans l'aperçu = édition du bloc), **Thème** (thème, couleurs avec palettes
  prêtes, en-tête, logo et taille, texte, arrondis, largeur, panier, mobile), **Pages**
  (CSS page par page, masquage d'éléments), **Code** (CSS libre + HTML d'en-tête/pied),
  **Textes** (réécriture de libellés), **12 apparences prêtes** (palette + arrondis + police en un
  clic : Clair, Nuit, Sable, Pastel, Forêt, Tech, Néo-brut, Édito, Mono, Doré, Océan, Corail).
  Aperçu ordinateur/tablette/mobile,
  **brouillon + publication + historique de versions**.

### Admin plateforme
- Toutes les boutiques, suspension/réactivation, santé (`/admin/health`),
  journaux (`/admin/logs`), nettoyage des images orphelines.

---

## Structure

```
server.js            routes Express (plateforme + vitrines + dashboard + admin)
src/
  db.js              schéma SQLite et migrations
  auth.js            scrypt, sessions
  shop.js            catégories, variantes, avis, livraison, promos, recherche
  sections.js        types de sections, rendu, réglages de design
  i18n.js            bilingue FR/AR (dictionnaire + passe de traduction)
  geo.js             wilayas + communes (FR/AR), lien carte
  communes.json     1 530 communes des 58 wilayas (FR + AR)
  checkoutform.js    champs du tunnel partagés par les thèmes
  layouts.js         les 13 thèmes (header, fiche, panier, tunnel, pied de page)
  social.js          réseaux sociaux du marchand (liens, nettoyage, barre d'icônes)
  views.js           pages du dashboard et de l'admin
  landing.js         page d'accueil de la plateforme
  seed.js            données de démonstration
  uploads.js         images (data-URL → fichier), nettoyage
  assets.js          restaure les images de démo au démarrage
public/
  editor.js          éditeur de thème
  styles.css         design system + thèmes
  fonts/             Estedad (police arabe, OFL) auto-hébergée
  upimg.js           redimensionnement + WebP avant envoi
assets/              images de démonstration
tests/             233 tests de bout en bout (dont vitrine-libre et interface de l'éditeur)
```

## Marketing : reCAPTCHA et pixels

**reCAPTCHA** — créez des clés sur `google.com/recaptcha/admin` (gratuit), puis
`/dashboard/marketing` → type (v3 conseillé), clé du site, clé secrète, score minimum (0.5).
Sans clé, aucun blocage : le contrôle est simplement inactif.

**Pixels serveur** — pour Meta : Events Manager → Paramètres → Conversions API →
générer un jeton. Pour TikTok : Events API, jeton `act.…`. Pour Snapchat : Conversions API,
jeton OAuth. Collez le pixel + le jeton dans `/dashboard/marketing`, mettez un **code de
test** pour vérifier dans Events Manager avant de dépenser en publicité.

Les événements partent en arrière-plan : une panne de Meta ne ralentit jamais une commande.
Chaque tentative est enregistrée dans `pixel_events` et visible dans le tableau de bord.

## Stock : comment ça marche

`src/inventory.js` est le seul module autorisé à modifier `products.stock` et
`variants.stock`. Chaque variation écrit une ligne dans `stock_movements`
(`delta`, `level`, `reason`, `order_id`). Conséquence : le stock affiché est toujours
explicable, et une commande ne peut pas consommer plus que le stock disponible
(la vérification est faite dans la transaction SQLite qui crée la commande).

Motifs enregistrés : `vente`, `annulation`, `remboursement`, `retour`, `reassort`,
`inventaire`, `creation`.

## Limites connues

- Paiement **à la livraison uniquement** (pas de CIB/EDAHABIA ni Stripe).
- Facture en HTML imprimable, pas de PDF généré côté serveur.
- Remboursement **total** uniquement.
- Sessions **en mémoire** : redémarrer le serveur déconnecte les utilisateurs.
- SQLite mono-serveur : pas de réplication, sauvegarde = copier `data/novadz.db`.
- WhatsApp via liens préremplis (`wa.me`), pas d'API WhatsApp Business.

## Mettre sur GitHub

```bash
git init
git add .
git commit -m "NovaDZ — plateforme multi-boutiques"
git branch -M main
git remote add origin https://github.com/<ton-compte>/novadz.git
git push -u origin main
```

`.gitignore` exclut déjà `node_modules/`, la base locale et les images envoyées.

## Transporteurs

Aucun bureau de livraison n'est codé en dur. Le marchand connecte le sien depuis
**Tableau de bord → Transporteur** : URL, en-têtes chiffrés, corps de requête avec variables,
chemins de lecture de la réponse, table de correspondance des statuts.
Préréglages fournis (modifiables) : Yalidine, Guepex, Yalitec, ZR Express, EcoTrack, Maystro, Autre.

Détail complet : [`TRANSPORTEURS.md`](TRANSPORTEURS.md).

## Livraison, relances, statistiques

- **Bordereau** : PDF récupéré et stocké même quand le bureau renvoie des octets bruts (DHD, EcoTrack, NOEST).
- **Paniers abandonnés** : copie en base à chaque étape, lien de récupération, relance en un clic par WhatsApp.
- **Relances** : mode manuel (wa.me) ou API (WhatsApp Cloud, SMS, Make/Zapier).
- **Statistiques** : taux de livraison et montants par transporteur et par wilaya.

Détail : [`LIVRAISON-RELANCES.md`](LIVRAISON-RELANCES.md).
