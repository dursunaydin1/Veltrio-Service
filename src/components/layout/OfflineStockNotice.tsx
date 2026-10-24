"use client";

import { useSessionStore } from "@/stores/session";

/**
 * Çevrimdışı stok uyarısı (Adım 2.10, AC-009, ST-003): çevrimdışıyken gösterilen
 * stok bu cihazın bildiği son stok artı bekleyen yerel hareketlerdir. İki cihaz
 * aynı son stoğu tüketirse hareketler silinmez; eşitlemede stok eksiye düşer,
 * çakışma bildirimi açılır ve telafi seçenekleri sunulur.
 */
export function OfflineStockNotice({ always = false }: { always?: boolean }) {
  const isOnline = useSessionStore((s) => s.isOnline);
  if (isOnline && !always) return null;
  return (
    <details className={`alert ${isOnline ? "alert-warning" : "alert-error"}`} open={!isOnline}>
      <summary>{isOnline ? "Çevrimdışıyken stok nasıl çalışır?" : "Çevrimdışısınız: stok bilgisi bu cihaza göredir"}</summary>
      <p style={{ marginTop: 8 }}>
        Gösterilen stok, bu cihazın bildiği son stok ile eşitlenmemiş yerel hareketlerin toplamıdır. Başka bir cihazda aynı
        ürün satıldı veya kullanıldıysa, eşitlenince stok <strong>eksiye düşebilir</strong>. Hareketler silinmez; ürün
        “Eksi stok” olarak işaretlenir ve bildirim gelir. Telafi için stok düzeltmesi yapabilir ya da ilgili satış / servis
        işlemini iptal edebilirsiniz.
      </p>
    </details>
  );
}
