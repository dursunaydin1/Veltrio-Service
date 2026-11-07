"use client";

import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { addDaysToLocalDate, formatDate, todayLocalDate } from "@/lib/utils";

const QUICK = [
  { label: "1 hafta", days: 7 },
  { label: "2 hafta", days: 14 },
  { label: "1 ay", days: 30 },
] as const;

/**
 * Tarih seçimi (K-094): sık tarihler tek dokunuşla çip, takvim yalnızca "Başka tarih" için.
 * Telefonun takvim penceresi tarihe dokununca kapanmaz ("Tamam" ister); çoğu durumda o pencereye gerek kalmaz.
 */
export function DateQuickPick({ id, value, onChange }: { id: string; value: string; onChange: (date: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const today = todayLocalDate();
  const quick = QUICK.map((q) => ({ ...q, date: addDaysToLocalDate(today, q.days) }));
  const custom = !!value && !quick.some((q) => q.date === value);

  return (
    <div className="stack stack-sm">
      <div className="chip-group">
        {quick.map((q) => (
          <button key={q.label} type="button" className="chip chip-toggle" aria-pressed={value === q.date} onClick={() => onChange(q.date)}>
            {q.label}
          </button>
        ))}
        <button
          type="button"
          className="chip chip-toggle"
          aria-pressed={custom}
          onClick={() => {
            try {
              input.current?.showPicker();
            } catch {
              input.current?.focus();
            }
          }}
        >
          <CalendarDays size={16} aria-hidden="true" />
          {custom ? formatDate(value) : "Başka tarih"}
        </button>
      </div>
      {/* Takvim penceresinin kaynağı; görünmez ama telefonun takvimi bundan açılır */}
      <input
        ref={input}
        id={id}
        type="date"
        className="date-quick-native"
        tabIndex={-1}
        aria-label="Tarih seç"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? <small className="muted">Seçilen: {formatDate(value)}</small> : null}
    </div>
  );
}
