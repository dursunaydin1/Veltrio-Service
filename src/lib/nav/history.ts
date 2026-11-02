/**
 * Uygulama içi gezinme yığını (K-076): telefonun "geri" hareketi geçmişi tersine sarmak yerine
 * basamak basamak yukarı çıkar ve ana sayfada biter.
 *
 * Kurallar:
 * - Alt çubuktaki bir sekmeye ana sayfadan gidilir (yığın: ana sayfa → sekme). Başka bir yerden
 *   dokunulursa önce ana sayfaya dönülür, sonra sekme açılır; sekmeler üst üste birikmez.
 * - Form kaydedilince form yığından çıkar (yerine kayıt sayfası gelir); geri, formu yeniden açmaz.
 * - Ana sayfadayken yığın boştur; telefonun geri hareketi uygulamadan çıkar.
 *
 * Tarayıcı geçmişin uzunluğunu söylemez; bu yüzden ana sayfanın kaç adım geride olduğu (depth) burada tutulur.
 */
export type NavState = { depth: number; rootIsHome: boolean };
export type NavKind = "push" | "replace" | "pop" | "home";

export const HOME = "/dashboard";

export function initialNav(pathname: string): NavState {
  return { depth: 0, rootIsHome: pathname === HOME };
}

/** Bir sayfa değişiminden sonra yığının yeni durumu. */
export function nextNav(state: NavState, kind: NavKind): NavState {
  switch (kind) {
    case "push":
      return { ...state, depth: state.depth + 1 };
    case "replace":
      return state;
    case "pop":
      return { ...state, depth: Math.max(0, state.depth - 1) };
    case "home":
      return { depth: 0, rootIsHome: true };
  }
}

/** Ana sayfaya nasıl dönülür: geçmişte geri gidilerek (adım sayısı) ya da ana sayfa yerine konarak. */
export function homeRoute(state: NavState): { go: number } | { replace: true } {
  return state.rootIsHome && state.depth > 0 ? { go: -state.depth } : { replace: true };
}
