/**
 * CSV lisible directement par Excel en français : séparateur « ; », virgule décimale,
 * BOM UTF-8 (accents corrects), guillemets doublés.
 */
export type Cellule = string | number | null | undefined;

const cellule = (v: Cellule): string => {
  if (v === null || v === undefined) return "";
  const t = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")) : v;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function versCsv(entetes: string[], lignes: Cellule[][]): string {
  return "﻿" + [entetes, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
}

export function reponseCsv(nomFichier: string, contenu: string): Response {
  return new Response(contenu, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
      "Cache-Control": "no-store",
    },
  });
}
