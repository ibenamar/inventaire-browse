import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function EnteteEtape({ id, titre, aide }: { id: string; titre: string; aide?: string }) {
  return (
    <div className="mb-3">
      <Link href={`/shift/${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft aria-hidden className="size-4" /> Retour au shift
      </Link>
      <h1 className="mt-1 text-2xl font-bold">{titre}</h1>
      {aide && <p className="text-muted-foreground">{aide}</p>}
    </div>
  );
}
