# Vérification complète — 4 novembre 2026 (milieu d'après-midi)

Tout ce qui suit a été vérifié sur le vrai site, dans un vrai navigateur, pas à l'œil.
Cette version remplace la précédente : deux défauts trouvés après elle sont corrigés ici.

## 1. Les pages après connexion

| | |
|---|---|
| Pages ouvertes dans le navigateur | **102** |
| Codes HTTP en erreur | **0** |
| Erreurs JavaScript | **0** |
| Requêtes en échec (404, 500) | **0** |
| Débordement horizontal (bureau et téléphone) | **0** |
| « undefined », « NaN », « [object Object] » | **0** |
| Prix en dollars ou en euros | **0** |

Deux tailles à chaque fois : ordinateur 1440 × 900 et téléphone 390 × 844.
Les captures pleine page sont dans `captures/scroll/` (102) et `captures/revue/`.

## 2. Un compte tout neuf (inscription réelle)

On s'inscrit vraiment, on répond au premier écran, puis on ouvre **toutes** les pages
du menu — sans un seul produit, sans une seule commande : c'est là que sortent les
pages vides et les divisions par zéro.

| | |
|---|---|
| Écrans vérifiés | **68** (34 pages × 2 tailles) |
| Défauts | **0** |
| Boutique publique d'un compte neuf | 200, aucun débordement, aucun « undefined » |

## 3. Le défilement, page par page

| Contrôle | Résultat |
|---|---|
| Arriver en bas de chaque page | **32 écrans sur 32** |
| Contenu caché derrière une barre fixe | **0** |
| Barre fixe qui mange trop d'écran | **0** |
| Page qui ne défile pas alors qu'elle est plus longue que l'écran | **0** |

Sur téléphone, l'espace marchand défile dans sa propre colonne (`.dash-main`) : les
audits descendent ce cadre, pas la fenêtre, sinon on ne mesurait que le premier écran.

## 4. Le parcours d'achat au doigt (téléphone)

`scripts/parcours-tel.js` joue un client sur un téléphone, en cliquant vraiment :

| Étape | Résultat |
|---|---|
| Fermer le bandeau cookies | OK |
| Boutique → ouvrir une fiche produit | OK (`/amina-mode/p/4`) |
| « Ajouter au panier » | OK → panier avec l'article, sous-total 3 800 DZD |
| Formulaire de commande | 12 champs, wilaya et commune reliées |
| Valider | **commande confirmée**, n° `#NDZ-…`, total 4 300 DZD avec livraison |
| Erreurs JavaScript | **0** |

Deux défauts corrigés au passage :

- **Le bandeau cookies** (124 px de haut) recouvrait « Acheter maintenant » et
  « Mes favoris » sur la fiche produit. Réduit à 50 px, et le bas de page garde
  88 px de place tant qu'il est affiché.
- **La case à cocher « Reprendre l'allure de la boutique »** sortait en 13 × 22 px
  (écrasée) : 22 × 22 px.

## 5. Au doigt (téléphone)

| | |
|---|---|
| Pages testées | **28** |
| Défaut bloquant (contenu inatteignable, texte coupé, image cassée, erreur JS) | **0** |
| Petites zones à agrandir (< 32 px) | 16 pages, liste dans `captures/doigt/audit-tap.json` |

## 6. Avant / après (captures)

`scripts/captures-avant-apres.js` ouvre **la même page** sur deux serveurs : l'ancien
code (commit `bdd0aa2`, port 4700) et le code corrigé (port 4600), même cadrage, même
taille de téléphone (390 × 844). Le montage est dans `captures/revue/avant-apres.png`,
les images séparées dans `captures/avant-apres/`.

| Scène | Avant | Après |
|---|---|---|
| Réglages | la colonne ne défilait que de **82 px**, bouton Enregistrer invisible | **3 577 px** de défilement, bouton atteignable |
| Stock | une carte coupée net (`max-height: 72px`), son texte perdu | carte entière, page défilable jusqu'au bout |
| Case à cocher « Reprendre l'allure » | **13 × 22 px**, posée seule au-dessus du texte | **22 × 22 px**, sur la même ligne, à gauche du texte |
| Barre d'achat de la boutique | la pastille NOVADZ recouvrait **Commander** | pastille retirée sous 700 px, bouton libre |

## 7. Ce qui a été réparé aujourd'hui

