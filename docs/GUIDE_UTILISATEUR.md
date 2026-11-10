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

### Enregistrement des saisies
- Chaque valeur s'enregistre **toute seule** une demi-seconde après la saisie : pas de bouton « enregistrer » dans les grilles.
- En haut : « Enregistrement… », puis « Tout est enregistré » ou « Terminé ✓ ».
- En cas de coupure réseau, l'application **réessaie une fois** ; si l'échec persiste, un message rouge s'affiche et la carte du produit est encadrée de rouge : **ressaisir la valeur**.
- Fermer ou recharger la page pendant un enregistrement déclenche un **avertissement**.

Contrôles sur les saisies :
- quantités entières, positives (0 accepté) ;
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

Avant de clôturer, le responsable **vérifie les écarts** et recompte si besoin, puis ajoute un **commentaire de passation** (facultatif) et touche **« Clôturer et signer le shift »**.

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

## 10. Résumé : la journée type

| Moment | Qui | Action |
|---|---|---|
| Avant le début | Responsable | Se connecte, **ouvre le shift** (le stock de départ est repris de la clôture précédente) |
| Début | Équipe | Si le site est en mode recomptage : **compte l'ouverture** |
| Pendant | Équipe | **Réceptions** à chaque livraison, **pertes** au fil de l'eau ; les ventes arrivent seules de Loyverse |
| Fin | Équipe | **Comptage de fin** de tous les produits |
| Fin | Responsable | **Récapitulatif**, vérification des écarts, **clôture** |
| Après | Manager | Corrige si besoin, **valide** ; suit les remontées et le tableau de bord |
