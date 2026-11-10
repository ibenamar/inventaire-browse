import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  serial,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

const horodatage = (nom: string) => timestamp(nom, { withTimezone: true, mode: "date" });

export const TYPES_SITE = ["point_de_vente", "laboratoire"] as const;
export const STATUTS_SITE = ["actif", "en_ouverture"] as const;
export const MODES_OUVERTURE = ["reprise", "recomptage"] as const;
export const ROLES = ["employe", "manager", "direction", "labo"] as const;
export const UNITES = ["piece", "part", "bouteille", "kg", "litre", "sachet", "boite"] as const;
/** Unités dont le comptage accepte des décimales (ingrédients au poids ou au volume). */
export const UNITES_DECIMALES: readonly Unite[] = ["kg", "litre"];
export const NATURES_PRODUIT = ["produit", "ingredient"] as const;
export const STATUTS_BON = ["prepare", "expedie", "recu", "annule"] as const;
export const STATUTS_SHIFT = ["planifie", "ouvert", "cloture", "valide"] as const;
/** « sortie » : expédition d'un bon de livraison (labo → point de vente, ou transfert). */
export const TYPES_MOUVEMENT = ["entree", "perte", "ajustement", "sortie"] as const;
export const MOTIFS_PERTE = ["peremption", "endommage"] as const;
export const ORIGINES_ENTREE = ["labo", "fournisseur", "autre_site", "autre", "production"] as const;

export type Role = (typeof ROLES)[number];
export type Unite = (typeof UNITES)[number];
export type NatureProduit = (typeof NATURES_PRODUIT)[number];
export type StatutBon = (typeof STATUTS_BON)[number];
export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];
export type StatutShift = (typeof STATUTS_SHIFT)[number];
export type MotifPerte = (typeof MOTIFS_PERTE)[number];
export type OrigineEntree = (typeof ORIGINES_ENTREE)[number];

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull().unique(),
  type: text("type", { enum: TYPES_SITE }).notNull().default("point_de_vente"),
  statut: text("statut", { enum: STATUTS_SITE }).notNull().default("actif"),
  modeOuverture: text("mode_ouverture", { enum: MODES_OUVERTURE }).notNull().default("reprise"),
  loyverseStoreId: text("loyverse_store_id"),
  /** Nom du magasin Loyverse (ex. « BROWSE COFFEE SHOP ») : les prix peuvent différer d'un magasin à l'autre. */
  loyverseMagasin: text("loyverse_magasin"),
  ordre: integer("ordre").notNull().default(0),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull().unique(),
  ordre: integer("ordre").notNull().default(0),
});

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentType: text("content_type").notNull(),
  donnees: bytea("donnees").notNull(),
  creeLe: horodatage("cree_le").notNull().defaultNow(),
});

export const produits = pgTable(
  "produits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: text("ref").notNull().unique(),
    nom: text("nom").notNull(),
    categorieId: uuid("categorie_id")
      .notNull()
      .references(() => categories.id),
    unite: text("unite", { enum: UNITES }).notNull().default("piece"),
    format: text("format"),
    partsParGateau: integer("parts_par_gateau"),
    /** Prix de référence (canal « sur place ») : sert à valoriser les pertes et les écarts. */
    prixVente: numeric("prix_vente", { precision: 10, scale: 2, mode: "number" }),
    suiviStock: boolean("suivi_stock").notNull().default(true),
    /** « ingredient » : matière première comptée au laboratoire (non vendue). */
    nature: text("nature", { enum: NATURES_PRODUIT }).notNull().default("produit"),
    /** Produit fabriqué par le laboratoire : compté dans le stock du labo et livré aux points de vente. */
    fabriqueLabo: boolean("fabrique_labo").notNull().default(false),
    /** Ingrédient aussi compté dans les points de vente (préparations à la commande : crêpes, pancakes…). */
    ingredientPointsDeVente: boolean("ingredient_points_de_vente").notNull().default(false),
    /** Durée de conservation en jours (DLC) : sert à repérer le stock probablement périmé. */
    dureeConservationJours: integer("duree_conservation_jours"),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    actif: boolean("actif").notNull().default(true),
    ordre: integer("ordre").notNull().default(0),
  },
  (t) => [index("produits_categorie_idx").on(t.categorieId)],
);

