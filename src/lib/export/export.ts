import * as XLSX from "xlsx";

/**
 * Dışa aktarma (Adım 6.8, FR-026, AC-024): CSV ve XLSX. Türkiye standardı: tarih
 * gg.aa.yyyy, tutarlar virgüllü; CSV UTF-8 BOM ve noktalı virgül ayracıyla yazılır, böylece
 * Türkçe Excel dosyayı doğrudan doğru açar. Hücre başındaki `= + - @` karakterleri formül
 * olarak çalışmasın diye metin olarak işaretlenir.
 */

export type ColumnType = "text" | "money" | "number" | "date";

export type Column<T> = { key: keyof T & string; label: string; type?: ColumnType };

const BOM = "﻿";
const SEP = ";";

/** ISO tarih veya YYYY-MM-DD → gg.aa.yyyy; çözülemezse olduğu gibi. */
export function formatTrDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

/** Sayıyı virgüllü ondalıkla yazar, binlik ayracı koymaz (Excel'de sayı olarak okunur). */
function plainNumber(n: number, digits: number): string {
  return n.toFixed(digits).replace(".", ",");
}

function cell(value: unknown, type: ColumnType | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  switch (type) {
    case "money":
      return plainNumber(Number(value) / 100, 2); // kuruş → TL
    case "number":
      return Number.isInteger(Number(value)) ? String(value) : plainNumber(Number(value), 4).replace(/,?0+$/, "");
    case "date":
      return formatTrDate(String(value));
    default: {
      const text = String(value);
      // CSV formül enjeksiyonuna karşı
      return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    }
  }
}

function escapeCsv(text: string): string {
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(columns: Column<T>[], rows: T[]): string {
  const lines = [columns.map((c) => escapeCsv(c.label)).join(SEP)];
  for (const row of rows) lines.push(columns.map((c) => escapeCsv(cell(row[c.key], c.type))).join(SEP));
  return BOM + lines.join("\r\n") + "\r\n";
}

/** XLSX: tutarlar gerçek sayı (TL, 2 ondalık), tarihler gg.aa.yyyy metni; Türkçe karakterler korunur. */
export function toXlsx<T extends Record<string, unknown>>(sheetName: string, columns: Column<T>[], rows: T[]): Uint8Array {
  const aoa: (string | number)[][] = [columns.map((c) => c.label)];
  for (const row of rows) {
    aoa.push(
      columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined || v === "") return "";
        if (c.type === "money") return Number(v) / 100;
        if (c.type === "number") return Number(v);
        if (c.type === "date") return formatTrDate(String(v));
        return cell(v, "text");
      })
    );
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  columns.forEach((c, index) => {
    if (c.type !== "money") return;
    for (let r = 1; r <= rows.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: index });
      if (sheet[ref] && typeof sheet[ref].v === "number") sheet[ref].z = "#,##0.00";
    }
  });
  sheet["!cols"] = columns.map((c) => ({ wch: Math.max(10, c.label.length + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

export function exportFileName(base: string, ext: "csv" | "xlsx", today: string): string {
  return `${base}-${today}.${ext}`;
}
