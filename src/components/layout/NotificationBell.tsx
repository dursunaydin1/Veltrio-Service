"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell } from "lucide-react";
import { unreadCount } from "@/lib/notifications/center";
import { useSessionStore } from "@/stores/session";

/** Üst çubuktaki bildirim simgesi: okunmamış sayısı, eşitleme ve bildirim merkezine gider. */
export function NotificationBell() {
  const businessId = useSessionStore((s) => s.business?.id);
  const count = useLiveQuery(() => (businessId ? unreadCount(businessId) : 0), [businessId], 0);
  return (
    <Link href="/notifications" className="icon-btn" aria-label={count > 0 ? `Bildirimler (${count} yeni)` : "Bildirimler"}>
      <Bell size={22} aria-hidden="true" />
      {count > 0 ? (
        <span className="icon-badge" aria-hidden="true">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
