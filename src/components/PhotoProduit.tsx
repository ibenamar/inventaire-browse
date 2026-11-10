import { cx } from "./ui";

const COULEURS = ["#f1cda9", "#d9e7c5", "#c9dcef", "#f3c7cf", "#e6d4f0", "#f7e2a8", "#cfe8e3", "#ead1bd", "#d6d3d1", "#fde2c4"];

function couleur(cle: string) {
  let h = 0;
  for (const c of cle) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COULEURS[h % COULEURS.length];
}

/** Photo du produit, ou vignette de catégorie en attendant la photo. */
export function PhotoProduit({
  photoId,
  nom,
  categorie,
  className,
}: {
  photoId: string | null;
  nom: string;
  categorie: string;
  className?: string;
}) {
  if (photoId) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/photos/${photoId}`} alt={nom} loading="lazy" className={cx("aspect-square w-full object-cover", className)} />;
  }
  const initiales = nom
    .split(/\s+/)
    .filter((m) => /^[A-Za-zÀ-ÿ]/.test(m))
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join("");
  return (
    <div
      className={cx("flex aspect-square w-full items-center justify-center", className)}
      style={{ background: couleur(categorie) }}
      aria-label={`${nom} (pas encore de photo)`}
      role="img"
    >
      <span className="text-3xl font-bold text-stone-700/70">{initiales}</span>
    </div>
  );
}
