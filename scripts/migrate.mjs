#!/usr/bin/env node
/**
 * Supabase migration çalıştırıcı: `npm run db:migrate`.
 *
 *   npm run db:migrate                 bekleyen migration'ları sırayla çalıştırır
 *   npm run db:migrate -- --status     uygulanmış / bekleyen listesi
 *   npm run db:migrate -- --baseline 019   001..019'u çalıştırmadan "uygulandı" işaretler
 *                                      (SQL Editor'da elle çalıştırılmış olanlar için, bir kez)
 *
 * Bağlantı: `.env.local` içindeki SUPABASE_DB_URL (Supabase → Project Settings →
 * Database → Connection string → URI). Bu değer gizlidir; commit edilmez, sohbete yazılmaz.
 * Her migration kendi işleminde (transaction) çalışır; hata verirse geri alınır ve durulur.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "supabase", "migrations");

function loadEnv() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL tanımlı değil. .env.local dosyasına ekleyin (bkz. dosya başındaki açıklama).");
  process.exit(1);
}

const args = process.argv.slice(2);
const status = args.includes("--status");
const baselineIdx = args.indexOf("--baseline");
const baseline = baselineIdx >= 0 ? args[baselineIdx + 1] : null;

const files = fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS public._migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  );
  const applied = new Set((await client.query("SELECT name FROM public._migrations")).rows.map((r) => r.name));

  if (baseline) {
    const limit = baseline.padStart(3, "0");
    const marked = files.filter((f) => f.slice(0, 3) <= limit && !applied.has(f));
    for (const f of marked) await client.query("INSERT INTO public._migrations (name) VALUES ($1)", [f]);
    console.log(`${marked.length} migration "uygulandı" olarak işaretlendi (≤ ${limit}).`);
  } else if (status) {
    for (const f of files) console.log(`${applied.has(f) ? "uygulandı " : "BEKLİYOR  "} ${f}`);
  } else {
    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) console.log("Bekleyen migration yok.");
    for (const f of pending) {
      const sql = fs.readFileSync(path.join(dir, f), "utf-8");
      process.stdout.write(`Çalıştırılıyor: ${f} … `);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO public._migrations (name) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log("tamam");
      } catch (e) {
        await client.query("ROLLBACK");
        console.log("HATA");
        console.error(e.message);
        process.exitCode = 1;
        break;
      }
    }
  }
} finally {
  await client.end();
}
