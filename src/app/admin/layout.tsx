import { BarreHaut } from "@/components/BarreHaut";
import { getDb } from "@/lib/db";
import { lireSite } from "@/server/services/sites";
import { exigerEncadrant } from "./acces";
import { NavAdmin } from "./NavAdmin";

export const dynamic = "force-dynamic";

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const session = await exigerEncadrant();
  const site = await lireSite(await getDb(), session.siteId);
  const liens = [
    { href: "/admin", libelle: "Tableau de bord" },
    { href: "/admin/remontees", libelle: "Remontées" },
    { href: "/admin/planning", libelle: "Planning" },
    ...(session.acteur.role === "direction"
      ? [
          { href: "/admin/catalogue", libelle: "Catalogue" },
          { href: "/admin/utilisateurs", libelle: "Utilisateurs" },
          { href: "/admin/sites", libelle: "Sites & créneaux" },
          { href: "/admin/loyverse", libelle: "Loyverse" },
          { href: "/admin/journal", libelle: "Journal" },
        ]
      : []),
  ];
  return (
    <>
      <BarreHaut session={session} nomSite={site.nom} />
      <NavAdmin liens={liens} />
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </>
  );
}
