# Feuille de route — Application d'inventaire inter-shifts (Browse)

> Basée sur l'analyse du fichier de suivi existant : voir [ANALYSE.md](ANALYSE.md).

## 1. Objectif

Remplacer le classeur Excel dupliqué chaque jour par une application qui :

1. permet aux équipes de **saisir le stock en quelques minutes** à partir d'une grille de produits illustrés par **leur photo** ;
2. **enchaîne les shifts** : le stock de clôture d'un shift devient le stock d'ouverture du suivant, et tout écart est attribué au bon shift ;
3. donne à l'administration une **vision consolidée et historisée** du stock, de ses variations, des écarts et des besoins de réapprovisionnement, par site et par produit.

## 2. Utilisateurs et rôles

| Rôle | Accès |
|---|---|
| **Employé** | Ouvrir / clôturer un shift de son site, saisir comptages, entrées, ventes, pertes |
| **Responsable de site** | + corriger / valider les shifts de son site, voir les rapports de son site |
| **Administrateur** | + catalogue (produits, photos, prix, coûts), sites, utilisateurs, tous les rapports, exports |

## 3. Périmètre fonctionnel

### 3.1 Application de saisie (tablette / smartphone, PWA)

- Connexion rapide par **code PIN** individuel, choix du site mémorisé sur l'appareil.
- **Ouverture de shift** : ouverture pré-remplie depuis la clôture précédente ; recomptage optionnel (ou obligatoire selon le site).
- **Grille de comptage** : cartes produit avec photo, nom, unité ; saisie par boutons `−` / `+` et pavé numérique ; filtre par catégorie ; recherche ; indicateur « compté / restant ».
- Saisie des **entrées** (avec origine : labo, fournisseur, transfert), **ventes**, **pertes** (avec motif : casse, périmé, offert, repas staff).
- **Clôture** : comptage final, récapitulatif des écarts avec alerte sur les écarts anormaux, commentaire, validation.
- Sauvegarde automatique à chaque saisie ; tolérance aux coupures réseau.

### 3.2 Interface d'administration (web)

- **Tableau de bord** : CA, écarts (valeur au coût et au prix de vente), produits à réapprovisionner, shifts non clôturés — par site et consolidé.
- **Évolution du stock** : courbe par produit / site sur une période, détail des mouvements shift par shift.
- **Rapports d'écarts** : classement des produits et des shifts les plus déficitaires, écarts de passation par équipe.
- **Historique des shifts** : consultation, correction tracée, validation.
- **Catalogue** : produits, catégories, photos, unité, prix, coût, type (inventorié / vente seule), activation, stock minimum par site.
- **Sites et utilisateurs**.
- **Exports** Excel / CSV (format compatible avec le fichier actuel).

## 4. Modèle de données

```
Site(id, nom, type[boutique|labo], mode_ouverture[reprise|recomptage], actif)
Categorie(id, nom, ordre)
Produit(id, ref, nom, categorie_id, unite, format, prix_vente, cout, photo_url,
        suivi_stock[bool], actif, ordre)
ProduitSite(produit_id, site_id, stock_minimum, actif)
Utilisateur(id, nom, pin_hash, role, sites[])
Shift(id, site_id, date, creneau, statut[ouvert|cloture|valide],
      ouvert_par, ouvert_le, cloture_par, cloture_le, valide_par, commentaire,
      shift_precedent_id)
LigneShift(shift_id, produit_id, ouverture_theorique, ouverture_comptee,
           entrees, ventes, pertes, transferts_in, transferts_out,
           stock_reel_fin)                      -- les calculs sont dérivés
Mouvement(id, shift_id, produit_id, type[entree|vente|perte|transfert|ajustement],
          quantite, motif, origine_site_id, utilisateur_id, horodatage)
JournalAudit(id, utilisateur_id, action, entite, avant, apres, horodatage)
```

Le stock courant d'un site = `stock_reel_fin` du dernier shift clôturé ; l'historique des `LigneShift` alimente directement les courbes d'évolution.

## 5. Choix techniques proposés

| Besoin | Proposition | Raison |
|---|---|---|
| Front saisie + admin | **Next.js (React) + TypeScript**, PWA installable | Une seule base de code, installable sur tablette, mode hors-ligne |
| Backend / BDD | **Supabase** (PostgreSQL, Auth, Storage) | Base relationnelle adaptée à l'historique, stockage des photos, droits par rôle (RLS) |
| UI | Tailwind CSS + composants accessibles | Gros boutons tactiles, rapidité de développement |
| Graphiques | Recharts | Courbes d'évolution du stock |
| Hors-ligne | File d'attente locale (IndexedDB) + synchronisation | Wi-Fi boutique non garanti |
| Tests | Vitest (règles de calcul) + Playwright (parcours de saisie) | Les calculs d'écart doivent être fiables |
| Hébergement | Vercel + Supabase (offre gratuite suffisante au démarrage) | Coût faible, déploiement continu depuis GitHub |

