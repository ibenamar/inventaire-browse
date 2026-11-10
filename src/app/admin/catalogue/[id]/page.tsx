import Link from "next/link";
import { notFound } from "next/navigation";
import { Carte, formatMad, Titre } from "@/components/ui";
import { journeeLocale } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { ErreurMetier } from "@/server/erreurs";
import { coutEnVigueur, historiqueCouts, lireProduit } from "@/server/services/catalogue";
import { exigerDirection } from "../../acces";
import { FormulaireCout, FormulaireProduit, PrisePhoto } from "./Formulaires";

export default async function Produit({ params }: { params: Promise<{ id: string }> }) {
  await exigerDirection();
  const { id } = await params;
  const db = await getDb();
  const p = await lireProduit(db, id).catch((e) => {
    if (e instanceof ErreurMetier) notFound();
    throw e;
  });
  const aujourdhui = journeeLocale(new Date());
  const cout = await coutEnVigueur(db, id, aujourdhui);
  const historique = await historiqueCouts(db, id);
  return (
    <>
      <Link href="/admin/catalogue" className="text-sm font-semibold text-marque-700">
        ← Catalogue
      </Link>
      <Titre sousTitre={`${p.ref} · ${p.categorie}`}>{p.nom}</Titre>
      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <Carte>
          <PrisePhoto produitId={p.id} photoId={p.photoId} nom={p.nom} categorie={p.categorie} />
        </Carte>
        <div className="grid gap-4">
          <Carte>
            <FormulaireProduit produit={p} />
          </Carte>
          <Carte>
            <h2 className="mb-1 text-lg font-semibold">Coût de revient</h2>
            <p className="mb-3 text-sm text-stone-600">
              En vigueur : <strong>{formatMad(cout)}</strong> par {p.unite === "part" ? "part" : "unité"}. Sert à valoriser les pertes et les écarts au
              coût réel.
            </p>
            <FormulaireCout produitId={p.id} aujourdhui={aujourdhui} />
            {historique.length > 0 && (
              <ul className="mt-3 text-sm text-stone-600">
                {historique.map((h) => (
                  <li key={h.id}>
                    {formatMad(h.coutUnitaire)} à partir du {h.dateEffet.split("-").reverse().join("/")}
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </div>
      </div>
    </>
  );
}
