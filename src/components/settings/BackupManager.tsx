"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useSessionStore } from "@/stores/session";
import {
  backupFileName,
  backupTotal,
  createBackup,
  logBackup,
  parseBackup,
  readLastBackup,
  restoreBackup,
  writeLastBackup,
  type BackupFile,
  type BackupStatus,
  type RestoreResult,
} from "@/lib/backup/backup";
import { formatDateTime } from "@/lib/utils";

type ServerBackup = { id: string; kind: string; status: string; created_at: string; size_bytes: number | null; error: string | null };

function download(name: string, backup: BackupFile) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const KIND_LABEL: Record<string, string> = { AUTO: "Otomatik (sunucu)", MANUAL: "Elle", PRE_RESTORE: "Geri yükleme öncesi" };

/**
 * Yedekleme ekranı (Adım 1.11, Bölüm 4.8): son yedek durumu, elle yedek indirme,
 * yedekten güvenli (ekleyici) geri yükleme ve sunucudaki otomatik yedeklerin listesi.
 */
export function BackupManager() {
  const ctx = useBusinessContext();
  const isOnline = useSessionStore((s) => s.isOnline);
  const [last, setLast] = useState<BackupStatus | null>(null);
  const [serverList, setServerList] = useState<ServerBackup[] | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadServer = useCallback(async () => {
    if (!navigator.onLine) return;
    const { data } = await createClient()
      .from("business_backups")
      .select("id, kind, status, created_at, size_bytes, error")
      .order("created_at", { ascending: false })
      .limit(10);
    setServerList((data ?? []) as ServerBackup[]);
  }, []);

  useEffect(() => {
    // Açılışta yerel son yedek durumu ve sunucu yedek listesi bir kez yüklenir
    /* eslint-disable react-hooks/set-state-in-effect */
    setLast(readLastBackup(window.localStorage));
    if (isOnline) void loadServer();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOnline, loadServer]);

  async function takeBackup(kind: "MANUAL" | "PRE_RESTORE") {
    if (!ctx) throw new Error("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    const backup = await createBackup(ctx);
    download(backupFileName(backup, kind === "PRE_RESTORE" ? "geri-yukleme-oncesi" : "yedek"), backup);
    const status: BackupStatus = { at: backup.created_at, deviceCode: ctx.deviceCode, total: backupTotal(backup), kind };
    writeLastBackup(window.localStorage, status);
    setLast(status);
    await logBackup(ctx, backup, kind);
    // Sunucu kaydı en iyi çabayla; çevrimdışıysa yalnızca yerel durum tutulur
    if (navigator.onLine) {
      await createClient()
        .from("business_backups")
        .insert({ business_id: ctx.businessId, kind, status: "OK", row_counts: backup.counts, created_by: ctx.deviceCode })
        .then(() => loadServer());
    }
    return backup;
  }

  async function manual() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const backup = await takeBackup("MANUAL");
      setInfo(`Yedek indirildi (${backupTotal(backup)} kayıt). Dosyayı güvenli bir yerde saklayın.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yedek alınamadı.");
    }
    setBusy(false);
  }

  async function choose(file: File | undefined) {
    if (!file || !ctx) return;
    setError(null);
    setResult(null);
    setInfo(null);
    const parsed = parseBackup(await file.text(), ctx.businessId);
    if (!parsed.ok) return setError(parsed.error);
    setPending(parsed.backup);
  }

  async function restore() {
    if (!pending || !ctx) return;
    setBusy(true);
    setError(null);
    try {
      await takeBackup("PRE_RESTORE"); // Geri yükleme öncesi ek yedek (NFR-012)
      setResult(await restoreBackup(ctx, pending));
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geri yükleme yapılamadı.");
    }
    setBusy(false);
  }

  return (
    <section className="stack stack-md">
      <h1>Yedekleme</h1>
      <div className="card stack stack-sm">
        <strong>Son yedek (bu cihaz)</strong>
        <span>
          {last ? `${formatDateTime(last.at)} · ${last.total} kayıt · ${KIND_LABEL[last.kind] ?? last.kind}` : "Bu cihazda henüz yedek alınmadı."}
        </span>
        <small style={{ color: "var(--text-muted)" }}>
          Sunucu her gün otomatik yedek alır; aşağıdaki listede son durumunu görürsünüz. Elle yedek, verinizi kendi cihazınıza da kaydeder.
        </small>
        <button type="button" className="btn btn-primary btn-full" onClick={() => void manual()} disabled={busy}>Yedek al ve indir</button>
      </div>

      <div className="card stack stack-md">
        <h2>Yedekten geri yükle</h2>
        <p>
          Geri yükleme <strong>ekleyicidir</strong>: dosyada olup bu cihazda bulunmayan kayıtlar eklenir ve sunucuya gönderilir;
          mevcut kayıtların üzerine yazılmaz. İşlemden önce mevcut durumun ek yedeği otomatik indirilir.
        </p>
        <input type="file" accept="application/json,.json" aria-label="Yedek dosyası seç" onChange={(e) => void choose(e.target.files?.[0])} disabled={busy} />
        {pending ? (
          <div className="stack stack-sm">
            <div className="alert alert-warning" role="note">
              {formatDateTime(pending.created_at)} tarihli yedek ({pending.device_code}) · {backupTotal(pending)} kayıt. Devam edilsin mi?
            </div>
            <div className="row row-gap-md">
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPending(null)} disabled={busy}>Vazgeç</button>
              <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={() => void restore()} disabled={busy}>Geri yükle</button>
            </div>
          </div>
        ) : null}
        {result ? (
          <div className="alert alert-success" role="status">
            {result.added} kayıt eklendi, {result.skipped} kayıt zaten vardı (değiştirilmedi). Eklenenler sunucuya gönderilecek.
          </div>
        ) : null}
      </div>

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {info ? <div className="alert alert-success" role="status">{info}</div> : null}

      <div className="card stack stack-sm">
        <h2>Sunucu yedekleri</h2>
        {!isOnline ? <p>Liste için internet bağlantısı gerekir.</p> : serverList === null ? null : serverList.length === 0 ? (
          <p>Henüz sunucu yedeği yok. Günlük görev yapılandırıldıysa ilk yedek gece alınır.</p>
        ) : (
          <ul className="menu-list" aria-label="Sunucu yedekleri">
            {serverList.map((b) => (
              <li key={b.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
                <span className="row row-between">
                  <strong>{KIND_LABEL[b.kind] ?? b.kind}</strong>
                  <span className={`badge ${b.status === "OK" ? "badge-green" : "badge-red"}`}>{b.status === "OK" ? "Başarılı" : "Başarısız"}</span>
                </span>
                <small style={{ color: "var(--text-muted)" }}>
                  {formatDateTime(b.created_at)}
                  {b.size_bytes ? ` · ${(b.size_bytes / 1024).toFixed(0)} KB` : ""}
                  {b.error ? ` · ${b.error}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
