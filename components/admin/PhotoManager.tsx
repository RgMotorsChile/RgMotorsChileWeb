"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { vehicles, Vehicle, spinFramesOf, spinHiFramesOf } from "@/lib/vehicles";
import { asset } from "@/lib/asset";
import PhotoSpin360 from "@/components/PhotoSpin360";
import SpinUploader from "@/components/admin/SpinUploader";
import {
  uploadPhotosSequentially,
  readApiError,
  convertImageToWebp,
  formatBytes,
} from "@/lib/client/uploadPhotos";
import { sortFramesByNumber, uploadSpinSets } from "@/lib/client/uploadSpin";
import { mediaUrlsEqual, normalizeMediaUrl } from "@/lib/vehicles/frontCoverMap";

type PhotoItem = {
  name: string;
  url: string;
  size: number;
  isCover?: boolean;
};

type StagedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  ready: boolean;
  error?: string;
};

type SubTab = "gallery" | "spin" | "video" | "guide";

function revokeAll(items: StagedPhoto[]) {
  for (const s of items) {
    try {
      URL.revokeObjectURL(s.previewUrl);
    } catch {
      /* noop */
    }
  }
}

export default function PhotoManager({ initialSlug }: { initialSlug?: string }) {
  const [vehiclesData, setVehiclesData] = useState<Vehicle[]>(vehicles);
  const [selectedSlug, setSelectedSlug] = useState<string>(initialSlug || vehiclesData[0]?.slug || "");
  const [activeTab, setActiveTab] = useState<SubTab>("gallery");
  const [searchCar, setSearchCar] = useState("");

  useEffect(() => {
    fetch("/api/vehicles?admin=true")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.vehicles) {
          setVehiclesData(data.vehicles);
          if (!initialSlug && data.vehicles.length > 0) {
            setSelectedSlug(data.vehicles[0].slug);
          }
        }
      })
      .catch(console.error);
  }, [initialSlug]);

  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [gallery, setGallery] = useState<PhotoItem[]>([]);
  const [spinCount, setSpinCount] = useState<number>(0);
  const [coverImage, setCoverImage] = useState<string>("");
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const spinInputRef = useRef<HTMLInputElement>(null);
  const hdInputRef = useRef<HTMLInputElement>(null);
  const galleryPanelRef = useRef<HTMLDivElement>(null);
  const [spinStandard, setSpinStandard] = useState<File[]>([]);
  const [spinHd, setSpinHd] = useState<File[]>([]);

  const selectedVehicle = vehiclesData.find((v) => v.slug === selectedSlug) || vehiclesData[0] || {
    slug: "",
    plate: "SIN PLACA",
    brand: "Vehículo",
    model: "",
    version: "",
    year: 2024,
    image: "/images/placeholder-pending-car.svg",
  };

  const clearStaged = useCallback(() => {
    setStaged((prev) => {
      revokeAll(prev);
      return [];
    });
  }, []);

  const fetchPhotos = useCallback(async (slug: string) => {
    if (!slug) return;
    setIsLoadingPhotos(true);
    try {
      const res = await fetch(
        `/api/photos?slug=${encodeURIComponent(slug)}&_=${Date.now()}`,
        { cache: "no-store", headers: { Pragma: "no-cache" } },
      );
      if (!res.ok) {
        setUploadError(await readApiError(res));
        setGallery([]);
        return;
      }
      const data = await res.json();
      const items: PhotoItem[] = Array.isArray(data.gallery) ? data.gallery : [];
      setGallery(items);
      setSpinCount(data.spinCount || 0);
      setCoverImage(data.coverImage || items[0]?.url || "");
      if (items.length > 0) {
        setUploadError(null);
      }
    } catch {
      setUploadError("No se pudieron cargar las fotos de esta unidad.");
    } finally {
      setIsLoadingPhotos(false);
    }
  }, []);

  const refreshVehicleMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/vehicles?admin=true", { cache: "no-store" });
      const data = await res.json();
      if (data?.vehicles) setVehiclesData(data.vehicles);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (selectedSlug) {
      fetchPhotos(selectedSlug);
      clearStaged();
      setUploadSuccess(null);
      setUploadError(null);
      setUploadProgress(null);
    }
  }, [selectedSlug, fetchPhotos, clearStaged]);

  useEffect(() => {
    return () => revokeAll(staged);
    // solo al desmontar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilesChosen = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const valid = Array.from(files).filter(
      (f) =>
        /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(f.name) || /^image\//i.test(f.type),
    );
    if (valid.length === 0) {
      setUploadError("Por favor selecciona imágenes válidas (JPG, PNG, WebP o HEIC).");
      return;
    }

    setUploadError(null);
    setUploadSuccess(null);
    setIsPreparing(true);

    // Miniaturas al instante (antes de optimizar)
    const draft: StagedPhoto[] = valid.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      ready: false,
    }));
    setStaged((prev) => [...prev, ...draft]);
    setUploadProgress(`Preparando miniaturas 0/${draft.length}…`);

    for (let i = 0; i < draft.length; i++) {
      const item = draft[i]!;
      setUploadProgress(`Preparando ${i + 1}/${draft.length}: ${item.file.name}`);
      try {
        const prepared = await convertImageToWebp(item.file);
        const newPreview = URL.createObjectURL(prepared);
        setStaged((prev) =>
          prev.map((s) => {
            if (s.id !== item.id) return s;
            try {
              URL.revokeObjectURL(s.previewUrl);
            } catch {
              /* noop */
            }
            return { ...s, file: prepared, previewUrl: newPreview, ready: true };
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "No se pudo preparar";
        setStaged((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, ready: false, error: msg } : s)),
        );
      }
    }

    setUploadProgress(null);
    setIsPreparing(false);
  };

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          /* noop */
        }
      }
      return prev.filter((s) => s.id !== id);
    });
  };

  const moveStaged = (index: number, direction: -1 | 1) => {
    setStaged((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  };

  const handleUploadGallery = async () => {
    const ready = staged.filter((s) => s.ready && !s.error);
    if (ready.length === 0 || !selectedSlug) {
      setUploadError("No hay fotos listas para publicar. Espera a que terminen de prepararse.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(`Subiendo 0/${ready.length}…`);

    try {
      // Primera = portada siempre
      const result = await uploadPhotosSequentially({
        slug: selectedSlug,
        type: "cover",
        files: ready.map((s) => s.file),
        onProgress: (p) => {
          setUploadProgress(
            p.done >= p.total
              ? `Listo ${p.total}/${p.total}`
              : `Subiendo ${p.done + 1}/${p.total}: ${p.currentName}`,
          );
        },
      });
      setUploadSuccess(result.message);
      clearStaged();
      await fetchPhotos(selectedSlug);
      await refreshVehicleMeta();
      galleryPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error desconocido");
      await fetchPhotos(selectedSlug);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const stageSpinFiles = (list: FileList | null, kind: "standard" | "hd") => {
    const files = sortFramesByNumber(Array.from(list || []));
    if (kind === "standard") setSpinStandard(files);
    else setSpinHd(files);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const handleUploadSpin = async () => {
    if (!selectedSlug) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress("Preparando el giro…");
    try {
      const result = await uploadSpinSets({
        slug: selectedSlug,
        standard: spinStandard,
        hd: spinHd,
        onProgress: (done, count, phase) =>
          setUploadProgress(phase === "sign" ? `Firmando ${done}/${count}…` : `${done}/${count}`),
      });
      setUploadSuccess(result.message);
      setSpinStandard([]);
      setSpinHd([]);
      if (spinInputRef.current) spinInputRef.current.value = "";
      if (hdInputRef.current) hdInputRef.current.value = "";
      await fetchPhotos(selectedSlug);
      await refreshVehicleMeta();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir el giro.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePhoto = async (photo: PhotoItem) => {
    if (!confirm(`¿Eliminar esta foto (${photo.name})?`)) return;
    try {
      const res = await fetch("/api/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedSlug,
          filename: photo.name,
          url: normalizeMediaUrl(photo.url),
          type: "gallery",
        }),
      });
      if (!res.ok) {
        alert(await readApiError(res));
        return;
      }
      const data = await res.json();
      if (data.success) {
        await fetchPhotos(selectedSlug);
        await refreshVehicleMeta();
      } else {
        alert(data.error || "No se pudo eliminar la foto.");
      }
    } catch {
      alert("Error al intentar eliminar.");
    }
  };

  const handleSetAsCover = async (url: string) => {
    try {
      const res = await fetch("/api/photos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedSlug,
          action: "set_cover",
          coverUrl: normalizeMediaUrl(url),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUploadSuccess("Portada actualizada: esa foto queda primera en el catálogo.");
        await fetchPhotos(selectedSlug);
        await refreshVehicleMeta();
      } else {
        alert(data.error || "No se pudo actualizar la portada.");
      }
    } catch {
      alert("Error de conexión al actualizar la portada.");
    }
  };

  const handleMovePhoto = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= gallery.length) return;

    const newGallery = [...gallery];
    const temp = newGallery[index]!;
    newGallery[index] = newGallery[targetIdx]!;
    newGallery[targetIdx] = temp;
    setGallery(newGallery);

    // Usar URLs reales (Blob/Drive), sin cortar ?id= de Google Drive
    const urls = newGallery.map((g) => normalizeMediaUrl(g.url));
    try {
      const res = await fetch("/api/photos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selectedSlug, action: "reorder", gallery: urls }),
      });
      const data = await res.json();
      if (!data.success) {
        await fetchPhotos(selectedSlug);
      } else {
        setCoverImage(urls[0] || "");
        await refreshVehicleMeta();
      }
    } catch {
      await fetchPhotos(selectedSlug);
    }
  };

  const filteredVehicles = vehiclesData.filter((v) => {
    if (!searchCar) return true;
    const q = searchCar.toLowerCase();
    return (
      (v.plate || "").toLowerCase().includes(q) ||
      v.brand.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q)
    );
  });

  const readyCount = staged.filter((s) => s.ready && !s.error).length;
  const busy = isPreparing || isUploading;
  const catalogVehicle = vehiclesData.find((v) => v.slug === selectedSlug);
  const liveSpinFrames = catalogVehicle?.spin
    ? spinFramesOf(catalogVehicle).map((frame) => asset(frame))
    : [];
  const liveSpinHiFrames = catalogVehicle?.spin?.hiPattern
    ? spinHiFramesOf(catalogVehicle).map((frame) => asset(frame))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-ink-800/60 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset(coverImage || selectedVehicle.image)}
            alt={selectedVehicle.model}
            className="h-16 w-24 rounded-xl border border-white/10 bg-ink-950 object-cover shadow-md"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = asset("/images/placeholder-pending-car.svg");
            }}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-brand-500/40 bg-brand-500/20 px-2 py-0.5 text-xs font-extrabold tracking-wider text-brand-300">
                {selectedVehicle.plate || "SIN PLACA"}
              </span>
              <span className="text-[11px] text-white/50">{selectedVehicle.location}</span>
            </div>
            <h2 className="mt-0.5 text-xl font-bold text-white">
              {selectedVehicle.brand} {selectedVehicle.model} · {selectedVehicle.year}
            </h2>
            <p className="text-xs text-white/50">{selectedVehicle.version}</p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-80">
          <input
            type="search"
            value={searchCar}
            onChange={(e) => setSearchCar(e.target.value)}
            placeholder="Buscar placa, marca o modelo…"
            className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
          />
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
          >
            {filteredVehicles.map((v) => (
              <option key={v.slug} value={v.slug}>
                [{v.plate || "—"}] {v.brand} {v.model} ({v.year})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-white/40">{filteredVehicles.length} en stock</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {(
          [
            ["gallery", `Galería y Fotos (${gallery.length})`],
            ["spin", `Fotogramas 360° (${spinCount > 0 ? `${spinCount} fotos` : "Sin 360"})`],
            ["guide", "Guía de Tomas Recomendadas"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === id
                ? "bg-brand-500 text-white shadow-glow"
                : "bg-ink-800/60 text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "gallery" && (
        <div className="grid gap-6 lg:grid-cols-[1.05fr_1.2fr]">
          <div className="space-y-4 rounded-2xl border border-white/10 bg-ink-800/60 p-5">
            <div>
              <h3 className="font-semibold text-white">1. Elegir y ordenar fotos</h3>
              <p className="text-xs text-white/50">
                La <span className="text-brand-300">primera miniatura</span> será la portada del
                catálogo. Reordénalas antes de publicar.
              </p>
            </div>

            {staged.length === 0 ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (!busy) void handleFilesChosen(e.dataTransfer.files);
                }}
                onClick={() => {
                  if (!busy) fileInputRef.current?.click();
                }}
                className={`relative flex min-h-[200px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  busy ? "cursor-wait opacity-70" : "cursor-pointer"
                } ${
                  isDragging
                    ? "border-brand-400 bg-brand-500/15"
                    : "border-white/15 bg-ink-900/50 hover:border-brand-500/50 hover:bg-ink-900"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    void handleFilesChosen(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-500/20 text-2xl text-brand-300">
                  📥
                </div>
                <p className="text-sm font-medium text-white">
                  Arrastra las fotos aquí o{" "}
                  <span className="text-brand-400 underline">haz clic para explorar</span>
                </p>
                <p className="mt-1 max-w-sm text-xs text-white/40">
                  Verás miniaturas al instante. HEIC de iPhone se convierte solo a
                  JPEG/WebP. Luego ordenas y publicas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white/80">
                    {staged.length} seleccionada{staged.length === 1 ? "" : "s"}
                    {readyCount < staged.length ? ` · ${readyCount} lista${readyCount === 1 ? "" : "s"}` : ""}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border border-white/15 bg-ink-900 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 disabled:opacity-50"
                    >
                      + Agregar más
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={clearStaged}
                      className="rounded-lg px-3 py-1.5 text-xs text-red-300/80 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Limpiar
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      void handleFilesChosen(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {staged.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`relative overflow-hidden rounded-xl border bg-ink-950 ${
                        idx === 0
                          ? "border-brand-400 ring-1 ring-brand-400/40"
                          : item.error
                            ? "border-red-500/50"
                            : "border-white/10"
                      }`}
                    >
                      <div className="relative aspect-[4/3] bg-black/50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-full w-full object-cover"
                        />
                        {idx === 0 && (
                          <span className="absolute left-2 top-2 rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            PORTADA
                          </span>
                        )}
                        <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white/90">
                          #{idx + 1}
                        </span>
                        {!item.ready && !item.error && (
                          <div className="absolute inset-0 grid place-items-center bg-black/55 text-[11px] text-white">
                            Preparando…
                          </div>
                        )}
                        {item.error && (
                          <div className="absolute inset-0 grid place-items-center bg-red-950/80 p-2 text-center text-[10px] text-red-200">
                            {item.error}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 border-t border-white/10 px-1.5 py-1.5">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={idx === 0 || busy}
                            onClick={() => moveStaged(idx, -1)}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-brand-500 disabled:opacity-25"
                            title="Antes"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            disabled={idx === staged.length - 1 || busy}
                            onClick={() => moveStaged(idx, 1)}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-brand-500 disabled:opacity-25"
                            title="Después"
                          >
                            →
                          </button>
                        </div>
                        <p className="truncate text-[9px] text-white/40">{formatBytes(item.file.size)}</p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeStaged(item.id)}
                          className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-500/40 disabled:opacity-50"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={busy || readyCount === 0}
                  onClick={() => void handleUploadGallery()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-400 disabled:opacity-50"
                >
                  {isUploading
                    ? uploadProgress || "Publicando…"
                    : isPreparing
                      ? "Preparando fotos…"
                      : `2. Publicar ${readyCount} foto${readyCount === 1 ? "" : "s"} en el catálogo`}
                </button>
              </div>
            )}

            {uploadProgress && !isUploading && (
              <div className="rounded-xl border border-brand-400/30 bg-brand-500/10 px-4 py-3 text-xs text-brand-100">
                {uploadProgress}
              </div>
            )}
            {uploadError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                {uploadSuccess}
              </div>
            )}
          </div>

          <div
            ref={galleryPanelRef}
            className="space-y-4 rounded-2xl border border-white/10 bg-ink-800/60 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Fotos ya publicadas</h3>
                <p className="text-xs text-white/50">
                  {gallery.length} en catálogo · La portada es la foto del catálogo y de la ficha.
                </p>
                <p className="mt-1 max-w-md text-xs text-amber-200/80">
                  Si la portada muestra la placa de otra automotora, elige otra foto del mismo set. Acá no se editan las imágenes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchPhotos(selectedSlug)}
                className="rounded-lg border border-white/10 bg-ink-900 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 hover:text-white"
              >
                Refrescar
              </button>
            </div>

            {isLoadingPhotos ? (
              <div className="grid h-48 place-items-center rounded-xl bg-ink-900/50 text-xs text-white/40">
                Cargando fotos del vehículo…
              </div>
            ) : gallery.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-ink-900/50 p-8 text-center">
                <p className="text-sm font-medium text-white/70">
                  Aún no hay fotos publicadas para este vehículo
                </p>
                <p className="mt-1 max-w-xs text-xs text-white/40">
                  Elige fotos a la izquierda, ordénalas y pulsa Publicar. Aquí verás las
                  miniaturas finales.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((photo, idx) => {
                  const coverMatched = gallery.some(
                    (item) => coverImage && mediaUrlsEqual(coverImage, item.url),
                  );
                  const isCover = coverMatched
                    ? mediaUrlsEqual(coverImage, photo.url)
                    : idx === 0;
                  return (
                    <div
                      key={`${photo.url}-${idx}`}
                      className={`group relative flex flex-col overflow-hidden rounded-xl border transition ${
                        isCover
                          ? "border-brand-400 bg-brand-500/10 shadow-glow"
                          : "border-white/10 bg-ink-900"
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = asset(
                              "/images/placeholder-pending-car.svg",
                            );
                          }}
                        />
                        {isCover && (
                          <span className="absolute left-2 top-2 z-10 rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                            PORTADA
                          </span>
                        )}
                        <span className="absolute right-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
                          #{idx + 1}
                        </span>
                        <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(photo.url)}
                            className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-sm text-white hover:bg-white/30"
                            title="Ver grande"
                          >
                            🔍
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeletePhoto(photo)}
                            className="grid h-8 w-8 place-items-center rounded-full bg-red-500/80 text-sm text-white hover:bg-red-500"
                            title="Eliminar"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/10 bg-ink-950/80 px-2 py-1.5 text-[10px]">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void handleMovePhoto(idx, -1)}
                            className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-white hover:bg-brand-500 disabled:opacity-20"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            disabled={idx === gallery.length - 1}
                            onClick={() => void handleMovePhoto(idx, 1)}
                            className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-white hover:bg-brand-500 disabled:opacity-20"
                          >
                            →
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={isCover}
                          onClick={() => void handleSetAsCover(photo.url)}
                          className="rounded-md bg-brand-500/90 px-2 py-1 font-semibold text-white hover:bg-brand-400 disabled:bg-emerald-500/20 disabled:text-emerald-300"
                        >
                          {isCover ? "Portada actual" : "Elegir como portada"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "spin" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4 rounded-2xl border border-white/10 bg-ink-800/60 p-5">
            <h3 className="font-semibold text-white">Subir giro 360°</h3>
            <p className="text-xs text-white/50">
              Estándar: WebP, JPG o PNG, entre 24 y 200 fotos, ordenadas por número.
              HD opcional: AVIF o WebP, la misma cantidad. Las WebP y AVIF que ya vienen
              listas no se recomprimen. El vehículo se actualiza solo si la subida termina.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => spinInputRef.current?.click()}
                className="rounded-2xl border border-dashed border-white/15 bg-ink-900/50 px-4 py-5 text-left transition hover:border-brand-500 disabled:opacity-50"
              >
                <input
                  ref={spinInputRef}
                  type="file"
                  multiple
                  accept="image/webp,image/jpeg,image/png,.webp,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => stageSpinFiles(e.target.files, "standard")}
                />
                <p className="text-sm font-medium text-white">Estándar</p>
                <p className="mt-1 text-xs text-white/50">
                  {spinStandard.length > 0
                    ? `${spinStandard.length} archivos · ${spinStandard[0]?.name} → ${spinStandard[spinStandard.length - 1]?.name}`
                    : "WebP, JPG o PNG"}
                </p>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => hdInputRef.current?.click()}
                className="rounded-2xl border border-dashed border-white/15 bg-ink-900/50 px-4 py-5 text-left transition hover:border-brand-500 disabled:opacity-50"
              >
                <input
                  ref={hdInputRef}
                  type="file"
                  multiple
                  accept="image/avif,image/webp,.avif,.webp"
                  className="hidden"
                  onChange={(e) => stageSpinFiles(e.target.files, "hd")}
                />
                <p className="text-sm font-medium text-white">HD opcional</p>
                <p className="mt-1 text-xs text-white/50">
                  {spinHd.length > 0
                    ? `${spinHd.length} archivos · ${spinHd[0]?.name} → ${spinHd[spinHd.length - 1]?.name}`
                    : "AVIF o WebP"}
                </p>
              </button>
            </div>
            <button
              type="button"
              disabled={busy || spinStandard.length < 24 || spinStandard.length > 200 || (spinHd.length > 0 && spinHd.length !== spinStandard.length)}
              onClick={() => void handleUploadSpin()}
              className="flex w-full items-center justify-center rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-400 disabled:opacity-50"
            >
              {isUploading ? uploadProgress || "0/0" : "Subir giro"}
            </button>
            {spinStandard.length > 0 && (spinStandard.length < 24 || spinStandard.length > 200) && (
              <p className="text-xs text-amber-200">El estándar necesita entre 24 y 200 fotogramas.</p>
            )}
            {spinHd.length > 0 && spinHd.length !== spinStandard.length && (
              <p className="text-xs text-amber-200">La HD tiene que tener la misma cantidad que el estándar.</p>
            )}
            {isUploading && uploadProgress && (
              <div className="rounded-xl bg-brand-500/10 p-3 text-center text-xs font-semibold text-brand-300">
                {uploadProgress}
              </div>
            )}
            {uploadError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                {uploadSuccess}
              </div>
            )}
            <SpinUploader />
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
            <h3 className="mb-2 font-semibold text-white">Visor 360° en vivo</h3>
            {liveSpinFrames.length > 0 ? (
              <div className="aspect-video overflow-hidden rounded-xl bg-black">
                <PhotoSpin360
                  frames={liveSpinFrames}
                  hiFrames={liveSpinHiFrames.length > 0 ? liveSpinHiFrames : undefined}
                  frontIndex={catalogVehicle?.spin?.front}
                  autoPlay={false}
                  className="h-full w-full"
                />
              </div>
            ) : (
              <div className="grid h-64 place-items-center rounded-xl border border-white/10 bg-ink-900/50 text-xs text-white/40">
                Este vehículo aún no tiene fotogramas 360° cargados.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "guide" && (
        <div className="space-y-6 rounded-2xl border border-white/10 bg-ink-800/60 p-6">
          <div>
            <h3 className="text-lg font-bold text-white">Guía de tomas fotográficas</h3>
            <p className="mt-1 text-xs text-white/50">
              Secuencia estándar para el catálogo RG Motors.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["1. PORTADA", "La que vos elijas", "Cualquier ángulo: esa foto queda primera en el catálogo."],
              ["2. EXTERIOR", "Lateral & Trasera", "Perfil completo y 3/4 trasera."],
              ["3. INTERIOR", "Tablero & Km", "Tablero entero y kilometraje encendido."],
              ["4. DETALLES", "Motor, ruedas, asientos", "Vano motor, neumáticos y tapicería."],
            ].map(([badge, title, desc]) => (
              <div
                key={badge}
                className="space-y-2 rounded-xl border border-white/10 bg-ink-900 p-4"
              >
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                  {badge}
                </span>
                <h4 className="text-sm font-bold text-white">{title}</h4>
                <p className="text-xs text-white/70">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/20 object-contain"
          />
        </div>
      )}
    </div>
  );
}
