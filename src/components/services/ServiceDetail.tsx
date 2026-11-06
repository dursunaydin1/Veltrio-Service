"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Plus, Printer } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Service } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useServiceContext } from "@/hooks/useServiceContext";
import { machineTitle } from "@/components/machines/MachineList";
import { ServiceLines } from "@/components/services/ServiceLines";
import { DeliveryPanel, ServicePayments } from "@/components/services/ServicePayments";
import { parseMoneyInput } from "@/lib/calc";
import { ChecklistPanel } from "@/components/services/ChecklistPanel";
import { ServiceReturnPanel } from "@/components/services/ServiceReturnPanel";
import { StatusBadge } from "@/components/services/StatusBadge";
import { serviceGuide, suggestResolution } from "@/lib/services/guide";
import { getServiceLines } from "@/lib/services/quote";
import { approvalRequired, summarizeLines } from "@/lib/services/lines";
import { DEFAULT_APPROVAL_THRESHOLD } from "@/lib/services/service";
import { ChecklistIncompleteError, changeServiceStatus, getServiceBalance, updateServiceDetails } from "@/lib/services/service";
import {
  SERVICE_MAIN_NEXT,
  SERVICE_STAGES,
  SERVICE_TRANSITIONS,
  isReopen,
  serviceStage,
  isServiceStatus,
  requiresReason,
  statusLabel,
  type ServiceStatus,
} from "@/lib/services/status";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";

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
        <div className="stack" style={{ gap: 4 }}>
          <div className="row row-between" style={{ gap: 8 }}>
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
            {related?.machine ? <Link href={`/machines/${related.machine.id}`}>{machineTitle(related.machine)}</Link> : "Makine bilgisi yok"}
          </p>
          <small style={{ color: "var(--text-muted)" }}>
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
        <div className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
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

type DetailTab = "summary" | "details" | "lines" | "checklist" | "payments" | "history";

/** Servis detayı sekmeleri (Adım 3.17): onaylar “İşlemler ve parçalar” içinde, geçmiş ayrı sekmede. */
const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "summary", label: "Özet" },
  { id: "details", label: "Arıza ve teşhis" },
  { id: "lines", label: "İşlemler ve onay" },
  { id: "checklist", label: "Kontrol listesi" },
  { id: "payments", label: "Ödemeler" },
  { id: "history", label: "Geçmiş" },
];

