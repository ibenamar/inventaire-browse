# Guide d'utilisation — Inventaire Browse

Application : https://inventaire.browse.ma — sur téléphone ou tablette, on peut l'ajouter à l'écran d'accueil comme une application.

## 1. Qui fait quoi

| Rôle | Qui | Ce qu'il fait |
|---|---|---|
| **Employé** | toute personne de l'équipe rattachée au site | Saisit pendant le shift : comptages, réceptions, pertes, corrections de ventes |
| **Responsable d'inventaire** | un employé désigné **pour un shift donné** dans le planning | Comme l'employé, **plus** : ouvre le shift, vérifie le récapitulatif et **clôture** (sa clôture vaut signature) |
| **Manager de site** | encadrant d'un ou plusieurs sites | Prépare le planning, peut ouvrir / clôturer à la place du responsable, force une clôture, **corrige** puis **valide** les shifts clôturés, suit les remontées |
| **Direction** | administration | Tout ce que fait le manager, sur tous les sites, plus le catalogue, les utilisateurs, les sites et créneaux, Loyverse, le journal |

Le responsable d'inventaire n'est pas un poste fixe : c'est la personne désignée pour **ce** shift. Un même employé peut être responsable le matin et simple coéquipier le lendemain. Une équipe compte **1 ou 2 personnes** : le responsable et, au besoin, un coéquipier.

## 2. Avant le shift : le planning (manager / direction)

- Pour chaque créneau (ex. 7h–15h, 15h–20h, 20h–4h), le manager choisit le **responsable d'inventaire** et, s'il le souhaite, **un coéquipier**.
- Un shift de nuit appartient au jour où il **commence** : la nuit du vendredi 20h → samedi 4h figure le vendredi.
- Une semaine peut être copiée sur les suivantes.

Contrôles automatiques :
- 2 personnes au maximum par shift ;
- une personne ne peut pas être planifiée sur deux shifts qui se chevauchent, même sur deux sites différents ;
- seules les personnes rattachées au site peuvent y être planifiées ;
- un créneau ne peut être planifié que les jours où il existe (horaires de semaine / de week-end) ;
- changer de responsable sur un shift déjà planifié est enregistré dans le journal.

## 3. Se connecter

1. La première fois, choisir le **site** : l'appareil s'en souvient.
2. Toucher son **nom**, puis taper son **code PIN** (4 à 6 chiffres, personnel).

Contrôles :
- après **5 codes faux**, le compte est **bloqué 5 minutes** ;
- seules les personnes rattachées au site (et la direction) apparaissent ;
- la connexion dure **12 heures** ; un compte désactivé perd l'accès immédiatement ;
- chaque saisie est enregistrée **au nom de la personne connectée** : ne jamais utiliser le PIN d'un collègue.

## 4. L'écran d'accueil

Il affiche, selon le moment :

| Situation | Ce qu'on voit | Qui peut agir |
|---|---|---|
| Un shift est **en cours** | « Continuer la saisie » | toute l'équipe du site |
| Un shift planifié **commence dans moins d'une heure** (ou a commencé) | « Ouvrir le shift », avec le nom du responsable | **le responsable** ou un manager ; les autres voient « Seul X peut ouvrir ce shift » |
| Le créneau en cours **n'a pas été planifié** | « Créer et ouvrir ce shift » | **un manager** ; un employé voit « Prévenez votre manager » |
| Rien à faire | les prochains shifts prévus | — |

## 5. Ouvrir le shift (responsable)

À l'ouverture, l'application **reprend automatiquement le stock compté à la clôture du shift précédent** : c'est le stock de départ (la nuit du vendredi alimente le matin du samedi).

Contrôles à l'ouverture :
- **un seul shift ouvert** à la fois par site : si le précédent n'est pas clôturé, l'ouverture est refusée avec son nom ;
- seul le **responsable** du shift (ou un manager) peut ouvrir.

Selon le réglage du site (fait par la direction) :

