import type { Metadata } from "next";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export const metadata: Metadata = { title: "Eşitleme ve bildirimler" };

export default function NotificationsPage() {
  return <NotificationCenter />;
}
