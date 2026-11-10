CREATE TABLE "recettes" (
	"produit_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantite" numeric(12, 4) NOT NULL,
	CONSTRAINT "recettes_produit_id_ingredient_id_pk" PRIMARY KEY("produit_id","ingredient_id")
);
--> statement-breakpoint
ALTER TABLE "produits" ADD COLUMN "ingredient_points_de_vente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produits" ADD COLUMN "duree_conservation_jours" integer;--> statement-breakpoint
ALTER TABLE "recettes" ADD CONSTRAINT "recettes_produit_id_produits_id_fk" FOREIGN KEY ("produit_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recettes" ADD CONSTRAINT "recettes_ingredient_id_produits_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."produits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recettes" ENABLE ROW LEVEL SECURITY;
