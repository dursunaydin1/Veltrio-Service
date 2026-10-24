"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { ACTION_LABEL, ENTITY_LABEL, describeChange, entityHref } from "@/lib/audit/describe";
import { useSessionStore } from "@/stores/session";
import { foldText } from "@/lib/utils/search";
import { formatDateTime } from "@/lib/utils";

const PAGE = 50;

/** Geçmiş (audit log) ekranı (Adım 1.8, AC-032): kritik işlemlerin eski/yeni değeri, tarih, aktör, cihaz ve gerekçesi. */
export function AuditHistory() {
  const businessId = useSessionStore((s) => s.business?.id);
  const [entity, setEntity] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const logs = useLiveQuery(
    async () => {
      if (!businessId) return undefined;
      const all = await db.audit_logs.where("business_id").equals(businessId).toArray();
      return all.sort((a, b) => b.changed_at.localeCompare(a.changed_at));
    },
    [businessId]
  );

  const entityTypes = useMemo(() => [...new Set((logs ?? []).map((l) => l.entity_type))].sort(), [logs]);
  const filtered = useMemo(() => {
    const words = foldText(query.trim()).split(/\s+/).filter(Boolean);
    return (logs ?? []).filter((l) => {
      if (entity && l.entity_type !== entity) return false;
      if (words.length === 0) return true;
      const haystack = foldText([l.reason, l.changed_by_device, ENTITY_LABEL[l.entity_type], ...describeChange(l)].filter(Boolean).join(" "));
      return words.every((w) => haystack.includes(w));
    });
  }, [logs, entity, query]);

  return (
    <section className="stack stack-md">
      <h1>Geçmiş</h1>
      <p>Kritik işlemler (iade, iptal, stok düzeltme, arşivleme, cihaz iptali, ayar değişikliği…) burada değiştirilemez kayıt olarak tutulur.</p>
      <div className="row row-gap-md">
        <select className="form-input" style={{ flex: 1 }} aria-label="Kayıt türü" value={entity} onChange={(e) => { setEntity(e.target.value); setLimit(PAGE); }}>
          <option value="">Tüm kayıtlar</option>
          {entityTypes.map((t) => <option key={t} value={t}>{ENTITY_LABEL[t] ?? t}</option>)}
        </select>
        <input className="form-input" style={{ flex: 2 }} type="search" placeholder="Gerekçe veya içerik ara" aria-label="Geçmişte ara" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
      </div>

      {logs === undefined ? null : filtered.length === 0 ? (
        <div className="alert alert-warning" role="note">{logs.length === 0 ? "Henüz geçmiş kaydı yok." : "Aramanıza uyan kayıt yok."}</div>
      ) : (
        <>
          <ul className="menu-list" aria-label="Geçmiş kayıtları">
            {filtered.slice(0, limit).map((l) => {
              const href = entityHref(l);
              const changes = describeChange(l);
              return (
                <li key={l.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 0" }}>
                  <span className="row row-between">
                    <strong>{ENTITY_LABEL[l.entity_type] ?? l.entity_type} · {ACTION_LABEL[l.action]}</strong>
                    {href ? <Link href={href}>Kayda git</Link> : null}
                  </span>
                  {l.reason ? <span>{l.reason}</span> : null}
                  {changes.map((c) => <small key={c} style={{ color: "var(--text-secondary)" }}>{c}</small>)}
                  <small style={{ color: "var(--text-muted)" }}>{formatDateTime(l.changed_at)} · {l.changed_by_device}</small>
                </li>
              );
            })}
          </ul>
          {filtered.length > limit ? (
            <button type="button" className="btn btn-secondary btn-full" onClick={() => setLimit(limit + PAGE)}>Daha fazla göster ({filtered.length - limit})</button>
          ) : null}
        </>
      )}
    </section>
  );
}
