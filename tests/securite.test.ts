import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { initialiser } from "@/server/seed";

/**
 * Reproduit Supabase : l'application se connecte avec le rôle propriétaire des tables
 * (comme « postgres » chez Supabase, qui n'est pas super-utilisateur), tandis que la Data API
 * de Supabase interroge la base avec les rôles « anon » / « authenticated ».
 */
describe("sécurité de la base (RLS)", () => {
  it("le RLS bloque l'accès public sans gêner l'application", async () => {
    const client = new PGlite();
    await client.exec(`
      CREATE ROLE proprietaire NOSUPERUSER;
      GRANT CREATE ON DATABASE postgres TO proprietaire;
      GRANT ALL ON SCHEMA public TO proprietaire;
      CREATE ROLE anon NOSUPERUSER;
      GRANT USAGE ON SCHEMA public TO anon;
      SET ROLE proprietaire;
    `);
    const pg = drizzle(client, { schema });
    await migrate(pg, { migrationsFolder: "drizzle" });
    const db = pg as unknown as Db;

    // Toutes les tables ont le RLS activé (protège aussi les tables ajoutées plus tard).
    const sansRls = await client.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`,
    );
    expect(sansRls.rows.map((r) => r.relname)).toEqual([]);

    // L'application (propriétaire) lit et écrit normalement.
    await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
    const app = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM produits");
    expect(app.rows[0].n).toBe(66);

    // Le rôle public, même avec des droits sur les tables, ne voit rien et ne peut rien écrire.
    await client.exec("GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon; SET ROLE anon;");
    const public_ = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM utilisateurs");
    expect(public_.rows[0].n).toBe(0);
    await expect(client.exec("INSERT INTO categories (nom) VALUES ('intrus')")).rejects.toThrow(/row-level security/);
    await client.close();
  });
});
