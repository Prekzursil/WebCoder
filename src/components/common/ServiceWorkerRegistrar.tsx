"use client";

// OPS-6 (Wave D): service-worker registration for the PWA. Registered
// ONLY in production builds — the SW's HTML/asset caching breaks
// next-dev HMR. The `sw.js` file itself is served from /public in every
// mode (the e2e suite asserts that), but it stays dormant in dev.

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration is non-fatal by design: the site is a
        // plain web app without the SW; retry happens on next load.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
