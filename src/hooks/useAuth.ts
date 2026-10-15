"use client";

import { useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/stores/session";
import type { User, Business, Device } from "@/types";

/**
 * Supabase Auth oturumunu dinler ve SessionStore'u günceller.
 * PRD §4.3, §4.4: Kullanıcı ve cihaz bilgileri oturum başında yüklenir.
 *
 * Root layout'ta bir kez kullanılmalıdır.
 */
export function useAuthSync() {
  const { setUser, setBusiness, setDevice, clearSession } = useSessionStore();
  const supabase = createClient();

  const loadSession = useCallback(async () => {
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
      .eq("id", dbUser.business_id)
      .single();

    if (business) setBusiness(business as Business);

    // Aktif cihazı çek (localStorage'da device_code varsa eşleştir)
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
  }, [supabase, setUser, setBusiness, setDevice, clearSession]);

  useEffect(() => {
    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearSession();
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadSession();
      }
    });

    return () => subscription.unsubscribe();
  }, [loadSession, supabase.auth, clearSession]);
}

/**
 * Çevrimiçi/çevrimdışı durumunu dinler.
 * Root layout'ta bir kez kullanılmalıdır.
 */
export function useOnlineStatus() {
  const setIsOnline = useSessionStore((s) => s.setIsOnline);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    // İlk durum
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setIsOnline]);
}
