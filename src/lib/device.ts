/** Cihaz kayıt ekranında önerilen ad (kullanıcı değiştirebilir). */
export function suggestDeviceName(userAgent: string): string {
  if (/iPhone|iPod|Android.*Mobile/i.test(userAgent)) return "Telefon";
  if (/iPad|Android|Tablet/i.test(userAgent)) return "Tablet";
  return "Bilgisayar";
}
