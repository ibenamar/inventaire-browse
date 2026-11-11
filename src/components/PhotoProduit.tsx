import { cx } from "./ui";

// Tuiles de couleur par défaut (tokens --tuile-0 à --tuile-9, adaptés au mode sombre).
const COULEURS = Array.from({ length: 10 }, (_, i) => `var(--tuile-${i})`);

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
      <span className="text-3xl font-bold text-foreground">{initiales}</span>
    </div>
  );
}
