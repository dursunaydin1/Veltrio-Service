"use client";

import { useSessionStore } from "@/stores/session";
import { can, isOwner, type StaffPermission } from "@/lib/auth/permissions";

/** Oturumdaki kullanıcı bu işi yapabilir mi? (K-119) */
export function useCan(permission: StaffPermission): boolean {
  return useSessionStore((s) => can(s.user, permission));
}

/** Oturumdaki kullanıcı patron mu? Oturum yüklenmemişse kısıtlama yok. */
export function useIsOwner(): boolean {
  return useSessionStore((s) => !s.user || isOwner(s.user));
}
