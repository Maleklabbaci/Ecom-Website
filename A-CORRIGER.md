# NovaDZ — suivi des corrections

Revue de code initiale du **20/10/2026** (chaque point avait été reproduit sur un serveur de test).
Corrections appliquées en vagues A et B, état vérifié le **27/10/2026** :
`npm test` = **233 tests, 231 verts, 0 échec, 2 ignorés** (navigateur absent).

Légende : ✅ corrigé · ⚠️ partiel (choix documenté) · ⏸️ reporté volontairement.

---

## P0 — bloquants

### 1. Photo > ~190 Ko refusée en « Erreur serveur » ✅
Limites relevées (8 Mo), rejet anticipé avec un **413 au message clair** (« Photo trop lourde… »)
au lieu d'un 500, et compression côté navigateur avant envoi (`public/upimg.js`).

### 2. Prix et stock acceptaient n'importe quoi ✅
Un seul parseur argent `parseDzdCents()` (tolère « 1 200,50 », refuse vide/négatif/non numérique)
et `parseQty()` ; les formulaires produit affichent l'erreur au lieu d'un 500. Montants stockés en centimes.

### 3. Le CA comptait les commandes annulées ✅
Vérifié : les calculs de chiffre d'affaires excluent les statuts `annulee` et `fake`
(statuts internes sans accent, une seule source de vérité).

### 4. Le statut de commande acceptait n'importe quel texte ✅
Vérifié : liste blanche stricte des statuts à l'écriture.

### 5. Changer de thème effaçait le logo ✅
À la publication, le logo du brouillon est conservé (`design.logo` repris, plus de `design = NULL` destructeur).

## P1 — sécurité

### 6. Compte admin créé d'office avec mot de passe public ✅
Le seed de démonstration ne tourne que si **`NOVADZ_DEMO=1`**. Sans cette variable, le premier
démarrage crée uniquement `admin@novadz.dz` avec un **mot de passe aléatoire affiché une seule fois**
dans la console. Les bases existantes ne sont pas touchées.

### 7. Protection CSRF ⚠️ (choix documenté)
Pas de jetons par formulaire. À la place : **vérification de l'en-tête `Origin`** (l'hôte doit
correspondre) sur toutes les requêtes non-GET + cookies `SameSite=lax`. Les requêtes **sans**
`Origin` passent (webhooks transporteurs). Suffisant contre les attaques navigateur classiques ;
à durcir en jetons si un jour des clients non-navigateur doivent être distingués des navigateurs.

### 8. Aucune limitation de débit ✅
Verrouillage connexion : 10 échecs → 15 min de blocage (par IP + identité).
Quotas : checkout 30/10 min, avis 10/h, suivi de commande 60/10 min.

### 9. Sessions en mémoire, jamais nettoyées ⚠️
Toujours en mémoire (un redémarrage déconnecte tout le monde — noté dans le README),
mais **purge après 30 jours d'inactivité** et **régénération du `sid` à la connexion**
(anti-fixation). Le passage en table SQLite reste à faire le jour où plusieurs
processus devront partager les sessions.

### 10. Cookies et en-têtes ✅
`trust proxy` conditionnel (ou `NOVADZ_TRUST_PROXY=1`), `Content-Security-Policy`,
`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `X-Powered-By` retiré,
cookies durcis. La CSP autorise le style/script **inline** (nécessaire au HTML libre des
thèmes marchands) mais pas `unsafe-eval`.

### 11. Pages publiques trop bavardes ✅
Suivi de commande : téléphone masqué. Déconnexion en **POST uniquement**
(le GET affiche une page de confirmation, les anciens liens continuent de marcher).
Export CSV : anti-injection de formules (`=`, `+`, `-`, `@` préfixés).

### 12. Envoi d'images sans contrôle réel ⚠️
Signature binaire vérifiée (`sniffExt` : PNG/JPEG/WebP réels), nom de fichier = empreinte
du contenu, suppression seulement si le fichier n'est plus référencé (`removeUrl(url, db)`),
image nettoyée à la suppression du produit. **Reste à faire** : quota de stockage par boutique.

## P2 — données et robustesse

### 13. Tarifs de livraison : une faute de frappe = livraison gratuite ✅
Validation complète **avant toute écriture** : tarif négatif ou non numérique → rien n'est
enregistré, message clair. Le tarif bureau reste cohérent avec le tarif domicile.

### 14. Champs sans limite de longueur ✅
Troncatures systématiques (nom 80, adresse 200, titre 140, description 5 000…).

### 15. Téléphone non normalisé à l'enregistrement ⏸️
Reporté volontairement : la normalisation sert au scoring de risque et à la liste noire,
mais le numéro affiché au marchand reste celui saisi par le client. À reprendre si les
doublons clients deviennent un vrai problème (stocker normalisé + brut séparément).

### 16. Relances envoyées deux fois après redémarrage ✅
Dédoublonnage adossé à la base de données : il survit aux redémarrages.

## P3 — performance et qualité

### 17. Rien compressé, rien en cache ✅
`compression` (gzip) activée, cache statique : code 1 h, médias 30 j, empreintes `?v=`.
Reste un chantier cosmétique : dédupliquer les anciens blocs de `styles.css`.

### 18. Tests : zones non couvertes ✅
De 45 à **233 tests** : upload, validation produit, statuts, tarifs, éditeur/thèmes,
permissions entre marchands, landing, preuve visuelle (ignorés si Chrome absent).

### 19. Divers ⚠️
Fait : `favicon.ico`, `robots.txt` + sitemap, page 500 personnalisée, `Restart=always`
déjà présent dans `deploy/novadz.service`. Reste : **sauvegarde automatique de
`data/novadz.db`** côté déploiement, et `express` est en `^4.22.3` (pas figé au patch près).

---

## Ce qui reste à faire (par ordre)

1. **Sauvegarde automatique** de `data/novadz.db` (cron + copie horodatée) — le seul point
   qui peut coûter des données.
2. **Sessions en SQLite** si les redémarrages nocturnes déconnectent trop de marchands.
3. **Quota d'images par boutique** (point 12) avant d'ouvrir à beaucoup de marchands.
4. Jetons **CSRF** si le modèle « Origin + SameSite » ne suffit plus (point 7).
5. Cosmétique : avatars `face-1/2/3.jpg` et `faces.png` référencés dans le CSS de la landing
   mais absents (bloc masqué, aucune erreur console constatée) ; déduplication de `styles.css`.