/** Canaux de vente (sur place, Glovo…) : un même produit a un article de caisse et un prix par canal. */
export const canauxVente = pgTable("canaux_vente", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nom: text("nom").notNull(),
  /** Mots repérés dans la catégorie (ou à défaut le nom) d'un article Loyverse pour reconnaître le canal (ex. « glovo »). */
  motsCles: text("mots_cles").array().notNull().default(sql`'{}'::text[]`),
  ordre: integer("ordre").notNull().default(0),
  actif: boolean("actif").notNull().default(true),
});

/**
 * Article de caisse (Loyverse) : une variante vendue, rattachée au produit physique qu'elle
 * fait sortir du stock et au canal de vente. Plusieurs articles (SKU, prix) par produit.
 */
export const articlesCaisse = pgTable(
  "articles_caisse",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    produitId: uuid("produit_id").references(() => produits.id, { onDelete: "set null" }),
    canalId: uuid("canal_id")
      .notNull()
      .references(() => canauxVente.id),
    nomCaisse: text("nom_caisse").notNull(),
    categorieCaisse: text("categorie_caisse"),
    sku: text("sku"),
    loyverseItemId: text("loyverse_item_id"),
    loyverseVariantId: text("loyverse_variant_id").unique(),
    /** Prix par défaut ; le prix propre à chaque magasin est dans prix_articles_magasins. */
    prixVente: numeric("prix_vente", { precision: 10, scale: 2, mode: "number" }),
    /** Unités de stock sorties par article vendu (ex. « Matilda Cake Entier » = 8 parts, « box of 4 » = 4). */
    facteur: integer("facteur").notNull().default(1),
    source: text("source", { enum: ["loyverse", "manuel"] }).notNull().default("manuel"),
    actif: boolean("actif").notNull().default(true),
    majLe: horodatage("maj_le").notNull().defaultNow(),
  },
  (t) => [index("articles_caisse_sku_idx").on(t.sku), index("articles_caisse_produit_idx").on(t.produitId)],
);

/** Prix et disponibilité d'un article de caisse dans chaque magasin Loyverse. */
export const prixArticlesMagasins = pgTable(
  "prix_articles_magasins",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articlesCaisse.id, { onDelete: "cascade" }),
    magasin: text("magasin").notNull(),
    prix: numeric("prix", { precision: 10, scale: 2, mode: "number" }),
    disponible: boolean("disponible").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.magasin] })],
);

/**
 * Fiche technique : ingrédients d'un produit, pour un gâteau entier (produits en parts) ou une unité.
 * Sert au coût de revient calculé et à la consommation théorique d'ingrédients.
 */
export const recettes = pgTable(
  "recettes",
  {
    produitId: uuid("produit_id")
      .notNull()
      .references(() => produits.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => produits.id, { onDelete: "cascade" }),
    quantite: numeric("quantite", { precision: 12, scale: 4, mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.produitId, t.ingredientId] })],
);

/** Coût de revient historisé (saisi dans l'application). */
export const coutsProduit = pgTable("couts_produit", {
  id: uuid("id").primaryKey().defaultRandom(),
  produitId: uuid("produit_id")
    .notNull()
    .references(() => produits.id, { onDelete: "cascade" }),
  coutUnitaire: numeric("cout_unitaire", { precision: 10, scale: 2, mode: "number" }).notNull(),
  dateEffet: date("date_effet", { mode: "string" }).notNull(),
  saisiPar: uuid("saisi_par"),
  saisiLe: horodatage("saisi_le").notNull().defaultNow(),
});

export const produitsSites = pgTable(
  "produits_sites",
  {
    produitId: uuid("produit_id")
      .notNull()
      .references(() => produits.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    stockMinimum: numeric("stock_minimum", { precision: 12, scale: 3, mode: "number" }),
    actif: boolean("actif").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.produitId, t.siteId] })],
);

export const utilisateurs = pgTable("utilisateurs", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  pinHash: text("pin_hash").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("employe"),
  actif: boolean("actif").notNull().default(true),
  echecsPin: integer("echecs_pin").notNull().default(0),
  /** Incrémentée au changement de PIN, de rôle ou de sites, à la désactivation et à la déconnexion : invalide les sessions ouvertes. */
  versionSession: integer("version_session").notNull().default(0),
  bloqueJusqua: horodatage("bloque_jusqua"),
  creeLe: horodatage("cree_le").notNull().defaultNow(),
});

export const utilisateursSites = pgTable(
  "utilisateurs_sites",
  {
    utilisateurId: uuid("utilisateur_id")
      .notNull()
      .references(() => utilisateurs.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.utilisateurId, t.siteId] })],
);

