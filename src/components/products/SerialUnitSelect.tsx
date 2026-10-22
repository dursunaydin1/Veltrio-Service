"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getInStockUnits, unitLabel } from "@/lib/serial/service";

/** Satılacak seri birimi seçtirir (yalnızca stoktaki birimler; makine satışı, AC-027). */
export function SerialUnitSelect({
  productId,
  value,
  onChange,
}: {
  productId: string;
  value: string;
  onChange: (unitId: string) => void;
}) {
  const units = useLiveQuery(() => getInStockUnits(productId), [productId]);

  return (
    <label className="form-group">
      <span className="form-label">Satılacak birim (seri no) *</span>
      <select className="form-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{units === undefined ? "Yükleniyor…" : units.length === 0 ? "Stokta birim yok" : "Birim seçin"}</option>
        {(units ?? []).map((u) => (
          <option key={u.id} value={u.id}>
            {unitLabel(u)}
            {u.serial_number && u.internal_number ? ` (${u.internal_number})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
