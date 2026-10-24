import { db } from "@/lib/db";
import { getBalances } from "@/lib/stock/ledger";
import { getCustomerBalance, getSupplierBalance, PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import { getCustomerOpenItems } from "@/lib/finance/openItems";
import { unitLabel } from "@/lib/products/constants";
import type { Column } from "@/lib/export/export";
import { MOVEMENT_LABEL, inRange, localDate, type DateRange } from "./calc";

/**
 * Dışa aktarma hedefleri (Adım 6.8): her biri sütun tanımı + satırlar döner. Tutarlar
 * kuruş cinsindendir (`money` sütunları dışa aktarmada TL'ye çevrilir).
 */

const SALE_STATUS_LABEL = { DRAFT: "Taslak", FINAL: "Tamamlandı", CANCELLED: "İptal edildi" } as const;

export type Dataset<T extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  label: string;
  usesRange: boolean;
  columns: Column<T>[];
  load: (businessId: string, range: DateRange) => Promise<T[]>;
};

type Row = Record<string, unknown>;

const customers: Dataset = {
  id: "customers",
  label: "Müşteri listesi",
  usesRange: false,
  columns: [
    { key: "name", label: "Ad soyad" }, { key: "phone", label: "Telefon" }, { key: "village", label: "Köy / mahalle" },
    { key: "address", label: "Adres" }, { key: "notes", label: "Not" }, { key: "balance", label: "Bakiye (+ borçlu)", type: "money" },
  ],
  async load(businessId) {
    const list = (await db.customers.where("business_id").equals(businessId).filter((c) => !c.archived_at).toArray()).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const out: Row[] = [];
    for (const c of list) out.push({ name: c.name, phone: c.phone ?? "", village: c.village ?? "", address: c.address ?? "", notes: c.notes ?? "", balance: (await getCustomerBalance(businessId, c.id)).balance });
    return out;
  },
};

const products: Dataset = {
  id: "products",
  label: "Ürün / stok listesi",
  usesRange: false,
  columns: [
    { key: "name", label: "Ürün" }, { key: "code", label: "Kod" }, { key: "category", label: "Kategori" }, { key: "brand", label: "Marka" },
    { key: "unit", label: "Birim" }, { key: "salePrice", label: "Satış fiyatı", type: "money" }, { key: "lastPurchase", label: "Son alış", type: "money" },
    { key: "available", label: "Satılabilir", type: "number" }, { key: "damaged", label: "Hasarlı", type: "number" }, { key: "critical", label: "Kritik seviye", type: "number" },
  ],
  async load(businessId) {
    const [list, balances] = await Promise.all([db.products.where("business_id").equals(businessId).filter((p) => !p.archived_at).toArray(), getBalances(businessId)]);
    return list.sort((a, b) => a.name.localeCompare(b.name, "tr")).map((p) => ({
      name: p.name, code: p.code ?? "", category: p.category ?? "", brand: p.brand ?? "", unit: unitLabel(p.unit),
      salePrice: Math.round(p.default_sale_price * 100), lastPurchase: p.last_purchase_price != null ? Math.round(p.last_purchase_price * 100) : "",
      available: balances.get(p.id)?.available ?? 0, damaged: balances.get(p.id)?.damaged ?? 0, critical: p.critical_stock_level ?? "",
    }));
  },
};

const salesList: Dataset = {
  id: "sales",
  label: "Satış belgeleri (tarih aralığı)",
  usesRange: true,
  columns: [
    { key: "date", label: "Tarih", type: "date" }, { key: "documentNo", label: "Belge no" }, { key: "customer", label: "Müşteri" },
    { key: "status", label: "Durum" }, { key: "tax", label: "KDV", type: "money" }, { key: "total", label: "Toplam", type: "money" },
  ],
  async load(businessId, range) {
    const [sales, cust] = await Promise.all([db.sales.where("business_id").equals(businessId).toArray(), db.customers.where("business_id").equals(businessId).toArray()]);
    const names = new Map(cust.map((c) => [c.id, c.name]));
    return sales
      .filter((s) => s.status !== "DRAFT" && inRange(localDate(s.sale_date), range))
      .sort((a, b) => a.sale_date.localeCompare(b.sale_date))
      .map((s) => ({ date: localDate(s.sale_date), documentNo: s.document_no, customer: names.get(s.customer_id ?? "") ?? "Müşterisiz", status: SALE_STATUS_LABEL[s.status], tax: Math.round(s.tax_total * 100), total: Math.round(s.total_amount * 100) }));
  },
};