/** Teslim edilmiş servisin özeti (K-085): ne zaman kime teslim edildi, ne tahsil edildi, borç kaldı mı. */
function DeliveredCard({ service, onCollect }: { service: Service; onCollect: () => void }) {
  const balance = useLiveQuery(() => getServiceBalance(service.id), [service.id]);
  const deliveredAt = useLiveQuery(async () => {
    const rows = await db.service_status_history.where("service_id").equals(service.id).toArray();
    return rows.filter((r) => r.to_status === "DELIVERED").sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0]?.changed_at;
  }, [service.id]);
  const remaining = Math.max(balance?.remaining ?? 0, 0);
  return (
    <section className="card stack stack-md" aria-labelledby="dv-title">
      <h2 id="dv-title">Teslim edildi</h2>
      <p>
        {deliveredAt ? formatDateTime(deliveredAt) : "—"}
        {service.delivered_to ? ` · Teslim alan: ${service.delivered_to}` : ""}
      </p>
      <div className="tile-grid">
        <div className="tile">
          <div className="tile-label">Tahsil edilen</div>
          <div className="tile-value">{formatCurrency((balance?.paid ?? 0) / 100)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Kalan borç</div>
          <div className="tile-value" style={remaining > 0 ? { color: "var(--warning-fg)" } : undefined}>{formatCurrency(remaining / 100)}</div>
        </div>
      </div>
      {remaining > 0 ? (
        <button type="button" className="btn btn-primary btn-full" onClick={onCollect}>
          Kalan borcu tahsil et
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

/** Servis için ortak "bilgileri kaydet" girdisi: yalnızca verilen alanlar değişir. */
function detailsOf(service: Service, patch: { diagnosis?: string; resolution?: string }) {
  return {
    customer_complaint: service.customer_complaint ?? "",
    diagnosis: patch.diagnosis ?? service.diagnosis ?? "",
    resolution: patch.resolution ?? service.resolution ?? "",
    promised_date: service.promised_date,
    existing_damage: service.existing_damage ?? "",
    received_accessories: service.received_accessories ?? "",
    is_warranty_claim: service.is_warranty_claim,
    warranty_source: service.warranty_source ?? "",
    warranty_coverage: service.warranty_coverage ?? "",
  };
}

/**
 * "Sonraki adım" kartı (K-084): üstte servisin adımları (teşhis, kalem, müşteri kararı, yapılan iş) tikli;
 * altta sıradaki iş kartın içinde yapılır: teşhis yazılır, kalem / karar için doğru sekmeye gidilir,
 * "İş tamamlandı"da yapılan iş (kalemlerden önerilen metinle) sorulur. Diğer durumlar küçük düğmelerdedir.
 */
function StatusActions({ service, onGoTab }: { service: Service; onGoTab: (tab: DetailTab) => void }) {
  const ctx = useServiceContext();
  const lines = useLiveQuery(() => getServiceLines(service.id), [service.id]);
  const [diagnosisText, setDiagnosisText] = useState(service.diagnosis ?? "");
  const [completing, setCompleting] = useState(false);
  const [resolutionText, setResolutionText] = useState("");
  const [pending, setPending] = useState<ServiceStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fee, setFee] = useState("");
  const [checklistWarning, setChecklistWarning] = useState<{ to: ServiceStatus; titles: string[] } | null>(null);
  const paid = useLiveQuery(() => getServiceBalance(service.id), [service.id])?.paid ?? 0;

  if (!isServiceStatus(service.status)) return null;
  const from = service.status;
  const allLines = [...(lines?.operations ?? []), ...(lines?.parts ?? [])];
  const quote = summarizeLines(allLines);
  const needsDecision = approvalRequired(quote.quote, ctx?.approvalThreshold ?? DEFAULT_APPROVAL_THRESHOLD) && quote.pendingCount > 0;
  const guide = serviceGuide({ status: from, diagnosis: service.diagnosis, lineCount: allLines.length, needsDecision });

  async function saveDiagnosis() {
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    if (!diagnosisText.trim()) return setError("Teşhisi yazın.");
    setBusy(true);
    setError(null);
    try {
      await updateServiceDetails(ctx, service.id, detailsOf(service, { diagnosis: diagnosisText }));
      await changeServiceStatus(ctx, service.id, "DIAGNOSED", undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    }
    setBusy(false);
  }

  function startCompleting() {
    const billed = (l: { status: string }) => l.status === "APPROVED" || l.status === "PENDING";
    setResolutionText(
      service.resolution ||
        suggestResolution(
          (lines?.operations ?? []).filter(billed).map((o) => o.description),
          (lines?.parts ?? []).filter(billed).map((p) => p.description_snapshot)
        )
    );
    setError(null);
    setCompleting(true);
  }

  async function complete() {
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    setError(null);
    try {
      await updateServiceDetails(ctx, service.id, detailsOf(service, { resolution: resolutionText }));
    } catch (e) {
      setBusy(false);
      return setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    }
    setBusy(false);
    setCompleting(false);
    await go("COMPLETED");
  }
  // "İş tamamlandı" → "Teslim edildi" geçişi teslim paneliyle (kalan bakiye, tahsilat) yapılır.
  const options = SERVICE_TRANSITIONS[from].filter((to) => !(from === "COMPLETED" && to === "DELIVERED"));
  if (options.length === 0) return null;
  const suggested = SERVICE_MAIN_NEXT[from];
  const main = suggested && options.includes(suggested) ? suggested : undefined;
  // İptal her zaman en sonda
  const others = options.filter((to) => to !== main).sort((a, b) => Number(a === "CANCELLED") - Number(b === "CANCELLED"));

  async function go(to: ServiceStatus, note?: string, ignoreChecklist = false) {
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    let diagnosticFeeKurus: number | undefined;
    if (to === "CANCELLED" && fee.trim() !== "") {
      const kurus = parseMoneyInput(fee);
      if (kurus === null || kurus < 0) return setError("İnceleme ücreti geçerli bir tutar olmalıdır.");
      diagnosticFeeKurus = kurus;
    }
    setBusy(true);
    setError(null);
    try {
      await changeServiceStatus(ctx, service.id, to, note, { ignoreChecklist, diagnosticFeeKurus });
      setPending(null);
      setReason("");
      setFee("");
      setChecklistWarning(null);
    } catch (e) {
      if (e instanceof ChecklistIncompleteError) {
        // Uyarı: kullanıcı onaylarsa zorunlu maddeler tamamlanmadan da devam edilir.
        setChecklistWarning({ to, titles: e.titles });
      } else {
        setError(e instanceof Error ? e.message : "Durum değiştirilemedi.");
      }
    }
    setBusy(false);
  }

  function choose(to: ServiceStatus) {
    if (requiresReason(from, to)) {
      setPending(to);
      setError(null);
    } else {
      void go(to);
    }
  }

  // Yapılacak iş yoksa (iş tamamlandı → teslim paneli; teslim edildi → bitti) kart çizilmez;
  // yeniden açma / iptal gibi seyrek işlemler katlanmış "Diğer işlemler" altında durur (K-085).
  if (!pending && !completing && !checklistWarning && !guide.task && !main) {
    return (
      <details className="more-actions">
        <summary>Diğer işlemler</summary>
        <div className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
          {others.map((to) => (
            <button
              key={to}
              type="button"
              className={`btn btn-sm ${to === "CANCELLED" ? "btn-danger-soft" : "btn-secondary"}`}
              onClick={() => choose(to)}
              disabled={busy}
            >
              {isReopen(from, to) ? "Yeniden aç" : to === "CANCELLED" ? "İptal et" : statusLabel(to)}
            </button>
          ))}
        </div>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      </details>
    );
  }

  return (
    <section className="card stack stack-md" aria-labelledby="st-title">
      <h2 id="st-title">Sonraki adım</h2>

      {checklistWarning ? (
        <div className="alert alert-warning" role="alert">
          <p>Tamamlanmamış zorunlu kontrol maddesi var: <strong>{checklistWarning.titles.join(", ")}</strong></p>
          <div className="row row-gap-md" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChecklistWarning(null)}>Geri dön</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void go(checklistWarning.to, undefined, true)}>
              Yine de tamamla
            </button>
          </div>
        </div>
      ) : null}

      {pending ? (
        <form
          className="stack stack-md"
          onSubmit={(e) => {
            e.preventDefault();
            void go(pending, reason);
          }}
        >
          <p>
            <strong>{statusLabel(from)}</strong> → <strong>{statusLabel(pending)}</strong>
          </p>
          {pending === "CANCELLED" && paid > 0 ? (
            <div className="alert alert-warning" role="note">
              Bu servise {formatCurrency(paid / 100)} tahsilat yapılmış. İptalde tutar müşteri alacağı olarak kalır;
              iade etmek için müşteri sayfasında “Müşteriye ödeme” kaydedin.
            </div>
          ) : null}
          <div className="form-group">
            <label className="form-label" htmlFor="st-reason">
              {pending === "CANCELLED" ? "İptal nedeni *" : isReopen(from, pending) ? "Yeniden açma nedeni *" : "Neden *"}
            </label>
            <input id="st-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          {pending === "CANCELLED" ? (
            <OptionalGroup>
              <OptionalField label="İnceleme / teşhis ücreti (₺)" chip="İnceleme ücreti" htmlFor="st-fee" filled={!!fee} onClear={() => setFee("")}>
                <input id="st-fee" className="form-input" inputMode="decimal" placeholder="0,00" value={fee} onChange={(e) => setFee(e.target.value)} />
                <small style={{ color: "var(--text-muted)" }}>Girilirse servis iptal olarak kalır ve sayaç artmaz; ücret müşteri bakiyesine yazılır.</small>
              </OptionalField>
            </OptionalGroup>
          ) : null}
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPending(null)} disabled={busy}>Vazgeç</button>
            <button type="submit" className={`btn ${pending === "CANCELLED" ? "btn-danger" : "btn-primary"}`} style={{ flex: 1 }} disabled={busy}>
              Onayla
            </button>
          </div>
        </form>
      ) : completing ? (
        <form
          className="stack stack-md"
          onSubmit={(e) => {
            e.preventDefault();
            void complete();
          }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="st-resolution">Yapılan iş</label>
            <textarea id="st-resolution" className="form-input" rows={3} value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} autoFocus />
            <small style={{ color: "var(--text-muted)" }}>Kalemlerden önerildi; düzeltebilirsiniz. Müşteriye verilen sonuç özetinde görünür.</small>
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCompleting(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>İşi tamamla</button>
          </div>
        </form>
      ) : (
        <>
          {guide.task === "diagnosis" ? (
            <div className="stack stack-sm">
              <label className="form-label" htmlFor="st-diagnosis">Teşhis ne?</label>
              <textarea id="st-diagnosis" className="form-input" rows={2} placeholder="Ör. hava filtresi tıkalı, misina kafası aşınmış" value={diagnosisText} onChange={(e) => setDiagnosisText(e.target.value)} />
              <button type="button" className="btn btn-primary btn-lg btn-full" onClick={() => void saveDiagnosis()} disabled={busy}>
                Teşhisi kaydet
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          ) : guide.task === "lines" ? (
            <div className="stack stack-sm">
              <p>Şimdi yapılacak işçiliği ve gereken parçaları ekleyin.</p>
              <button type="button" className="btn btn-primary btn-lg btn-full" onClick={() => onGoTab("lines")}>
                İşçilik / parça ekle
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          ) : guide.task === "approval" ? (
            <div className="stack stack-sm">
              <p>Teklif hazır: {formatCurrency(quote.quote / 100)}. İşe başlamadan müşterinin kararını kaydedin.</p>
              <button type="button" className="btn btn-primary btn-lg btn-full" onClick={() => onGoTab("lines")}>
                Müşteri kararını kaydet
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          ) : guide.task === "complete" ? (
            <button type="button" className="btn btn-primary btn-lg btn-full" onClick={startCompleting} disabled={busy}>
              İş tamamlandı
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : main ? (
            <button type="button" className="btn btn-primary btn-lg btn-full" onClick={() => choose(main)} disabled={busy}>
              {statusLabel(main)}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : null}
          {others.length > 0 ? (
            <div className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
              {others.map((to) => (
                <button
                  key={to}
                  type="button"
                  className={`btn btn-sm ${to === "CANCELLED" ? "btn-danger-soft" : "btn-secondary"}`}
                  onClick={() => choose(to)}
                  disabled={busy}
                >
                  {isReopen(from, to) ? "Yeniden aç" : to === "CANCELLED" ? "İptal et" : statusLabel(to)}
                </button>
              ))}
            </div>
          ) : null}
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        </>
      )}
    </section>
  );
}

/** İş başlamış mı: "Yapılan iş" alanı ancak o zaman anlamlıdır (K-082). */
const WORK_STARTED = new Set(["IN_PROGRESS", "WAITING_PARTS", "COMPLETED", "DELIVERED"]);

/**
 * Servis bilgileri (Adım 3.17): şikâyet, teşhis, yapılan iş; altta kabulde girilen bilgiler (düzeltme / ekleme için).
 * Boş kabul alanları K-080'deki gibi "+ …" çipiyle açılır. Kaydedince sıradaki sekmeye geçilir:
 * iş başlamadıysa "İşlemler ve onay" (kalem ekle), başladıysa "Özet" (durumu ilerlet).
 */
function DetailsForm({ service, onSaved }: { service: Service; onSaved: (next: DetailTab) => void }) {
  const ctx = useBusinessContext();
  const [complaint, setComplaint] = useState(service.customer_complaint ?? "");
  const [diagnosis, setDiagnosis] = useState(service.diagnosis ?? "");
  const [resolution, setResolution] = useState(service.resolution ?? "");
  const [promised, setPromised] = useState(service.promised_date ?? "");
  const [damage, setDamage] = useState(service.existing_damage ?? "");
  const [accessories, setAccessories] = useState(service.received_accessories ?? "");
  const [warranty, setWarranty] = useState(service.is_warranty_claim);
  const [wSource, setWSource] = useState(service.warranty_source ?? "");
  const [wCoverage, setWCoverage] = useState(service.warranty_coverage ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDamage, setShowDamage] = useState(!!service.existing_damage);
  const [showAcc, setShowAcc] = useState(!!service.received_accessories);

  const locked = service.status === "CANCELLED";
  const started = WORK_STARTED.has(service.status);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");
    setBusy(true);
    setError(null);
    try {
      await updateServiceDetails(ctx, service.id, {
        customer_complaint: complaint,
        diagnosis,
        resolution,
        promised_date: promised || undefined,
        existing_damage: damage,
        received_accessories: accessories,
        is_warranty_claim: warranty,
        warranty_source: wSource,
        warranty_coverage: wCoverage,
      });
      onSaved(started ? "summary" : "lines");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    }
    setBusy(false);
  }

  return (
    <form className="card stack stack-md" onSubmit={submit} noValidate aria-labelledby="dt-title">
      <h2 id="dt-title">Servis bilgileri</h2>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-complaint">Müşteri şikâyeti *</label>
        <textarea id="dt-complaint" className="form-input" rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} disabled={locked} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-diagnosis">Teşhis</label>
        <textarea id="dt-diagnosis" className="form-input" rows={3} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} disabled={locked} />
      </div>
      {started || resolution ? (
        <div className="form-group">
          <label className="form-label" htmlFor="dt-resolution">Yapılan iş</label>
          <textarea id="dt-resolution" className="form-input" rows={3} placeholder="Ör. karbüratör temizlendi, zincir değişti" value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={locked} />
          <small style={{ color: "var(--text-muted)" }}>İş bitince yazın; müşteriye verilen sonuç özetinde görünür.</small>
        </div>
      ) : null}
      <div className="toggle-card">
        <label className="toggle-row">
          <span>
            <strong>Garanti talebi</strong>
            <small>Makine garantide mi?</small>
          </span>
          <input type="checkbox" className="switch" checked={warranty} onChange={(e) => setWarranty(e.target.checked)} disabled={locked} />
        </label>
        {warranty ? (
          <div className="stack stack-sm">
            <div className="form-group">
              <label className="form-label" htmlFor="dt-wsource">Garanti kaynağı</label>
              <input id="dt-wsource" className="form-input" value={wSource} onChange={(e) => setWSource(e.target.value)} disabled={locked} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="dt-wcoverage">Kapsam açıklaması</label>
              <input id="dt-wcoverage" className="form-input" value={wCoverage} onChange={(e) => setWCoverage(e.target.value)} disabled={locked} />
            </div>
          </div>
        ) : null}
      </div>

      <h3 className="form-section-title">Kabul bilgileri</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="dt-promised">Teslim sözü</label>
        <input id="dt-promised" className="form-input" type="date" value={promised} onChange={(e) => setPromised(e.target.value)} disabled={locked} />
      </div>
      {showDamage ? (
        <div className="form-group extra-field">
          <label className="form-label" htmlFor="dt-damage">Mevcut hasar / çizikler</label>
          <input id="dt-damage" className="form-input" autoFocus={!service.existing_damage} value={damage} onChange={(e) => setDamage(e.target.value)} disabled={locked} />
        </div>
      ) : null}
      {showAcc ? (
        <div className="form-group extra-field">
          <label className="form-label" htmlFor="dt-acc">Teslim alınan aksesuarlar</label>
          <input id="dt-acc" className="form-input" autoFocus={!service.received_accessories} value={accessories} onChange={(e) => setAccessories(e.target.value)} disabled={locked} />
        </div>
      ) : null}
      {!locked && (!showDamage || !showAcc) ? (
        <div className="chip-group">
          {!showDamage ? (
            <button type="button" className="chip chip-add" onClick={() => setShowDamage(true)}>
              <Plus size={16} aria-hidden="true" /> Hasar / çizik
            </button>
          ) : null}
          {!showAcc ? (
            <button type="button" className="chip chip-add" onClick={() => setShowAcc(true)}>
              <Plus size={16} aria-hidden="true" /> Aksesuar
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {!locked ? (
        <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      ) : null}
    </form>
  );
}

function History({ serviceId }: { serviceId: string }) {
  const rows = useLiveQuery(async () => {
    const all = await db.service_status_history.where("service_id").equals(serviceId).toArray();
    return all.sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  }, [serviceId]);

  return (
    <section className="card stack stack-md" aria-labelledby="hs-title">
      <h2 id="hs-title">Durum geçmişi</h2>
      {rows === undefined ? null : (
        <ul className="menu-list" aria-label="Durum geçmişi">
          {rows.map((h) => (
            <li key={h.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
              <strong>
                {h.from_status ? `${statusLabel(h.from_status)} → ` : ""}
                {statusLabel(h.to_status)}
              </strong>
              <small style={{ color: "var(--text-muted)" }}>
                {formatDateTime(h.changed_at)}
                {h.note ? ` · ${h.note}` : ""}
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Servisin hangi aşamada olduğunu gösteren beş adımlı ilerleme çubuğu. */
function ServiceProgress({ status }: { status: string }) {
  const stage = serviceStage(status);
  if (stage < 0) return null;
  return (
    <ol className="progress-steps" aria-label={`Aşama: ${SERVICE_STAGES[stage]}`}>
      {SERVICE_STAGES.map((label, i) => (
        <li key={label} data-state={i < stage ? "done" : i === stage ? "current" : "todo"} aria-current={i === stage ? "step" : undefined}>
          <span className="progress-bar" aria-hidden="true" />
          <span className="progress-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
