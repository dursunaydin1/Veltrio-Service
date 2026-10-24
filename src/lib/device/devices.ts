import type { SupabaseClient } from "@supabase/supabase-js";
import type { Device } from "@/types";
import { nowISO } from "@/lib/utils";

/**
 * Cihaz yönetimi (Adım 1.5, FR-023): liste, iptal ve silme onayı. İptal ve silme
 * onayı çevrimiçi gerektirir; iptal edilen cihaz yeniden etkinleştirilemez (AC-045).
 */

export const isRevoked = (device: Pick<Device, "is_active" | "revoked_at">): boolean =>
  !device.is_active || !!device.revoked_at;

export async function listDevices(supabase: SupabaseClient): Promise<(Device & { wipe_confirmed_at?: string })[]> {
  const { data, error } = await supabase.from("devices").select("*").order("created_at", { ascending: true });
  if (error) throw new Error("Cihazlar yüklenemedi.");
  return (data ?? []) as (Device & { wipe_confirmed_at?: string })[];
}

export async function revokeDeviceById(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("devices").update({ is_active: false, revoked_at: nowISO() }).eq("id", id);
  if (error) throw new Error("Cihaz iptal edilemedi.");
}

/** İptal edilen cihaz yerel verisini sildiğinde sunucuya bildirir. */
export async function confirmWipe(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("devices").update({ wipe_confirmed_at: nowISO() }).eq("id", id);
  if (error) throw new Error("Silme onayı kaydedilemedi.");
}

/** Bu cihazın kaydını getirir (iptal edilmiş olsa bile). */
export async function getOwnDevice(supabase: SupabaseClient, code: string): Promise<Device | null> {
  const { data } = await supabase.from("devices").select("*").eq("device_code", code).maybeSingle();
  return (data as Device | null) ?? null;
}
