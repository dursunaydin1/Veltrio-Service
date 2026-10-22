"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LineStatus, PartSourceType, Service, ServiceOperation, ServicePart } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { ProductPicker } from "@/components/products/ProductPicker";
import { parseMoneyInput, parseQuantityInput } from "@/lib/calc";
import {
  EDITABLE_STATUSES,
  addOperation,
  addPart,
  getServiceLines,
  recordApproval,
  removeOperation,
  removePart,
  setPartUsedQuantity,
  updateOperation,
  type LineDecision,
} from "@/lib/services/quote";
import { DEFAULT_APPROVAL_THRESHOLD } from "@/lib/services/service";
import { approvalRequired, summarizeLines } from "@/lib/services/lines";
import { useSessionStore } from "@/stores/session";
import { formatCurrency, formatDateTime, formatQuantity } from "@/lib/utils";
import type { Product, TaxMode } from "@/types";

const STATUS_LABEL: Record<LineStatus, string> = {
  PENDING: "Karar bekliyor",
  APPROVED: "Onaylı",
  REJECTED: "Reddedildi",
  DEFERRED: "Ertelendi",
};
const STATUS_BADGE: Record<LineStatus, string> = {
  PENDING: "badge-yellow",
  APPROVED: "badge-green",
  REJECTED: "badge-red",
  DEFERRED: "badge-gray",
};
const SOURCE_LABEL: Record<PartSourceType, string> = {
  STOCK_PRODUCT: "Stoktan ürün",
  CUSTOMER_SUPPLIED: "Müşterinin getirdiği parça",
  NON_STOCK_PURCHASE: "Stok dışı alım",
  OTHER: "Diğer",
};
const SUPPLY_LABEL = { IN_STOCK: "Stokta", TO_ORDER: "Sipariş edilecek", ORDERED: "Sipariş verildi", ARRIVED: "Geldi" } as const;

const money = (kurus: number) => formatCurrency(kurus / 100);
const priceText = (tl: number) => tl.toFixed(2).replace(".", ",");

type Mode = null | { type: "op"; edit?: ServiceOperation } | { type: "part" } | { type: "approval" };

