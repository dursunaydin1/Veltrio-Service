import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { exportFileName, formatTrDate, toCsv, toXlsx, type Column } from "./export";

type Row = { name: string; amount: number; qty: number; date: string };
const columns: Column<Row>[] = [
  { key: "name", label: "Ad" },
  { key: "amount", label: "Tutar", type: "money" },
  { key: "qty", label: "Miktar", type: "number" },
  { key: "date", label: "Tarih", type: "date" },
];
const rows: Row[] = [
  { name: "Çamlıca Çiftliği; Şube \"A\"", amount: 123450, qty: 2.5, date: "2026-10-05T10:00:00.000Z" },
  { name: "=SUM(A1)", amount: 5, qty: 3, date: "2026-01-02" },
];

describe("CSV dışa aktarma (AC-024)", () => {
  const csv = toCsv(columns, rows);

  it("UTF-8 BOM, noktalı virgül ve CRLF kullanır; Türkçe karakterler bozulmaz", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Ad;Tutar;Miktar;Tarih\r\n");
    expect(csv).toContain("Çamlıca Çiftliği");
    expect(Buffer.from(csv, "utf8").subarray(3, 5).toString("utf8")).toBe("Ad");
  });

  it("tutar virgüllü TL, tarih gg.aa.yyyy, ondalıklı miktar virgüllü", () => {
    expect(csv).toContain(";1234,50;2,5;05.10.2026");
    expect(csv).toContain(";0,05;3;02.01.2026");
  });

  it("ayraç ve tırnak içeren metin tırnaklanır; formül başlangıcı metne çevrilir", () => {
    expect(csv).toContain('"Çamlıca Çiftliği; Şube ""A"""');
    expect(csv).toContain("'=SUM(A1)");
  });
});

describe("XLSX dışa aktarma", () => {
  it("tutarlar gerçek sayı, Türkçe metin ve tarih korunur", () => {
    const bytes = toXlsx("Satışlar", columns, rows);
    const book = XLSX.read(bytes, { type: "array", cellNF: true });
    const sheet = book.Sheets["Satışlar"];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(data[0]).toMatchObject({ Ad: 'Çamlıca Çiftliği; Şube "A"', Tutar: 1234.5, Miktar: 2.5, Tarih: "05.10.2026" });
    expect(sheet["B2"].z).toBe("#,##0.00");
  });
});

describe("yardımcılar", () => {
  it("tarih biçimi ve dosya adı", () => {
    expect(formatTrDate("2026-10-05")).toBe("05.10.2026");
    expect(formatTrDate("belirsiz")).toBe("belirsiz");
    expect(exportFileName("satis-raporu", "csv", "2026-10-31")).toBe("satis-raporu-2026-10-31.csv");
  });
});
