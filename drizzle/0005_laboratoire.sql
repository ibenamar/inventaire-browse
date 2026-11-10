CREATE TABLE "bons_livraison" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" serial NOT NULL,
	"site_origine_id" uuid NOT NULL,
	"site_destination_id" uuid NOT NULL,
	"statut" text DEFAULT 'prepare' NOT NULL,
	"commentaire" text,
	"cree_par" uuid NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"shift_expedition_id" uuid,
	"expedie_par" uuid,
	"expedie_le" timestamp with time zone,
	"shift_reception_id" uuid,
	"recu_par" uuid,
	"recu_le" timestamp with time zone,
	"commentaire_reception" text,
	CONSTRAINT "bons_livraison_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "lignes_bon" (
	"bon_id" uuid NOT NULL,
	"produit_id" uuid NOT NULL,
	"quantite_expediee" numeric(12, 3) NOT NULL,
	"quantite_recue" numeric(12, 3),
	CONSTRAINT "lignes_bon_bon_id_produit_id_pk" PRIMARY KEY("bon_id","produit_id")
);
--> statement-breakpoint
ALTER TABLE "lignes_shift" ALTER COLUMN "ouverture_theorique" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "lignes_shift" ALTER COLUMN "ouverture_comptee" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "lignes_shift" ALTER COLUMN "stock_reel_fin" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "lignes_shift" ALTER COLUMN "stock_minimum" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "mouvements" ALTER COLUMN "quantite" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "produits_sites" ALTER COLUMN "stock_minimum" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "mouvements" ADD COLUMN "bon_id" uuid;--> statement-breakpoint
ALTER TABLE "produits" ADD COLUMN "nature" text DEFAULT 'produit' NOT NULL;--> statement-breakpoint
ALTER TABLE "produits" ADD COLUMN "fabrique_labo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_site_origine_id_sites_id_fk" FOREIGN KEY ("site_origine_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_site_destination_id_sites_id_fk" FOREIGN KEY ("site_destination_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_cree_par_utilisateurs_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_shift_expedition_id_shifts_id_fk" FOREIGN KEY ("shift_expedition_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_expedie_par_utilisateurs_id_fk" FOREIGN KEY ("expedie_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_shift_reception_id_shifts_id_fk" FOREIGN KEY ("shift_reception_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_recu_par_utilisateurs_id_fk" FOREIGN KEY ("recu_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_bon" ADD CONSTRAINT "lignes_bon_bon_id_bons_livraison_id_fk" FOREIGN KEY ("bon_id") REFERENCES "public"."bons_livraison"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lignes_bon" ADD CONSTRAINT "lignes_bon_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bons_destination_idx" ON "bons_livraison" USING btree ("site_destination_id","statut");--> statement-breakpoint
CREATE INDEX "bons_origine_idx" ON "bons_livraison" USING btree ("site_origine_id","cree_le");--> statement-breakpoint
ALTER TABLE "mouvements" ADD CONSTRAINT "mouvements_bon_id_bons_livraison_id_fk" FOREIGN KEY ("bon_id") REFERENCES "public"."bons_livraison"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mouvements_bon_idx" ON "mouvements" USING btree ("bon_id");--> statement-breakpoint
ALTER TABLE "bons_livraison" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lignes_bon" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Pâtisseries suivies en stock (hors boissons) : fabriquées par le laboratoire.
UPDATE "produits" SET "fabrique_labo" = true
WHERE "suivi_stock" AND "nature" = 'produit'
  AND "categorie_id" NOT IN (SELECT "id" FROM "categories" WHERE "nom" ILIKE 'boissons%');--> statement-breakpoint
INSERT INTO "categories" ("nom", "ordre") VALUES ('Ingrédients', 100) ON CONFLICT ("nom") DO NOTHING;
