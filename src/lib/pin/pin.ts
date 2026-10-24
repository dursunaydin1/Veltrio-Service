/**
 * Cihaz PIN kodu (Adım 1.5, FR-001, AC-020): oturum açık cihazda hızlı kilit açma.
 * PIN yalnızca bu cihazda saklanır, düz metin tutulmaz (PBKDF2-SHA-256 + tuz).
 * 5 hatalı denemede geçici kilit, sonraki hatalarda artan bekleme uygulanır.
 */

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 8;
export const MAX_FREE_ATTEMPTS = 5;
/** 5. hatada 30 sn, sonraki her hatada: 1 dk, 5 dk, 15 dk, 60 dk (üst sınır) */
const LOCK_STEPS_MS = [30_000, 60_000, 300_000, 900_000, 3_600_000];
const ITERATIONS = 150_000;

const RECORD_KEY = "veltrio_pin";
const STATE_KEY = "veltrio_pin_state";

type PinRecord = { salt: string; hash: string; iterations: number };
type AttemptState = { failures: number; lockedUntil: number };

export function validatePinFormat(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return "PIN yalnızca rakamlardan oluşmalıdır.";
  if (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH) {
    return `PIN ${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} haneli olmalıdır.`;
  }
  if (/^(\d)\1+$/.test(pin)) return "PIN tek rakamın tekrarı olamaz.";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "PIN ardışık rakamlardan oluşamaz.";
  return null;
}

/** Hata sayısına göre bekleme süresi (ms); 5'ten az hatada 0. */
export function lockDurationMs(failures: number): number {
  if (failures < MAX_FREE_ATTEMPTS) return 0;
  return LOCK_STEPS_MS[Math.min(failures - MAX_FREE_ATTEMPTS, LOCK_STEPS_MS.length - 1)];
}

const toB64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))));
const fromB64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256
  );
  return toB64(bits);
}

export async function hashPin(pin: string, iterations: number = ITERATIONS): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toB64(salt), hash: await derive(pin, salt, iterations), iterations };
}

export async function verifyPinRecord(pin: string, record: PinRecord): Promise<boolean> {
  const hash = await derive(pin, fromB64(record.salt), record.iterations);
  // Sabit sürede karşılaştırma
  if (hash.length !== record.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ record.hash.charCodeAt(i);
  return diff === 0;
}

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const hasPin = (storage: Storage): boolean => read<PinRecord>(storage, RECORD_KEY) !== null;

export async function setPin(storage: Storage, pin: string, iterations: number = ITERATIONS): Promise<void> {
  const problem = validatePinFormat(pin);
  if (problem) throw new Error(problem);
  storage.setItem(RECORD_KEY, JSON.stringify(await hashPin(pin, iterations)));
  storage.removeItem(STATE_KEY);
}

export function removePin(storage: Storage): void {
  storage.removeItem(RECORD_KEY);
  storage.removeItem(STATE_KEY);
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "NO_PIN" }
  | { ok: false; reason: "LOCKED"; lockedUntil: number }
  | { ok: false; reason: "WRONG"; remainingAttempts: number; lockedUntil?: number };

/** Kilit süresi içindeyse PIN doğrulanmaz; hatalı denemeler sayılır ve kalıcı saklanır (sayfa yenilemekle sıfırlanmaz). */
export async function attemptUnlock(storage: Storage, pin: string, now: number = Date.now()): Promise<UnlockResult> {
  const record = read<PinRecord>(storage, RECORD_KEY);
  if (!record) return { ok: false, reason: "NO_PIN" };

  const state = read<AttemptState>(storage, STATE_KEY) ?? { failures: 0, lockedUntil: 0 };
  if (state.lockedUntil > now) return { ok: false, reason: "LOCKED", lockedUntil: state.lockedUntil };

  if (await verifyPinRecord(pin, record)) {
    storage.removeItem(STATE_KEY);
    return { ok: true };
  }

  const failures = state.failures + 1;
  const wait = lockDurationMs(failures);
  const lockedUntil = wait > 0 ? now + wait : 0;
  storage.setItem(STATE_KEY, JSON.stringify({ failures, lockedUntil }));
  return {
    ok: false,
    reason: "WRONG",
    remainingAttempts: Math.max(0, MAX_FREE_ATTEMPTS - failures),
    ...(lockedUntil ? { lockedUntil } : {}),
  };
}
