import { db } from "@/lib/db";
import type { Sale, SaleItem } from "@/lib/db";
import { fromKurus, lineGross, toKurus } from "@/lib/calc";
import { recordDocumentPayment, reversePayment, reversedPaymentIds } from "@/lib/finance/service";
import {
  attachSaleToMachine,
  changeMachineOwner,
  createMachine,
  detachSaleFromMachine,
  findMachinesBySerial,
  setMachineArchived,
} from "@/lib/machines/service";
import { nextDocumentNo } from "@/lib/numbering";
import { serialUnitPayload, unitLabel } from "@/lib/serial/service";
import { computeSaleTotals } from "./totals";
import { getProductBalance } from "@/lib/stock/ledger";
import { recordMovement } from "@/lib/stock/service";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { Payment, PaymentMethod, Product, TaxMode } from "@/types";

export type SaleContext = BusinessContext & {
  /** İşletme ayarı: stok eksiye düşebilir mi? (varsayılan false, ST-002) */
  allowNegativeStock?: boolean;
};

export class SaleRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleRuleError";
  }
}

/** Stok eksiye düşecek ve ayar buna izin veriyor; ancak neden girilmedi (ST-004). */
export class NegativeStockReasonRequiredError extends SaleRuleError {
  constructor(public readonly productNames: string[]) {
    super(`Stok yetersiz (${productNames.join(", ")}). Stoğu eksiye düşürmek için neden yazın.`);
    this.name = "NegativeStockReasonRequiredError";
  }
}

export type SaleLineInput = {
  productId: string;
  quantity: number;
  /** kuruş */
  unitPriceKurus: number;
  /** satırın kendi indirimi (toplam), kuruş */
  discountKurus?: number;
  taxMode: TaxMode;
  taxRate: number;
  /** Seri takipli ürün (makine) satışında satılacak birim; miktar 1 olmalıdır */
  serialUnitId?: string;
};

export type SaleInput = {
  /** Boşsa müşterisiz (peşin) satış; tahsil edilmeyen tutar varsa müşteri zorunludur (AC-041) */
  customerId?: string;
  /** YYYY-MM-DD; boşsa şimdi */
  saleDate?: string;
  notes?: string;
  lines: SaleLineInput[];
  /** Belge geneli indirim (kuruş): satırlara tutara orantılı dağıtılır ve satır indirimine yazılır */
  documentDiscountKurus?: number;
};

export type SalePaymentInput = { amountKurus: number; method: PaymentMethod };

const SALE_COLUMNS = [
  "customer_id",
  "document_no",
  "sale_date",
  "subtotal",
  "discount_total",
  "tax_total",
  "total_amount",
  "status",
  "cancel_reason",
  "notes",
  "finalized_at",
  "created_by_device",
  "created_at",
] as const;
const SALE_UPDATE_COLUMNS = SALE_COLUMNS.filter((c) => !["document_no", "created_by_device", "created_at"].includes(c));

const ITEM_COLUMNS = [
  "sale_id",
  "product_id",
  "serial_unit_id",
  "machine_id",
  "description_snapshot",
  "quantity",
  "unit",
  "unit_price_snapshot",
  "unit_cost_snapshot",
  "discount_amount",
  "tax_mode",
  "tax_rate",
  "line_total",
  "stock_movement_id",
  "created_at",
] as const;

function salePayload(s: Sale, update: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: s.id, business_id: s.business_id };
  for (const c of update ? SALE_UPDATE_COLUMNS : SALE_COLUMNS) payload[c] = s[c] ?? null;
  if (update) payload.version = s.version ?? 1;
  return payload;
}

function itemPayload(i: SaleItem & { version?: number }, update: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: i.id, business_id: i.business_id };
  for (const c of ITEM_COLUMNS) payload[c] = i[c] ?? null;
  if (update) payload.version = i.version ?? 1;
  return payload;
}

const tidy = (v?: string) => v?.trim() || undefined;

const isoOf = (date?: string): string => {
  if (!date) return nowISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SaleRuleError("Satış tarihi geçersiz.");
  return `${date}T12:00:00.000Z`;
};

function tables() {
  return [
    db.sales,
    db.sale_items,
    db.customers,
    db.machines,
    db.machine_ownership_history,
    db.products,
    db.product_serial_units,
    db.stock_movements,
    db.payments,
    db.counters,
    db.sync_queue,
    db.audit_logs,
  ] as const;
}