1. **Le formulaire Réglages était coupé sur téléphone.** Un script rognait les cartes à
   la hauteur de l'écran pour éviter qu'elles « se décalent ». Résultat : le formulaire
   faisait 4 359 px de haut mais la colonne ne défilait que sur 82 px — le bouton
   **Enregistrer** n'existait plus. Le rognage est supprimé ; le formulaire défile
   entièrement, le bouton est atteignable (vérifié au clic, pas à l'œil).
2. **La pastille « NOVADZ » cachait le bouton « Commander ».** Posée en bas à droite,
   au même endroit que la barre d'achat des modèles : sur téléphone elle recouvrait le
   seul bouton qui compte. Elle est retirée sous 700 px ; la signature reste dans le
   pied de page (« Propulsé par NovaDZ »). Sur ordinateur, elle reste.
3. **Cases à cocher de 15 px** dans l'espace marchand : portées à 22 px sur téléphone
   (impossible à viser au doigt avant), et la case « Reprendre l'allure » qui sortait
   écrasée en 13 × 22 px est revenue carrée.
4. **Boutons Ordinateur / Téléphone** de l'aperçu : 31 px de haut, passés à 34 px.
5. **La case à cocher « Reprendre l'allure »** était centrée au-dessus de son texte
   (`.form > label` impose une colonne) : elle est revenue sur la même ligne, à gauche.

Les quatre réparations d'avant restent : prix en dinars dans 4 modèles, script cassé de
la fiche produit, scripts Cloudflare du modèle `sonnenbloom`, pastille de langue `ع`.

## 8. Les garde-fous (tests)

| Fichier | Rôle |
|---|---|
| `npm test` | **354 tests**, 0 échec |
| `scripts/audit.js` | 102 pages : codes, erreurs JS, requêtes ratées, prix |
| `scripts/audit-scroll.js` | 102 pages × 2 tailles : défilement, largeur, images, textes |
| `scripts/audit-bas.js` | 32 écrans : arriver en bas, barres fixes |
| `scripts/audit-tap.js` | 28 pages au doigt : zones trop petites, contenu caché |
| `scripts/audit-nouveau.js` | inscription réelle + 34 pages sans données |
| `scripts/parcours.js` | **17 vérifications** : commande client, Studio, publication, inscription |
| `scripts/parcours-tel.js` | **7 vérifications** : achat complet au doigt sur téléphone |
| `scripts/revue.js` | captures du haut jusqu'en bas, une image par page |
| `scripts/captures-avant-apres.js` | la même page sur l'ancien et le nouveau code, côte à côte |

Deux tests neufs empêchent le retour des bugs :

- « aucune carte n'est rognée à la hauteur de l'écran » (`tests/pages-js-propres.test.js`)
- « la pastille NOVADZ ne recouvre pas la barre d'achat sur téléphone » (`tests/site-templates.test.js`)

Lancer (serveur déjà démarré sur le port 4600) :

```bash
npm test
node scripts/audit.js
node scripts/audit-scroll.js
node scripts/audit-bas.js
node scripts/audit-tap.js
node scripts/audit-nouveau.js
node scripts/parcours.js
```

## 8 bis. L'après-connexion, remis au clair (4 novembre)

| Point demandé | Ce qui est fait | Preuve |
|---|---|---|
| Le formulaire suit le choix : boutique **ou** vitrine, jamais les deux | `/demarrer` ne contient **qu'un seul** formulaire, celui du type choisi à l'inscription. Le bouton « Je voulais plutôt… » envoie un vrai choix au serveur (`POST /demarrer/type`) puis recharge l'autre formulaire. | `tests/onboarding-kind.test.js` (4 tests) |
| Projet, wilaya, numéro **obligatoires** | Nom + métier + téléphone (9 chiffres au moins) + wilaya : `required` dans la page, **et** revérifiés par le serveur (400 avec un message clair). Un métier de vitrine est refusé dans un formulaire de boutique. | même fichier, test « tous les champs… sont obligatoires » |
| Une icône par page, plus de doublons | 10 icônes neuves (`home, mail, megaphone, tag, route, folder, file, gauge, star, brush`). Dans un menu donné, deux pages n'ont plus jamais le même dessin. | `tests/espace-clair.test.js` (2 tests lisent le menu rendu) |
| Ne plus demander d'API ni de clés | Relances (URL, en-têtes, corps, mode auto), E-mails (SMTP), Pixels (jetons CAPI), Transporteur (chemins et en-têtes) : remplacés par une carte **« Prochainement »**. Restent : délais, modèles de messages, lien WhatsApp, identifiants de pixels (facultatifs). | `tests/espace-clair.test.js` + `tests/relance.test.js` |
| Adresse gratuite **avant** le DNS | Encadré « Ton adresse gratuite » : `amina-mode.nova.site`, puis « Tu as déjà un domaine ? (facultatif) » replié, puis le DNS dedans. Le sous-domaine **sert vraiment la boutique** (`src/domain.js` le reconnaît). | test « l'adresse gratuite s'affiche avant le domaine payant » + « sert vraiment la boutique » |

`npm test` : **362 tests, 360 réussis, 0 échec** (2 ignorés volontairement).

Captures : `captures/revue/0-inscription-*.png`, `1-apres-signup-boutique.png`,
`2-apres-signup-vitrine.png`, `3-reglages-adresse.png`, `4-relances-prochainement.png`,
`5-menu-icones.png`, `6-premier-ecran-telephone.png`
(script : `node scripts/captures-onboarding.js`).

## 9. Ce qui reste à faire (pas fait, volontairement)

- **Fusion sur `main`** : en attente du feu vert. Tant qu'elle n'est pas faite, un
  déploiement depuis `main` donne l'ancien code.
- La traduction en français du modèle à choisir.
- Agrandir les 16 pages de petites zones listées (confort, pas blocage).
- `scroll-behavior: smooth` sur certains modèles : c'est voulu (les liens de menu
  glissent au lieu de sauter). Un défilement au doigt ou à la molette n'est pas gêné ;
  seuls les scripts qui sautent en bas d'un coup doivent en tenir compte.
