/**
 * Génère src/server/correspondances-loyverse.ts à partir de data/correspondances_loyverse.csv.
 * Seules les lignes « sûr » et « probable » sont appliquées automatiquement à l'import ;
 * les lignes « à confirmer » restent à rattacher à la main dans l'écran Loyverse.
 *   npm run correspondances
 */
import { readFileSync, writeFileSync } from "node:fs";
import { lireCsv } from "../src/lib/csv";

const lignes = lireCsv(readFileSync("data/correspondances_loyverse.csv", "utf8"));
const retenues = lignes
  .filter((l) => l.fiabilite === "sûr" || l.fiabilite === "probable")
  .map((l) => ({ sku: l.sku_loyverse, refProduit: l.ref_produit, facteur: Number(l.facteur || 1) }));
const code = `// Fichier généré par « npm run correspondances » depuis data/correspondances_loyverse.csv : ne pas modifier à la main.
import type { Correspondance } from "./services/loyverse";

export const CORRESPONDANCES_LOYVERSE: Correspondance[] = ${JSON.stringify(retenues, null, 2)};
`;
writeFileSync("src/server/correspondances-loyverse.ts", code);
console.log(`${retenues.length} correspondances retenues sur ${lignes.length} (les autres sont à confirmer).`);