type Built = {
  items: SaleItem[];
  totals: { subtotal: number; discountTotal: number; taxTotal: number; total: number };
};

/** Satırları doğrular; satır + belge indirimini dağıtıp tutarları kuruş hassasiyetiyle hesaplar. */
async function buildItems(ctx: SaleContext, saleId: string, input: SaleInput, createdAt: string): Promise<Built> {
  if (input.lines.length === 0) throw new SaleRuleError("En az bir ürün ekleyin.");

  const products: Product[] = [];
  const usedUnits = new Set<string>();
  for (const line of input.lines) {
    const product = await db.products.get(line.productId);
    if (!product || product.business_id !== ctx.businessId) throw new SaleRuleError("Ürün bulunamadı.");
    if (product.archived_at) throw new SaleRuleError(`“${product.name}” pasif ürün; satılamaz.`);
    if (!(line.quantity > 0)) throw new SaleRuleError("Miktar sıfırdan büyük olmalıdır.");
    if (product.is_serial_tracked) {
      // Makine satışı: belirli bir stoktaki birim seçilir, müşteri zorunludur (AC-027, AC-039).
      if (!input.customerId) throw new SaleRuleError(`“${product.name}” makine satışı için müşteri seçin.`);
      if (line.quantity !== 1) throw new SaleRuleError(`“${product.name}”: makine satışında miktar 1 olmalıdır.`);
      const unit = line.serialUnitId ? await db.product_serial_units.get(line.serialUnitId) : undefined;
      if (!unit || unit.product_id !== product.id || unit.business_id !== ctx.businessId) {
        throw new SaleRuleError(`“${product.name}” için satılacak birimi seçin.`);
      }
      if (unit.status !== "IN_STOCK") {
        throw new SaleRuleError(`“${unitLabel(unit)}” birimi stokta değil (daha önce satılmış olabilir).`);
      }
      if (usedUnits.has(unit.id)) throw new SaleRuleError(`“${unitLabel(unit)}” birimi bu satışta birden fazla kez seçilmiş.`);
      usedUnits.add(unit.id);
    } else if (line.serialUnitId) {
      throw new SaleRuleError(`“${product.name}” seri takipli bir ürün değil; birim seçilemez.`);
    }
    let gross: number;
    try {
      gross = lineGross(line.unitPriceKurus, line.quantity);
    } catch (e) {
      throw new SaleRuleError(e instanceof Error ? e.message : "Tutar hesaplanamadı.");
    }
    if ((line.discountKurus ?? 0) > gross || (line.discountKurus ?? 0) < 0) {
      throw new SaleRuleError(`“${product.name}”: indirim satır tutarından büyük olamaz.`);
    }
    products.push(product);
  }

  // Tutarlar: satır indirimi + belge indirimi dağıtımı, ekran önizlemesiyle aynı fonksiyon.
  let computed;
  try {
    computed = computeSaleTotals(input.lines, input.documentDiscountKurus ?? 0);
  } catch (e) {
    throw new SaleRuleError(e instanceof Error ? e.message : "Tutar hesaplanamadı.");
  }

  const items: SaleItem[] = input.lines.map((line, i) => {
    const product = products[i];
    return {
      id: generateId(),
      business_id: ctx.businessId,
      sale_id: saleId,
      product_id: product.id,
      serial_unit_id: line.serialUnitId,
      description_snapshot: product.name,
      quantity: line.quantity,
      unit: product.unit,
      unit_price_snapshot: fromKurus(line.unitPriceKurus),
      unit_cost_snapshot: product.last_purchase_price ?? 0,
      discount_amount: fromKurus(computed.lines[i].discountKurus),
      tax_mode: line.taxMode,
      tax_rate: line.taxRate,
      line_total: fromKurus(computed.lines[i].result.total),
      // Satır sırası korunsun diye her satıra 1 ms eklenir.
      created_at: new Date(Date.parse(createdAt) + i).toISOString(),
    };
  });

  return { items, totals: computed.totals };
}

async function checkCustomer(ctx: SaleContext, customerId?: string): Promise<void> {
  if (!customerId) return;
  const customer = await db.customers.get(customerId);
  if (!customer || customer.business_id !== ctx.businessId) throw new SaleRuleError("Müşteri bulunamadı.");
  if (customer.archived_at) throw new SaleRuleError("Arşivlenmiş müşteriye satış yapılamaz.");
}

