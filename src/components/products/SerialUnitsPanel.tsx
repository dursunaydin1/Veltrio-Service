"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { parseMoneyInput } from "@/lib/calc";
import { addOpeningSerialUnit, getSerialUnits, unitLabel } from "@/lib/serial/service";
import { formatDate } from "@/lib/utils";
import type { Product, SerialUnitStatus } from "@/types";

const STATUS_LABEL: Record<SerialUnitStatus, string> = {
  IN_STOCK: "Stokta",
  SOLD: "Satıldı",
  DAMAGED: "Hasarlı",
  RETURNED: "İade edildi",
  RETURNED_TO_SUPPLIER: "Tedarikçiye iade",
};
const STATUS_BADGE: Record<SerialUnitStatus, string> = {
  IN_STOCK: "badge-green",
  SOLD: "badge-gray",
  DAMAGED: "badge-red",
  RETURNED: "badge-yellow",
  RETURNED_TO_SUPPLIER: "badge-gray",
};

/**
 * Seri takipli ürünün birimleri (Adım 2.2): her fiziksel makine ayrı kayıt.
 * Stok = "stokta" birim sayısı; birimler alımla ya da açılış stoğu olarak eklenir.
 */
export function SerialUnitsPanel({ product }: { product: Product }) {
  const ctx = useBusinessContext();
  const units = useLiveQuery(() => getSerialUnits(product.id), [product.id]);
  const [open, setOpen] = useState(false);
  const [serial, setSerial] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inStock = (units ?? []).filter((u) => u.status === "IN_STOCK").length;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const costKurus = cost.trim() === "" ? undefined : parseMoneyInput(cost);
    if (costKurus === null) return setError("Birim maliyet geçerli bir tutar olmalıdır.");
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    try {
      await addOpeningSerialUnit(ctx, {
        productId: product.id,
        serialNumber: serial,
        unitCost: costKurus === undefined ? undefined : costKurus / 100,
      });
      setSerial("");
      setCost("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Birim eklenemedi.");
    }
    setBusy(false);
  }

  return (
    <section className="card stack stack-md" aria-labelledby="su-title">
      <h2 id="su-title">Seri birimler</h2>
      <div className="tile">
        <div className="tile-label">Stokta</div>
        <div className="tile-value">{inStock} adet</div>
      </div>
      <p>
        Bu ürün seri numarasıyla takip edilir: her makine ayrı bir birimdir. Birimler satın alma sırasında oluşur; elinizde
        zaten olan makineleri aşağıdan açılış stoğu olarak ekleyebilirsiniz.
      </p>

      {open ? (
        <form className="stack stack-md" onSubmit={submit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="su-serial">Seri numarası</label>
            <input id="su-serial" className="form-input" placeholder="Boşsa iç numarayla (SB-…) tanınır" value={serial} onChange={(e) => setSerial(e.target.value)} autoFocus autoComplete="off" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="su-cost">Birim maliyet (₺)</label>
            <input id="su-cost" className="form-input" inputMode="decimal" placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Ekleniyor…" : "Birimi ekle"}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>
          Açılış stoğu: birim ekle
        </button>
      )}

      {units === undefined ? null : units.length === 0 ? (
        <p>Henüz birim yok.</p>
      ) : (
        <ul className="menu-list" aria-label="Seri birimler">
          {units.map((u) => (
            <li key={u.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
              <span className="row row-between">
                <strong>{unitLabel(u)}</strong>
                <span className={`badge ${STATUS_BADGE[u.status]}`}>{STATUS_LABEL[u.status]}</span>
              </span>
              <small style={{ color: "var(--text-muted)" }}>
                {u.serial_number && u.internal_number ? `${u.internal_number} · ` : ""}
                {formatDate(u.created_at)}
                {u.machine_id ? (
                  <>
                    {" · "}
                    <Link href={`/machines/${u.machine_id}`}>Makine kaydı</Link>
                  </>
                ) : null}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
