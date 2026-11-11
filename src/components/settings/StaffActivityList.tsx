"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { loadActivity } from "@/lib/notifications/staffActivity";
import { addDaysToLocalDate, formatDateTime, localDateOf, todayLocalDate } from "@/lib/utils";

const PAGE = 30;
type Range = "today" | "week" | "all";
const RANGES: [Range, string][] = [["today", "Bugün"], ["week", "Bu hafta"], ["all", "Tümü"]];
/** "satış yaptı: …" → "Satış yaptı: …" (listede kişi adı yok, cümle büyük harfle başlar) */
const sentence = (text: string) => text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1);

/** Çalışan kartında "Yaptıkları" (K-121): bu çalışanın cihazlarından girilen işler, yeniden eskiye. */
export function StaffActivityList({ businessId, devices }: { businessId: string; devices: readonly string[] }) {
  const [range, setRange] = useState<Range>("today");
  const [limit, setLimit] = useState(PAGE);
  const deviceKey = devices.join(",");
  const items = useLiveQuery(() => loadActivity(businessId, new Set(deviceKey.split(",").filter(Boolean))), [businessId, deviceKey]);

  const visible = useMemo(() => {
    const today = todayLocalDate();
    const weekStart = addDaysToLocalDate(today, -6);
    return (items ?? []).filter((i) => {
      if (range === "all") return true;
      const day = localDateOf(new Date(i.at));
      return range === "today" ? day === today : day >= weekStart;
    });
  }, [items, range]);

  return (
    <div className="stack stack-sm">
      <div role="tablist" aria-label="Zaman aralığı">
        {RANGES.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={range === id} onClick={() => { setRange(id); setLimit(PAGE); }}>
            {label}
          </button>
        ))}
      </div>
      {items === undefined ? null : visible.length === 0 ? (
        <small className="muted">{devices.length === 0 ? "Bu çalışanın kayıtlı cihazı yok." : "Bu aralıkta kayıtlı işi yok."}</small>
      ) : (
        <>
          <ul className="menu-list" aria-label="Yaptıkları">
            {visible.slice(0, limit).map((i) => (
              <li key={i.key} className="line-item">
                {i.href ? <Link href={i.href}>{sentence(i.text)}</Link> : <span>{sentence(i.text)}</span>}
                <small className="muted">{formatDateTime(i.at)}</small>
              </li>
            ))}
          </ul>
          {visible.length > limit ? (
            <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => setLimit(limit + PAGE)}>
              Daha fazla göster ({visible.length - limit})
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
