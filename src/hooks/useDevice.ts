"use client";

import { useCallback } from "react";
import { useSessionStore } from "@/stores/session";
import { nowISO } from "@/lib/utils";
import type { Device } from "@/types";

/**
 * Cihaz kayıt ve iptal işlemleri.
 * PRD §4.4: Her tarayıcı/cihaz bir Device kaydıyla temsil edilir.
 */
export function useDevice() {
  const { device, user, business, setDevice } = useSessionStore();

  const getSupabase = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    return createClient();
  }, []);

  /**
   * Bu tarayıcıyı yeni cihaz olarak kaydeder (FR-002).
   * Cihaz kodunu sunucudaki `register_device` fonksiyonu üretir; tarayıcı
   * kod seçemez. Hata durumunda anlaşılır mesajla `Error` fırlatır.
   */
  const registerDevice = useCallback(
    async (deviceName: string): Promise<Device> => {
      if (!user || !business) {
        throw new Error("Cihaz kaydı için önce giriş yapmalısınız.");
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("Cihaz kaydı için internet bağlantısı gereklidir.");
      }

      const supabase = await getSupabase();
      const { data, error } = await supabase.rpc("register_device", {
        p_device_name: deviceName,
      });

      if (error || !data) {
        console.error("Cihaz kaydedilemedi:", error?.message);
        throw new Error("Cihaz kaydedilemedi. Lütfen tekrar deneyin.");
      }

      const registered = data as Device;
      localStorage.setItem("veltrio_device_code", registered.device_code);
      setDevice(registered);
      return registered;
    },
    [user, business, getSupabase, setDevice]
  );

  /**
   * Aktif cihazı iptal eder.
   * PRD §4.4, AC-045
   */
  const revokeDevice = useCallback(async (): Promise<void> => {
    if (!device) return;
    const supabase = await getSupabase();

    await supabase
      .from("devices")
      .update({ is_active: false, revoked_at: nowISO() })
      .eq("id", device.id);

    localStorage.removeItem("veltrio_device_code");
    setDevice(null);
  }, [device, getSupabase, setDevice]);

  /**
   * Son eşitleme zamanını sunucuya bildirir.
   */
  const updateLastSynced = useCallback(async (): Promise<void> => {
    if (!device) return;
    const supabase = await getSupabase();
    const now = nowISO();

    await supabase
      .from("devices")
      .update({ last_synced_at: now })
      .eq("id", device.id);

    useSessionStore.getState().setLastSyncedAt(now);
  }, [device, getSupabase]);

  return {
    device,
    deviceCode: device?.device_code ?? null,
    isRegistered: !!device,
    registerDevice,
    revokeDevice,
    updateLastSynced,
  };
}
