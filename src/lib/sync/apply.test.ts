import { beforeEach, describe, expect, it } from "vitest";
import { applyPushItem, type PushItem } from "./apply";

type Row = Record<string, unknown>;
type Filter = [string, unknown];

/** Supabase sorgu zincirinin bellek içi, minimal taklidi. */
class FakeQuery implements PromiseLike<{ data?: unknown; error: { code?: string; message: string } | null }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row = {};
  private filters: Filter[] = [];
  private single = false;

  constructor(private rows: Row[], private uniqueColumn?: string) {}

  select() { return this; }
  insert(p: Row) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(k: string, v: unknown) { this.filters.push([k, v]); return this; }
  maybeSingle() { this.single = true; return this; }

  private matched() {
    return this.rows.filter((r) => this.filters.every(([k, v]) => r[k] === v));
  }

  then<R1, R2>(
    ok?: (v: { data?: unknown; error: { code?: string; message: string } | null }) => R1 | PromiseLike<R1>,
    err?: (e: unknown) => R2 | PromiseLike<R2>
  ) {
    return Promise.resolve(this.run()).then(ok, err);
  }

  private run() {
    if (this.op === "insert") {
      if (this.rows.some((r) => r.id === this.payload.id)) {
        return { error: { code: "23505", message: "duplicate key" } };
      }
      const col = this.uniqueColumn;
      if (col && this.rows.some((r) => r[col] === this.payload[col])) {
        return { error: { code: "23505", message: `duplicate key value violates unique constraint on ${col}` } };
      }
      this.rows.push({ version: 1, ...this.payload });
      return { error: null };
    }
    if (this.op === "update") {
      const hit = this.matched();
      hit.forEach((r) => Object.assign(r, this.payload, { version: (r.version as number) + 1 }));
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    }
    if (this.op === "delete") {
      const hit = new Set(this.matched());
      for (let i = this.rows.length - 1; i >= 0; i--) if (hit.has(this.rows[i])) this.rows.splice(i, 1);
      return { error: null };
    }
    const hit = this.matched();
    return { data: this.single ? hit[0] ?? null : hit, error: null };
  }
}

const BUSINESS = "00000000-0000-0000-0000-000000000001";
const ID = "11111111-1111-4111-8111-111111111111";

let db: Record<string, Row[]>;
const UNIQUE: Record<string, string> = { sales: "document_no", services: "document_no", machines: "internal_number" };

function context() {
  return {
    businessId: BUSINESS,
    supabase: { from: (t: string) => new FakeQuery((db[t] ??= []), UNIQUE[t]) } as never,
  };
}

function item(over: Partial<PushItem> & { payload?: Row } = {}): PushItem {
  const { payload, ...rest } = over;
  return {
    id: "q1",
    table_name: "customers",
    record_id: ID,
    operation: "INSERT",
    payload: { id: ID, business_id: BUSINESS, name: "Ali", ...payload },
    ...rest,
  };
}

beforeEach(() => {
  db = { customers: [], stock_movements: [] };
});

describe("applyPushItem — INSERT", () => {
  it("kaydı ekler, sürüm 1 olur (istemcinin gönderdiği sürüm yok sayılır)", async () => {
    const r = await applyPushItem(context(), item({ payload: { version: 99 } }));
    expect(r).toEqual({ id: "q1", success: true });
    expect(db.customers[0]).toMatchObject({ id: ID, version: 1 });
  });

  it("aynı paket iki kez gelirse tek kayıt oluşur (AC-036)", async () => {
    await applyPushItem(context(), item());
    const again = await applyPushItem(context(), item());
    expect(again.success).toBe(true);
    expect(db.customers).toHaveLength(1);
  });

  it("tekrar gelen ekleme, arada güncellenmiş kaydı geri yazmaz", async () => {
    await applyPushItem(context(), item());
    await applyPushItem(context(), item({ operation: "UPDATE", payload: { name: "Veli", version: 1 } }));
    await applyPushItem(context(), item()); // eski ekleme yeniden denendi
    expect(db.customers[0]).toMatchObject({ name: "Veli", version: 2 });
  });
});

