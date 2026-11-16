/**
 * Horloge des tests : les scénarios planifient des shifts à des dates fixes (novembre 2026), et le
 * planning refuse un créneau déjà terminé. Un fichier de test qui l'importe en premier démarre le
 * 09/11/2026 (seul Date est simulé, les minuteurs restent réels) : il ne dépend plus du jour où on
 * le lance. À n'importer que là où le journal d'audit n'est pas trié finement par horodatage.
 */
import { vi } from "vitest";

vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
vi.setSystemTime(new Date("2026-11-09T06:00:00Z"));
