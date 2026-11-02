"use client";

import { useState } from "react";

/**
 * Uzun listeler parça parça çizilir (K-077): önce ilk `step` kayıt, aşağı kaydırdıkça sıradaki parça.
 * Arama / sekme değişince (liste değişince) yeniden ilk parçadan başlanır.
 */
export function useIncremental<T>(items: T[], step = 30) {
  const [limit, setLimit] = useState(step);
  const [source, setSource] = useState(items);
  if (source !== items) {
    setSource(items);
    setLimit(step);
  }
  return {
    items: items.length > limit ? items.slice(0, limit) : items,
    hasMore: items.length > limit,
    remaining: Math.max(0, items.length - limit),
    next: () => setLimit((n) => n + step),
  };
}
