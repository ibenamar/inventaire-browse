"use client";

/** Erreur inattendue : message lisible plutôt que la page d'erreur générique. */
export default function Erreur({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="contenu" tabIndex={-1} className="focus:outline-none mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-lg font-bold">Une erreur est survenue</h1>
      <p className="mb-6 text-muted-foreground">Vos saisies déjà enregistrées sont conservées. Réessayez ; si le problème continue, prévenez un manager.</p>
      <div className="flex justify-center gap-2">
        <button onClick={reset} className="rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground">
          Réessayer
        </button>
        <a href="/" className="rounded-xl px-4 py-2.5 font-semibold text-primary ring-1 ring-primary/30">
          Accueil
        </a>
      </div>
    </main>
  );
}