| Mode du site | Ce que l'équipe entrante fait |
|---|---|
| **Reprise** (par défaut) | Rien à recompter : seuls les produits sans stock connu (tout premier shift, nouveau produit) sont à compter |
| **Recomptage** | L'équipe entrante **recompte tout** ; toute différence avec la clôture de l'équipe précédente est un **écart de passation** |

## 6. Pendant le shift : les étapes

L'écran du shift présente les étapes dans l'ordre. **Tous les membres de l'équipe connectés sur le site peuvent saisir** ; chaque saisie porte le nom de son auteur.

### 6.1 Comptage d'ouverture (si demandé)
Grille de produits avec photo. Pour chaque produit : boutons **−** / **+** ou saisie directe ; pour les cakes, bouton **« + 1 gâteau entier »** (= 8 parts). Filtres par famille, recherche, bouton **« Restants »** pour ne voir que ce qui n'est pas encore compté, barre d'avancement.

### 6.2 Réceptions
Ce qui arrive pendant le shift : livraison du laboratoire, boissons du fournisseur, dépannage d'un autre point de vente.

**Livraison du laboratoire avec bon** : quand le labo a expédié un bon, l'étape Réceptions de l'écran du shift affiche « 1 livraison à réceptionner ». **N'importe quel membre de l'équipe** la réceptionne :
1. Ouvrir le bon (n°, heure d'expédition, liste des produits).
2. Les quantités sont **pré-remplies avec ce qui a été expédié** (les cakes en parts : « Expédié : 2 gâteaux (16 parts) »). Corriger seulement ce qui manque ou est arrivé abîmé.
3. En cas d'écart, expliquer dans le commentaire, puis **« Réceptionner »**. Les quantités reçues deviennent les entrées du shift ; l'écart est signalé au labo et au manager.

Un bon ne se réceptionne qu'une fois, même si deux équipiers valident en même temps.

**Autres réceptions** (boissons, livraison sans bon) :
1. Choisir l'**origine** (et un commentaire, ex. n° de bon).
2. Saisir les quantités reçues ; pour un cake, choisir **Gâteaux** ou **Parts** (1 gâteau = 8 parts, converti automatiquement).
3. **« Enregistrer la réception »**.

La liste des réceptions enregistrées s'affiche dessous ; une erreur se supprime (ses propres saisies, ou toutes pour le responsable / un manager).

### 6.3 Pertes
1. Toucher le produit concerné.
2. Choisir le **motif** : **Péremption** ou **Endommagé** (obligatoire).
3. Indiquer la quantité (en parts ou en gâteaux entiers pour un cake), un commentaire si besoin.
4. **« Déclarer la perte »**.

### 6.4 Ventes
- Avec Loyverse branché, **les ventes s'importent seules** depuis les tickets de caisse : à l'ouverture de l'écran Ventes, à l'ouverture du récapitulatif, et juste avant la clôture. Toutes les ventes comptent — **sur place et Glovo** — avec leur prix réel. Un **gâteau entier** vendu compte pour 8 parts.
- Le bouton « Importer maintenant » relance l'import à tout moment.
- Les **articles vendus non reconnus** (pas encore rattachés à un produit) sont signalés : à remonter au manager.
- Saisie manuelle possible en secours (par canal : Sur place / Glovo) ; elle est **remplacée** au prochain import.

### 6.5 Comptage de fin
Compter **tout le stock réellement présent**, produit par produit. **Saisir 0** pour un produit épuisé (une case vide = « pas encore compté »).
Le stock théorique **n'est pas affiché** pendant le comptage : on compte ce qu'on voit, sans être influencé.

### 6.6 Transférer vers un autre point de vente
Lien « Transférer des produits vers un autre point de vente » sous les étapes : choisir le site, saisir les quantités, puis **Préparer** (bon en attente) ou **Expédier** (les produits sortent de votre stock). Le site destinataire le réceptionne comme une livraison du labo. On ne peut pas expédier plus que le stock disponible.

### Enregistrement des saisies
- Chaque valeur s'enregistre **toute seule** une demi-seconde après la saisie : pas de bouton « enregistrer » dans les grilles.
- En haut : « Enregistrement… », puis « Tout est enregistré » ou « Terminé ✓ ».
- En cas de coupure réseau, l'application **réessaie une fois** ; si l'échec persiste, un message rouge s'affiche et la carte du produit est encadrée de rouge : **ressaisir la valeur**.
- Fermer ou recharger la page pendant un enregistrement déclenche un **avertissement**.

Contrôles sur les saisies :
- quantités entières, positives (0 accepté) ; décimales (virgule) pour les ingrédients au kg ou au litre ;
- une quantité inhabituelle (ex. 1 000 pièces, un zéro de trop) est signalée en orange : **vérifier**, sans blocage ;
- une perte doit avoir un motif et une quantité d'au moins 1 ;
- les produits « préparés à la commande » (crêpes, pancakes, waffles, fettuccini) ne se comptent pas : seules leurs ventes sont suivies ;
- plus aucune saisie possible par l'équipe une fois le shift clôturé.

## 7. Clôturer le shift (responsable)

Le bouton **« Vérifier et clôturer le shift »** ouvre le **récapitulatif** :
- ventes du shift par canal (réimportées automatiquement) ;
- chiffres clés : articles vendus, CA, pertes, nombre et valeur des écarts, écarts de passation ;
- **liste des produits en écart** (ex. « −1 Mango Can : théorique 6, compté 5 ») ;
- tableau complet par famille : écart, compté, théorique, ouverture, entrées, ventes, pertes.

Le calcul, pour chaque produit :

> **Théorique** = ouverture + réceptions − ventes − pertes
> **Écart** = compté − théorique (négatif = il manque des produits : vente non passée en caisse, perte non déclarée, erreur de comptage)

Avant de clôturer, le responsable **vérifie les écarts** et recompte si besoin, puis ajoute un **commentaire de passation** et touche **« Clôturer et signer le shift »**. Le commentaire est **obligatoire en cas d'écart important** (au moins 3 unités sur un produit, ou 100 MAD au total) : le récapitulatif l'annonce et liste les produits concernés.

Contrôles à la clôture :
- seul le **responsable** du shift (ou un manager) peut clôturer ; les autres voient le récapitulatif en lecture ;
- la clôture est **refusée** tant qu'il manque un comptage (d'ouverture ou de fin) : le récapitulatif indique combien et renvoie vers l'écran à compléter ;
- les ventes sont réimportées juste avant la clôture ; si Loyverse ne répond pas, la clôture se fait avec les ventes déjà connues et l'échec reste visible ;
- le **stock compté devient l'ouverture du shift suivant**.

