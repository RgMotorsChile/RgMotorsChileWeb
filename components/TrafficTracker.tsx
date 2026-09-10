"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { captureTrafficSource } from "@/lib/trafficTracking";

const CONSENT_KEY = "rg_cookie_consent_v1";
const SESSION_KEY = "rg_session_id";

function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `s_${Date.now().toString(36)}`;
  }
}

function maybeCaptureTraffic() {
  if (!hasConsent()) return;
  captureTrafficSource();
}

function sendPageview(path: string) {
  if (!hasConsent()) return;
  if (path.startsWith("/admin")) return;
  const sessionId = getOrCreateSessionId();
  const payload = JSON.stringify({ path, sessionId });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/track/pageview", blob);
      return;
    }
  } catch {
    /* fall through */
  }
  void fetch("/api/track/pageview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export default function TrafficTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string>("");

  useEffect(() => {
    maybeCaptureTraffic();
    const onConsent = () => {
      maybeCaptureTraffic();
      if (pathname) sendPageview(pathname);
    };
    window.addEventListener("rg-cookie-consent", onConsent);
    return () => window.removeEventListener("rg-cookie-consent", onConsent);
  }, [pathname]);

  useEffect(() => {
    if (!pathname) return;
    const key = `${pathname}`;
    if (lastSent.current === key) return;
    lastSent.current = key;
    sendPageview(pathname);
  }, [pathname]);

  return null;
}