export const creneaux = pgTable("creneaux", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  heureDebut: text("heure_debut").notNull(),
  heureFin: text("heure_fin").notNull(),
  jours: integer("jours").array().notNull(),
  ordre: integer("ordre").notNull().default(0),
  actif: boolean("actif").notNull().default(true),
});

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    creneauId: uuid("creneau_id").references(() => creneaux.id, { onDelete: "set null" }),
    /** Journée d'exploitation = date locale de DÉBUT du shift. */
    journee: date("journee", { mode: "string" }).notNull(),
    nomCreneau: text("nom_creneau").notNull(),
    debutPrevu: horodatage("debut_prevu").notNull(),
    finPrevue: horodatage("fin_prevue").notNull(),
    responsableId: uuid("responsable_id").references(() => utilisateurs.id),
    statut: text("statut", { enum: STATUTS_SHIFT }).notNull().default("planifie"),
    ouvertPar: uuid("ouvert_par").references(() => utilisateurs.id),
    ouvertLe: horodatage("ouvert_le"),
    cloturePar: uuid("cloture_par").references(() => utilisateurs.id),
    clotureLe: horodatage("cloture_le"),
    clotureForcee: boolean("cloture_forcee").notNull().default(false),
    validePar: uuid("valide_par").references(() => utilisateurs.id),
    valideLe: horodatage("valide_le"),
    commentaire: text("commentaire"),
    shiftPrecedentId: uuid("shift_precedent_id"),
    ventesSource: text("ventes_source", { enum: ["manuel", "loyverse"] }).notNull().default("manuel"),
    ventesImporteesLe: horodatage("ventes_importees_le"),
  },
  (t) => [
    uniqueIndex("shifts_site_journee_creneau_uq").on(t.siteId, t.journee, t.creneauId),
    index("shifts_site_debut_idx").on(t.siteId, t.debutPrevu),
    // Un seul shift ouvert par site.
    uniqueIndex("shifts_un_ouvert_par_site_uq").on(t.siteId).where(sql`statut = 'ouvert'`),
  ],
);

export const equipesShift = pgTable(
  "equipes_shift",
  {
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    utilisateurId: uuid("utilisateur_id")
      .notNull()
      .references(() => utilisateurs.id),
  },
  (t) => [primaryKey({ columns: [t.shiftId, t.utilisateurId] })],
);

export const lignesShift = pgTable(
  "lignes_shift",
  {
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    produitId: uuid("produit_id")
      .notNull()
      .references(() => produits.id),
    suiviStock: boolean("suivi_stock").notNull(),
    ouvertureTheorique: numeric("ouverture_theorique", { precision: 12, scale: 3, mode: "number" }),
    ouvertureComptee: numeric("ouverture_comptee", { precision: 12, scale: 3, mode: "number" }),
    ventes: integer("ventes").notNull().default(0),
    stockReelFin: numeric("stock_reel_fin", { precision: 12, scale: 3, mode: "number" }),
    prixVente: numeric("prix_vente", { precision: 10, scale: 2, mode: "number" }),
    cout: numeric("cout", { precision: 10, scale: 2, mode: "number" }),
    stockMinimum: numeric("stock_minimum", { precision: 12, scale: 3, mode: "number" }),
    modifieLe: horodatage("modifie_le"),
    modifiePar: uuid("modifie_par"),
  },
  (t) => [primaryKey({ columns: [t.shiftId, t.produitId] })],
);

/** Ventes d'un shift par produit et par canal, au prix du canal (le total est reporté sur la ligne). */
export const ventesShift = pgTable(
  "ventes_shift",
  {
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    produitId: uuid("produit_id")
      .notNull()
      .references(() => produits.id),
    canalId: uuid("canal_id")
      .notNull()
      .references(() => canauxVente.id),
    quantite: integer("quantite").notNull(),
    prixUnitaire: numeric("prix_unitaire", { precision: 10, scale: 2, mode: "number" }),
    /** Montant réellement encaissé (remises déduites) quand les ventes viennent de Loyverse. */
    montant: numeric("montant", { precision: 12, scale: 2, mode: "number" }),
    source: text("source", { enum: ["manuel", "loyverse"] }).notNull().default("manuel"),
  },
  (t) => [primaryKey({ columns: [t.shiftId, t.produitId, t.canalId] })],
);

