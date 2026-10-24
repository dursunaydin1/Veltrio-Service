"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSessionStore } from "@/stores/session";
import type { Column } from "@/lib/export/export";
import {
  MOVEMENT_LABEL,
  type ActiveServiceRow,
  type CollectionRow,
  type MachineHistoryRow,
  type SalesRow,
  type ServiceRevenueRow,
  type StatementLine,
  type StockReportRow,
} from "@/lib/reports/calc";
import {
  loadActiveServices,
  loadCollections,
  loadCustomerStatement,
  loadMachineHistory,
  loadMovementDetail,
  loadSalesReport,
  loadServiceRevenue,
  loadStockReport,
} from "@/lib/reports/load";
import { statusLabel } from "@/lib/services/status";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/service";
import { formatDateTime, formatQuantity } from "@/lib/utils";
import { ExportPanel, RangePicker, ReportTable, useReportRange } from "./ReportParts";

function useBusinessId() {
  return useSessionStore((s) => s.business?.id);
}

const Title = ({ children }: { children: string }) => <h1>{children}</h1>;

// ---------------------------------------------------------------- Satış

const SALES_COLUMNS: Column<SalesRow>[] = [
  { key: "bucket", label: "Dönem" },
  { key: "count", label: "Belge", type: "number" },
  { key: "gross", label: "Brüt satış (KDV dahil)", type: "money" },
  { key: "discount", label: "İndirim", type: "money" },
  { key: "tax", label: "KDV", type: "money" },
  { key: "returns", label: "İade", type: "money" },
  { key: "cancelled", label: "İptal", type: "money" },
  { key: "net", label: "Net satış", type: "money" },
];

