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
  const { setUser, setBusiness, setDevice, clearSession, setSessionLoaded, setAuthInfo } =
    useSessionStore();

  const loadSession = useCallback(async () => {
    if (!SUPABASE_CONFIGURED) {
      setSessionLoaded(true); // env yok → atla
      return;
    }

    // Dinamik import — env yokken modül import hatasını önler
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      clearSession();
      setSessionLoaded(true);
      return;
    }

    // Kullanıcı kaydını çek
    const { data: dbUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    const emailConfirmed = !!authUser.email_confirmed_at;
    if (!dbUser) {
      // Hesap var ama işletme yok → ilk kurulum sihirbazı (FR-002)
      clearSession();
      setAuthInfo({ needsSetup: true, email: authUser.email ?? null, emailConfirmed });
      setSessionLoaded(true);
      return;
    }

    setAuthInfo({ needsSetup: false, email: authUser.email ?? null, emailConfirmed });
    setUser(dbUser as User);

    // İşletme bilgisini çek
    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", (dbUser as User).business_id)
      .single();

    if (business) setBusiness(business as Business);

    // Aktif cihazı çek
    // Kayıtlı cihaz kodu yoksa veya sunucuda iptal edilmişse cihaz tanımsız
    // sayılır; kullanıcı "Bu cihazı kaydet" ekranına yönlendirilir.
    const storedCode = localStorage.getItem("veltrio_device_code");
    let activeDevice: Device | null = null;
    if (storedCode) {
      const { data: device } = await supabase
        .from("devices")
        .select("*")
        .eq("device_code", storedCode)
        .maybeSingle();

      // İptal edilmiş cihaz etkin sayılmaz; yerel veriyi silme işini cihaz bekçisi yapar (AC-045)
      const row = (device as Device | null) ?? null;
      activeDevice = row && row.is_active && !row.revoked_at ? row : null;
    }
    setDevice(activeDevice);
    setSessionLoaded(true);
  }, [setUser, setBusiness, setDevice, clearSession, setSessionLoaded, setAuthInfo]);

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
