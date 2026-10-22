/**
 * Ortak hesaplama modülü — istemci ve sunucu aynı kodu kullanır (AC-026).
 *
 * Para tutarları kuruş cinsinden TAM SAYI ile hesaplanır (1.234,50 ₺ → 123450).
 * Veritabanına DECIMAL(15,4) olarak yazılırken `fromKurus`, okunurken
 * `toKurus` kullanılır. Kayan noktalı sayı ile para toplanmaz.
 *
 * Satır toplamı: (birim_fiyat × miktar − satır_indirimi) ± vergi
 * Belge toplamı: yuvarlanmış satır toplamlarının toplamı (PRD §9.2)
 */

import type { TaxMode } from "@/types";

/** Belgeyle birlikte saklanır; formül değişirse artırılır (Adım 1.9). */
export const CALC_VERSION = 1;

/** Miktar 4 ondalık basamağa kadar desteklenir (DECIMAL(15,4)). */
const QTY_SCALE = 10_000;

/** Vergi oranı 2 ondalık basamağa kadar desteklenir (DECIMAL(5,2)). */
const RATE_SCALE = 100;

function assertSafe(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} güvenli tam sayı sınırını aşıyor.`);
  }
}

/**
 * Negatif olmayan tam sayı bölmesini en yakın tam sayıya yuvarlar
 * (yarımlar yukarı). Örnek: roundDiv(5, 2) = 3, roundDiv(4, 2) = 2.
 */
function roundDiv(numerator: number, denominator: number): number {
  assertSafe(numerator, "Ara sonuç");
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Ondalık sayıyı (veya "12,5" / "12.5" metnini) verilen ölçeğe göre tam sayıya
 * çevirir; float çarpımı yerine metin üzerinden okuyarak 1.005 gibi
 * değerlerde yanlış yuvarlamayı önler. Fazla basamaklar yarımlar yukarı
 * yuvarlanır.
 */
function parseScaled(input: number | string, decimals: number, label: string): number {
  const text = (typeof input === "number" ? String(input) : input)
    .trim()
    .replace(",", ".");

  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new RangeError(`${label} geçersiz veya negatif: "${input}"`);
  }

  const [whole, fraction = ""] = text.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const roundUp = fraction.length > decimals && fraction[decimals] >= "5" ? 1 : 0;
  const result = Number(whole + padded) + roundUp;

  assertSafe(result, label);
  return result;
}

/** 1234.5 | "1234,50" → 123450 */
export function toKurus(amount: number | string): number {
  return parseScaled(amount, 2, "Tutar");
}

/** 123450 → 1234.5 (veritabanına yazılacak değer) */
export function fromKurus(kurus: number): number {
  assertSafe(kurus, "Tutar");
  return kurus / 100;
}

export type LineInput = {
  /** Birim fiyat, kuruş */
  unitPrice: number;
  /** Miktar; 4 ondalık basamağa kadar (ör. 2.5 litre) */
  quantity: number | string;
  /** Satırın TOPLAM indirimi, kuruş (birim başına değil) */
  discount?: number;
  taxMode: TaxMode;
  /** Yüzde olarak, ör. 20 veya 18.5 */
  taxRate: number | string;
};

export type LineResult = {
  /** Vergi hariç tutar (indirim düşülmüş) */
  net: number;
  tax: number;
  /** Vergi dahil satır toplamı */
  total: number;
  discount: number;
};

/**
 * Tek satırın toplamını hesaplar.
 * INCLUSIVE: fiyat vergi dahildir, vergi içinden ayrılır.
 * EXCLUSIVE: fiyat vergi hariçtir, vergi üstüne eklenir.
 * NONE: vergi yok.
 */
export function calcLine(input: LineInput): LineResult {
  const discount = input.discount ?? 0;
  if (!Number.isInteger(input.unitPrice) || input.unitPrice < 0) {
    throw new RangeError("Birim fiyat kuruş cinsinden negatif olmayan tam sayı olmalı.");
  }
  if (!Number.isInteger(discount) || discount < 0) {
    throw new RangeError("İndirim kuruş cinsinden negatif olmayan tam sayı olmalı.");
  }

  const qty = parseScaled(input.quantity, 4, "Miktar");
  const rate = parseScaled(input.taxRate, 2, "Vergi oranı");
  if (rate > 100 * RATE_SCALE) {
    throw new RangeError("Vergi oranı %100'ü aşamaz.");
  }

  const gross = roundDiv(input.unitPrice * qty, QTY_SCALE);
  if (discount > gross) {
    throw new RangeError("İndirim satır tutarından büyük olamaz.");
  }
  const base = gross - discount;

  if (input.taxMode === "NONE" || rate === 0) {
    return { net: base, tax: 0, total: base, discount };
  }

  if (input.taxMode === "INCLUSIVE") {
    const net = roundDiv(base * 100 * RATE_SCALE, 100 * RATE_SCALE + rate);
    return { net, tax: base - net, total: base, discount };
  }

  const tax = roundDiv(base * rate, 100 * RATE_SCALE);
  return { net: base, tax, total: base + tax, discount };
}

export type DocumentTotals = {
  /** Vergi hariç toplam */
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  /** Vergi dahil genel toplam = yuvarlanmış satır toplamlarının toplamı */
  total: number;
  calcVersion: number;
};

/** Belge toplamı: satırların yuvarlanmış değerleri toplanır, yeniden yuvarlanmaz. */
export function calcDocument(lines: LineResult[]): DocumentTotals {
  const sum = (pick: (l: LineResult) => number) =>
    lines.reduce((acc, line) => acc + pick(line), 0);

  const totals = {
    subtotal: sum((l) => l.net),
    discountTotal: sum((l) => l.discount),
    taxTotal: sum((l) => l.tax),
    total: sum((l) => l.total),
    calcVersion: CALC_VERSION,
  };
  assertSafe(totals.total, "Belge toplamı");
  return totals;
}
