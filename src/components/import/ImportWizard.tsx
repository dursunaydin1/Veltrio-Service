"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useSessionStore } from "@/stores/session";
import {
  DuplicateImportError,
  applyImport,
  findBatchByHash,
  loadBalanceContext,
  loadCustomerContext,
  loadProductContext,
  type ImportResult,
} from "@/lib/import/apply";
import {
  IMPORT_DEFS,
  applyMapping,
  missingRequired,
  suggestMapping,
  templateXlsx,
  type ImportKind,
  type Mapping,
} from "@/lib/import/definitions";
import { ImportFileError, parseFileBytes, sha256Hex, type ParsedTable } from "@/lib/import/parse";
import {
  DECISION_LABEL,
  validateCustomers,
  validateOpeningBalances,
  validateOpeningStock,
  validateProducts,
  type Decision,
  type ValidatedRow,
} from "@/lib/import/validate";

type Step = "pick" | "map" | "preview" | "done";

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
 * Excel / CSV içe aktarma sihirbazı (Adım 6.1-6.5): dosya → alan eşleştirme → önizleme ve doğrulama
 * → onay → uygulama. İçe aktarma her zaman çevrimiçi yapılır; aynı dosya (özet) ikinci kez alınamaz.
 */
export function ImportWizard() {
  const ctx = useBusinessContext();
  const business = useSessionStore((s) => s.business);
  const isOnline = useSessionStore((s) => s.isOnline);
  const [kind, setKind] = useState<ImportKind>("customers");
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<{ name: string; hash: string } | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [rows, setRows] = useState<ValidatedRow<unknown>[]>([]);
  const [choices, setChoices] = useState<Map<number, Decision>>(new Map());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const def = IMPORT_DEFS[kind];
  const missing = useMemo(() => missingRequired(def.fields, mapping), [def, mapping]);

  function reset() {
    setStep("pick");
    setFile(null);
    setTable(null);
    setRows([]);
    setChoices(new Map());
    setResult(null);
    setError(null);
  }

  async function onFile(f: File | undefined) {
    if (!f || !ctx) return;
    setError(null);
    setBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const parsed = parseFileBytes(bytes, f.name);
      const hash = await sha256Hex(bytes);
      // Aynı dosya daha önce alındı mı? Yerel kayıt + sunucu (başka cihazdan alınmış olabilir) — AC-047
      const local = await findBatchByHash(ctx.businessId, hash);
      if (local) throw new DuplicateImportError(local);
      const { data } = await createClient().from("import_batches").select("file_name, imported_at").eq("file_hash", hash).limit(1);
      if (data && data.length > 0) throw new ImportFileError(`Bu dosya daha önce içe aktarılmış (${data[0].file_name}, ${String(data[0].imported_at).slice(0, 10)}).`);
      setFile({ name: f.name, hash });
      setTable(parsed);
      setMapping(suggestMapping(parsed.headers, def.fields));
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dosya okunamadı.");
    }
    setBusy(false);
  }

  async function validate() {
    if (!ctx || !table) return;
    setError(null);
    setBusy(true);
    try {
      const raw = applyMapping(table.rows, def.fields, mapping);
      let validated: ValidatedRow<unknown>[];
      if (kind === "customers") validated = validateCustomers(raw, await loadCustomerContext(ctx.businessId));
      else if (kind === "products") validated = validateProducts(raw, await loadProductContext(ctx.businessId));
      else if (kind === "opening-stock") validated = validateOpeningStock(raw, await loadProductContext(ctx.businessId));
      else validated = validateOpeningBalances(raw, await loadBalanceContext(ctx.businessId));
      setRows(validated);
      setChoices(new Map(validated.filter((r) => r.decisions.length > 1).map((r) => [r.rowNumber, r.defaultDecision])));
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Doğrulama yapılamadı.");
    }
    setBusy(false);
  }

  async function confirm() {
    if (!ctx || !file) return;
    if (!isOnline) return setError("İçe aktarma internet bağlantısı gerektirir.");
    setError(null);
    setBusy(true);
    try {
      const settings = business?.settings;
      const res = await applyImport(ctx, kind, file, rows, choices, {
        taxMode: settings?.default_tax_mode ?? "INCLUSIVE",
        taxRate: settings?.default_tax_rate ?? 20,
      });
      setResult(res);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İçe aktarma yapılamadı.");
    }
    setBusy(false);
  }

  const errorRows = rows.filter((r) => r.errors.length > 0);
  const okRows = rows.filter((r) => r.errors.length === 0);
  const warnRows = okRows.filter((r) => r.warnings.length > 0);

  return (
    <section className="stack stack-md">
      <h1>İçe aktar</h1>
      {!isOnline ? <div className="alert alert-error" role="alert">Çevrimdışısınız: içe aktarma sunucu doğrulaması gerektirdiğinden internete bağlanmalısınız.</div> : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      {step === "pick" ? (
        <div className="card stack stack-md">
          <div className="form-group">
            <label className="form-label" htmlFor="im-kind">Ne içe aktarılacak?</label>
            <select id="im-kind" className="form-input" value={kind} onChange={(e) => setKind(e.target.value as ImportKind)}>
              {(Object.keys(IMPORT_DEFS) as ImportKind[]).map((k) => <option key={k} value={k}>{IMPORT_DEFS[k].label}</option>)}
            </select>
            <small style={{ color: "var(--text-muted)" }}>{def.description}</small>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => download(`sablon-${kind}.xlsx`, templateXlsx(kind) as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
            Şablonu indir (.xlsx)
          </button>
          <div className="form-group">
            <label className="form-label" htmlFor="im-file">Dosya (.xlsx veya .csv)</label>
            <input id="im-file" type="file" accept=".xlsx,.xls,.csv,text/csv" disabled={busy || !isOnline} onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        </div>
      ) : null}

      {step === "map" && table && file ? (
        <div className="card stack stack-md">
          <h2>Alan eşleştirme</h2>
          <p>{file.name} · {table.rows.length} satır. Hangi sütunun neye karşılık geldiğini kontrol edin.</p>
          {def.fields.map((f) => (
            <div className="form-group" key={f.key}>
              <label className="form-label" htmlFor={`map-${f.key}`}>{f.label}{f.required ? " *" : ""}</label>
              <select id={`map-${f.key}`} className="form-input" value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">— eşleştirme —</option>
                {table.headers.map((h, i) => <option key={i} value={i}>{h || `(sütun ${i + 1})`}</option>)}
              </select>
            </div>
          ))}
          {missing.length > 0 ? <div className="alert alert-warning" role="alert">Zorunlu alan eşleşmedi: {missing.map((f) => f.label).join(", ")}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={reset} disabled={busy}>Vazgeç</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void validate()} disabled={busy || missing.length > 0}>Önizle ve doğrula</button>
          </div>
        </div>
      ) : null}

      {step === "preview" ? (
        <div className="stack stack-md">
          <div className="tile-grid">
            <div className="tile"><div className="tile-label">Uygulanacak</div><div className="tile-value">{okRows.length}</div></div>
            <div className="tile"><div className="tile-label">Uyarılı</div><div className="tile-value">{warnRows.length}</div></div>
            <div className="tile"><div className="tile-label">Hatalı (atlanacak)</div><div className="tile-value" style={{ color: errorRows.length ? "var(--accent-danger)" : undefined }}>{errorRows.length}</div></div>
          </div>

          {errorRows.length > 0 ? (
            <section className="card stack stack-sm" aria-labelledby="im-errors">
              <h2 id="im-errors">Hatalı satırlar</h2>
              <ul className="menu-list" aria-label="Hatalı satırlar">
                {errorRows.slice(0, 100).map((r) => (
                  <li key={r.rowNumber} style={{ display: "flex", flexDirection: "column", padding: "6px 0" }}>
                    <strong>{r.rowNumber}. satır</strong>
                    <small style={{ color: "var(--accent-danger)" }}>{r.errors.join(" · ")}</small>
                  </li>
                ))}
              </ul>
              {errorRows.length > 100 ? <small>İlk 100 hata gösterildi.</small> : null}
            </section>
          ) : null}

          {warnRows.length > 0 ? (
            <section className="card stack stack-sm" aria-labelledby="im-warn">
              <h2 id="im-warn">Uyarılar ve mükerrer kayıtlar</h2>
              <ul className="menu-list" aria-label="Uyarılar">
                {warnRows.slice(0, 100).map((r) => (
                  <li key={r.rowNumber} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
                    <strong>{r.rowNumber}. satır{r.duplicate ? ` · ${r.duplicate.label}` : ""}</strong>
                    <small style={{ color: "var(--text-muted)" }}>{r.warnings.join(" · ")}</small>
                    {r.decisions.length > 1 ? (
                      <select
                        className="form-input"
                        aria-label={`${r.rowNumber}. satır için seçim`}
                        value={choices.get(r.rowNumber) ?? r.defaultDecision}
                        onChange={(e) => setChoices(new Map(choices).set(r.rowNumber, e.target.value as Decision))}
                      >
                        {r.decisions.map((d) => <option key={d} value={d}>{DECISION_LABEL[d]}</option>)}
                      </select>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="alert alert-warning" role="note">
            Onayladığınızda {okRows.length} satır uygulanır; hatalı {errorRows.length} satır atlanır. İşlem tek adımdır: bir sorun çıkarsa hiçbir kayıt yazılmaz.
          </div>
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep("map")} disabled={busy}>Geri</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void confirm()} disabled={busy || okRows.length === 0 || !isOnline}>
              {busy ? "Uygulanıyor…" : "Onayla ve uygula"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="card stack stack-md">
          <div className="alert alert-success" role="status">
            İçe aktarma tamamlandı: {result.created} eklendi, {result.merged} birleştirildi/değiştirildi, {result.matched} eşleştirildi,
            {" "}{result.skipped} atlandı, {result.errors} hatalı satır uygulanmadı.
          </div>
          <button type="button" className="btn btn-primary btn-full" onClick={reset}>Başka dosya içe aktar</button>
        </div>
      ) : null}
    </section>
  );
}
