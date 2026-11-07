"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Service } from "@/lib/db";
import { useServiceContext } from "@/hooks/useServiceContext";
import { parseMoneyInput } from "@/lib/calc";
import { serviceGuide, suggestResolution } from "@/lib/services/guide";
import { getServiceLines } from "@/lib/services/quote";
import { approvalRequired, summarizeLines } from "@/lib/services/lines";
import { DEFAULT_APPROVAL_THRESHOLD } from "@/lib/services/service";
import { ChecklistIncompleteError, changeServiceStatus, getServiceBalance, updateServiceDetails } from "@/lib/services/service";
import {
  SERVICE_MAIN_NEXT,
  SERVICE_TRANSITIONS,
  isReopen,
  isServiceStatus,
  requiresReason,
  statusLabel,
  type ServiceStatus,
} from "@/lib/services/status";
import { formatCurrency } from "@/lib/utils";
import { OptionalField, OptionalGroup } from "@/components/common/OptionalField";
import { NO_CONTEXT_MESSAGE, errorMessage } from "@/lib/errors/message";
import { DetailTab, detailsOf } from "@/components/services/serviceDetailTabs";

/**
 * "Sonraki adım" kartı (K-084): üstte servisin adımları (teşhis, kalem, müşteri kararı, yapılan iş) tikli;
 * altta sıradaki iş kartın içinde yapılır: teşhis yazılır, kalem / karar için doğru sekmeye gidilir,
 * "İş tamamlandı"da yapılan iş (kalemlerden önerilen metinle) sorulur. Diğer durumlar küçük düğmelerdedir.
 */
export function StatusActions({ service, onGoTab }: { service: Service; onGoTab: (tab: DetailTab) => void }) {
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
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);
    if (!diagnosisText.trim()) return setError("Teşhisi yazın.");
    setBusy(true);
    setError(null);
    try {
      await updateServiceDetails(ctx, service.id, detailsOf(service, { diagnosis: diagnosisText }));
      await changeServiceStatus(ctx, service.id, "DIAGNOSED", undefined);
    } catch (e) {
      setError(errorMessage(e, "Kaydedilemedi."));
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
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);
    setBusy(true);
    setError(null);
    try {
      await updateServiceDetails(ctx, service.id, detailsOf(service, { resolution: resolutionText }));
    } catch (e) {
      setBusy(false);
      return setError(errorMessage(e, "Kaydedilemedi."));
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
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);
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
        setError(errorMessage(e, "Durum değiştirilemedi."));
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
        <div className="row row-gap-sm row-wrap">
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
          <div className="row row-gap-md mt-2">
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
                <small className="muted">Girilirse servis iptal olarak kalır ve sayaç artmaz; ücret müşteri bakiyesine yazılır.</small>
              </OptionalField>
            </OptionalGroup>
          ) : null}
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary grow" onClick={() => setPending(null)} disabled={busy}>Vazgeç</button>
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
            <small className="muted">Kalemlerden önerildi; düzeltebilirsiniz. Müşteriye verilen sonuç özetinde görünür.</small>
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary grow" onClick={() => setCompleting(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary grow" disabled={busy}>İşi tamamla</button>
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
            <div className="row row-gap-sm row-wrap">
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
