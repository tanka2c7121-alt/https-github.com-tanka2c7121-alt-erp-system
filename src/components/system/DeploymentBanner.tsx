"use client";

import { useEffect, useState } from "react";

const deploymentLabel = process.env.NEXT_PUBLIC_DEPLOYMENT_LABEL?.trim();

export default function DeploymentBanner() {
  const [runtimeLabel, setRuntimeLabel] = useState(deploymentLabel ?? "");

  useEffect(() => {
    if (deploymentLabel || typeof window === "undefined") return;

    const hostname = window.location.hostname;

    if (hostname === "192.168.1.103" || hostname.endsWith(".local")) {
      setRuntimeLabel("NAS TEST SERVER");
    }
  }, []);

  if (!runtimeLabel) return null;

  return (
    <div className="fixed left-1/2 top-3 z-[9999] -translate-x-1/2 rounded-full border border-red-300 bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg">
      {runtimeLabel}
    </div>
  );
}
