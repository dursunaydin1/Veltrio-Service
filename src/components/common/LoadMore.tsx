"use client";

import { useEffect, useRef } from "react";

/** Listenin sonuna gelince sıradaki parçayı yükler; kaydırma algılanmazsa düğmeyle de yüklenir (K-077). */
export function LoadMore({ remaining, onMore }: { remaining: number; onMore: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const more = useRef(onMore);
  useEffect(() => {
    more.current = onMore;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) more.current();
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <button ref={ref} type="button" className="btn btn-ghost btn-full" onClick={onMore}>
      {remaining} kayıt daha göster
    </button>
  );
}
