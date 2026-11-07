"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Service } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { updateServiceDetails } from "@/lib/services/service";
import { NO_CONTEXT_MESSAGE, errorMessage } from "@/lib/errors/message";
import { DetailTab } from "@/components/services/serviceDetailTabs";

/** İş başlamış mı: "Yapılan iş" alanı ancak o zaman anlamlıdır (K-082). */
export const WORK_STARTED = new Set(["IN_PROGRESS", "WAITING_PARTS", "COMPLETED", "DELIVERED"]);

/**
 * Servis bilgileri (Adım 3.17): şikâyet, teşhis, yapılan iş; altta kabulde girilen bilgiler (düzeltme / ekleme için).
 * Boş kabul alanları K-080'deki gibi "+ …" çipiyle açılır. Kaydedince sıradaki sekmeye geçilir:
 * iş başlamadıysa "İşlemler ve onay" (kalem ekle), başladıysa "Özet" (durumu ilerlet).
 */
export function DetailsForm({ service, onSaved }: { service: Service; onSaved: (next: DetailTab) => void }) {
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
    if (!ctx) return setError(NO_CONTEXT_MESSAGE);
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
      setError(errorMessage(e, "Kaydedilemedi."));
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
