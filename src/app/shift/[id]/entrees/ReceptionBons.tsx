"use client";

import { useState, useTransition } from "react";
import { actionReceptionnerBon } from "@/app/actions-shift";
import { Bouton, classesChamp, cx, Message } from "@/components/ui";
import type { Unite } from "@/db/schema";
import { formatQuantite, libelleQuantite, lireQuantite, UNITE_PLURIEL } from "@/domain/unites";

export interface BonAReceptionner {
  id: string;
  numero: number;
  origine: string;
  expedie: string;
  expediePar: string | null;
  commentaire: string | null;
  lignes: { produitId: string; nom: string; unite: Unite; partsParGateau: number | null; quantiteExpediee: number }[];
}

/**
 * Livraisons attendues : n'importe quel membre de l'équipe vérifie ce qui arrive. Les quantités
 * sont pré-remplies avec l'expédié ; on ne corrige que ce qui manque ou est abîmé.
 */
export function ReceptionBons({ shiftId, bons }: { shiftId: string; bons: BonAReceptionner[] }) {
  const [ouvert, setOuvert] = useState<string | null>(bons.length === 1 ? bons[0].id : null);
  const [recus, setRecus] = useState<Record<string, Record<string, string>>>({});
  const [commentaire, setCommentaire] = useState("");
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  if (!bons.length && !retour) return null;

  const valider = (b: BonAReceptionner) =>
    demarrer(async () => {
      setRetour(null);
      const saisis = recus[b.id] ?? {};
      const valeurs: Record<string, number> = {};
      for (const l of b.lignes) {
        const t = saisis[l.produitId];
        if (t === undefined) continue;
        const n = lireQuantite(t);
        if (n === null) return setRetour({ ok: false, texte: `${l.nom} : quantité reçue illisible` });
        valeurs[l.produitId] = n;
      }
      const r = await actionReceptionnerBon(shiftId, b.id, valeurs, commentaire || null);
      if (r.ok) {
        setRetour({ ok: true, texte: r.message ?? "Livraison réceptionnée" });
        setOuvert(null);
        setCommentaire("");
      } else setRetour({ ok: false, texte: r.erreur });
    });

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Livraisons à réceptionner</h2>
      {retour && (
        <div className="mb-3">
          <Message ton={retour.ok ? "succes" : "erreur"}>{retour.texte}</Message>
        </div>
      )}
      <div className="grid gap-3">
        {bons.map((b) => {
          const saisis = recus[b.id] ?? {};
          const ecarts = b.lignes.filter((l) => saisis[l.produitId] !== undefined && lireQuantite(saisis[l.produitId]) !== l.quantiteExpediee).length;
          return (
            <div key={b.id} className="rounded-2xl bg-white ring-2 ring-amber-300">
              <button onClick={() => setOuvert(ouvert === b.id ? null : b.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    Bon n° {b.numero} · {b.origine}
                  </span>
                  <span className="block text-sm text-stone-600">
                    Expédié {b.expedie}
                    {b.expediePar ? ` par ${b.expediePar}` : ""} · {b.lignes.length} produit(s)
                    {b.commentaire ? ` · ${b.commentaire}` : ""}
                  </span>
                </span>
                <span className="text-2xl text-stone-400">{ouvert === b.id ? "˄" : "˅"}</span>
              </button>
              {ouvert === b.id && (
                <div className="border-t border-stone-100 p-4">
                  <p className="mb-3 text-sm text-stone-600">
                    Vérifiez chaque produit. Les quantités sont celles expédiées : corrigez seulement ce qui manque ou ce qui est arrivé abîmé.
                  </p>
                  <ul className="divide-y divide-stone-100">
                    {b.lignes.map((l) => {
                      const t = saisis[l.produitId];
                      const n = t === undefined ? l.quantiteExpediee : lireQuantite(t);
                      const diff = n !== null && n !== l.quantiteExpediee;
                      return (
                        <li key={l.produitId} className="flex flex-wrap items-center gap-2 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{l.nom}</span>
                            <span className="block text-xs text-stone-500">Expédié : {libelleQuantite(l.quantiteExpediee, l)}</span>
                          </span>
                          <label className="flex items-center gap-2 text-sm">
                            Reçu
                            <input
                              inputMode="decimal"
                              aria-label={`Quantité reçue ${l.nom}`}
                              value={t ?? formatQuantite(l.quantiteExpediee)}
                              onChange={(e) =>
                                setRecus((x) => ({ ...x, [b.id]: { ...(x[b.id] ?? {}), [l.produitId]: e.target.value.replace(/[^\d.,]/g, "") } }))
                              }
                              onFocus={(e) => e.target.select()}
                              className={cx("h-11 w-20 rounded-xl text-center text-lg font-bold ring-1", diff ? "bg-amber-50 ring-amber-400" : "ring-stone-300")}
                            />
                            <span className="w-12 text-stone-500">{UNITE_PLURIEL[l.unite]}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <input
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    placeholder={ecarts ? "Expliquer l'écart (produit manquant, abîmé…)" : "Commentaire (facultatif)"}
                    className={cx(classesChamp, "my-3")}
                  />
                  <Bouton grand disabled={enCours} onClick={() => valider(b)} className="w-full">
                    {enCours ? "Enregistrement…" : ecarts ? `Réceptionner avec ${ecarts} écart(s)` : "Tout est conforme : réceptionner"}
                  </Bouton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
