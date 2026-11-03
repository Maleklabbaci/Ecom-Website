# NovaDZ — tout ce qui a changé aujourd'hui (3 novembre 2026)

Ce fichier répond à une seule question : **qu'est-ce qui est nouveau dans ce code ?**
Rien n'a été supprimé. L'ancien code est toujours intact sur la branche `main`
(commit `39712d9`).

- Branche de travail : `arena/c70c6999-ecom-website` (poussée sur GitHub)
- 5 envois aujourd'hui : `ae4082e`, `ae3171f`, `b1bd32e`, `b474dd6`, `96e3701`
- 151 fichiers touchés — dont **40 fichiers de code**, le reste étant des polices,
  des photos de démonstration et des tests
- **317 tests automatiques**, 315 passent, 0 échec, 2 ignorés
- `src/` : 67 fichiers (contre 57 dans l'ancienne version) → **10 nouveaux**

---

## 1. Le Studio (l'éditeur de site)

| Avant | Aujourd'hui |
|---|---|
| Entrée « Studio » invisible tant qu'aucun modèle n'était choisi | Entrée **toujours** dans le menu (bureau) et dans la barre du bas (téléphone) |
| `/dashboard/studio` renvoyait vers « Thèmes » sans explication | La page explique : « Ton Studio t'attend, choisis un modèle » |
| Un seul écran, en français seulement | Interface **bilingue** (français / arabe), écran d'aperçu autonome |
| — | Les zones vivantes (bouton d'achat, panier, formulaire) sont **protégées** dans l'éditeur |

Fichiers : `src/studio.js`, `src/studio-design.js`, `src/studio-ar.js`, `src/ui-ar.js`,
`public/_studio/studio.js`, `public/_studio/frame.js`, `public/_studio/apercu.html`.

## 2. Les reversements transporteurs (nouveau)

Ce que le transporteur encaisse et doit te rendre, enfin visible :

- « à recevoir » = ce que le client a payé − les frais de livraison
- un versement partiel laisse la commande **à moitié réglée**, le reste s'affiche comme dette
- on peut **annuler** un versement enregistré par erreur
- pastille dans le menu quand de l'argent est en attente

Fichiers : `src/payouts.js`, `src/views.js`, `server.js`, `tests/payouts.test.js`.

## 3. L'application s'installe (PWA)

- Boutique et tableau de bord **installables** sur téléphone (Android/iPhone), avec icônes
- Une page « hors ligne » quand la connexion tombe
- Bouton « Installer l'application »

Fichiers : `src/pwa.js`, `public/pwa.js`, `public/sw.js`, `src/appicon.js`, `tests/pwa.test.js`.

## 4. « Mes boutiques » — un seul écran

Tout ce que possède un vendeur avec plusieurs boutiques : argent, commandes à traiter,
produits, transporteurs, en un endroit.

Fichiers : `src/views.js`, `server.js`, `public/ndz-merchant.css`, `tests/boutiques.test.js`.

## 5. Polices arabes, sans Internet

Les polices arabes sont **dans le projet** (52 fichiers `public/fonts/`), plus d'appel à
Google Fonts : la page s'affiche correctement même sans connexion, et plus vite.

Fichiers : `src/fonts-ar.js`, `public/arabic-fonts.css`, `public/fonts/*`.

## 6. Les modèles de site et les vitrines

Site complet (boutique ou vitrine) qui s'ouvre dans le Studio, avec ses pages, ses
photos de démonstration et sa mise en page.

Fichiers : `src/site-templates.js`, `public/templates/*`, `public/demo/*`,
`scripts/importer-template.py`.

## 7. Prêt pour GitHub et Cloudflare

- `pousser-github.ps1` : un double-clic et le code monte sur ton dépôt
- `.github/workflows/ci.yml` : les 317 tests tournent à chaque envoi
- `DEPLOIEMENT-RAPIDE.md` : les 3 étapes
- `deploy/novadz.service` : lancement automatique sur un serveur

## 8. Ce qui n'a pas bougé

- `src/themes.js`, `src/fonts-ar.js`, `public/theme-fonts.css`, `public/arabic-fonts.css` :
  les thèmes et les polices d'origine sont respectés, rien n'a été réécrit.
- La structure du projet est la même : `server.js`, `src/`, `public/`, `tests/`.
  Un dossier ajouté ne casse rien : `npm start` fonctionne comme avant.

---

## Vérifier soi-même

```bash
npm install          # installe
npm test             # 317 tests
npm run demo         # comptes de démonstration + données d'exemple
```

Comptes : `demo@novadz.dz / demo1234` · `vitrine@novadz.dz / demo1234` ·
`admin@novadz.dz / admin1234`.
