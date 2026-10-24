import { hasPin } from "./pin";

/**
 * Uygulamanın PIN kilidi durumu (bellekte). Tarayıcı her açıldığında, PIN tanımlıysa
 * kilitli başlar; uygulama uzun süre arka plandaysa yeniden kilitlenir. React'e
 * `useSyncExternalStore` ile bağlanır; sunucuda hiçbir zaman kilitli sayılmaz.
 */

/** Arka planda bu süreden uzun kalırsa yeniden kilitlenir */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;

let locked = false;
let initialized = false;
const listeners = new Set<() => void>();

function init(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  locked = hasPin(window.localStorage);
}

function emit(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  init();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getSnapshot = (): boolean => {
  init();
  return locked;
};

export const getServerSnapshot = (): boolean => false;

export function lockApp(): void {
  init();
  if (!hasPin(window.localStorage)) return;
  locked = true;
  emit();
}

export function unlockApp(): void {
  locked = false;
  emit();
}
