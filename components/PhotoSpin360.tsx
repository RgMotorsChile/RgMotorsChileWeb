"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Visor 360° por fotos.
 * - Precarga y decodifica TODAS las fotos livianas antes de permitir girar (sin saltos).
 * - Dibuja en un <canvas> dentro de requestAnimationFrame: el arrastre solo mueve una
 *   posición continua; el canvas se repinta una vez por frame de pantalla.
 * - Inercia con fricción exponencial, giro automático suave, zoom (rueda/pellizco/doble toque)
 *   y alta resolución bajo demanda cuando hay zoom o pantalla completa.
 */
type Props = {
  frames: string[];
  /** Mismas fotos en alta resolución (zoom / pantalla completa). */
  hiFrames?: string[];
  /** Índice de la foto que muestra el frente. */
  frontIndex?: number;
  /** Ignorado (compatibilidad): la sensibilidad se calcula por ancho del visor. */
  dragSensitivity?: number;
  className?: string;
  /** Gira solo al terminar de cargar (por defecto sí). */
  autoPlay?: boolean;
  /** Hoja de miniaturas (todas las fotos en una imagen) para mostrar algo útil al instante. */
  sprite?: { src: string; cols: number; w: number; h: number };
  /** Si el tour no puede cargarse, el contenedor vuelve a la galería. */
  onFatal?: () => void;
};

type SpriteState = { img: Drawable; cols: number; w: number; h: number } | null;
const HI_CACHE = 8;

type Drawable = ImageBitmap | HTMLImageElement;

const TURN_WIDTHS = 1.15; // una vuelta completa = 1,15 anchos de visor arrastrados
const AUTO_SECONDS_PER_TURN = 14;
const FRICTION_PER_MS = 0.9965; // inercia
const MAX_ZOOM = 3;

async function loadDrawable(src: string): Promise<Drawable | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(img);
      } catch {
        return img;
      }
    }
    return img;
  } catch {
    return null;
  }
}

function dims(d: Drawable) {
  return "naturalWidth" in d ? { w: d.naturalWidth, h: d.naturalHeight } : { w: d.width, h: d.height };
}

