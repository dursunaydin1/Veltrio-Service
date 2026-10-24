import type { Metadata } from "next";

export const metadata: Metadata = { title: "Çevrimdışı" };

/** Service worker'ın, önbellekte bulunmayan bir sayfa çevrimdışıyken istendiğinde gösterdiği sayfa. */
export default function OfflinePage() {
  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 64 }}>
      <div className="card stack stack-md">
        <h1>Çevrimdışısınız</h1>
        <p>
          Bu sayfa henüz bu cihaza indirilmemiş. İnternet bağlantınız gelince açılır. Daha önce açtığınız sayfalar ve
          kaydettiğiniz veriler çevrimdışı da kullanılabilir.
        </p>
        <a href="/dashboard" className="btn btn-primary btn-full">Ana ekrana dön</a>
      </div>
    </main>
  );
}
