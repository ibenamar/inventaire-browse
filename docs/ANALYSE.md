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
| C11 | « Entrées » regroupe production et livraisons | Pas de traçabilité de la provenance | Entrées avec **origine** : livraison du **laboratoire** (réception d'un bon de livraison), fournisseur (boissons), autre point de vente |
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
| **Sites** | 5 points de vente : Browse 2 Mars, Browse Sweets 2 Mars, Anfa, Hay Hassani, Palmier | Voir §6 : un laboratoire de pâtisserie alimente ces points de vente |
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

## 6. Décisions du 3ᵉ échange (10/11/2026)

| Sujet | Décision | Conséquence pour l'app |
|---|---|---|
| **Coût de revient** | Calculé et saisi **dans l'application** | Champ coût par produit, historisé (date d'effet) ; calcul à partir des fiches techniques en phase 5 |
| **Loyverse** | **Un seul compte** pour l'ensemble | Un jeton API ; chaque site est associé à un magasin Loyverse |
| **Ouverture des sites** | **2 points de vente ouverts**, 3 en cours d'ouverture | Statut de site `actif` / `en ouverture` ; un site s'active sans développement supplémentaire |
| **Planning** | Vue **semaine ou mois** ; objectif : **suivi des remontées** et **responsabilisation** de l'équipe | Tableau de suivi par responsable : comptages remontés à l'heure, en retard, manquants ; écarts attribués |
| **Laboratoire** | Un **laboratoire de pâtisserie** produit et livre les points de vente | Site de type `laboratoire` ; saisie de la **production** puis des **livraisons** vers les points de vente, rapprochées à la réception |

### 6.1 Flux laboratoire → points de vente

```
LABO : production saisie ──▶ stock labo ──▶ bon de livraison (site, produits, quantités) ──▶ EXPÉDIÉ
                                                                                         │
POINT DE VENTE : réception pendant le shift ouvert ◀──────────────────────────────────────┘
                 quantités pré-remplies, l'équipe confirme ou corrige ──▶ RÉCEPTIONNÉ
                 quantités reçues = « Entrées » du shift ; différence = écart de livraison
```

- **Production** : par produit et par jour (ou shift labo), avec le responsable ; les cakes sont produits et livrés **entiers**, convertis en 8 parts à la réception.
- **Stock labo** = production − livraisons − pertes ; un comptage labo permet de calculer l'écart du labo.
- **Écart de livraison** = reçu − expédié : identifie les pertes pendant le transport ou les erreurs de préparation.
- Les entrées manuelles restent possibles pour les boissons (fournisseur) et les dépannages.

## 7. Décisions du 4ᵉ échange (10/11/2026)

| Sujet | Décision | Conséquence pour l'app |
|---|---|---|
| **Sites ouverts** | **Browse 2 Mars** et **Browse Sweets 2 Mars** | Sites actifs au lancement ; Anfa, Hay Hassani et Palmier créés « en ouverture » ; pilote sur l'un des deux |
| **Laboratoire** | **Un seul shift** par jour ; **1 à 2 livraisons** par jour et par point de vente | Le labo a un créneau unique ; plusieurs bons de livraison possibles par jour et par site |
| **Boissons** | Livrées **directement par le fournisseur** aux points de vente | Entrée « réception fournisseur » saisie au point de vente, hors circuit labo |
| **Stock labo** | **Comptage quotidien** des produits finis en attente de livraison | Le shift labo a une ouverture / clôture comme un point de vente : écart labo = compté − (ouverture + production − livraisons − pertes) |
| **Horaires** | Saisis **dans l'application** | Écran de paramétrage des créneaux par site et par jour ; attention au **chevauchement sur deux jours** (§7.1) |

### 7.1 Shifts à cheval sur deux jours — règles

1. **Journée d'exploitation** = date de **début** du shift. Le shift du vendredi 20h → samedi 4h appartient au vendredi.
2. **Horaires applicables** = ceux du jour de **début** : le shift de nuit du vendredi suit la grille du vendredi, même s'il se termine un samedi (grille week-end).
3. **Saisie des créneaux** : une heure de fin inférieure à l'heure de début signifie « le lendemain » (20:00 → 04:00) ; l'écran l'affiche explicitement (« fin J+1 à 04:00 »).
4. **Contrôle de chevauchement** : à l'enregistrement de la grille, l'app refuse deux créneaux d'un même site qui se recouvrent, **y compris d'un jour sur l'autre** (ex. nuit du vendredi jusqu'à 4h et matin du samedi commençant à 3h).
5. **Trous** entre créneaux (ex. 4h → 7h) autorisés : aucune vente attendue ; une vente Loyverse dans un trou est rattachée au shift suivant et signalée.
6. **Planning** : le shift de nuit s'affiche sur la journée de début, avec la mention « jusqu'au lendemain 04:00 ».
7. **Import Loyverse** : fenêtre de reçus = horodatages réels d'ouverture et de clôture, quelle que soit la date calendaire.
8. **Enchaînement** : le shift suivant est le prochain créneau **dans le temps**, pas dans la journée (nuit du vendredi → matin du samedi).
9. **Clôture tardive** : un shift non clôturé à l'heure prévue reste ouvert et apparaît « en retard » dans le suivi des remontées ; le shift suivant ne peut pas s'ouvrir avant sa clôture (ou une clôture forcée par le manager, tracée).
10. **Heure** : toutes les dates sont calculées en heure du Maroc (`Africa/Casablanca`), y compris lors des changements d'heure (ramadan).

