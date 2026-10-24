"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/stores/session";

/**
 * İlk kurulum sihirbazı (Adım 1.4, FR-002): hesap açılmış ama işletme kurulmamışsa
 * işletme bilgileri ve varsayılanlar alınır. Kurulum **çevrimiçi** yapılır; cihaz
 * kodu bir sonraki adımda sunucuda otomatik atanır. Varsayılan ayarlar sunucuda yazılır
 * (onay eşiği 1.000 ₺, eksi stok kapalı, hatırlatma 1 gün, çevrimdışı azami 30 gün).
 */
export function SetupWizard() {
  const email = useSessionStore((s) => s.authEmail);
  const emailConfirmed = useSessionStore((s) => s.emailConfirmed);
  const isOnline = useSessionStore((s) => s.isOnline);

  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxMode, setTaxMode] = useState<"INCLUSIVE" | "EXCLUSIVE" | "NONE">("INCLUSIVE");
  const [taxRate, setTaxRate] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isOnline) return setError("İlk kurulum internet bağlantısı gerektirir. Bağlandıktan sonra tekrar deneyin.");
    if (!name.trim()) return setError("İşletme adı zorunludur.");
    if (!owner.trim()) return setError("Yetkili adı zorunludur.");
    const rate = Number(taxRate.replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return setError("KDV oranı 0 ile 100 arasında olmalıdır.");

    setBusy(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("setup_business", {
      p_name: name,
      p_owner_name: owner,
      p_phone: phone || null,
      p_address: address || null,
      p_tax_number: taxNumber || null,
      p_default_tax_mode: taxMode,
      p_default_tax_rate: rate,
    });
    if (rpcError) {
      setBusy(false);
      return setError(rpcError.message || "Kurulum tamamlanamadı.");
    }
    // Oturum bilgisini (işletme, kullanıcı) yeniden yükle; ardından cihaz kaydı ekranı açılır
    window.location.reload();
  }

  return (
    <main className="container" style={{ maxWidth: 480, paddingTop: 32, paddingBottom: 48 }}>
      <form className="card stack stack-md" onSubmit={submit} noValidate>
        <h1>İşletmenizi kuralım</h1>
        <p>Bu bilgiler fişlerde ve belgelerde görünür; sonradan Ayarlar&apos;dan değiştirebilirsiniz.</p>

        {!emailConfirmed ? (
          <div className="alert alert-warning" role="note">
            {email ? <><strong>{email}</strong> adresi henüz doğrulanmamış. </> : "Hesabınıza e-posta eklenmemiş. "}
            Şifrenizi unutursanız hesabı kurtarmak için doğrulanmış bir e-posta gerekir; gelen kutunuzdaki doğrulama
            bağlantısına dokunmanızı öneririz.
          </div>
        ) : null}
        {!isOnline ? <div className="alert alert-error" role="alert">Çevrimdışısınız: ilk kurulum internetle yapılır.</div> : null}

        <div className="form-group">
          <label className="form-label" htmlFor="su-name">İşletme adı *</label>
          <input id="su-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="su-owner">Yetkili adı soyadı *</label>
          <input id="su-owner" className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="su-phone">Telefon</label>
          <input id="su-phone" className="form-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="su-address">Adres</label>
          <input id="su-address" className="form-input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="su-tax">Vergi no (isteğe bağlı)</label>
          <input id="su-tax" className="form-input" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
        </div>
        <div className="row row-gap-md">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label" htmlFor="su-mode">KDV varsayılanı</label>
            <select id="su-mode" className="form-input" value={taxMode} onChange={(e) => setTaxMode(e.target.value as typeof taxMode)}>
              <option value="INCLUSIVE">KDV dahil</option>
              <option value="EXCLUSIVE">KDV hariç</option>
              <option value="NONE">KDV yok</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor="su-rate">Oran (%)</label>
            <input id="su-rate" className="form-input" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
        </div>
        <p>Para birimi: Türk Lirası (₺). Saat dilimi: Türkiye.</p>

        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy || !isOnline}>
          {busy ? "Kuruluyor…" : "Kurulumu tamamla"}
        </button>
      </form>
    </main>
  );
}
