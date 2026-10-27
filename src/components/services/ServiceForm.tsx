"use client";

import { PhotoField } from "@/components/common/PhotoField";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, CircleHelp, Cog, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { machineTitle } from "@/components/machines/MachineList";
import { parseMoneyInput } from "@/lib/calc";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import { getMachineServiceSummary, openService } from "@/lib/services/service";
import { statusLabel } from "@/lib/services/status";
import {
  PROMISE_SHORTCUTS,
  SERVICE_WIZARD_STEPS,
  UNKNOWN_MACHINE,
  addDaysToLocalDate,
  hasIssue,
  initialWizardStep,
  toggleIssue,
  wizardStepError,
} from "@/lib/services/wizard";
import { formatDate, todayLocalDate } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

/** Sık arıza başlıkları (PRD §8.1); dokunulunca şikâyet metnine eklenir. */
export const ISSUE_CATEGORIES = [
  "Çalışmıyor",
  "Zor çalışıyor",
  "Güç kaybı",
  "Stop ediyor",
  "Yakıt kaçağı",
  "Yağlama sorunu",
  "Titreşim / ses",
  "Kesmiyor / biçmiyor",
  "Parça kırığı / hasarı",
  "Bakım talebi",
] as const;

/**
 * Yeni servis kabulü (§5.1, Adım 3.6) — telefon için adım adım (K-044):
 * 1) müşteri, 2) makine, 3) şikâyet, 4) isteğe bağlı kabul bilgileri ve özet.
 * Seçim yapılan adımlar (müşteri, makine) dokununca kendiliğinden ilerler.
 */
