import { describe, expect, it } from "vitest";
import type { Service, ServiceOperation, ServicePart } from "@/lib/db";
import { RECEIPT_DEFAULT_TERMS, RECEIPT_DISCLAIMER, buildReceiptModel, type ReceiptSource } from "./receipt";

const service: Service = {
  id: "s1",
  business_id: "b",
  document_no: "S-DEMO-AB23-2026-00007",
  customer_id: "c1",
  machine_id: "m1",
  status: "DELIVERED",
  customer_complaint: "Zor çalışıyor",
  diagnosis: "Buji ölmüş",
  resolution: "Buji değişti",
  existing_damage: "Sol kapakta çizik",
  received_accessories: "Zincir kılıfı",
  promised_date: "2026-11-05",
  deposit_amount: 100,
  labor_fee: 500,
  total_amount: 625.5,
  received_date: "2026-10-22T07:00:00Z",
  delivered_date: "2026-10-25T10:00:00Z",
  delivered_to: "Oğlu Mehmet",
  delivery_balance: 125.5,
  debt_acknowledged: true,
  is_warranty_claim: false,
  created_by_device: "X",
  created_at: "",
  updated_at: "",
};

const op = (description: string, total: number, status: ServiceOperation["status"]): ServiceOperation => ({
  id: description, business_id: "b", service_id: "s1", description, quantity: 1, unit_price: total,
  discount_amount: 0, tax_mode: "NONE", tax_rate: 0, line_total: total, price_pending: false, status,
  created_at: "", updated_at: "",
});

const part = (description: string, total: number, status: ServicePart["status"]): ServicePart => ({
  id: description, business_id: "b", service_id: "s1", description_snapshot: description, quantity: 1, unit: "ADET",
  unit_price_snapshot: total,
  // İç maliyet: müşteri çıktısında hiçbir yerde görünmemeli (AC-034)
  unit_cost_snapshot: 61.37, source_type: "STOCK_PRODUCT", status, used_quantity: 1, supply_status: "IN_STOCK",
  discount_amount: 0, tax_mode: "NONE", tax_rate: 0, line_total: total, created_at: "", updated_at: "",
});

const source = (over: Partial<ReceiptSource> = {}): ReceiptSource => ({
  business: { name: "Demo Tarım Servisi", phone: "0532 000 00 00", address: "Merkez", settings: {} as never },
  service,
  customer: { name: "Ali Yılmaz", phone: "0532 123 45 67", village: "Çamlıca" },
  machine: { type: "Zincirli testere", brand: "Stihl", model: "MS 180", serial_number: "SN-1", internal_number: "MK-DEMO-AB23-00001" },
  operations: [op("Karbüratör ayarı", 500, "APPROVED"), op("Reddedilen iş", 300, "REJECTED")],
  parts: [part("NGK Buji", 125.5, "APPROVED"), part("Ertelenen parça", 90, "DEFERRED")],
  balance: { total: 62550, paid: 50000, remaining: 12550 },
  ...over,
});

describe("buildReceiptModel", () => {
  it("kabul fişi: müşteri, makine, şikâyet, hasar, aksesuar, teslim sözü ve kapora; kalem ve teşhis yok", () => {
    const m = buildReceiptModel("intake", source());
    expect(m.title).toBe("Servis Kabul Fişi");
    expect(m).toMatchObject({
      documentNo: "S-DEMO-AB23-2026-00007",
      customer: { name: "Ali Yılmaz", village: "Çamlıca" },
      machine: { title: "Stihl MS 180", identifier: "Seri no: SN-1 · İç no: MK-DEMO-AB23-00001" },
      complaint: "Zor çalışıyor",
      existingDamage: "Sol kapakta çizik",
      accessories: "Zincir kılıfı",
      promisedDate: "2026-11-05",
      deposit: 100,
      terms: RECEIPT_DEFAULT_TERMS,
      disclaimer: RECEIPT_DISCLAIMER,
    });
    expect(m.lines).toEqual([]);
    expect(m.diagnosis).toBeUndefined();
    expect(m.delivery).toBeUndefined();
  });

  it("sonuç özeti: yalnızca faturalanan kalemler (reddedilen/ertelenen yok), toplam, tahsil edilen, kalan", () => {
    const m = buildReceiptModel("summary", source());
    expect(m.title).toBe("Servis Sonuç Özeti");
    expect(m.lines.map((l) => l.description)).toEqual(["Karbüratör ayarı", "NGK Buji"]);
    expect(m).toMatchObject({ total: 625.5, paid: 500, remaining: 125.5, diagnosis: "Buji ölmüş", resolution: "Buji değişti" });
  });

  it("teslim bilgisi ve borçlu teslim özette görünür", () => {
    const m = buildReceiptModel("summary", source());
    expect(m.delivery).toMatchObject({ to: "Oğlu Mehmet", debtBalance: 125.5, debtAcknowledged: true });
  });

  it("iç maliyet bilgisi hiçbir çıktıda yer almaz (AC-034)", () => {
    for (const type of ["intake", "summary"] as const) {
      const json = JSON.stringify(buildReceiptModel(type, source()));
      expect(json).not.toContain("61.37");
      expect(json).not.toMatch(/cost|maliyet/i);
    }
  });

  it("fazla ödeme 'kalan' olarak negatif gösterilmez; işletme alt metni varsa onu kullanır", () => {
    const m = buildReceiptModel(
      "summary",
      source({
        balance: { total: 10000, paid: 15000, remaining: -5000 },
        business: { name: "X", settings: { receipt_terms: "Özel koşullar" } as never },
      })
    );
    expect(m.remaining).toBe(0);
    expect(m.terms).toBe("Özel koşullar");
  });

  it("belge resmî fatura olarak adlandırılmaz", () => {
    const m = buildReceiptModel("summary", source());
    expect(m.title).not.toMatch(/fatura/i);
    expect(m.disclaimer).toMatch(/fatura yerine geçmez/);
  });

  it("müşteri / makine yoksa tire gösterilir", () => {
    const m = buildReceiptModel("intake", source({ customer: undefined, machine: undefined }));
    expect(m.customer.name).toBe("—");
    expect(m.machine.title).toBe("—");
  });
});
