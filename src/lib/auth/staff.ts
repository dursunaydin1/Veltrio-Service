import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/types";
import { isStaffPermission, type StaffPermission } from "@/lib/auth/permissions";

/**
 * Çalışan yönetimi (K-119): davet, izin, pasifleştirme. Hepsi çevrimiçi yapılır ve
 * veritabanındaki güvenli fonksiyonlardan geçer (028); kullanıcı satırı tarayıcıdan
 * doğrudan değiştirilemez.
 */

export type StaffInvite = {
  id: string;
  code: string;
  name: string;
  permissions: string[];
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
};

const onlyKnown = (permissions: readonly string[]): StaffPermission[] =>
  [...new Set(permissions)].filter(isStaffPermission);

/** Davet kodu 8 karakter; okunurken karışmaması için 4-4 gösterilir */
export function formatInviteCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Elle yazılan kodu sadeleştirir: boşluk / tire atılır, büyük harfe çevrilir */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function isInviteOpen(invite: Pick<StaffInvite, "used_at" | "revoked_at" | "expires_at">, now = new Date()): boolean {
  return !invite.used_at && !invite.revoked_at && new Date(invite.expires_at) > now;
}

export async function listTeam(supabase: SupabaseClient): Promise<User[]> {
  const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: true });
  if (error) throw new Error("Çalışan listesi yüklenemedi.");
  return (data ?? []) as User[];
}

export async function listInvites(supabase: SupabaseClient): Promise<StaffInvite[]> {
  const { data, error } = await supabase.from("staff_invites").select("*").order("created_at", { ascending: false });
  if (error) throw new Error("Davetler yüklenemedi.");
  return (data ?? []) as StaffInvite[];
}

export async function createInvite(supabase: SupabaseClient, name: string, permissions: readonly string[]): Promise<StaffInvite> {
  const { data, error } = await supabase.rpc("create_staff_invite", { p_name: name, p_permissions: onlyKnown(permissions) });
  if (error) throw new Error(error.message || "Davet oluşturulamadı.");
  return data as StaffInvite;
}

export async function revokeInvite(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_staff_invite", { p_invite_id: id });
  if (error) throw new Error(error.message || "Davet iptal edilemedi.");
}

export async function acceptInvite(supabase: SupabaseClient, code: string): Promise<User> {
  const { data, error } = await supabase.rpc("accept_staff_invite", { p_code: normalizeInviteCode(code) });
  if (error) throw new Error(error.message || "Davet kodu kabul edilmedi.");
  return data as User;
}

export async function setStaffPermissions(supabase: SupabaseClient, userId: string, permissions: readonly string[]): Promise<User> {
  const { data, error } = await supabase.rpc("set_staff_permissions", { p_user_id: userId, p_permissions: onlyKnown(permissions) });
  if (error) throw new Error(error.message || "İzinler kaydedilemedi.");
  return data as User;
}

export async function setStaffActive(supabase: SupabaseClient, userId: string, active: boolean): Promise<User> {
  const { data, error } = await supabase.rpc("set_staff_active", { p_user_id: userId, p_active: active });
  if (error) throw new Error(error.message || "Çalışan durumu değiştirilemedi.");
  return data as User;
}
