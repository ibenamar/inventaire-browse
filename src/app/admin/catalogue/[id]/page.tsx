import { FilAriane } from "@/components/FilAriane";
import { notFound } from "next/navigation";
import { Carte, formatMad, Titre } from "@/components/ui";
import { journeeLocale } from "@/domain/temps";
import { formatQuantite, UNITE_PLURIEL, UNITE_SINGULIER } from "@/domain/unites";
import { getDb } from "@/lib/db";
import { ErreurMetier } from "@/server/erreurs";
import { listerArticles, listerCanaux } from "@/server/services/caisse";
import { coutEnVigueur, historiqueCouts, lireProduit, lireRecette, lireUtilisations, listerProduits, stocksMinimum } from "@/server/services/catalogue";
import Link from "next/link";
import { FicheTechnique } from "./FicheTechnique";
import { exigerDirection } from "../../acces";
import { ArticlesCaisse, FormulaireCout, FormulaireProduit, FormulaireStocksMinimum, PrisePhoto } from "./Formulaires";

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
  const [articles, canaux, minimums] = await Promise.all([listerArticles(db, { produitId: id }), listerCanaux(db), stocksMinimum(db, id)]);
  // Produit fini et préparation intermédiaire ont une fiche technique ; matière première et
  // intermédiaire peuvent entrer dans d'autres fiches.
  const recette = p.nature !== "ingredient" ? await lireRecette(db, id, aujourdhui) : null;
  const composants =
    p.nature !== "ingredient" ? (await listerProduits(db, { actifsSeulement: true })).filter((x) => x.nature !== "produit" && x.id !== id) : [];
  const utilisations = p.nature !== "produit" ? await lireUtilisations(db, id) : [];
  return (
    <>
      <FilAriane etapes={[{ libelle: "Administration", href: "/admin" }, { libelle: "Catalogue", href: "/admin/catalogue" }, { libelle: p.nom }]} />
      <Titre sousTitre={`${p.ref} · ${p.categorie}`}>{p.nom}</Titre>
      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <Carte>
          <PrisePhoto produitId={p.id} photoId={p.photoId} nom={p.nom} categorie={p.categorie} />
        </Carte>
        <div className="grid gap-4">
          <Carte>
            <FormulaireProduit produit={p} />
          </Carte>
          {p.nature === "produit" && (
          <Carte>
            <h2 className="mb-1 text-lg font-semibold">Articles de caisse (Loyverse)</h2>
            <p className="mb-3 text-sm text-muted-foreground">
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
          )}
          {p.suiviStock && (
            <Carte>
              <h2 className="mb-1 text-lg font-semibold">Stock minimum par site</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                En dessous de ce niveau au comptage de clôture, le produit apparaît dans les alertes de réapprovisionnement. Vide = pas d&apos;alerte.
                Pris en compte à partir du prochain shift ouvert.
              </p>
              <FormulaireStocksMinimum produitId={p.id} unite={p.unite} minimums={minimums} />
            </Carte>
          )}
          {recette && (
            <Carte>
              <h2 className="mb-1 text-lg font-semibold">Fiche technique</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Matières premières et préparations intermédiaires de la recette : elles donnent le coût de revient calculé et la consommation
                théorique (production du labo, ventes des préparations à la commande), comparée à la consommation réelle.
                {p.nature === "intermediaire" && " Une préparation peut elle-même en utiliser une autre (ex. crème mousseline ← crème pâtissière)."}
              </p>
              <FicheTechnique
                produitId={p.id}
                ingredients={composants.map((x) => ({ id: x.id, nom: x.nom, unite: x.unite, intermediaire: x.nature === "intermediaire" }))}
                lignes={recette.lignes.map((l) => ({ ingredientId: l.ingredientId, quantite: l.quantite }))}
                pour={recette.parGateau ? `un gâteau entier (${recette.parGateau} parts)` : p.nature === "intermediaire" ? `1 ${UNITE_SINGULIER[p.unite]} de préparation` : "une unité"}
                cout={recette.lignes.length ? { recette: recette.coutRecette, parUnite: recette.coutParUnite, complet: recette.complet, libelleUnite: recette.parGateau ? "part" : "unité" } : null}
              />
            </Carte>
          )}
          {p.nature !== "produit" && (
            <Carte>
              <h2 className="mb-1 text-lg font-semibold">Utilisé dans</h2>
              {utilisations.length ? (
                <ul className="divide-y divide-border text-sm">
                  {utilisations.map((u) => (
                    <li key={u.produitId} className="flex flex-wrap justify-between gap-2 py-1.5">
                      <Link href={`/admin/catalogue/${u.produitId}`} className="font-semibold underline-offset-2 hover:underline">
                        {u.produit}
                        {u.nature === "intermediaire" && <span className="font-normal text-muted-foreground"> (préparation)</span>}
                      </Link>
                      <span className="tabular-nums text-muted-foreground">
                        {formatQuantite(u.quantite)} {UNITE_PLURIEL[p.unite]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune fiche technique ne l&apos;utilise pour l&apos;instant.</p>
              )}
            </Carte>
          )}
          <Carte>
            <h2 className="mb-1 text-lg font-semibold">Coût de revient</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              En vigueur : <strong>{formatMad(cout)}</strong> par {UNITE_SINGULIER[p.unite]}
              {p.nature !== "produit" && p.format ? ` (et non par ${p.format})` : ""}. Pris en compte à partir du prochain shift ouvert. Sert à valoriser les pertes et les écarts au
              coût réel.
            </p>
            <FormulaireCout produitId={p.id} aujourdhui={aujourdhui} unite={p.unite} />
            {historique.length > 0 && (
              <ul className="mt-3 text-sm text-muted-foreground">
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
