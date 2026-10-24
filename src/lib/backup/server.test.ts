import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { backupBusiness, dumpBusiness, KEEP_BACKUPS } from "./server";

type Row = Record<string, unknown>;

/** Yedek görevinin kullandığı Supabase yüzeyinin bellek içi taklidi. */
function fakeClient(data: Record<string, Row[]>, opts: { failUpload?: boolean; files?: string[] } = {}) {
  const inserted: { table: string; row: Row }[] = [];
  const uploaded: { path: string; body: string }[] = [];
  const removed: string[][] = [];
  const files = opts.files ?? [];
  const client = {
    from(table: string) {
      return {
        select() {
          let businessId = "";
          const q = {
            eq(_k: string, v: string) { businessId = v; return q; },
            range(from: number, to: number) {
              const rows = (data[table] ?? []).filter((r) => r.business_id === businessId);
              return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
            },
          };
          return q;
        },
        insert(row: Row) {
          inserted.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
    storage: {
      from() {
        return {
          upload(path: string, body: string) {
            if (opts.failUpload) return Promise.resolve({ error: { message: "depo hatası" } });
            uploaded.push({ path, body });
            return Promise.resolve({ error: null });
          },
          list() {
            return Promise.resolve({ data: files.map((name) => ({ name })), error: null });
          },
          remove(paths: string[]) {
            removed.push(paths);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return { client, inserted, uploaded, removed };
}

const B = "00000000-0000-0000-0000-000000000001";

describe("sunucu tarafı günlük yedek (NFR-006)", () => {
  it("işletmenin tüm tablolarını alır, depoya yazar ve OK kaydı atar; başka işletmeyi karıştırmaz", async () => {
    const { client, inserted, uploaded } = fakeClient({
      customers: [{ id: "c1", business_id: B }, { id: "c2", business_id: "baska" }],
      products: [{ id: "p1", business_id: B }],
    });
    const result = await backupBusiness(client, B, new Date("2026-10-31T03:00:00Z"));
    expect(result).toMatchObject({ ok: true, path: `${B}/2026-10-31.json`, total: 2 });
    const file = JSON.parse(uploaded[0].body);
    expect(file.tables.customers).toEqual([{ id: "c1", business_id: B }]);
    expect(inserted[0]).toMatchObject({ table: "business_backups", row: { kind: "AUTO", status: "OK", file_path: `${B}/2026-10-31.json` } });
  });

  it("depo hatasında FAILED kaydı atar ve hata döner", async () => {
    const { client, inserted } = fakeClient({}, { failUpload: true });
    const result = await backupBusiness(client, B);
    expect(result).toMatchObject({ ok: false, error: "depo hatası" });
    expect(inserted[0].row).toMatchObject({ kind: "AUTO", status: "FAILED", error: "depo hatası" });
  });

  it("yalnızca son 30 yedeği tutar, eskileri siler", async () => {
    const names = Array.from({ length: KEEP_BACKUPS + 3 }, (_, i) => `2026-09-${String(40 - i).padStart(2, "0")}.json`);
    const { client, removed } = fakeClient({}, { files: names });
    await backupBusiness(client, B);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toEqual(names.slice(KEEP_BACKUPS).map((n) => `${B}/${n}`));
  });

  it("1000'den fazla satırı sayfalayarak alır", async () => {
    const customers = Array.from({ length: 2500 }, (_, i) => ({ id: `c${i}`, business_id: B }));
    const { client } = fakeClient({ customers });
    const file = await dumpBusiness(client, B);
    expect(file.counts.customers).toBe(2500);
  });
});
