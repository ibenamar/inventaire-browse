# Analyse du fichier existant — `Inventaire_Shift_Browse.xlsx`

> Objet : comprendre le processus actuel de suivi du stock, en relever les limites et en déduire les règles métier de l'application.
> Date de l'analyse : 09/11/2026.

## 1. Structure du classeur

| Onglet | Rôle | Contenu |
|---|---|---|
| **Mode d'emploi** | Procédure | 6 étapes : catalogue → copie quotidienne de l'onglet Shift → comptage d'ouverture → entrées/pertes → ventes + comptage de fin → calculs automatiques. |
| **Catalogue** | Référentiel produits | 66 produits, colonnes `Réf, Catégorie, Produit, Format, Prix de vente (MAD), Stock minimum`. |
| **Shift** | Feuille de comptage (modèle à dupliquer chaque jour) | En-tête `Date / Site / Responsable` + 4 indicateurs ; une ligne par produit (lignes 7 à 72). |

### Catalogue (66 produits, 10 catégories)

| Catégorie | Nb | Nature du produit |
|---|---:|---|
| Desserts en pot (Can) | 8 | Produit fini, comptable à l'unité |
| Cakes & Cheesecakes | 10 | Produit fini — **unité à préciser (gâteau entier ou part ?)** |
| Rolls | 9 | Produit fini, comptable à l'unité |
| Cookies & Brownies | 7 | Produit fini, comptable à l'unité |
| Crêpes | 5 | **Préparé à la commande** |
| Mini Pancakes | 7 | **Préparé à la commande** |
| Waffles | 4 | **Préparé à la commande** |
| Fettuccini | 4 | **Préparé à la commande** |
| Flans | 2 | Produit fini, comptable à l'unité |
| Boissons fraîches | 10 | Produit acheté, 330 ml, comptable à l'unité |

