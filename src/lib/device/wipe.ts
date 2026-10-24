import { db } from "@/lib/db";

/** Cihazda tutulan, uygulamaya ait tüm localStorage anahtarları (silme ve PIN sıfırlama için). */
export function isAppStorageKey(key: string): boolean {
  return key.startsWith("veltrio");
}

/**
 * İptal edilen cihazın yerel verisini siler (PRD §4.4, AC-045): yerel veritabanı
 * (müşteri, servis, satış… ve eşitleme kuyruğu), oturum, cihaz kodu, eşitleme
 * imleçleri ve PIN. Bekleyen eşitlenmemiş kayıtlar da silinir; iptal edilen cihazdan
 * artık sunucuya veri kabul edilmez.
 */
export async function wipeLocalData(storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): Promise<void> {
  db.close();
  await db.delete();
  if (storage) {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && isAppStorageKey(key)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  }
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.clear();
    } catch {
      // Oturum depolaması kapalıysa yapılacak bir şey yok.
    }
  }
}
