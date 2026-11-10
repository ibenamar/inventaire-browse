/** Applique les migrations sur la base de production (DATABASE_URL, ex. Supabase). */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");
const client = postgres(url, { max: 1, prepare: false });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
console.log("Migrations appliquées.");
