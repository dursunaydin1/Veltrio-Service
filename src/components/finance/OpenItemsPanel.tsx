"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { parseMoneyInput } from "@/lib/calc";
import { AGING_BANDS, fifoAllocate } from "@/lib/finance/aging";
import {
  applyCustomerCredit,
  getCustomerOpenItems,
  getUnallocatedPayments,
  recordCustomerCollection,
  type CollectionAllocation,
  type OpenItem,
} from "@/lib/finance/openItems";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

const money = (kurus: number) => formatCurrency(kurus / 100);
const field = (kurus: number) => (kurus / 100).toFixed(2).replace(".", ",");

const itemHref = (item: OpenItem) =>
  item.kind === "SALE" ? `/sales/${item.id}` : item.kind === "SERVICE" ? `/services/${item.id}` : null;

/** Alan değerlerinden (₺ metni) tahsisleri çıkarır; boş alanlar atlanır. */
function parseAllocations(
  items: OpenItem[],
  values: Record<string, string>
): { allocations: CollectionAllocation[]; error?: string } {
  const allocations: CollectionAllocation[] = [];
  for (const item of items) {
    const raw = (values[item.key] ?? "").trim();
    if (raw === "") continue;
    const kurus = parseMoneyInput(raw);
    if (kurus === null || kurus < 0) return { allocations, error: `“${item.label}” için tutar geçersiz.` };
    if (kurus === 0) continue;
    if (kurus > item.remainingKurus) return { allocations, error: `“${item.label}” için en fazla ${money(item.remainingKurus)} tahsis edilebilir.` };
    allocations.push({ kind: item.kind, id: item.id, amountKurus: kurus });
  }
  return { allocations };
}