const paymentsList: Dataset = {
  id: "payments",
  label: "Ödeme / tahsilat hareketleri (tarih aralığı)",
  usesRange: true,
  columns: [
    { key: "date", label: "Tarih", type: "date" }, { key: "party", label: "Taraf" }, { key: "direction", label: "Yön" },
    { key: "method", label: "Yöntem" }, { key: "amount", label: "Tutar", type: "money" }, { key: "note", label: "Not" },
  ],
  async load(businessId, range) {
    const [pays, cust, sup] = await Promise.all([db.payments.where("business_id").equals(businessId).toArray(), db.customers.where("business_id").equals(businessId).toArray(), db.suppliers.where("business_id").equals(businessId).toArray()]);
    const names = new Map<string, string>([...cust.map((c) => [c.id, c.name] as const), ...sup.map((s) => [s.id, s.name] as const)]);
    return pays
      .filter((p) => inRange(localDate(p.payment_date), range))
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
      .map((p) => ({
        date: localDate(p.payment_date), party: names.get(p.customer_id ?? p.supplier_id ?? "") ?? "—",
        direction: p.supplier_id ? (p.direction === "OUT" ? "Tedarikçiye ödeme" : "Tedarikçiden iade") : p.direction === "IN" ? "Tahsilat" : "Müşteriye ödeme / ters kayıt",
        method: PAYMENT_METHOD_LABELS[p.method], amount: Math.round(p.amount * 100), note: p.note ?? "",
      }));
  },
};

const customerBalances: Dataset = {
  id: "customer-balances",
  label: "Müşteri bakiyeleri (yaşlandırmalı)",
  usesRange: false,
  columns: [
    { key: "name", label: "Müşteri" }, { key: "balance", label: "Bakiye (+ borçlu)", type: "money" }, { key: "credit", label: "Müşteri alacağı", type: "money" },
    { key: "notDue", label: "Vadesi gelmemiş", type: "money" }, { key: "d7", label: "0-7 gün", type: "money" }, { key: "d30", label: "8-30 gün", type: "money" },
    { key: "d60", label: "31-60 gün", type: "money" }, { key: "d60p", label: "60+ gün", type: "money" },
  ],
  async load(businessId) {
    const list = await db.customers.where("business_id").equals(businessId).toArray();
    const out: Row[] = [];
    for (const c of list.sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
      const o = await getCustomerOpenItems(businessId, c.id);
      if (o.balanceKurus === 0 && o.openKurus === 0) continue;
      out.push({ name: c.name, balance: o.balanceKurus, credit: o.creditKurus, notDue: o.aging.NOT_DUE, d7: o.aging.D0_7, d30: o.aging.D8_30, d60: o.aging.D31_60, d60p: o.aging.D60_PLUS });
    }
    return out;
  },
};

const supplierBalances: Dataset = {
  id: "supplier-balances",
  label: "Tedarikçi bakiyeleri",
  usesRange: false,
  columns: [
    { key: "name", label: "Tedarikçi" }, { key: "opening", label: "Açılış", type: "money" }, { key: "purchased", label: "Alımlar", type: "money" },
    { key: "paid", label: "Ödemeler", type: "money" }, { key: "returned", label: "İadeler", type: "money" }, { key: "balance", label: "Kalan borç", type: "money" },
  ],
  async load(businessId) {
    const list = await db.suppliers.where("business_id").equals(businessId).toArray();
    const out: Row[] = [];
    for (const s of list.sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
      const b = await getSupplierBalance(businessId, s.id);
      if (b.balance === 0 && b.purchased === 0 && b.opening === 0) continue;
      out.push({ name: s.name, opening: b.opening, purchased: b.purchased, paid: b.paid, returned: b.returned, balance: b.balance });
    }
    return out;
  },
};

const movements: Dataset = {
  id: "stock-movements",
  label: "Stok hareketleri (tarih aralığı)",
  usesRange: true,
  columns: [
    { key: "date", label: "Tarih", type: "date" }, { key: "product", label: "Ürün" }, { key: "type", label: "Hareket" },
    { key: "bucket", label: "Kova" }, { key: "quantity", label: "Miktar", type: "number" }, { key: "note", label: "Not / kaynak" },
  ],
  async load(businessId, range) {
    const [moves, prods] = await Promise.all([db.stock_movements.where("business_id").equals(businessId).toArray(), db.products.where("business_id").equals(businessId).toArray()]);
    const names = new Map(prods.map((p) => [p.id, p.name]));
    return moves
      .filter((m) => inRange(localDate(m.created_at), range))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({ date: localDate(m.created_at), product: names.get(m.product_id) ?? "—", type: MOVEMENT_LABEL[m.movement_type] ?? m.movement_type, bucket: m.bucket === "DAMAGED" ? "Hasarlı" : "Satılabilir", quantity: m.quantity, note: m.note ?? "" }));
  },
};

export const DATASETS: Dataset[] = [customers, products, salesList, paymentsList, customerBalances, supplierBalances, movements];
