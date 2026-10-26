# NovaDZ — ce qu'il faut corriger (revue du code, 20/10/2026)

Méthode : relecture des 10 500 lignes + **tests réels sur un serveur lancé exprès** (base neuve, port 3100).
Chaque point ci-dessous a été **reproduit**, pas deviné. La ligne et le fichier sont indiqués.

État de base : `npm install` OK, **45/45 tests verts**, serveur qui démarre, vitrine + dashboard + checkout OK.

---

## P0 — bloquants (le marchand ne peut pas travailler)

### 1. Toute photo de plus de ~190 Ko est refusée avec « Erreur serveur »
- `server.js:43` — `express.json({ limit: "256kb" })`, alors que la fiche produit annonce « 2,5 Mo max » (`src/uploads.js` `MAX`).
- Reproduit : image de 400 Ko → **HTTP 500 « Erreur serveur »** ; image de 100 Ko → 200.
- Aucune photo d'un téléphone (1–4 Mo) ne passe donc aujourd'hui.
- Correctif : `limit: "8mb"` + intercepteur qui renvoie un **413 avec message clair** (« photo trop lourde, 2,5 Mo max ») au lieu d'un 500, + compression côté navigateur avant envoi (`public/upimg.js`).

### 2. Prix et stock acceptent n'importe quoi
`server.js:288` — `Math.round(parseFloat(req.body.price) * 100)`, aucune validation.
- `price=abc` → **HTTP 500**
- `price=-900` → accepté → produit à **−900,00 DZD** (et une commande peut sortir à 0 DZD : vérifié, `subtotal_cents = -90000`)
- `price=1 200,50` → enregistré **1,00 DZD** (parseFloat s'arrête à l'espace)
- `stock=abc` → **HTTP 500**
- Correctif : un seul utilitaire `parseDzd()` (tolère « 1 200,50 », « 1200.5 », refuse vide/négatif/non numérique) + `parseQty()` ; message d'erreur dans le formulaire au lieu d'un 500.

### 3. Le chiffre d'affaires compte les commandes annulées
Incohérence d'accent sur le statut :
- les statuts écrits par l'app sont **sans accent** : `annulee`, `livree`, `expediee`… (`server.js:341`, `src/carriers.js`)
- mais `server.js:260` et `server.js:633` filtrent `!= 'annulée'` (avec accent)
- Reproduit : commande de 1 400 DZD passée en `annulee` → le KPI « Chiffre d'affaires » affiche toujours **1 400,00 DZD**.
- Correctif : constantes `ORDER_STATUS` (une seule source), migration des valeurs existantes, et calculs basés dessus.

### 4. Le statut de commande accepte n'importe quel texte
`server.js:337-341` — `req.body.status` va directement en base.
- Reproduit : statut `<b>pirate</b>` enregistré tel quel (affiché échappé, donc pas de faille XSS, mais les filtres, badges et KPI ne le reconnaissent plus).
- Correctif : liste blanche stricte + bouton « annuler » séparé.

### 5. Changer de thème efface le logo du marchand
- `server.js:422` remettait `design = NULL`, et le logo est stocké dans `design.logo` pour les thèmes de l'éditeur → logo perdu à la publication suivante.
- **Déjà corrigé** dans cette passe (le logo est conservé), à revérifier visuellement.

---

## P1 — sécurité (avant toute mise en ligne publique)

### 6. Compte administrateur créé d'office avec un mot de passe public
`src/seed.js:7-14` — au premier démarrage, `admin@novadz.dz / admin1234` est créé, et le README l'affiche.
Sur un tunnel Cloudflare public, **n'importe qui lit le dépôt et devient admin**. C'est le risque le plus grave du projet.
- Correctif : seed de démo uniquement si `NOVADZ_DEMO=1` ; en prod, mot de passe admin généré aléatoirement et affiché **une seule fois** dans la console, avec changement obligatoire.

### 7. Aucune protection CSRF
Tous les `POST` (produits, prix, statut, paiement, design, transporteur, suppression) n'ont **aucun jeton**. Un simple lien piégé peut supprimer des produits ou changer les tarifs d'un marchand connecté.
- Correctif : jeton par session injecté dans tous les formulaires + vérification en middleware.

