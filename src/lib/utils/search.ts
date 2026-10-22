const TURKISH_FOLD: Record<string, string> = {
  ı: "i",
  ğ: "g",
  ü: "u",
  ş: "s",
  ö: "o",
  ç: "c",
};

/**
 * Arama için metni sadeleştirir: Türkçe küçük harfe çevirir ve Türkçe
 * karakterleri ASCII karşılığına indirir. Böylece "ALI", "ali", "Alı" aynı,
 * "camlica" ile "Çamlıca" eşleşir (telefonda Türkçe klavye şart değildir).
 */
export function foldText(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[ığüşöç]/g, (ch) => TURKISH_FOLD[ch] ?? ch);
}
