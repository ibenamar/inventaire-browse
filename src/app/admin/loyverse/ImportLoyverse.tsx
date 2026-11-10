"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Bouton, classesChamp, formatMad, Message } from "@/components/ui";
import type { Resultat } from "@/lib/resultat";
import type { RapportImport } from "@/server/services/loyverse";
import { actionAssocierArticle, actionIgnorerArticle, actionIgnorerCategorie, actionImporterCsvLoyverse, actionImporterLoyverse } from "../actions";

function Rapport({ rapport }: { rapport: RapportImport }) {
  return (
    <div className="grid gap-2 text-sm">
      <Message ton="succes">
        {rapport.articlesImportes} article(s) Loyverse lus, {rapport.nouveauxAssocies.length} nouveau(x) rattaché(s) automatiquement.
      </Message>
      {rapport.nonAssocies.length > 0 && (
        <Message ton="alerte">{rapport.nonAssocies.length} article(s) en vente restent à rattacher ou à ignorer (ci-dessous).</Message>
      )}
      {rapport.produitsSansArticleSurPlace.length > 0 && (
        <Message ton="alerte">Produits sans article « sur place » en caisse : {rapport.produitsSansArticleSurPlace.join(", ")}</Message>
      )}
    </div>
  );
}

export function ImportLoyverse({ actif }: { actif: boolean }) {
  const router = useRouter();
  const fichier = useRef<HTMLInputElement>(null);
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const lancer = (f: () => Promise<Resultat<RapportImport>>) =>
    demarrer(async () => {
      setErreur(null);
      setRapport(null);
      const r = await f();
      if (r.ok) {
        setRapport(r.valeur ?? null);
        router.refresh();
      } else setErreur(r.erreur);
    });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Bouton disabled={!actif || enCours} onClick={() => lancer(actionImporterLoyverse)}>
          {enCours ? "Import en cours…" : "Importer depuis Loyverse (API)"}
        </Bouton>
        <input
          ref={fichier}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("fichier", f);
            lancer(() => actionImporterCsvLoyverse(fd));
            e.target.value = "";
          }}
        />
        <Bouton variante="secondaire" disabled={enCours} onClick={() => fichier.current?.click()}>
          Importer un export CSV
        </Bouton>
      </div>
      <p className="text-xs text-stone-500">
        Export CSV : Back Office Loyverse › Articles › Liste des articles › Exporter. Sans jeton API, c&apos;est le moyen de mettre à jour articles et
        prix.
      </p>
      {erreur && <Message ton="erreur">{erreur}</Message>}
      {rapport && <Rapport rapport={rapport} />}
    </div>
  );
}

export interface ArticleAAssocier {
  id: string;
  nom: string;
  categorie: string | null;
  sku: string | null;
  prix: { magasin: string; prix: number | null }[];
  canalId: string;
}

