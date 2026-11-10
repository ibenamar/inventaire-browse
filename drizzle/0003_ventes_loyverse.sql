CREATE TABLE "synchros_loyverse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"debut" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"statut" text NOT NULL,
	"nb_recus" integer DEFAULT 0 NOT NULL,
	"nb_lignes" integer DEFAULT 0 NOT NULL,
	"montant" numeric(12, 2),
	"non_reconnus" jsonb,
	"erreur" text,
	"utilisateur_id" uuid,
	"horodatage" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ventes_shift" ADD COLUMN "montant" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "ventes_shift" ADD COLUMN "source" text DEFAULT 'manuel' NOT NULL;--> statement-breakpoint
ALTER TABLE "synchros_loyverse" ADD CONSTRAINT "synchros_loyverse_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "synchros_loyverse_shift_idx" ON "synchros_loyverse" USING btree ("shift_id");--> statement-breakpoint
ALTER TABLE "synchros_loyverse" ENABLE ROW LEVEL SECURITY;
