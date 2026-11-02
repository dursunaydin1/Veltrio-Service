"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HOME, homeRoute, initialNav, nextNav, type NavKind, type NavState } from "@/lib/nav/history";

const KEY = "veltrio_nav";
// Sıradaki sayfa değişiminin türü (bizim başlattığımız yerine koyma / ana sayfaya dönüş) ve
// ana sayfaya varınca açılacak sekme. Modül düzeyinde: tek bir uygulama kabuğu vardır.
let pending: NavKind | null = null;
let afterHome: string | null = null;

function read(pathname: string): NavState {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as NavState;
  } catch {
    // Depolama kapalıysa her açılışta yeniden başlar.
  }
  return initialNav(pathname);
}

function write(state: NavState) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // yok sayılır
  }
}

/** Ana sayfanın üstüne konan bekçi kaydı: ana sayfadaki ilk "geri" uygulamadan çıkmaz, uyarı gösterir. */
const GUARD = "veltrioGuard";
const EXIT_WINDOW_MS = 2500;

function hasGuard(): boolean {
  return (window.history.state as Record<string, unknown> | null)?.[GUARD] === true;
}

/** Ana sayfadaysa ve bekçi yoksa bekçi kaydı ekler (aynı adres, geçmişte bir adım). */
function armGuard() {
  if (window.location.pathname !== HOME || hasGuard()) return;
  window.history.pushState({ ...(window.history.state as object | null), [GUARD]: true }, "");
}

/**
 * AppShell'de bir kez çalışır: her sayfa değişiminde yığını günceller (K-076).
 * Ana sayfada geri yapılınca hemen çıkılmaz (K-078): "Çıkmak için tekrar geri yapın" uyarısı çıkar,
 * birkaç saniye içinde ikinci geri hareketi uygulamayı kapatır (Android'deki alışıldık davranış).
 * Web uygulaması kendini kodla kapatamaz; kapatma işini telefonun kendi geri hareketi yapar.
 * Döndürülen değer: uyarı görünüyor mu.
 */
export function useNavTracker(): boolean {
  const pathname = usePathname();
  const router = useRouter();
  const [exitHint, setExitHint] = useState(false);
  const path = useRef(pathname);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onPop = () => {
      // Ana sayfada bekçiden geri inildi: çıkış uyarısı; süre dolunca bekçi yeniden kurulur
      if (path.current === HOME && window.location.pathname === HOME && !hasGuard()) {
        pending = null;
        setExitHint(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          setExitHint(false);
          armGuard();
        }, EXIT_WINDOW_MS);
        return;
      }
      if (pending !== "home") pending = "pop";
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    path.current = pathname;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(KEY);
    } catch {
      // yok sayılır
    }
    // İlk açılış: yığın bu sayfadan başlar. Ana sayfada yığın her zaman boştur.
    const state =
      pathname === HOME ? initialNav(HOME) : raw === null ? initialNav(pathname) : nextNav(read(pathname), pending ?? "push");
    pending = null;
    write(state);
    if (pathname === HOME && afterHome) {
      const target = afterHome;
      afterHome = null;
      router.push(target);
    } else if (pathname === HOME) {
      armGuard();
    }
  }, [pathname, router]);

  // Uyarı yalnızca ana sayfada görünür; başka sayfaya geçilince kendiliğinden kalkar
  return exitHint && pathname === HOME;
}

/** Yığına uygun gezinme: sekme açma, ana sayfaya dönme, kaydettikten sonra yerine koyma. */
export function useAppNav() {
  const pathname = usePathname();
  const router = useRouter();

  const goHome = useCallback(() => {
    if (pathname === HOME) return;
    const route = homeRoute(read(pathname));
    if ("go" in route) {
      pending = "home";
      window.history.go(route.go);
    } else {
      pending = "home";
      router.replace(HOME);
    }
  }, [pathname, router]);

  const goTab = useCallback(
    (href: string) => {
      if (pathname === href) return;
      if (href === HOME) return goHome();
      if (pathname === HOME) return router.push(href);
      // Önce ana sayfaya dön, oradan sekmeyi aç: geri hareketi sekmeden ana sayfaya iner
      afterHome = href;
      goHome();
    },
    [pathname, router, goHome]
  );

  const replace = useCallback(
    (href: string) => {
      pending = "replace";
      router.replace(href);
    },
    [router]
  );

  return { goHome, goTab, replace };
}
