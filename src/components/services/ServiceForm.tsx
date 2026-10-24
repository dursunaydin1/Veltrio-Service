"use client";

import { PhotoField } from "@/components/common/PhotoField";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { machineTitle } from "@/components/machines/MachineList";
import { parseMoneyInput } from "@/lib/calc";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import { getMachineServiceSummary, openService } from "@/lib/services/service";
import { statusLabel } from "@/lib/services/status";
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

const UNKNOWN_MACHINE = "__unknown__";

/** Yeni servis kabul formu (§5.1, Adım 3.6): müşteri → makine → şikâyet → kabul bilgileri. */
export function ServiceForm({
  initialCustomerId = "",
  initialMachineId = "",
}: {
  initialCustomerId?: string;
  initialMachineId?: string;
}) {
  const router = useRouter();
  const ctx = useBusinessContext();

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

  function pickCustomer(id: string) {
    setCustomerId(id);
    setMachineId("");
  }

  function addIssue(label: string) {
    setComplaint((c) => (c.toLocaleLowerCase("tr").includes(label.toLocaleLowerCase("tr")) ? c : c ? `${c}, ${label}` : label));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!customerId) return setError("Müşteri seçin.");
    if (!machineId) return setError("Makine seçin veya “Makine bilinmiyor” seçeneğini işaretleyin.");
    if (machineId === UNKNOWN_MACHINE && !tempType.trim()) return setError("Makine türünü yazın (ör. Zincirli testere).");
    if (!complaint.trim()) return setError("Müşteri şikâyetini yazın.");

    let depositInput: { amountKurus: number; method: PaymentMethod } | undefined;
    if (depositOn) {
      const kurus = parseMoneyInput(deposit);
      if (kurus === null || kurus <= 0) return setError("Kapora tutarı sıfırdan büyük geçerli bir tutar olmalıdır.");
      depositInput = { amountKurus: kurus, method };
    }
    if (!ctx) return setError("Cihaz bilgisi henüz yüklenmedi, lütfen tekrar deneyin.");

    setBusy(true);
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

  return (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <CustomerPicker value={customerId} onChange={pickCustomer} />

      {customerId ? (
        <fieldset className="stack stack-sm" style={{ border: 0, padding: 0 }}>
          <legend className="form-label">Makine *</legend>
          {machines === undefined ? null : (
            <ul className="menu-list" aria-label="Müşterinin makineleri">
              {machines.map((m) => (
                <li key={m.id}>
                  <label className="row row-gap-sm" style={{ minHeight: 44, cursor: "pointer" }}>
                    <input type="radio" name="machine" checked={machineId === m.id} onChange={() => setMachineId(m.id)} />
                    <span>
                      <strong>{machineTitle(m)}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>
                        {[m.type, m.serial_number ?? m.internal_number].filter(Boolean).join(" · ")}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
              <li>
                <label className="row row-gap-sm" style={{ minHeight: 44, cursor: "pointer" }}>
                  <input type="radio" name="machine" checked={machineId === UNKNOWN_MACHINE} onChange={() => setMachineId(UNKNOWN_MACHINE)} />
                  Makine bilinmiyor / kayıtlı değil (geçici kayıt aç)
                </label>
              </li>
            </ul>
          )}
          {machines && machines.length === 0 ? (
            <p>
              Bu müşteriye kayıtlı makine yok. Aşağıdan geçici kayıt açabilir ya da{" "}
              <Link href={`/machines/new?customer=${customerId}`}>makine ekleyebilirsiniz</Link>.
            </p>
          ) : null}

          {machineId === UNKNOWN_MACHINE ? (
            <div className="form-group">
              <label className="form-label" htmlFor="sv-temp">Makine türü *</label>
              <input id="sv-temp" className="form-input" placeholder="Ör. Zincirli testere" value={tempType} onChange={(e) => setTempType(e.target.value)} />
            </div>
          ) : null}

          {summary ? (
            <p>
              Bu makinede tamamlanan servis: <strong>{summary.completedCount}</strong>
              {summary.lastService
                ? ` · Son servis: ${formatDate(summary.lastService.received_date)} (${statusLabel(summary.lastService.status)})`
                : ""}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="form-group">
        <span className="form-label">Müşteri şikâyeti *</span>
        <div className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
          {issueLabels.map((label) => (
            <button key={label} type="button" className="btn btn-secondary btn-sm" onClick={() => addIssue(label)}>
              {label}
            </button>
          ))}
        </div>
        <textarea
          className="form-input"
          rows={3}
          aria-label="Müşteri şikâyeti"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
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
      <PhotoField label="Kabul fotoğrafı (isteğe bağlı)" value={photo} onChange={setPhoto} />

      <div className="form-group">
        <label className="form-label" htmlFor="sv-promised">Teslim sözü (tarih)</label>
        <input id="sv-promised" className="form-input" type="date" value={promised} onChange={(e) => setPromised(e.target.value)} />
      </div>

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={warrantyOn} onChange={(e) => setWarrantyOn(e.target.checked)} />
        Garanti talebi
      </label>
      {warrantyOn ? (
        <div className="stack stack-sm">
          {selectedMachine?.warranty_until ? (
            <div className={`alert ${selectedMachine.warranty_until < todayLocalDate() ? "alert-warning" : "alert-success"}`} role="note">
              Makine kartında garanti bitişi: {formatDate(selectedMachine.warranty_until + "T00:00:00")}
              {selectedMachine.warranty_until < todayLocalDate() ? " (süresi geçmiş görünüyor)" : ""}. Bu bilgi yalnızca bilgilendirmedir; kapsamı siz doğrulayın.
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

      <label className="row row-gap-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={depositOn} onChange={(e) => setDepositOn(e.target.checked)} />
        Kapora alındı
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

      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
        {busy ? "Açılıyor…" : "Servisi aç"}
      </button>
    </form>
  );
}
