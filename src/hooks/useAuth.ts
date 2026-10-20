"use client";

import { useEffect, useCallback } from "react";
import { useSessionStore } from "@/stores/session";
import type { User, Business, Device } from "@/types";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase Auth oturumunu dinler ve SessionStore'u günceller.
 * PRD §4.3, §4.4: Kullanıcı ve cihaz bilgileri oturum başında yüklenir.
 *
 * Root layout'ta bir kez kullanılmalıdır.
 */
export function useAuthSync() {
  const { setUser, setBusiness, setDevice, clearSession } = useSessionStore();

  const loadSession = useCallback(async () => {
    if (!SUPABASE_CONFIGURED) return; // env yok → atla

    // Dinamik import — env yokken modül import hatasını önler
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      clearSession();
      return;
    }

    // Kullanıcı kaydını çek
    const { data: dbUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    if (!dbUser) {
      clearSession();
      return;
    }

    setUser(dbUser as User);

    // İşletme bilgisini çek
    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", (dbUser as User).business_id)
      .single();

    if (business) setBusiness(business as Business);

    // Aktif cihazı çek
    const storedCode = localStorage.getItem("veltrio_device_code");
    if (storedCode) {
      const { data: device } = await supabase
        .from("devices")
        .select("*")
        .eq("device_code", storedCode)
        .eq("is_active", true)
        .single();

      if (device) setDevice(device as Device);
    }
  }, [setUser, setBusiness, setDevice, clearSession]);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;

    loadSession();

    let cleanup: (() => void) | undefined;

    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          clearSession();
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          loadSession();
        }
      });
      cleanup = () => subscription.unsubscribe();
    });

    return () => cleanup?.();
  }, [loadSession, clearSession]);
}

/**
 * Çevrimiçi/çevrimdışı durumunu dinler.
 */
export function useOnlineStatus() {
  const setIsOnline = useSessionStore((s) => s.setIsOnline);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setIsOnline]);
}
