# Inventaire Browse

Application d'inventaire inter-shifts pour les points de vente Browse : planning des shifts avec responsable d'inventaire, comptage du stock par produit (avec photo) sur téléphone ou tablette, enchaînement automatique clôture → ouverture, suivi de la production du laboratoire et des livraisons, import des ventes Loyverse, et interface d'administration pour suivre l'évolution du stock, les pertes, les écarts et le réapprovisionnement.

## Documentation

- [Analyse du fichier Excel existant](docs/ANALYSE.md) — structure, anomalies, règles métier, décisions
- [Guide d'utilisation](docs/GUIDE_UTILISATEUR.md) — rôles, étapes de saisie et contrôles, pour les équipes ; consultable dans l'application sur https://inventaire.browse.ma/aide (lien « Aide »)
- [Feuille de route](docs/FEUILLE_DE_ROUTE.md) — périmètre, modèle de données, choix techniques, phases
- [Catalogue initial](data/catalogue.csv) — 66 produits (46 inventoriés, 20 en vente seule)
- [Correspondances Loyverse](data/correspondances_loyverse.csv) — SKU Loyverse → produit, canal et facteur, à valider ; après modification : `npm run correspondances`

## État

**Phases 1 et 2 développées et en ligne** sur https://inventaire.browse.ma : saisie inter-shifts, planning, ventes multi-canaux importées de Loyverse, tableau de bord, corrections et validation, exports. Prochaine étape : pilote sur les deux points de vente ouverts, puis phase 3 (laboratoire).

| Écran | Rôle | Contenu |
|---|---|---|
| Connexion | Tous | Choix du site (mémorisé sur l'appareil), de la personne, code PIN (blocage 5 min après 5 erreurs) |
| Accueil | Tous | Shift en cours ou à ouvrir d'après le planning ; création du shift du créneau en cours (manager) |
| Shift | Équipe | Comptage d'ouverture, réceptions (gâteaux → parts), pertes (péremption / endommagé), ventes par canal importées de Loyverse (saisie manuelle en secours), comptage de fin |
| Clôture | Responsable d'inventaire | Récapitulatif, écarts, écarts de passation, signature ; clôture forcée motivée (manager) |
| Tableau de bord | Manager, direction | CA par canal, pertes, écarts, remontées ; ventes par jour, évolution du stock, alertes de réapprovisionnement ; exports Excel |
| Remontées | Manager, direction | Shifts à l'heure / en retard / manquants et écarts par responsable, semaine ou mois |
| Correction / validation | Manager, direction | Corriger un shift clôturé (tracé), puis le valider (verrouillé) |
| Journal | Direction | Toutes les opérations : ouvertures, clôtures, corrections, validations, réglages |
| Planning | Manager, direction | Semaine ou mois, responsable + coéquipier, copie d'une semaine sur les suivantes |
| Catalogue | Direction | Création de produits, photo prise au téléphone, prix, unité, parts par gâteau, coût de revient historisé, stock minimum par site |
| Utilisateurs | Direction | Rôles, sites, codes PIN |
| Sites & créneaux | Direction | Statut, mode d'ouverture, créneaux par jour avec fin le lendemain et contrôle des chevauchements |
| Loyverse | Direction | Import des articles (API ou export CSV) : un produit, plusieurs articles de caisse (sur place, Glovo, gâteau entier…), prix par magasin ; articles à rattacher ou à ignorer |

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

Accessibilité et mise en page des écrans clés (WCAG 2.1 AA avec axe-core, contrastes compris, 375 / 768 / 1024 / 1440 px, thèmes clair et sombre, sans défilement horizontal), après le parcours laboratoire sur une base neuve :

```bash
BASE=http://localhost:3000 node tests/e2e/accessibilite.cjs
```

Design system : tokens dans `src/app/globals.css` (couleurs sémantiques claires et sombres, typographie, rayons, ombres, plans, durées d'animation) ; les composants n'emploient que ces noms (`bg-card`, `text-muted-foreground`, `bg-primary`…), jamais de couleur en dur ; icônes Lucide.

Nombre de requêtes SQL par page (mesure de performance) : lancer le serveur avec `PERF_REQUETES=1 npm run dev`, chaque requête est écrite dans la console.

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

## Mise en production : https://inventaire.browse.ma

Hébergement option A (0 €/mois) : Cloudflare Workers pour l'application, Supabase gratuit pour la base. Le domaine `inventaire.browse.ma` est déclaré dans `wrangler.jsonc` : la zone `browse.ma` étant déjà sur Cloudflare, l'enregistrement DNS et le certificat HTTPS sont créés automatiquement au premier déploiement. Aucun enregistrement `inventaire` ne doit exister au préalable dans la zone.

Chaque modification fusionnée sur `main` est testée puis déployée par le workflow « Déploiement » (`.github/workflows/deploiement.yml`), qui applique aussi les migrations de la base.

### Mise en place (une seule fois)

1. **Supabase** : créer un projet (offre gratuite, région Europe, ex. Francfort). Dans les options de sécurité proposées à la création, **activer le RLS automatique** et, si l'option est proposée, **désactiver la Data API** : l'application ne s'en sert pas. Dans tous les cas, les migrations activent elles-mêmes le RLS sur toutes les tables (`drizzle/0001_securite_rls.sql`), ce qui bloque l'accès public via l'API de Supabase sans gêner l'application. Dans *Connect*, relever deux chaînes de connexion :
   - *Transaction pooler* (port 6543) → `DATABASE_URL` (utilisée par l'application) ;
   - *Session pooler* (port 5432) → `DATABASE_URL_DIRECTE` (migrations et sauvegardes ; la connexion directe de l'offre gratuite n'est pas joignable depuis GitHub).
2. **Cloudflare** : *My Profile › API Tokens › Create Token*, modèle **Edit Cloudflare Workers**, limité au compte et à la zone `browse.ma`. Relever aussi l'*Account ID* (page d'accueil du compte).
3. **GitHub** : *Settings › Secrets and variables › Actions*, ajouter :

   | Secret | Valeur |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | jeton créé à l'étape 2 |
   | `CLOUDFLARE_ACCOUNT_ID` | identifiant du compte Cloudflare |
   | `DATABASE_URL` | chaîne *Transaction pooler* (port 6543) |
   | `DATABASE_URL_DIRECTE` | chaîne *Session pooler* (port 5432) |
   | `SESSION_SECRET` | 32 caractères aléatoires minimum (`openssl rand -base64 48`) |
   | `DIRECTION_PIN` | code PIN à 6 chiffres du compte Direction |
   | `LOYVERSE_TOKEN` | jeton Loyverse (peut être ajouté plus tard) |

4. **Déployer** : fusionner sur `main`, ou lancer le workflow « Déploiement » à la main (*Actions › Déploiement › Run workflow*). Au premier déploiement, le certificat de `inventaire.browse.ma` peut mettre quelques minutes à être émis.
5. **Sauvegarde quotidienne** : créer un bucket Cloudflare R2 et ajouter `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` et `R2_BUCKET`. Le workflow « Sauvegarde quotidienne » exporte alors la base chaque nuit.
6. **Premiers réglages** sur https://inventaire.browse.ma avec le compte Direction : créneaux réels de chaque site, utilisateurs et PIN, import Loyverse, photos des produits.

### Déploiement manuel (dépannage)

```bash
npx wrangler login
```

```bash
npm run cf:deploy
```
