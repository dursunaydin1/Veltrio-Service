import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getEntityHistory, writeAuditLog } from "./audit";

const BUSINESS = "00000000-0000-0000-0000-000000000001";
const ENTITY = "11111111-1111-4111-8111-111111111111";

describe("writeAuditLog", () => {
  beforeEach(async () => {
    await db.audit_logs.clear();
    await db.sync_queue.clear();
  });

  it("kaydı yazar ve eşitleme kuyruğuna ekler (AC-032)", async () => {
    await writeAuditLog({
      businessId: BUSINESS,
      entityType: "products",
      entityId: ENTITY,
      action: "UPDATE",
      deviceCode: "DEMO-AB23",
      oldValue: { stock: 10 },
      newValue: { stock: 7 },
      actorId: "22222222-2222-4222-8222-222222222222",
      reason: "Sayım farkı",
    });

    const logs = await getEntityHistory("products", ENTITY);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: "Sayım farkı", old_value: { stock: 10 } });

    const queue = await db.sync_queue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      table_name: "audit_logs",
      record_id: logs[0].id,
      operation: "INSERT",
      status: "PENDING",
    });
    expect(queue[0].payload).toMatchObject({ id: logs[0].id, business_id: BUSINESS });
  });
});