export default function PhotoSpin360({
  frames,
  hiFrames,
  frontIndex,
  className = "",
  autoPlay = true,
  sprite,
  onFatal,
}: Props) {
  const total = frames.length;
  const start = typeof frontIndex === "number" && frontIndex >= 0 && frontIndex < total ? frontIndex : 0;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lowRef = useRef<(Drawable | null)[]>([]);
  const hiRef = useRef<Map<number, Drawable | "loading">>(new Map());
  const spriteRef = useRef<SpriteState>(null);
  const animRef = useRef<{ from: number; to: number; t0: number } | null>(null);

  // Estado de animación (refs: no re-render por frame)
  const posRef = useRef(start); // posición continua en "fotos"
  const velRef = useRef(0); // fotos por ms
  const autoRef = useRef(autoPlay);
  const dragRef = useRef<{ x: number; pos: number; samples: { t: number; p: number }[] } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ d: number; z: number } | null>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const lastDrawn = useRef({ i: -1, z: 0, px: 0, py: 0, w: 0, h: 0, hi: false });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastTapRef = useRef(0);
  const idleTimer = useRef<number | null>(null);

  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [firstShown, setFirstShown] = useState(false);
  const [auto, setAuto] = useState(autoPlay);
  const [interacted, setInteracted] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const angleRef = useRef<HTMLSpanElement>(null);

  const idx = (p: number) => ((Math.round(p) % total) + total) % total;

  // ---------- Dibujo ----------
  const draw = useCallback(
    (force = false) => {
      const canvas = canvasRef.current;
      if (!canvas || !total) return;
      const i = idx(posRef.current);
      const z = zoomRef.current;
      const { w, h, dpr } = sizeRef.current;
      const hiEntry = z > 1.01 || document.fullscreenElement ? hiRef.current.get(i) : undefined;
      const useHi = !!hiEntry && hiEntry !== "loading";
      let img: Drawable | null | undefined = useHi ? (hiEntry as Drawable) : lowRef.current[i];
      let srcRect: [number, number, number, number] | null = null;
      if (!img && spriteRef.current) {
        const sp = spriteRef.current;
        img = sp.img;
        srcRect = [(i % sp.cols) * sp.w, Math.floor(i / sp.cols) * sp.h, sp.w, sp.h];
      }
      if (!img) {
        // si la foto aún no está, usa la más cercana cargada (nunca deja el canvas vacío)
        for (let d = 1; d < total && !img; d++) img = lowRef.current[(i + d) % total] || lowRef.current[(i - d + total) % total];
        if (!img) return;
      }
      const L = lastDrawn.current;
      if (!force && L.i === i && L.z === z && L.px === panRef.current.x && L.py === panRef.current.y && L.w === w && L.h === h && L.hi === useHi) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      const { w: iw, h: ih } = srcRect ? { w: srcRect[2], h: srcRect[3] } : dims(img);
      const cw = w * dpr;
      const ch = h * dpr;
      const base = Math.max(cw / iw, ch / ih);
      const s = base * z;
      const dw = iw * s;
      const dh = ih * s;
      const maxX = Math.max(0, (dw - cw) / 2);
      const maxY = Math.max(0, (dh - ch) / 2);
      const px = Math.max(-maxX, Math.min(maxX, panRef.current.x * dpr));
      const py = Math.max(-maxY, Math.min(maxY, panRef.current.y * dpr));
      panRef.current = { x: px / dpr, y: py / dpr };
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#07090d";
      ctx.fillRect(0, 0, cw, ch);
      if (srcRect) ctx.drawImage(img, ...srcRect, (cw - dw) / 2 + px, (ch - dh) / 2 + py, dw, dh);
      else ctx.drawImage(img, (cw - dw) / 2 + px, (ch - dh) / 2 + py, dw, dh);
      // con sprite se vuelve a pintar cuando llegue la foto real
      lastDrawn.current = { i: srcRect ? -1 : i, z, px: panRef.current.x, py: panRef.current.y, w, h, hi: useHi };
      if (canvas.dataset) canvas.dataset.frame = String(i);
      const win = window as unknown as { __spin360Draws?: number };
      win.__spin360Draws = (win.__spin360Draws || 0) + 1;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total],
  );

  // ---------- Tamaño ----------
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      draw(true);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // ---------- Precarga completa ----------
  useEffect(() => {
    let cancelled = false;
    lowRef.current = new Array(total).fill(null);
    hiRef.current = new Map();
    posRef.current = start;
    let count = 0;
    let failed = 0;
    if (sprite) {
      void loadDrawable(sprite.src).then((d) => {
        if (cancelled || !d) return;
        spriteRef.current = { img: d, cols: sprite.cols, w: sprite.w, h: sprite.h };
        setFirstShown(true);
        draw(true);
      });
    }
    // frente, 90°, 180°, 270° primero; luego el resto en orden de distancia al frente
    const order: number[] = [];
    for (let k = 0; k < 4; k++) order.push((start + Math.round((k * total) / 4)) % total);
    for (let d = 1; d <= total; d++) {
      for (const j of [(start + d) % total, (start - d + total) % total]) if (!order.includes(j)) order.push(j);
    }
    let cursor = 0;
    const worker = async () => {
      while (!cancelled && cursor < order.length) {
        const i = order[cursor++]!;
        const d = await loadDrawable(frames[i]!);
        if (cancelled) return;
        lowRef.current[i] = d;
        if (!d) failed += 1;
        count += 1;
        setLoaded(count);
        if (i === start) {
          setFirstShown(true);
          draw(true);
        }
      }
    };
    void Promise.all(Array.from({ length: 6 }, worker)).then(() => {
      if (cancelled) return;
      if (failed > total * 0.1) {
        onFatal?.();
        return;
      }
      setReady(true);
      draw(true);
    });
    return () => {
      cancelled = true;
      const close = (d: unknown) => {
        if (d && typeof (d as ImageBitmap).close === "function") (d as ImageBitmap).close();
      };
      lowRef.current.forEach(close);
      hiRef.current.forEach(close);
      if (spriteRef.current) close(spriteRef.current.img);
      lowRef.current = [];
      hiRef.current = new Map();
      spriteRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames]);

  // ---------- Bucle de animación ----------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let uiFrame = -1;
    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const an = animRef.current;
      if (an) {
        if (an.t0 < 0) an.t0 = now;
        const k = Math.min(1, (now - an.t0) / 350);
        const e = 1 - Math.pow(1 - k, 3);
        posRef.current = an.from + (an.to - an.from) * e;
        if (k >= 1) animRef.current = null;
      } else if (ready && !dragRef.current && !pinchRef.current && !panDragRef.current) {
        if (Math.abs(velRef.current) > 0.00002) {
          posRef.current += velRef.current * dt;
          velRef.current *= Math.pow(FRICTION_PER_MS, dt);
        } else {
          velRef.current = 0;
          if (autoRef.current && zoomRef.current <= 1.01) {
            posRef.current += (total / (AUTO_SECONDS_PER_TURN * 1000)) * dt;
          }
        }
      }
      draw();
      const i = idx(posRef.current);
      if (i !== uiFrame) {
        uiFrame = i;
        const a = Math.round(((((i - start) % total) + total) % total) * (360 / total));
        if (angleRef.current) angleRef.current.textContent = `${String(a).padStart(3, "0")}°`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, draw, total]);

  // ---------- Alta resolución bajo demanda ----------
  useEffect(() => {
    if (!hiFrames?.length || !(zoomed || fullscreen)) return;
    const t = window.setInterval(() => {
      if (dragRef.current || Math.abs(velRef.current) > 0.0005) return;
      const i = idx(posRef.current);
      for (const j of [i, (i + 1) % total, (i - 1 + total) % total]) {
        if (hiRef.current.has(j) || !hiFrames[j]) continue;
        hiRef.current.set(j, "loading");
        void loadDrawable(hiFrames[j]!).then((d) => {
          if (d) hiRef.current.set(j, d);
          else hiRef.current.delete(j);
          // libera memoria: conserva solo las últimas HI_CACHE fotos en alta
          while (hiRef.current.size > HI_CACHE) {
            const [k0, v0] = hiRef.current.entries().next().value as [number, Drawable | "loading"];
            if (v0 !== "loading" && typeof (v0 as ImageBitmap).close === "function") (v0 as ImageBitmap).close();
            hiRef.current.delete(k0);
          }
          draw(true);
        });
      }
    }, 150);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiFrames, zoomed, fullscreen, total]);

  // ---------- Interacción ----------
  const stopAuto = useCallback(() => {
    autoRef.current = false;
    setAuto(false);
    setInteracted(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
  }, []);

  const setZoom = useCallback(
    (z: number) => {
      const nz = Math.max(1, Math.min(MAX_ZOOM, z));
      zoomRef.current = nz;
      if (nz <= 1.01) panRef.current = { x: 0, y: 0 };
      setZoomed(nz > 1.01);
      draw(true);
    },
    [draw],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!firstShown) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stopAuto();
    velRef.current = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), z: zoomRef.current };
      dragRef.current = null;
      panDragRef.current = null;
      return;
    }
    const now = performance.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      setZoom(zoomRef.current > 1.01 ? 1 : 2);
      return;
    }
    lastTapRef.current = now;
    if (zoomRef.current > 1.01) {
      panDragRef.current = { x: e.clientX, y: e.clientY, px: panRef.current.x, py: panRef.current.y };
    } else {
      dragRef.current = { x: e.clientX, pos: posRef.current, samples: [{ t: now, p: posRef.current }] };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      setZoom(pinchRef.current.z * (d / pinchRef.current.d));
      return;
    }
    if (panDragRef.current) {
      const p = panDragRef.current;
      panRef.current = { x: p.px + (e.clientX - p.x), y: p.py + (e.clientY - p.y) };
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const width = sizeRef.current.w || 600;
    const framesPerPx = total / (width * TURN_WIDTHS);
    posRef.current = d.pos - (e.clientX - d.x) * framesPerPx;
    const now = performance.now();
    d.samples.push({ t: now, p: posRef.current });
    while (d.samples.length > 2 && now - d.samples[0]!.t > 90) d.samples.shift();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    panDragRef.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.samples.length < 2) return;
    const a = d.samples[0]!;
    const b = d.samples[d.samples.length - 1]!;
    const dt = b.t - a.t;
    if (dt > 0 && performance.now() - b.t < 80) {
      const v = (b.p - a.p) / dt;
      const maxV = total / 900; // tope: una vuelta en ~0,9 s
      velRef.current = Math.max(-maxV, Math.min(maxV, v));
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    // Solo con Ctrl/⌘ o en pantalla completa: no secuestra el scroll de la página.
    if (!(e.ctrlKey || e.metaKey || document.fullscreenElement)) return;
    e.preventDefault();
    stopAuto();
    setZoom(zoomRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      stopAuto();
      velRef.current = 0;
      posRef.current = Math.round(posRef.current) + (e.key === "ArrowRight" ? 1 : -1);
    } else if (e.key === "+" || e.key === "=") setZoom(zoomRef.current * 1.25);
    else if (e.key === "-") setZoom(zoomRef.current / 1.25);
    else if (e.key === " ") {
      e.preventDefault();
      toggleAuto();
    }
  };

  const toggleAuto = () => {
    const next = !autoRef.current;
    autoRef.current = next;
    setAuto(next);
    if (next) setZoom(1);
  };

  const goTo = (target: number) => {
    stopAuto();
    let diff = target - (((posRef.current % total) + total) % total);
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    velRef.current = 0;
    animRef.current = { from: posRef.current, to: posRef.current + diff, t0: -1 };
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  };

  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement);
      draw(true);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [draw]);

  const pct = total ? Math.round((loaded / total) * 100) : 0;
  const presets = [
    { label: "Frente", at: start },
    { label: "90°", at: (start + Math.round(total / 4)) % total },
    { label: "Trasera", at: (start + Math.round(total / 2)) % total },
    { label: "270°", at: (start + Math.round((3 * total) / 4)) % total },
  ];

  const btn =
    "grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white/90 ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/75 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="application"
      aria-label="Vista 360° del vehículo. Arrastra o usa las flechas para girar."
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      className={`group relative select-none overflow-hidden rounded-3xl bg-[#07090d] outline-none ${className}`}
    >
      <canvas
        ref={canvasRef}
        data-testid="spin360-canvas"
        className={`absolute inset-0 h-full w-full touch-none ${zoomed ? "cursor-move" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Carga */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px]">
          <p className="text-xs font-semibold tracking-[0.2em] text-white/85">CARGANDO 360°</p>
          <div className="h-1 w-52 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-white transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
          </div>
          <p className="font-mono text-[11px] text-white/60">{pct}%</p>
        </div>
      )}

      {/* Controles superiores */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <button type="button" className={btn} onClick={toggleAuto} aria-label={auto ? "Pausar giro" : "Girar automáticamente"} title={auto ? "Pausar giro" : "Girar automáticamente"}>
          {auto ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
          )}
        </button>
        <button type="button" className={btn} onClick={() => { stopAuto(); setZoom(zoomed ? 1 : 2); }} aria-label={zoomed ? "Quitar zoom" : "Acercar"} title={zoomed ? "Quitar zoom" : "Acercar (doble toque)"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />{!zoomed && <path d="M11 8v6" />}<path d="M8 11h6" /></svg>
        </button>
        <button type="button" className={btn} onClick={toggleFullscreen} aria-label="Pantalla completa" title="Pantalla completa">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {fullscreen ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
      </div>

      {/* Insignia */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white/90 ring-1 ring-white/15 backdrop-blur-md">
        360° · <span ref={angleRef} className="font-mono">000°</span>
      </div>

      {/* Pista de arrastre */}
      {ready && !interacted && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center sm:bottom-16">
          <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur-md">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-[spinhint_1.6s_ease-in-out_infinite]">
              <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11.5v-2a1.5 1.5 0 0 1 3 0V12" /><path d="M14 10.5a1.5 1.5 0 0 1 3 0V12" /><path d="M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2c-2.2 0-3.6-.9-4.8-2.4L4.5 16a1.6 1.6 0 0 1 2.4-2l1.1 1.1" />
            </svg>
            Arrastra para girar
          </div>
          <style>{`@keyframes spinhint{0%,100%{transform:translateX(-5px)}50%{transform:translateX(5px)}}`}</style>
        </div>
      )}

      {/* Accesos rápidos */}
      {ready && (
        <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <div className="flex gap-1 rounded-full bg-black/55 p-1 ring-1 ring-white/15 backdrop-blur-md">
            {presets.map((p, k) => (
              <button
                key={k}
                type="button"
                onClick={() => goTo(p.at)}
                className="rounded-full px-3 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
