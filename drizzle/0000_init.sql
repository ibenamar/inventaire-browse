CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "couts_produit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produit_id" uuid NOT NULL,
	"cout_unitaire" numeric(10, 2) NOT NULL,
	"date_effet" date NOT NULL,
	"saisi_par" uuid,
	"saisi_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creneaux" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"heure_debut" text NOT NULL,
	"heure_fin" text NOT NULL,
	"jours" integer[] NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipes_shift" (
	"shift_id" uuid NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	CONSTRAINT "equipes_shift_shift_id_utilisateur_id_pk" PRIMARY KEY("shift_id","utilisateur_id")
);
--> statement-breakpoint
CREATE TABLE "journal_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid,
	"action" text NOT NULL,
	"entite" text NOT NULL,
	"entite_id" text,
	"details" jsonb,
	"horodatage" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lignes_shift" (
	"shift_id" uuid NOT NULL,
	"produit_id" uuid NOT NULL,
	"suivi_stock" boolean NOT NULL,
	"ouverture_theorique" integer,
	"ouverture_comptee" integer,
	"ventes" integer DEFAULT 0 NOT NULL,
	"stock_reel_fin" integer,
	"prix_vente" numeric(10, 2),
	"cout" numeric(10, 2),
	"stock_minimum" integer,
	"modifie_le" timestamp with time zone,
	"modifie_par" uuid,
	CONSTRAINT "lignes_shift_shift_id_produit_id_pk" PRIMARY KEY("shift_id","produit_id")
);
--> statement-breakpoint
CREATE TABLE "mouvements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"produit_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantite" integer NOT NULL,
	"motif" text,
	"origine" text,
	"commentaire" text,
	"utilisateur_id" uuid NOT NULL,
	"horodatage" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" text NOT NULL,
	"donnees" "bytea" NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"nom" text NOT NULL,
	"categorie_id" uuid NOT NULL,
	"unite" text DEFAULT 'piece' NOT NULL,
	"format" text,
	"parts_par_gateau" integer,
	"prix_vente" numeric(10, 2),
	"suivi_stock" boolean DEFAULT true NOT NULL,
	"sku" text,
	"loyverse_item_id" text,
	"loyverse_variant_id" text,
	"photo_id" uuid,
	"actif" boolean DEFAULT true NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "produits_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "produits_sites" (
	"produit_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"stock_minimum" integer,
	"actif" boolean DEFAULT true NOT NULL,
	CONSTRAINT "produits_sites_produit_id_site_id_pk" PRIMARY KEY("produit_id","site_id")
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"creneau_id" uuid,
	"journee" date NOT NULL,
	"nom_creneau" text NOT NULL,
	"debut_prevu" timestamp with time zone NOT NULL,
	"fin_prevue" timestamp with time zone NOT NULL,
	"responsable_id" uuid,
	"statut" text DEFAULT 'planifie' NOT NULL,
	"ouvert_par" uuid,
	"ouvert_le" timestamp with time zone,
	"cloture_par" uuid,
	"cloture_le" timestamp with time zone,
	"cloture_forcee" boolean DEFAULT false NOT NULL,
	"commentaire" text,
	"shift_precedent_id" uuid,
	"ventes_source" text DEFAULT 'manuel' NOT NULL,
	"ventes_importees_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"type" text DEFAULT 'point_de_vente' NOT NULL,
	"statut" text DEFAULT 'actif' NOT NULL,
	"mode_ouverture" text DEFAULT 'reprise' NOT NULL,
	"loyverse_store_id" text,
	"ordre" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sites_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "utilisateurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"pin_hash" text NOT NULL,
	"role" text DEFAULT 'employe' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"echecs_pin" integer DEFAULT 0 NOT NULL,
	"bloque_jusqua" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilisateurs_sites" (
	"utilisateur_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	CONSTRAINT "utilisateurs_sites_utilisateur_id_site_id_pk" PRIMARY KEY("utilisateur_id","site_id")
);
--> statement-breakpoint
ALTER TABLE "couts_produit" ADD CONSTRAINT "couts_produit_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creneaux" ADD CONSTRAINT "creneaux_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipes_shift" ADD CONSTRAINT "equipes_shift_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipes_shift" ADD CONSTRAINT "equipes_shift_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_shift" ADD CONSTRAINT "lignes_shift_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_shift" ADD CONSTRAINT "lignes_shift_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements" ADD CONSTRAINT "mouvements_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements" ADD CONSTRAINT "mouvements_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mouvements" ADD CONSTRAINT "mouvements_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_categorie_id_categories_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits" ADD CONSTRAINT "produits_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_sites" ADD CONSTRAINT "produits_sites_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produits_sites" ADD CONSTRAINT "produits_sites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_creneau_id_creneaux_id_fk" FOREIGN KEY ("creneau_id") REFERENCES "public"."creneaux"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_responsable_id_utilisateurs_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_ouvert_par_utilisateurs_id_fk" FOREIGN KEY ("ouvert_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cloture_par_utilisateurs_id_fk" FOREIGN KEY ("cloture_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateurs_sites" ADD CONSTRAINT "utilisateurs_sites_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateurs_sites" ADD CONSTRAINT "utilisateurs_sites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mouvements_shift_idx" ON "mouvements" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "produits_sku_idx" ON "produits" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_site_journee_creneau_uq" ON "shifts" USING btree ("site_id","journee","creneau_id");--> statement-breakpoint
CREATE INDEX "shifts_site_debut_idx" ON "shifts" USING btree ("site_id","debut_prevu");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_un_ouvert_par_site_uq" ON "shifts" USING btree ("site_id") WHERE statut = 'ouvert';