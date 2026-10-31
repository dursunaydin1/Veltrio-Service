"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useSessionStore } from "@/stores/session";
import { hasPin, attemptUnlock } from "@/lib/pin/pin";
import { writeAuditLog } from "@/lib/sync/audit";
import { exportFileName, formatTrDate, toCsv, toXlsx, type Column } from "@/lib/export/export";
import { monthRange, type DateRange, type Granularity } from "@/lib/reports/calc";
import { formatCurrency, formatQuantity, todayLocalDate } from "@/lib/utils";

/** Tarih aralığı ve (isteğe bağlı) gün/ay gruplaması seçimi; varsayılan: bu ay. */
export function useReportRange() {
  const [range, setRange] = useState<DateRange>(() => monthRange(todayLocalDate()));
  const [granularity, setGranularity] = useState<Granularity>("day");
  return { range, setRange, granularity, setGranularity };
}

export function RangePicker({
  range,
  onChange,
  granularity,
  onGranularity,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  granularity?: Granularity;
  onGranularity?: (g: Granularity) => void;
}) {
  return (
    <div className="row row-gap-md no-print" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
      <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
        <label className="form-label" htmlFor="rp-from">Başlangıç</label>
        <input id="rp-from" className="form-input" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })} />
      </div>
      <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
        <label className="form-label" htmlFor="rp-to">Bitiş</label>
        <input id="rp-to" className="form-input" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })} />
      </div>
      {granularity && onGranularity ? (
        <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
          <label className="form-label" htmlFor="rp-gran">Gruplama</label>
          <select id="rp-gran" className="form-input" value={granularity} onChange={(e) => onGranularity(e.target.value as Granularity)}>
            <option value="day">Günlük</option>
            <option value="month">Aylık</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}

function renderCell(value: unknown, type: Column<never>["type"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money") return formatCurrency(Number(value) / 100);
  if (type === "number") return formatQuantity(Number(value));
  if (type === "date") return formatTrDate(String(value));
  return String(value);
}

/** Ekranda gösterilen tablo; aynı sütun tanımı dışa aktarmada da kullanılır (ekran = dosya). */
export function ReportTable<T extends Record<string, unknown>>({
  columns,
  rows,
  footer,
  empty = "Seçilen aralıkta kayıt yok.",
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  footer?: T;
  empty?: string;
  rowKey: (row: T, index: number) => string;
}) {
  if (rows.length === 0) return <div className="empty-state" role="note">{empty}</div>;
  const numeric = (t?: string) => t === "money" || t === "number";
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="report-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ textAlign: numeric(c.type) ? "right" : "left", padding: "8px 6px", borderBottom: "1px solid var(--border-default)", whiteSpace: "nowrap" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: numeric(c.type) ? "right" : "left", padding: "8px 6px", borderBottom: "1px solid var(--border-subtle, var(--border-default))" }}>
                  {renderCell(row[c.key], c.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? (
          <tfoot>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ textAlign: numeric(c.type) ? "right" : "left", padding: "8px 6px" }}>
                  {renderCell(footer[c.key], c.type)}
                </th>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Dışa aktarma (Adım 6.8, AC-049): hassas veri uyarısı gösterilir ve kimlik yeniden
 * doğrulanır (PIN tanımlıysa PIN, değilse hesap şifresi; çevrimdışı ve PIN yoksa uyarıyı
 * onaylamak yeterlidir). Dışa aktarma audit log'a yazılır.
 */
export function ExportPanel<T extends Record<string, unknown>>({
  title,
  base,
  columns,
  rows,
  footer,
}: {
  title: string;
  base: string;
  columns: Column<T>[];
  rows: T[];
  footer?: T;
}) {
  const ctx = useBusinessContext();
  const email = useSessionStore((s) => s.authEmail);
  const isOnline = useSessionStore((s) => s.isOnline);
  const [format, setFormat] = useState<"csv" | "xlsx" | null>(null);
  const [secret, setSecret] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usesPin = typeof window !== "undefined" && hasPin(window.localStorage);
  const needsSecret = usesPin || (isOnline && !!email);

  async function confirm() {
    if (!format || !ctx) return;
    setError(null);
    if (!ack) return setError("Hassas veri uyarısını onaylayın.");
    setBusy(true);
    try {
      if (usesPin) {
        const result = await attemptUnlock(window.localStorage, secret);
        if (!result.ok) throw new Error(result.reason === "LOCKED" ? "Çok fazla hatalı deneme; bir süre bekleyin." : "PIN hatalı.");
      } else if (needsSecret) {
        const { error: authError } = await createClient().auth.signInWithPassword({ email: email as string, password: secret });
        if (authError) throw new Error("Şifre hatalı.");
      }
      const all = footer ? [...rows, footer] : rows;
      const today = todayLocalDate();
      if (format === "csv") download(exportFileName(base, "csv", today), toCsv(columns, all), "text/csv;charset=utf-8");
      else download(exportFileName(base, "xlsx", today), toXlsx(title, columns, all) as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "backups",
        entityId: ctx.businessId,
        action: "CREATE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason: "Veri dışa aktarıldı",
        newValue: { rapor: title, biçim: format, satır: all.length },
      });
      setFormat(null);
      setSecret("");
      setAck(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dışa aktarılamadı.");
    }
    setBusy(false);
  }

  return (
    <div className="no-print stack stack-sm">
      {format === null ? (
        <div className="row row-gap-md">
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} disabled={rows.length === 0} onClick={() => setFormat("csv")}>CSV indir</button>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} disabled={rows.length === 0} onClick={() => setFormat("xlsx")}>Excel indir</button>
        </div>
      ) : (
        <div className="card stack stack-sm">
          <div className="alert alert-warning" role="note">
            <strong>Hassas veri:</strong> Bu dosya müşteri ve mali bilgiler içerir. Güvenli saklayın, yetkisiz kişilerle paylaşmayın.
          </div>
          <label className="row row-gap-sm" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            Uyarıyı okudum, dosyayı güvenle saklayacağım
          </label>
          {needsSecret ? (
            <div className="form-group">
              <label className="form-label" htmlFor="ex-secret">{usesPin ? "Cihaz PIN kodu" : "Hesap şifreniz"}</label>
              <input id="ex-secret" className="form-input" type="password" inputMode={usesPin ? "numeric" : undefined} autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </div>
          ) : null}
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setFormat(null); setError(null); }} disabled={busy}>Vazgeç</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void confirm()} disabled={busy || (needsSecret && secret.length === 0)}>
              {format === "csv" ? "CSV indir" : "Excel indir"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
