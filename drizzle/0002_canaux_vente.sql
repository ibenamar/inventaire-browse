CREATE TABLE "articles_caisse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produit_id" uuid,
	"canal_id" uuid NOT NULL,
	"nom_caisse" text NOT NULL,
	"categorie_caisse" text,
	"sku" text,
	"loyverse_item_id" text,
	"loyverse_variant_id" text,
	"prix_vente" numeric(10, 2),
	"facteur" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manuel' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_caisse_loyverse_variant_id_unique" UNIQUE("loyverse_variant_id")
);
--> statement-breakpoint
CREATE TABLE "canaux_vente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"mots_cles" text[] DEFAULT '{}'::text[] NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	CONSTRAINT "canaux_vente_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "prix_articles_magasins" (
	"article_id" uuid NOT NULL,
	"magasin" text NOT NULL,
	"prix" numeric(10, 2),
	"disponible" boolean DEFAULT true NOT NULL,
	CONSTRAINT "prix_articles_magasins_article_id_magasin_pk" PRIMARY KEY("article_id","magasin")
);
--> statement-breakpoint
CREATE TABLE "ventes_shift" (
	"shift_id" uuid NOT NULL,
	"produit_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"quantite" integer NOT NULL,
	"prix_unitaire" numeric(10, 2),
	CONSTRAINT "ventes_shift_shift_id_produit_id_canal_id_pk" PRIMARY KEY("shift_id","produit_id","canal_id")
);
--> statement-breakpoint
DROP INDEX "produits_sku_idx";--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "loyverse_magasin" text;--> statement-breakpoint
ALTER TABLE "articles_caisse" ADD CONSTRAINT "articles_caisse_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles_caisse" ADD CONSTRAINT "articles_caisse_canal_id_canaux_vente_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canaux_vente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prix_articles_magasins" ADD CONSTRAINT "prix_articles_magasins_article_id_articles_caisse_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles_caisse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_shift" ADD CONSTRAINT "ventes_shift_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_shift" ADD CONSTRAINT "ventes_shift_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventes_shift" ADD CONSTRAINT "ventes_shift_canal_id_canaux_vente_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canaux_vente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_caisse_sku_idx" ON "articles_caisse" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "articles_caisse_produit_idx" ON "articles_caisse" USING btree ("produit_id");--> statement-breakpoint
CREATE INDEX "produits_categorie_idx" ON "produits" USING btree ("categorie_id");--> statement-breakpoint
-- Canaux de vente initiaux : chez Browse, les articles Glovo sont rangés dans la catégorie Loyverse « Glovo ».
INSERT INTO "canaux_vente" ("code", "nom", "mots_cles", "ordre") VALUES
	('sur_place', 'Sur place', '{}', 1),
	('glovo', 'Glovo', '{glovo}', 2)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Reprise des correspondances Loyverse existantes (un article par produit) sur le canal « sur place ».
INSERT INTO "articles_caisse" ("produit_id", "canal_id", "nom_caisse", "sku", "loyverse_item_id", "loyverse_variant_id", "prix_vente", "source")
SELECT p."id", c."id", p."nom", p."sku", p."loyverse_item_id", p."loyverse_variant_id", p."prix_vente",
	CASE WHEN p."loyverse_variant_id" IS NULL THEN 'manuel' ELSE 'loyverse' END
FROM "produits" p CROSS JOIN "canaux_vente" c
WHERE c."code" = 'sur_place' AND (p."sku" IS NOT NULL OR p."loyverse_variant_id" IS NOT NULL);--> statement-breakpoint
-- Reprise des ventes déjà saisies (canal « sur place »).
INSERT INTO "ventes_shift" ("shift_id", "produit_id", "canal_id", "quantite", "prix_unitaire")
SELECT l."shift_id", l."produit_id", c."id", l."ventes", l."prix_vente"
FROM "lignes_shift" l CROSS JOIN "canaux_vente" c
WHERE c."code" = 'sur_place' AND l."ventes" > 0;--> statement-breakpoint
-- Magasins Loyverse des deux points de vente ouverts (modifiable dans Sites & créneaux).
UPDATE "sites" SET "loyverse_magasin" = 'BROWSE COFFEE SHOP' WHERE "nom" = 'Browse 2 Mars' AND "loyverse_magasin" IS NULL;--> statement-breakpoint
UPDATE "sites" SET "loyverse_magasin" = 'Browse Sweet' WHERE "nom" = 'Browse Sweets 2 Mars' AND "loyverse_magasin" IS NULL;--> statement-breakpoint
ALTER TABLE "canaux_vente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "articles_caisse" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prix_articles_magasins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ventes_shift" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "produits" DROP COLUMN "sku";--> statement-breakpoint
ALTER TABLE "produits" DROP COLUMN "loyverse_item_id";--> statement-breakpoint
ALTER TABLE "produits" DROP COLUMN "loyverse_variant_id";