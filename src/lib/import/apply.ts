import { db } from "@/lib/db";
import type { ImportBatch } from "@/lib/db";
import { createCustomer, updateCustomer } from "@/lib/customers/service";
import { setPartyOpeningBalance } from "@/lib/finance/service";
import { createProduct, updateProduct } from "@/lib/products/service";
import { recordMovement } from "@/lib/stock/service";
import { writeAuditLog } from "@/lib/sync/audit";
import { enqueue } from "@/lib/sync/queue";
import { generateId, nowISO } from "@/lib/utils";
import type { BusinessContext } from "@/hooks/useBusinessContext";
import type { ImportKind } from "./definitions";
import type {
  BalanceContext,
  CustomerContext,
  CustomerImport,
  Decision,
  OpeningBalanceImport,
  OpeningStockImport,
  ProductContext,
  ProductImport,
  ValidatedRow,
} from "./validate";

/**
 * İçe aktarmayı uygular (Adım 6.1-6.5). Dört adım: dosya → doğrulama → onay → uygulama. Uygulama
 * tek işlemdir: biri başarısız olursa hiçbir kayıt yazılmaz. Aynı dosya (SHA-256 özeti) ikinci kez
 * uygulanamaz (AC-047). Her kayıt ImportBatch'e bağlanır; hatalı satırlar uygulanmaz ve sayılır.
 */

export class DuplicateImportError extends Error {
  constructor(public readonly previous: ImportBatch) {
    super(`Bu dosya daha önce içe aktarılmış (${previous.file_name}, ${previous.imported_at.slice(0, 10)}).`);
    this.name = "DuplicateImportError";
  }
}

export class ImportRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRuleError";
  }
}

export type FileMeta = { name: string; hash: string };
/** İşletmenin varsayılan KDV ayarı (yeni ürünlerde, dosyada KDV yoksa kullanılır) */
export type ImportDefaults = { taxMode: "INCLUSIVE" | "EXCLUSIVE" | "NONE"; taxRate: number };
export type ImportResult = { batchId: string; created: number; merged: number; matched: number; skipped: number; errors: number };

export async function findBatchByHash(businessId: string, hash: string): Promise<ImportBatch | undefined> {
  return db.import_batches.where("file_hash").equals(hash).filter((b) => b.business_id === businessId && b.status !== "FAILED").first();
}

/** Bağlam yükleyicileri: doğrulama bu verilerle yapılır. */
export async function loadCustomerContext(businessId: string): Promise<CustomerContext> {
  const list = await db.customers.where("business_id").equals(businessId).filter((c) => !c.archived_at).toArray();
  return { customers: list.map((c) => ({ id: c.id, name: c.name, phone_normalized: c.phone_normalized })) };
}

export async function loadProductContext(businessId: string): Promise<ProductContext> {
  const list = await db.products.where("business_id").equals(businessId).toArray();
  return { products: list.map((p) => ({ id: p.id, name: p.name, code: p.code, is_serial_tracked: p.is_serial_tracked, archived: !!p.archived_at })) };
}

