import { statusLabel, statusTone } from "@/lib/services/status";

const TONE_CLASS = {
  gray: "badge-gray",
  yellow: "badge-yellow",
  green: "badge-green",
  red: "badge-red",
  accent: "badge-accent",
} as const;

/** Servis durumu rozeti (renk + Türkçe etiket). */
export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${TONE_CLASS[statusTone(status)]}`}>{statusLabel(status)}</span>;
}
