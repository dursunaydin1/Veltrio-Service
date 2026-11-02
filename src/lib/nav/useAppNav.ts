"use client";

import { useCallback, useEffect } from "react";
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

/** AppShell'de bir kez çalışır: her sayfa değişiminde yığını günceller (K-076). */
export function useNavTracker() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onPop = () => {
      if (pending !== "home") pending = "pop";
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(KEY);
    } catch {
      // yok sayılır
    }
    // İlk açılış: yığın bu sayfadan başlar
    const state = raw === null ? initialNav(pathname) : nextNav(read(pathname), pending ?? "push");
    pending = null;
    write(state);
    if (pathname === HOME && afterHome) {
      const target = afterHome;
      afterHome = null;
      router.push(target);
    }
  }, [pathname, router]);
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
