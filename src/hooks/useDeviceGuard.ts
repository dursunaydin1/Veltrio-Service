"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { confirmWipe, getOwnDevice, isRevoked } from "@/lib/device/devices";
import { wipeLocalData } from "@/lib/device/wipe";
import { useSessionStore } from "@/stores/session";

/**
 * İptal edilen cihaz bağlandığında yerel veriyi siler (Adım 1.5, AC-45): cihaz
 * kaydı açılışta, internet geldiğinde, uygulamaya dönüldüğünde, eşitleme 403
 * verdiğinde ve belirli aralıklarla denetlenir. İptal edilmişse yerel veritabanı
 * ve oturum silinir, sunucuya silme onayı yazılır ve giriş ekranına dönülür.
 */
export function useDeviceGuard(): void {
  const code = useSessionStore((s) => s.device?.device_code);

  useEffect(() => {
    if (!code) return;
    let running = false;

    const check = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        const supabase = createClient();
        const row = await getOwnDevice(supabase, code);
        if (row && isRevoked(row)) {
          await wipeLocalData();
          await confirmWipe(supabase, row.id).catch(() => undefined);
          await supabase.auth.signOut();
          window.location.replace("/login?error=revoked"); // tam yenileme: silinen veritabanı temiz açılsın
        }
      } catch {
        // Ağ hatasında sonraki denetimde tekrar denenir.
      } finally {
        running = false;
      }
    };

    void check();
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    window.addEventListener("veltrio:device-check", check);
    const timer = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("veltrio:device-check", check);
      window.clearInterval(timer);
    };
  }, [code]);
}
