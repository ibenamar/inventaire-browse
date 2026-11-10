"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { PhotoProduit } from "@/components/PhotoProduit";
import { Bouton, Champ, classesChamp, formatMad, Message, soumettre } from "@/components/ui";
import { UNITE_PLURIEL, UNITE_SINGULIER, UNITES_INGREDIENT } from "@/domain/unites";
import type { Unite } from "@/db/schema";
import type { ProduitVue } from "@/server/services/catalogue";
import { actionAjouterArticle, actionAjouterCout, actionModifierProduit, actionPhoto, actionRetirerArticle, actionStocksMinimum } from "../../actions";

export function FormulaireProduit({ produit: p }: { produit: ProduitVue }) {
  const [etat, action, enCours] = useActionState(actionModifierProduit.bind(null, p.id), null);
  const [unite, setUnite] = useState(p.unite);
  return (
    <form onSubmit={soumettre(action)} className="grid gap-3 sm:grid-cols-2">
      <Champ label="Nom">
        <input name="nom" defaultValue={p.nom} required className={classesChamp} />
      </Champ>
      {p.nature === "ingredient" ? (
        <Champ label="Nature">
          <p className="py-2 text-sm text-stone-600">Ingrédient du laboratoire : compté au labo, valorisé au coût de revient.</p>
        </Champ>
      ) : (
        <Champ label="Prix de référence (MAD)" aide="Prix sur place ; suit l'article Loyverse « sur place ». Sert à valoriser pertes et écarts.">
          <input name="prixVente" inputMode="decimal" defaultValue={p.prixVente ?? ""} className={classesChamp} />
        </Champ>
      )}
      <Champ label="Unité de comptage">
        <select name="unite" value={unite} onChange={(e) => setUnite(e.target.value as typeof unite)} className={classesChamp}>
          {(p.nature === "ingredient" ? UNITES_INGREDIENT : (["piece", "part", "bouteille"] as const)).map((u) => (
            <option key={u} value={u}>
              {u === "part" ? "Part (gâteau découpé)" : UNITE_SINGULIER[u][0].toUpperCase() + UNITE_SINGULIER[u].slice(1)}
            </option>
          ))}
        </select>
      </Champ>
      {unite === "part" ? (
        <Champ label="Parts par gâteau">
          <input name="partsParGateau" inputMode="numeric" defaultValue={p.partsParGateau ?? 8} className={classesChamp} />
        </Champ>
      ) : (
        <Champ label="Format">
          <input name="format" defaultValue={p.format ?? ""} placeholder="ex. 330 ml" className={classesChamp} />
        </Champ>
      )}
      <Champ label="Durée de conservation (jours)" aide="Facultatif. Le stock plus ancien que cette durée est signalé aux managers (date limite probablement dépassée).">
        <input name="dureeConservationJours" inputMode="numeric" defaultValue={p.dureeConservationJours ?? ""} placeholder="—" className={classesChamp} />
      </Champ>
      <div className="grid content-end gap-2">
        {p.nature === "ingredient" ? (
          <>
            <input type="hidden" name="suiviStock" value="on" />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="ingredientPointsDeVente" defaultChecked={p.ingredientPointsDeVente} className="size-5" />
              Aussi compté dans les points de vente (préparations à la commande : crêpes, pancakes…)
            </label>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="suiviStock" defaultChecked={p.suiviStock} className="size-5" />
              Suivi en stock (décocher pour un produit préparé à la commande)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="fabriqueLabo" defaultChecked={p.fabriqueLabo} className="size-5" />
              Fabriqué par le laboratoire (compté au labo, livré aux points de vente)
            </label>
          </>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="actif" defaultChecked={p.actif} className="size-5" />
          Produit actif
        </label>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        {etat && <Message ton={etat.ok ? "succes" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</Message>}
        <Bouton type="submit" disabled={enCours} className="justify-self-start">
          Enregistrer
        </Bouton>
      </div>
    </form>
  );
}

export function FormulaireCout({ produitId, aujourdhui, unite }: { produitId: string; aujourdhui: string; unite: Unite }) {
  const [etat, action, enCours] = useActionState(actionAjouterCout.bind(null, produitId), null);
  // Coût enregistré : le champ se vide (un second clic ne crée pas de doublon dans l'historique).
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (etat?.ok) ref.current?.reset();
  }, [etat]);
  return (
    <form ref={ref} onSubmit={soumettre(action)} className="flex flex-wrap items-end gap-2">
      <Champ label={`Nouveau coût par ${UNITE_SINGULIER[unite]} (MAD)`}>
        <input name="cout" inputMode="decimal" required className={`${classesChamp} w-32`} />
      </Champ>
      <Champ label="À partir du">
        <input name="dateEffet" type="date" defaultValue={aujourdhui} className={classesChamp} />
      </Champ>
      <Bouton type="submit" variante="secondaire" disabled={enCours}>
        Ajouter
      </Bouton>
      {etat && (
        <div className="w-full">
          <Message ton={etat.ok ? "succes" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</Message>
        </div>
      )}
    </form>
  );
}

/** Réduit la photo à 600 px de côté (recadrage carré) avant l'envoi, pour économiser stockage et données mobiles. */
async function compresser(fichier: File): Promise<Blob> {
  const bitmap = await createImageBitmap(fichier);
  const cote = Math.min(bitmap.width, bitmap.height);
  const taille = Math.min(600, cote);
  const canvas = document.createElement("canvas");
  canvas.width = taille;
  canvas.height = taille;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - cote) / 2, (bitmap.height - cote) / 2, cote, cote, 0, 0, taille, taille);
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Compression impossible"))), "image/jpeg", 0.82));
}

