/**
 * Dexie veritabanı — tek erişim noktası.
 *
 * Kullanım:
 *   import { db } from "@/lib/db";
 *   const customers = await db.customers.where("business_id").equals(bizId).toArray();
 */
export { db } from "./schema";
export type {
  VeltrioDatabase,
  OpeningBalance,
  PaymentAllocation,
  ImportBatch,
  Service,
  ServicePart,
  ServiceStatusHistory,
  Sale,
  SaleItem,
  Purchase,
  PurchaseItem,
  ReturnTransaction,
  ReturnItem,
} from "./schema";
