"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useSessionStore } from "@/stores/session";
import { markAllRead, markRead, markResolved } from "@/lib/notifications/center";
import { getIssueCount } from "@/lib/sync/queue";
import { ConflictResolveError, resolveKeepMine, resolveKeepServer, retryItem } from "@/lib/sync/conflicts";
import { readLastBackup } from "@/lib/backup/backup";
import { formatDateTime } from "@/lib/utils";
import type { SyncQueueItem } from "@/types";

const TYPE_LABEL: Record<string, string> = {
  CUSTOMER_APPROVAL_NEEDED: "Onay bekleniyor",
  PART_WAITING: "Parça bekleniyor",
  DELIVERY_REMINDER: "Teslim hatırlatması",
  SERVICE_COMPLETED: "Servis tamamlandı",
  LOW_STOCK: "Kritik stok",
  PAYMENT_DUE: "Vade",
  SYNC_CONFLICT: "Eşitleme / stok",
};

const TABLE_LABEL: Record<string, string> = {
  customers: "müşteri", machines: "makine", services: "servis", sales: "satış", purchases: "alım",
  products: "ürün", suppliers: "tedarikçi", payments: "ödeme", stock_movements: "stok hareketi",
};

/**
 * Eşitleme, yedek ve bildirim merkezi (Adım 6.7, FR-035, PRD §4.8): son eşitleme,
 * bekleyen / hatalı kayıt sayısı, çakışma kuyruğu ve çözümü, son yedek ve bildirim listesi.
 */