/** Taslak kaydını (satır + toplamlar) yazar; oluşturma ve düzenleme için ortak. */
async function persist(ctx: SaleContext, input: SaleInput, existing?: Sale): Promise<Sale> {
  await checkCustomer(ctx, input.customerId);
  const now = nowISO();
  const id = existing?.id ?? generateId();
  const { items, totals } = await buildItems(ctx, id, input, now);

  const sale: Sale = {
    ...(existing ?? {
      id,
      business_id: ctx.businessId,
      document_no: await nextDocumentNo("sale", ctx.deviceCode),
      status: "DRAFT" as const,
      created_by_device: ctx.deviceCode,
      created_at: now,
    }),
    customer_id: input.customerId,
    sale_date: isoOf(input.saleDate),
    subtotal: fromKurus(totals.subtotal),
    discount_total: fromKurus(totals.discountTotal),
    tax_total: fromKurus(totals.taxTotal),
    total_amount: fromKurus(totals.total),
    notes: tidy(input.notes),
    updated_at: now,
  };

  if (existing) {
    const old = await db.sale_items.where("sale_id").equals(id).toArray();
    for (const o of old) {
      await db.sale_items.delete(o.id);
      await enqueue("sale_items", o.id, "DELETE", itemPayload(o, true), ctx.deviceCode);
    }
    await db.sales.put(sale);
    await enqueue("sales", id, "UPDATE", salePayload(sale, true), ctx.deviceCode);
  } else {
    await db.sales.add(sale);
    await enqueue("sales", id, "INSERT", salePayload(sale, false), ctx.deviceCode);
  }
  for (const item of items) {
    await db.sale_items.add(item);
    await enqueue("sale_items", item.id, "INSERT", itemPayload(item, false), ctx.deviceCode);
  }
  return sale;
}

/**
 * Kesinleştirme (§5.3): stok düşer (SALE_OUT, maliyet snapshot'ıyla), tahsilat
 * kaydedilir. Tahsil edilmeyen tutar varsa müşteri zorunludur (AC-041); fazla
 * tahsilat kabul edilmez. Taslak belge stok/finans üretmez (ST-006).
 */
async function applyFinalize(
  ctx: SaleContext,
  sale: Sale,
  payment: SalePaymentInput | undefined,
  negativeStockReason?: string
): Promise<Sale> {
  const totalKurus = toKurus(sale.total_amount);
  const paidKurus = payment?.amountKurus ?? 0;
  if (payment && (!Number.isInteger(payment.amountKurus) || payment.amountKurus <= 0)) {
    throw new SaleRuleError("Alınan tutar sıfırdan büyük olmalıdır.");
  }
  if (paidKurus > totalKurus) throw new SaleRuleError("Alınan tutar satış toplamından fazla olamaz.");
  if (paidKurus < totalKurus && !sale.customer_id) {
    throw new SaleRuleError("Tahsil edilmeyen tutar var: veresiye satış için müşteri seçin.");
  }

  const items = await db.sale_items.where("sale_id").equals(sale.id).toArray();

  // Stok yeterli mi? Aynı ürünün satırları toplanır. Ayar eksi stoğa izin veriyorsa neden istenir (ST-004).
  const needed = new Map<string, { name: string; qty: number }>();
  for (const i of items) {
    if (!i.product_id) continue;
    const row = needed.get(i.product_id) ?? { name: i.description_snapshot, qty: 0 };
    row.qty = Math.round((row.qty + i.quantity) * 10000) / 10000;
    needed.set(i.product_id, row);
  }
  if (ctx.allowNegativeStock) {
    const short: string[] = [];
    for (const [productId, row] of needed) {
      if ((await getProductBalance(productId)).available < row.qty) short.push(row.name);
    }
    if (short.length > 0 && !negativeStockReason?.trim()) throw new NegativeStockReasonRequiredError(short);
  }

  const movementNote = [sale.document_no, negativeStockReason?.trim()].filter(Boolean).join(" · ");
  for (const item of items) {
    if (!item.product_id) continue;
    const product = await db.products.get(item.product_id);

    if (product?.is_serial_tracked) {
      await sellSerialUnit(ctx, sale, item, product, movementNote);
      continue;
    }
    const unitCost = product?.last_purchase_price ?? item.unit_cost_snapshot;
    const movement = await recordMovement(ctx, {
      productId: item.product_id,
      type: "SALE_OUT",
      quantity: -item.quantity,
      unitCost,
      sourceType: "SALE",
      sourceId: sale.id,
      note: movementNote,
    });
    const next = { ...item, unit_cost_snapshot: unitCost, stock_movement_id: movement.id } as SaleItem & { version?: number };
    await db.sale_items.put(next);
    await enqueue("sale_items", item.id, "UPDATE", itemPayload(next, true), ctx.deviceCode);
  }

  const now = nowISO();
  const final: Sale = { ...sale, status: "FINAL", finalized_at: now, updated_at: now };
  await db.sales.put(final);
  await enqueue("sales", sale.id, "UPDATE", salePayload(final, true), ctx.deviceCode);

  if (payment) {
    await recordDocumentPayment(ctx, {
      customerId: sale.customer_id,
      direction: "IN",
      method: payment.method,
      amountKurus: payment.amountKurus,
      note: `Satış tahsilatı (${sale.document_no})`,
      sourceType: "SALE",
      sourceId: sale.id,
    });
  }
  return final;
}

