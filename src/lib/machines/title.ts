import type { Machine } from "@/types";

/** Makinenin ekranda / çıktıda görünen adı: "Marka Model", yoksa tür. */
export function machineTitleOf(machine: Pick<Machine, "type" | "brand" | "model">): string {
  const name = [machine.brand, machine.model].filter(Boolean).join(" ");
  return name || machine.type;
}