**Clôture forcée** (manager uniquement, shift abandonné) : avec un motif obligatoire ; les produits non comptés prennent leur stock théorique ; le shift est marqué « Clôture forcée ».

## 8. Après le shift (manager / direction)

- **Correction** : sur un shift clôturé, « Corriger ce shift » rouvre les écrans de saisie pour le manager uniquement (bandeau orange). Chaque modification est **inscrite au journal** (ancienne → nouvelle valeur). Corriger le comptage de fin **met à jour l'ouverture du shift suivant**.
- **Réimport des ventes** : pour les tickets synchronisés en retard.
- **Validation** : « Valider le shift » le **verrouille définitivement** (plus aucune modification, même par un manager).

## 9. Le suivi des remontées

Chaque shift planifié reçoit un statut, visible par les managers (onglet Remontées) :

| Statut | Signification |
|---|---|
| À venir / En cours | le shift n'est pas terminé |
| **Remonté à l'heure** | clôturé au plus tard **30 minutes** après la fin prévue |
| **En retard** | clôturé après ce délai, ou encore ouvert après ce délai |
| **Manquant** | jamais ouvert ni clôturé, 30 minutes après la fin prévue |

Pour chaque responsable d'inventaire : nombre de shifts, taux de remontée à l'heure, valeur des écarts et des pertes de ses shifts — sur la semaine ou le mois.

## 10. Alertes et réapprovisionnement (manager / direction)

**Alertes** : l'accueil des managers et le tableau de bord listent ce qui demande une action :

