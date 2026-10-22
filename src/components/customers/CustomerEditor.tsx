"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { MessageCircle, Phone } from "lucide-react";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { BalancePanel } from "@/components/customers/BalancePanel";
import { CustomerMachines } from "@/components/customers/CustomerMachines";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { setCustomerArchived } from "@/lib/customers/service";
import { telLink, whatsappLink } from "@/lib/utils/phone";

/** Müşteri detay sayfası: ara / WhatsApp, düzenleme formu, arşivleme (Adım 3.2). */
export function CustomerEditor({ id }: { id: string }) {
  const router = useRouter();
  const ctx = useBusinessContext();
  const [error, setError] = useState<string | null>(null);

  // Dizi dönmesi, "yükleniyor" (undefined) ile "bulunamadı" ([]) ayrımını sağlar.
  const found = useLiveQuery(() => db.customers.where("id").equals(id).toArray(), [id]);

  if (found === undefined) return null;
  if (found.length === 0) {
    return (
      <div className="alert alert-warning" role="alert">
        Müşteri bulunamadı. Başka bir cihazda silinmiş olabilir.
      </div>
    );
  }
  const customer = found[0];
  const archived = !!customer.archived_at;
  const tel = customer.phone ? telLink(customer.phone) : null;
  const whatsapp = customer.phone ? whatsappLink(customer.phone) : null;

  async function toggleArchived() {
    const question = archived
      ? "Bu müşteri arşivden çıkarılsın mı?"
      : "Bu müşteri arşivlensin mi? Geçmiş kayıtlar korunur; müşteri yeni işlemlerde listelenmez.";
    if (!ctx || !window.confirm(question)) return;
    setError(null);
    try {
      await setCustomerArchived(ctx, customer.id, !archived);
      router.push("/customers");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem yapılamadı.");
    }
  }

  return (
    <div className="stack stack-lg">
      <div className="row row-between">
        <h1>{customer.name}</h1>
        {archived ? <span className="badge badge-gray">Arşivde</span> : null}
      </div>

      {tel || whatsapp ? (
        <div className="row row-gap-md">
          {tel ? (
            <a href={tel} className="btn btn-secondary" style={{ flex: 1 }}>
              <Phone size={18} aria-hidden="true" />
              Ara
            </a>
          ) : null}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ flex: 1 }}>
              <MessageCircle size={18} aria-hidden="true" />
              WhatsApp&apos;ta aç
            </a>
          ) : null}
        </div>
      ) : null}

      <CustomerMachines customer={customer} />

      <BalancePanel customer={customer} />

      <CustomerForm key={`${customer.id}:${customer.version ?? 0}`} customer={customer} />

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <button type="button" className={`btn btn-full ${archived ? "btn-secondary" : "btn-danger"}`} onClick={toggleArchived}>
        {archived ? "Arşivden çıkar" : "Arşivle"}
      </button>
    </div>
  );
}
