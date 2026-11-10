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
| C3 | Références **P057 à P063 absentes** (saut de P056 à P064) | Produits non retenus | Confirmé : hors périmètre, non importés |
| C4 | « Format » renseigné uniquement pour les boissons | Ambiguïté de comptage (gâteau entier vs part) | Champ **unité de comptage** obligatoire (pièce, part, gâteau, bouteille…) |
| C5 | Crêpes, pancakes, waffles, fettuccini (20 produits) sont **préparés à la commande** | Les compter en stock fini n'a pas de sens | Produits « **vente seule** » : non inventoriés, ventes importées de Loyverse ; suivi de la production des préparations reporté (phase 4) |
| C6 | Le « shift » est en fait **une journée** (une copie d'onglet par jour) | Pas de notion de shift matin / soir, pas de passation | Shift = entité à part entière (site + date + créneau), plusieurs par jour possibles |
| C7 | Le stock d'ouverture est **recompté à la main** chaque jour, sans lien avec la clôture de la veille | Les pertes entre deux shifts (nuit, passation) sont invisibles | **Logique inter-shifts** : l'ouverture est pré-remplie avec la clôture du shift précédent ; un recomptage d'ouverture fait apparaître un **écart de passation** |
| C8 | Historique = onglets dupliqués et renommés | Aucune consolidation, pas de courbe d'évolution, risque d'écraser des formules, pas d'audit | Base de données centrale + interface d'administration |
| C9 | Valeur de l'écart calculée au **prix de vente** | Mesure le manque à gagner, pas la perte réelle | Afficher les deux : valeur au coût (perte réelle) et au prix de vente (manque à gagner) |
| C10 | « Pertes / offerts » regroupés | Impossible de distinguer les causes | Pertes avec **motif** obligatoire : péremption ou endommagé |
| C11 | « Entrées » regroupe production et livraisons | Pas de traçabilité de la provenance | Entrées avec **origine** (production sur place, fournisseur, autre site). Les 5 sites sont des points de vente, sans laboratoire central |
| C12 | Ventes ressaisies depuis la caisse (Loyverse) | Double saisie, erreurs | **Import automatique depuis l’API Loyverse**, saisie manuelle en secours |
| C13 | Aucune photo des produits | Erreurs d'identification lors du comptage | Photo obligatoire par produit, affichée en grille dans l'écran de comptage |
| C14 | Validation de données uniquement « entier ≥ 0 » | Fautes de frappe (ex. 100 au lieu de 10) non détectées | Contrôle de vraisemblance : alerte si écart > seuil ou quantité très supérieure à l'habitude |

## 3. Règles métier retenues

### 3.1 Cycle de vie d'un shift

```
 PLANIFIÉ ──ouvrir──▶  OUVERT  ──clôturer (comptage final)──▶  CLÔTURÉ  ──valider (manager)──▶  VALIDÉ (verrouillé)
                         │
                         └─ saisies en cours : entrées, ventes, pertes
```

- Un shift est créé à l'avance dans le **planning** (site, date, créneau, équipe, responsable d'inventaire).
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

## 4. Décisions validées (10/11/2026)

| Sujet | Décision | Conséquence pour l'app |
|---|---|---|
| **Shifts** | 2 ou 3 shifts par jour selon le site : **7h–15h**, **15h–20h**, **20h–3h/4h** | Créneaux paramétrables par site ; le shift de nuit déborde après minuit et reste rattaché à la **journée d'exploitation** du jour où il commence |
| **Cakes** | Vendus **à la part** | Unité de comptage = part ; entrée d'un gâteau entier convertie en parts (`parts_par_gateau` par produit) |
| **Stock minimum** | Paramétrage **par site** | Table `ProduitSite` (déjà prévue) |
| **Planning** | Planning prévisionnel des shifts avec un **responsable d'inventaire** désigné | Nouveau module Planning ; le responsable d'inventaire signe le comptage du shift |
| **Pertes** | Deux motifs : **Péremption** et **Endommagé** (impropre à la vente) | Motif obligatoire ; la notion « offerts » du fichier Excel est abandonnée |
| **Caisse** | **Loyverse** | Import automatique des ventes par l'API Loyverse (reçus), sur la plage horaire du shift |
| **Matériel** | Tablette **ou** téléphone | Interface mobile-first, responsive, installable (PWA) |
| **Équipe** | **1 à 2 employés** par shift | Équipe du shift tracée ; PIN individuel pour attribuer chaque saisie |

