"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { ServiceTemplate } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { createTemplate, getTemplateItems, setTemplateActive, updateTemplate } from "@/lib/catalog/service";
import { useSessionStore } from "@/stores/session";

type Row = { title: string; required: boolean };

/** Servis şablonları ve kontrol listesi maddeleri (Adım 3.5, 3.10). */
export function TemplateManager() {
  const businessId = useSessionStore((s) => s.business?.id);
  const ctx = useBusinessContext();
  const [editing, setEditing] = useState<{ template?: ServiceTemplate; items: Row[] } | null>(null);

  const templates = useLiveQuery(async () => {
    if (!businessId) return undefined;
    const all = await db.service_templates.where("business_id").equals(businessId).toArray();
    const out = [];
    for (const t of all.sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
      out.push({ template: t, count: (await getTemplateItems(t.id)).length });
    }
    return out;
  }, [businessId]);

  async function startEdit(template?: ServiceTemplate) {
    const items = template ? (await getTemplateItems(template.id)).map((i) => ({ title: i.title, required: i.required })) : [{ title: "", required: false }];
    setEditing({ template, items });
  }

  return (
    <section className="stack stack-md">
      <h1>Servis şablonları</h1>
      <p>
        Şablon uygulandığında maddeler servise kopyalanır. Şablonu sonradan değiştirmek açık servislerdeki maddeleri
        değiştirmez.
      </p>

      {editing ? (
        <TemplateForm
          key={editing.template?.id ?? "new"}
          template={editing.template}
          initial={editing.items}
          onDone={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="btn btn-primary btn-full" onClick={() => void startEdit()}>Yeni şablon</button>
      )}

      {templates === undefined ? null : templates.length === 0 ? (
        <div className="alert alert-warning" role="note">Henüz şablon yok.</div>
      ) : (
        <ul className="menu-list" aria-label="Şablonlar">
          {templates.map(({ template: t, count }) => (
            <li key={t.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", opacity: t.active ? 1 : 0.6 }}>
              <span className="row row-between">
                <strong>{t.name}</strong>
                {!t.active ? <span className="badge badge-gray">Pasif</span> : null}
              </span>
              <small style={{ color: "var(--text-muted)" }}>
                {count} madde{t.machine_type ? ` · ${t.machine_type}` : ""}
              </small>
              <span className="row row-gap-sm">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void startEdit(t)}>Düzenle</button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => ctx && void setTemplateActive(ctx, t.id, !t.active)}
                >
                  {t.active ? "Pasifleştir" : "Etkinleştir"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TemplateForm({ template, initial, onDone }: { template?: ServiceTemplate; initial: Row[]; onDone: () => void }) {
  const ctx = useBusinessContext();
  const [name, setName] = useState(template?.name ?? "");
  const [machineType, setMachineType] = useState(template?.machine_type ?? "");
  const [items, setItems] = useState<Row[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (index: number, change: Partial<Row>) => setItems(items.map((r, i) => (i === index ? { ...r, ...change } : r)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      const input = { name, machineType, items };
      if (template) await updateTemplate(ctx, template.id, input);
      else await createTemplate(ctx, input);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <form className="card stack stack-md" onSubmit={submit} noValidate>
      <h2>{template ? "Şablonu düzenle" : "Yeni şablon"}</h2>
      <div className="form-group">
        <label className="form-label" htmlFor="tpl-name">Ad *</label>
        <input id="tpl-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="tpl-type">Makine türü (isteğe bağlı)</label>
        <input id="tpl-type" className="form-input" value={machineType} onChange={(e) => setMachineType(e.target.value)} />
      </div>

      <div className="stack stack-sm">
        <strong>Maddeler</strong>
        {items.map((row, index) => (
          <div key={index} className="row row-gap-sm" style={{ alignItems: "center" }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              aria-label={`Madde ${index + 1}`}
              value={row.title}
              onChange={(e) => patch(index, { title: e.target.value })}
            />
            <label className="row row-gap-sm" style={{ alignItems: "center", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={row.required} onChange={(e) => patch(index, { required: e.target.checked })} />
              Zorunlu
            </label>
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Madde ${index + 1} sil`} onClick={() => setItems(items.filter((_, i) => i !== index))}>
              Sil
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setItems([...items, { title: "", required: false }])}>
          Madde ekle
        </button>
      </div>

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </form>
  );
}
