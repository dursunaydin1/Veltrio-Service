import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getBalances } from "@/lib/stock/ledger";
import { searchAll } from "@/lib/search/globalSearch";
import { loadActiveServices, loadSalesReport, loadStockReport } from "@/lib/reports/load";
import { getCustomerOpenItems } from "@/lib/finance/openItems";

/**
 * Büyük veri hacminde yerel performans (Adım 7.4, NFR-003): 500+ müşteri, 1000+ servis, binlerce
 * hareket. Eşikler, taklit IndexedDB'nin gerçek tarayıcıdan yavaş olduğu düşünülerek cömert
 * tutulmuştur; amaç ölçeklenme hatalarını (O(n²) tarama, tüm tabloyu dolaşma) yakalamaktır.
 */

const B = "00000000-0000-0000-0000-000000000001";
const N_CUSTOMERS = 800;
const N_SERVICES = 1500;
const N_PRODUCTS = 1200;
const N_MOVEMENTS = 6000;
const N_SALES = 1500;

const iso = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 3_600_000 * 5).toISOString();

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

beforeAll(async () => {
  for (const t of db.tables) await t.clear();
  await db.customers.bulkAdd(
    Array.from({ length: N_CUSTOMERS }, (_, i) => ({
      id: `c${i}`, business_id: B, name: `Müşteri ${i} Yılmaz`, phone: `053${String(1000000 + i).slice(0, 7)}`,
      phone_normalized: `53${String(10000000 + i)}`, village: `Köy ${i % 40}`, created_at: iso(i), updated_at: iso(i),
    })) as never[]
  );
  await db.machines.bulkAdd(
    Array.from({ length: N_CUSTOMERS }, (_, i) => ({
      id: `m${i}`, business_id: B, customer_id: `c${i}`, type: "Testere", brand: "Stihl", model: `MS ${i}`, serial_number: `SN-${i}`,
      internal_number: `MK-DEMO-AB23-${String(i).padStart(5, "0")}`, is_temporary: false, created_at: iso(i), updated_at: iso(i),
    })) as never[]
  );
  await db.services.bulkAdd(
    Array.from({ length: N_SERVICES }, (_, i) => ({
      id: `s${i}`, business_id: B, customer_id: `c${i % N_CUSTOMERS}`, machine_id: `m${i % N_CUSTOMERS}`, document_no: `S-DEMO-AB23-2026-${String(i).padStart(5, "0")}`,
      status: i % 3 === 0 ? "IN_PROGRESS" : "DELIVERED", customer_complaint: "Çalışmıyor", total_amount: 500, labor_fee: 500, deposit_amount: 0,
      first_completed_at: i % 3 === 0 ? undefined : iso(i), promised_date: "2026-10-30", received_date: iso(i), is_warranty_claim: false,
      created_by_device: "D", created_at: iso(i), updated_at: iso(i),
    })) as never[]
  );
  await db.products.bulkAdd(
    Array.from({ length: N_PRODUCTS }, (_, i) => ({
      id: `p${i}`, business_id: B, name: `Ürün ${i}`, code: `K-${i}`, unit: "ADET", is_serial_tracked: false, default_sale_price: 100,
      default_tax_mode: "NONE", default_tax_rate: 0, critical_stock_level: 5, stock_available: 0, stock_damaged: 0, created_at: iso(i), updated_at: iso(i),
    })) as never[]
  );
  await db.stock_movements.bulkAdd(
    Array.from({ length: N_MOVEMENTS }, (_, i) => ({
      id: `mv${i}`, business_id: B, product_id: `p${i % N_PRODUCTS}`, movement_type: i % 4 === 0 ? "SALE_OUT" : "PURCHASE_IN", bucket: "AVAILABLE",
      quantity: i % 4 === 0 ? -1 : 3, created_by_device: "D", created_at: iso(i),
    })) as never[]
  );
  await db.sales.bulkAdd(
    Array.from({ length: N_SALES }, (_, i) => ({
      id: `sa${i}`, business_id: B, customer_id: `c${i % N_CUSTOMERS}`, document_no: `SAT-DEMO-AB23-2026-${String(i).padStart(5, "0")}`,
      sale_date: iso(i), subtotal: 100, discount_total: 0, tax_total: 0, total_amount: 100, status: "FINAL", finalized_at: iso(i),
      created_by_device: "D", created_at: iso(i), updated_at: iso(i),
    })) as never[]
  );
}, 60_000);

describe("büyük veri hacminde yerel işlemler (NFR-003)", () => {
  it("genel arama (isim, telefon, seri no) 1,5 sn altında", async () => {
    for (const q of ["Müşteri 77", "053100", "SN-412", "Ürün 9"]) {
      const { ms, value } = await timed(() => searchAll(B, q));
      expect(ms, `“${q}” araması ${ms.toFixed(0)} ms`).toBeLessThan(1500);
      expect(value.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("tüm ürünlerin stok bakiyesi (6.000 hareketten) 2 sn altında ve doğru", async () => {
    const { ms, value } = await timed(() => getBalances(B));
    expect(ms).toBeLessThan(2000);
    // her ürün: 5 hareket → 3 giriş (+9) ve 1-2 çıkış; toplamı hareketlerin toplamına eşit
    const total = [...value.values()].reduce((a, b) => a + b.available, 0);
    expect(total).toBe((N_MOVEMENTS - 1500) * 3 - 1500);
  }, 30_000);

  it("satış, aktif servis ve stok raporları 3 sn altında", async () => {
    const range = { from: "2026-01-01", to: "2026-12-31" };
    expect((await timed(() => loadSalesReport(B, range, "month"))).ms).toBeLessThan(3000);
    expect((await timed(() => loadActiveServices(B))).ms).toBeLessThan(3000);
    expect((await timed(() => loadStockReport(B, range))).ms).toBeLessThan(3000);
  }, 30_000);

  it("tek müşterinin açık kalemleri (kart açılışı) 1 sn altında", async () => {
    const { ms } = await timed(() => getCustomerOpenItems(B, "c5"));
    expect(ms).toBeLessThan(1000);
  }, 30_000);
});

describe("dokunma hedefleri ve erişilebilirlik (NFR-001, NFR-013)", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf-8");

  it("en küçük düğme boyutu 44 px (--touch-min) ve eşitleme göstergesi de öyle", () => {
    expect(css).toMatch(/--touch-min:\s*44px/);
    expect(css).toMatch(/\.btn-sm\s*\{[^}]*min-height:\s*var\(--touch-min\)/);
    const pill = /\.sync-pill\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(pill).toMatch(/min-height:\s*var\(--touch-min\)/);
  });

  it("içeriğe geç bağlantısı ve odak çerçevesi tanımlı", () => {
    expect(css).toMatch(/\.skip-link/);
    expect(css).toMatch(/:focus-visible/);
  });
});
