import Link from "next/link";
import { notFound } from "next/navigation";
import { Carte, formatMad, Titre } from "@/components/ui";
import { journeeLocale } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { ErreurMetier } from "@/server/erreurs";
import { listerArticles, listerCanaux } from "@/server/services/caisse";
import { coutEnVigueur, historiqueCouts, lireProduit } from "@/server/services/catalogue";
import { exigerDirection } from "../../acces";
import { ArticlesCaisse, FormulaireCout, FormulaireProduit, PrisePhoto } from "./Formulaires";

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
  const [articles, canaux] = await Promise.all([listerArticles(db, { produitId: id }), listerCanaux(db)]);
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
            <h2 className="mb-1 text-lg font-semibold">Articles de caisse (Loyverse)</h2>
            <p className="mb-3 text-sm text-stone-600">
              Un article par canal de vente (et par lot : gâteau entier, boîte), chacun avec son SKU et son prix par magasin. Toutes ces ventes font sortir le stock de ce produit ; « × 8 » = 8 unités par article vendu.
            </p>
            <ArticlesCaisse
              produitId={p.id}
              nomProduit={p.nom}
              articles={articles.map((a) => ({
                id: a.id,
                canal: a.canal,
                nom: a.nomCaisse,
                sku: a.sku,
                facteur: a.facteur,
                prix: a.prixMagasins.length
                  ? [...new Set(a.prixMagasins.map((p) => formatMad(p.prix)))].join(" / ")
                  : formatMad(a.prixVente),
              }))}
              canaux={canaux.map((c) => ({ id: c.id, nom: c.nom }))}
            />
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
