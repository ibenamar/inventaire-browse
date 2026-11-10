# Feuille de route — Application d'inventaire inter-shifts (Browse)

> Basée sur l'analyse du fichier de suivi existant et les décisions des échanges du 10/11/2026 : voir [ANALYSE.md](ANALYSE.md).

## 1. Objectif

Remplacer le classeur Excel dupliqué chaque jour par une application qui :

1. permet aux équipes de **saisir le stock en quelques minutes**, sur tablette ou téléphone, à partir d'une grille de produits illustrés par **leur photo** ;
2. **enchaîne les shifts** (jusqu'à 3 par jour : 7h–15h, 15h–20h, 20h–3h/4h) : le stock de clôture d'un shift devient le stock d'ouverture du suivant, et tout écart est attribué au bon shift et à son responsable ;
3. organise les shifts à l'avance grâce à un **planning prévisionnel** (semaine ou mois) désignant un **responsable d'inventaire** par shift, pour suivre les remontées et responsabiliser l'équipe ;
4. trace la **production du laboratoire** et ses **livraisons** vers les points de vente, rapprochées à la réception ;
5. récupère automatiquement les **ventes depuis Loyverse** ;
6. donne à l'administration une **vision consolidée et historisée** du stock, de ses variations, des pertes, des écarts et des besoins de réapprovisionnement, par site et par produit.

## 2. Utilisateurs et rôles

| Rôle | Accès |
|---|---|
| **Employé** (1 à 2 par shift) | Rejoindre le shift prévu, saisir comptages, entrées et pertes |
| **Responsable d'inventaire** (1 par shift, désigné dans le planning) | + ouvrir le shift, valider le comptage et **clôturer** le shift (signature) |
| **Manager de site** | + préparer le planning de son site (avec la direction), réaffecter un responsable absent, corriger / valider les shifts, rapports du site |
| **Équipe laboratoire** | Saisir la production, préparer et expédier les bons de livraison, déclarer les pertes du labo |
| **Direction / Administrateur** | + planning de tous les sites, catalogue (produits, photos, prix, coûts), sites et créneaux, utilisateurs, connexion Loyverse, tous les rapports, exports |

## 3. Périmètre fonctionnel

### 3.1 Planning prévisionnel

- Créneaux saisis dans l'app **par site et par jour de la semaine** (2 ou 3 shifts en point de vente, 1 au labo ; horaires différents le week-end, ex. Browse Sweets 2 Mars).
- **Shifts à cheval sur deux jours** : rattachés au jour de début, contrôle des chevauchements entre jours consécutifs (règles détaillées dans [ANALYSE.md §7.1](ANALYSE.md)).
- Planning préparé par le **manager** de site et la **direction**.
- Vue **semaine** ou **mois** par site : pour chaque créneau, l'équipe (1 à 2 employés) et le **responsable d'inventaire**.
- Duplication d'une semaine type ; réaffectation en cas d'absence (tracée).
- Contrôles : shift sans responsable, employé planifié sur deux sites en même temps.
- **Suivi des remontées** : shifts non ouverts, non clôturés ou clôturés en retard ; taux de remontée à l'heure et écarts **par responsable d'inventaire** (responsabilisation).

### 3.2 Application de saisie (téléphone / tablette, PWA mobile-first)

- Connexion par **code PIN individuel** ; l'appareil reste attaché à son site.
- L'écran d'accueil propose le **shift en cours d'après le planning** et affiche son responsable.
- **Ouverture** : stock pré-rempli depuis la clôture du shift précédent ; recomptage optionnel ou obligatoire selon le site (écart de passation).
- **Grille de comptage** : cartes produit avec photo, nom et unité (pièce, **part**, bouteille) ; boutons `−` / `+` et pavé numérique ; filtre par catégorie ; recherche ; progression « compté / restant ». Mise en page 2 colonnes sur téléphone, 4 à 5 sur tablette.
- **Entrées** : réception de production ou de livraison ; pour les cakes, saisie en gâteaux entiers ou en parts (conversion automatique).
- **Pertes** : quantité + motif **Péremption** ou **Endommagé** + commentaire et photo facultatifs.
- **Ventes** : importées de Loyverse à la clôture ; affichées en lecture seule ; saisie manuelle si l'import échoue.
- **Clôture** (par le responsable d'inventaire) : comptage final, récapitulatif des écarts avec alerte sur les écarts anormaux, commentaire, signature.
- Sauvegarde à chaque saisie ; tolérance aux coupures réseau.

### 3.3 Laboratoire : production et livraisons

- **Saisie de production** au labo : produit, quantité (cakes en gâteaux entiers), date, responsable.
- **Bon de livraison** : point de vente destinataire, produits et quantités ; statut préparé → expédié → réceptionné.
- **Réception** au point de vente pendant le shift ouvert : quantités pré-remplies, l'équipe confirme ou corrige ; les quantités reçues deviennent les **entrées** du shift (cakes convertis en 8 parts).
- **Écart de livraison** (reçu − expédié) et **stock labo** : shift labo unique par jour avec comptage quotidien des produits finis en attente de livraison.
- 1 à 2 livraisons par jour et par point de vente.
- Les **boissons** ne passent pas par le labo : réception fournisseur saisie au point de vente.
- Rapports : production par produit / jour, livraisons par point de vente, écarts de livraison.

### 3.4 Intégration Loyverse

- Connexion par **un jeton d'accès** au compte Loyverse unique (stocké côté serveur).
- Correspondance **produit ↔ article Loyverse** (par SKU ou identifiant d'article) et **site ↔ magasin Loyverse**.
- Import des **reçus** de la plage horaire du shift, agrégés par produit, remboursements déduits.
- Import des articles, **SKU** et **prix de vente** depuis Loyverse (Loyverse reste la référence des prix ; coût importé s'il est renseigné).
- Relance manuelle de l'import et journal des synchronisations.

### 3.5 Interface d'administration (web)

- **Tableau de bord** : CA, pertes (par motif), écarts (valeur au coût et au prix de vente), produits à réapprovisionner, shifts non clôturés — par site et consolidé.
- **Évolution du stock** : courbe par produit / site sur une période, détail shift par shift.
- **Rapports d'écarts** : produits et shifts les plus déficitaires, écarts par responsable d'inventaire, écarts de passation.
- **Rapports de pertes** : péremption vs endommagé, par produit et par site (aide à ajuster la production).
- **Historique des shifts** : consultation, correction tracée, validation.
- **Catalogue** : produits, catégories, photos, unité, parts par gâteau, prix, **coût de revient saisi dans l'app** (historisé), type (inventorié / vente seule), correspondance Loyverse, stock minimum **par site**.
- **Sites** (point de vente / laboratoire, actif / en ouverture), **créneaux, utilisateurs**.
- **Exports** Excel / CSV.

## 4. Modèle de données

```
Site(id, nom, type[point_de_vente|laboratoire], statut[actif|en_ouverture],
     mode_ouverture[reprise|recomptage], loyverse_store_id)
Creneau(id, site_id, jours_semaine[], nom, heure_debut, heure_fin, ordre, actif)
                                                -- ex. lun–ven 07:00–15:00 ; sam–dim horaires propres
Categorie(id, nom, ordre)
Produit(id, ref, nom, categorie_id, unite[piece|part|bouteille], format,
        parts_par_gateau, prix_vente, photo_url, suivi_stock[bool],
        loyverse_item_id, loyverse_sku, actif, ordre)
CoutProduit(produit_id, cout_unitaire, date_effet, saisi_par)        -- coût de revient historisé
ProduitSite(produit_id, site_id, stock_minimum, actif)
Utilisateur(id, nom, pin_hash, role, sites[])
Shift(id, site_id, creneau_id, journee, debut_prevu, fin_prevue,   -- journee = date d'exploitation
      responsable_id, statut[planifie|ouvert|cloture|valide],
      ouvert_par, ouvert_le, cloture_par, cloture_le, valide_par,
      commentaire, shift_precedent_id, ventes_importees_le)
EquipeShift(shift_id, utilisateur_id)                               -- 1 à 2 employés
LigneShift(shift_id, produit_id, ouverture_theorique, ouverture_comptee,
           entrees, ventes, pertes_peremption, pertes_endommage,
           transferts_in, transferts_out, stock_reel_fin)           -- calculs dérivés
Mouvement(id, shift_id, produit_id, type[entree|vente|perte|transfert|ajustement],
          quantite, motif[peremption|endommage], commentaire, photo_url,
          origine_site_id, source[manuel|loyverse], utilisateur_id, horodatage)
Production(id, labo_id, journee, produit_id, quantite, responsable_id, horodatage)
Livraison(id, labo_id, site_id, statut[preparee|expediee|receptionnee],
          expediee_par, expediee_le, receptionnee_par, receptionnee_le, shift_id)
LigneLivraison(livraison_id, produit_id, qte_expediee, qte_recue)    -- écart = reçu − expédié
SyncLoyverse(id, shift_id, debut, fin, statut, nb_recus, erreur, horodatage)
JournalAudit(id, utilisateur_id, action, entite, avant, apres, horodatage)
```

## 5. Choix techniques proposés

| Besoin | Proposition | Raison |
|---|---|---|
| Front saisie + admin | **Next.js (React) + TypeScript**, PWA installable, mobile-first | Une seule base de code pour téléphone, tablette et admin |
| Backend / BDD | **Supabase** (PostgreSQL, Auth, Storage, Edge Functions) | Historique relationnel, photos, droits par rôle (RLS), tâches serveur |
| Loyverse | Fonction serveur appelant l'API Loyverse (reçus, articles, magasins) | Le jeton API ne quitte jamais le serveur |
| UI | Tailwind CSS, grandes zones tactiles | Saisie rapide au doigt |
| Graphiques | Recharts | Évolution du stock, pertes, écarts |
| Coupures réseau | Reprise automatique des envois en cas de coupure brève | Wi-Fi fiable en boutique : pas de mode hors-ligne complet au MVP |
| Dates / fuseau | Heure du Maroc (`Africa/Casablanca`) ; journée d'exploitation calculée au serveur | Shift de nuit à cheval sur deux dates |
| Tests | Vitest (calculs, rattachement des shifts de nuit) + Playwright (parcours) | Fiabilité des écarts |
| Hébergement | Vercel + Supabase | Coût faible, déploiement continu depuis GitHub |

## 6. Phases

### Phase 0 — Cadrage et données
- [x] Analyse du fichier Excel existant ([ANALYSE.md](ANALYSE.md))
- [x] Extraction du catalogue ([`data/catalogue.csv`](../data/catalogue.csv))
- [x] Décisions : créneaux, cakes à la part, stock minimum par site, planning + responsable, motifs de perte, Loyverse, téléphone / tablette, 1–2 employés
- [x] Décisions complémentaires : Browse Sweets point de vente, cakes 8 parts, produits à la commande hors inventaire, P057–P063 non retenus, prix et SKU dans Loyverse, Wi-Fi fiable, planning par manager et direction ([ANALYSE.md §5](ANALYSE.md))
- [x] Catalogue enrichi : unité, parts par gâteau, produit inventorié ou non ([`data/catalogue.csv`](../data/catalogue.csv))
- [x] Sites ouverts : Browse 2 Mars et Browse Sweets 2 Mars ; labo en shift unique, 1–2 livraisons / jour ; boissons en direct ; comptage labo quotidien ([ANALYSE.md §7](ANALYSE.md))
- [x] Coût de revient saisi dans l'app ; Loyverse = compte unique ; 2 sites ouverts, 3 en ouverture ; planning semaine / mois ; laboratoire de pâtisserie ([ANALYSE.md §6](ANALYSE.md))
- [ ] Obtenir le jeton API Loyverse (prix, SKU, magasins)
- [ ] Stock minimum par site
- [ ] Photos : à prendre (carrées, ≥ 600×600 px) — possibles directement depuis l'admin
- [ ] Maquettes des 4 écrans clés : planning, grille de comptage, clôture, tableau de bord

**Livrable** : catalogue complet, créneaux par site, accès Loyverse, maquettes validées.

### Phase 1 — MVP saisie inter-shifts et planning
- [ ] Initialisation du projet, CI, déploiement de recette
- [ ] Schéma de base de données, import du catalogue CSV
- [ ] Import des articles, SKU et prix de vente depuis Loyverse (si le jeton est disponible ; sinon saisie des prix dans le catalogue)
- [ ] Sites, utilisateurs, PIN, rôles
- [ ] **Paramétrage des créneaux** par site et par jour, avec fin le lendemain et contrôle des chevauchements
- [ ] **Planning** : vue semaine et mois, équipe et responsable d'inventaire par shift, duplication de semaine
- [ ] Suivi des remontées : statut de chaque shift planifié (à l'heure, en retard, manquant)
- [ ] Ouverture du shift planifié, reprise automatique de la clôture précédente (y compris nuit → matin)
- [ ] Grille de comptage avec photos (téléphone et tablette)
- [ ] Entrées (avec conversion gâteau → parts) et pertes (péremption / endommagé)
- [ ] Ventes en saisie manuelle (en attendant Loyverse)
- [ ] Clôture par le responsable d'inventaire : théorique, écart, valeur, récapitulatif
- [ ] Recomptage d'ouverture et écart de passation (option par site)
- [ ] Tests des règles de calcul et des shifts à cheval sur deux jours (rattachement, chevauchement, enchaînement nuit → matin, passage semaine → week-end, changement d'heure)
- [ ] Pilote sur **un des 2 points de vente ouverts** en parallèle du fichier Excel pendant 1 semaine

**Critère de sortie** : un shift complet saisi en moins de 10 minutes sur téléphone ; résultats identiques au fichier Excel sur la semaine pilote.

### Phase 2 — Loyverse et administration
- [ ] Correspondance site ↔ magasin Loyverse
- [ ] Import automatique des ventes à la clôture, saisie manuelle en secours, journal des synchronisations
- [ ] Gestion du catalogue (CRUD, **photo prise depuis le téléphone**, **coût de revient** historisé, archivage, stock minimum par site)
- [ ] Tableau de bord consolidé et par site
- [ ] Courbes d'évolution du stock par produit / site
- [ ] Rapports d'écarts (produit, shift, responsable, passation) et de pertes (par motif)
- [ ] Alertes de réapprovisionnement
- [ ] Tableau de responsabilisation : remontées et écarts par responsable d'inventaire, sur la semaine / le mois
- [ ] Correction / validation des shifts, journal d'audit
- [ ] Exports Excel / CSV
- [ ] Déploiement sur les **2 points de vente ouverts**, arrêt du fichier Excel ; activation des 3 autres à leur ouverture

### Phase 3 — Laboratoire : production et livraisons
- [ ] Site de type laboratoire, rôle équipe labo
- [ ] Saisie de la production (cakes en gâteaux entiers)
- [ ] Bons de livraison : préparation, expédition
- [ ] Réception au point de vente pendant le shift, alimentation automatique des entrées (conversion en parts)
- [ ] Écarts de livraison, shift labo quotidien avec comptage du stock de produits finis
- [ ] Rapports production / livraisons / écarts
- [ ] Transferts entre points de vente (même mécanisme que les livraisons)

> Les phases 2 et 3 peuvent être inversées si le suivi du labo est prioritaire.

### Phase 4 — Fiabilisation
- [ ] Bon de réapprovisionnement généré à partir des alertes
- [ ] Mode hors-ligne complet (optionnel, le Wi-Fi étant fiable)
- [ ] Contrôles de vraisemblance (quantité inhabituelle, écart > seuil)
- [ ] Notifications (shift non clôturé, responsable non désigné, écart important, rupture)

### Phase 5 — Évolutions
- [ ] **Calcul du coût de revient** à partir des fiches techniques (ingrédients × prix d'achat)
- [ ] **Suivi de la production des préparations** (crêpes, pancakes, waffles, fettuccini…) et rapprochement avec les ventes Loyverse
- [ ] Inventaire des ingrédients pour les produits préparés à la commande
- [ ] Suivi des DLC pour anticiper la péremption
- [ ] Prévision de production **du labo** par point de vente, jour de semaine et créneau (ventes Loyverse + pertes)
- [ ] Multilingue (FR / AR / EN)

## 7. Indicateurs de réussite

| Indicateur | Cible |
|---|---|
| Temps de saisie d'un shift complet | < 10 min |
| Shifts planifiés avec un responsable désigné | 100 % |
| Shifts clôturés à l'heure prévue | 100 % |
| Ventes importées automatiquement de Loyverse | > 95 % des shifts |
| Pertes par péremption | en baisse grâce au suivi par produit |
| Valeur des écarts non expliqués | en baisse mois après mois |
| Fichiers Excel en circulation | 0 après la phase 2 |
| Livraisons labo réceptionnées et rapprochées | 100 % après la phase 3 |
| Shifts remontés à l'heure, par responsable | suivi mensuel, objectif > 95 % |

## 8. Risques

| Risque | Parade |
|---|---|
| Photos à produire pour ~46 produits | Prise de photo intégrée à l'admin ; photo générique de catégorie en attendant |
| Articles Loyverse sans SKU ou nommés différemment | Écran de correspondance manuelle, produits non associés signalés |
| Ventes passées après l'heure de clôture (décalage caisse) | Import sur l'heure réelle de clôture ; ventes tardives rattachées au shift suivant et signalées |
| Shift de nuit à cheval sur deux dates | Journée d'exploitation = jour de début, contrôle des chevauchements, tests dédiés |
| Responsable absent | Réaffectation par le manager, tracée |
| Réception non saisie au point de vente | Livraison « expédiée » non réceptionnée signalée à la clôture du shift |
| Coûts de revient non renseignés | Valorisation au prix de vente en attendant ; produits sans coût signalés |
| Adoption par les équipes | Écran tactile très simple, pilote sur un site, formation de 15 min |
| Coupure réseau ponctuelle | Reprise automatique des envois |
