import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { IMPORT_DEFS, applyMapping, missingRequired, suggestMapping, templateXlsx } from "./definitions";
import { ImportFileError, decodeText, detectDelimiter, parseDelimited, parseFileBytes, sha256Hex } from "./parse";

const enc = (s: string) => new TextEncoder().encode(s);

describe("CSV okuma (AC-015)", () => {
  it("noktalı virgül, virgül ve sekme ayracını tanır", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter('"a;b",c,d')).toBe(",");
  });

  it("tırnak, kaçışlı tırnak, satır içi satır sonu ve boş satırları işler", () => {
    const t = parseDelimited('Ad;Not\r\n"Ali; Veli";"Şöyle ""dedi"""\r\n\r\n"Çok\nsatırlı";x\r\n');
    expect(t.headers).toEqual(["Ad", "Not"]);
    expect(t.rows).toEqual([["Ali; Veli", 'Şöyle "dedi"'], ["Çok\nsatırlı", "x"]]);
  });

  it("UTF-8 BOM'u atar; UTF-8 değilse Windows-1254 (Türkçe Excel) olarak okur", () => {
    expect(decodeText(enc("﻿Çamlıca"))).toBe("Çamlıca");
    const win1254 = new Uint8Array([0xc7, 0x61, 0x6d, 0x6c, 0xfd, 0x63, 0x61]); // "Çamlıca"
    expect(decodeText(win1254)).toBe("Çamlıca");
  });
});

describe("XLSX okuma", () => {
  it("sayıları virgüllü ondalıkla, tarihleri YYYY-MM-DD olarak metne çevirir", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Ad", "Tutar", "Tarih"], ["Ali", 1250.5, new Date(Date.UTC(2026, 9, 5, 0, 0, 0))]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "S");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx", cellDates: true }) as Uint8Array;
    const t = parseFileBytes(bytes, "x.xlsx");
    expect(t.headers).toEqual(["Ad", "Tutar", "Tarih"]);
    expect(t.rows[0][0]).toBe("Ali");
    expect(t.rows[0][1]).toBe("1250,5");
    expect(t.rows[0][2]).toMatch(/^2026-10-0[45]$/);
  });

  it("şablon dosyası tekrar okunabilir ve başlıkları alanlarla eşleşir", () => {
    for (const kind of Object.keys(IMPORT_DEFS) as (keyof typeof IMPORT_DEFS)[]) {
      const t = parseFileBytes(templateXlsx(kind), "sablon.xlsx");
      const mapping = suggestMapping(t.headers, IMPORT_DEFS[kind].fields);
      expect(missingRequired(IMPORT_DEFS[kind].fields, mapping)).toEqual([]);
      expect(t.rows).toHaveLength(1);
    }
  });
});

describe("dosya doğrulama", () => {
  it("boş, başlıksız ve çok büyük dosyayı reddeder", () => {
    expect(() => parseFileBytes(enc(""), "a.csv")).toThrow(ImportFileError);
    expect(() => parseFileBytes(enc("Ad;Tel\n"), "a.csv")).toThrow(/veri satırı/);
    expect(() => parseFileBytes(new Uint8Array(6 * 1024 * 1024), "a.csv")).toThrow(/büyük/);
  });

  it("aynı içerik aynı özeti verir, farklı içerik farklı (AC-047)", async () => {
    const a = await sha256Hex(enc("Ad;Tel\nAli;1"));
    expect(a).toBe(await sha256Hex(enc("Ad;Tel\nAli;1")));
    expect(a).not.toBe(await sha256Hex(enc("Ad;Tel\nAli;2")));
    expect(a).toHaveLength(64);
  });
});

describe("alan eşleştirme", () => {
  it("farklı yazılmış Türkçe başlıkları alanlara eşler", () => {
    const fields = IMPORT_DEFS.customers.fields;
    const mapping = suggestMapping(["ADI SOYADI", "Cep Telefonu", "KÖY", "AÇIKLAMA"], fields);
    expect(mapping).toEqual({ name: 0, phone: 1, village: 2, notes: 3 });
    expect(applyMapping([["Ali", "0532", "Çamlıca", "not"]], fields, mapping)[0]).toEqual({
      rowNumber: 2, values: { name: "Ali", phone: "0532", village: "Çamlıca", notes: "not" },
    });
  });

  it("bulunamayan zorunlu alanı bildirir; bir sütun iki alana eşlenmez", () => {
    const fields = IMPORT_DEFS["opening-balances"].fields;
    const mapping = suggestMapping(["Müşteri", "Bakiye"], fields);
    expect(missingRequired(fields, mapping).map((f) => f.key)).toEqual(["direction"]);
    const used = Object.values(mapping).filter((v) => v !== null);
    expect(new Set(used).size).toBe(used.length);
  });
});
