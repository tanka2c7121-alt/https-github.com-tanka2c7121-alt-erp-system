"use client";

import { useEffect } from "react";

export default function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA install should not block ERP usage if registration is unavailable.
    });
  }, []);

  return null;
}
