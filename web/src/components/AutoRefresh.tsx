"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Quietly re-reads the page's data every few seconds while `active`, so something that finishes in the
 * background (a piece's clean photo) appears by itself without a reload. Renders nothing.
 *
 * - Stops as soon as `active` turns false (the server stops flagging the piece), so a normal page does
 *   no extra work at all.
 * - Has a hard stop (about two minutes) as a safety net.
 * - Skips checks while the tab is hidden, and checks immediately when the person comes back: iPhones
 *   pause background tabs, so a timer alone would leave the placeholder stale after switching apps.
 */
export function AutoRefresh({ active, everyMs = 3000, maxChecks = 40 }: { active: boolean; everyMs?: number; maxChecks?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let checks = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      checks++;
      router.refresh();
      if (checks >= maxChecks) clearInterval(id);
    }, everyMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, everyMs, maxChecks, router]);

  return null;
}
