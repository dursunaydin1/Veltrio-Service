"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Printer } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { machineTitleOf } from "@/lib/machines/title";
import { ServiceLines } from "@/components/services/ServiceLines";
import { DeliveryPanel, ServicePayments } from "@/components/services/ServicePayments";
import { ChecklistPanel } from "@/components/services/ChecklistPanel";
import { ServiceReturnPanel } from "@/components/services/ServiceReturnPanel";
import { StatusBadge } from "@/components/services/StatusBadge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { DetailTab } from "@/components/services/serviceDetailTabs";
import { StatusActions } from "@/components/services/ServiceStatusActions";
import { DetailsForm } from "@/components/services/ServiceDetailsForm";
import { DeliveredCard, History, ServiceProgress } from "@/components/services/ServiceDetailParts";

/** Servis detayı: özet, durum geçişleri, bilgiler (şikâyet / teşhis / yapılan iş) ve durum geçmişi (Adım 3.7, 3.17). */
export function ServiceDetail({ id }: { id: string }) {
  const [tab, setTab] = useState<DetailTab>("summary");
  // Kaydedince sıradaki sekmeye geçilir ve kısa bir onay görünür (K-082)
  const [flash, setFlash] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);
  function moveOn(next: DetailTab, message: string) {
    setTab(next);
    setFlash(message || null);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const afterDetailsSaved = (next: DetailTab) => moveOn(next, "Servis bilgileri kaydedildi.");
  const found = useLiveQuery(() => db.services.where("id").equals(id).toArray(), [id]);
  const related = useLiveQuery(async () => {
    const s = found?.[0];
    if (!s) return undefined;
    const [customer, machine] = await Promise.all([
      s.customer_id ? db.customers.get(s.customer_id) : undefined,
      s.machine_id ? db.machines.get(s.machine_id) : undefined,
    ]);
    return { customer, machine };
  }, [found]);

  if (found === undefined) return null;
  if (found.length === 0) {
    return (
      <div className="alert alert-warning" role="alert">
        Servis bulunamadı. Başka bir cihazda henüz eşitlenmemiş olabilir.
      </div>
    );
  }
  const service = found[0];

  return (
    <div className="stack stack-lg">
      <div className="card stack stack-md">
        <div className="stack gap-1" >
          <div className="row row-between gap-2" >
            <small style={{ color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.02em" }}>{service.document_no}</small>
            <span className="row row-gap-sm">
              {service.is_warranty_claim ? <span className="badge badge-yellow">Garanti</span> : null}
              <StatusBadge status={service.status} />
            </span>
          </div>
          <h1 style={{ fontSize: "1.375rem" }}>
            {related?.customer ? (
              <Link href={`/customers/${related.customer.id}`} style={{ color: "inherit" }}>{related.customer.name}</Link>
            ) : (
              "Müşterisiz servis"
            )}
          </h1>
          <p style={{ fontWeight: 500 }}>
            {related?.machine ? <Link href={`/machines/${related.machine.id}`}>{machineTitleOf(related.machine)}</Link> : "Makine bilgisi yok"}
          </p>
          <small className="muted">
            Kabul: {formatDateTime(service.received_date)}
            {service.promised_date ? ` · Teslim sözü: ${formatDate(service.promised_date)}` : ""}
            {service.deposit_amount > 0 ? ` · Kapora: ${formatCurrency(service.deposit_amount)}` : ""}
          </small>
        </div>
        <ServiceProgress status={service.status} />
        {service.intake_photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={service.intake_photo}
            alt="Kabul fotoğrafı"
            style={{ maxWidth: 220, maxHeight: 220, borderRadius: 12, objectFit: "cover" }}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : null}
        {service.status === "CANCELLED" && service.cancel_reason ? (
          <div className="alert alert-error" role="note">İptal nedeni: {service.cancel_reason}</div>
        ) : null}
        <div className="row row-gap-sm row-wrap" >
          <Link href={`/services/${service.id}/receipt?type=intake`} className="btn btn-secondary btn-sm">
            <Printer size={16} aria-hidden="true" />
            Kabul fişi
          </Link>
          <Link href={`/services/${service.id}/receipt?type=summary`} className="btn btn-secondary btn-sm">
            <FileText size={16} aria-hidden="true" />
            Sonuç özeti
          </Link>
        </div>
      </div>

      <div ref={tabsRef} role="tablist" aria-label="Servis bölümleri" className="sticky-tabs">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {flash ? <div className="alert alert-success" role="status">{flash}</div> : null}

      {tab === "summary" ? (
        <>
          {service.status === "DELIVERED" ? <DeliveredCard service={service} onCollect={() => moveOn("payments", "")} /> : null}
          <StatusActions service={service} onGoTab={(t) => moveOn(t, t === "lines" ? "Kalemleri ekleyin; bitince “Sıradaki adım”a dokunun." : "")} />
          <DeliveryPanel service={service} />
        </>
      ) : null}
      {tab === "details" ? (
        <DetailsForm key={`${service.id}:${service.version ?? 0}:${service.updated_at}`} service={service} onSaved={afterDetailsSaved} />
      ) : null}
      {tab === "lines" ? (
        <ServiceLines
          service={service}
          onApproved={() => moveOn("summary", "Müşteri kararı kaydedildi.")}
          onNext={() => moveOn("summary", "")}
        />
      ) : null}
      {tab === "checklist" ? <ChecklistPanel service={service} /> : null}
      {tab === "payments" ? (
        <>
          <ServicePayments service={service} onCollected={() => moveOn("summary", "Tahsilat kaydedildi.")} />
          <ServiceReturnPanel service={service} />
        </>
      ) : null}
      {tab === "history" ? <History serviceId={service.id} /> : null}
    </div>
  );
}

/** Servis detayı sekmeleri (Adım 3.17): onaylar “İşlemler ve parçalar” içinde, geçmiş ayrı sekmede. */
const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "summary", label: "Özet" },
  { id: "details", label: "Arıza ve teşhis" },
  { id: "lines", label: "İşlemler ve onay" },
  { id: "checklist", label: "Kontrol listesi" },
  { id: "payments", label: "Ödemeler" },
  { id: "history", label: "Geçmiş" },
];
