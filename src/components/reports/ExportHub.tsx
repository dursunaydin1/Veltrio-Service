"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSessionStore } from "@/stores/session";
import { DATASETS } from "@/lib/reports/datasets";
import { RangePicker, ReportTable, ExportPanel, useReportRange } from "./ReportParts";

/** Dışa aktarma merkezi (Adım 6.8): hedef seçilir, kimlik doğrulanır, uyarı onaylanır ve dosya indirilir. */
export function ExportHub() {
  const businessId = useSessionStore((s) => s.business?.id);
  const { range, setRange } = useReportRange();
  const [id, setId] = useState(DATASETS[0].id);
  const dataset = DATASETS.find((d) => d.id === id) ?? DATASETS[0];

  const rows = useLiveQuery(
    () => (businessId ? dataset.load(businessId, range) : undefined),
    [businessId, dataset.id, range.from, range.to]
  );

  return (
    <section className="stack stack-md">
      <h1>Dışa aktar</h1>
      <p>Verilerinizi Excel veya CSV olarak indirin. Dosyalar müşteri ve mali bilgi içerir; indirmeden önce kimliğiniz doğrulanır.</p>
      <div className="form-group no-print">
        <label className="form-label" htmlFor="ex-dataset">Ne aktarılsın?</label>
        <select id="ex-dataset" className="form-input" value={id} onChange={(e) => setId(e.target.value)}>
          {DATASETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      {dataset.usesRange ? <RangePicker range={range} onChange={setRange} /> : null}
      {rows ? (
        <>
          <p>{rows.length} satır.</p>
          <ReportTable columns={dataset.columns} rows={rows.slice(0, 50)} rowKey={(_, i) => String(i)} empty="Bu hedefte kayıt yok." />
          {rows.length > 50 ? <small style={{ color: "var(--text-muted)" }}>Önizlemede ilk 50 satır gösterilir; dosyada tüm satırlar bulunur.</small> : null}
          <ExportPanel title={dataset.label} base={dataset.id} columns={dataset.columns} rows={rows} />
        </>
      ) : null}
    </section>
  );
}
