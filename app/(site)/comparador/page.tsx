"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { asset } from "@/lib/asset";
import { vehicles as initialVehicles, Vehicle, formatCLP } from "@/lib/vehicles";
import { publicVehicleSlug } from "@/lib/vehicles/publicSlug";
import { isPublicCatalogVehicle } from "@/lib/vehicles/publicCatalog";

const ROWS: { label: string; get: (v: Vehicle) => string }[] = [
  { label: "Precio", get: (v) => formatCLP(v.price) },
  { label: "Año", get: (v) => String(v.year) },
  { label: "Motor", get: (v) => v.engine || "—" },
  { label: "Potencia", get: (v) => v.power || "—" },
  { label: "Transmisión", get: (v) => v.transmission || "—" },
  { label: "Tracción", get: (v) => v.traction || "—" },
  { label: "Combustible", get: (v) => v.fuel || "—" },
  { label: "Puertas", get: (v) => (v.doors != null ? String(v.doors) : "—") },
  { label: "Carrocería", get: (v) => v.bodyType || "—" },
];

export default function ComparadorPage() {
  const [vehiclesData, setVehiclesData] = useState<Vehicle[]>(() =>
    initialVehicles.filter(isPublicCatalogVehicle).map((vehicle) => ({ ...vehicle, slug: publicVehicleSlug(vehicle) })),
  );
  
  useEffect(() => {
    fetch("/api/vehicles?fields=card")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.vehicles) setVehiclesData(data.vehicles);
      })
      .catch(console.error);
  }, []);

  const [selected, setSelected] = useState<string[]>([]);

  const cars = selected
    .map((s) => vehiclesData.find((v) => v.slug === s))
    .filter(Boolean) as Vehicle[];
  const available = vehiclesData.filter((v) => !selected.includes(v.slug));

  const addCar = (slug: string) => {
    if (selected.length < 3 && slug) setSelected([...selected, slug]);
  };
  const removeCar = (slug: string) => setSelected(selected.filter((s) => s !== slug));

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 border-b border-white/[0.08] pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
          Comparador de vehículos
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Compara fichas técnicas, precios e inspecciones lado a lado (hasta 3 vehículos).
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-40 p-4 text-left align-bottom text-xs font-semibold uppercase tracking-wider text-white/40">
                Especificaciones
              </th>
              {cars.map((v) => (
                <th key={v.slug} className="p-3 align-top min-w-[220px]">
                  <div className="apple-glass-card relative overflow-hidden rounded-3xl p-4 text-left">
                    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset(v.image)} alt={v.model} className="h-full w-full object-cover" />
                    </div>
                    <p className="mt-3 text-sm font-bold text-white">{v.brand} {v.model}</p>
                    <p className="text-xs text-white/50">{v.version}</p>
                    <p className="mt-1.5 text-base font-extrabold text-brand-300">{formatCLP(v.price)}</p>
                    <button
                      onClick={() => removeCar(v.slug)}
                      className="mt-3 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      ✕ Quitar de comparación
                    </button>
                  </div>
                </th>
              ))}
              {selected.length < 3 && (
                <th className="p-3 align-top min-w-[220px]">
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/20 bg-white/[0.02] p-6 backdrop-blur-md">
                    <span className="text-2xl text-white/30 mb-2">+</span>
                    <p className="text-xs font-semibold text-white/60 mb-3">Agregar vehículo</p>
                    <select
                      onChange={(e) => addCar(e.target.value)}
                      value=""
                      className="w-full rounded-full border border-white/15 bg-ink-900 px-3 py-2 text-xs font-medium text-white outline-none focus:border-brand-500 cursor-pointer"
                    >
                      <option value="">Seleccionar...</option>
                      {available.map((v) => (
                        <option key={v.slug} value={v.slug}>
                          {v.brand} {v.model} {v.year}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => (
              <tr key={row.label} className={ri % 2 ? "bg-white/[0.02]" : ""}>
                <td className="p-4 text-xs font-semibold text-white/70 border-b border-white/[0.06]">{row.label}</td>
                {cars.map((v) => (
                  <td key={v.slug} className="p-4 text-xs font-medium text-white/90 border-b border-white/[0.06]">
                    {row.get(v)}
                  </td>
                ))}
                {selected.length < 3 && <td className="border-b border-white/[0.06]" />}
              </tr>
            ))}
            <tr>
              <td className="p-4" />
              {cars.map((v) => (
                <td key={v.slug} className="p-4">
                  <Link
                    href={`/vehiculo/${v.slug}`}
                    className="apple-btn-primary block rounded-full py-2.5 text-center text-xs font-semibold text-white"
                  >
                    Ver detalle completo
                  </Link>
                </td>
              ))}
              {selected.length < 3 && <td />}
            </tr>
          </tbody>
        </table>
      </div>

      {cars.length === 0 && (
        <div className="apple-glass-card mt-8 rounded-3xl p-12 text-center text-white/40">
          Agrega vehículos para comenzar a comparar de forma simultánea.
        </div>
      )}
    </main>
  );
}

