"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { PhotoProduit } from "@/components/PhotoProduit";
import { Bouton, Champ, classesChamp, Message } from "@/components/ui";
import type { ProduitVue } from "@/server/services/catalogue";
import { actionAjouterCout, actionModifierProduit, actionPhoto } from "../../actions";

export function FormulaireProduit({ produit: p }: { produit: ProduitVue }) {
  const [etat, action, enCours] = useActionState(actionModifierProduit.bind(null, p.id), null);
  const [unite, setUnite] = useState(p.unite);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Champ label="Nom">
        <input name="nom" defaultValue={p.nom} required className={classesChamp} />
      </Champ>
      <Champ label="Prix de vente (MAD)" aide="Repris de Loyverse lors de l'import">
        <input name="prixVente" inputMode="decimal" defaultValue={p.prixVente ?? ""} className={classesChamp} />
      </Champ>
      <Champ label="Unité de comptage">
        <select name="unite" value={unite} onChange={(e) => setUnite(e.target.value as typeof unite)} className={classesChamp}>
          <option value="piece">Pièce</option>
          <option value="part">Part (gâteau découpé)</option>
          <option value="bouteille">Bouteille</option>
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
      <Champ label="SKU Loyverse">
        <input name="sku" defaultValue={p.sku ?? ""} className={classesChamp} />
      </Champ>
      <div className="grid content-end gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="suiviStock" defaultChecked={p.suiviStock} className="size-5" />
          Suivi en stock (décocher pour un produit préparé à la commande)
        </label>
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

export function FormulaireCout({ produitId, aujourdhui }: { produitId: string; aujourdhui: string }) {
  const [etat, action, enCours] = useActionState(actionAjouterCout.bind(null, produitId), null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Champ label="Nouveau coût (MAD)">
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
