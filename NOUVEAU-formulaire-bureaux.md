# Les 3 ajouts demandés — comment les utiliser

Serveur de démo : `http://localhost:3800` — `demo@novadz.dz` / `demo1234`, boutique `amina-mode`.
Tests automatiques : **129/129**.

---

## 1. Bureaux de livraison importés depuis l'API du transporteur

**Côté marchand — Transporteur**
1. Ouvre `/dashboard/transporteur`, renseigne l'API (URL, en-têtes, chemins) puis **Tester la connexion**.
2. Clique **Importer depuis l'API du transporteur** : les bureaux (nom, wilaya, commune, adresse, téléphone) sont enregistrés dans la table `carrier_centers`.
3. Le tableau **Bureaux de livraison** affiche ce qui est enregistré (60 premiers).
4. Pas d'API ? Ouvre **Coller la liste à la main**, une ligne par bureau :
   `Nom du bureau ; Wilaya ; Commune ; Adresse ; Téléphone`

**Côté client** : au checkout, si le transporteur a des bureaux, un champ **Bureau de retrait** apparaît, filtré par la wilaya choisie. Le bureau retenu est écrit dans la commande (« Bureau : … » dans la note).

---

## 2. Formulaire de commande modifiable par le marchand

Page `/dashboard/formulaire` (lien **Formulaire** dans la barre de gauche, juste après Design).

- Tableau des champs : **actif**, **libellé**, **type**, **obligatoire**, **Supprimer**.
- Bloc **Ajouter un champ** : libellé + type (`text`, `tel`, `email`, `textarea`, `select`) — 20 champs max.
- Les 7 champs système (`customer_name`, `phone`, `wilaya`, `commune`, `address`, `note`, `email`) restent branchés sur la commande.
- Les champs libres sont enregistrés dans `orders.form` et **affichés dans la fiche de la commande**.
- Si tu masques nom / téléphone / adresse, la commande passe quand même (valeurs de repli `Client` / `—`) : plus d'erreur SQL.

Stockage : colonne `stores.form_fields` (JSON).

---

## 3. Formulaire directement sur la fiche produit (sans bouton panier)

1. Ouvre `/dashboard/design` → onglet **Apparence**.
2. Section **Fiche produit** → choisis `bouton` (comportement classique) ou **`inline`**.
3. **Enregistrer**, puis **Publication → Publier**.
4. Ouvre `/amina-mode/p/1` : le formulaire complet (nom, téléphone, wilaya, commune, adresse, note, livraison, paiement, quantité) est sur la page.
5. Le client valide → commande créée directement, sans passer par le panier (`buy_id` / `buy_qty`).

---

## Fichiers touchés

| Fichier | Rôle |
|---|---|
| `src/checkoutform.js` | champs configurables + validation |
| `src/carriers.js` | `refreshCenters`, `centersForWilaya`, `addCenter` |
| `src/carriers-generic.js` | lecture wilaya / commune / adresse / téléphone dans l'API |
| `src/layouts.js` | `inlineOrderForm`, `deskSelect` (bureau de retrait) |
| `src/views.js` | `dashForm`, tableau des bureaux, réponses libres dans la commande |
| `server.js` | `/dashboard/formulaire`, `/dashboard/transporteur/centres/manual`, `buy_id`, `desk` |
| `public/editor.js`, `public/styles.css` | réglages + styles du formulaire |