/**
 * Makine satışı (§5.3, AC-027, AC-039): seçilen stoktaki birim satılır. Birim
 * hâlâ stokta değilse (aynı birim iki kez satılamaz) satış reddedilir. Aynı
 * marka + seri numaralı makine kaydı müşteriye ait olarak zaten varsa o kayıt
 * kullanılır (çift kayıt açılmaz); başka müşteri adınaysa sahiplik geçmişe
 * yazılarak devredilir; yoksa yeni makine kaydı açılır. Birim SOLD olur ve
 * makineye bağlanır; maliyet, birimin alış hareketinden alınır.
 */
async function sellSerialUnit(
  ctx: SaleContext,
  sale: Sale,
  item: SaleItem,
  product: Product,
  note: string
): Promise<void> {
  if (!sale.customer_id) throw new SaleRuleError("Makine satışı için müşteri seçin.");
  const unit = item.serial_unit_id ? await db.product_serial_units.get(item.serial_unit_id) : undefined;
  if (!unit || unit.product_id !== product.id) throw new SaleRuleError("Seri birim bulunamadı.");
  if (unit.status !== "IN_STOCK") {
    throw new SaleRuleError(`“${unitLabel(unit)}” birimi stokta değil (daha önce satılmış olabilir).`);
  }

  const intake = (await db.stock_movements.where("product_id").equals(product.id).toArray()).find(
    (m) => m.serial_unit_id === unit.id && m.quantity > 0
  );
  const unitCost = intake?.unit_cost ?? product.last_purchase_price ?? item.unit_cost_snapshot;

  // Makine kaydı: mevcutsa kullan, yoksa aç.
  const saleInfo = { saleId: sale.id, saleDate: sale.sale_date, salePrice: item.line_total };
  const [existing] = unit.serial_number
    ? await findMachinesBySerial(ctx.businessId, product.brand, unit.serial_number)
    : [];
  let machineId: string;
  if (existing) {
    if (existing.customer_id !== sale.customer_id) {
      await changeMachineOwner(ctx, existing.id, sale.customer_id, `Makine satışı (${sale.document_no})`);
    }
    await attachSaleToMachine(ctx, existing.id, saleInfo);
    machineId = existing.id;
  } else {
    const machine = await createMachine(ctx, {
      customer_id: sale.customer_id,
      type: product.category || "Makine",
      brand: product.brand,
      model: product.model || product.name,
      serial_number: unit.serial_number,
      is_temporary: false,
      sale_id: sale.id,
      sale_date: sale.sale_date,
      sale_price: item.line_total,
    });
    machineId = machine.id;
  }

  const movement = await recordMovement(ctx, {
    productId: product.id,
    type: "SALE_OUT",
    quantity: -1,
    unitCost,
    serialUnitId: unit.id,
    sourceType: "SALE",
    sourceId: sale.id,
    note,
  });

  const sold = { ...unit, status: "SOLD" as const, machine_id: machineId, sale_item_id: item.id, updated_at: nowISO() };
  await db.product_serial_units.put(sold);
  await enqueue("product_serial_units", unit.id, "UPDATE", serialUnitPayload(sold, true), ctx.deviceCode);

  const next = { ...item, unit_cost_snapshot: unitCost, stock_movement_id: movement.id, machine_id: machineId } as SaleItem & {
    version?: number;
  };
  await db.sale_items.put(next);
  await enqueue("sale_items", item.id, "UPDATE", itemPayload(next, true), ctx.deviceCode);
}

