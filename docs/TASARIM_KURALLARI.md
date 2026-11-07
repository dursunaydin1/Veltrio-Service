# Tasarım Kuralları

Yeni ekran eklerken ya da var olanı değiştirirken bu kurallara uyulur. Amaç, her ekranın aynı dili konuşmasıdır. Değerlerin kaynağı [globals.css](../src/app/globals.css); burada nedenleri ve seçim kuralları yazılıdır. Kararlar: K-110, K-112 – K-116.

## 1. Renk: her rengin bir anlamı var

Renkler her zaman değişkenden okunur (`var(--…)`); bileşende sabit renk yazılmaz. Böylece açık ve koyu tema tek yerden değişir.

| Renk | Değişken | Ne zaman |
|---|---|---|
| Pirinç | `--accent-primary` | Marka ve **ana eylem** (Kaydet, Satışı tamamla), seçili çip, etkin sekme |
| Turuncu | `--accent-warning`, `.btn-warning` | **Para bekleniyor**: müşteri borcu, kalan, veresiye; "Tahsilat al" |
| Kırmızı | `--accent-danger`, `.btn-danger`, `.btn-danger-soft` | **Acil ya da geri dönüşü zor**: hata, teslim tarihi geçti, iptal, silme / ters kayıt |
| Yeşil | `--accent-success` | **Tamam**: ödendi, teslim edildi, alacak (bize borçlu değil) |
| Mavi | `--info-fg` | Bilgi notu; karar gerektirmez |
| Mor | `--violet-fg` | Servis durum rozetlerinde ayırt edici ton; başka anlam yüklenmez |
| Gri | `--text-muted`, `.badge-gray` | İkincil bilgi, arşiv / pasif |

Kural: Bir ekranda tek bir ana eylem pirinç olur. Turuncu ile kırmızı birbirinin yerine kullanılmaz: borç acil değil, beklenen bir tutardır.

## 2. Yazı ölçeği

Yalnızca bu dokuz boyut kullanılır; yeni boyut uydurulmaz. Baskı (fiş, QR etiketi) kendi mm / px ölçülerini kullanır.

| Değişken | Boyut | Rol |
|---|---|---|
| `--text-2xs` | 11 px | Rozet, sayaç |
| `--text-xs` | 13 px | Açıklama, etiket, alt bilgi |
| `--text-sm` | 14 px | İkincil metin, küçük düğme |
| `--text-md` | 15 px | Liste satırı, form alanı |
| `--text-base` | 16 px | Gövde |
| `--text-lg` | 17 px | Kart başlığı, büyük düğme |
| `--text-xl` | 20 px | Bölüm başlığı |
| `--text-2xl` | 24 px | Özet rakamı |
| `--text-3xl` | 28 px | Sayfa başlığı, öne çıkan tutar |

## 3. Boşluk

`--space-1` (4 px) ile `--space-6` (32 px) arası, 4'ün katları. Aralık `gap` ile verilir (`.stack-*`, `.row-gap-*`, `.gap-*`); kenar boşluğuyla (margin) yerleşim yapılmaz.

## 4. Satır içi stil yok

`style={{…}}` yalnızca değeri **çalışma anında hesaplanan** durumlarda kullanılır (ör. yüzde genişlik, fotoğraf boyutu). Tekrar eden her şey sınıftır: `.muted`, `.meta`, `.grow`, `.line-item`, `.item-stack`, `.self-start`… (globals.css → "Yardımcı sınıflar"). Bileşene özel görünüm için bileşene özel sınıf yazılır.

## 5. Kontroller

| İhtiyaç | Kontrol |
|---|---|
| Bir ayarı / görünümü açıp kapatmak | **Anahtar**: `toggle-row` + `input.switch` |
| Listeden seçmek, kontrol maddesi, "okudum, onaylıyorum" | Onay kutusu |
| 2–5 seçenekten biri | **Çip**: `chip chip-toggle` (ödeme yöntemi: `PaymentMethodPicker`) |
| Uzun liste (müşteri, ürün, tedarikçi) | **Aramalı seçici** (`CustomerPicker`, `ProductPicker`…) |
| Çok seçenekli sabit liste (birim, kategori) | Açılır liste (`select`) |
| İsteğe bağlı alan | `OptionalField` "+ çip" (çalışma kuralı 15) |
| Miktar | `QuantityStepper` (− / +) |
| Tarih (vade, teslim) | `DateQuickPick` (1 hafta / 2 hafta / 1 ay / Başka tarih) |
| Onay / neden sorma | `confirmDialog` / `promptDialog`; tarayıcının `confirm` / `prompt` kutusu kullanılmaz |

## 6. Ekran iskeleti

- **Başlık:** Her ekran başlığını `PageHead` ile üst karta koyar; durum rozeti `badge`, tek yan eylem `action` ile verilir. Servis detayının özel başlığı ve sihirbaz soruları bunun dışındadır.
- **Yüklenirken:** Listede `ListSkeleton`, detayda `DetailSkeleton`. Ekran hiçbir zaman boş kalmaz.
- **Uzun listeler:** Sekmeler ve arama `list-toolbar` ile üste yapışır, liste sayfayla kayar (kutu içinde kaydırma yok), 30'ar yüklenir, "Başa dön" düğmesi kendiliğinden çıkar.
- **Seyrek işlemler:** `details.more-actions` ("Diğer işlemler") içinde katlı durur.
- **Kaydedince:** Sıradaki ekrana ya da sekmeye geçilir; form geçmişte kalmaz (`nav.replace`).

## 7. Dokunmatik

- Dokunma hedefi en az 44 px (`--touch-min`).
- Üzerine gelme (`:hover`) efektleri yalnızca `@media (hover: hover)` içinde yazılır; telefonda parmağın altında renk takılı kalmaz.
- Bekleme sırasında form kilitlenir (`fieldset.form-lock`, `aria-busy`).

## 8. Tema

Varsayılan koyu temadır; Ayarlar → Görünüm'den açık tema ya da "telefonun ayarı" seçilir (bu cihaza özel). Açık temanın değerleri `:root[data-theme="light"]` içinde yalnızca değişken olarak tanımlıdır. Yeni bir renk değişkeni eklenirse iki temada da tanımlanır. Servis fişi ve QR etiketi her temada beyaz kâğıttır.
