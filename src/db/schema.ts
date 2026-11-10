import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
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
export const UNITES = ["piece", "part", "bouteille"] as const;
export const STATUTS_SHIFT = ["planifie", "ouvert", "cloture", "valide"] as const;
export const TYPES_MOUVEMENT = ["entree", "perte", "ajustement"] as const;
export const MOTIFS_PERTE = ["peremption", "endommage"] as const;
export const ORIGINES_ENTREE = ["labo", "fournisseur", "autre_site", "autre"] as const;

export type Role = (typeof ROLES)[number];
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
    prixVente: numeric("prix_vente", { precision: 10, scale: 2, mode: "number" }),
    suiviStock: boolean("suivi_stock").notNull().default(true),
    sku: text("sku"),
    loyverseItemId: text("loyverse_item_id"),
    loyverseVariantId: text("loyverse_variant_id"),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    actif: boolean("actif").notNull().default(true),
    ordre: integer("ordre").notNull().default(0),
  },
  (t) => [index("produits_sku_idx").on(t.sku)],
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
    stockMinimum: integer("stock_minimum"),
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
    ouvertureTheorique: integer("ouverture_theorique"),
    ouvertureComptee: integer("ouverture_comptee"),
    ventes: integer("ventes").notNull().default(0),
    stockReelFin: integer("stock_reel_fin"),
    prixVente: numeric("prix_vente", { precision: 10, scale: 2, mode: "number" }),
    cout: numeric("cout", { precision: 10, scale: 2, mode: "number" }),
    stockMinimum: integer("stock_minimum"),
    modifieLe: horodatage("modifie_le"),
    modifiePar: uuid("modifie_par"),
  },
  (t) => [primaryKey({ columns: [t.shiftId, t.produitId] })],
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
    quantite: integer("quantite").notNull(),
    motif: text("motif", { enum: MOTIFS_PERTE }),
    origine: text("origine", { enum: ORIGINES_ENTREE }),
    commentaire: text("commentaire"),
    utilisateurId: uuid("utilisateur_id")
      .notNull()
      .references(() => utilisateurs.id),
    horodatage: horodatage("horodatage").notNull().defaultNow(),
  },
  (t) => [index("mouvements_shift_idx").on(t.shiftId)],
);

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
