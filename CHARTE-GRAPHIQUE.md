# NovaDZ — charte graphique

Écrite le 6 novembre, au moment où on a rangé le dashboard.
**Elle sert à une seule chose : que deux écrans faits à six mois d'intervalle
se ressemblent.** Tout le reste — polices, couleurs, tailles — est déjà décidé
ici. Si un écran a besoin d'une règle qui n'est pas dans ce fichier, on
l'ajoute ici d'abord.

---

## 1. L'idée

Le marchand n'a pas le temps de lire une interface. Une page doit se comprendre
en trois secondes, sans réfléchir. Donc :

- **une page = une seule chose à faire**, et un seul bouton qui la fait ;
- **la hiérarchie vient de la taille et du vide**, jamais de la couleur ;
- **le gris est la couleur par défaut.** La couleur est une récompense.

C'est pour ça que tout est noir, blanc et gris. Ce n'est pas une absence de
décision : c'est ce qui fait que le seul bouton vert saute aux yeux.

---

## 2. Les couleurs

| Rôle | Valeur | Où |
|---|---|---|
| **Vert NovaDZ** (le seul accent) | `#0F766E` | le bouton qui enregistre, le liseré d'un champ actif, les liens au survol |
| Vert appuyé | `#0B5A53` | ce même bouton, au survol |
| Vert clair | `#5EEAD4` | **uniquement** sur fond sombre (écran de connexion, pastilles) |
| Vert en nappe | `#EFF6F4` | fond d'un bloc qu'on veut signaler sans crier |
| Encre (titres) | `#111111` | les titres, les chiffres |
| Texte | `#313131` | le corps de texte |
| Gris moyen | `#71717A` | les sous-titres, les aides |
| Gris clair | `#A1A1AA` | les étiquettes de section, les rappels |
| Papier (fond des pages) | `#F6F5F3` | le fond du dashboard |
| Carte | `#FFFFFF` | les blocs |
| Bordure de carte | `#EAE7E2` | le tour des blocs |
| Bordure de champ | `#DDD9D3` | le tour des champs |

Les quatre états gardent leurs couleurs, parce qu'un marchand doit les
reconnaître sans lire : succès `#15803D`, attention `#B45309`, information
`#1D4ED8`, danger `#B91C1C`.

**Rien d'autre.** Pas de bleu ailleurs, pas de violet, pas de dégradé.

---

## 3. La règle des boutons

C'est la règle la plus importante, celle qui a manqué le plus longtemps.

- **Un seul bouton en couleur par formulaire** : celui qui enregistre, qui
  crée, qui valide. Les marchands cliquent dessus sans chercher.
- Tous les autres sont **gris, à bordure fine** : « Ajouter », « Nouvelle
  page », « Récupérer les tarifs », « Exporter ». Ils restent là, ils ne
  crient pas.
- Les actions destructives sont **un lien rouge**, jamais un bouton plein.
- Les petites actions d'une ligne (modifier, voir) sont des **icônes grises**.

---

## 4. Le texte

Police : **Inter**, avec la police du système en secours.
Corps de texte 14 px, interligne 1,5.

| Usage | Taille | Graisse |
|---|---|---|
| Titre de page (`h1`) | 26 px | 600, interlettrage serré |
| Titre de bloc (`h2`) | 16 px | 600 |
| Étiquette de section | 12,5 px | 700, **majuscules**, espacées |
| Chiffre important (KPI) | 30 px | 600 |
| Étiquette de champ | 13 px | 600 |
| Champ | 15 px | 400 |
| Bouton | 13,5 px | 500 |
| Aide sous un champ | 12,5 px | 400, gris |

---

## 5. L'air et les angles

- **40 px** entre deux blocs. C'est le rythme (`--rhythm`).
- **24 px** de marge à l'intérieur d'une carte.
- **18 px** entre deux champs.
- Angles : 14 px pour les cartes, 10 px pour les champs, 9 px pour les
  boutons, 999 px pour les pastilles.
- Ombres : une seule, très douce (`0 1px 2px rgba(17,17,17,.03)`). Une ombre
  qu'on remarque est une ombre ratée.
- Largeur de lecture du dashboard : 1 060 px. Pas plus.

---

## 6. Le tiroir

Une page pose **trois questions**. Tout le reste descend dans un tiroir
« ▸ Plus de réglages ».

**Rien n'est jamais supprimé** : ce qui est plié est toujours dans la page, et
le tiroir s'ouvre tout seul quand les réglages qu'il contient sont déjà
remplis. Personne ne doit croire qu'on lui a volé une case.

---

## 7. Ce qui est interdit

- Plus d'une couleur d'accent à l'écran.
- Un emoji dans une interface (dans le contenu du marchand, c'est son choix).
- Deux boutons pleins côte à côte.
- Un dégradé, une ombre portée marquée, une bordure de 3 px.
- Du texte en dessous de 12 px.
- Un filet sous chaque ligne, alors que le vide suffit.

---

## 8. La vitrine

La vitrine (ce que voit le client) garde aujourd'hui son noir `#111111` comme
accent, avec ses six présentations : Calme, Claire (celle par défaut), Centré,
Affiche, Séparé, Large. **Les boutiques en ligne ne bougent pas** : le passage
de la vitrine sous cette charte se fera en une fois, quand on la rangera, et
les boutiques déjà publiées garderont leur rendu tant qu'on ne l'a pas décidé.
