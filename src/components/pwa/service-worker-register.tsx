"use client";

import { useEffect } from "react";

/**
 * Registers the offline-shell service worker after responsive shell loads.
 * No-op when SW unsupported (e.g. some private browsing modes).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return;

    const url = "/sw.js";
    navigator.serviceWorker.register(url).catch(() => {
      // Installability is best-effort; never block gameplay.
    });
  }, []);

  return null;
}