export function ServiceForm({
  initialCustomerId = "",
  initialMachineId = "",
}: {
  initialCustomerId?: string;
  initialMachineId?: string;
}) {
  const router = useRouter();
  const ctx = useBusinessContext();

  const [step, setStep] = useState(() => initialWizardStep({ customerId: initialCustomerId, machineId: initialMachineId }));
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [machineId, setMachineId] = useState(initialMachineId);
  const [tempType, setTempType] = useState("");
  const [complaint, setComplaint] = useState("");
  const [damage, setDamage] = useState("");
  const [accessories, setAccessories] = useState("");
  const [promised, setPromised] = useState("");
  const [depositOn, setDepositOn] = useState(false);
  const [deposit, setDeposit] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [warrantyOn, setWarrantyOn] = useState(false);
  const [warrantySource, setWarrantySource] = useState("");
  const [warrantyCoverage, setWarrantyCoverage] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hızlı arıza seçimi: etkin arıza kataloğu varsa o, yoksa varsayılan başlıklar (Adım 3.5)
  const issueCatalog = useLiveQuery(
    () => (ctx ? db.issue_catalog.where("business_id").equals(ctx.businessId).filter((i) => i.active).toArray() : []),
    [ctx?.businessId]
  );
  const issueLabels = issueCatalog && issueCatalog.length > 0 ? issueCatalog.map((i) => i.name).sort((a, b) => a.localeCompare(b, "tr")) : ISSUE_CATEGORIES;
  const customer = useLiveQuery(() => (customerId ? db.customers.get(customerId) : undefined), [customerId]);
  const machines = useLiveQuery(
    () =>
      customerId
        ? db.machines
            .where("customer_id")
            .equals(customerId)
            .filter((m) => !m.archived_at && !m.merged_into_id)
            .toArray()
        : [],
    [customerId]
  );
  const selectedMachine = machines?.find((m) => m.id === machineId);
  const summary = useLiveQuery(
    () => (machineId && machineId !== UNKNOWN_MACHINE ? getMachineServiceSummary(machineId) : undefined),
    [machineId]
  );

  const state = { customerId, machineId, tempType, complaint };
  const last = SERVICE_WIZARD_STEPS.length - 1;
  const today = todayLocalDate();

  function goTo(next: number) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function next() {
    const problem = wizardStepError(step, state);
    if (problem) return setError(problem);
    goTo(step + 1);
  }

  function pickCustomer(id: string) {
    setCustomerId(id);
    setMachineId("");
    if (id) goTo(1);
  }

  function pickMachine(id: string) {
    setMachineId(id);
    if (id !== UNKNOWN_MACHINE) goTo(2);
  }

  async function submit() {
    const problem = wizardStepError(last, state);
    if (problem) return setError(problem);

    let depositInput: { amountKurus: number; method: PaymentMethod } | undefined;
    if (depositOn) {
      const kurus = parseMoneyInput(deposit);
      if (kurus === null || kurus <= 0) return setError("Kapora tutarı sıfırdan büyük geçerli bir tutar olmalıdır.");
      depositInput = { amountKurus: kurus, method };
    }
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
    setError(null);
    try {
      const service = await openService(ctx, {
        customerId,
        machineId: machineId === UNKNOWN_MACHINE ? undefined : machineId,
        temporaryMachineType: machineId === UNKNOWN_MACHINE ? tempType : undefined,
        complaint,
        existingDamage: damage,
        accessories,
        promisedDate: promised || undefined,
        deposit: depositInput,
        photo,
        warranty: warrantyOn ? { source: warrantySource, coverage: warrantyCoverage } : undefined,
      });
      router.push(`/services/${service.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Servis açılamadı.");
      setBusy(false);
    }
  }

  const machineLabel =
    machineId === UNKNOWN_MACHINE ? tempType.trim() || "Kayıtsız makine" : selectedMachine ? machineTitle(selectedMachine) : undefined;

  return (
    <div className="wizard">
      <header className="wizard-head">
        <div className="row row-gap-sm">
          {step > 0 ? (
            <button type="button" className="icon-btn" aria-label="Önceki adım" onClick={() => goTo(step - 1)}>
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
          ) : (
            <Link href="/services" className="icon-btn" aria-label="Vazgeç">
              <ArrowLeft size={22} aria-hidden="true" />
            </Link>
          )}
          <div className="stack" style={{ gap: 0, minWidth: 0 }}>
            <small style={{ color: "var(--text-muted)", fontWeight: 600 }}>
              Yeni servis · Adım {step + 1}/{SERVICE_WIZARD_STEPS.length}
            </small>
            <strong style={{ fontSize: "1.125rem" }}>{SERVICE_WIZARD_STEPS[step]}</strong>
          </div>
        </div>
        <div className="wizard-progress" aria-hidden="true">
          {SERVICE_WIZARD_STEPS.map((label, i) => (
            <span key={label} data-done={i <= step ? "" : undefined} />
          ))}
        </div>
      </header>

      {/* Önceki adımlarda seçilenler: dokununca o adıma dönülür */}
      {step > 0 ? (
        <div className="wizard-chips">
          {customer ? (
            <button type="button" className="chip" onClick={() => goTo(0)}>
              <Check size={14} aria-hidden="true" />
              {customer.name}
            </button>
          ) : null}
          {step > 1 && machineLabel ? (
            <button type="button" className="chip" onClick={() => goTo(1)}>
              <Check size={14} aria-hidden="true" />
              {machineLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="wizard-body">
        {step === 0 ? (
          <>
            <h1 className="wizard-question">Makineyi kim getirdi?</h1>
            <CustomerPicker value={customerId} onChange={pickCustomer} label="Müşteri" />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 className="wizard-question">Hangi makine?</h1>
            <div className="choice-list" role="radiogroup" aria-label="Müşterinin makineleri">
              {(machines ?? []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={machineId === m.id}
                  className="choice"
                  onClick={() => pickMachine(m.id)}
                >
                  <span className="choice-icon"><Cog size={20} aria-hidden="true" /></span>
                  <span className="choice-text">
                    <strong>{machineTitle(m)}</strong>
                    <small>{[m.type, m.serial_number ?? m.internal_number].filter(Boolean).join(" · ") || "Ayrıntı yok"}</small>
                  </span>
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={machineId === UNKNOWN_MACHINE}
                className="choice"
                onClick={() => pickMachine(UNKNOWN_MACHINE)}
              >
                <span className="choice-icon"><CircleHelp size={20} aria-hidden="true" /></span>
                <span className="choice-text">
                  <strong>Makine kayıtlı değil</strong>
                  <small>Geçici kayıt açılır, bilgileri sonra tamamlarsınız</small>
                </span>
              </button>
            </div>
            {machineId === UNKNOWN_MACHINE ? (
              <div className="form-group">
                <label className="form-label" htmlFor="sv-temp">Makine türü *</label>
                <input
                  id="sv-temp"
                  className="form-input"
                  placeholder="Ör. Zincirli testere"
                  value={tempType}
                  onChange={(e) => setTempType(e.target.value)}
                  autoFocus
                />
              </div>
            ) : null}
            <Link href={`/machines/new?customer=${customerId}`} className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>
              <Plus size={16} aria-hidden="true" />
              Makineyi kalıcı olarak kaydet
            </Link>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 className="wizard-question">Sorun ne?</h1>
            {summary && summary.completedCount > 0 ? (
              <div className="alert alert-info" role="note">
                Bu makinede {summary.completedCount} tamamlanmış servis var
                {summary.lastService
                  ? ` · son: ${formatDate(summary.lastService.received_date)} (${statusLabel(summary.lastService.status)})`
                  : ""}
                .
              </div>
            ) : null}
            <div className="chip-group" aria-label="Sık arızalar">
              {issueLabels.map((label) => {
                const on = hasIssue(complaint, label);
                return (
                  <button
                    key={label}
                    type="button"
                    className="chip chip-toggle"
                    aria-pressed={on}
                    onClick={() => setComplaint((c) => toggleIssue(c, label))}
                  >
                    {on ? <Check size={14} aria-hidden="true" /> : null}
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sv-complaint">Müşterinin anlattığı</label>
              <textarea
                id="sv-complaint"
                className="form-input"
                rows={4}
                placeholder="Seçtikleriniz buraya eklenir; isterseniz ayrıntı yazın."
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
              />
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h1 className="wizard-question">Son bir kaç bilgi</h1>
            <p style={{ marginTop: -8 }}>Hepsi isteğe bağlı. Boş bırakıp servisi açabilirsiniz.</p>

            <div className="form-group">
              <span className="form-label">Ne zaman teslim edilecek?</span>
              <div className="chip-group">
                {PROMISE_SHORTCUTS.map(({ label, days }) => {
                  const value = addDaysToLocalDate(today, days);
                  return (
                    <button
                      key={label}
                      type="button"
                      className="chip chip-toggle"
                      aria-pressed={promised === value}
                      onClick={() => setPromised(promised === value ? "" : value)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <input
                id="sv-promised"
                className="form-input"
                type="date"
                aria-label="Teslim sözü tarihi"
                value={promised}
                onChange={(e) => setPromised(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="sv-damage">Mevcut hasar / çizikler</label>
              <input id="sv-damage" className="form-input" value={damage} onChange={(e) => setDamage(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sv-acc">Teslim alınan aksesuarlar</label>
              <input id="sv-acc" className="form-input" placeholder="Ör. zincir kılıfı, bıçak" value={accessories} onChange={(e) => setAccessories(e.target.value)} />
            </div>
            <PhotoField label="Kabul fotoğrafı" value={photo} onChange={setPhoto} />

            <div className="toggle-card">
              <label className="toggle-row">
                <span>
                  <strong>Garanti talebi</strong>
                  <small>Makine garantide mi?</small>
                </span>
                <input type="checkbox" className="switch" checked={warrantyOn} onChange={(e) => setWarrantyOn(e.target.checked)} />
              </label>
              {warrantyOn ? (
                <div className="stack stack-sm">
                  {selectedMachine?.warranty_until ? (
                    <div className={`alert ${selectedMachine.warranty_until < today ? "alert-warning" : "alert-success"}`} role="note">
                      Makine kartında garanti bitişi: {formatDate(selectedMachine.warranty_until + "T00:00:00")}
                      {selectedMachine.warranty_until < today ? " (süresi geçmiş görünüyor)" : ""}. Bu bilgi yalnızca bilgilendirmedir; kapsamı siz doğrulayın.
                    </div>
                  ) : null}
                  <div className="form-group">
                    <label className="form-label" htmlFor="sv-wsource">Garanti kaynağı</label>
                    <input id="sv-wsource" className="form-input" placeholder="Ör. üretici, bayi, satış garantisi" value={warrantySource} onChange={(e) => setWarrantySource(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="sv-wcoverage">Kapsam açıklaması</label>
                    <input id="sv-wcoverage" className="form-input" value={warrantyCoverage} onChange={(e) => setWarrantyCoverage(e.target.value)} />
                  </div>
                  <small style={{ color: "var(--text-muted)" }}>Garanti kapsamındaki kalemlerin fiyatını 0 girebilirsiniz; kullanılan parça yine stoktan düşer ve maliyeti kaydedilir.</small>
                </div>
              ) : null}
            </div>

            <div className="toggle-card">
              <label className="toggle-row">
                <span>
                  <strong>Kapora alındı</strong>
                  <small>Ön ödeme müşteri bakiyesine yazılır</small>
                </span>
                <input type="checkbox" className="switch" checked={depositOn} onChange={(e) => setDepositOn(e.target.checked)} />
              </label>
              {depositOn ? (
                <div className="row row-gap-md">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" htmlFor="sv-dep">Tutar (₺)</label>
                    <input id="sv-dep" className="form-input" inputMode="decimal" placeholder="0,00" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" htmlFor="sv-method">Yöntem</label>
                    <select id="sv-method" className="form-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                      {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                        <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="summary-card" aria-label="Özet">
              <div><small>Müşteri</small><strong>{customer?.name ?? "—"}</strong></div>
              <div><small>Makine</small><strong>{machineLabel ?? "—"}</strong></div>
              <div><small>Şikâyet</small><strong>{complaint || "—"}</strong></div>
            </div>
          </>
        ) : null}

        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      </div>

      <div className="wizard-footer">
        {step < last ? (
          <button type="button" className="btn btn-primary btn-lg btn-full" onClick={next}>
            Devam
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg btn-full" onClick={() => void submit()} disabled={busy}>
            {busy ? "Açılıyor…" : "Servisi aç"}
          </button>
        )}
      </div>
    </div>
  );
}