/** Journal des imports de ventes Loyverse (un par import, réussi ou non). */
export const synchrosLoyverse = pgTable(
  "synchros_loyverse",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    debut: horodatage("debut").notNull(),
    fin: horodatage("fin").notNull(),
    statut: text("statut", { enum: ["ok", "erreur"] }).notNull(),
    nbRecus: integer("nb_recus").notNull().default(0),
    nbLignes: integer("nb_lignes").notNull().default(0),
    montant: numeric("montant", { precision: 12, scale: 2, mode: "number" }),
    /** Articles vendus mais non rattachés à un produit : [{ sku, nom, quantite }]. */
    nonReconnus: jsonb("non_reconnus"),
    erreur: text("erreur"),
    utilisateurId: uuid("utilisateur_id"),
    horodatage: horodatage("horodatage").notNull().defaultNow(),
  },
  (t) => [index("synchros_loyverse_shift_idx").on(t.shiftId)],
);

export const mouvements = pgTable(
  "mouvements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    produitId: uuid("produit_id")
      .notNull()
      .references(() => produits.id),
    type: text("type", { enum: TYPES_MOUVEMENT }).notNull(),
    quantite: numeric("quantite", { precision: 12, scale: 3, mode: "number" }).notNull(),
    motif: text("motif", { enum: MOTIFS_PERTE }),
    origine: text("origine", { enum: ORIGINES_ENTREE }),
    commentaire: text("commentaire"),
    /** Bon de livraison à l'origine du mouvement (sortie à l'expédition, entrée à la réception). */
    bonId: uuid("bon_id").references(() => bonsLivraison.id, { onDelete: "set null" }),
    utilisateurId: uuid("utilisateur_id")
      .notNull()
      .references(() => utilisateurs.id),
    horodatage: horodatage("horodatage").notNull().defaultNow(),
  },
  (t) => [index("mouvements_shift_idx").on(t.shiftId), index("mouvements_bon_idx").on(t.bonId)],
);

/**
 * Bon de livraison : du laboratoire vers un point de vente (ou transfert entre points de vente).
 * Préparé → expédié (sortie du stock d'origine) → reçu (entrée au stock du destinataire).
 * Les quantités sont dans l'unité de stock du produit (les cakes en parts).
 */
export const bonsLivraison = pgTable(
  "bons_livraison",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numero: serial("numero").notNull().unique(),
    siteOrigineId: uuid("site_origine_id")
      .notNull()
      .references(() => sites.id),
    siteDestinationId: uuid("site_destination_id")
      .notNull()
      .references(() => sites.id),
    statut: text("statut", { enum: STATUTS_BON }).notNull().default("prepare"),
    commentaire: text("commentaire"),
    creePar: uuid("cree_par")
      .notNull()
      .references(() => utilisateurs.id),
    creeLe: horodatage("cree_le").notNull().defaultNow(),
    shiftExpeditionId: uuid("shift_expedition_id").references(() => shifts.id, { onDelete: "set null" }),
    expediePar: uuid("expedie_par").references(() => utilisateurs.id),
    expedieLe: horodatage("expedie_le"),
    shiftReceptionId: uuid("shift_reception_id").references(() => shifts.id, { onDelete: "set null" }),
    recuPar: uuid("recu_par").references(() => utilisateurs.id),
    recuLe: horodatage("recu_le"),
    commentaireReception: text("commentaire_reception"),
  },
  (t) => [index("bons_destination_idx").on(t.siteDestinationId, t.statut), index("bons_origine_idx").on(t.siteOrigineId, t.creeLe)],
);

export const lignesBon = pgTable(
  "lignes_bon",
  {
    bonId: uuid("bon_id")
      .notNull()
      .references(() => bonsLivraison.id, { onDelete: "cascade" }),
    produitId: uuid("produit_id")
      .notNull()
      .references(() => produits.id),
    quantiteExpediee: numeric("quantite_expediee", { precision: 12, scale: 3, mode: "number" }).notNull(),
    quantiteRecue: numeric("quantite_recue", { precision: 12, scale: 3, mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.bonId, t.produitId] })],
);

/** Échecs de connexion par adresse IP (fenêtre d'une heure) : freine les essais en série sur plusieurs comptes. */
export const tentativesConnexion = pgTable("tentatives_connexion", {
  cle: text("cle").primaryKey(),
  debut: horodatage("debut").notNull(),
  echecs: integer("echecs").notNull().default(0),
});

export const journalAudit = pgTable("journal_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  utilisateurId: uuid("utilisateur_id"),
  action: text("action").notNull(),
  entite: text("entite").notNull(),
  entiteId: text("entite_id"),
  details: jsonb("details"),
  horodatage: horodatage("horodatage").notNull().defaultNow(),
});

export const produitsRelations = relations(produits, ({ one }) => ({
  categorie: one(categories, { fields: [produits.categorieId], references: [categories.id] }),
}));