export type SaleCreateOptions = {
  /** true: tek adımda kesinleştirir (hızlı satış); false: taslak */
  finalize: boolean;
  payment?: SalePaymentInput;
  /** Eksi stoğa izin verilen işletmede stok yetersizse zorunlu neden */
  negativeStockReason?: string;
};

/** Satış oluşturur: taslak ya da doğrudan kesinleşmiş (hızlı satış). */
export async function createSale(ctx: SaleContext, input: SaleInput, options: SaleCreateOptions): Promise<Sale> {
  if (options.payment && !options.finalize) {
    throw new SaleRuleError("Tahsilat, satış kesinleştirilirken alınır.");
  }
  return db.transaction("rw", [...tables()], async () => {
    const draft = await persist(ctx, input);
    return options.finalize ? applyFinalize(ctx, draft, options.payment, options.negativeStockReason) : draft;
  });
}

async function loadDraft(ctx: SaleContext, id: string): Promise<Sale> {
  const sale = await db.sales.get(id);
  if (!sale || sale.business_id !== ctx.businessId) throw new SaleRuleError("Satış bulunamadı.");
  if (sale.status !== "DRAFT") {
    throw new SaleRuleError("Yalnızca taslak satış düzenlenebilir. Kesinleşmiş satış iptal veya iade ile düzeltilir.");
  }
  return sale;
}

export async function updateDraftSale(ctx: SaleContext, id: string, input: SaleInput): Promise<Sale> {
  return db.transaction("rw", [...tables()], async () => persist(ctx, input, await loadDraft(ctx, id)));
}

/** Taslak satışı kesinleştirir. */
export async function finalizeSale(
  ctx: SaleContext,
  id: string,
  options: { payment?: SalePaymentInput; negativeStockReason?: string } = {}
): Promise<Sale> {
  return db.transaction("rw", [...tables()], async () =>
    applyFinalize(ctx, await loadDraft(ctx, id), options.payment, options.negativeStockReason)
  );
}

/** Taslak satışı iptal eder (neden zorunlu). Stok ve finans etkisi yoktur. */
export async function cancelDraftSale(ctx: SaleContext, id: string, reason: string): Promise<Sale> {
  const why = reason.trim();
  if (!why) throw new SaleRuleError("İptal nedeni zorunludur.");
  return db.transaction("rw", [...tables()], async () => {
    const draft = await loadDraft(ctx, id);
    const next: Sale = { ...draft, status: "CANCELLED", cancel_reason: why, updated_at: nowISO() };
    await db.sales.put(next);
    await enqueue("sales", id, "UPDATE", salePayload(next, true), ctx.deviceCode);
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "sales",
      entityId: id,
      action: "STATE_CHANGE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason: why,
      oldValue: { status: "DRAFT" },
      newValue: { status: "CANCELLED" },
    });
    return next;
  });
}

/**
 * Kesinleşmiş satışı iptal eder (§9.6, AC-044). İade değil, hatalı kaydın
 * düzeltmesidir: belge silinmez, CANCELLED olur; her şey ters kayıtla geri alınır.
 *  - stok: her satış hareketi için ters hareket (CANCEL_REVERSAL); seri birim IN_STOCK olur
 *  - ödemeler: alınan her tahsilat için karşı yönlü ters ödeme (para iadesi)
 *  - makine satışı: makineden satış bilgisi kalkar; satışla devredilen makine eski sahibine
 *    döner (sahiplik geçmişine yazılır); satışla açılmış, servisi olmayan makine arşivlenir
 */