## 8. Questions restant ouvertes

Aucune question bloquante. À fournir au fil du projet : jeton API Loyverse, horaires des créneaux (saisis dans l'app), coûts de revient, stocks minimum, photos.

## 9. Ventes multi-canaux : analyse de l'export Loyverse (10/11/2026)

Constat remonté : un même article est vendu sur place et via Glovo sous deux SKU différents, avec un prix différent. L'export des articles Loyverse (462 articles, 2 magasins) le confirme et apporte trois autres constats.

| # | Constat | Exemple | Décision |
|---|---|---|---|
| L1 | Chaque article vendu sur Glovo est **dupliqué** en caisse, avec le **même nom**, un autre SKU et un prix plus élevé ; le canal est donné par la **catégorie « Glovo »** (149 articles) | Mango Can : 10342 « Can Cakes » 38 MAD / 10379 « Glovo » 49 MAD | Un **produit** (stock) a plusieurs **articles de caisse**, un par canal. Canal reconnu par la catégorie, puis par le nom. Les ventes de tous les canaux font sortir le même stock ; le CA utilise le prix réel |
| L2 | Les **prix diffèrent selon le magasin** | Carrot Cake 45 MAD au Coffee Shop, 40 chez Browse Sweet ; Lotus Can 30 / 38 | Prix enregistré **par magasin** ; chaque site est relié à son magasin Loyverse (BROWSE COFFEE SHOP → Browse 2 Mars, Browse Sweet → Browse Sweets 2 Mars, **à confirmer**) |
| L3 | Certains articles vendent **plusieurs unités** | Matilda Cake Entier (405 MAD), Brownie box of 4, box of 6 | **Facteur** par article : 1 vente = n unités de stock (gâteau entier × 8, boîte × 4) |
| L4 | Les noms du catalogue (fichier Excel) suivent la carte Glovo, pas les noms sur place | « Pistachio Kunafeh Can » = « Pistache Kunafa Can » ; « Cipriani Cake » = « Cipriani » | Table de correspondances validable : [`data/correspondances_loyverse.csv`](../data/correspondances_loyverse.csv) (120 lignes : 78 sûres, 33 probables, 9 à confirmer) |
| L5 | 34 articles ne sont plus en vente dans aucun magasin ; des articles à prix « variable » | Banofie, Muffins ; Mango cake | Articles hors vente non proposés au rattachement ; prix variable = prix inconnu |
| L6 | Environ 300 articles hors inventaire (cafés, lunch, brunch, suppléments…) | COFFEES, Latte, Lunch | Bouton « Ignorer la catégorie » dans l'écran Loyverse |

Résultat d'un import à blanc de l'export : **111 articles rattachés automatiquement** (61 sur place, 50 Glovo). Les autres sont à rattacher ou à ignorer dans l'écran Loyverse.

### 9.1 Ranger Glovo par catégorie : est-ce optimal ?

C'est **la bonne organisation compte tenu de Loyverse**, avec deux réserves.

- **Pourquoi elle est adaptée** : Loyverse ne permet pas un prix différent par mode de vente (sur place / livraison) pour un même article. Les alternatives sont moins bonnes : des *variantes* « Sur place / Glovo » sur chaque article obligeraient l'équipe à choisir la variante à chaque vente au comptoir (un geste de plus, des erreurs) ; un *magasin* Loyverse « Glovo » séparerait les stocks et les rapports de caisse du point de vente réel.
- **Réserve 1 — catalogue en double** : chaque nouveauté ou changement de nom doit être fait deux fois. Conseil : garder **exactement le même nom** des deux côtés (aujourd'hui « Classic Roll » sur place contre « Cinnamon Roll - Original » sur Glovo) et adopter une **plage de SKU** dédiée à Glovo pour les repérer d'un coup d'œil.
- **Réserve 2 — rapports par famille** : dans Loyverse, la catégorie « Glovo » mélange cakes, cafés et lunch. L'application, elle, rattache chaque article Glovo à son produit et à sa famille : les rapports par produit et par canal y sont complets.

### 9.2 Points à confirmer

1. Correspondance des magasins : BROWSE COFFEE SHOP = Browse 2 Mars, Browse Sweet = Browse Sweets 2 Mars ?
2. Les 9 lignes « à confirmer » du fichier de correspondances (ex. Vanilla Red Fruits Can = Strawberry Can ? nombre de parts du San Sebastian entier à 240 MAD et du Flan pistache entier à 315 MAD ; Matilda entier à 405 MAD = 9 × 45 alors qu'un gâteau fait 8 parts).
3. Produits du catalogue sans article sur place en caisse (19) : Blueberry Can, Oreo Can, Citron Roll, Flan Vanille, waffles, fettuccini… vendus seulement sur Glovo, ou à retirer du catalogue ?
4. Produits en vente en caisse mais absents du catalogue d'inventaire, à ajouter ? Caramel Can, Babka, Tiramisu Roll, Banana Bread (et entier), Matcha / Ubé / Strawberry cookie cheesecakes, Sunset Cake, Mango cake, Cookie Red Velvet / Lemon / Matcha / Tiramisu / Triple chocolat, KULT Kefir Gingembre Citron et Yuzu Mandarin, croissant, pain au chocolat.