> Alternative possible si vous préférez un hébergement unique : Laravel + MySQL. À trancher à l'étape 0.

## 6. Phases

### Phase 0 — Cadrage et données (préalable)
- [x] Analyse du fichier Excel existant ([ANALYSE.md](ANALYSE.md))
- [x] Extraction du catalogue ([`data/catalogue.csv`](../data/catalogue.csv))
- [ ] Réponses aux questions ouvertes (ANALYSE.md §4)
- [ ] Compléter le catalogue : prix de vente, coût, unité de comptage, type (inventorié / vente seule), stock minimum par site
- [ ] Collecter une photo par produit (format carré, ≥ 600×600 px)
- [ ] Valider la pile technique et l'hébergement
- [ ] Maquettes des 3 écrans clés : grille de comptage, clôture, tableau de bord

**Livrable** : catalogue complet + maquettes validées.

### Phase 1 — MVP saisie inter-shifts
- [ ] Initialisation du projet, CI, déploiement de recette
- [ ] Schéma de base de données, import du catalogue CSV, import des photos
- [ ] Authentification par PIN, rôles, rattachement aux sites
- [ ] Ouverture de shift avec reprise automatique de la clôture précédente
- [ ] Grille de comptage avec photos, filtres par catégorie, recherche
- [ ] Saisie entrées / ventes / pertes (avec motif)
- [ ] Clôture : comptage final, calcul théorique / écart / valeur, récapitulatif
- [ ] Recomptage d'ouverture et écart de passation (option par site)
- [ ] Tests unitaires des règles de calcul (cas de l'exemple Excel : Mango Can 12 + 6 − 9 − 1 = 8, compté 7 → écart −1)
- [ ] Pilote sur **un site** en parallèle du fichier Excel pendant 1 semaine

**Critère de sortie** : un shift complet saisi en moins de 10 minutes sur tablette ; résultats identiques au fichier Excel sur la semaine pilote.

### Phase 2 — Administration et suivi du stock
- [ ] Gestion du catalogue (CRUD, photos, prix, coûts, archivage)
- [ ] Gestion des sites, des utilisateurs et des stocks minimum par site
- [ ] Tableau de bord consolidé et par site
- [ ] Courbes d'évolution du stock par produit / site
- [ ] Rapports d'écarts (par produit, par shift, par équipe, écarts de passation)
- [ ] Alertes de réapprovisionnement
- [ ] Correction / validation des shifts par le responsable, journal d'audit
- [ ] Exports Excel / CSV
- [ ] Déploiement sur **tous les sites**, arrêt du fichier Excel

### Phase 3 — Flux et fiabilisation
- [ ] Transferts labo → boutiques et entre boutiques (envoi / réception rapprochés)
- [ ] Bon de réapprovisionnement généré à partir des alertes
- [ ] Import des ventes depuis la caisse / plateformes (CSV, puis API si disponible)
- [ ] Mode hors-ligne complet avec synchronisation
- [ ] Contrôles de vraisemblance (quantité inhabituelle, écart > seuil)
- [ ] Notifications (shift non clôturé, écart important, rupture)

### Phase 4 — Évolutions
- [ ] Inventaire des ingrédients pour les produits préparés à la commande (recettes / fiches techniques)
- [ ] Gestion des DLC / périmés
- [ ] Prévision des besoins de production par site et par jour de semaine
- [ ] Multilingue (FR / AR / EN)

## 7. Indicateurs de réussite

| Indicateur | Cible |
|---|---|
| Temps de saisie d'un shift complet | < 10 min |
| Shifts clôturés le jour même | 100 % |
| Valeur des écarts non expliqués | en baisse mois après mois |
| Ruptures sur produits suivis | en baisse grâce aux alertes |
| Fichiers Excel en circulation | 0 après la phase 2 |

## 8. Risques

| Risque | Parade |
|---|---|
| Catalogue incomplet (prix, coûts, photos) au démarrage | Phase 0 bloquante ; produits sans prix non activables |
| Adoption par les équipes | Écran tactile très simple, pilote sur un site, formation de 15 min |
| Réseau instable en boutique | PWA + file d'attente hors-ligne |
| Erreurs de comptage | Photos, unités claires, contrôles de vraisemblance |
| Ambiguïté sur les produits à la commande | Décision explicite « inventorié / vente seule » par produit |
