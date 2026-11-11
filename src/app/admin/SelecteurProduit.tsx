"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SelecteurProduit({ produits, valeur }: { produits: { id: string; nom: string; categorie: string }[]; valeur: string }) {
  const router = useRouter();
  const chemin = usePathname();
  const sp = useSearchParams();
  const cats = [...new Set(produits.map((p) => p.categorie))];
  return (
    <select
      aria-label="Produit"
      value={valeur}
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        p.set("produit", e.target.value);
        router.push(`${chemin}?${p}`, { scroll: false });
      }}
      className="max-w-full rounded-xl bg-card px-3 py-2 ring-1 ring-input"
    >
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
  );
}