Export brut disponible dans [`data/catalogue.csv`](../data/catalogue.csv) (servira de jeu d'initialisation).

### Feuille Shift — saisies et calculs

| Colonne | Type | Règle |
|---|---|---|
| E. Stock ouverture | saisie (entier ≥ 0) | compté en début de shift |
| F. Entrées | saisie (entier ≥ 0) | production ou livraisons reçues |
| G. Ventes du jour | saisie (entier ≥ 0) | reprise du rapport caisse / plateforme |
| H. Pertes / offerts | saisie (entier ≥ 0) | casse, périmés, offerts |
| I. Stock théorique fin | calcul | `ouverture + entrées − ventes − pertes` |
| J. Stock réel fin | saisie (entier ≥ 0) | compté en fin de shift |
| K. Écart | calcul | `réel − théorique` (négatif = manquant non expliqué, surligné en rouge) |
| L. Valeur écart | calcul | `écart × prix de vente` |
| M. CA | calcul | `ventes × prix de vente` |
| N. Alerte | calcul | « À réappro » si `réel fin < stock minimum` |

Indicateurs d'en-tête : total articles vendus, CA du jour, valeur des écarts, nombre de produits à réapprovisionner, nombre de produits avec écart.

Sites proposés dans la liste déroulante : **2 Mars, Anfa, Hay Hassani, Palmier, Browse Sweets**.

## 2. Constats et anomalies

| # | Constat | Impact | Décision proposée pour l'app |
|---|---|---|---|
| C1 | **Prix de vente vides** pour les 66 produits | CA et valeur des écarts toujours à 0 | Prix obligatoire pour activer un produit ; ajouter aussi un **coût de revient** |
| C2 | **Stock minimum vide** partout | L'alerte « À réappro » ne se déclenche jamais | Stock minimum **par site** (les besoins diffèrent d'un point de vente à l'autre) |
| C3 | Références **P057 à P063 absentes** (saut de P056 à P064) | Produits supprimés ou oubliés ? | À confirmer ; l'app conserve les produits archivés plutôt que de les supprimer |
| C4 | « Format » renseigné uniquement pour les boissons | Ambiguïté de comptage (gâteau entier vs part) | Champ **unité de comptage** obligatoire (pièce, part, gâteau, bouteille…) |
| C5 | Crêpes, pancakes, waffles, fettuccini (20 produits) sont **préparés à la commande** | Les compter en stock fini n'a pas de sens : stock toujours 0, écart non pertinent | Marquer ces produits « **vente seule** » (non inventoriés) ; inventorier leurs ingrédients plus tard (phase 4) |
| C6 | Le « shift » est en fait **une journée** (une copie d'onglet par jour) | Pas de notion de shift matin / soir, pas de passation | Shift = entité à part entière (site + date + créneau), plusieurs par jour possibles |
| C7 | Le stock d'ouverture est **recompté à la main** chaque jour, sans lien avec la clôture de la veille | Les pertes entre deux shifts (nuit, passation) sont invisibles | **Logique inter-shifts** : l'ouverture est pré-remplie avec la clôture du shift précédent ; un recomptage d'ouverture fait apparaître un **écart de passation** |
| C8 | Historique = onglets dupliqués et renommés | Aucune consolidation, pas de courbe d'évolution, risque d'écraser des formules, pas d'audit | Base de données centrale + interface d'administration |
| C9 | Valeur de l'écart calculée au **prix de vente** | Mesure le manque à gagner, pas la perte réelle | Afficher les deux : valeur au coût (perte réelle) et au prix de vente (manque à gagner) |
| C10 | « Pertes / offerts » regroupés | Impossible de distinguer casse, périmé, offert client, repas staff | Pertes avec **motif** obligatoire |
| C11 | « Entrées » regroupe production et livraisons | Pas de traçabilité de la provenance (labo, fournisseur, autre site) | Entrées avec **origine** ; « Browse Sweets » semble être le laboratoire de production → transferts labo → sites (à confirmer) |
| C12 | Ventes ressaisies depuis la caisse | Double saisie, erreurs | Saisie manuelle au MVP, **import caisse** (CSV puis API) ensuite |
| C13 | Aucune photo des produits | Erreurs d'identification lors du comptage | Photo obligatoire par produit, affichée en grille dans l'écran de comptage |
| C14 | Validation de données uniquement « entier ≥ 0 » | Fautes de frappe (ex. 100 au lieu de 10) non détectées | Contrôle de vraisemblance : alerte si écart > seuil ou quantité très supérieure à l'habitude |

## 3. Règles métier retenues

### 3.1 Cycle de vie d'un shift

```
 (aucun)  ──ouvrir──▶  OUVERT  ──clôturer (comptage final)──▶  CLÔTURÉ  ──valider (manager)──▶  VALIDÉ (verrouillé)
                         │
                         └─ saisies en cours : entrées, ventes, pertes
```

- Un seul shift **ouvert** par site à la fois.
- Un shift clôturé n'est modifiable que par un manager (avec trace dans le journal d'audit) ; un shift validé est verrouillé.

### 3.2 Calculs (par produit, par shift)

```
ouverture_théorique   = stock_réel_fin du shift précédent (même site)
écart_passation       = ouverture_comptée − ouverture_théorique        (si recomptage d'ouverture)
stock_théorique_fin   = ouverture + entrées + transferts_reçus − ventes − pertes − transferts_envoyés
écart                 = stock_réel_fin − stock_théorique_fin
valeur_écart_coût     = écart × coût_unitaire
valeur_écart_vente    = écart × prix_vente
CA                    = ventes × prix_vente
alerte_réappro        = stock_réel_fin < stock_minimum(site, produit)
```

- Premier shift d'un site (pas d'historique) : l'ouverture est saisie entièrement.
- Produits « vente seule » : seules les ventes sont saisies, pas de stock ni d'écart.

### 3.3 Mode de comptage d'ouverture (paramètre par site)

| Mode | Fonctionnement | Usage |
|---|---|---|
| **Reprise** (par défaut) | L'ouverture = clôture précédente, pas de recomptage | Rapide ; passation de confiance |
| **Recomptage** | L'équipe entrante recompte ; l'écart de passation est enregistré | Contrôle fort des pertes entre équipes |

## 4. Questions ouvertes (à valider avant le développement)

1. **Shifts** : combien de shifts par jour et par site (ex. matin / soir) ? Horaires ?
2. **Browse Sweets** : est-ce le laboratoire central qui produit et livre les 4 boutiques, ou un 5ᵉ point de vente ?
3. **Cakes** : vendus entiers, à la part, ou les deux ? Combien de parts par gâteau ?
4. **Produits à la commande** (crêpes, pancakes, waffles, fettuccini) : confirmez-vous qu'ils sont hors inventaire (ventes seules) ?
5. **P057 à P063** : produits supprimés ou à réintégrer ?
6. **Prix, coûts, stocks minimum** : qui fournit les valeurs ? Sont-ils identiques sur tous les sites ?
7. **Caisse** : quel logiciel / quelles plateformes de livraison ? Un export CSV des ventes est-il disponible ?
8. **Matériel** : saisie sur tablette au comptoir, sur smartphone, ou les deux ? Connexion Wi-Fi fiable en boutique ?
9. **Utilisateurs** : nombre d'employés par site ; connexion par code PIN partagé ou individuel ?
10. **Photos** : existe-t-il des visuels produits (site, réseaux sociaux) ou faut-il les prendre ?
