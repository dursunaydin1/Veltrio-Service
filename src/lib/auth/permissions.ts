import type { User } from "@/types";

/**
 * Patron ve çalışan yetkileri (K-119). Patron her şeyi yapar. Çalışan günlük işleri
 * (satış, servis, teslim, tahsilat, müşteri ve makine kaydı) her zaman yapar; aşağıdaki
 * işler patronun çalışana tek tek verdiği izinlere bağlıdır.
 *
 * Aynı liste veritabanında da vardır (028 → valid_staff_permissions); kurallar ekranda
 * düğme gizlemekle kalmaz, sunucu izinsiz yazmayı ayrıca reddeder. "view_costs", "reports"
 * ve "credit_sale" yalnızca ekranda uygulanır: veri internetsiz çalışmak için çalışanın
 * telefonunda da bulunur.
 */
export const STAFF_PERMISSIONS = [
  "view_costs",
  "reports",
  "purchases",
  "products",
  "cancel",
  "discount",
  "credit_sale",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<StaffPermission, { label: string; hint: string }> = {
  view_costs: { label: "Alış fiyatı ve kârı görsün", hint: "Ürün alış fiyatı, maliyet ve kâr bilgisi" },
  reports: { label: "Raporları görsün", hint: "Ciro, kasa, borç-alacak ve stok raporları" },
  purchases: { label: "Satın alma ve stok girişi yapsın", hint: "Alış faturası, tedarikçi, stok girişi ve sayım" },
  products: { label: "Ürün ekleyip fiyat değiştirsin", hint: "Yeni ürün, ürün bilgisi, satış fiyatı, barkod" },
  cancel: { label: "İptal ve iade yapsın", hint: "Satış / servis iptali, iade, ödeme iptali" },
  discount: { label: "İndirim yapsın", hint: "Satışta satır veya toplam indirimi" },
  credit_sale: { label: "Veresiye satsın", hint: "Ödemesi alınmadan satış ve teslim" },
};

/** Yeni çalışan için önerilen izinler: veresiye açık, gerisi kapalı */
export const DEFAULT_STAFF_PERMISSIONS: readonly StaffPermission[] = ["credit_sale"];

export function isStaffPermission(value: unknown): value is StaffPermission {
  return typeof value === "string" && (STAFF_PERMISSIONS as readonly string[]).includes(value);
}

type Actor = Pick<User, "role" | "is_active" | "permissions"> | null | undefined;

export function isOwner(user: Actor): boolean {
  return !!user && user.role === "owner" && user.is_active !== false;
}

/**
 * Kullanıcı bu işi yapabilir mi? Oturum bilgisi henüz yoksa (ilk açılış, Supabase'siz
 * yerel çalışma) kısıtlama uygulanmaz; sunucu yine de kendi kontrolünü yapar.
 */
export function can(user: Actor, permission: StaffPermission): boolean {
  if (!user) return true;
  if (user.is_active === false) return false;
  if (user.role === "owner") return true;
  return (user.permissions ?? []).includes(permission);
}

/** "owner" yalnızca patronun girebildiği bölümler (ayarlar, yedek, cihazlar…) */
export type RouteRequirement = StaffPermission | "owner";

/**
 * Yol → gereken yetki. En uzun eşleşen önek kazanır; listede olmayan yol herkese açıktır.
 * Ayarlar'da çalışanın kendi cihazına ait bölümler (görünüm, PIN) açık kalır.
 */
const ROUTE_RULES: ReadonlyArray<readonly [string, RouteRequirement | null]> = [
  ["/purchases", "purchases"],
  ["/suppliers", "purchases"],
  ["/reports", "reports"],
  ["/products/new", "products"],
  ["/settings", "owner"],
  ["/settings/appearance", null],
  ["/settings/pin", null],
];

export function routeRequirement(pathname: string): RouteRequirement | null {
  let best: { length: number; rule: RouteRequirement | null } | null = null;
  for (const [prefix, rule] of ROUTE_RULES) {
    const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (matches && (!best || prefix.length > best.length)) best = { length: prefix.length, rule };
  }
  return best?.rule ?? null;
}

export function canOpenRoute(user: Actor, pathname: string): boolean {
  const rule = routeRequirement(pathname);
  if (!rule) return true;
  if (!user) return true;
  return rule === "owner" ? isOwner(user) : can(user, rule);
}

export const ROLE_LABELS: Record<User["role"], string> = { owner: "Patron", staff: "Çalışan" };