export function PrisePhoto({ produitId, photoId, nom, categorie }: { produitId: string; photoId: string | null; nom: string; categorie: string }) {
  const router = useRouter();
  const entree = useRef<HTMLInputElement>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <div className="grid gap-3">
      <div className="overflow-hidden rounded-xl">
        <PhotoProduit photoId={photoId} nom={nom} categorie={categorie} />
      </div>
      <input
        ref={entree}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          demarrer(async () => {
            try {
              const fd = new FormData();
              fd.set("photo", await compresser(f), "photo.jpg");
              const r = await actionPhoto(produitId, fd);
              setRetour(r.ok ? { ok: true, texte: "Photo enregistrée" } : { ok: false, texte: r.erreur });
              if (r.ok) router.refresh();
            } catch {
              setRetour({ ok: false, texte: "Impossible de lire cette image" });
            } finally {
              if (entree.current) entree.current.value = "";
            }
          });
        }}
      />
      <Bouton onClick={() => entree.current?.click()} disabled={enCours}>
        {enCours ? "Envoi…" : photoId ? "Remplacer la photo" : "Prendre une photo"}
      </Bouton>
      <p className="text-xs text-stone-500">Sur téléphone, l&apos;appareil photo s&apos;ouvre directement. Cadrez le produit au centre.</p>
      {retour && <Message ton={retour.ok ? "succes" : "erreur"}>{retour.texte}</Message>}
    </div>
  );
}

export function ArticlesCaisse({
  produitId,
  nomProduit,
  articles,
  canaux,
}: {
  produitId: string;
  nomProduit: string;
  articles: { id: string; canal: string; nom: string; sku: string | null; prix: string; facteur: number }[];
  canaux: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [etat, action, enCours] = useActionState(actionAjouterArticle.bind(null, produitId), null);
  const [retrait, demarrer] = useTransition();
  return (
    <div className="grid gap-3">
      {articles.length ? (
        <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
          {articles.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="w-24 font-semibold">{a.canal}</span>
              <span className="min-w-0 flex-1">
                {a.nom}
                {a.facteur > 1 && <span className="ml-1 rounded bg-marque-100 px-1.5 text-xs font-bold text-marque-900">× {a.facteur}</span>}
                <span className="text-stone-500"> · SKU {a.sku ?? "—"}</span>
              </span>
              <span className="font-semibold">{a.prix}</span>
              <button
                disabled={retrait}
                onClick={() =>
                  demarrer(async () => {
                    if (!window.confirm(`Retirer l'article « ${a.nom} » de ce produit ?`)) return;
                    const r = await actionRetirerArticle(a.id);
                    if (r.ok) router.refresh();
                    else window.alert(r.erreur);
                  })
                }
                className="rounded-lg px-2 py-1 font-semibold text-red-700 hover:bg-red-50"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-500">Aucun article rattaché : lancez l&apos;import Loyverse ou ajoutez-le ci-dessous.</p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-marque-700">Ajouter un article à la main (ex. SKU Glovo)</summary>
        <form onSubmit={soumettre(action)} className="mt-2 grid gap-2 sm:grid-cols-[9rem_1fr_7rem_6rem_5rem_auto] sm:items-end">
          <Champ label="Canal">
            <select name="canalId" className={classesChamp}>
              {canaux.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Nom en caisse">
            <input name="nomCaisse" defaultValue={nomProduit} required className={classesChamp} />
          </Champ>
          <Champ label="SKU">
            <input name="sku" className={classesChamp} />
          </Champ>
          <Champ label="Prix (MAD)">
            <input name="prixVente" inputMode="decimal" className={classesChamp} />
          </Champ>
          <Champ label="Facteur">
            <input name="facteur" inputMode="numeric" defaultValue={1} className={classesChamp} />
          </Champ>
          <Bouton type="submit" variante="secondaire" disabled={enCours}>
            Ajouter
          </Bouton>
          {etat && (
            <div className="sm:col-span-6">
              <Message ton={etat.ok ? "succes" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</Message>
            </div>
          )}
        </form>
      </details>
    </div>
  );
}

export function FormulaireStocksMinimum({
  produitId,
  unite,
  minimums,
}: {
  produitId: string;
  unite: string;
  minimums: { siteId: string; site: string; statut: string; stockMinimum: number | null }[];
}) {
  const [etat, action, enCours] = useActionState(actionStocksMinimum.bind(null, produitId), null);
  const libelle = UNITE_PLURIEL[unite as Unite] ?? unite;
  const decimales = unite === "kg" || unite === "litre";
  return (
    <form onSubmit={soumettre(action)} className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {minimums.map((m) => (
          <label key={m.siteId} className="flex items-center gap-2">
            <span className="w-44 shrink-0 text-sm font-semibold">
              {m.site}
              {m.statut !== "actif" && <span className="block text-xs font-normal text-stone-500">en ouverture</span>}
            </span>
            <input
              name={`min_${m.siteId}`}
              inputMode={decimales ? "decimal" : "numeric"}
              defaultValue={m.stockMinimum ?? ""}
              placeholder="—"
              className={`${classesChamp} w-24 text-center`}
            />
            <span className="text-xs text-stone-500">{libelle}</span>
          </label>
        ))}
      </div>
      {etat && <Message ton={etat.ok ? "succes" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</Message>}
      <Bouton type="submit" variante="secondaire" disabled={enCours} className="justify-self-start">
        Enregistrer
      </Bouton>
    </form>
  );
}