### 8. Aucune limitation de débit
- Reproduit : 10 tentatives de mot de passe en 6 secondes → 10 réponses `401` normales. Rien ne bloque le bourrage d'identifiants.
- Même chose pour le checkout (le scoring de risque n'empêche pas le spam) et pour les avis.
- Correctif : compteur en mémoire (IP + e-mail) : 10 essais / 15 min sur `/login`, 5 commandes / 10 min par IP, 3 avis / heure.

### 9. Sessions en mémoire, jamais nettoyées
`src/auth.js:5` — `SESSIONS = new Map()` :
- **un cookie et une entrée mémoire pour chaque visiteur** (vérifié : `Set-Cookie: sid=…` sur la simple visite d'une vitrine) ;
- jamais expirées, jamais purgées → la mémoire du processus gonfle jusqu'au crash ;
- **tous les marchands sont déconnectés à chaque redémarrage** (`deploy/novadz.service` redémarre la nuit).
- Correctif : sessions en table SQLite (`sessions(sid, user_id, cart, expires_at)`), purge toutes les heures, régénération du `sid` à la connexion (anti-fixation).

### 10. Cookies et en-têtes
- cookie `sid` sans `Secure`, aucun `app.set("trust proxy", 1)` → derrière Cloudflare le cookie peut fuir en clair.
- Aucun en-tête de sécurité (vérifié sur `GET /`) : pas de `X-Content-Type-Options`, pas de `Content-Security-Policy`, pas de `Referrer-Policy`, et `X-Powered-By: Express` est exposé.
- Correctif : `trust proxy`, cookie `Secure` en prod, 4 en-têtes + `app.disable("x-powered-by")`.

### 11. Pages publiques trop bavardes
- `/:slug/order/:ref` (`server.js:1386`) affiche nom, téléphone, adresse complète à quiconque connaît la référence ; aucune limite de débit → énumération possible.
- `GET /logout` (`server.js:248`) déconnecte sur simple image distante.
- Export CSV (`server.js:530`) : pas d'anti-formule Excel (`=`, `+`, `-`, `@`).
- Correctif : page de suivi qui masque le téléphone (`0555 ** ** 33`), `POST /logout`, préfixe `'` sur les cellules commençant par `=+-@`.

### 12. Envoi d'images sans contrôle réel
`src/uploads.js` — le type vient du préfixe `data:` du client (aucune vérification des octets), pas de quota par boutique (remplissage du disque), et dédoublonnage par SHA-1 : **supprimer une image d'un produit supprime le fichier partagé par un autre produit**. Supprimer un produit ne supprime d'ailleurs jamais son image (`server.js:320` seulement en modification).
- Correctif : vérifier la signature binaire (PNG/JPEG/WebP), quota 100 Mo par boutique, suppression du produit → `removeUrl`, et ne supprimer un fichier que s'il n'est plus référencé.

---

## P2 — données et robustesse

### 13. Tarifs de livraison : une faute de frappe rend la livraison gratuite
`server.js:699-720` — testé : `all=abc` → **0 DZD partout**, sans message ; `all=-500` → 0 aussi, et le tarif bureau reste à 400 DZD (bureau plus cher que domicile).
- Correctif : validation (« chiffres uniquement, 0 à 100 000 »), message d'erreur, et le tarif bureau suit (`desk = max(0, home − remise)`).

### 14. Champs sans limite de longueur
Nom client, adresse, note de commande, description produit, noms de catégories : aucune troncature côté serveur → base qui gonfle (`note` de 100 Ko acceptée).
- Correctif : `slice()` systématique (nom 80, adresse 200, note 500, description 5 000).

### 15. Téléphone non normalisé à l'enregistrement
`normalizePhone` sert au blocage/au risque mais la valeur brute est stockée → la même personne apparaît plusieurs fois dans les clients.
- Correctif : stocker la version normalisée + le format saisi à part.

### 16. Relances et paniers abandonnés
`src/relance.js` tourne toutes les 10 min : à vérifier de bout en bout (aucun test), notamment qu'aucune relance n'est envoyée deux fois après redémarrage.

---

## P3 — performance et qualité

### 17. Rien n'est compressé, rien n'est mis en cache
- `styles.css` = **146 Ko** servis sans gzip (vérifié : `Content-Encoding` absent) et avec `Cache-Control: public, max-age=0` → re-téléchargés à chaque page.
- Ajouter `compression`, `maxAge: "7d"` + empreinte (`?v=`) sur le CSS, et purger les 2 400 lignes de CSS devenues doublons (blocs 9, 10, 11 se recouvrent déjà).

### 18. Tests : ce qui n'est pas couvert
45 tests couvrent commandes, stock, transporteurs, relances. **Rien** sur : upload d'images, validation produit, statuts de commande, tarifs de livraison, éditeur/thèmes, permissions (un marchand ne peut pas ouvrir la boutique d'un autre).
- Correctif : 12 tests ciblés (un par bug P0/P1 corrigé).

### 19. Divers
- Pas de `favicon.ico` (404 à chaque visite), pas de `robots.txt`, pas de page 500 personnalisée.
- `package.json` : `express ^4.21.1` — passer en `express 4.21.x` figé pour éviter une surprise de majeure.
- `deploy/novadz.service` : pas de `Restart=always` vérifié, pas de sauvegarde automatique de `data/novadz.db` (un `rm` = toutes les boutiques perdues).

---

## Ordre de travail proposé (3 vagues)

1. **Vague A — débloquer le marchand** : points 1, 2, 3, 4, 5 (+ tests). C'est court et ça règle les bugs qu'il rencontre vraiment.
2. **Vague B — sécurité minimum viable** : points 6, 7, 8, 9, 10, 11. Obligatoire avant de publier le tunnel.
3. **Vague C — finitions** : 12 à 19 (images, limites, livraison, compression, tests, sauvegarde).

Dis-moi par quoi tu veux commencer (ou envoie tes captures : je les traite dans la même vague).
