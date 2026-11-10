CREATE TABLE "tentatives_connexion" (
	"cle" text PRIMARY KEY NOT NULL,
	"debut" timestamp with time zone NOT NULL,
	"echecs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tentatives_connexion" ENABLE ROW LEVEL SECURITY;
