"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MessageCircle, Phone } from "lucide-react";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { PartyBalancePanel } from "@/components/finance/PartyBalancePanel";
import { CustomerHistory } from "@/components/customers/CustomerHistory";
import { CustomerMachines } from "@/components/customers/CustomerMachines";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { setCustomerArchived } from "@/lib/customers/service";
import { telLink, whatsappLink } from "@/lib/utils/phone";
import { useAppNav } from "@/lib/nav/useAppNav";
import { confirmDialog } from "@/components/common/ConfirmDialog";
import { errorMessage } from "@/lib/errors/message";
import { PageHead } from "@/components/layout/PageHead";

/** Müşteri detay sayfası: ara / WhatsApp, düzenleme formu, arşivleme (Adım 3.2). */
export function CustomerEditor({ id }: { id: string }) {
  // Kaydedince form geçmişten çıkar; geri hareketi formu yeniden açmaz (K-076)
  const nav = useAppNav();
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
    if (!ctx || !(await confirmDialog({ title: question, confirmLabel: archived ? "Geri al" : "Arşivle" }))) return;
    setError(null);
    try {
      await setCustomerArchived(ctx, customer.id, !archived);
      nav.replace("/customers");
    } catch (e) {
      setError(errorMessage(e, "İşlem yapılamadı."));
    }
  }

  return (
    <div className="stack stack-lg">
      <PageHead title={customer.name} badge={archived ? <span className="badge badge-gray">Arşivde</span> : null} />

      {customer.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={customer.photo} alt="Müşteri fotoğrafı" style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, objectFit: "cover" }} />
      ) : null}

      {tel || whatsapp ? (
        <div className="row row-gap-md">
          {tel ? (
            <a href={tel} className="btn btn-secondary grow">
              <Phone size={18} aria-hidden="true" />
              Ara
            </a>
          ) : null}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-secondary grow">
              <MessageCircle size={18} aria-hidden="true" />
              WhatsApp&apos;ta aç
            </a>
          ) : null}
        </div>
      ) : null}

      <CustomerHistory customer={customer} />

      <CustomerMachines customer={customer} />

      <PartyBalancePanel kind="CUSTOMER" party={customer} />

      <CustomerForm key={`${customer.id}:${customer.version ?? 0}`} customer={customer} />

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <button type="button" className={`btn btn-full ${archived ? "btn-secondary" : "btn-danger"}`} onClick={toggleArchived}>
        {archived ? "Arşivden çıkar" : "Arşivle"}
      </button>
    </div>
  );
}
