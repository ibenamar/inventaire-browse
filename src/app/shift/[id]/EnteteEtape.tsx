import Link from "next/link";

export function EnteteEtape({ id, titre, aide }: { id: string; titre: string; aide?: string }) {
  return (
    <div className="mb-3">
      <Link href={`/shift/${id}`} className="text-sm font-semibold text-marque-700">
        ← Retour au shift
      </Link>
      <h1 className="mt-1 text-2xl font-bold">{titre}</h1>
      {aide && <p className="text-stone-600">{aide}</p>}
    </div>
  );
}
