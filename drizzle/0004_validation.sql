ALTER TABLE "shifts" ADD COLUMN "valide_par" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "valide_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_valide_par_utilisateurs_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."utilisateurs"("id") ON DELETE no action ON UPDATE no action;