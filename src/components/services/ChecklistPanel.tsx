"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Service } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import {
  addChecklistItem,
  applyTemplate,
  getChecklist,
  removeChecklistItem,
  setChecklistItemDone,
} from "@/lib/services/checklist";
import { formatDateTime } from "@/lib/utils";

/** Servis kontrol listesi: şablon uygula, madde ekle / kaldır / tamamla (Adım 3.10). */
export function ChecklistPanel({ service }: { service: Service }) {
  const ctx = useServiceContext();
  const items = useLiveQuery(() => getChecklist(service.id), [service.id]);
  const templates = useLiveQuery(
    () => db.service_templates.where("business_id").equals(service.business_id).filter((t) => t.active).toArray(),
    [service.business_id]
  );
  const [title, setTitle] = useState("");
  const [required, setRequired] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const closed = ["DELIVERED", "CANCELLED"].includes(service.status);
  if (closed && (items?.length ?? 0) === 0) return null;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
    }
  }

  const done = (items ?? []).filter((i) => i.is_completed).length;

  return (
    <section className="card stack stack-md" aria-labelledby="cl-title">
      <div className="row row-between">
        <h2 id="cl-title">Kontrol listesi</h2>
        {items && items.length > 0 ? <span className="badge badge-gray">{done}/{items.length}</span> : null}
      </div>

      {items && items.length > 0 ? (
        <ul className="menu-list" aria-label="Kontrol listesi maddeleri">
          {items.map((item) => (
            <li key={item.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0" }}>
              <span className="row row-between" style={{ alignItems: "center" }}>
                <label className="row row-gap-md" style={{ alignItems: "center", minHeight: 44 }}>
                  <input
                    type="checkbox"
                    checked={item.is_completed}
                    disabled={closed}
                    onChange={(e) => ctx && run(() => setChecklistItemDone(ctx, item.id, e.target.checked))}
                  />
                  <span style={item.is_completed ? { textDecoration: "line-through", color: "var(--text-muted)" } : undefined}>
                    {item.title_snapshot}
                  </span>
                </label>
                <span className="row row-gap-sm">
                  {item.required ? <span className="badge badge-yellow">Zorunlu</span> : null}
                  {!closed ? (
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`${item.title_snapshot} kaldır`} onClick={() => ctx && run(() => removeChecklistItem(ctx, item.id))}>
                      Kaldır
                    </button>
                  ) : null}
                </span>
              </span>
              {item.is_completed && item.completed_at ? (
                <small style={{ color: "var(--text-muted)" }}>
                  {formatDateTime(item.completed_at)}
                  {item.completed_by_device ? ` · ${item.completed_by_device}` : ""}
                </small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>Bu serviste kontrol listesi yok.</p>
      )}

      {!closed ? (
        <div className="stack stack-sm">
          {templates && templates.length > 0 ? (
            <div className="row row-gap-sm">
              <select className="form-input" aria-label="Şablon seç" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Şablon seç…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!templateId}
                onClick={() => ctx && run(async () => { await applyTemplate(ctx, service.id, templateId); setTemplateId(""); })}
              >
                Uygula
              </button>
            </div>
          ) : null}
          <form
            className="row row-gap-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (ctx) void run(async () => { await addChecklistItem(ctx, service.id, { title, required }); setTitle(""); setRequired(false); });
            }}
          >
            <input className="form-input" style={{ flex: 1 }} placeholder="Yeni madde" aria-label="Yeni madde" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label className="row row-gap-sm" style={{ alignItems: "center", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Zorunlu
            </label>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={!title.trim()}>Ekle</button>
          </form>
        </div>
      ) : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    </section>
  );
}
