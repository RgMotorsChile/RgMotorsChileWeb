"use client";

import { useEffect, useRef } from "react";

type Props = {
  frames: string[];
  /** Mismas fotos en alta resolución: se usan en pantallas anchas (escritorio). */
  hiFrames?: string[];
  /** Índice de la foto inicial (normalmente el frente o 3/4 frontal). */
  frontIndex?: number;
  /** Px de arrastre por cuadro. Por defecto se ajusta al ancho del visor. */
  dragSensitivity?: number;
  className?: string;
  /** Vuelta automática lenta al cargar; se detiene al primer toque. */
  autoPlay?: boolean;
};

/** Ancho (px CSS × dpr) desde el que se usan las fotos de alta resolución. */
const HI_MIN_PX = 1000;
/** Duración de una vuelta automática completa. */
const AUTO_LAP_MS = 14000;
const FRICTION = 0.94;

/**
 * Visor 360° mínimo: sin botones ni overlays. Arrastre con inercia
 * (requestAnimationFrame), vuelta automática lenta que se detiene al tocar
 * y carga progresiva (1 de cada 4 cuadros, luego 1 de cada 2, luego el resto).
 */
export default function PhotoSpin360({
  frames,
  hiFrames,
  frontIndex,
  dragSensitivity,
  className = "",
  autoPlay = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const total = frames.length;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || total === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const useHi = !!hiFrames && hiFrames.length === total && wrap.clientWidth * dpr >= HI_MIN_PX;
    const src = useHi ? hiFrames! : frames;
    const imgs: (HTMLImageElement | null)[] = new Array(total).fill(null);
    const ready: boolean[] = new Array(total).fill(false);
    let loaded = 0;
    let cancelled = false;

    const start = typeof frontIndex === "number" && frontIndex >= 0 && frontIndex < total ? frontIndex : 0;
    let pos = start;
    let vel = 0;
    let auto = autoPlay;
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let shown = -1;
    let dirty = true;
    let raf = 0;
    let prevT = 0;

    const resize = () => {
      canvas.width = Math.round(wrap.clientWidth * dpr);
      canvas.height = Math.round(wrap.clientHeight * dpr);
      dirty = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const nearestReady = (i: number) => {
      for (let d = 0; d < total; d++) {
        const a = (i + d) % total;
        if (ready[a]) return imgs[a];
        const b = (i - d + total) % total;
        if (ready[b]) return imgs[b];
      }
      return null;
    };

    const draw = (img: HTMLImageElement) => {
      const cw = canvas.width;
      const ch = canvas.height;
      const s = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    };

    const pxPerFrame = () => dragSensitivity ?? Math.max(2, (wrap.clientWidth / total) * 1.6);

    const tick = (t: number) => {
      const dt = prevT ? Math.min(64, t - prevT) : 16;
      prevT = t;
      if (!dragging) {
        if (auto) pos += (total / AUTO_LAP_MS) * dt;
        else if (vel !== 0) {
          pos += vel * (dt / 16);
          vel *= Math.pow(FRICTION, dt / 16);
          if (Math.abs(vel) < 0.002) vel = 0;
        }
      }
      const i = ((Math.round(pos) % total) + total) % total;
      if (i !== shown || dirty) {
        const img = nearestReady(i);
        if (img) {
          draw(img);
          shown = i;
          dirty = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const stopAuto = () => {
      auto = false;
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      stopAuto();
      vel = 0;
      lastX = e.clientX;
      lastT = performance.now();
      wrap.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const df = -(e.clientX - lastX) / pxPerFrame();
      pos += df;
      vel = (df / Math.max(1, now - lastT)) * 16;
      lastX = e.clientX;
      lastT = now;
    };
    const onUp = () => {
      dragging = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { stopAuto(); vel = 0; pos -= 1; }
      if (e.key === "ArrowRight") { stopAuto(); vel = 0; pos += 1; }
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);
    wrap.addEventListener("keydown", onKey);

    const load = (i: number) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (!cancelled) {
            ready[i] = true;
            loaded++;
            if (barRef.current) barRef.current.style.width = `${(loaded / total) * 100}%`;
            dirty = dirty || shown === -1;
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src[i];
        imgs[i] = img;
      });

    // Orden progresivo: desde la foto inicial, 1 de cada 4, luego 1 de cada 2, luego el resto.
    const order: number[] = [];
    const seen = new Set<number>();
    for (const step of [4, 2, 1]) {
      for (let k = 0; k < total; k += step) {
        const i = (start + k) % total;
        if (!seen.has(i)) { seen.add(i); order.push(i); }
      }
    }
    (async () => {
      const first = Math.ceil(total / 4);
      await Promise.all(order.slice(0, first).map(load));
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      for (let k = first; k < order.length && !cancelled; k += 8) {
        await Promise.all(order.slice(k, k + 8).map(load));
      }
      if (barRef.current) barRef.current.style.opacity = "0";
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      wrap.removeEventListener("keydown", onKey);
    };
  }, [frames, hiFrames, frontIndex, dragSensitivity, autoPlay, total]);

  if (total === 0) return null;
  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="img"
      aria-label="Vista 360° del vehículo: arrastra para girar"
      className={`relative select-none overflow-hidden ${className}`}
      style={{ touchAction: "pan-y", cursor: "grab" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div
        ref={barRef}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-red-600 transition-[width,opacity] duration-300"
        style={{ width: 0 }}
      />
    </div>
  );
}
