"use client";

/** Erreur inattendue : message lisible plutôt que la page d'erreur générique. */
export default function Erreur({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-xl font-bold">Une erreur est survenue</h1>
      <p className="mb-6 text-stone-600">Vos saisies déjà enregistrées sont conservées. Réessayez ; si le problème continue, prévenez un manager.</p>
      <div className="flex justify-center gap-2">
        <button onClick={reset} className="rounded-xl bg-marque-700 px-4 py-2.5 font-semibold text-white">
          Réessayer
        </button>
        <a href="/" className="rounded-xl px-4 py-2.5 font-semibold text-marque-700 ring-1 ring-marque-300">
          Accueil
        </a>
      </div>
    </main>
  );
}
