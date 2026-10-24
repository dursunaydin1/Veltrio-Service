import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Yardım" };

const TOPICS: { title: string; body: string }[] = [
  {
    title: "Yeni servis nasıl açılır?",
    body: "Ana ekranda “Yeni Servis”e dokunun; müşteriyi ve makineyi seçin (yoksa yeni ekleyin), şikâyeti yazın ve kaydedin. Makine QR etiketini okutarak da başlayabilirsiniz.",
  },
  {
    title: "Müşteri onayı ne zaman gerekir?",
    body: "Teklif, Ayarlar’daki onay eşiğini aşarsa işe başlamadan müşterinin kararı (onay / ret / erteleme) kaydedilir. Onaylanan tutarın üstüne çıkılırsa yeniden onay istenir.",
  },
  {
    title: "Veresiye satış ve tahsilat",
    body: "Satışta müşteri seçip tutarın bir kısmını almazsanız kalan müşterinin borcuna yazılır. Sonradan müşteri sayfasından “Tahsilat al” ile en eski borçtan başlayarak kapatabilirsiniz.",
  },
  {
    title: "Yanlış girilen kaydı nasıl düzeltirim?",
    body: "Kayıtlar silinmez. Hatalı tahsilat “ters kaydedilir”, hatalı satış nedeni yazılarak iptal edilir, ürün geri geldiyse iade alınır. Tüm kritik işlemler Ayarlar → Geçmiş’te görünür.",
  },
  {
    title: "İnternet yokken çalışır mı?",
    body: "Evet. Kayıtlar önce cihazda tutulur, internet gelince otomatik eşitlenir. Üstteki göstergeden bekleyen kayıt sayısını görürsünüz. Çevrimdışıyken stok bilgisi bu cihazın bildiği son stoktur.",
  },
  {
    title: "Telefonumu kaybettim",
    body: "Ayarlar → Cihazlar’dan kayıp cihazı iptal edin. Cihaz internete bağlandığında verilerini siler ve bir daha eşitleme yapamaz.",
  },
  {
    title: "PIN’imi unuttum",
    body: "Kilit ekranında “PIN’imi unuttum”a dokunun; şifrenizle yeniden giriş yaparsınız. Şifrenizi de unuttuysanız giriş ekranındaki “Şifremi unuttum”u kullanın.",
  },
  {
    title: "Yedek nasıl alınır?",
    body: "Sunucu her gün otomatik yedek alır. Ayarlar → Yedekleme’den ayrıca kendi cihazınıza yedek dosyası indirebilir, gerekirse geri yükleyebilirsiniz.",
  },
];

export default function HelpPage() {
  return (
    <section className="stack stack-md">
      <h1>Yardım</h1>
      <ul className="menu-list" aria-label="Sık sorulanlar">
        {TOPICS.map((t) => (
          <li key={t.title} style={{ display: "block", padding: 0 }}>
            <details className="card" style={{ padding: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{t.title}</summary>
              <p style={{ marginTop: 8 }}>{t.body}</p>
            </details>
          </li>
        ))}
      </ul>
      <p>
        Başka bir sorun için <Link href="/settings/history">Geçmiş</Link> ekranına bakın veya{" "}
        <Link href="/settings/data-check">Veri denetimi</Link> çalıştırın.
      </p>
    </section>
  );
}