/** Servis kalemleri: işlemler, parçalar, teklif özeti, müşteri kararı (Adım 3.8-3.9). */
export function ServiceLines({ service }: { service: Service }) {
  const ctx = useServiceContext();
  const settings = useSessionStore((s) => s.business?.settings);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = useLiveQuery(() => getServiceLines(service.id), [service.id]);
  const approvals = useLiveQuery(async () => {
    const all = await db.service_approvals.where("service_id").equals(service.id).toArray();
    return all.sort((a, b) => b.decided_at.localeCompare(a.decided_at));
  }, [service.id]);

  const editable = EDITABLE_STATUSES.includes(service.status);
  const threshold = ctx?.approvalThreshold ?? DEFAULT_APPROVAL_THRESHOLD;
  const summary = summarizeLines([...(lines?.operations ?? []), ...(lines?.parts ?? [])]);
  const needsDecision = approvalRequired(summary.quote, threshold) && summary.pendingCount > 0;
  const defaultTax = {
    mode: (settings?.default_tax_mode ?? "INCLUSIVE") as TaxMode,
    rate: settings?.default_tax_rate ?? 20,
  };

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
    }
  }

  return (
    <section className="card stack stack-md" aria-labelledby="ln-title">
      <h2 id="ln-title">İşlemler ve parçalar</h2>

      <div className="tile-grid">
        <div className="tile">
          <div className="tile-label">Teklif toplamı</div>
          <div className="tile-value">{money(summary.quote)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Onaylanan</div>
          <div className="tile-value">{money(summary.approved)}</div>
        </div>
      </div>

      {needsDecision ? (
        <div className="alert alert-warning" role="alert">
          Teklif {formatCurrency(threshold)} eşiğini aşıyor: karar bekleyen kalemler için müşteri onayı gerekli.
        </div>
      ) : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      {mode === null ? (
        <>
          {lines === undefined ? null : lines.operations.length + lines.parts.length === 0 ? (
            <p>Henüz işlem veya parça eklenmedi.</p>
          ) : (
            <ul className="menu-list" aria-label="Kalemler">
              {lines.operations.map((op) => (
                <li key={op.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
                  <span className="row row-between" style={{ gap: 8 }}>
                    <strong>{op.description}</strong>
                    <strong>{op.price_pending ? "Fiyat bekleniyor" : formatCurrency(op.line_total)}</strong>
                  </span>
                  <span className="row row-between">
                    <small style={{ color: "var(--text-muted)" }}>
                      İşlem · {formatQuantity(op.quantity)} × {formatCurrency(op.unit_price)}
                    </small>
                    <span className={`badge ${STATUS_BADGE[op.status]}`}>{STATUS_LABEL[op.status]}</span>
                  </span>
                  {editable ? (
                    <span className="row row-gap-sm">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode({ type: "op", edit: op })}>Düzenle</button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => ctx && window.confirm("Bu işlem satırı kaldırılsın mı?") && run(() => removeOperation(ctx, op.id))}
                      >
                        Kaldır
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}

              {lines.parts.map((part) => (
                <PartRow key={part.id} part={part} service={service} editable={editable} run={run} />
              ))}
            </ul>
          )}

          {editable ? (
            <div className="row row-gap-md">
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode({ type: "op" })}>
                + İşlem ekle
              </button>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode({ type: "part" })}>
                + Parça ekle
              </button>
            </div>
          ) : (
            <p>Bu durumda kalem değiştirilemez; gerekirse servisi yeniden açın.</p>
          )}

          {editable && summary.pendingCount > 0 ? (
            <button type="button" className="btn btn-primary btn-full" onClick={() => setMode({ type: "approval" })}>
              Müşteri kararını kaydet ({summary.pendingCount} kalem bekliyor)
            </button>
          ) : null}
        </>
      ) : mode.type === "op" ? (
        <OperationForm service={service} edit={mode.edit} defaultTax={defaultTax} onDone={() => setMode(null)} />
      ) : mode.type === "part" ? (
        <PartForm service={service} defaultTax={defaultTax} onDone={() => setMode(null)} />
      ) : (
        <ApprovalForm service={service} lines={lines} onDone={() => setMode(null)} />
      )}

      {approvals && approvals.length > 0 ? (
        <>
          <h3>Onay geçmişi</h3>
          <ul className="menu-list" aria-label="Onay geçmişi">
            {approvals.map((a) => (
              <li key={a.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
                <strong>
                  {a.decision === "APPROVED" ? "Onaylandı" : a.decision === "REJECTED" ? "Reddedildi" : a.decision === "DEFERRED" ? "Ertelendi" : "Kısmen onaylandı"}{" "}
                  · Onaylı tutar: {formatCurrency(a.approved_amount)}
                </strong>
                <small style={{ color: "var(--text-muted)" }}>
                  {formatDateTime(a.decided_at)} · {a.method === "IN_PERSON" ? "Yüz yüze" : a.method === "PHONE" ? "Telefon" : "Diğer"}
                  {a.explanation ? ` · ${a.explanation}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function PartRow({
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

      {editable && part.used_quantity === 0 ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => ctx && window.confirm("Bu parça satırı kaldırılsın mı?") && run(() => removePart(ctx, part.id))}
        >
          Kaldır
        </button>
      ) : null}
    </li>
  );
}

function OperationForm({
  service,
  edit,
  defaultTax,
  onDone,
}: {
  service: Service;
  edit?: ServiceOperation;
  defaultTax: { mode: TaxMode; rate: number };
  onDone: () => void;
}) {
  const ctx = useServiceContext();
  const [description, setDescription] = useState(edit?.description ?? "");
  const [quantity, setQuantity] = useState(edit ? String(edit.quantity).replace(".", ",") : "1");
  const [price, setPrice] = useState(edit && !edit.price_pending ? priceText(edit.unit_price) : "");
  const [discount, setDiscount] = useState(edit && edit.discount_amount > 0 ? priceText(edit.discount_amount) : "");
  const [taxMode, setTaxMode] = useState<TaxMode>((edit?.tax_mode as TaxMode) ?? defaultTax.mode);
  const [taxRate, setTaxRate] = useState(String(edit?.tax_rate ?? defaultTax.rate).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const qty = parseQuantityInput(quantity);
    const rate = parseQuantityInput(taxRate);
    const priceKurus = price.trim() === "" ? null : parseMoneyInput(price);
    const discountKurus = discount.trim() === "" ? 0 : parseMoneyInput(discount);

    if (!description.trim()) return setError("İşlem açıklaması zorunludur.");
    if (qty === null || qty <= 0) return setError("Miktar sıfırdan büyük olmalıdır.");
    if (price.trim() !== "" && priceKurus === null) return setError("Fiyat geçerli bir tutar olmalıdır (ör. 450,00).");
    if (discountKurus === null) return setError("İndirim geçerli bir tutar olmalıdır.");
    if (rate === null || rate > 100) return setError("KDV oranı 0 ile 100 arasında olmalıdır.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    const input = { description, quantity: qty, unitPriceKurus: priceKurus, discountKurus, taxMode, taxRate: rate };
    setBusy(true);
    try {
      if (edit) await updateOperation(ctx, edit.id, input);
      else await addOperation(ctx, service.id, input);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>{edit ? "İşlemi düzenle" : "İşlem ekle"}</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="op-desc">Açıklama *</label>
        <input id="op-desc" className="form-input" placeholder="Ör. karbüratör ayarı" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
      </div>
      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="op-qty">Miktar</label>
          <input id="op-qty" className="form-input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label" htmlFor="op-price">Birim fiyat (₺)</label>
          <input id="op-price" className="form-input" inputMode="decimal" placeholder="Boş: fiyat sonra" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      {price.trim() === "" ? <p>Fiyat girilmezse kalem “fiyat bekleniyor” olur ve iş tamamlanamaz.</p> : null}
      <div className="form-group">
        <label className="form-label" htmlFor="op-discount">İndirim (₺, toplam)</label>
        <input id="op-discount" className="form-input" inputMode="decimal" placeholder="0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </div>
      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="op-tax">KDV</label>
          <select id="op-tax" className="form-input" value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)}>
            <option value="INCLUSIVE">KDV dahil</option>
            <option value="EXCLUSIVE">KDV hariç</option>
            <option value="NONE">KDV yok</option>
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="op-rate">Oran (%)</label>
          <input id="op-rate" className="form-input" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </div>
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </form>
  );
}

function PartForm({
  service,
  defaultTax,
  onDone,
}: {
  service: Service;
  defaultTax: { mode: TaxMode; rate: number };
  onDone: () => void;
}) {
  const ctx = useServiceContext();
  const [source, setSource] = useState<PartSourceType>("STOCK_PRODUCT");
  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickProduct(p: Product) {
    setProductId(p.id);
    setPrice(priceText(p.default_sale_price));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const qty = parseQuantityInput(quantity);
    const priceKurus = price.trim() === "" ? undefined : parseMoneyInput(price);

    if (qty === null || qty <= 0) return setError("Miktar sıfırdan büyük olmalıdır.");
    if (price.trim() !== "" && priceKurus === null) return setError("Fiyat geçerli bir tutar olmalıdır (ör. 125,50).");
    if (source === "STOCK_PRODUCT" && !productId) return setError("Ürün seçin.");
    if (source !== "STOCK_PRODUCT" && !description.trim()) return setError("Parça açıklaması zorunludur.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
    try {
      await addPart(ctx, service.id, {
        sourceType: source,
        productId: source === "STOCK_PRODUCT" ? productId : undefined,
        description: source === "STOCK_PRODUCT" ? undefined : description,
        quantity: qty,
        unitPriceKurus: priceKurus ?? undefined,
        taxMode: defaultTax.mode,
        taxRate: defaultTax.rate,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Parça ekle</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="pt-source">Parça kaynağı</label>
        <select id="pt-source" className="form-input" value={source} onChange={(e) => setSource(e.target.value as PartSourceType)}>
          {(Object.keys(SOURCE_LABEL) as PartSourceType[]).map((s) => (
            <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {source === "STOCK_PRODUCT" ? (
        <ProductPicker value={productId} onChange={pickProduct} label="Ürün" />
      ) : (
        <div className="form-group">
          <label className="form-label" htmlFor="pt-desc">Açıklama *</label>
          <input id="pt-desc" className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      )}

      <div className="row row-gap-md">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="pt-qty">Miktar</label>
          <input id="pt-qty" className="form-input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label" htmlFor="pt-price">Birim fiyat (₺)</label>
          <input
            id="pt-price"
            className="form-input"
            inputMode="decimal"
            placeholder={source === "CUSTOMER_SUPPLIED" ? "Boş: ücretsiz" : "0,00"}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>
      {source === "STOCK_PRODUCT" ? <p>Parça eklemek stoğu değiştirmez; stok, parça “kullanıldı” denince düşer.</p> : null}

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Ekle"}</button>
      </div>
    </form>
  );
}

function ApprovalForm({
  service,
  lines,
  onDone,
}: {
  service: Service;
  lines: { operations: ServiceOperation[]; parts: ServicePart[] } | undefined;
  onDone: () => void;
}) {
  const ctx = useServiceContext();
  const pending: { kind: "operation" | "part"; id: string; title: string; total: number }[] = [
    ...(lines?.operations ?? []).filter((o) => o.status === "PENDING").map((o) => ({ kind: "operation" as const, id: o.id, title: o.description, total: o.line_total })),
    ...(lines?.parts ?? []).filter((p) => p.status === "PENDING").map((p) => ({ kind: "part" as const, id: p.id, title: p.description_snapshot, total: p.line_total })),
  ];

  const [decisions, setDecisions] = useState<Record<string, LineDecision["decision"]>>({});
  const [method, setMethod] = useState<"IN_PERSON" | "PHONE" | "OTHER">("IN_PERSON");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    setError(null);
    try {
      await recordApproval(ctx, service.id, {
        decisions: pending.map((p) => ({ kind: p.kind, id: p.id, decision: decisions[p.id] ?? "APPROVED" })),
        method,
        explanation,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Müşteri kararı</h3>
      <p>Her kalem için müşterinin kararını seçin. Reddedilen ve ertelenen kalemler toplama girmez.</p>
      <ul className="menu-list" aria-label="Karar bekleyen kalemler">
        {pending.map((p) => (
          <li key={p.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
            <span className="row row-between">
              <strong>{p.title}</strong>
              <strong>{formatCurrency(p.total)}</strong>
            </span>
            <select
              className="form-input"
              aria-label={`${p.title} kararı`}
              value={decisions[p.id] ?? "APPROVED"}
              onChange={(e) => setDecisions((d) => ({ ...d, [p.id]: e.target.value as LineDecision["decision"] }))}
            >
              <option value="APPROVED">Onaylandı</option>
              <option value="REJECTED">Reddedildi</option>
              <option value="DEFERRED">Ertelendi</option>
            </select>
          </li>
        ))}
      </ul>
      <div className="form-group">
        <label className="form-label" htmlFor="ap-method">Onay yöntemi</label>
        <select id="ap-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="IN_PERSON">Yüz yüze</option>
          <option value="PHONE">Telefon</option>
          <option value="OTHER">Diğer</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="ap-note">Açıklama</label>
        <input id="ap-note" className="form-input" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kararı kaydet"}</button>
      </div>
    </form>
  );
}
