import { readFile } from "node:fs/promises";
import type { Db } from ".";
import { sites } from "./schema";

/** Premier lancement en développement : sites, catalogue, compte Direction et créneaux d'exemple. */
export async function initialiserDev(db: Db) {
  const existants = await db.select({ id: sites.id }).from(sites).limit(1);
  if (existants.length) return;
  const { initialiser } = await import("@/server/seed");
  const catalogueCsv = await readFile("data/catalogue.csv", "utf8");
  const pin = process.env.DIRECTION_PIN ?? "123456";
  await initialiser(db, { catalogueCsv, pinDirection: pin, creneauxExemple: true });
  console.info(`[dev] Base initialisée. Compte « Direction », PIN ${pin}.`);
}
