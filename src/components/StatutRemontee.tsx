import { LIBELLES_REMONTEE, type StatutRemontee } from "@/domain/remontees";
import { Pastille } from "./ui";

const TONS = {
  a_venir: "neutre",
  en_cours: "bleu",
  a_l_heure: "vert",
  en_retard: "orange",
  manquant: "rouge",
} as const;

export function PastilleRemontee({ statut }: { statut: StatutRemontee }) {
  return <Pastille ton={TONS[statut]}>{LIBELLES_REMONTEE[statut]}</Pastille>;
}
