"use client";

import { useEffect } from "react";

// While the app is open and visible, ping the server every 4 minutes so the database never idles long enough to be suspended
// (it is the first query after a suspend that takes seconds). Costs one tiny query per 4 minutes and nothing when the tab is hidden.
export default function KeepWarm() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible") fetch("/api/ping", { cache: "no-store" }).catch(() => {});
    };
    const id = window.setInterval(ping, 4 * 60 * 1000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
  return null;
}