export async function cancelFinalSale(ctx: SaleContext, id: string, reason: string): Promise<Sale> {
  const why = reason.trim();
  if (!why) throw new SaleRuleError("İptal nedeni zorunludur.");
  return db.transaction("rw", [...tables(), db.payment_allocations, db.services], async () => {
    const sale = await db.sales.get(id);
    if (!sale || sale.business_id !== ctx.businessId) throw new SaleRuleError("Satış bulunamadı.");
    if (sale.status !== "FINAL") throw new SaleRuleError("Yalnızca kesinleşmiş satış bu şekilde iptal edilir.");
    const note = `Satış iptali (${sale.document_no}): ${why}`;

    for (const item of await getSaleItems(id)) {
      const original = item.stock_movement_id ? await db.stock_movements.get(item.stock_movement_id) : undefined;
      if (!original) continue;
      await recordMovement(ctx, {
        productId: original.product_id,
        type: "CANCEL_REVERSAL",
        bucket: original.bucket,
        quantity: -original.quantity,
        unitCost: original.unit_cost,
        sourceType: "SALE",
        sourceId: id,
        note,
        reversalOfId: original.id,
        serialUnitId: original.serial_unit_id,
      });

      if (original.serial_unit_id) {
        const unit = await db.product_serial_units.get(original.serial_unit_id);
        if (unit) {
          const back = { ...unit, status: "IN_STOCK" as const, machine_id: undefined, sale_item_id: undefined, updated_at: nowISO() };
          await db.product_serial_units.put(back);
          await enqueue("product_serial_units", unit.id, "UPDATE", serialUnitPayload(back, true), ctx.deviceCode);
        }
      }
      if (item.machine_id) await undoMachineSale(ctx, sale, item.machine_id, note);
    }

    const payments = await getSalePayments(id);
    const reversed = reversedPaymentIds(payments);
    for (const p of payments) {
      if (p.direction === "IN" && !p.reversal_of_id && !reversed.has(p.id)) {
        await reversePayment(ctx, p.id, note);
      }
    }

    const next: Sale = { ...sale, status: "CANCELLED", cancel_reason: why, updated_at: nowISO() };
    await db.sales.put(next);
    await enqueue("sales", id, "UPDATE", salePayload(next, true), ctx.deviceCode);
    await writeAuditLog({
      businessId: ctx.businessId,
      entityType: "sales",
      entityId: id,
      action: "STATE_CHANGE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason: why,
      oldValue: { status: "FINAL" },
      newValue: { status: "CANCELLED" },
    });
    return next;
  });
}

async function undoMachineSale(ctx: SaleContext, sale: Sale, machineId: string, note: string): Promise<void> {
  const machine = await db.machines.get(machineId);
  if (!machine || machine.sale_id !== sale.id) return;
  await detachSaleFromMachine(ctx, machineId);

  const history = await db.machine_ownership_history.where("machine_id").equals(machineId).toArray();
  const transfer = history
    .filter((h) => h.reason === `Makine satışı (${sale.document_no})`)
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    .pop();
  if (transfer?.old_customer_id) {
    await changeMachineOwner(ctx, machineId, transfer.old_customer_id, note);
    return;
  }
  const createdBySale = machine.created_at >= sale.created_at && history.length === 0;
  if (createdBySale && (await db.services.where("machine_id").equals(machineId).count()) === 0) {
    await setMachineArchived(ctx, machineId, true, note);
  }
}

/** Kesinleşmiş satışa sonradan tahsilat (veresiye ödemesi). */
export async function collectSalePayment(
  ctx: SaleContext,
  id: string,
  params: { amountKurus: number; method: PaymentMethod; note?: string }
): Promise<Payment> {
  return db.transaction("rw", [db.sales, db.customers, db.payments, db.sync_queue], async () => {
    const sale = await db.sales.get(id);
    if (!sale || sale.business_id !== ctx.businessId) throw new SaleRuleError("Satış bulunamadı.");
    if (sale.status !== "FINAL") throw new SaleRuleError("Tahsilat yalnızca kesinleşmiş satış için alınır.");
    return recordDocumentPayment(ctx, {
      customerId: sale.customer_id,
      direction: "IN",
      method: params.method,
      amountKurus: params.amountKurus,
      note: params.note?.trim() || `Satış tahsilatı (${sale.document_no})`,
      sourceType: "SALE",
      sourceId: id,
    });
  });
}

export type SaleBalance = {
  /** kuruş */
  total: number;
  /** net tahsilat (tahsilat − iade/ters kayıt), kuruş */
  paid: number;
  /** total − paid; pozitif: açık alacak (veresiye) */
  remaining: number;
};

export async function getSalePayments(saleId: string): Promise<Payment[]> {
  return db.payments
    .where("source_id")
    .equals(saleId)
    .filter((p) => p.source_type === "SALE")
    .toArray();
}

/** Satışın açık alacağı: tutar − bu satışa bağlı net tahsilatlar. */
export async function getSaleBalance(saleId: string): Promise<SaleBalance> {
  const [sale, payments] = await Promise.all([db.sales.get(saleId), getSalePayments(saleId)]);
  const total = toKurus(sale?.total_amount ?? 0);
  const paid = payments.reduce((acc, p) => acc + (p.direction === "IN" ? 1 : -1) * toKurus(p.amount), 0);
  return { total, paid, remaining: total - paid };
}

export async function getSaleItems(saleId: string): Promise<SaleItem[]> {
  const items = await db.sale_items.where("sale_id").equals(saleId).toArray();
  return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