/** Müşteri sayfası: açık kalemler, yaşlandırma bantları, müşteri alacağı ve avans mahsubu (Adım 5.2-5.3, 5.8). */
export function OpenItemsPanel({ party }: { party: { id: string; business_id: string } }) {
  const data = useLiveQuery(() => getCustomerOpenItems(party.business_id, party.id), [party.id, party.business_id]);
  const advances = useLiveQuery(() => getUnallocatedPayments(party.business_id, party.id), [party.id, party.business_id]);
  const [offsetting, setOffsetting] = useState(false);

  if (!data) return null;
  const advanceKurus = (advances ?? []).reduce((acc, a) => acc + a.unallocatedKurus, 0);
  const hasAging = Object.values(data.aging).some((v) => v > 0);

  return (
    <section className="card stack stack-md" aria-labelledby="oi-title">
      <h2 id="oi-title">Açık kalemler</h2>

      {data.items.length === 0 ? (
        <p>Açık borç kalemi yok.</p>
      ) : (
        <>
          {hasAging ? (
            <div className="tile-grid" aria-label="Yaşlandırma">
              {AGING_BANDS.filter((b) => data.aging[b.id] > 0).map((b) => (
                <div className="tile" key={b.id}>
                  <div className="tile-label">{b.label}</div>
                  <div className="tile-value" style={{ color: b.id === "NOT_DUE" || b.id === "D0_7" ? undefined : "var(--accent-warning)" }}>
                    {money(data.aging[b.id])}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <ul className="menu-list" aria-label="Açık kalemler">
            {data.items.map((item) => {
              const href = itemHref(item);
              return (
                <li key={item.key} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
                  <span className="row row-between">
                    {href ? <Link href={href}><strong>{item.label}</strong></Link> : <strong>{item.label}</strong>}
                    <strong>{money(item.remainingKurus)}</strong>
                  </span>
                  <small style={{ color: "var(--text-muted)" }}>
                    {formatDate(item.docDate)}
                    {item.dueDate ? ` · vade ${formatDate(item.dueDate)}` : ""}
                    {item.paidKurus > 0 ? ` · ${money(item.paidKurus)} ödendi` : ""}
                  </small>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {data.creditKurus > 0 ? (
        <div className="alert alert-success" role="note">
          Müşteri alacağı: <strong>{money(data.creditKurus)}</strong> (avans, iade veya fazla ödeme). Net bakiyeye zaten yansır.
        </div>
      ) : null}

      {advanceKurus > 0 && data.items.length > 0 ? (
        offsetting ? (
          <OffsetForm party={party} items={data.items} advanceKurus={advanceKurus} onDone={() => setOffsetting(false)} />
        ) : (
          <button type="button" className="btn btn-secondary btn-full" onClick={() => setOffsetting(true)}>
            Avansı ({money(advanceKurus)}) borçlara mahsup et
          </button>
        )
      ) : null}
    </section>
  );
}

function OffsetForm({
  party,
  items,
  advanceKurus,
  onDone,
}: {
  party: { id: string };
  items: OpenItem[];
  advanceKurus: number;
  onDone: () => void;
}) {
  const ctx = useBusinessContext();
  const initial = useMemo(() => {
    const parts = fifoAllocate(items.map((i) => ({ key: i.key, refDate: i.refDate, remainingKurus: i.remainingKurus })), advanceKurus);
    return Object.fromEntries(parts.map((p) => [p.key, field(p.amountKurus)]));
  }, [items, advanceKurus]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const { allocations, error: parseError } = parseAllocations(items, values);
    if (parseError) return setError(parseError);
    if (allocations.length === 0) return setError("Mahsup edilecek tutarı girin.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      await applyCustomerCredit(ctx, party.id, allocations);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mahsup yapılamadı.");
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Avans mahsubu</h3>
      <p>Kullanılabilir avans {money(advanceKurus)}. Varsayılan dağıtım en eski borçtan başlar; tutarları değiştirebilirsiniz.</p>
      <AllocationFields items={items} values={values} onChange={setValues} />
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Mahsup et"}</button>
      </div>
    </form>
  );
}

function AllocationFields({
  items,
  values,
  onChange,
}: {
  items: OpenItem[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <ul className="menu-list" aria-label="Tahsis edilecek kalemler">
      {items.map((item) => (
        <li key={item.key} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
          <span className="row row-between">
            <span>{item.label}</span>
            <small style={{ color: "var(--text-muted)" }}>kalan {money(item.remainingKurus)}</small>
          </span>
          <input
            className="form-input"
            inputMode="decimal"
            placeholder="0,00"
            aria-label={`${item.label} tahsis tutarı`}
            value={values[item.key] ?? ""}
            onChange={(e) => onChange({ ...values, [item.key]: e.target.value })}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Belgesiz genel tahsilat formu (FR-017, AC-040): tutar girilince en eski açık
 * kalemden başlayan önerilen dağıtım gelir; kalemlerin tutarı elle değiştirilebilir.
 * Dağıtılmayan kısım müşteri avansı olarak kalır.
 */
export function CollectionForm({ party, onDone }: { party: { id: string; business_id: string }; onDone: () => void }) {
  const ctx = useBusinessContext();
  const data = useLiveQuery(() => getCustomerOpenItems(party.business_id, party.id), [party.id, party.business_id]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [manual, setManual] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data]);
  const amountKurus = parseMoneyInput(amount);
  const suggested = useMemo(() => {
    if (!amountKurus || amountKurus <= 0) return {} as Record<string, string>;
    const parts = fifoAllocate(items.map((i) => ({ key: i.key, refDate: i.refDate, remainingKurus: i.remainingKurus })), amountKurus);
    return Object.fromEntries(parts.map((p) => [p.key, field(p.amountKurus)]));
  }, [items, amountKurus]);

  const values = manual ?? suggested;
  const parsed = parseAllocations(items, values);
  const allocated = parsed.allocations.reduce((acc, a) => acc + a.amountKurus, 0);
  const advance = (amountKurus ?? 0) - allocated;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (amountKurus === null || amountKurus <= 0) return setError("Tutar sıfırdan büyük geçerli bir tutar olmalıdır (ör. 1.250,50).");
    if (parsed.error) return setError(parsed.error);
    if (allocated > amountKurus) return setError("Tahsis toplamı tahsilat tutarını aşıyor.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      await recordCustomerCollection(ctx, { customerId: party.id, method, amountKurus, note, allocations: parsed.allocations });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setBusy(false);
    }
  }

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <h3>Tahsilat al</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="col-amount">Tutar (₺) *</label>
        <input
          id="col-amount"
          className="form-input"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setManual(null);
          }}
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="col-method">Ödeme yöntemi</label>
        <select id="col-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
          ))}
        </select>
      </div>

      {items.length > 0 ? (
        <div className="stack stack-sm">
          <strong>Hangi borca sayılsın?</strong>
          <small style={{ color: "var(--text-muted)" }}>En eski borçtan başlayarak önerildi; tutarları değiştirebilirsiniz.</small>
          <AllocationFields items={items} values={values} onChange={setManual} />
          {amountKurus && amountKurus > 0 ? (
            <div className={`alert ${advance < 0 ? "alert-error" : "alert-warning"}`} role="status">
              {advance < 0
                ? `Tahsis toplamı ${money(-advance)} fazla.`
                : advance === 0
                  ? "Tahsilatın tamamı borçlara sayılacak."
                  : `${money(advance)} borca sayılmayacak; müşteri avansı olarak kalır.`}
            </div>
          ) : null}
        </div>
      ) : (
        <small style={{ color: "var(--text-muted)" }}>Açık borç kalemi yok; tutar müşteri avansı olarak yazılır.</small>
      )}

      <div className="form-group">
        <label className="form-label" htmlFor="col-note">Not</label>
        <input id="col-note" className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="row row-gap-md">
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone} disabled={busy}>Vazgeç</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </form>
  );
}
