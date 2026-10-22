import type { Metadata } from "next";
import { MachineList } from "@/components/machines/MachineList";

export const metadata: Metadata = { title: "Makineler" };

export default function MachinesPage() {
  return <MachineList />;
}
