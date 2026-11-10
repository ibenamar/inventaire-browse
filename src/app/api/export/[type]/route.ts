import { sitesPilotables } from "@/app/admin/acces";
import { periode } from "@/app/admin/periode";
import { getDb } from "@/lib/db";
import { reponseCsv } from "@/lib/export-csv";
import { lireSession } from "@/lib/session";
import { estEncadrant } from "@/server/acteur";
import { exportDetailShifts, exportSyntheseProduits } from "@/server/services/exports";

export const dynamic = "force-dynamic";

/** Exports Excel (CSV) des encadrants : mêmes filtres que le tableau de bord (site, semaine / mois, date). */
export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const session = await lireSession();
  if (!session || !estEncadrant(session.acteur)) return new Response("Réservé aux managers et à la direction", { status: 403 });
  const { type } = await params;
  const q = new URL(req.url).searchParams;
  const db = await getDb();
  const sites = (await sitesPilotables(db, session.acteur)).filter((s) => s.statut === "actif");
  const site = sites.find((s) => s.id === q.get("site"));
  const siteIds = site ? [site.id] : session.acteur.role === "direction" ? sites.map((s) => s.id) : sites.slice(0, 1).map((s) => s.id);
  const p = periode(q.get("vue") === "mois" ? "mois" : "semaine", q.get("date") ?? undefined);
  const suffixe = `${site ? site.nom.replace(/\s+/g, "-") : "tous-sites"}_${p.du}_${p.au}`;
  if (type === "detail") return reponseCsv(`inventaire-detail_${suffixe}.csv`, await exportDetailShifts(db, { siteIds, du: p.du, au: p.au }));
  if (type === "produits") return reponseCsv(`inventaire-produits_${suffixe}.csv`, await exportSyntheseProduits(db, { siteIds, du: p.du, au: p.au }));
  return new Response("Export inconnu", { status: 404 });
}
