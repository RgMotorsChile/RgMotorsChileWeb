"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useMemo } from "react";
import { asset } from "@/lib/asset";
import { vehicles as staticVehicles, formatCLP } from "@/lib/vehicles";
import { getTrafficSource } from "@/lib/trafficTracking";
import { trackEvent } from "@/lib/googleAnalytics";
import { COMPANY } from "@/lib/company";
import {
  EXECUTIVE_SUGGESTIONS,
  answerAsExecutive,
  buildWhatsAppInterest,
  greetingForPage,
  parseLeadContact,
  whatsappHref,
  type ChatVehicle,
} from "@/lib/chat/executiveVirtual";

type Msg = {
  role: "user" | "ai";
  text: string;
  cars?: string[];
  waMessage?: string;
};

export default function ChatWidget() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);
  const [input, setInput] = useState("");
  const [vehiclesData, setVehiclesData] = useState<ChatVehicle[]>(
    staticVehicles as ChatVehicle[],
  );
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [greeted, setGreeted] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>("");
  const lastCarsRef = useRef<string[]>([]);
  const lastBudgetRef = useRef<number | undefined>(undefined);
  const lastWaRef = useRef<string>("");

  const [askContact, setAskContact] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [contactError, setContactError] = useState("");
  const [cookieBannerOpen, setCookieBannerOpen] = useState(false);

  const pageSlug = useMemo(() => {
    const m = pathname?.match(/^\/vehiculo\/([^/?#]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  }, [pathname]);

  const pageVehicle = useMemo(
    () => (pageSlug ? vehiclesData.find((v) => v.slug === pageSlug) ?? null : null),
    [pageSlug, vehiclesData],
  );

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data?.preferences?.enableChatbot === false) setEnabled(false);
        else setEnabled(true);
      })
      .catch(() => setEnabled(true));
  }, []);

  useEffect(() => {
    fetch("/api/vehicles?fields=card")
      .then((r) => r.json())
      .then((data) => {
        if (data?.vehicles?.length) setVehiclesData(data.vehicles);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    try {
      let sid = localStorage.getItem("rg_sid");
      if (!sid) {
        sid = "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("rg_sid", sid);
      }
      sessionIdRef.current = sid;
    } catch {
      sessionIdRef.current = "s" + Date.now().toString(36);
    }
  }, []);

  // Saludo inicial / al reabrir tras cambiar de ficha.
  useEffect(() => {
    if (!enabled || greeted) return;
    setMsgs([
      {
        role: "ai",
        text: greetingForPage(pageVehicle),
        cars: pageVehicle ? [pageVehicle.slug] : undefined,
      },
    ]);
    setGreeted(true);
  }, [enabled, greeted, pageVehicle]);

  // Cuando el stock llega y ya estamos en una ficha, enriquecer el saludo genérico.
  useEffect(() => {
    if (!enabled || !pageVehicle) return;
    setMsgs((prev) => {
      if (prev.length !== 1 || prev[0].role !== "ai") return prev;
      if (prev[0].cars?.includes(pageVehicle.slug)) return prev;
      return [
        {
          role: "ai",
          text: greetingForPage(pageVehicle),
          cars: [pageVehicle.slug],
        },
      ];
    });
  }, [enabled, pageVehicle]);

  // Si cambia la ficha con el chat cerrado, refrescar saludo la próxima apertura.
  useEffect(() => {
    if (!open && pageSlug) setGreeted(false);
  }, [pageSlug, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" });
  }, [msgs, open, askContact]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setShowTeaser(true), 1200);
    return () => clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("rg_cookie_consent_v1");
      setCookieBannerOpen(!(stored === "accepted" || stored === "essential"));
    } catch {
      setCookieBannerOpen(true);
    }
    const onBanner = (e: Event) => {
      const detail = (e as CustomEvent<{ open?: boolean }>).detail;
      setCookieBannerOpen(Boolean(detail?.open));
    };
    window.addEventListener("rg-cookie-banner", onBanner);
    return () => window.removeEventListener("rg-cookie-banner", onBanner);
  }, []);

  const fabOffsetClass = (() => {
    if (cookieBannerOpen && pageSlug) {
      return "bottom-[max(10.5rem,calc(env(safe-area-inset-bottom)+9.25rem))]";
    }
    if (cookieBannerOpen) {
      return "bottom-[max(8.25rem,calc(env(safe-area-inset-bottom)+7rem))]";
    }
    if (pageSlug) {
      return "bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.5rem))]";
    }
    return "bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.85rem))]";
  })();
  const panelOffsetClass = (() => {
    if (cookieBannerOpen && pageSlug) {
      return "bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] sm:bottom-[max(11.5rem,calc(env(safe-area-inset-bottom)+10.5rem))]";
    }
    if (cookieBannerOpen) {
      return "bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] sm:bottom-[max(9.5rem,calc(env(safe-area-inset-bottom)+8.5rem))]";
    }
    if (pageSlug) {
      return "bottom-[max(5.75rem,calc(env(safe-area-inset-bottom)+5rem))] sm:bottom-[max(7.25rem,calc(env(safe-area-inset-bottom)+6.5rem))]";
    }
    return "bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+4.25rem))] sm:bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5rem))]";
  })();
  const teaserOffsetClass = fabOffsetClass;

  const track = (payload: Record<string, unknown>) => {
    if (!sessionIdRef.current) return;
    try {
      const traffic = getTrafficSource();
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          trafficSource: traffic,
          source: "Ejecutivo virtual",
          ...payload,
        }),
      }).catch(() => {});
    } catch {
      /* noop */
    }
  };

  const siteOrigin =
    typeof window !== "undefined" ? window.location.origin : undefined;

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);

    const reply = answerAsExecutive(q, vehiclesData, {
      pageVehicle,
      siteOrigin,
    });

    if (reply.cars?.length) lastCarsRef.current = reply.cars;
    if (reply.budget != null) lastBudgetRef.current = reply.budget;
    if (reply.waMessage) lastWaRef.current = reply.waMessage;

    track({
      bodyType: reply.bodyType,
      budget: reply.budget ?? lastBudgetRef.current,
      financing: reply.financing,
      intents: reply.intents,
      models: reply.cars ?? [],
      messages: 1,
    });

    const aiMsg: Msg = {
      role: "ai",
      text: reply.text,
      cars: reply.cars,
      waMessage: reply.waMessage,
    };

    setTimeout(() => {
      setMsgs((m) => [...m, aiMsg]);
      if (reply.showContact && !contactSent) {
        setTimeout(() => setAskContact(true), 400);
      }
    }, 420);
  };

  const carsForContact = (): ChatVehicle[] => {
    const slugs = lastCarsRef.current;
    return slugs
      .map((s) => vehiclesData.find((v) => v.slug === s))
      .filter(Boolean) as ChatVehicle[];
  };

  const sendContact = () => {
    setContactError("");
    const parsed = parseLeadContact(contactName, contactValue);
    if (!parsed.ok) {
      setContactError(parsed.error);
      return;
    }

    const cars = carsForContact();
    const waMsg = buildWhatsAppInterest({
      name: parsed.name,
      vehicles: cars,
      budget: lastBudgetRef.current,
      origin: siteOrigin,
    });
    lastWaRef.current = waMsg;

    track({
      name: parsed.name,
      contact: parsed.contact,
      budget: lastBudgetRef.current,
      models: cars.map((c) => c.slug),
      intents: ["contacto", parsed.kind],
      messages: 1,
    });

    setContactSent(true);
    setAskContact(false);
    setContactName("");
    setContactValue("");
    setMsgs((m) => [
      ...m,
      {
        role: "ai",
        text: `¡Gracias, ${parsed.name}! Un ejecutivo te contactará pronto. También puedes escribirnos ahora por WhatsApp con las fichas listas.`,
        waMessage: waMsg,
      },
    ]);
  };

  const openWhatsAppNow = (message?: string) => {
    const cars = carsForContact();
    const msg =
      message ||
      lastWaRef.current ||
      buildWhatsAppInterest({
        name: contactName.trim() || undefined,
        vehicles: cars,
        budget: lastBudgetRef.current,
        origin: siteOrigin,
      });
    track({
      intents: ["whatsapp-handoff"],
      models: cars.map((c) => c.slug),
      messages: 1,
    });
    trackEvent("whatsapp_click", { link_location: "chat" });
    window.open(whatsappHref(msg), "_blank", "noopener,noreferrer");
  };

  if (!enabled) return null;

  return (
    <>
      {!open && showTeaser && (
        <div
          onClick={() => {
            setOpen(true);
            setShowTeaser(false);
          }}
          className={`fixed ${teaserOffsetClass} right-24 z-50 hidden sm:flex max-w-[310px] cursor-pointer items-center gap-3 rounded-2xl border border-white/15 bg-ink-950/90 p-3 pr-3.5 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:scale-[1.02] hover:border-brand-500/50 active:scale-95 animate-fade-in group`}
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 to-brand-400 text-xs shadow-glow">
            EV
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-ink-950 bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[13px] font-bold text-white group-hover:text-brand-300 transition-colors">
                Ejecutivo virtual
              </span>
              <span className="text-[10px] text-emerald-400">● En línea</span>
            </div>
            <p className="truncate text-[12px] text-white/70">
              {pageVehicle
                ? `¿Te ayudo con el ${pageVehicle.brand} ${pageVehicle.model}?`
                : "¿Buscas auto? Te ayudo con el stock ➔"}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowTeaser(false);
            }}
            className="touch-target grid h-11 w-11 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white transition"
            aria-label="Cerrar sugerencia"
          >
            ✕
          </button>
        </div>
      )}

      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setShowTeaser(false);
        }}
        className={`fixed ${fabOffsetClass} right-[max(0.85rem,env(safe-area-inset-right))] z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 to-brand-400 text-xl text-white shadow-glow transition-all duration-300 hover:scale-105 active:scale-95 border border-white/20 backdrop-blur-xl sm:h-14 sm:w-14 sm:text-2xl`}
        aria-label="Ejecutivo virtual RG Motors"
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div
          className={`fixed ${panelOffsetClass} left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 flex h-[min(560px,78dvh)] max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-white/15 bg-ink-950/95 backdrop-blur-2xl shadow-2xl animate-fade-up sm:left-auto sm:right-[max(1rem,env(safe-area-inset-right))] sm:h-[min(520px,70dvh)] sm:max-h-[78vh] sm:w-[min(92vw,375px)] sm:rounded-3xl`}
        >          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3.5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 to-brand-400 text-[10px] font-bold tracking-tight shadow-glow">
                EV
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-ink-950 bg-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold tracking-tight text-white">
                  Ejecutivo virtual
                </p>
                <p className="text-[10px] text-emerald-400">● En línea · RG Motors</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={COMPANY.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-11 w-11 place-items-center rounded-full border border-pink-500/20 bg-pink-500/10 text-pink-300 transition hover:bg-pink-500/25"
                title="Instagram @_rgmotors"
                aria-label="Instagram"
              >
                <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a
                href={COMPANY.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-11 w-11 place-items-center rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-300 transition hover:bg-blue-500/25"
                title="Facebook Automotora GA"
                aria-label="Facebook"
              >
                <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                  <path d="M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.374 14.5 5 15.5 5H18V0h-3.808C10.597 0 9 1.582 9 4.615V8z" />
                </svg>
              </a>
              <button
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition"
                aria-label="Cerrar chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className="space-y-2">
                <div
                  className={`max-w-[90%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[13px] font-medium leading-relaxed ${
                    m.role === "user"
                      ? "ml-auto bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm"
                      : "bg-white/[0.08] text-white/90 border border-white/10 backdrop-blur-md"
                  }`}
                >
                  {m.text}
                </div>

                {m.cars && (
                  <div className="space-y-2 pl-1">
                    {m.cars.map((slug) => {
                      const v = vehiclesData.find((x) => x.slug === slug);
                      if (!v) return null;
                      return (
                        <Link
                          key={slug}
                          href={`/vehiculo/${slug}`}
                          onClick={() => setOpen(false)}
                          className="apple-glass-card flex items-center gap-3 rounded-2xl p-2.5 transition-transform hover:-translate-y-0.5"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset(v.image || "")}
                            alt={v.model}
                            className="h-12 w-16 rounded-xl object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-white">
                              {v.brand} {v.model}
                            </p>
                            <p className="text-[11px] font-semibold text-brand-300">
                              {formatCLP(v.price)}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {m.role === "ai" && m.waMessage && (
                  <button
                    type="button"
                    onClick={() => openWhatsAppNow(m.waMessage)}
                    className="ml-1 min-h-11 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-[13px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                  >
                    Hablar ahora por WhatsApp
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 bg-white/[0.02] p-3.5 backdrop-blur-md">
            {askContact && !contactSent && (
              <div className="mb-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-3 backdrop-blur-md space-y-2">
                <p className="text-[13px] font-medium text-white/80">
                  ¿Te enviamos estas opciones? Deja tu nombre y WhatsApp.
                </p>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Tu nombre"
                  className="min-h-11 w-full rounded-full border border-white/15 bg-black/40 px-3 py-2.5 text-[13px] text-white outline-none focus:border-brand-500 placeholder-white/40"
                />
                <input
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  placeholder="WhatsApp (9… ) o email"
                  className="min-h-11 w-full rounded-full border border-white/15 bg-black/40 px-3 py-2.5 text-[13px] text-white outline-none focus:border-brand-500 placeholder-white/40"
                  onKeyDown={(e) => e.key === "Enter" && sendContact()}
                />
                {contactError ? (
                  <p className="text-[12px] text-red-300">{contactError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={sendContact}
                    className="apple-btn-primary min-h-11 rounded-full px-3.5 py-2.5 text-[13px] font-semibold text-white"
                  >
                    Guardar contacto
                  </button>
                  <button
                    type="button"
                    onClick={() => openWhatsAppNow()}
                    className="min-h-11 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-300"
                  >
                    WhatsApp ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => setAskContact(false)}
                    aria-label="Cerrar"
                    className="touch-target grid h-11 w-11 place-items-center text-[13px] text-white/40 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {EXECUTIVE_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="min-h-11 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] font-medium text-white/75 transition hover:bg-white/15 hover:text-white active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Marca, presupuesto, visita…"
                className="min-h-11 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[13px] text-white outline-none focus:border-brand-500 focus:bg-white/[0.09] transition placeholder-white/40"
              />
              <button
                type="submit"
                className="apple-btn-primary touch-target grid h-11 w-11 place-items-center rounded-full text-white text-sm shadow-glow"
                aria-label="Enviar"
              >
                ➔
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
