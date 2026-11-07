"use client";

import { useState } from "react";
import type { Service, ServicePart } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import { QuantityStepper } from "@/components/common/QuantityStepper";
import { removePart, updatePart, setPartSupply, setPartUsedQuantity } from "@/lib/services/quote";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { confirmDialog } from "@/components/common/ConfirmDialog";
import { STATUS_LABEL, STATUS_BADGE, SOURCE_LABEL, SUPPLY_LABEL } from "@/components/services/serviceLineLabels";

/** Parça temin durumu ve beklenen geliş tarihi (Adım 3.14, SR-019). */
export function SupplyControl({ part, run }: { part: ServicePart; run: (action: () => Promise<unknown>) => Promise<void> }) {
  const ctx = useServiceContext();
  const [status, setStatus] = useState<ServicePart["supply_status"]>(part.supply_status);
  const [expected, setExpected] = useState(part.expected_at ?? "");
  const waiting = status === "TO_ORDER" || status === "ORDERED";
  const dirty = status !== part.supply_status || (waiting && expected !== (part.expected_at ?? ""));

  return (
    <span className="row row-gap-sm" style={{ flexWrap: "wrap", alignItems: "center" }}>
      <select
        className="form-input"
        style={{ maxWidth: 170 }}
        aria-label={`${part.description_snapshot} temin durumu`}
        value={status}
        onChange={(e) => setStatus(e.target.value as ServicePart["supply_status"])}
      >
        {(Object.keys(SUPPLY_LABEL) as (keyof typeof SUPPLY_LABEL)[]).map((k) => (
          <option key={k} value={k}>{SUPPLY_LABEL[k]}</option>
        ))}
      </select>
      {waiting ? (
        <input
          className="form-input"
          style={{ maxWidth: 160 }}
          type="date"
          aria-label={`${part.description_snapshot} beklenen geliş tarihi`}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
      ) : null}
      {dirty ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => ctx && run(() => setPartSupply(ctx, part.id, status, waiting && expected ? expected : undefined))}
        >
          Temin durumunu kaydet
        </button>
      ) : null}
    </span>
  );
}

export function PartRow({
  part,
  service,
  editable,
  run,
}: {
  part: ServicePart;
  service: Service;
  editable: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const ctx = useServiceContext();
  const [used, setUsed] = useState(String(part.used_quantity).replace(".", ","));
  // Yanlış girilen miktar / fiyat düzeltilir (K-094); açıklama değişecekse satır kaldırılıp yeniden eklenir
  const [editing, setEditing] = useState(false);
  const [qtyText, setQtyText] = useState(String(part.quantity).replace(".", ","));
  const [priceText2, setPriceText2] = useState(String(part.unit_price_snapshot).replace(".", ","));

  async function saveEdit() {
    if (!ctx) return;
    const qty = parseQuantityInput(qtyText);
    const kurus = parseMoneyInput(priceText2);
    if (qty === null || qty <= 0) return run(async () => { throw new Error("Miktar sıfırdan büyük olmalıdır."); });
    if (kurus === null) return run(async () => { throw new Error("Fiyat geçerli bir tutar olmalıdır (ör. 450,00)."); });
    await run(() => updatePart(ctx, part.id, { quantity: qty, unitPriceKurus: kurus }));
    setEditing(false);
  }
  const canUse = service.status === "IN_PROGRESS" && part.status !== "REJECTED" && part.status !== "DEFERRED";

  async function apply() {
    if (!ctx) return;
    const qty = parseQuantityInput(used);
    if (qty === null) return run(async () => { throw new Error("Kullanılan miktar geçerli bir sayı olmalıdır."); });
    let reason: string | undefined;
    if (qty < part.used_quantity) {
      reason = window.prompt("Kullanımı geri alma nedeni:") ?? undefined;
      if (reason === undefined) return;
    }
    await run(() => setPartUsedQuantity(ctx, part.id, qty, reason));
  }

  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
      <span className="row row-between" style={{ gap: 8 }}>
        <strong>{part.description_snapshot}</strong>
        <strong>{formatCurrency(part.line_total)}</strong>
      </span>
      <span className="row row-between">
        <small style={{ color: "var(--text-muted)" }}>
          Parça · {SOURCE_LABEL[part.source_type]} · {formatQuantity(part.quantity)} × {formatCurrency(part.unit_price_snapshot)}
        </small>
        <span className={`badge ${STATUS_BADGE[part.status]}`}>{STATUS_LABEL[part.status]}</span>
      </span>
      <span className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
        {part.source_type === "STOCK_PRODUCT" ? (
          <span className={`badge ${part.supply_status === "IN_STOCK" || part.supply_status === "ARRIVED" ? "badge-green" : "badge-yellow"}`}>
            {SUPPLY_LABEL[part.supply_status]}
          </span>
        ) : null}
        <span className="badge badge-gray">Kullanılan: {formatQuantity(part.used_quantity)} / {formatQuantity(part.quantity)}</span>
      </span>

      {part.source_type !== "CUSTOMER_SUPPLIED" && !["DELIVERED", "CANCELLED"].includes(service.status) ? (
        <span className="supply-row">
          <small>Temin durumu</small>
          <SupplyControl part={part} run={run} />
        </span>
      ) : null}

      {editing ? (
        <span className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
          <QuantityStepper value={qtyText} onChange={setQtyText} />
          <input className="form-input" style={{ maxWidth: 130 }} inputMode="decimal" aria-label="Birim fiyat (₺)" value={priceText2} onChange={(e) => setPriceText2(e.target.value)} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveEdit()}>Kaydet</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Vazgeç</button>
        </span>
      ) : null}

      {canUse ? (
        <span className="row row-gap-sm">
          <input
            className="form-input"
            style={{ maxWidth: 110 }}
            inputMode="decimal"
            aria-label={`${part.description_snapshot} kullanılan miktar`}
            value={used}
            onChange={(e) => setUsed(e.target.value)}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={apply}>Kullanımı kaydet</button>
        </span>
      ) : null}

      {editable && !editing ? (
        <span className="row row-gap-sm">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Düzenle</button>
          {part.used_quantity === 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => { if (ctx && (await confirmDialog({ title: "Bu parça satırı kaldırılsın mı?", confirmLabel: "Kaldır", danger: true }))) await run(() => removePart(ctx, part.id)); }}
            >
              Kaldır
            </button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}
