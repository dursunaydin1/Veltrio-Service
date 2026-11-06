"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/** Biraz aşağı inince belirir (yaklaşık 3 liste satırı, K-102); en baştayken görünmez */
const SHOW_AFTER = 200;

/**
 * Uzun listelerde "Başa dön" (K-101): aşağı inince alt çubuğun üstünde sağda belirir, dokununca yumuşakça başa döner.
 * Liste kutu içinde kaymaz; sayfa kayar, sekmeler + arama zaten üstte yapışık (K-097). Açık sekmeye yeniden dokunmak da başa döndürür.
 */
export function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;
  return (
    <button type="button" className="scroll-top" aria-label="Başa dön" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
      <ArrowUp size={22} aria-hidden="true" />
    </button>
  );
}
