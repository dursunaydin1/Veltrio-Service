import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Business, Device } from "@/types";

/**
 * Uygulama genelinde aktif oturum ve cihaz bilgilerini tutar.
 * PRD §4.3, §4.4: Kullanıcı ve cihaz bilgileri localStorage'da kalıcı.
 */

interface SessionState {
  // Supabase Auth kullanıcısı
  user: User | null;
  // İşletme bilgisi
  business: Business | null;
  // Aktif cihaz
  device: Device | null;

  // Çevrimiçi/çevrimdışı durumu
  isOnline: boolean;
  // Son başarılı eşitleme
  lastSyncedAt: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setBusiness: (business: Business | null) => void;
  setDevice: (device: Device | null) => void;
  setIsOnline: (online: boolean) => void;
  setLastSyncedAt: (at: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      business: null,
      device: null,
      isOnline: true,
      lastSyncedAt: null,

      setUser: (user) => set({ user }),
      setBusiness: (business) => set({ business }),
      setDevice: (device) => set({ device }),
      setIsOnline: (isOnline) => set({ isOnline }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),

      clearSession: () =>
        set({
          user: null,
          business: null,
          device: null,
          lastSyncedAt: null,
        }),
    }),
    {
      name: "veltrio-session",   // localStorage anahtarı
      // Hassas veriler hariç: user.id ve device.device_code yeterli
      partialize: (state) => ({
        user: state.user,
        business: state.business,
        device: state.device,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);

// Kısayol selector'lar (re-render minimizasyonu)
export const useCurrentUser     = () => useSessionStore((s) => s.user);
export const useCurrentBusiness = () => useSessionStore((s) => s.business);
export const useCurrentDevice   = () => useSessionStore((s) => s.device);
export const useDeviceCode      = () => useSessionStore((s) => s.device?.device_code ?? "UNKNOWN");
export const useIsOnline        = () => useSessionStore((s) => s.isOnline);
export const useLastSyncedAt    = () => useSessionStore((s) => s.lastSyncedAt);
