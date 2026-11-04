# Vérification complète — 4 novembre 2026

Tout ce qui suit a été vérifié sur le vrai site, dans un vrai navigateur, pas à l'œil.

## 1. Les pages

| | |
|---|---|
| Pages visitées | **103** |
| Codes HTTP en erreur | **0** |
| Erreurs JavaScript | **0** |
| Requêtes en échec (404, 500) | **0** |
| « undefined », « NaN », « [object Object] » | **0** |
| Prix en dollars ou en euros | **0** |

Ce qui est visité : accueil, connexion, inscription, thèmes, 16 modèles de site, 19 thèmes,
3 boutiques (FR et AR), les 43 écrans du tableau de bord marchand, les 6 écrans admin.

## 2. Le parcours d'un vrai client

17 vérifications, 0 échec :

1. le client ouvre une fiche produit, ajoute au panier, remplit le formulaire → **commande confirmée**
2. la commande **apparaît** dans le tableau de bord du marchand
3. le marchand écrit dans le Studio, enregistre → **le brouillon n'est pas visible par les clients**
4. il publie → **le texte apparaît** sur la boutique
5. la boutique reste en ligne, **prix en dinars**
6. une inscription crée une boutique et **ouvre le Studio tout de suite**
7. les pages tiennent sur un téléphone (390 px, aucun débordement)

## 3. Ce qui a été réparé

1. **Des prix en dollars dans 4 modèles.** 44 prix ($124.90, $3,399, $27.99…) sont devenus des dinars
   (12 490 DZD, 339 900 DZD, 2 799 DZD). Le test qui devait l'empêcher regardait mal : la devise était
   dans sa propre balise, il ne la voyait pas. Le test lit maintenant le texte visible.
2. **Un script cassé sur la fiche produit.** Le code contenait `!/^image\//` ; le gabarit mangeait le
   `\`, la page recevait `!/^image//` : la partie après était un commentaire, et le formulaire d'avis
   avec photo levait une erreur. Réparé.
3. **Le modèle `sonnenbloom` appelait des scripts Cloudflare** (`cdn-cgi/...`) qui n'existent pas sur
   notre serveur : 2 erreurs et 2 requêtes en échec à chaque affichage. Retirés.
4. **La pastille de langue `ع`** s'affichait avec un autre signe sur certains systèmes (on croyait voir
   un « € »). La police arabe vient maintenant avec le bouton.

## 4. Nouveaux garde-fous

| Fichier | Rôle |
|---|---|
| `tests/pages-js-propres.test.js` | 24 tests : chaque page est lue, chaque script écrit dedans est compilé, et l'on refuse « undefined », les dollars et les euros |
| `scripts/audit.js` | ouvre 103 pages dans un navigateur, rapporte codes, erreurs JS, requêtes ratées, prix |
| `scripts/parcours.js` | joue un vrai client : commande, Studio, publication, inscription, téléphone |
| `scripts/captures.js` | refait les captures du Studio, des thèmes et de la boutique |

Lancer :

```bash
npm test                              # 350 tests
node scripts/audit.js                 # 103 pages
node scripts/parcours.js              # le parcours client
```

## 5. Ce qui reste à faire (pas fait, volontairement)

- **Fusion sur `main`** : en attente du feu vert. Tant qu'elle n'est pas faite, un déploiement
  depuis `main` donne l'ancien code.
- La traduction en français du modèle à choisir.
