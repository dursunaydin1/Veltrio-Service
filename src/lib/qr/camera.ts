/**
 * Kamera açılamadığında kullanıcıya ne yapacağını söyleyen ileti (K-073).
 * html5-qrcode hatayı bazen Error, bazen düz metin olarak fırlatır; ikisinde de hata adına bakılır.
 */
function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name} ${error.message}` : String(error);
}

/** Kullanıcı ya da telefon kamera iznini reddetti mi? (izin ekranına yönlendirilir, K-074) */
export function isPermissionDenied(error: unknown): boolean {
  return /NotAllowedError|Permission/i.test(errorText(error));
}

export function cameraErrorMessage(error: unknown): string {
  const text = errorText(error);
  if (isPermissionDenied(error)) {
    return "Kamera izni verilmemiş. Telefonun Ayarlar → Uygulamalar → Chrome (veya Veltrio) → İzinler → Kamera bölümünden izin verin, sonra “Tekrar dene”ye dokunun.";
  }
  if (/NotFoundError|OverconstrainedError|Requested device not found/i.test(text)) {
    return "Bu cihazda kullanılabilir kamera bulunamadı. QR adresini aşağıya yapıştırabilirsiniz.";
  }
  if (/NotReadableError|TrackStartError|Could not start video/i.test(text)) {
    return "Kamera başka bir uygulama tarafından kullanılıyor. O uygulamayı kapatıp “Tekrar dene”ye dokunun.";
  }
  if (/SecurityError|secure context|https/i.test(text)) {
    return "Kamera yalnızca güvenli (https) adreste açılır.";
  }
  return "Kamera açılamadı. “Tekrar dene”ye dokunun veya QR adresini aşağıya yapıştırın.";
}
