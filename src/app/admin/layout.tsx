import { BarreHaut } from "@/components/BarreHaut";
import { getDb } from "@/lib/db";
import { lireSite } from "@/server/services/sites";
import { exigerEncadrant } from "./acces";
import { NavAdmin, type LienAdmin } from "./NavAdmin";

export const dynamic = "force-dynamic";

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const session = await exigerEncadrant();
  const site = await lireSite(await getDb(), session.siteId);
  const liens: LienAdmin[] = [
    { href: "/admin", libelle: "Tableau de bord", icone: "tableau" },
    { href: "/admin/remontees", libelle: "Remontées", icone: "remontees" },
    { href: "/admin/planning", libelle: "Planning", icone: "planning" },
    { href: "/admin/reappro", libelle: "Réapprovisionnement", icone: "reappro" },
    { href: "/admin/laboratoire", libelle: "Laboratoire", icone: "labo" },
    ...(session.acteur.role === "direction"
      ? ([
          { href: "/admin/catalogue", libelle: "Catalogue", icone: "catalogue", direction: true },
          { href: "/admin/utilisateurs", libelle: "Utilisateurs", icone: "utilisateurs", direction: true },
          { href: "/admin/sites", libelle: "Sites & créneaux", icone: "sites", direction: true },
          { href: "/admin/loyverse", libelle: "Loyverse", icone: "loyverse", direction: true },
          { href: "/admin/journal", libelle: "Journal", icone: "journal", direction: true },
        ] satisfies LienAdmin[])
      : []),
  ];
  return (
    <>
      <BarreHaut session={session} nomSite={site.nom} />
      <div className="mx-auto max-w-[90rem] lg:flex lg:gap-6 lg:px-4">
        <NavAdmin liens={liens} />
        <main id="contenu" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 focus:outline-none lg:px-0">
          {children}
        </main>
      </div>
    </>
  );
}
