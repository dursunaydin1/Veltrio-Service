"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/stores/session";
import { fetchActorNames, readActorCache, writeActorCache, type ActorNames } from "@/lib/auth/actors";

const SUPABASE_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Aynı oturumda her ekran açılışında yeniden sorulmasın
const refreshed = new Set<string>();

/** Cihaz kodu → kişi adı (K-119). Önce bu cihazdaki kayıt, çevrimiçiyken sunucudan tazelenir. */
export function useActorNames(): ActorNames {
  const businessId = useSessionStore((s) => s.business?.id);
  const isOnline = useSessionStore((s) => s.isOnline);
  const [names, setNames] = useState<ActorNames>({});

  useEffect(() => {
    if (!businessId) return;
    // Kayıtlı adlar yalnızca tarayıcıda okunabilir: ilk çizimden sonra
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNames(readActorCache(businessId));
    if (!SUPABASE_CONFIGURED || !isOnline || refreshed.has(businessId)) return;
    refreshed.add(businessId);
    void import("@/lib/supabase/client")
      .then(({ createClient }) => fetchActorNames(createClient()))
      .then((fresh) => {
        writeActorCache(businessId, fresh);
        setNames(fresh);
      })
      .catch(() => refreshed.delete(businessId));
  }, [businessId, isOnline]);

  return names;
}
