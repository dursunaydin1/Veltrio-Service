"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/stores/session";
import { isOwner } from "@/lib/auth/permissions";
import { readActorCache, readTeamDevices, refreshTeam } from "@/lib/auth/actors";
import { otherPeoplesDevices, syncStaffActivityNotifications } from "@/lib/notifications/staffActivity";
import { nowISO } from "@/lib/utils";

const SUPABASE_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Ekip (yeni çalışan, yeni cihaz) oturum başına bir kez tazelenir
const refreshed = new Set<string>();

/**
 * Patron cihazında, her eşitlemeden sonra çalışanın yeni işleri için bildirim üretir (K-121).
 * Çalışanın cihazında çalışmaz.
 */
export function useStaffActivity(): void {
  const businessId = useSessionStore((s) => s.business?.id);
  const deviceCode = useSessionStore((s) => s.device?.device_code);
  const user = useSessionStore((s) => s.user);
  const lastSyncedAt = useSessionStore((s) => s.lastSyncedAt);
  const pullingAll = useSessionStore((s) => s.pullingAll);
  const isOnline = useSessionStore((s) => s.isOnline);
  const owner = !!user && isOwner(user);
  const userId = user?.id;

  useEffect(() => {
    if (!businessId || !deviceCode || !userId || !owner || pullingAll) return;
    void (async () => {
      if (SUPABASE_CONFIGURED && isOnline && !refreshed.has(businessId)) {
        refreshed.add(businessId);
        const { createClient } = await import("@/lib/supabase/client");
        await refreshTeam(createClient(), businessId).catch(() => refreshed.delete(businessId));
      }
      const staff = otherPeoplesDevices(readActorCache(businessId), readTeamDevices(businessId), userId);
      await syncStaffActivityNotifications({ businessId, deviceCode }, staff, nowISO());
    })().catch(() => undefined); // Bildirim üretilemese de uygulama çalışır
  }, [businessId, deviceCode, userId, owner, lastSyncedAt, pullingAll, isOnline]);
}
