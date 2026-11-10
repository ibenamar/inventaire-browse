/** Données initiales sur la base de production (DATABASE_URL). Idempotent. */
import { readFileSync } from "node:fs";
import { creerDbPostgres } from "../src/db";
import { initialiser } from "../src/server/seed";

const url = process.env.DATABASE_URL;
const pin = process.env.DIRECTION_PIN;
if (!url) throw new Error("DATABASE_URL manquant");
if (!pin || !/^\d{6}$/.test(pin)) throw new Error("DIRECTION_PIN (6 chiffres) requis pour le compte Direction");
const db = await creerDbPostgres(url);
const r = await initialiser(db, {
  catalogueCsv: readFileSync("data/catalogue.csv", "utf8"),
  pinDirection: pin,
  creneauxExemple: process.env.CRENEAUX_EXEMPLE === "1",
});
console.log(r);
process.exit(0);
