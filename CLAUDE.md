# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Veltrio Service: a single-user, mobile-first, offline-capable (PWA) management app for a business that sells and services gasoline-powered agricultural/forestry machines (service orders, sales, stock, customer/supplier accounts). The UI, comments, error messages and docs are in **Turkish**; keep new user-facing strings in Turkish.

- `PRD.md` is the product spec (v2.1). Code comments cite it as `PRD §N` / `AC-NNN`.
- **Read `docs/CALISMA_KURALLARI.md` first**: it holds the owner's standing working rules (Turkish replies, short step-by-step guidance, explain what was done, commit + push to GitHub after each meaningful step, keep docs updated). Plan deviations are logged in `docs/KARAR_GUNLUGU.md`; the docs under `docs/` may be corrected when they turn out to be wrong or incomplete.
- `docs/00_GENEL_PLAN.md` is the master plan; work is split into 7 phases (`docs/01_…` through `docs/07_…`). Phase 1 (auth, devices, UUIDs, sync, audit log) is in progress. The Dexie schema and SQL migrations already define tables for all 7 phases.

## Commands

```bash
npm run dev     # next dev (Turbopack)
npm run build   # next build
npm run lint    # eslint (flat config, eslint.config.mjs)
npm test        # vitest run (tek dosya: npx vitest run src/lib/utils/phone.test.ts)
```

Tests are Vitest unit tests next to the code (`*.test.ts`, `@` alias configured in `vitest.config.mts`). Environment vars go in `.env.local` (see `.env.local.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. If they are missing, `src/proxy.ts` skips the auth redirect so the app still runs locally.

Database migrations live in `supabase/migrations/` and must be applied in order (001 → 023), via the Supabase SQL editor or `supabase db push`. The sync API routes do not work until `005_sync_changes.sql` is applied.

## Stack notes

- **Next.js 16.4 / React 19.3** (App Router). Per AGENTS.md, check `node_modules/next/dist/docs/` before relying on Next.js APIs. In particular, route middleware is `src/proxy.ts` exporting `proxy()` (the old `middleware.ts` was removed). `next.config.js` enables Turbopack; `next-pwa` is not used (it's incompatible), and a native service worker is planned for Phase 6.
- Path alias `@/*` → `src/*`.
- Supabase via `@supabase/ssr`: `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts` (server components, route handlers, server actions).
- Zustand for session state (`src/stores/session.ts`): user, business, device, online status, last sync time.
- Routes: `src/app/(auth)/` (login, server actions in `actions.ts`) and `src/app/(app)/` (dashboard, customers, products, services, sales, purchases, reports, settings).

## Architecture: offline-first data flow

The client works against a **local IndexedDB (Dexie)** database and syncs with Supabase Postgres in the background. Understanding this loop requires several files:

1. **Local DB**: `src/lib/db/schema.ts` defines `VeltrioDatabase` (all tables for every phase, plus `sync_queue` and `audit_logs`). Import it only through `@/lib/db`. Any schema change needs a new `this.version(n).stores(...)` block. Shared entity types are in `src/types/index.ts`; types for later phases are declared in `schema.ts`.
2. **Write path**: a local write goes to Dexie, then `enqueue(table, recordId, op, payload, deviceCode)` (`src/lib/sync/queue.ts`) adds a `PENDING` item to `sync_queue` and dispatches the `veltrio:sync-requested` window event. The payload must contain `id` (equal to `recordId`) and `business_id`, or the server rejects it.
3. **Sync trigger**: `AppProvider` (wraps the root layout) runs `useAuthSync`, `useOnlineStatus` and `useSync`. `useSync` calls `syncNow` on mount, on `online`, on `focus` and on the sync-requested event, and deduplicates concurrent runs.
4. **Push**: `src/lib/sync/client.ts` sends pending items in batches of 100 to `POST /api/sync/push`. The server validates the user and device through `getSyncContext` (`src/lib/sync/server.ts`: an authenticated user, their `users.business_id`, and an active row in `devices`), checks `business_id` scope, and upserts. Failed items get `retry_count` incremented and move to `ERROR` after 5 attempts. They are never deleted (AC-037).
5. **Pull**: `GET /api/sync/pull?cursor=&deviceCode=` reads the `sync_changes` log (a BIGINT identity cursor, 500 rows per page). Postgres triggers from migration 005 (`capture_sync_change`) populate this log for every synced table. The client applies the changes to Dexie with `put`/`delete` and stores the cursor in `localStorage` under `veltrio_sync_cursor:{businessId}:{deviceCode}`.
6. **Table allowlist**: `src/lib/sync/tables.ts` (`SYNC_TABLES`) lists the tables that can be synced. Adding a synced table means updating this list, the Dexie schema, a migration, and the trigger list in the 005 migration pattern. `APPEND_ONLY_SYNC_TABLES` (stock_movements, payments, payment_allocations, service_status_history) accept only INSERT. A duplicate-key insert on these tables counts as success, which makes retries idempotent.

## Invariant business rules (apply in every phase)

- Client-generated UUIDs for every record (`generateId()` in `src/lib/utils/id.ts`). Never depend on server-assigned IDs.
- Every record carries `business_id`. Postgres RLS enforces isolation, and the server re-checks it on every request.
- Money and quantities are `decimal(15,4)` in Postgres. Never use float arithmetic for money without `roundAmount` / the helpers in `src/lib/utils/currency.ts`. Display in TRY with the `tr-TR` locale.
- Store all timestamps in UTC (`nowISO()`) and display them in `Europe/Istanbul` (`src/lib/utils/date.ts`).
- Ledger-style tables are immutable: `stock_movements` and `audit_logs` are protected by Postgres RULEs. Corrections, returns and cancellations are recorded as reversing entries, never by editing history.
- Critical changes must write an audit log (`writeAuditLog` / `logStateChange` in `src/lib/sync/audit.ts`) with the actor device, old and new values, and a reason.

## QA
`npm test` (birim/akış), `npm run test:e2e` (gerçek Supabase'e karşı; `E2E_EMAIL`/`E2E_PASSWORD` ortam değişkeni gerekir, yoksa atlanır). Ayrıntı: `docs/08_QA_TEST.md`. Yeni akış eklenince ikisi de güncellenir.
