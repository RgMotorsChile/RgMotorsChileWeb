"use client";

import { useState, useRef } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const LIVE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1BG2uR6APbXEMvVvRmdR-Nn0Vko6eobJ6Xam0XX41Ldc/edit";

export default function DriveSyncModal({ isOpen, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [syncStats, setSyncStats] = useState<{
    totalActive?: number;
    newVehicles?: number;
    soldVehicles?: number;
    updatedVehicles?: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleLiveSheetSync = async () => {
    setLoading(true);
    setMessage("Conectando a Google Sheets en vivo, procesando inventario y analítica de ventas...");
    setError(null);
    setSyncStats(null);

    try {
      const res = await fetch("/api/sync-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Error al sincronizar con Google Sheets.");
      }

      setMessage(data.message || "¡Sincronización con Google Sheets completada!");
      setSyncStats({
        totalActive: data.totalActive,
        newVehicles: data.newVehicles,
        soldVehicles: data.soldVehicles,
        updatedVehicles: data.updatedVehicles,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conectar con Google Sheets.");
    } finally {
      setLoading(false);
    }
  };

  const handleDriveSync = async () => {
    setLoading(true);
    setMessage("Analizando carpetas de Google Drive y sincronizando fotos...");
    setError(null);
    setSyncStats(null);

    try {
      const res = await fetch("/api/sync-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error durante la sincronización.");

      setMessage(data.message || "¡Sincronización de fotos completada!");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conectar con Google Drive.");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setLoading(true);
    setMessage("Procesando archivo Excel local y actualizando catálogo...");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/sync-drive", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al procesar el Excel.");

      setMessage(data.message || "¡Excel importado correctamente!");
      setSelectedFile(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar el archivo Excel.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-3xl border border-white/15 bg-ink-900 p-6 shadow-2xl space-y-5 text-white my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🔄</span> Sincronizador Google Sheets & Drive
            </h3>
            <p className="text-xs text-white/50">
              Inventario en vivo, fotos automáticas y archivo para Ciencia de Datos
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Status Alerts */}
        {message && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
            <p className="font-semibold">{message}</p>
            {syncStats && (
              <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-emerald-200">
                <span>🚗 Activos en Catálogo: <b>{syncStats.totalActive}</b></span>
                <span>✨ Nuevos Ingresos: <b>{syncStats.newVehicles}</b></span>
                <span>📉 Vendidos Archivados (Data Science): <b>{syncStats.soldVehicles}</b></span>
                <span>📝 Actualizados: <b>{syncStats.updatedVehicles}</b></span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <p className="font-semibold leading-relaxed">{error}</p>
            </div>
            {error.includes("Restringido") && (
              <div className="mt-2 rounded-xl bg-black/30 p-2.5 text-[11px] text-white/80 space-y-1">
                <p className="font-bold text-amber-300">👉 Pasos para activar la lectura automática diaria:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-white/70">
                  <li>Abre la planilla en Google Sheets.</li>
                  <li>Haz clic en el botón azul <b>Compartir</b> (arriba a la derecha).</li>
                  <li>En <b>Acceso general</b>, cambia de &quot;Restringido&quot; a <b>&quot;Cualquier persona que tenga el vínculo&quot;</b> en modo <b>Lector</b>.</li>
                  <li>Vuelve aquí y presiona <b>Sincronizar Google Sheets Ahora</b>.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Section 1: Google Sheets Live Link (PRIMARY) */}
        <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌐</span>
              <div>
                <p className="text-xs font-bold text-white">Google Sheets en Vivo (Planilla Oficial)</p>
                <a
                  href={LIVE_SHEET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-brand-300 underline hover:text-brand-200"
                >
                  Abrir planilla en Google Sheets ↗
                </a>
              </div>
            </div>
            <span className="rounded-full bg-brand-400/20 border border-brand-400/30 px-2.5 py-0.5 text-[10px] font-bold text-brand-300">
              ⚡ Sincronización Diaria
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-[11px] text-white/70 space-y-1">
            <p>
              • <b>Nuevos autos:</b> Se añaden al catálogo con sus datos y buscan fotos en Drive.
            </p>
            <p>
              • <b>Autos vendidos:</b> Se desactivan del catálogo, se borran sus fotos para optimizar espacio y se archiva su historial para <b>Ciencia de Datos</b>.
            </p>
          </div>

          <button
            onClick={handleLiveSheetSync}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white shadow-glow transition hover:bg-brand-400 disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="animate-spin text-sm">⚙</span> Sincronizando con Google Sheets…
              </>
            ) : (
              <>
                <span>🔄</span> Sincronizar Google Sheets Ahora
              </>
            )}
          </button>
        </div>

        {/* Section 2: Google Drive Photo Sync */}
        <div className="rounded-2xl border border-white/10 bg-ink-950 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📁</span>
              <div>
                <p className="text-xs font-bold text-white">Carpeta Google Drive de Fotos</p>
                <p className="text-[11px] text-white/40">FOTOS RG MOTORS (Solo Lectura)</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
              🟢 Conectado
            </span>
          </div>

          <button
            onClick={handleDriveSync}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? "Sincronizando fotos..." : "📸 Buscar Fotos Nuevas en Google Drive"}
          </button>
        </div>

        {/* Section 3: Manual Excel Fallback */}
        <div className="rounded-2xl border border-white/10 bg-ink-950 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📁</span>
            <div>
              <p className="text-xs font-bold text-white">Subir Archivo Excel Local (Opcional)</p>
              <p className="text-[11px] text-white/40">Por si prefieres subir manualmente un archivo .xlsx desde tu computador</p>
            </div>
          </div>

          <form onSubmit={handleUploadExcel} className="space-y-2 pt-1">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-xl border border-dashed border-white/20 bg-ink-900/50 p-3 text-center transition hover:border-brand-400/50"
            >
              {selectedFile ? (
                <p className="text-xs font-bold text-brand-300">📄 {selectedFile.name}</p>
              ) : (
                <p className="text-xs text-white/60">
                  Seleccionar archivo local <span className="text-brand-300 font-semibold">(.xlsx, .csv)</span>
                </p>
              )}
            </div>

            {selectedFile && (
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
              >
                Importar Archivo Local
              </button>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