export async function loadBalanceContext(businessId: string): Promise<BalanceContext> {
  const [customers, suppliers, openings] = await Promise.all([
    db.customers.where("business_id").equals(businessId).filter((c) => !c.archived_at).toArray(),
    db.suppliers.where("business_id").equals(businessId).filter((s) => !s.archived_at).toArray(),
    db.opening_balances.where("business_id").equals(businessId).toArray(),
  ]);
  return {
    customers: customers.map((c) => ({ id: c.id, name: c.name })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
    hasOpening: new Set(openings.map((o) => `${o.party_type}:${o.party_id}`)),
  };
}

const TABLES = () =>
  [
    db.import_batches, db.customers, db.suppliers, db.products, db.stock_movements, db.opening_balances,
    db.product_serial_units, db.counters, db.sync_queue, db.audit_logs,
  ] as const;

type AnyRow = ValidatedRow<unknown>;

/** Satırın uygulanacak kararı: kullanıcı seçimi, yoksa varsayılan; hatalı satır uygulanmaz. */
function decisionOf(row: AnyRow, chosen: Map<number, Decision>): Decision | null {
  if (row.errors.length > 0 || !row.data) return null;
  const d = chosen.get(row.rowNumber) ?? row.defaultDecision;
  if (!row.decisions.includes(d)) throw new ImportRuleError(`${row.rowNumber}. satır için geçersiz seçim.`);
  return d;
}

export async function applyImport(
  ctx: BusinessContext,
  kind: ImportKind,
  file: FileMeta,
  rows: AnyRow[],
  chosen: Map<number, Decision> = new Map(),
  defaults: ImportDefaults = { taxMode: "INCLUSIVE", taxRate: 20 }
): Promise<ImportResult> {
  const previous = await findBatchByHash(ctx.businessId, file.hash);
  if (previous) throw new DuplicateImportError(previous);

  const result: ImportResult = { batchId: generateId(), created: 0, merged: 0, matched: 0, skipped: 0, errors: rows.filter((r) => r.errors.length > 0).length };

  await db.transaction("rw", [...TABLES()], async () => {
    for (const r of rows) {
      const decision = decisionOf(r, chosen);
      if (decision === null) continue;
      if (decision === "MATCH") { result.matched++; continue; }
      if (decision === "SKIP") { result.skipped++; continue; }
      const outcome = await applyRow(ctx, kind, r, decision, result.batchId, file.name, defaults);
      result[outcome]++;
    }

    const applied = result.created + result.merged;
    const batch: ImportBatch = {
      id: result.batchId, business_id: ctx.businessId, file_name: file.name, file_hash: file.hash,
      imported_at: nowISO(), row_count: applied, error_count: result.errors, status: "COMPLETED",
    };
    await db.import_batches.add(batch);
    await enqueue("import_batches", batch.id, "INSERT", { ...batch }, ctx.deviceCode);
    await writeAuditLog({
      businessId: ctx.businessId, entityType: "backups", entityId: batch.id, action: "CREATE",
      deviceCode: ctx.deviceCode, actorId: ctx.actorId, reason: `İçe aktarma: ${kind}`,
      newValue: { dosya: file.name, eklenen: result.created, birleşen: result.merged, eşleşen: result.matched, atlanan: result.skipped, hatalı: result.errors },
    });
  });
  return result;
}

async function applyRow(
  ctx: BusinessContext,
  kind: ImportKind,
  r: AnyRow,
  decision: Decision,
  batchId: string,
  fileName: string,
  defaults: ImportDefaults
): Promise<"created" | "merged"> {
  switch (kind) {
    case "customers": {
      const d = r.data as CustomerImport;
      if (decision === "MERGE" && r.duplicate?.id) {
        const existing = await db.customers.get(r.duplicate.id);
        if (!existing) throw new ImportRuleError(`${r.rowNumber}. satır: birleştirilecek müşteri bulunamadı.`);
        await updateCustomer(ctx, existing.id, {
          name: existing.name,
          phone: existing.phone ?? d.phone,
          phone_normalized: existing.phone_normalized ?? d.phone_normalized,
          no_phone_flag: existing.phone ? existing.no_phone_flag ?? false : d.no_phone_flag,
          village: existing.village || d.village,
          address: existing.address,
          notes: existing.notes ?? d.notes,
        });
        return "merged";
      }
      await createCustomer(ctx, { ...d }, { allowDuplicatePhone: decision === "CREATE" });
      return "created";
    }
    case "products": {
      const d = r.data as ProductImport;
      if (decision === "MERGE" && r.duplicate?.id) {
        const existing = await db.products.get(r.duplicate.id);
        if (!existing) throw new ImportRuleError(`${r.rowNumber}. satır: birleştirilecek ürün bulunamadı.`);
        await updateProduct(ctx, existing.id, {
          name: existing.name, code: existing.code ?? d.code, category: existing.category ?? d.category, brand: existing.brand, model: existing.model,
          unit: existing.unit, is_serial_tracked: existing.is_serial_tracked, default_sale_price: existing.default_sale_price || d.default_sale_price,
          last_purchase_price: existing.last_purchase_price, default_tax_mode: existing.default_tax_mode, default_tax_rate: existing.default_tax_rate,
          critical_stock_level: existing.critical_stock_level ?? d.critical_stock_level, compatible_models_note: existing.compatible_models_note,
          storage_location: existing.storage_location, photo: existing.photo,
        });
        return "merged";
      }
      await createProduct(ctx, {
        name: d.name, code: d.code, category: d.category, unit: d.unit, is_serial_tracked: false,
        default_sale_price: d.default_sale_price, critical_stock_level: d.critical_stock_level,
        default_tax_mode: defaults.taxMode, default_tax_rate: d.default_tax_rate ?? defaults.taxRate,
      });
      return "created";
    }
    case "opening-stock": {
      const d = r.data as OpeningStockImport;
      await recordMovement(ctx, {
        productId: d.productId, type: "OPENING", quantity: d.quantity,
        note: [d.note, `İçe aktarma: ${fileName}`].filter(Boolean).join(" · "), sourceType: "IMPORT", sourceId: batchId,
      });
      return "created";
    }
    case "opening-balances": {
      const d = r.data as OpeningBalanceImport;
      await setPartyOpeningBalance(ctx, {
        partyType: d.partyType, partyId: d.partyId, direction: d.direction, amountKurus: d.amountKurus, asOfDate: d.asOfDate,
        note: d.note, reason: decision === "REPLACE" ? `İçe aktarma: ${fileName}` : undefined, importBatchId: batchId,
      });
      return decision === "REPLACE" ? "merged" : "created";
    }
  }
}