export function SalesReportScreen() {
  const businessId = useBusinessId();
  const { range, setRange, granularity, setGranularity } = useReportRange();
  const data = useLiveQuery(() => (businessId ? loadSalesReport(businessId, range, granularity) : undefined), [businessId, range.from, range.to, granularity]);
  return (
    <section className="stack stack-md">
      <Title>Satış raporu</Title>
      <RangePicker range={range} onChange={setRange} granularity={granularity} onGranularity={setGranularity} />
      <p>Belge tarihine göre. İade ve iptaller kendi tarihlerinde net satıştan düşer; veresiye tutarı satışa dahildir, tahsilat için Tahsilat raporuna bakın.</p>
      {data ? (
        <>
          <ReportTable columns={SALES_COLUMNS} rows={data.rows} footer={data.totals} rowKey={(r) => r.bucket} />
          <ExportPanel title="Satış raporu" base="satis-raporu" columns={SALES_COLUMNS} rows={data.rows} footer={data.totals} />
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Tahsilat

type CollectionDisplay = { bucket: string; method: string; received: number; refunded: number; net: number };
const COLLECTION_COLUMNS: Column<CollectionDisplay>[] = [
  { key: "bucket", label: "Dönem" },
  { key: "method", label: "Yöntem" },
  { key: "received", label: "Alınan", type: "money" },
  { key: "refunded", label: "İade / ters kayıt", type: "money" },
  { key: "net", label: "Net", type: "money" },
];
const asDisplay = (r: CollectionRow): CollectionDisplay => ({ ...r, method: r.method === "ALL" ? "Tümü" : PAYMENT_METHOD_LABELS[r.method] });

export function CollectionsReportScreen() {
  const businessId = useBusinessId();
  const { range, setRange, granularity, setGranularity } = useReportRange();
  const data = useLiveQuery(() => (businessId ? loadCollections(businessId, range, granularity) : undefined), [businessId, range.from, range.to, granularity]);
  const rows = data?.rows.map(asDisplay) ?? [];
  const methods = data?.byMethod.map(asDisplay) ?? [];
  const footer: CollectionDisplay | undefined = data ? { bucket: "Toplam", method: "", ...data.totals } : undefined;
  return (
    <section className="stack stack-md">
      <Title>Tahsilat raporu</Title>
      <RangePicker range={range} onChange={setRange} granularity={granularity} onGranularity={setGranularity} />
      <p>Fiilî ödeme hareketleri, ödeme tarihine göre. Veresiye (ödenmemiş) tutarlar bu rapora girmez; tedarikçi ödemeleri hariçtir.</p>
      {data ? (
        <>
          <h2>Yönteme göre</h2>
          <ReportTable columns={COLLECTION_COLUMNS} rows={methods} footer={footer} rowKey={(r) => r.method} />
          <h2>Dönem ve yönteme göre</h2>
          <ReportTable columns={COLLECTION_COLUMNS} rows={rows} rowKey={(r) => `${r.bucket}|${r.method}`} />
          <ExportPanel title="Tahsilat raporu" base="tahsilat-raporu" columns={COLLECTION_COLUMNS} rows={rows} footer={footer} />
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Servis geliri

const REVENUE_COLUMNS: Column<ServiceRevenueRow>[] = [
  { key: "bucket", label: "Dönem" },
  { key: "count", label: "Servis", type: "number" },
  { key: "revenue", label: "Tahakkuk", type: "money" },
  { key: "cancelFees", label: "İptal inceleme ücreti", type: "money" },
  { key: "returns", label: "İade / düzeltme", type: "money" },
  { key: "net", label: "Net gelir", type: "money" },
];

export function ServiceRevenueScreen() {
  const businessId = useBusinessId();
  const { range, setRange, granularity, setGranularity } = useReportRange();
  const data = useLiveQuery(() => (businessId ? loadServiceRevenue(businessId, range, granularity) : undefined), [businessId, range.from, range.to, granularity]);
  return (
    <section className="stack stack-md">
      <Title>Servis geliri raporu</Title>
      <RangePicker range={range} onChange={setRange} granularity={granularity} onGranularity={setGranularity} />
      <p>Tamamlanma tarihine göre tahakkuk; tahsilattan ayrıdır. Yeniden açılan servis ikinci kez sayılmaz.</p>
      {data ? (
        <>
          <ReportTable columns={REVENUE_COLUMNS} rows={data.rows} footer={data.totals} rowKey={(r) => r.bucket} />
          <ExportPanel title="Servis geliri" base="servis-geliri" columns={REVENUE_COLUMNS} rows={data.rows} footer={data.totals} />
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Aktif servisler

type ActiveDisplay = { documentNo: string; customer: string; machine: string; status: string; waitReason: string; promisedDate: string; late: string };
const ACTIVE_COLUMNS: Column<ActiveDisplay>[] = [
  { key: "documentNo", label: "Servis no" },
  { key: "customer", label: "Müşteri" },
  { key: "machine", label: "Makine" },
  { key: "status", label: "Durum" },
  { key: "waitReason", label: "Bekleme sebebi" },
  { key: "promisedDate", label: "Teslim sözü", type: "date" },
  { key: "late", label: "Teslim durumu" },
];
const toActive = (r: ActiveServiceRow): ActiveDisplay => ({
  documentNo: r.documentNo, customer: r.customer, machine: r.machine, status: statusLabel(r.status as never),
  waitReason: r.waitReason ?? "", promisedDate: r.promisedDate ?? "",
  late: r.daysOverdue === undefined ? "" : r.daysOverdue > 0 ? `${r.daysOverdue} gün gecikti` : r.daysOverdue === 0 ? "Bugün" : `${-r.daysOverdue} gün kaldı`,
});

export function ActiveServicesScreen() {
  const businessId = useBusinessId();
  const [status, setStatus] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const rows = useLiveQuery(
    () => (businessId ? loadActiveServices(businessId, { status: status || undefined, dueFrom: dueFrom || undefined, dueTo: dueTo || undefined }) : undefined),
    [businessId, status, dueFrom, dueTo]
  );
  const display = rows?.map(toActive) ?? [];
  return (
    <section className="stack stack-md">
      <Title>Aktif servisler</Title>
      <div className="row row-gap-md no-print" style={{ flexWrap: "wrap" }}>
        <select className="form-input" style={{ flex: 1, minWidth: 160 }} aria-label="Duruma göre" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tüm durumlar</option>
          {["RECEIVED", "DIAGNOSED", "WAITING_CUSTOMER_APPROVAL", "IN_PROGRESS", "WAITING_PARTS", "COMPLETED"].map((s) => (
            <option key={s} value={s}>{statusLabel(s as never)}</option>
          ))}
        </select>
        <input className="form-input" style={{ flex: 1, minWidth: 140 }} type="date" aria-label="Teslim sözü başlangıç" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
        <input className="form-input" style={{ flex: 1, minWidth: 140 }} type="date" aria-label="Teslim sözü bitiş" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
      </div>
      <p>Geciken teslimler en üstte, sonra yaklaşanlar, en altta teslim sözü olmayanlar.</p>
      {rows ? (
        <>
          <ReportTable columns={ACTIVE_COLUMNS} rows={display} rowKey={(r) => r.documentNo} empty="Aktif servis yok." />
          <ExportPanel title="Aktif servisler" base="aktif-servisler" columns={ACTIVE_COLUMNS} rows={display} />
          <ul className="menu-list no-print" aria-label="Servislere git">
            {rows.slice(0, 20).map((r) => (
              <li key={r.id}><Link href={`/services/${r.id}`}>{r.documentNo} · {r.customer}</Link></li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Stok

type StockDisplay = { name: string; code: string; available: number; damaged: number; level: number | ""; state: string; inQty: number; outQty: number };
const STOCK_COLUMNS: Column<StockDisplay>[] = [
  { key: "name", label: "Ürün" },
  { key: "code", label: "Kod" },
  { key: "available", label: "Satılabilir", type: "number" },
  { key: "damaged", label: "Hasarlı", type: "number" },
  { key: "level", label: "Kritik seviye", type: "number" },
  { key: "state", label: "Durum" },
  { key: "inQty", label: "Dönem girişi", type: "number" },
  { key: "outQty", label: "Dönem çıkışı", type: "number" },
];

export function StockReportScreen() {
  const businessId = useBusinessId();
  const { range, setRange } = useReportRange();
  const [detail, setDetail] = useState<{ id: string; name: string } | null>(null);
  const rows = useLiveQuery(() => (businessId ? loadStockReport(businessId, range) : undefined), [businessId, range.from, range.to]);
  const movements = useLiveQuery(
    async () => (businessId && detail ? loadMovementDetail(businessId, detail.id, range) : undefined),
    [businessId, detail?.id, range.from, range.to]
  );
  const display = rows?.map((r: StockReportRow): StockDisplay => ({
    name: r.name, code: r.code ?? "", available: r.available, damaged: r.damaged, level: r.criticalLevel ?? "",
    state: r.critical ? "Kritik" : "Yeterli", inQty: r.inQty, outQty: r.outQty,
  })) ?? [];

  return (
    <section className="stack stack-md">
      <Title>Stok raporu</Title>
      <RangePicker range={range} onChange={setRange} />
      <p>Anlık satılabilir ve hasarlı stok; giriş / çıkış seçilen aralıktaki satılabilir hareketlerdir.</p>
      {rows ? (
        <>
          <ReportTable columns={STOCK_COLUMNS} rows={display} rowKey={(r) => r.name + r.code} empty="Ürün yok." />
          <ExportPanel title="Stok raporu" base="stok-raporu" columns={STOCK_COLUMNS} rows={display} />
          <h2>Hareket geçmişi</h2>
          <select className="form-input no-print" aria-label="Ürün seç" value={detail?.id ?? ""} onChange={(e) => {
            const r = rows.find((x) => x.productId === e.target.value);
            setDetail(r ? { id: r.productId, name: r.name } : null);
          }}>
            <option value="">Ürün seçin…</option>
            {rows.map((r) => <option key={r.productId} value={r.productId}>{r.name}</option>)}
          </select>
          {detail && movements ? (
            movements.length === 0 ? (
              <p>Seçilen aralıkta bu ürün için hareket yok.</p>
            ) : (
              <ul className="menu-list" aria-label="Stok hareketleri">
                {movements.map((m) => (
                  <li key={m.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0" }}>
                    <span className="row row-between">
                      <strong>{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}{m.bucket === "DAMAGED" ? " (hasarlı)" : ""}</strong>
                      <strong style={{ color: m.quantity < 0 ? "var(--accent-warning)" : "var(--accent-success)" }}>{m.quantity > 0 ? "+" : ""}{formatQuantity(m.quantity)}</strong>
                    </span>
                    <small style={{ color: "var(--text-muted)" }}>{formatDateTime(m.created_at)}{m.note ? ` · ${m.note}` : ""}</small>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Makine geçmişi

type MachineDisplay = { title: string; serial: string; owner: string; count: number; last: string };
const MACHINE_COLUMNS: Column<MachineDisplay>[] = [
  { key: "title", label: "Makine" },
  { key: "serial", label: "Seri / iç no" },
  { key: "owner", label: "Sahibi" },
  { key: "count", label: "Tamamlanan servis", type: "number" },
  { key: "last", label: "Son servis", type: "date" },
];

export function MachineHistoryScreen() {
  const businessId = useBusinessId();
  const rows = useLiveQuery(() => (businessId ? loadMachineHistory(businessId) : undefined), [businessId]);
  const display = rows?.map((r: MachineHistoryRow): MachineDisplay => ({ title: r.title, serial: r.serial ?? "", owner: r.owner ?? "", count: r.completedCount, last: r.lastService ?? "" })) ?? [];
  return (
    <section className="stack stack-md">
      <Title>Makine geçmişi raporu</Title>
      <p>Tamamlanmış (iptal edilmemiş) servisi olan makineler, servis sayısı ve son servis tarihi.</p>
      {rows ? (
        <>
          <ReportTable columns={MACHINE_COLUMNS} rows={display} rowKey={(r) => r.title + r.serial} empty="Henüz tamamlanmış servisi olan makine yok." />
          <ExportPanel title="Makine geçmişi" base="makine-gecmisi" columns={MACHINE_COLUMNS} rows={display} />
          {rows.map((m) => (
            <details key={m.machineId} className="card" style={{ padding: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{m.title} · {m.completedCount} servis</summary>
              <ul className="menu-list" aria-label={`${m.title} servisleri`} style={{ marginTop: 8 }}>
                {m.services.map((s) => (
                  <li key={s.id}>
                    <Link href={`/services/${s.id}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                      <span>{s.documentNo} · {s.date}</span>
                      <small style={{ color: "var(--text-muted)", fontWeight: 500 }}>{s.summary}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Hesap ekstresi

const STATEMENT_COLUMNS: Column<StatementLine>[] = [
  { key: "date", label: "Tarih", type: "date" },
  { key: "kind", label: "İşlem" },
  { key: "description", label: "Açıklama" },
  { key: "debit", label: "Borç", type: "money" },
  { key: "credit", label: "Alacak", type: "money" },
  { key: "balance", label: "Bakiye", type: "money" },
];

export function StatementScreen() {
  const businessId = useBusinessId();
  const [customerId, setCustomerId] = useState("");
  const customers = useLiveQuery(
    async () => (businessId ? (await db.customers.where("business_id").equals(businessId).toArray()).sort((a, b) => a.name.localeCompare(b.name, "tr")) : []),
    [businessId]
  );
  const lines = useLiveQuery(() => (businessId && customerId ? loadCustomerStatement(businessId, customerId) : undefined), [businessId, customerId]);
  const name = customers?.find((c) => c.id === customerId)?.name ?? "musteri";
  return (
    <section className="stack stack-md">
      <Title>Müşteri hesap ekstresi</Title>
      <select className="form-input no-print" aria-label="Müşteri seç" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
        <option value="">Müşteri seçin…</option>
        {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {lines ? (
        <>
          <ReportTable columns={STATEMENT_COLUMNS} rows={lines} rowKey={(_, i) => String(i)} empty="Bu müşterinin hareketi yok." />
          <ExportPanel title="Hesap ekstresi" base={`ekstre-${name.toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşöçı]+/g, "-")}`} columns={STATEMENT_COLUMNS} rows={lines} />
        </>
      ) : null}
    </section>
  );
}