| Alerte | Signification |
|---|---|
| Non clôturé | shift encore ouvert 30 min après sa fin prévue |
| Remontée manquante | shift planifié jamais ouvert |
| Sans responsable | créneau d'aujourd'hui ou de demain non planifié |
| Écart important | dernier shift clôturé avec un écart d'au moins 3 unités ou 100 MAD |
| Rupture | produit à 0 au dernier comptage alors qu'un minimum est fixé |
| Livraison en attente | bon expédié depuis plus de 6 h et toujours pas réceptionné |
| DLC dépassée ? | stock plus ancien que la durée de conservation du produit (à vérifier puis déclarer en perte) |

**Réapprovisionnement** (onglet Réappro.) : produits sous leur stock minimum au dernier comptage, avec la quantité à fournir (déduction faite des bons déjà en route, cakes arrondis au gâteau entier). « Préparer le bon du laboratoire » crée le bon : l'équipe du labo l'ajuste et l'expédie. Les boissons sont listées « à commander au fournisseur ».

## 11. Le laboratoire

Le laboratoire fonctionne comme un point de vente : planning avec un responsable, connexion sur le site « Laboratoire », ouverture, comptages, clôture. Ses étapes :

| Étape | Ce qu'on fait |
|---|---|
| **Production** | ce qui sort du four ou de la préparation ; les cakes se saisissent **en gâteaux entiers** (convertis en parts) |
| **Réceptions** | ingrédients et fournitures reçus des fournisseurs (décimales acceptées : 2,5 kg) |
| **Livraisons** | bons de livraison vers les points de vente : choisir le site, les quantités, puis **Préparer** ou **Expédier** au départ du livreur |
| **Pertes** | comme au point de vente |
| **Comptage** | produits finis (cakes en gâteaux entiers) **et ingrédients** |

Contrôles :
- on ne peut pas **expédier plus que le stock** : saisir d'abord la production ;
- un bon préparé s'annule par l'équipe du labo ; un bon expédié non reçu, par un manager seulement (la sortie de stock est retirée) ; un bon reçu ne s'annule plus.

À la clôture, pour un **ingrédient**, la différence entre le théorique et le compté n'est pas un écart mais la **consommation** du shift, valorisée au coût. Si les produits ont une **fiche technique**, la consommation attendue (production × recette) est affichée : « +0,5 vs fiche » signale une surconsommation.

L'onglet **Laboratoire** (managers, direction) présente : la **prévision de production** du jour choisi (moyenne des ventes des 4 mêmes jours de semaine, stock minimum, stocks et livraisons en route), la production par jour, les livraisons par point de vente, les écarts de livraison, la consommation des ingrédients et les pertes du labo.

## 12. Catalogue : ingrédients, fiches techniques, conservation (direction)

- **Ingrédient** : Catalogue › Nouveau produit › « Ingrédient du laboratoire », en kg, litre, pièce, sachet, boîte ou bouteille. Coché « aussi compté dans les points de vente », il est compté dans les points de vente pour suivre les préparations à la commande (crêpes, pancakes…).
- **Produit fabriqué par le laboratoire** : case sur la fiche produit ; il est compté au labo et livré aux points de vente.
- **Fiche technique** : ingrédients et quantités pour un gâteau entier (ou une unité). Elle donne le coût de la recette et par part ; « Appliquer comme coût de revient » l'enregistre. Elle sert aussi à calculer la consommation théorique d'ingrédients.
- **Durée de conservation** (jours) : alimente l'alerte « DLC dépassée ? ».

## 13. Résumé : la journée type

| Moment | Qui | Action |
|---|---|---|
| Avant le début | Responsable | Se connecte, **ouvre le shift** (le stock de départ est repris de la clôture précédente) |
| Début | Équipe | Si le site est en mode recomptage : **compte l'ouverture** |
| Pendant | Équipe | **Réceptions** à chaque livraison, **pertes** au fil de l'eau ; les ventes arrivent seules de Loyverse |
| Fin | Équipe | **Comptage de fin** de tous les produits |
| Fin | Responsable | **Récapitulatif**, vérification des écarts, **clôture** |
| Après | Manager | Corrige si besoin, **valide** ; suit les remontées et le tableau de bord |