export function NotificationCenter() {
  const ctx = useBusinessContext();
  const business = useSessionStore((s) => s.business);
  const lastSyncedAt = useSessionStore((s) => s.lastSyncedAt);
  const isOnline = useSessionStore((s) => s.isOnline);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useLiveQuery(() => (business ? getIssueCount(business.id) : undefined), [business?.id]);
  const issues = useLiveQuery(
    async () =>
      (await db.sync_queue.toArray())
        .filter((i) => (i.status === "ERROR" || i.status === "CONFLICT") && (i.payload as Record<string, unknown>).business_id === business?.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [business?.id]
  );
  const notifications = useLiveQuery(async () => {
    if (!business) return undefined;
    const all = await db.notifications.where("business_id").equals(business.id).toArray();
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [business?.id]);

  // localStorage yalnızca tarayıcıda okunur; sunucu çiziminde boş kalır (uyuşmazlık olmaz)
  const lastBackupRaw = useSyncExternalStore(
    () => () => undefined,
    () => window.localStorage.getItem("veltrio_last_backup"),
    () => null
  );
  const lastBackup = lastBackupRaw ? readLastBackup({ getItem: () => lastBackupRaw } as unknown as Storage) : null;
  const open = (notifications ?? []).filter((n) => !n.resolved_at);
  const resolved = (notifications ?? []).filter((n) => !!n.resolved_at);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ConflictResolveError || e instanceof Error ? e.message : "İşlem yapılamadı.");
    }
    setBusy(null);
  }

  return (
    <section className="stack stack-md">
      <h1>Eşitleme ve bildirimler</h1>

      <div className="tile-grid" aria-label="Eşitleme durumu">
        <div className="tile">
          <div className="tile-label">Son eşitleme</div>
          <div className="tile-value" style={{ fontSize: "1rem" }}>{lastSyncedAt ? formatDateTime(lastSyncedAt) : "Henüz yok"}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Bekleyen kayıt</div>
          <div className="tile-value">{counts?.pending ?? 0}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Hatalı / çakışan</div>
          <div className="tile-value" style={{ color: (counts?.errors ?? 0) + (counts?.conflicts ?? 0) > 0 ? "var(--accent-danger)" : undefined }}>
            {(counts?.errors ?? 0) + (counts?.conflicts ?? 0)}
          </div>
        </div>
        <div className="tile">
          <div className="tile-label">Son yedek</div>
          <div className="tile-value" style={{ fontSize: "1rem" }}>{lastBackup ? formatDateTime(lastBackup.at) : "Alınmadı"}</div>
        </div>
      </div>
      <div className="row row-gap-md">
        <Link href="/settings/backup" className="btn btn-secondary" style={{ flex: 1 }}>Yedekleme / geri yükleme</Link>
        <Link href="/reports/export" className="btn btn-secondary" style={{ flex: 1 }}>Dışa aktar</Link>
      </div>
      {!isOnline ? <div className="alert alert-warning" role="status">Çevrimdışısınız: çakışma çözümü internet gerektirir.</div> : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      {issues && issues.length > 0 ? (
        <section className="card stack stack-md" aria-labelledby="nc-issues">
          <h2 id="nc-issues">Çakışma ve hata kuyruğu</h2>
          <p>Bu kayıtlar sunucuya gönderilemedi. Hiçbiri silinmedi; nasıl devam edeceğinizi seçin.</p>
          <ul className="menu-list" aria-label="Çakışmalar">
            {issues.map((i: SyncQueueItem) => (
              <li key={i.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
                <span className="row row-between">
                  <strong>{TABLE_LABEL[i.table_name] ?? i.table_name} · {i.operation === "UPDATE" ? "güncelleme" : i.operation === "INSERT" ? "ekleme" : "silme"}</strong>
                  <span className={`badge ${i.status === "CONFLICT" ? "badge-yellow" : "badge-red"}`}>{i.status === "CONFLICT" ? "Çakışma" : "Hata"}</span>
                </span>
                <small style={{ color: "var(--text-muted)" }}>{i.error_message ?? ""} · {formatDateTime(i.created_at)}</small>
                <span className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
                  {i.status === "ERROR" ? (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy === i.id} onClick={() => void run(i.id, () => retryItem(i.id))}>Yeniden dene</button>
                  ) : null}
                  {i.status === "CONFLICT" && i.operation === "UPDATE" ? (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!isOnline || busy === i.id} onClick={() => void run(i.id, () => resolveKeepMine(createClient(), i.id))}>
                      Benim değişikliğimi uygula
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!isOnline || busy === i.id} onClick={() => void run(i.id, () => resolveKeepServer(createClient(), i.id))}>
                    Sunucudaki sürümü al
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card stack stack-md" aria-labelledby="nc-notes">
        <div className="row row-between">
          <h2 id="nc-notes">Bildirimler</h2>
          {open.some((n) => !n.read_at) && ctx ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void markAllRead(ctx.deviceCode, ctx.businessId)}>Tümünü okundu yap</button>
          ) : null}
        </div>
        {notifications === undefined ? null : open.length === 0 ? (
          <p>Açık bildirim yok.</p>
        ) : (
          <ul className="menu-list" aria-label="Açık bildirimler">
            {open.map((n) => (
              <li key={n.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", opacity: n.read_at ? 0.75 : 1 }}>
                <span className="row row-between">
                  <strong>{TYPE_LABEL[n.type] ?? n.type}</strong>
                  {!n.read_at ? <span className="badge badge-yellow">Yeni</span> : null}
                </span>
                <span>{n.message}</span>
                <small style={{ color: "var(--text-muted)" }}>{formatDateTime(n.created_at)}</small>
                {ctx ? (
                  <span className="row row-gap-sm">
                    {!n.read_at ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => void markRead(ctx.deviceCode, n.id)}>Okundu</button> : null}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void markResolved(ctx.deviceCode, n.id)}>Çözüldü say</button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {resolved.length > 0 ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowResolved(!showResolved)}>
              {showResolved ? "Çözülenleri gizle" : `Çözülenleri göster (${resolved.length})`}
            </button>
            {showResolved ? (
              <ul className="menu-list" aria-label="Çözülen bildirimler">
                {resolved.slice(0, 50).map((n) => (
                  <li key={n.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0", opacity: 0.6 }}>
                    <span>{n.message}</span>
                    <small style={{ color: "var(--text-muted)" }}>Çözüldü: {n.resolved_at ? formatDateTime(n.resolved_at) : ""}</small>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>
    </section>
  );
}
