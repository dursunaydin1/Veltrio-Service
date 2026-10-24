/**
 * Şifre politikası (Adım 1.3, NFR-009): modern asgari koşullar. Sunucu tarafında
 * da Supabase ayarlarından uygulanmalıdır; bu denetim kullanıcıya anında geri
 * bildirim verir ve zayıf şifreleri istemciden göndermez.
 */

export const MIN_PASSWORD_LENGTH = 10;

const COMMON = new Set([
  "1234567890", "12345678910", "password12", "password123", "qwerty12345", "qwertyuiop1",
  "1q2w3e4r5t", "abcd123456", "iloveyou123", "admin12345", "sifre12345", "parola12345",
]);

export function validatePassword(password: string, email?: string): string[] {
  const errors: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) errors.push(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
  if (!/\p{L}/u.test(password)) errors.push("Şifre en az bir harf içermelidir.");
  if (!/\d/.test(password)) errors.push("Şifre en az bir rakam içermelidir.");
  if (/^(.)\1+$/.test(password)) errors.push("Şifre tek karakterin tekrarından oluşamaz.");
  const lower = password.toLocaleLowerCase("tr");
  if (COMMON.has(lower)) errors.push("Bu şifre çok yaygın; başka bir şifre seçin.");
  const local = email?.split("@")[0]?.toLocaleLowerCase("tr");
  if (local && local.length >= 4 && lower.includes(local)) errors.push("Şifre e-posta adresinizi içermemelidir.");
  return errors;
}
