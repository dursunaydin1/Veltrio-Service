"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Phone } from "lucide-react";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { PartyBalancePanel } from "@/components/finance/PartyBalancePanel";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { SupplierPurchases } from "@/components/suppliers/SupplierPurchases";
import { setSupplierArchived } from "@/lib/suppliers/service";
import { telLink } from "@/lib/utils/phone";

/** Tedarikçi detayı: ara, bakiye / ödemeler, düzenleme, arşivleme (Adım 4.5-4.7). */
export function SupplierEditor({ id }: { id: string }) {
  const router = useRouter();
  const ctx = useBusinessContext();
  const [error, setError] = useState<string | null>(null);

  const found = useLiveQuery(() => db.suppliers.where("id").equals(id).toArray(), [id]);

  if (found === undefined) return null;
  if (found.length === 0) {
    return (
      <div className="alert alert-warning" role="alert">
        Tedarikçi bulunamadı. Başka bir cihazda silinmiş olabilir.
      </div>
    );
  }
  const supplier = found[0];
  const archived = !!supplier.archived_at;
  const tel = supplier.phone ? telLink(supplier.phone) : null;

  async function toggleArchived() {
    const question = archived
      ? "Bu tedarikçi arşivden çıkarılsın mı?"
      : "Bu tedarikçi arşivlensin mi? Geçmiş alımlar ve ödemeler korunur.";
    if (!ctx || !window.confirm(question)) return;
    setError(null);
    try {
      await setSupplierArchived(ctx, supplier.id, !archived);
      router.push("/suppliers");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
    }
  }

  return (
    <div className="stack stack-lg">
      <div className="row row-between">
        <h1>{supplier.name}</h1>
        {archived ? <span className="badge badge-gray">Arşivde</span> : null}
      </div>

      {tel ? (
        <a href={tel} className="btn btn-secondary btn-full">
          <Phone size={18} aria-hidden="true" />
          Ara
        </a>
      ) : null}

      <PartyBalancePanel kind="SUPPLIER" party={supplier} />

      <SupplierPurchases supplier={supplier} />

      <SupplierForm key={`${supplier.id}:${supplier.updated_at}`} supplier={supplier} />

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <button type="button" className={`btn btn-full ${archived ? "btn-secondary" : "btn-danger"}`} onClick={toggleArchived}>
        {archived ? "Arşivden çıkar" : "Arşivle"}
      </button>
    </div>
  );
}
