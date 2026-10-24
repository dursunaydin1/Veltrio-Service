import * as XLSX from "xlsx";

/**
 * İçe aktarma dosyası okuma (Adım 6.1): CSV (UTF-8 / BOM / Windows-1254, `;` `,` veya sekme
 * ayraçlı) ve XLSX. Çıktı her zaman metin tablosudur; doğrulama sonraki katmandadır.
 */

export type ParsedTable = { headers: string[]; rows: string[][] };

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Baytları metne çevirir: geçerli UTF-8 ise UTF-8, değilse Türkçe Excel'in Windows-1254 kodlaması. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

export function detectDelimiter(headerLine: string): string {
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const ch of headerLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts]++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ";");
}

/** Tırnak, çift tırnak kaçışı ve satır içi satır sonunu destekleyen CSV ayrıştırıcı. */
export function parseDelimited(text: string): ParsedTable {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const records: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      records.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length > 0) { row.push(cur); records.push(row); }

  const clean = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (clean.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = clean;
  return { headers: headers.map((h) => h.trim()), rows: rows.map((r) => r.map((c) => c.trim())) };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Excel hücresi → metin: tarih YYYY-MM-DD, sayı virgüllü ondalık (Türkçe ayrıştırıcıyla uyumlu). */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 12 * 3600_000); // gün kaymasına karşı öğlene yuvarla
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v === "number") return String(v).replace(".", ",");
  return String(v).trim();
}

export function parseXlsx(bytes: Uint8Array): ParsedTable {
  const book = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  const lines = matrix.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ""));
  if (lines.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = lines;
  return { headers, rows };
}

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

export function parseFileBytes(bytes: Uint8Array, fileName: string): ParsedTable {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ImportFileError("Dosya çok büyük (en fazla 5 MB).");
  const isXlsx = /\.xlsx?$/i.test(fileName) || (bytes[0] === 0x50 && bytes[1] === 0x4b); // ZIP imzası
  const table = isXlsx ? parseXlsx(bytes) : parseDelimited(decodeText(bytes));
  if (table.headers.length === 0) throw new ImportFileError("Dosyada başlık satırı veya veri bulunamadı.");
  if (table.rows.length === 0) throw new ImportFileError("Dosyada veri satırı yok.");
  if (table.rows.length > MAX_ROWS) throw new ImportFileError(`Dosyada en fazla ${MAX_ROWS} satır olabilir.`);
  return table;
}

/** Dosya özeti (SHA-256): aynı dosyanın ikinci kez yüklenmesini engellemek için (AC-047). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
