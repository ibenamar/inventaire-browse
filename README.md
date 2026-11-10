# Inventaire Browse

Application d'inventaire inter-shifts pour les points de vente Browse : planning des shifts avec responsable d'inventaire, comptage du stock par produit (avec photo) sur téléphone ou tablette, enchaînement automatique clôture → ouverture, suivi de la production du laboratoire et des livraisons, import des ventes Loyverse, et interface d'administration pour suivre l'évolution du stock, les pertes, les écarts et le réapprovisionnement.

## Documentation

- [Analyse du fichier Excel existant](docs/ANALYSE.md) — structure, anomalies, règles métier, décisions
- [Feuille de route](docs/FEUILLE_DE_ROUTE.md) — périmètre, modèle de données, choix techniques, phases
- [Catalogue initial](data/catalogue.csv) — 66 produits (46 inventoriés, 20 en vente seule)

## État

**Phase 1 développée** (saisie inter-shifts et planning). Prochaine étape : mise en ligne, puis pilote d'une semaine sur Browse 2 Mars ou Browse Sweets 2 Mars, puis phase 2 (ventes Loyverse automatiques, tableaux de bord).

| Écran | Rôle | Contenu |
|---|---|---|
| Connexion | Tous | Choix du site (mémorisé sur l'appareil), de la personne, code PIN (blocage 5 min après 5 erreurs) |
| Accueil | Tous | Shift en cours ou à ouvrir d'après le planning ; création du shift du créneau en cours (manager) |
| Shift | Équipe | Comptage d'ouverture, réceptions (gâteaux → parts), pertes (péremption / endommagé), ventes, comptage de fin |
| Clôture | Responsable d'inventaire | Récapitulatif, écarts, écarts de passation, signature ; clôture forcée motivée (manager) |
| Remontées | Manager, direction | Shifts à l'heure / en retard / manquants et écarts par responsable, semaine ou mois |
| Planning | Manager, direction | Semaine ou mois, responsable + coéquipier, copie d'une semaine sur les suivantes |
| Catalogue | Direction | Photo prise au téléphone, prix, unité, parts par gâteau, coût de revient historisé |
| Utilisateurs | Direction | Rôles, sites, codes PIN |
| Sites & créneaux | Direction | Statut, mode d'ouverture, créneaux par jour avec fin le lendemain et contrôle des chevauchements |
| Loyverse | Direction | Import des articles, SKU et prix |

## Démarrer en local

Prérequis : Node.js 22.

```bash
npm install
```

```bash
npm run dev
```

Ouvrir http://localhost:3000. Sans `DATABASE_URL`, l'application utilise une base PostgreSQL embarquée (PGlite, dossier `.data/`) créée au premier lancement avec les 6 sites, le catalogue, des créneaux d'exemple et un compte **Direction** (PIN `123456`, modifiable via `DIRECTION_PIN`).

Vérifications :

```bash
npm run typecheck
```

```bash
npm test
```

Parcours complet dans un navigateur (application démarrée sur une base neuve) :

```bash
BASE=http://localhost:3000 npm run e2e
```

## Organisation du code

```
src/domain/   Règles métier pures : calculs d'écart, créneaux et shifts sur deux jours, remontées
src/db/       Schéma (Drizzle) et accès PostgreSQL / PGlite
src/server/   Services métier (planning, shifts, catalogue, utilisateurs, Loyverse), données initiales
src/app/      Écrans (Next.js) et actions serveur
drizzle/      Migrations SQL
tests/        Tests d'intégration des services (PGlite) et parcours navigateur
```

Toutes les heures sont calculées dans le fuseau `Africa/Casablanca` à partir de la base de fuseaux du système : un changement d'heure légale au Maroc est pris en compte sans modifier le code.

## Mise en production (option A : 0 €/mois)

1. **Supabase** (offre gratuite, région Europe) : créer un projet et récupérer la chaîne de connexion du *pooler* en mode transaction (port 6543).
2. **Base** : appliquer les migrations, puis créer les données initiales.

   ```bash
   DATABASE_URL='postgres://…:6543/postgres' npm run db:migrate
   ```

   ```bash
   DATABASE_URL='postgres://…:6543/postgres' DIRECTION_PIN=<6 chiffres> npm run db:seed
   ```

3. **Cloudflare Workers** (offre gratuite) : définir les secrets, puis déployer.

   ```bash
   npx wrangler secret put DATABASE_URL
   ```

   ```bash
   npx wrangler secret put SESSION_SECRET
   ```

   ```bash
   npx wrangler secret put LOYVERSE_TOKEN
   ```

   ```bash
   npm run cf:deploy
   ```

4. **Sauvegarde quotidienne** : créer un bucket Cloudflare R2 et renseigner dans GitHub (Settings › Secrets › Actions) `DATABASE_URL` (connexion port 5432), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` et `R2_BUCKET`. Le workflow « Sauvegarde quotidienne » exporte alors la base chaque nuit.
5. **Premiers réglages** dans l'application (compte Direction) : créneaux réels de chaque site, utilisateurs et PIN, import Loyverse, photos des produits.

`SESSION_SECRET` : au moins 32 caractères aléatoires (`openssl rand -base64 48`).