### 4.1 Règles complémentaires issues des décisions

- **Journée d'exploitation** : un shift appartient à la date de son début. Le shift 20h–4h du 10/11 est rattaché au 10/11, même s'il se termine le 11/11 à 4h.
- **Enchaînement** : sur un site à 3 shifts, l'ordre est matin → après-midi → nuit → matin du lendemain. La clôture de la nuit alimente l'ouverture du matin suivant ; l'écart de passation éventuel est attribué au shift qui a clôturé.
- **Responsable d'inventaire** : un par shift, désigné à l'avance dans le planning. Lui seul (ou un manager) peut clôturer le shift. En cas d'absence, le manager réaffecte la responsabilité ; le changement est tracé.
- **Ventes Loyverse** : les reçus dont l'horodatage est compris entre l'ouverture et la clôture du shift sont agrégés par produit (correspondance produit ↔ article / SKU Loyverse). Les remboursements sont déduits. La saisie manuelle reste possible si l'API est indisponible.
- **Pertes** : chaque perte = quantité + motif (péremption / endommagé) + commentaire facultatif + photo facultative.

## 5. Décisions complémentaires (10/11/2026)

| Sujet | Décision | Conséquence pour l'app |
|---|---|---|
| **Sites** | 5 points de vente : 2 Mars, Anfa, Hay Hassani, Palmier, **Browse Sweets** | Pas de laboratoire central ; tous les sites ont le même type |
| **Créneaux** | Browse Sweets : 3 shifts, horaires **différents selon le jour** (semaine / week-end) | Créneaux paramétrés **par site et par jour de la semaine** |
| **Cakes** | **8 parts**, découpés sur place | `parts_par_gateau = 8` ; un gâteau entier non découpé compte pour 8 parts au comptage ; une entrée de 1 gâteau = 8 parts |
| **Produits à la commande** | Hors inventaire pour l'instant | `suivi_stock = non` ; ventes seules |
| **Production des préparations** | Utile pour la comparer aux ventes, **reportée** | Phase 4 : fiches de préparation, production saisie par shift, rapprochement avec les ventes Loyverse |
| **P057 à P063** | Articles non retenus | Non importés |
| **Prix de vente** | Déjà dans **Loyverse** | Import des prix depuis Loyverse, Loyverse reste la référence des prix |
| **SKU** | Présents sur les articles Loyverse | Correspondance automatique produit ↔ article par SKU |
| **API Loyverse** | Identifiants à demander | L'API publique Loyverse existe (jeton d'accès créé dans le Back Office, rubrique *Intégrations › Jetons d'accès*) ; à obtenir en phase 0 |
| **Wi-Fi** | Fiable en boutique | Mode hors-ligne complet non prioritaire ; simple reprise automatique en cas de coupure brève |
| **Photos** | Absentes de Loyverse | Prise de photo **directement depuis le téléphone** dans l'admin du catalogue |
| **Planning** | Préparé par le **manager** de site et la **direction** | Droits d'édition du planning pour ces deux rôles |

## 6. Questions restant ouvertes (non bloquantes pour démarrer)

1. **Horaires des créneaux** : grille par site et par jour de la semaine (Browse Sweets semaine / week-end, et les 4 autres sites : 2 ou 3 shifts, fin de nuit à 3h ou 4h). Ce sont des paramètres, saisissables après la livraison.
2. **Coût de revient** : disponible dans Loyverse (champ « coût » de l'article) ou à fournir ? Sans coût, les écarts et pertes sont valorisés au prix de vente seulement.
3. **Loyverse** : un seul compte pour les 5 magasins ? (détermine la correspondance site ↔ magasin)
4. **Planning** : horizon souhaité (semaine ou mois) ?