function LigneArticle({
  a,
  produits,
  canaux,
}: {
  a: ArticleAAssocier;
  produits: { id: string; nom: string; categorie: string }[];
  canaux: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [produitId, setProduitId] = useState("");
  const [canalId, setCanalId] = useState(a.canalId);
  const [facteur, setFacteur] = useState(1);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const cats = [...new Set(produits.map((p) => p.categorie))];
  const agir = (f: () => Promise<Resultat>) =>
    demarrer(async () => {
      const r = await f();
      if (r.ok) router.refresh();
      else setErreur(r.erreur);
    });
  return (
    <li className="grid gap-2 py-3 lg:grid-cols-[1fr_13rem_8rem_5rem_auto_auto] lg:items-center">
      <div className="min-w-0">
        <div className="font-semibold">{a.nom}</div>
        <div className="text-xs text-stone-500">
          {a.categorie ?? "sans catégorie"} · SKU {a.sku ?? "—"} · {a.prix.map((p) => `${p.magasin} ${formatMad(p.prix)}`).join(" · ") || "prix ?"}
        </div>
      </div>
      <select aria-label={`Produit pour ${a.nom}`} value={produitId} onChange={(e) => setProduitId(e.target.value)} className={classesChamp}>
        <option value="">Produit…</option>
        {cats.map((c) => (
          <optgroup key={c} label={c}>
            {produits
              .filter((p) => p.categorie === c)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <select aria-label={`Canal pour ${a.nom}`} value={canalId} onChange={(e) => setCanalId(e.target.value)} className={classesChamp}>
        {canaux.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-stone-600" title="Unités de stock par article vendu (gâteau entier = 8 parts, boîte de 4 = 4)">
        ×
        <input
          aria-label={`Facteur pour ${a.nom}`}
          inputMode="numeric"
          value={facteur}
          onChange={(e) => setFacteur(Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1)))}
          className={`${classesChamp} w-14 text-center`}
        />
      </label>
      <Bouton disabled={!produitId || enCours} onClick={() => agir(() => actionAssocierArticle(a.id, produitId, canalId, facteur))}>
        Rattacher
      </Bouton>
      <Bouton variante="discret" disabled={enCours} title="Article hors inventaire : ne plus le proposer" onClick={() => agir(() => actionIgnorerArticle(a.id))}>
        Ignorer
      </Bouton>
      {erreur && (
        <div className="lg:col-span-6">
          <Message ton="erreur">{erreur}</Message>
        </div>
      )}
    </li>
  );
}

export function ArticlesNonAssocies({
  articles,
  produits,
  canaux,
}: {
  articles: ArticleAAssocier[];
  produits: { id: string; nom: string; categorie: string }[];
  canaux: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [filtre, setFiltre] = useState("");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [enCours, demarrer] = useTransition();
  if (!articles.length) return <p className="text-sm text-stone-500">Aucun article en attente.</p>;
  const f = filtre.trim().toLowerCase();
  const visibles = articles.filter((a) => !f || a.nom.toLowerCase().includes(f) || (a.categorie ?? "").toLowerCase().includes(f));
  const groupes = new Map<string | null, ArticleAAssocier[]>();
  for (const a of visibles) groupes.set(a.categorie, [...(groupes.get(a.categorie) ?? []), a]);
  const ordonnes = [...groupes.entries()].sort((x, y) => (x[0] ?? "").localeCompare(y[0] ?? "", "fr"));
  const cle = (cat: string | null) => cat ?? "\u0000";
  return (
    <div>
      <input
        type="search"
        placeholder="Filtrer par nom ou catégorie (ex. CAKES, Glovo)"
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
        className={`${classesChamp} mb-2`}
      />
      {ordonnes.map(([cat, liste]) => {
        // Les lignes ne sont construites qu'à l'ouverture d'une catégorie : la page reste légère.
        const ouvert = ouverts.has(cle(cat)) || (f.length >= 2 && visibles.length <= 40);
        return (
          <div key={cle(cat)} className="border-t border-stone-100 py-1">
            <div className="flex items-center gap-2 py-2">
              <button
                type="button"
                aria-expanded={ouvert}
                onClick={() =>
                  setOuverts((o) => {
                    const n = new Set(o);
                    if (n.has(cle(cat))) n.delete(cle(cat));
                    else n.add(cle(cat));
                    return n;
                  })
                }
                className="flex items-center gap-2 text-left"
              >
                <span className="w-4 text-stone-400">{ouvert ? "▾" : "▸"}</span>
                <span className="font-semibold">{cat ?? "(sans catégorie)"}</span>
                <span className="text-sm text-stone-500">{liste.length}</span>
              </button>
              <button
                type="button"
                disabled={enCours}
                onClick={() => {
                  if (!window.confirm(`Ignorer les ${liste.length} article(s) non rattachés de « ${cat ?? "sans catégorie"} » (hors inventaire) ?`)) return;
                  demarrer(async () => {
                    const r = await actionIgnorerCategorie(cat);
                    if (!r.ok) window.alert(r.erreur);
                    router.refresh();
                  });
                }}
                className="ml-auto rounded-lg px-2 py-1 text-sm font-semibold text-marque-700 hover:bg-marque-50"
              >
                Ignorer la catégorie
              </button>
            </div>
            {ouvert && (
              <ul className="divide-y divide-stone-100">
                {liste.map((a) => (
                  <LigneArticle key={a.id} a={a} produits={produits} canaux={canaux} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
