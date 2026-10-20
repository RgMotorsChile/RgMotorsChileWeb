"use client";

import { useEffect, useState, useRef } from "react";
import { vehicles } from "@/lib/vehicles";
import PhotoSpin360 from "@/components/PhotoSpin360";

type SpinInfo = {
  slug: string;
  count: number;
  studio?: boolean;
  aiUsed?: boolean;
  updatedAt?: string;
};

type Status = "idle" | "uploading" | "processing" | "done" | "error";

export default function SpinUploader() {
  const [vehiclesData, setVehiclesData] = useState<any[]>(vehicles);
  const [slug, setSlug] = useState(vehiclesData[0]?.slug ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [frames, setFrames] = useState(32);

  useEffect(() => {
    fetch("/api/vehicles?admin=true")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.vehicles) {
          setVehiclesData(data.vehicles);
          if (data.vehicles.length > 0) setSlug(data.vehicles[0].slug);
        }
      })
      .catch(console.error);
  }, []);
  const studio = false; // el fondo siempre es el patio real de RG Motors

  const [status, setStatus] = useState<Status>("idle");
  const [pct, setPct] = useState(0);
  const [stageMsg, setStageMsg] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ count: number; aiUsed: boolean } | null>(null);
  const [existing, setExisting] = useState<SpinInfo[]>([]);
  const dropRef = useRef<HTMLLabelElement>(null);

  async function loadExisting() {
    try {
      const r = await fetch("/api/spin");
      const j = await r.json();
      setExisting(j.spins ?? []);
    } catch {
      /* noop */
    }
  }
  useEffect(() => {
    loadExisting();
  }, []);

  async function handleUpload() {
    if (!file || !slug) return;
    setStatus("uploading");
    setPct(0);
    setError("");
    setResult(null);
    setStageMsg("Subiendo video…");

    const fd = new FormData();
    fd.append("video", file);
    fd.append("slug", slug);
    fd.append("frames", String(frames));
    fd.append("studio", String(studio));

    try {
      const res = await fetch("/api/spin", { method: "POST", body: fd });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Error al subir el video.");
      }
      setStatus("processing");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "progress") {
            setPct(evt.pct ?? 0);
            setStageMsg(evt.msg ?? "");
          } else if (evt.type === "done") {
            setPct(100);
            setStatus("done");
            setResult({ count: evt.count, aiUsed: evt.aiUsed });
            loadExisting();
          } else if (evt.type === "error") {
            throw new Error(evt.error);
          }
        }
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  const busy = status === "uploading" || status === "processing";
  const previewFrames = result
    ? Array.from(
        { length: result.count },
        (_, i) => `/cars/spin/${slug}/${String(i + 1).padStart(3, "0")}.jpg?v=${Date.now()}`
      )
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Formulario */}
      <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
        <h2 className="font-semibold">Generar giro 360° desde un video</h2>
        <p className="mt-1 text-sm text-white/50">
          Sube un video dando una vuelta completa al auto. El sistema extrae los
          fotogramas, mantiene el fondo real del patio y desenfoca la patente.
        </p>

        {/* Vehículo */}
        {/* Guía de grabación */}
        <details open className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
          <summary className="cursor-pointer font-semibold text-white">Cómo grabar el video 360° (leer antes)</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>Grabar siempre en el patio de RG Motors (Av. Cardonal). El fondo real del patio se mantiene.</li>
            <li>Auto limpio, luz pareja (día nublado o sombra completa); sin personas caminando detrás.</li>
            <li>Celular en horizontal, 4K o 1080p a 60 fps. Sin zoom.</li>
            <li>Altura de los focos y a unos 3 m del auto, siempre a la misma distancia.</li>
            <li>Una vuelta completa, lenta y pareja: 40–60 segundos, terminando donde empezaste.</li>
            <li>El auto entero dentro del cuadro en todo momento (no acercarse en los costados).</li>
          </ul>
        </details>

        <label className="mt-5 block text-sm font-medium text-white/70">Vehículo</label>
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          disabled={busy}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        >
          {vehiclesData.map((v) => (
            <option key={v.slug} value={v.slug}>
              {v.brand} {v.model} · {v.year}
            </option>
          ))}
        </select>

        {/* Dropzone */}
        <label
          ref={dropRef}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition ${
            file ? "border-brand-500/50 bg-brand-500/5" : "border-white/15 hover:border-white/30"
          }`}
        >
          <input
            type="file"
            accept="video/*"
            disabled={busy}
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-2xl">🎥</span>
          {file ? (
            <span className="text-sm text-white/80">{file.name}</span>
          ) : (
            <span className="text-sm text-white/50">
              Haz clic para elegir un video (MP4, MOV…)
            </span>
          )}
        </label>

        {/* Frames */}
        <div className="mt-4 flex items-center justify-between text-sm">
          <label className="font-medium text-white/70">Fotogramas: {frames}</label>
          <span className="text-white/40">más = más fluido</span>
        </div>
        <input
          type="range"
          min={24}
          max={40}
          step={2}
          value={frames}
          disabled={busy}
          onChange={(e) => setFrames(parseInt(e.target.value, 10))}
          className="mt-1 w-full accent-brand-500"
        />

        <button
          onClick={handleUpload}
          disabled={!file || busy}
          className="mt-5 w-full rounded-xl bg-brand-500 py-3 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Procesando…" : "Generar 360°"}
        </button>

        {/* Progreso */}
        {(busy || status === "done") && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-white/50">
              <span>{status === "done" ? "Completado" : stageMsg || "Procesando…"}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-brand-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {status === "processing" && studio && (
              <p className="mt-2 text-xs text-white/40">
                El recorte con IA puede tardar ~1–2 min la primera vez (descarga el modelo).
              </p>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {status === "done" && result && (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
            ✓ {result.count} fotogramas generados{result.aiUsed ? " con recorte de fondo IA" : ""}. Ya está activo en la ficha del auto.{" "}
            <a href={`/vehiculo/${slug}`} className="underline">Ver ficha →</a>
          </div>
        )}
      </div>

      {/* Vista previa + existentes */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
          <h2 className="mb-3 font-semibold">Vista previa</h2>
          {previewFrames.length > 0 ? (
            <div className="aspect-video overflow-hidden rounded-xl">
              <PhotoSpin360 frames={previewFrames} className="h-full w-full" />
            </div>
          ) : (
            <div className="grid aspect-video place-items-center rounded-xl border border-white/10 bg-ink-900 text-sm text-white/40">
              El resultado aparecerá aquí
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
          <h2 className="mb-3 font-semibold">360° ya publicados</h2>
          {existing.length === 0 ? (
            <p className="text-sm text-white/40">Aún no hay giros generados.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {existing.map((s) => (
                <li
                  key={s.slug}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2"
                >
                  <span className="text-white/80">{s.slug}</span>
                  <span className="flex items-center gap-2 text-white/40">
                    {s.count} fotos
                    {s.aiUsed && (
                      <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-300">IA</span>
                    )}
                    <a href={`/vehiculo/${s.slug}`} className="text-brand-300 hover:underline">ver</a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
