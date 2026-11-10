import Link from "next/link";
import { redirect } from "next/navigation";
import { Carte } from "@/components/ui";
import { getDb } from "@/lib/db";
import { lireSession, siteAppareil } from "@/lib/session";
import { listerSites } from "@/server/services/sites";
import { utilisateursDuSite } from "@/server/services/utilisateurs";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const dynamic = "force-dynamic";

export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  if (await lireSession()) redirect("/");
  const db = await getDb();
  const sites = await listerSites(db, { actifsSeulement: true });
  const sp = await searchParams;
  const siteId = sp.site ?? (await siteAppareil());
  const site = sites.find((s) => s.id === siteId);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="mx-auto mb-3 size-16" />
        <h1 className="text-2xl font-bold">Inventaire Browse</h1>
      </div>
      {!site ? (
        <Carte>
          <h2 className="mb-3 text-lg font-semibold">Sur quel site êtes-vous ?</h2>
          <div className="grid gap-2">
            {sites.map((s) => (
              <Link
                key={s.id}
                href={`/login?site=${s.id}`}
                className="rounded-xl bg-marque-50 px-4 py-4 text-lg font-semibold text-marque-900 ring-1 ring-marque-200 hover:bg-marque-100"
              >
                {s.nom}
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">Ce choix est mémorisé sur cet appareil.</p>
        </Carte>
      ) : (
        <FormulaireConnexion
          site={{ id: site.id, nom: site.nom }}
          utilisateurs={(await utilisateursDuSite(db, site.id, { avecDirection: false })).filter((u) => u.role !== "direction").map((u) => ({ id: u.id, nom: u.nom }))}
        />
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/aide" className="font-semibold text-marque-700 hover:underline">
          Aide : guide d&apos;utilisation
        </Link>
      </p>
    </main>
  );
}
