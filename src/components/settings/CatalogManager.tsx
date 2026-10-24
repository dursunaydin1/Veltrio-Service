"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { IssueCatalogEntry, OperationCatalogEntry } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { parseMoneyInput } from "@/lib/calc";
import {
  ISSUE_CATEGORIES,
  OPERATION_CATEGORIES,
  createIssueEntry,
  createOperationEntry,
  setIssueActive,
  setOperationActive,
  updateIssueEntry,
  updateOperationEntry,
} from "@/lib/catalog/service";
import { useSessionStore } from "@/stores/session";
import { formatCurrency } from "@/lib/utils";

type Kind = "OPERATION" | "ISSUE";
type Entry = (OperationCatalogEntry | IssueCatalogEntry) & { suggested_price?: number; default_duration?: number };

/** Arıza ve işlem katalogları: ekle, düzenle, pasifleştir (Adım 3.5). */
export function CatalogManager() {
  const businessId = useSessionStore((s) => s.business?.id);
  const [kind, setKind] = useState<Kind>("OPERATION");
  const [editing, setEditing] = useState<Entry | "new" | null>(null);

  const entries = useLiveQuery(async (): Promise<Entry[] | undefined> => {
    if (!businessId) return undefined;
    const rows =
      kind === "OPERATION"
        ? await db.operation_catalog.where("business_id").equals(businessId).toArray()
        : await db.issue_catalog.where("business_id").equals(businessId).toArray();
    return rows.sort((a, b) => a.category.localeCompare(b.category, "tr") || a.name.localeCompare(b.name, "tr"));
  }, [businessId, kind]);

  return (
    <section className="stack stack-md">
      <h1>Kataloglar</h1>
      <div className="row row-gap-sm" role="tablist" aria-label="Katalog türü">
        {([["OPERATION", "İşlemler"], ["ISSUE", "Arızalar"]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={kind === id}
            className={`btn btn-sm ${kind === id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setKind(id);
              setEditing(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p>
        Katalog yalnızca hızlı seçim içindir. Servise eklenen satırın açıklaması ve fiyatı kopyalanır; katalog sonradan
        değişse geçmiş servisler değişmez.
      </p>

      {editing ? (
        <EntryForm key={editing === "new" ? "new" : editing.id} kind={kind} entry={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn btn-primary btn-full" onClick={() => setEditing("new")}>
          {kind === "OPERATION" ? "Yeni işlem" : "Yeni arıza"}
        </button>
      )}

      {entries === undefined ? null : entries.length === 0 ? (
        <div className="alert alert-warning" role="note">Henüz kayıt yok.</div>
      ) : (
        <ul className="menu-list" aria-label="Katalog kayıtları">
          {entries.map((e) => (
            <EntryRow key={e.id} kind={kind} entry={e} onEdit={() => setEditing(e)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryRow({ kind, entry, onEdit }: { kind: Kind; entry: Entry; onEdit: () => void }) {
  const ctx = useBusinessContext();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!ctx) return;
    setError(null);
    try {
      if (kind === "OPERATION") await setOperationActive(ctx, entry.id, !entry.active);
      else await setIssueActive(ctx, entry.id, !entry.active);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Değiştirilemedi.");
    }
  }

  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", opacity: entry.active ? 1 : 0.6 }}>
      <span className="row row-between">
        <strong>{entry.name}</strong>
        <span className="row row-gap-sm">
          {!entry.active ? <span className="badge badge-gray">Pasif</span> : null}
          {entry.suggested_price !== undefined ? <span className="badge badge-gray">{formatCurrency(entry.suggested_price)}</span> : null}
        </span>
      </span>
      <small style={{ color: "var(--text-muted)" }}>
        {entry.category}
        {entry.default_duration ? ` · ${entry.default_duration} dk` : ""}
      </small>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <span className="row row-gap-sm">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>Düzenle</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={toggle}>{entry.active ? "Pasifleştir" : "Etkinleştir"}</button>
      </span>
    </li>
  );
}

function EntryForm({ kind, entry, onDone }: { kind: Kind; entry?: Entry; onDone: () => void }) {
  const ctx = useBusinessContext();
  const categories = kind === "OPERATION" ? OPERATION_CATEGORIES : ISSUE_CATEGORIES;
  const [name, setName] = useState(entry?.name ?? "");
  const [category, setCategory] = useState(entry?.category ?? "Diğer");
  const [price, setPrice] = useState(entry?.suggested_price !== undefined ? entry.suggested_price.toFixed(2).replace(".", ",") : "");
  const [duration, setDuration] = useState(entry?.default_duration !== undefined ? String(entry.default_duration) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    const priceKurus = price.trim() === "" ? undefined : parseMoneyInput(price);
    if (priceKurus === null) return setError("Önerilen fiyat geçerli bir tutar olmalıdır.");
    const minutes = duration.trim() === "" ? undefined : Number(duration);
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 0)) return setError("Süre tam sayı (dakika) olmalıdır.");

    setBusy(true);
    try {
      if (kind === "OPERATION") {
        const input = { name, category, suggestedPriceKurus: priceKurus, defaultDuration: minutes };
        if (entry) await updateOperationEntry(ctx, entry.id, input);
        else await createOperationEntry(ctx, input);
      } else if (entry) await updateIssueEntry(ctx, entry.id, { name, category });
      else await createIssueEntry(ctx, { name, category });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <form className="card stack stack-md" onSubmit={submit} noValidate>
      <h2>{entry ? "Düzenle" : kind === "OPERATION" ? "Yeni işlem" : "Yeni arıza"}</h2>
      <div className="form-group">
        <label className="form-label" htmlFor="cat-name">Ad *</label>
        <input id="cat-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="cat-category">Kategori</label>
        <select id="cat-category" className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          {!(categories as readonly string[]).includes(category) ? <option value={category}>{category}</option> : null}
        </select>
      </div>
      {kind === "OPERATION" ? (
        <div className="row row-gap-md">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor="cat-price">Önerilen fiyat (₺)</label>
            <input id="cat-price" className="form-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor="cat-duration">Süre (dk)</label>
            <input id="cat-duration" className="form-input" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>
      ) : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </form>
  );
}
