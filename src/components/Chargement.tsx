/** Affiché immédiatement pendant le chargement d'un écran (retour visuel au toucher). */
export function Chargement({ texte = "Chargement…" }: { texte?: string }) {
  return (
    <div className="mx-auto grid max-w-2xl gap-3 px-4 py-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-stone-600">
        <span className="size-5 animate-spin rounded-full border-2 border-marque-200 border-t-marque-700" />
        {texte}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-stone-200/70" />
      ))}
    </div>
  );
}