describe("applyPushItem — UPDATE", () => {
  beforeEach(async () => {
    await applyPushItem(context(), item());
  });

  it("sürüm güncelse uygular ve sürümü artırır", async () => {
    const r = await applyPushItem(
      context(),
      item({ operation: "UPDATE", payload: { name: "Veli", version: 1 } })
    );
    expect(r.success).toBe(true);
    expect(db.customers[0]).toMatchObject({ name: "Veli", version: 2 });
  });

  it("sürüm eskiyse çakışma bildirir, kaydı ezmez", async () => {
    await applyPushItem(context(), item({ operation: "UPDATE", payload: { name: "Veli", version: 1 } }));
    const r = await applyPushItem(
      context(),
      item({ id: "q2", operation: "UPDATE", payload: { name: "Ahmet", version: 1 } })
    );
    expect(r).toMatchObject({ id: "q2", success: false, conflict: true });
    expect(db.customers[0]).toMatchObject({ name: "Veli", version: 2 });
  });

  it("sunucuda olmayan kayıt çakışma sayılır", async () => {
    db.customers.length = 0;
    const r = await applyPushItem(
      context(),
      item({ operation: "UPDATE", payload: { version: 1 } })
    );
    expect(r).toMatchObject({ success: false, conflict: true });
  });

  it("sürüm göndermeyen güncellemeyi reddeder (çakışma değil, hata)", async () => {
    const r = await applyPushItem(context(), item({ operation: "UPDATE", payload: { name: "X" } }));
    expect(r.success).toBe(false);
    expect(r.conflict).toBeUndefined();
  });
});

describe("applyPushItem — kurallar", () => {
  it("başka işletmenin kaydını reddeder", async () => {
    const r = await applyPushItem(context(), item({ payload: { business_id: "baska" } }));
    expect(r).toMatchObject({ success: false, error: "İşletme kapsamı eşleşmiyor." });
    expect(db.customers).toHaveLength(0);
  });

  it("kayıt kimliği uyuşmazsa reddeder", async () => {
    const r = await applyPushItem(context(), item({ record_id: "baska-id" }));
    expect(r.success).toBe(false);
  });

  it("yalnızca-ekleme tablolarında güncelleme/silme reddedilir", async () => {
    const base = { table_name: "stock_movements" as const, payload: { id: ID, business_id: BUSINESS } };
    const upd = await applyPushItem(context(), item({ ...base, operation: "UPDATE" }));
    const del = await applyPushItem(context(), item({ ...base, operation: "DELETE" }));
    expect(upd.success).toBe(false);
    expect(del.success).toBe(false);
  });

  it("silme kaydı kaldırır", async () => {
    await applyPushItem(context(), item());
    const r = await applyPushItem(context(), item({ operation: "DELETE" }));
    expect(r.success).toBe(true);
    expect(db.customers).toHaveLength(0);
  });
});

describe("applyPushItem — numara çakışması (AC-016)", () => {
  const SALE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const SALE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const sale = (id: string, docNo: string) =>
    item({
      table_name: "sales",
      record_id: id,
      payload: { id, business_id: BUSINESS, document_no: docNo, created_by_device: "DEMO-ZZ99", total_amount: 10 },
    });

  it("aynı belge numarasıyla gelen farklı kayıt reddedilmez; -R1 ile yeniden numaralanır ve audit log yazılır", async () => {
    expect((await applyPushItem(context(), sale(SALE_A, "SAT-X-2026-00001"))).success).toBe(true);
    const r = await applyPushItem(context(), sale(SALE_B, "SAT-X-2026-00001"));
    expect(r).toMatchObject({ success: true, renumbered: { from: "SAT-X-2026-00001", to: "SAT-X-2026-00001-R1" } });
    expect(db.sales.map((s) => s.document_no)).toEqual(["SAT-X-2026-00001", "SAT-X-2026-00001-R1"]);
    expect(db.audit_logs).toHaveLength(1);
    expect(db.audit_logs[0]).toMatchObject({
      entity_type: "sales", entity_id: SALE_B, changed_by_device: "DEMO-ZZ99",
      old_value: { document_no: "SAT-X-2026-00001" }, new_value: { document_no: "SAT-X-2026-00001-R1" },
    });
  });

  it("üçüncü çakışma -R2 alır; aynı kayıt tekrar gelirse kopya oluşmaz", async () => {
    await applyPushItem(context(), sale(SALE_A, "S-1"));
    await applyPushItem(context(), sale(SALE_B, "S-1"));
    const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const r = await applyPushItem(context(), sale(C, "S-1"));
    expect(r.renumbered?.to).toBe("S-1-R2");
    const again = await applyPushItem(context(), sale(SALE_B, "S-1"));
    expect(again.success).toBe(true);
    expect(again.renumbered).toBeUndefined();
    expect(db.sales).toHaveLength(3);
  });

  it("numara sütunu olmayan tabloda benzersizlik hatası reddedilir", async () => {
    db.customers.push({ id: "other", business_id: BUSINESS, name: "Ali" });
    const r = await applyPushItem(context(), item({ payload: { id: ID, name: "Ali" } }));
    expect(r.success).toBe(true); // farklı kimlik, benzersiz sütun tanımlı değil
  });
});
