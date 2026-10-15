"use client";

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/stores/session";
import { generateDeviceCode, generateId, nowISO } from "@/lib/utils";
import type { Device } from "@/types";

/**
 * Cihaz kayıt ve iptal işlemleri.
 * PRD §4.4: Her tarayıcı/cihaz bir Device kaydıyla temsil edilir.
 */
export function useDevice() {
  const { device, user, business, setDevice } = useSessionStore();
  const supabase = createClient();

  /**
   * Yeni cihaz kaydeder ve localStorage'a yazar.
   * İlk girişte veya cihaz iptal sonrasında çağrılır.
   */
  const registerDevice = useCallback(
    async (deviceName: string): Promise<Device | null> => {
      if (!user || !business) return null;

      const deviceCode = generateDeviceCode(business.device_code_prefix);

      const newDevice: Device = {
        id: generateId(),
        business_id: business.id,
        user_id: user.id,
        device_code: deviceCode,
        device_name: deviceName,
        is_active: true,
        created_at: nowISO(),
      };

      const { data, error } = await supabase
        .from("devices")
        .insert(newDevice)
        .select()
        .single();

      if (error || !data) {
        console.error("Cihaz kaydedilemedi:", error?.message);
        return null;
      }

      // localStorage'a kaydet
      localStorage.setItem("veltrio_device_code", deviceCode);
      setDevice(data as Device);
      return data as Device;
    },
    [user, business, supabase, setDevice]
  );

  /**
   * Aktif cihazı iptal eder ve yerel veriyi temizler.
   * PRD §4.4, AC-045: Cihaz iptali + yerel veri silme.
   */
  const revokeDevice = useCallback(async (): Promise<void> => {
    if (!device) return;

    await supabase
      .from("devices")
      .update({ is_active: false, revoked_at: nowISO() })
      .eq("id", device.id);

    localStorage.removeItem("veltrio_device_code");
    setDevice(null);
  }, [device, supabase, setDevice]);

  /**
   * Son eşitleme zamanını sunucuya bildirir.
   */
  const updateLastSynced = useCallback(async (): Promise<void> => {
    if (!device) return;
    const now = nowISO();
    await supabase
      .from("devices")
      .update({ last_synced_at: now })
      .eq("id", device.id);
    useSessionStore.getState().setLastSyncedAt(now);
  }, [device, supabase]);

  return {
    device,
    deviceCode: device?.device_code ?? null,
    isRegistered: !!device,
    registerDevice,
    revokeDevice,
    updateLastSynced,
  };
}
