"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  frames: string[];
  /** Mismas fotos en alta resolución: se cargan bajo demanda en pantalla completa o zoom. */
  hiFrames?: string[];
  /** Índice de la foto que muestra el frente; ajusta los accesos rápidos y la foto inicial. */
  frontIndex?: number;
  /** Sensibilidad en px por frame */
  dragSensitivity?: number;
  className?: string;
  autoPlay?: boolean;
};

const VIEW_PRESETS = [
  { label: "Frente", pct: 0.5, icon: "🚘" },
  { label: "Costado Der.", pct: 0.75, icon: "➡️" },
  { label: "Trasera", pct: 0.0, icon: "🔄" },
  { label: "Costado Izq.", pct: 0.25, icon: "⬅️" },
];

export default function PhotoSpin360({
  frames,
  hiFrames,
  frontIndex,
  dragSensitivity,
  className = "",
  autoPlay = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgsRef = useRef<(HTMLImageElement | null)[]>([]);
  const indexRef = useRef(0);
  const dragAccRef = useRef(0);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const total = frames.length;
  const hiImgsRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const hiModeRef = useRef(false);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);
  const toggleZoomRef = useRef<(() => void) | null>(null);
  const hasFront = typeof frontIndex === "number" && frontIndex >= 0 && frontIndex < total;
  const startIndex = hasFront ? frontIndex : 0;
  const presets = hasFront
    ? [
        { label: "Frente", pct: (startIndex / total) % 1, icon: "🚘" },
        { label: "Costado", pct: ((startIndex + total / 4) / total) % 1, icon: "↪️" },
        { label: "Trasera", pct: ((startIndex + total / 2) / total) % 1, icon: "🔄" },
        { label: "Costado", pct: ((startIndex + (3 * total) / 4) / total) % 1, icon: "↩️" },
      ]
    : VIEW_PRESETS;

  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(autoPlay);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const velocityRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const autoRotateTimerRef = useRef<number | null>(null);

  // Dibuja la foto 100% original y orgánica sin fondos negros artificiales ni cortes
  const draw = useCallback(
    (i: number, zoom = isZoomed, pan = zoomPan) => {
      const canvas = canvasRef.current;
      const hi = hiModeRef.current ? hiImgsRef.current.get(i) : undefined;
      const img = hi && hi.complete && hi.naturalWidth ? hi : imgsRef.current[i];
      if (!canvas || !img || !img.complete || !img.naturalWidth) return;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const { w, h, dpr } = sizeRef.current;
      if (w < 2 || h < 2) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Usamos cover/contain orgánico para que la foto real llene el visor perfectamente
      const baseScale = Math.max(
        (w * dpr) / img.naturalWidth,
        (h * dpr) / img.naturalHeight
      );
      const zoomMultiplier = zoom ? 1.6 : 1.0;
      const scale = baseScale * zoomMultiplier;

      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;

      let dx = (w * dpr - dw) / 2;
      let dy = (h * dpr - dh) / 2;

      if (zoom) {
        dx += pan.x * dpr;
        dy += pan.y * dpr;
      }

      ctx.drawImage(img, dx, dy, dw, dh);
    },
    [isZoomed, zoomPan]
  );

  const setFrame = useCallback(
    (i: number) => {
      let n = i % total;
      if (n < 0) n += total;
      indexRef.current = n;
      setIndex(n);
      draw(n);
    },
    [total, draw]
  );

  // Resize canvas
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      draw(indexRef.current);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // Preload progresivo: primero frame activo + vecinos, luego el resto en cola
  useEffect(() => {
    let cancelled = false;
    imgsRef.current = new Array(total).fill(null);
    setReady(false);
    setLoaded(0);
    setShowHint(true);
    const start = startIndex;
    indexRef.current = start;
    setIndex(start);

    if (total === 0) {
      setReady(true);
      return;
    }

    let loadedCount = 0;
    const markLoaded = (i: number, img: HTMLImageElement | null) => {
      if (cancelled) return;
      if (img) imgsRef.current[i] = img;
      loadedCount += 1;
      setLoaded(loadedCount);
      if (i === start && img) {
        setReady(true);
        draw(start);
      } else if (loadedCount === total) {
        setReady(true);
        draw(indexRef.current);
      }
    };

    const loadOne = (i: number) =>
      new Promise<void>((resolve) => {
        if (cancelled || !frames[i]) {
          markLoaded(i, null);
          resolve();
          return;
        }
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          markLoaded(i, img);
          resolve();
        };
        img.onerror = () => {
          markLoaded(i, null);
          resolve();
        };
        img.src = frames[i]!;
      });

    const order: number[] = [];
    const seen = new Set<number>();
    const push = (i: number) => {
      const idx = ((i % total) + total) % total;
      if (!seen.has(idx)) {
        seen.add(idx);
        order.push(idx);
      }
    };
    // Ventana inicial alrededor del frame de inicio
    push(start);
    for (let d = 1; d <= 4; d++) {
      push(start + d);
      push(start - d);
    }
    for (let i = 0; i < total; i++) push(i);

    void (async () => {
      const CONCURRENCY = 4;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, order.length) }, async () => {
        while (!cancelled && cursor < order.length) {
          const i = order[cursor++]!;
          await loadOne(i);
        }
      });
      await Promise.all(workers);
    })();

    return () => {
      cancelled = true;
    };
  }, [frames, total, draw, startIndex]);

  // Alta resolución bajo demanda: solo la foto visible (y vecinas) en pantalla completa o zoom.
  useEffect(() => {
    hiImgsRef.current = new Map();
  }, [hiFrames]);
  useEffect(() => {
    const want = !!hiFrames?.length && (isFullscreen || isZoomed);
    hiModeRef.current = want;
    if (!want || dragging || isAutoRotating) {
      draw(indexRef.current);
      return;
    }
    const t = window.setTimeout(() => {
      for (const d of [0, 1, -1]) {
        const i = (((index + d) % total) + total) % total;
        const src = hiFrames?.[i];
        if (!src || hiImgsRef.current.has(i)) continue;
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (indexRef.current === i) draw(i);
        };
        img.src = src;
        hiImgsRef.current.set(i, img);
      }
      draw(indexRef.current);
    }, 120);
    return () => window.clearTimeout(t);
  }, [hiFrames, isFullscreen, isZoomed, dragging, isAutoRotating, index, total, draw]);

  // Hint de arrastre desaparece a los 4s
  useEffect(() => {
    if (!ready || !showHint) return;
    const t = window.setTimeout(() => setShowHint(false), 4000);
    return () => window.clearTimeout(t);
  }, [ready, showHint]);

  // Detener inercia
  const stopInertia = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Animación de rotación automática fluida
  useEffect(() => {
    if (!ready || !isAutoRotating || dragging) {
      if (autoRotateTimerRef.current !== null) {
        clearInterval(autoRotateTimerRef.current);
        autoRotateTimerRef.current = null;
      }
      return;
    }

    const interval = total > 50 ? 45 : 75; // paso fluido adaptado a la cantidad de frames
    autoRotateTimerRef.current = window.setInterval(() => {
      setFrame(indexRef.current + 1);
    }, interval);

    return () => {
      if (autoRotateTimerRef.current !== null) {
        clearInterval(autoRotateTimerRef.current);
        autoRotateTimerRef.current = null;
      }
    };
  }, [ready, isAutoRotating, dragging, setFrame, total]);

  // Transición suave hacia un ángulo específico
  const animateToRatio = useCallback(
    (ratio: number) => {
      setIsAutoRotating(false);
      stopInertia();
      const targetIndex = Math.round(ratio * (total - 1)) % total;
      let diff = targetIndex - indexRef.current;
      if (diff > total / 2) diff -= total;
      if (diff < -total / 2) diff += total;

      const steps = Math.abs(diff);
      if (steps === 0) return;

      const stepSign = Math.sign(diff);
      let stepCount = 0;

      const stepAnim = () => {
        if (stepCount < steps) {
          const stepSize = Math.max(1, Math.round(total / 60));
          stepCount += stepSize;
          setFrame(indexRef.current + stepSign * stepSize);
          animFrameRef.current = requestAnimationFrame(stepAnim);
        }
      };
      animFrameRef.current = requestAnimationFrame(stepAnim);
    },
    [total, stopInertia, setFrame]
  );

  // Manejo de puntero (Mouse / Touch)
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        pinchStartRef.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        draggingRef.current = false;
        return;
      }
      const now = performance.now();
      if (e.pointerType === "touch" && now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        toggleZoomRef.current?.();
        return;
      }
      lastTapRef.current = now;
      stopInertia();
      setIsAutoRotating(false);
      setShowHint(false);
      draggingRef.current = true;
      setDragging(true);
      dragAccRef.current = 0;
      lastXRef.current = e.clientX;
      lastYRef.current = e.clientY;
      lastTimeRef.current = performance.now();
      velocityRef.current = 0;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [stopInertia]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pointersRef.current.size === 2 && pinchStartRef.current) {
        const [a, b] = [...pointersRef.current.values()];
        const ratio = Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinchStartRef.current;
        if ((ratio > 1.15 && !isZoomed) || (ratio < 0.87 && isZoomed)) {
          pinchStartRef.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          toggleZoomRef.current?.();
        }
        return;
      }
      if (!draggingRef.current) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastTimeRef.current);
      const dx = e.clientX - lastXRef.current;
      const dy = e.clientY - lastYRef.current;
      lastXRef.current = e.clientX;
      lastYRef.current = e.clientY;
      lastTimeRef.current = now;

      if (isZoomed) {
        setZoomPan((p) => {
          const nextPan = {
            x: Math.max(-200, Math.min(200, p.x + dx)),
            y: Math.max(-120, Math.min(120, p.y + dy)),
          };
          draw(indexRef.current, true, nextPan);
          return nextPan;
        });
        return;
      }

      const instantVelocity = dx / dt;
      velocityRef.current = velocityRef.current * 0.4 + instantVelocity * 0.6;

      // Sensibilidad adaptada al número de frames
      const sens = Math.max(
        3,
        dragSensitivity ??
          Math.max(3, Math.round((sizeRef.current.w || 640) / Math.max(1, total * 0.8)))
      );

      dragAccRef.current += dx;
      while (Math.abs(dragAccRef.current) >= sens) {
        if (dragAccRef.current > 0) {
          setFrame(indexRef.current - 1);
          dragAccRef.current -= sens;
        } else {
          setFrame(indexRef.current + 1);
          dragAccRef.current += sens;
        }
      }
    },
    [dragSensitivity, setFrame, total, isZoomed, draw]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchStartRef.current = null;
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }

      if (isZoomed) return;

      let v = velocityRef.current * (total > 50 ? 24 : 14);
      const sens = Math.max(
        3,
        dragSensitivity ??
          Math.max(3, Math.round((sizeRef.current.w || 640) / Math.max(1, total * 0.8)))
      );

      if (Math.abs(v) > 0.5) {
        let acc = dragAccRef.current;
        const stepInertia = () => {
          if (Math.abs(v) < 0.1 || draggingRef.current) {
            stopInertia();
            return;
          }
          acc += v;
          v *= 0.93; // Fricción suave

          while (Math.abs(acc) >= sens) {
            if (acc > 0) {
              setFrame(indexRef.current - 1);
              acc -= sens;
            } else {
              setFrame(indexRef.current + 1);
              acc += sens;
            }
          }
          animFrameRef.current = requestAnimationFrame(stepInertia);
        };
        animFrameRef.current = requestAnimationFrame(stepInertia);
      }
    },
    [dragSensitivity, setFrame, stopInertia, total, isZoomed]
  );

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  const toggleZoom = useCallback(() => {
    setIsZoomed((z) => {
      const next = !z;
      if (!next) setZoomPan({ x: 0, y: 0 });
      draw(indexRef.current, next, { x: 0, y: 0 });
      return next;
    });
  }, [draw]);
  useEffect(() => {
    toggleZoomRef.current = toggleZoom;
  }, [toggleZoom]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        stopInertia();
        setIsAutoRotating(false);
        setShowHint(false);
        setFrame(indexRef.current + (e.key === "ArrowRight" ? 1 : -1));
      } else if (e.key === "+" || e.key === "-") {
        if ((e.key === "+") !== isZoomed) toggleZoom();
      }
    },
    [setFrame, stopInertia, isZoomed, toggleZoom]
  );

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const pct = total ? Math.round((loaded / total) * 100) : 0;
  const angle = total ? Math.round(((((index - startIndex) % total) + total) % total / total) * 360) : 0;

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="img"
      aria-label="Vista 360° del vehículo: arrastra o usa las flechas para girar"
      onKeyDown={onKeyDown}
      className={`relative select-none overflow-hidden rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-brand-400 border border-white/15 bg-black shadow-2xl no-select group ${className}`}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full touch-none ${
          dragging ? "cursor-grabbing" : isZoomed ? "cursor-move" : "cursor-grab"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      {/* Loading Spinner */}
      {!ready && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-md">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500/20 border-t-brand-400" />
          <p className="text-xs font-semibold text-white/80 tracking-wide">Cargando Tour 360° Real… {pct}%</p>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-300 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-center justify-between">
        {/* Left Badge */}
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-3.5 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-md shadow-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span>Tour 360° Real</span>
        </div>

        {/* Right Tools */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Auto-Rotate Button */}
          <button
            onClick={() => setIsAutoRotating((r) => !r)}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold backdrop-blur-md transition ${
              isAutoRotating
                ? "border-brand-400 bg-brand-500 text-white shadow-glow"
                : "border-white/15 bg-black/70 text-white/90 hover:bg-white/20 hover:text-white"
            }`}
            title="Giro automático 360°"
          >
            <span>{isAutoRotating ? "⏸" : "▶"}</span>
            <span className="hidden sm:inline">{isAutoRotating ? "Pausar" : "Auto-Giro"}</span>
          </button>

          {/* Zoom HD Button */}
          <button
            onClick={toggleZoom}
            className={`grid h-8 w-8 place-items-center rounded-full border text-xs backdrop-blur-md transition ${
              isZoomed
                ? "border-brand-400 bg-brand-500 text-white shadow-glow"
                : "border-white/15 bg-black/70 text-white/90 hover:bg-white/20 hover:text-white"
            }`}
            title={isZoomed ? "Restablecer vista normal" : "Zoom HD para inspeccionar detalles"}
          >
            {isZoomed ? "🔍-" : "🔍+"}
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            aria-label="Pantalla completa"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/70 text-xs text-white/90 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
            title="Pantalla completa"
          >
            {isFullscreen ? "⤡" : "⤢"}
          </button>
        </div>
      </div>

      {/* Preset View Angles (Quick-Jump Chips) */}
      {ready && !isZoomed && (
        <div className="pointer-events-auto absolute top-14 left-4 z-10 hidden sm:flex flex-wrap gap-1.5">
          {presets.map((vp, i) => (
            <button
              key={`${vp.label}-${i}`}
              onClick={() => animateToRatio(vp.pct)}
              className="flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur-md transition hover:border-brand-400/50 hover:bg-brand-500/20 hover:text-white"
            >
              <span>{vp.icon}</span>
              <span>{vp.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Interaction Drag Hint */}
      {ready && showHint && !isAutoRotating && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/20 bg-black/75 px-6 py-4 backdrop-blur-xl shadow-2xl animate-fade-up">
            <div className="relative flex h-8 w-32 items-center justify-center">
              <div className="absolute h-[2px] w-24 rounded-full bg-gradient-to-r from-transparent via-brand-300 to-transparent" />
              <span className="absolute left-0 text-xs text-white/60">‹</span>
              <span className="absolute right-0 text-xs text-white/60">›</span>
              <div className="relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border border-brand-400/50 bg-brand-500/40 text-white shadow-glow">
                🔄
              </div>
            </div>
            <p className="text-xs font-semibold tracking-wide text-white">
              Arrastra horizontalmente para girar 360°
            </p>
          </div>
        </div>
      )}

      {/* Bottom Angle & Scrubber Bar */}
      {ready && (
        <div className="absolute bottom-4 left-1/2 z-10 flex w-[min(90%,360px)] -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-black/80 px-4 py-2.5 backdrop-blur-xl shadow-2xl">
          <span className="text-[11px] font-mono font-bold text-brand-300 w-10 text-right">
            {String(angle).padStart(3, "0")}°
          </span>

          <div
            className="relative h-1.5 flex-1 rounded-full bg-white/20 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, clickX / rect.width));
              setFrame(Math.round(ratio * (total - 1)));
            }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
              style={{ width: `${(index / Math.max(1, total - 1)) * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-400 shadow-glow transition-transform hover:scale-125"
              style={{ left: `${(index / Math.max(1, total - 1)) * 100}%` }}
            />
          </div>

          <span className="text-[11px] font-mono text-white/60 w-14 text-left">
            {index + 1}/{total}
          </span>
        </div>
      )}
    </div>
  );
}
