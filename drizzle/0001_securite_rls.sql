-- Sécurité Supabase : Supabase expose automatiquement les tables du schéma public via son API
-- (Data API). Le RLS activé sans aucune règle bloque tout accès par cette voie.
-- L'application n'est pas concernée : elle se connecte avec le rôle propriétaire des tables,
-- qui n'est pas soumis au RLS.
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "couts_produit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "creneaux" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "equipes_shift" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lignes_shift" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mouvements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "produits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "produits_sites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "utilisateurs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "utilisateurs_sites" ENABLE ROW LEVEL SECURITY;
