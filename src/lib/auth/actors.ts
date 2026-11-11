import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Kim yaptı?" (K-119): kayıtlar cihaz koduyla imzalanır (created_by_device, changed_by_device).
 * Cihaz → kullanıcı eşlemesi sunucudan bir kez alınır ve bu cihazda saklanır; internetsizken
 * son bilinen adlar gösterilir.
 */
export type ActorNames = Record<string, string>;

const cacheKey = (businessId: string) => `veltrio_actors:${businessId}`;

export function readActorCache(businessId: string): ActorNames {
  try {
    const raw = window.localStorage.getItem(cacheKey(businessId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ActorNames) : {};
  } catch {
    return {};
  }
}

export function writeActorCache(businessId: string, names: ActorNames): void {
  try {
    window.localStorage.setItem(cacheKey(businessId), JSON.stringify(names));
  } catch {
    // Depolama kapalıysa adlar yalnızca bu oturumda kalır
  }
}

/** Cihaz kodu → kullanıcı kimliği: patron, çalışanın cihazlarını kendi cihazlarından ayırır (K-121) */
export type TeamDevices = Record<string, string>;

const devicesKey = (businessId: string) => `veltrio_team_devices:${businessId}`;

export function readTeamDevices(businessId: string): TeamDevices {
  try {
    const raw = window.localStorage.getItem(devicesKey(businessId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as TeamDevices) : {};
  } catch {
    return {};
  }
}

/** Adları ve cihaz sahiplerini sunucudan alır, bu cihazda saklar. */
export async function refreshTeam(supabase: SupabaseClient, businessId: string): Promise<ActorNames> {
  const [{ data: users, error: usersError }, { data: devices, error: devicesError }] = await Promise.all([
    supabase.from("users").select("id, name"),
    supabase.from("devices").select("device_code, user_id"),
  ]);
  if (usersError || devicesError) throw new Error("Kullanıcı adları yüklenemedi.");
  const names = mapActorNames(users ?? [], devices ?? []);
  writeActorCache(businessId, names);
  try {
    window.localStorage.setItem(devicesKey(businessId), JSON.stringify(Object.fromEntries((devices ?? []).map((d) => [d.device_code, d.user_id]))));
  } catch {
    // Depolama kapalıysa çalışan bildirimi üretilmez; "Yaptıkları" listesi sunucudan gelen cihazlarla çalışır
  }
  return names;
}

export function mapActorNames(
  users: readonly { id: string; name: string }[],
  devices: readonly { device_code: string; user_id: string }[]
): ActorNames {
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const names: ActorNames = {};
  for (const d of devices) {
    const name = nameOf.get(d.user_id);
    if (name) names[d.device_code] = name;
  }
  return names;
}

/**
 * Belgede "Kaydeden: Ahmet" satırı için ad. Tek kişilik işletmede her belgede aynı ad
 * gürültü olur; yalnızca ekipte birden çok kişi varsa ad döner.
 */
export function teamActorName(names: ActorNames, deviceCode: string | null | undefined): string | null {
  if (!deviceCode || new Set(Object.values(names)).size < 2) return null;
  return names[deviceCode] ?? null;
}

/** "Ahmet · VLT-AB12"; ad bilinmiyorsa yalnızca cihaz kodu */
export function actorLabel(names: ActorNames, deviceCode: string | null | undefined): string {
  if (!deviceCode) return "—";
  const name = names[deviceCode];
  return name ? `${name} · ${deviceCode}` : deviceCode;
}
