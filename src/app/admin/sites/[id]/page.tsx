import Link from "next/link";
import { notFound } from "next/navigation";
import { Titre } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listerCreneaux, listerSites } from "@/server/services/sites";
import { exigerDirection } from "../../acces";
import { EditeurCreneaux, FormulaireSite } from "./Formulaires";

export default async function Site({ params }: { params: Promise<{ id: string }> }) {
  await exigerDirection();
  const { id } = await params;
  const db = await getDb();
  const site = (await listerSites(db)).find((s) => s.id === id);
  if (!site) notFound();
  const creneaux = await listerCreneaux(db, id);
  return (
    <>
      <Link href="/admin/sites" className="text-sm font-semibold text-marque-700">
        ← Sites
      </Link>
      <Titre>{site.nom}</Titre>
      <div className="grid gap-6">
        <FormulaireSite site={{ id: site.id, statut: site.statut, modeOuverture: site.modeOuverture }} />
        <EditeurCreneaux
          siteId={site.id}
          initial={creneaux.map((c) => ({ id: c.id, nom: c.nom, heureDebut: c.heureDebut, heureFin: c.heureFin, jours: c.jours }))}
        />
      </div>
    </>
  );
}
