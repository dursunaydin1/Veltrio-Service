"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseSettingsForm, toSettingsForm, type SettingsFormInput } from "@/lib/settings/businessSettings";
import { writeAuditLog } from "@/lib/sync/audit";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useSessionStore } from "@/stores/session";

type Errors = Partial<Record<keyof SettingsFormInput | "name" | "ownerName", string>>;

/**
 * İşletme bilgileri ve ayarları (Adım 1.4; SR-004, SR-005, SR-014, ST-002, AC-045):
 * onay eşiği ve toleransı, teslim hatırlatma günü, çevrimdışı azami süre, eksi stok,
 * KDV varsayılanı ve fiş alt metni. Kaydetme çevrimiçi yapılır; değişiklik audit log'a yazılır.
 */
export function BusinessSettingsForm() {
  const business = useSessionStore((s) => s.business);
  const setBusiness = useSessionStore((s) => s.setBusiness);
  const isOnline = useSessionStore((s) => s.isOnline);
  const ctx = useBusinessContext();

  const [name, setName] = useState(business?.name ?? "");
  const [owner, setOwner] = useState(business?.owner_name ?? "");
  const [phone, setPhone] = useState(business?.phone ?? "");
  const [address, setAddress] = useState(business?.address ?? "");
  const [taxNumber, setTaxNumber] = useState(business?.tax_number ?? "");
  const [form, setForm] = useState<SettingsFormInput>(() => toSettingsForm(business?.settings));
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!business) return null;
  const set = <K extends keyof SettingsFormInput>(key: K, value: SettingsFormInput[K]) => setForm({ ...form, [key]: value });
  const err = (key: keyof Errors) => (errors[key] ? <small role="alert" style={{ color: "var(--accent-danger)" }}>{errors[key]}</small> : null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!business) return;
    setError(null);
    setSaved(false);
    const parsed = parseSettingsForm(form);
    const nextErrors: Errors = parsed.ok ? {} : { ...parsed.errors };
    if (!name.trim()) nextErrors.name = "İşletme adı zorunludur.";
    if (!owner.trim()) nextErrors.ownerName = "Yetkili adı zorunludur.";
    setErrors(nextErrors);
    if (!parsed.ok || Object.keys(nextErrors).length > 0) return;
    if (!isOnline) return setError("Ayarları kaydetmek için internet bağlantısı gerekir.");

    setBusy(true);
    const settings = { ...business.settings, ...parsed.settings };
    if (parsed.settings.receipt_terms === undefined) delete (settings as { receipt_terms?: string }).receipt_terms;
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("businesses")
      .update({
        name: name.trim(),
        owner_name: owner.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        tax_number: taxNumber.trim() || null,
        settings,
      })
      .eq("id", business.id)
      .select("*")
      .single();
    if (updateError || !data) {
      setBusy(false);
      return setError("Ayarlar kaydedilemedi. Lütfen tekrar deneyin.");
    }
    setBusiness(data as typeof business);
    if (ctx) {
      await writeAuditLog({
        businessId: ctx.businessId,
        entityType: "businesses",
        entityId: business.id,
        action: "UPDATE",
        deviceCode: ctx.deviceCode,
        actorId: ctx.actorId,
        reason: "İşletme ayarları güncellendi",
        oldValue: { settings: business.settings },
        newValue: { settings },
      });
    }
    setSaved(true);
    setBusy(false);
  }

  return (
    <form className="stack stack-lg" onSubmit={submit} noValidate>
      <h1>İşletme ayarları</h1>

      <section className="card stack stack-md" aria-labelledby="bs-info">
        <h2 id="bs-info">İşletme bilgileri</h2>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-name">İşletme adı *</label>
          <input id="bs-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          {err("name")}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-owner">Yetkili adı soyadı *</label>
          <input id="bs-owner" className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          {err("ownerName")}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-phone">Telefon</label>
          <input id="bs-phone" className="form-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-address">Adres</label>
          <input id="bs-address" className="form-input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-tax">Vergi no</label>
          <input id="bs-tax" className="form-input" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
        </div>
      </section>

      <section className="card stack stack-md" aria-labelledby="bs-service">
        <h2 id="bs-service">Servis</h2>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-threshold">Müşteri onayı eşiği (₺)</label>
          <input id="bs-threshold" className="form-input" inputMode="decimal" value={form.approvalThreshold} onChange={(e) => set("approvalThreshold", e.target.value)} />
          <small style={{ color: "var(--text-muted)" }}>Teklif bu tutarı aşarsa işe başlamadan müşteri kararı kaydedilir. 0 = ücretli her işte onay.</small>
          {err("approvalThreshold")}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-tolerance">Onay toleransı (₺)</label>
          <input id="bs-tolerance" className="form-input" inputMode="decimal" value={form.approvalTolerance} onChange={(e) => set("approvalTolerance", e.target.value)} />
          <small style={{ color: "var(--text-muted)" }}>Onaylı bir kalemde bu tutara kadar artış yeniden onay istemez. Varsayılan 0.</small>
          {err("approvalTolerance")}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-reminder">Teslim hatırlatması (gün önce)</label>
          <input id="bs-reminder" className="form-input" inputMode="numeric" value={form.reminderDays} onChange={(e) => set("reminderDays", e.target.value)} />
          {err("reminderDays")}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-terms">Fiş alt metni (teslim koşulları)</label>
          <textarea id="bs-terms" className="form-input" rows={3} value={form.receiptTerms} onChange={(e) => set("receiptTerms", e.target.value)} />
          {err("receiptTerms")}
        </div>
      </section>

      <section className="card stack stack-md" aria-labelledby="bs-general">
        <h2 id="bs-general">Stok, vergi ve çevrimdışı çalışma</h2>
        <label className="row row-gap-sm" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={form.allowNegativeStock} onChange={(e) => set("allowNegativeStock", e.target.checked)} />
          Eksi stoğa izin ver (neden yazılarak, kritik uyarıyla)
        </label>
        <div className="row row-gap-md">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label" htmlFor="bs-taxmode">KDV varsayılanı</label>
            <select id="bs-taxmode" className="form-input" value={form.defaultTaxMode} onChange={(e) => set("defaultTaxMode", e.target.value as SettingsFormInput["defaultTaxMode"])}>
              <option value="INCLUSIVE">KDV dahil</option>
              <option value="EXCLUSIVE">KDV hariç</option>
              <option value="NONE">KDV yok</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor="bs-taxrate">Oran (%)</label>
            <input id="bs-taxrate" className="form-input" inputMode="decimal" value={form.defaultTaxRate} onChange={(e) => set("defaultTaxRate", e.target.value)} />
            {err("defaultTaxRate")}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="bs-offline">Çevrimdışı azami süre (gün)</label>
          <input id="bs-offline" className="form-input" inputMode="numeric" value={form.maxOfflineDays} onChange={(e) => set("maxOfflineDays", e.target.value)} />
          <small style={{ color: "var(--text-muted)" }}>Bu süreyi aşan cihazda, eşitlenene kadar yeni kayıt yapılamaz.</small>
          {err("maxOfflineDays")}
        </div>
      </section>

      {!isOnline ? <div className="alert alert-warning" role="status">Çevrimdışısınız: ayarları kaydetmek için internete bağlanın.</div> : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {saved ? <div className="alert alert-success" role="status">Ayarlar kaydedildi.</div> : null}
      <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy || !isOnline}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
    </form>
  );
}
