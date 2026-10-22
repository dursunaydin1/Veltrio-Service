"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Printer } from "lucide-react";
import { useSessionStore } from "@/stores/session";
import { buildReceiptModel, loadReceiptSource, type ReceiptModel, type ReceiptType } from "@/lib/services/receipt";
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from "@/lib/utils";

type PaperSize = "a4" | "thermal";

/**
 * Servis kabul fişi / sonuç özeti (Adım 3.15). Ekranda önizlenir, tarayıcının
 * yazdır penceresinden kağıda ya da "PDF olarak kaydet" ile dosyaya alınır.
 * Müşteriye verilen çıktıda iç maliyetler yer almaz; belge resmî fatura değildir.
 */
export function ReceiptView({ serviceId, type }: { serviceId: string; type: ReceiptType }) {
  const business = useSessionStore((s) => s.business);
  const [size, setSize] = useState<PaperSize>("a4");

  const model = useLiveQuery(async () => {
    if (!business) return undefined;
    const source = await loadReceiptSource(serviceId, business);
    return source ? buildReceiptModel(type, source) : null;
  }, [serviceId, type, business?.id]);

  if (model === undefined) return null;
  if (model === null) {
    return (
      <div className="alert alert-warning" role="alert">
        Servis bulunamadı. Başka bir cihazda henüz eşitlenmemiş olabilir.
      </div>
    );
  }

  return (
    <div className="stack stack-md">
      <div className="no-print stack stack-sm">
        <Link href={`/services/${serviceId}`}>← Servise dön</Link>
        <div className="row row-gap-sm" style={{ flexWrap: "wrap" }}>
          <Link href={`/services/${serviceId}/receipt?type=intake`} className={`btn btn-sm ${type === "intake" ? "btn-primary" : "btn-secondary"}`}>
            Kabul fişi
          </Link>
          <Link href={`/services/${serviceId}/receipt?type=summary`} className={`btn btn-sm ${type === "summary" ? "btn-primary" : "btn-secondary"}`}>
            Sonuç özeti
          </Link>
        </div>
        <div className="row row-gap-sm" role="group" aria-label="Kağıt biçimi">
          <button type="button" className={`btn btn-sm ${size === "a4" ? "btn-primary" : "btn-secondary"}`} onClick={() => setSize("a4")}>
            A4
          </button>
          <button type="button" className={`btn btn-sm ${size === "thermal" ? "btn-primary" : "btn-secondary"}`} onClick={() => setSize("thermal")}>
            Dar fiş (72 mm)
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" />
            Yazdır / PDF kaydet
          </button>
        </div>
      </div>

      <ReceiptPaper model={model} size={size} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="receipt-row">
      <span className="muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function ReceiptPaper({ model, size }: { model: ReceiptModel; size: PaperSize }) {
  return (
    <article className={`receipt receipt--${size}`} aria-label={model.title}>
      <header className="receipt-header">
        <strong className="receipt-business">{model.business.name}</strong>
        {model.business.phone ? <div>{model.business.phone}</div> : null}
        {model.business.address ? <div className="muted">{model.business.address}</div> : null}
        <h1 className="receipt-title">{model.title}</h1>
        <div>
          <strong>{model.documentNo}</strong> · {formatDateTime(model.receivedDate)}
        </div>
      </header>

      <section>
        <Row label="Müşteri">
          {model.customer.name}
          {model.customer.phone ? ` · ${model.customer.phone}` : ""}
          {model.customer.village ? ` · ${model.customer.village}` : ""}
        </Row>
        <Row label="Makine">
          {model.machine.title}
          {model.machine.type && model.machine.title !== model.machine.type ? ` (${model.machine.type})` : ""}
        </Row>
        {model.machine.identifier ? <Row label="Kimlik">{model.machine.identifier}</Row> : null}
        {model.type === "summary" ? <Row label="Durum">{model.statusText}</Row> : null}
      </section>

      <section>
        {model.complaint ? <Row label="Şikâyet">{model.complaint}</Row> : null}
        {model.existingDamage ? <Row label="Mevcut hasar">{model.existingDamage}</Row> : null}
        {model.accessories ? <Row label="Teslim alınan aksesuar">{model.accessories}</Row> : null}
        {model.promisedDate ? <Row label="Teslim sözü">{formatDate(model.promisedDate + "T00:00:00")}</Row> : null}
        {model.type === "intake" && model.deposit > 0 ? <Row label="Alınan kapora">{formatCurrency(model.deposit)}</Row> : null}
      </section>

      {model.type === "summary" ? (
        <>
          {model.diagnosis ? <Row label="Teşhis">{model.diagnosis}</Row> : null}
          {model.resolution ? <Row label="Yapılan iş">{model.resolution}</Row> : null}

          {model.lines.length > 0 ? (
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Kalem</th>
                  <th className="num">Mik.</th>
                  <th className="num">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {model.lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.description}
                      <span className="muted"> · {l.kind}</span>
                    </td>
                    <td className="num">{formatQuantity(l.quantity)}</td>
                    <td className="num">{formatCurrency(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <section className="receipt-totals">
            <Row label="Toplam">{formatCurrency(model.total)}</Row>
            <Row label="Tahsil edilen">{formatCurrency(model.paid)}</Row>
            <Row label="Kalan bakiye">
              <strong>{formatCurrency(model.remaining)}</strong>
            </Row>
          </section>

          {model.delivery ? (
            <section>
              <Row label="Teslim">
                {model.delivery.date ? formatDateTime(model.delivery.date) : ""}
                {model.delivery.to ? ` · Teslim alan: ${model.delivery.to}` : ""}
              </Row>
              {model.delivery.debtAcknowledged ? (
                <Row label="Borçlu teslim">
                  Kalan {formatCurrency(model.delivery.debtBalance)} müşteri tarafından kabul edilmiştir.
                </Row>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      <footer className="receipt-footer">
        {model.type === "intake" ? <p className="receipt-terms">{model.terms}</p> : null}
        {model.type === "intake" ? (
          <div className="receipt-sign">
            <span>Teslim eden (müşteri)</span>
            <span>Teslim alan (servis)</span>
          </div>
        ) : null}
        <p className="muted receipt-disclaimer">{model.disclaimer}</p>
      </footer>
    </article>
  );
}
