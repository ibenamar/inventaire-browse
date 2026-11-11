import Link from "next/link";
import { cx, Titre } from "@/components/ui";
import { formatLocal } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { listerJournal } from "@/server/audit";
import { exigerDirection } from "../acces";

const ACTIONS: Record<string, string> = {
  ouvrir: "Ouverture du shift",
  cloturer: "Clôture du shift",
  forcer_cloture: "Clôture forcée",
  valider: "Validation du shift",
  corriger: "Correction",
  reimporter_ventes: "Réimport des ventes",
  supprimer_mouvement: "Suppression d'une saisie",
  planifier: "Planification",
  retirer: "Retrait du planning",
  reaffecter_responsable: "Changement de responsable",
  creer: "Création",
  modifier: "Modification",
  enregistrer_creneaux: "Créneaux",
  magasin_loyverse: "Magasin Loyverse",
  import_loyverse: "Import des articles Loyverse",
  ajouter_cout: "Coût de revient",
  stocks_minimum: "Stocks minimum",
  photo: "Photo",
  ajouter_article_caisse: "Article de caisse ajouté",
  associer_article_caisse: "Article de caisse rattaché",
  retirer_article_caisse: "Article de caisse retiré",
  ignorer_article_caisse: "Article ignoré",
  ignorer_categorie_caisse: "Catégorie ignorée",
};
const ENTITES: Record<string, string> = { shift: "Shift", produit: "Produit", utilisateur: "Utilisateur", site: "Site", catalogue: "Catalogue", article_caisse: "Article de caisse" };

function lien(entite: string, id: string | null) {
  if (!id) return null;
  if (entite === "shift") return `/shift/${id}/cloture`;
  if (entite === "produit") return `/admin/catalogue/${id}`;
  if (entite === "utilisateur") return `/admin/utilisateurs/${id}`;
  if (entite === "site") return `/admin/sites/${id}`;
  return null;
}

/** Résumé lisible des détails (ex. correction : champ, avant → après). */
function resume(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as Record<string, unknown>;
  if ("avant" in d && "apres" in d) return `${String(d.champ ?? "")} : ${String(d.avant ?? "—")} → ${String(d.apres ?? "—")}`;
  if ("motif" in d && typeof d.motif === "string") return d.motif;
  return Object.entries(d)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k} : ${String(v)}`)
    .join(" · ");
}

export default async function Journal({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await exigerDirection();
  const { type } = await searchParams;
  const lignes = await listerJournal(await getDb(), { limite: 300, entite: type || undefined });
  return (
    <>
      <Titre sousTitre="Qui a fait quoi, et quand : ouvertures, clôtures, corrections, validations, réglages. 300 dernières opérations.">Journal</Titre>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {[["", "Tout"], ...Object.entries(ENTITES)].map(([k, l]) => (
          <Link
            key={k}
            href={k ? `/admin/journal?type=${k}` : "/admin/journal"}
            className={cx("rounded-full px-3 py-1.5 font-semibold ring-1", (type ?? "") === k ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-input")}
          >
            {l}
          </Link>
        ))}
      </div>
      <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
        {lignes.map(({ j, auteur }) => {
          const href = lien(j.entite, j.entiteId);
          return (
            <li key={j.id} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[8.5rem_9rem_1fr]">
              <span className="text-muted-foreground tabular-nums">{formatLocal(j.horodatage, "dd/MM/yy HH:mm")}</span>
              <span className="font-semibold">{auteur ?? "Système"}</span>
              <span className="min-w-0">
                {ACTIONS[j.action] ?? j.action}
                {" · "}
                {href ? (
                  <Link href={href} className="text-primary underline">
                    {ENTITES[j.entite] ?? j.entite}
                  </Link>
                ) : (
                  (ENTITES[j.entite] ?? j.entite)
                )}
                {resume(j.details) && <span className="block truncate text-xs text-muted-foreground">{resume(j.details)}</span>}
              </span>
            </li>
          );
        })}
        {lignes.length === 0 && <li className="px-4 py-6 text-center text-muted-foreground">Aucune opération.</li>}
      </ul>
    </>
  );
}
