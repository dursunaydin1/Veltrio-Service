import type { User } from "@/types";

/**
 * Patron ve çalışan yetkileri (K-119). Patron her şeyi yapar. Çalışan günlük işleri
 * (satış, servis, teslim, tahsilat, müşteri ve makine kaydı) her zaman yapar; aşağıdaki
 * işler patronun çalışana tek tek verdiği izinlere bağlıdır.
 *
 * Aynı liste veritabanında da vardır (028 → valid_staff_permissions); kurallar ekranda
 * düğme gizlemekle kalmaz, sunucu izinsiz yazmayı ayrıca reddeder. Maliyet ve alış
 * bilgisi izni olmayan çalışanın cihazına hiç gönderilmez (029, K-120). "reports" ve
 * "credit_sale" yalnızca ekranda uygulanır.
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
  reports: { label: "Raporları görsün", hint: "Ciro, kâr, kasa, borç-alacak ve stok raporları (alış fiyatlarını da görür)" },
  purchases: { label: "Satın alma ve stok girişi yapsın", hint: "Alış faturası, tedarikçi, stok girişi ve sayım (alış fiyatlarını da görür)" },
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
 * Bir izin başka izinlerle birlikte gelir: alış yapan ya da rapor gören alış fiyatını
 * zaten görür. Sunucuda 029 → staff_sees_costs aynı kuralı uygular.
 */
const IMPLIED_BY: Partial<Record<StaffPermission, readonly StaffPermission[]>> = {
  view_costs: ["purchases", "reports"],
};

/**
 * Kullanıcı bu işi yapabilir mi? Oturum bilgisi henüz yoksa (ilk açılış, Supabase'siz
 * yerel çalışma) kısıtlama uygulanmaz; sunucu yine de kendi kontrolünü yapar.
 */
export function can(user: Actor, permission: StaffPermission): boolean {
  if (!user) return true;
  if (user.is_active === false) return false;
  if (user.role === "owner") return true;
  const granted = user.permissions ?? [];
  return granted.includes(permission) || (IMPLIED_BY[permission] ?? []).some((p) => granted.includes(p));
}

/** Alış / tedarikçi kayıtları bu kullanıcının cihazına iner mi? */
export function seesPurchaseRecords(user: Actor): boolean {
  return can(user, "purchases") || can(user, "reports");
}

/**
 * Cihazdaki verinin kapsamı. Değişince (izin verildi ya da alındı) eşitleme baştan
 * yapılır: yeni izinle gelen bilgi iner, kapanan izinle gizlenen bilgi cihazdan silinir.
 * Oturum bilgisi yoksa null (karar verilmez).
 */
export function dataScope(user: Actor): string | null {
  if (!user) return null;
  return `${can(user, "view_costs") ? "c" : ""}${seesPurchaseRecords(user) ? "p" : ""}`;
}

/** Patron cihazının kapsamı; eski cihazlarda kayıtlı kapsam yoksa bu varsayılır. */
export const FULL_DATA_SCOPE = "cp";

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
