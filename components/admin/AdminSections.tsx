"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { asset } from "@/lib/asset";
import { Vehicle, formatCLP } from "@/lib/vehicles";
import VehicleEditorModal from "./VehicleEditorModal";
import { Reservation } from "@/lib/server/reservationsStore";
import { SystemSettings } from "@/lib/server/settingsStore";
import { TradeInRequest } from "@/lib/server/tradeInStore";
import { CarRequest } from "@/lib/server/carRequestsStore";
import { PriceAlert } from "@/lib/server/priceAlertsStore";
import { TestDrive } from "@/lib/server/testDrivesStore";
import PhotoManager from "./PhotoManager";
import DriveSyncModal from "./DriveSyncModal";
import { SALE_SUPPLIERS, type SaleSupplier } from "@/lib/sales/suppliers";

export function ChannelBadge({ source }: { source?: string }) {
  if (!source) return <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">Directo</span>;
  const s = source.toLowerCase();
  if (s.includes("facebook") || s.includes("fb")) {
    return <span className="rounded-full bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-300">🟦 Facebook</span>;
  }
  if (s.includes("instagram") || s.includes("ig")) {
    return <span className="rounded-full bg-pink-500/15 border border-pink-500/30 px-2 py-0.5 text-[10px] font-bold text-pink-300">📸 Instagram</span>;
  }
  if (s.includes("google")) {
    return <span className="rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-300">🔴 Google Ads</span>;
  }
  if (s.includes("refer") || s.includes("chileautos") || s.includes("autofact")) {
    return <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-300">🔗 {source}</span>;
  }
  if (s.includes("org")) {
    return <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">🌱 Orgánico</span>;
  }
  return <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">🌐 {source}</span>;
}

const STATUS_BADGES = {
  Disponible: "bg-emerald-400/15 text-emerald-300 border-emerald-500/30",
  "En reserva": "bg-amber-400/15 text-amber-300 border-amber-500/30",
  Vendido: "bg-red-400/15 text-red-300 border-red-500/30",
  Borrador: "bg-white/10 text-white/50 border-white/20",
  "En preparación": "bg-slate-400/15 text-slate-300 border-slate-500/30",
  Pagada: "bg-emerald-400/15 text-emerald-300 border-emerald-500/30",
  "En proceso": "bg-amber-400/15 text-amber-300 border-amber-500/30",
  Cancelada: "bg-red-400/15 text-red-300 border-red-500/30",
  Entregado: "bg-blue-400/15 text-blue-300 border-blue-500/30",
  Pendiente: "bg-amber-400/15 text-amber-300 border-amber-500/30",
  Confirmada: "bg-emerald-400/15 text-emerald-300 border-emerald-500/30",
  Realizada: "bg-blue-400/15 text-blue-300 border-blue-500/30",
  "No asistió": "bg-red-400/15 text-red-300 border-red-500/30",
} as const;

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

/** 
 * SECCIÓN 1: INVENTARIO DINÁMICO CON CRUD COMPLETO
 */
export function VehiclesSection({
  onManagePhotos,
}: {
  onManagePhotos?: (slug: string) => void;
}) {
  const [vehicleList, setVehicleList] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [sellTarget, setSellTarget] = useState<Vehicle | null>(null);
  const [sellSupplier, setSellSupplier] = useState<SaleSupplier>("RG Motors");
  const [isSelling, setIsSelling] = useState(false);

  const fetchVehicles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/vehicles?admin=true");
      if (res.ok) {
        const data = await res.json();
        setVehicleList(data.vehicles || []);
      }
    } catch (err) {
      console.error("Error fetching vehicles:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const handleOpenCreate = () => {
    setEditingVehicle(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: Vehicle) => {
    setEditingVehicle(v);
    setIsModalOpen(true);
  };

  const handleDuplicate = async (v: Vehicle) => {
    const copySlug = `${v.slug}-copia-${Date.now().toString().slice(-4)}`;
    const copyVehicle: Vehicle = {
      ...v,
      slug: copySlug,
      model: `${v.model} (Copia)`,
      featured: false,
      status: "Borrador",
    };

    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copyVehicle),
      });
      if (res.ok) {
        fetchVehicles();
      }
    } catch {
      alert("Error al duplicar vehículo.");
    }
  };

  const handleDelete = async (slug: string, model: string) => {
    if (!confirm(`¿Estás seguro de eliminar el vehículo "${model}" del catálogo?`)) return;
    try {
      const res = await fetch(`/api/vehicles/${slug}`, { method: "DELETE" });
      if (res.ok) {
        setVehicleList((prev) => prev.filter((v) => v.slug !== slug));
      } else {
        alert("No se pudo eliminar el vehículo.");
      }
    } catch {
      alert("Error de conexión al eliminar.");
    }
  };

  const handleQuickStatus = async (v: Vehicle, newStatus: Vehicle["status"]) => {
    if (newStatus === "Vendido") {
      setSellSupplier(
        (v.supplier && (SALE_SUPPLIERS as readonly string[]).includes(v.supplier)
          ? v.supplier
          : "RG Motors") as SaleSupplier,
      );
      setSellTarget(v);
      return;
    }
    try {
      const res = await fetch(`/api/vehicles/${v.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setVehicleList((prev) =>
          prev.map((item) => (item.slug === v.slug ? { ...item, status: newStatus } : item))
        );
      }
    } catch {
      alert("Error al actualizar estado.");
    }
  };

  const confirmSell = async () => {
    if (!sellTarget) return;
    setIsSelling(true);
    try {
      const res = await fetch(`/api/vehicles/${sellTarget.slug}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: sellSupplier,
          salePrice: sellTarget.price,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo registrar la venta.");
      }
      setVehicleList((prev) => prev.filter((item) => item.slug !== sellTarget.slug));
      setSellTarget(null);
      alert(
        `Vendido por ${sellSupplier}. Fotos eliminadas. Quedó en el historial de ventas.`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al registrar la venta.");
    } finally {
      setIsSelling(false);
    }
  };

  const filtered = vehicleList.filter((v) => {
    const matchSearch =
      v.brand.toLowerCase().includes(search.toLowerCase()) ||
      v.model.toLowerCase().includes(search.toLowerCase()) ||
      v.version.toLowerCase().includes(search.toLowerCase()) ||
      String(v.year).includes(search);
    const matchStatus =
      filterStatus === "all" || (v.status || "Disponible") === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Top Bar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Inventario de Vehículos</h2>
          <p className="text-xs text-white/50">
            {vehicleList.length} vehículos en base de datos · {vehicleList.filter((v) => v.status === "Disponible").length} disponibles
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25 shadow-sm flex items-center gap-1.5"
          >
            <span>🔄</span> Sincronizar Drive & Excel
          </button>
          {onManagePhotos && (
            <button
              onClick={() => onManagePhotos(vehicleList[0]?.slug || "")}
              className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-xs font-bold text-brand-300 transition hover:bg-brand-500/20"
            >
              📸 Gestor de Fotos & 360°
            </button>
          )}
          <button
            onClick={handleOpenCreate}
            className="apple-btn-primary rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-glow"
          >
            + Publicar Vehículo
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/10 bg-ink-900/60 p-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Buscar por marca, modelo o año…"
            className="w-full rounded-xl border border-white/15 bg-ink-950 px-4 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-brand-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-2.5 text-xs text-white/40 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50">Filtrar:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-white/15 bg-ink-950 px-3 py-2 text-xs font-medium text-white outline-none focus:border-brand-500"
          >
            <option value="all">Todos los estados</option>
            <option value="Disponible">🟢 Disponibles</option>
            <option value="En reserva">🟡 En reserva</option>
            <option value="Vendido">🔴 Vendidos</option>
            <option value="Borrador">⚪ Borradores</option>
          </select>
        </div>
      </div>

      {/* Vehicles Table */}
      <Panel title="Lista de Inventario">
        {isLoading ? (
          <div className="grid h-40 place-items-center text-xs text-white/40">
            <span className="animate-spin text-lg">⚙</span> Cargando inventario…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-white/40">
            No se encontraron vehículos con los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="text-left text-white/40">
                <tr className="border-b border-white/10">
                  <th className="pb-2.5 font-medium">Vehículo</th>
                  <th className="pb-2.5 font-medium">Año / Km</th>
                  <th className="pb-2.5 font-medium">Precio</th>
                  <th className="pb-2.5 font-medium">360°</th>
                  <th className="pb-2.5 font-medium">Estado</th>
                  <th className="pb-2.5 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.slug} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset(v.image)}
                          alt={v.model}
                          className="h-11 w-16 rounded-xl object-cover border border-white/10 shadow-sm"
                        />
                        <div>
                          <p className="font-bold text-white">
                            {v.brand} {v.model}
                          </p>
                          <p className="text-xs text-white/40">{v.version} · {v.bodyType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-white/70">
                      <p className="font-medium text-white">{v.year}</p>
                      <p className="text-xs text-white/40">{v.km.toLocaleString("es-CL")} km</p>
                    </td>
                    <td className="py-3 text-white/70">
                      <p className="font-bold text-brand-300">{formatCLP(v.price)}</p>
                    </td>
                    <td className="py-3">
                      {v.spin && v.spin.count > 0 ? (
                        <span className="rounded-full bg-emerald-400/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs text-emerald-300 font-medium">
                          360° ({v.spin.count})
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/40">
                          Sin 360
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <select
                        value={v.status || "Disponible"}
                        onChange={(e) => handleQuickStatus(v, e.target.value as any)}
                        className={`rounded-lg border px-2 py-1 text-xs font-semibold outline-none cursor-pointer ${
                          STATUS_BADGES[v.status || "Disponible"]
                        }`}
                      >
                        <option value="Disponible">🟢 Disponible</option>
                        <option value="En reserva">🟡 En reserva</option>
                        <option value="Vendido">🔴 Vendido</option>
                        <option value="Borrador">⚪ Borrador</option>
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(v)}
                          className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500 hover:text-white transition"
                          title="Editar detalles del auto"
                        >
                          ✏️ Editar
                        </button>
                        {onManagePhotos && (
                          <button
                            onClick={() => onManagePhotos(v.slug)}
                            className="rounded-lg bg-ink-700 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-brand-500 hover:text-white transition"
                            title="Gestionar fotos y giros 360°"
                          >
                            📷 Fotos
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicate(v)}
                          className="rounded-lg bg-white/5 px-2 py-1 text-xs font-medium text-white/60 hover:bg-white/15 hover:text-white transition"
                          title="Duplicar auto"
                        >
                          📑
                        </button>
                        <button
                          onClick={() => handleDelete(v.slug, `${v.brand} ${v.model}`)}
                          className="rounded-lg bg-red-500/10 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500 hover:text-white transition"
                          title="Eliminar del catálogo"
                        >
                          🗑️
                        </button>
                        <Link
                          href={`/vehiculo/${v.slug}`}
                          target="_blank"
                          className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-brand-300 hover:underline"
                        >
                          ↗ Ficha
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Editor Modal */}
      <VehicleEditorModal
        vehicle={editingVehicle}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => {
          fetchVehicles();
        }}
      />

      {/* Google Drive & Excel Sync Modal */}
      <DriveSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSuccess={() => {
          fetchVehicles();
        }}
      />

      {/* Confirmar venta: vendedor + borrar fotos + historial */}
      {sellTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-ink-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Registrar venta</h3>
            <p className="mt-2 text-sm text-white/60">
              {sellTarget.brand} {sellTarget.model} · {sellTarget.plate || "sin placa"}
            </p>
            <p className="mt-3 text-xs text-amber-300/90">
              Se eliminarán las fotos del almacenamiento y el auto saldrá del
              inventario. Quedará solo el registro en el historial de ventas.
            </p>
            <label className="mt-4 mb-1 block text-xs font-medium text-white/60">
              ¿Quién vendió?
            </label>
            <select
              value={sellSupplier}
              onChange={(e) => setSellSupplier(e.target.value as SaleSupplier)}
              className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-500"
            >
              {SALE_SUPPLIERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSelling}
                onClick={() => setSellTarget(null)}
                className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSelling}
                onClick={confirmSell}
                className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-50"
              >
                {isSelling ? "Registrando…" : "Confirmar venta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 
 * SECCIÓN 2: GESTIÓN CRM DE RESERVAS CON WHATSAPP DIRECTO
 */
export function ReservationsSection() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReservations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/reservations");
      if (res.ok) {
        const data = await res.json();
        setReservations(data.reservations || []);
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const handleStatusChange = async (id: string, newStatus: Reservation["status"]) => {
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setReservations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
        );
      }
    } catch {
      alert("Error al actualizar estado de la reserva.");
    }
  };

  const totalAmount = reservations
    .filter((r) => r.status === "Pagada")
    .reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-4">
          <p className="text-xs text-white/50">Reservas registradas</p>
          <p className="mt-1 text-2xl font-bold text-white">{reservations.length}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-4">
          <p className="text-xs text-white/50">Abonos pagados</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">
            {reservations.filter((r) => r.status === "Pagada").length}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-4">
          <p className="text-xs text-white/50">Monto total en reservas</p>
          <p className="mt-1 text-2xl font-bold text-brand-300">{formatCLP(totalAmount)}</p>
        </div>
      </div>

      <Panel title="Gestión de Reservas Online">
        {isLoading ? (
          <div className="grid h-32 place-items-center text-xs text-white/40">
            Cargando reservas…
          </div>
        ) : reservations.length === 0 ? (
          <div className="p-8 text-center text-xs text-white/40">
            No hay reservas registradas aún.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="text-left text-white/40">
                <tr className="border-b border-white/10">
                  <th className="pb-2.5 font-medium">ID / Fecha</th>
                  <th className="pb-2.5 font-medium">Cliente</th>
                  <th className="pb-2.5 font-medium">Vehículo</th>
                  <th className="pb-2.5 font-medium">Monto</th>
                  <th className="pb-2.5 font-medium">Estado</th>
                  <th className="pb-2.5 font-medium text-right">Contacto Rápido</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => {
                  const cleanPhone = r.phone.replace(/[^0-9]/g, "");
                  const msg = `Hola ${r.clientName}, te contactamos de RG Motors respecto a tu reserva ${r.id} del vehículo ${r.vehicleSlug}. ¿Cómo estás?`;
                  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

                  return (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                      <td className="py-3">
                        <p className="font-semibold text-white">{r.id}</p>
                        <p className="text-[11px] text-white/40">
                          {new Date(r.date).toLocaleDateString("es-CL")}
                        </p>
                      </td>
                      <td className="py-3">
                        <p className="font-bold text-white">{r.clientName}</p>
                        <p className="text-xs text-white/40">{r.email || r.phone}</p>
                      </td>
                      <td className="py-3">
                        <Link href={`/vehiculo/${r.vehicleSlug}`} className="font-medium text-brand-300 hover:underline">
                          {r.vehicleSlug}
                        </Link>
                        <p className="text-[11px] text-white/40">Método: {r.method}</p>
                      </td>
                      <td className="py-3 font-bold text-white">{formatCLP(r.amount)}</td>
                      <td className="py-3">
                        <select
                          value={r.status}
                          onChange={(e) => handleStatusChange(r.id, e.target.value as any)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold outline-none cursor-pointer ${
                            STATUS_BADGES[r.status]
                          }`}
                        >
                          <option value="Pagada">🟢 Pagada</option>
                          <option value="En proceso">🟡 En proceso</option>
                          <option value="Entregado">🔵 Entregado</option>
                          <option value="Cancelada">🔴 Cancelada</option>
                        </select>
                      </td>
                      <td className="py-3 text-right">
                        {r.phone ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366]/20 border border-[#25D366]/40 px-3 py-1.5 text-xs font-bold text-[#25D366] hover:bg-[#25D366] hover:text-white transition"
                          >
                            <span>💬</span> WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-white/40">Sin teléfono</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * Base de clientes (leads del chat).
 */
export function ClientsSection() {
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/track")
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((data) => setLeads(data.leads || []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <Panel title="Clientes y Leads Capturados">
        {leads.length === 0 ? (
          <div className="p-8 text-center text-xs text-white/40">
            Aún no hay leads capturados. Los contactos del ejecutivo virtual o formularios aparecerán aquí.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-white/40">
                <tr className="border-b border-white/10">
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 font-medium">Contacto</th>
                  <th className="pb-2 font-medium">Interés / Carrocería</th>
                  <th className="pb-2 font-medium">Presupuesto</th>
                  <th className="pb-2 font-medium">Canal de Origen</th>
                  <th className="pb-2 font-medium text-right">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const clean = (l.contact || "").replace(/[^0-9]/g, "");
                  const waUrl = clean
                    ? `https://wa.me/${clean}?text=${encodeURIComponent("Hola! Te contactamos de RG Motors.")}`
                    : null;

                  const sourceName =
                    l.trafficSource?.source ||
                    (l.intents?.find((i: string) => i.startsWith("canal-"))?.replace("canal-", "")) ||
                    "Directo";

                  return (
                    <tr key={l.id} className="border-b border-white/5">
                      <td className="py-3 text-xs text-white/50">
                        {new Date(l.updatedAt || l.createdAt).toLocaleDateString("es-CL")}
                      </td>
                      <td className="py-3 font-semibold text-white">
                        {l.contact || l.name || "Lead Web Anónimo"}
                      </td>
                      <td className="py-3 text-white/70">
                        {l.bodyType || (l.models && l.models.join(", ")) || "Consultando"}
                      </td>
                      <td className="py-3 font-bold text-brand-300">
                        {l.budget ? formatCLP(l.budget) : "—"}
                      </td>
                      <td className="py-3">
                        <ChannelBadge source={sourceName} />
                      </td>
                      <td className="py-3 text-right">
                        {waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-[#25D366]/20 px-2.5 py-1 text-xs text-[#25D366] hover:bg-[#25D366] hover:text-white transition"
                          >
                            <span>💬</span> Chat
                          </a>
                        ) : (
                          <span className="text-xs text-white/30">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** 
 * SECCIÓN 5: CONFIGURACIÓN GLOBAL DEL NEGOCIO (PERSISTENTE)
 */
export function ConfigSection() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSettings(data);
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    setSavedSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3500);
      }
    } catch {
      alert("Error al guardar la configuración.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!settings) {
    return <div className="p-8 text-center text-xs text-white/40">Cargando configuración…</div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {savedSuccess && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/15 p-4 text-xs font-bold text-emerald-300 animate-fade-in flex items-center justify-between">
          <span>✓ ¡Configuración de la empresa y preferencias guardadas exitosamente!</span>
          <span className="text-white/60">Los cambios ya están activos en la web.</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Datos de contacto */}
        <Panel title="Datos Oficiales de la Empresa">
          <div className="space-y-3.5 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Nombre Comercial</label>
              <input
                type="text"
                value={settings.company.name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    company: { ...settings.company, name: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-sm text-white focus:border-brand-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Teléfono Visible</label>
                <input
                  type="text"
                  value={settings.company.phoneDisplay}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      company: { ...settings.company, phoneDisplay: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-sm text-white focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">WhatsApp (sin +)</label>
                <input
                  type="text"
                  value={settings.company.whatsapp}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      company: { ...settings.company, whatsapp: e.target.value },
                    })
                  }
                  className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-sm text-white focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Correo Electrónico</label>
              <input
                type="email"
                value={settings.company.email}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    company: { ...settings.company, email: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-sm text-white focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Dirección de Sucursal</label>
              <input
                type="text"
                value={settings.company.address}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    company: { ...settings.company, address: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-sm text-white focus:border-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Horarios de Atención</label>
              <input
                type="text"
                value={settings.company.hours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    company: { ...settings.company, hours: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-sm text-white focus:border-brand-500 outline-none"
              />
            </div>
          </div>
        </Panel>

        {/* Preferencias comerciales */}
        <Panel title="Parámetros Comerciales">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Monto Abono Reserva ($)</label>
                <input
                  type="number"
                  step={10000}
                  value={settings.preferences.reserveAmount}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      preferences: {
                        ...settings.preferences,
                        reserveAmount: parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-sm text-white font-bold text-brand-300 focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <ul className="space-y-2.5 pt-2 border-t border-white/10 text-xs">
              <li className="flex items-center justify-between rounded-xl bg-ink-950 p-3">
                <span className="text-white font-medium">Habilitar Giros 360° en Catálogo</span>
                <input
                  type="checkbox"
                  checked={settings.preferences.showSpin360}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      preferences: { ...settings.preferences, showSpin360: e.target.checked },
                    })
                  }
                  className="h-5 w-5 accent-brand-500 rounded cursor-pointer"
                />
              </li>
              <li className="flex items-center justify-between rounded-xl bg-ink-950 p-3">
                <span className="text-white font-medium">Activar Ejecutivo virtual</span>
                <input
                  type="checkbox"
                  checked={settings.preferences.enableChatbot}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      preferences: { ...settings.preferences, enableChatbot: e.target.checked },
                    })
                  }
                  className="h-5 w-5 accent-brand-500 rounded cursor-pointer"
                />
              </li>
              <li className="flex items-center justify-between rounded-xl bg-ink-950 p-3">
                <span className="text-white font-medium">Permitir Reservas Online ($)</span>
                <input
                  type="checkbox"
                  checked={settings.preferences.enableOnlineReservation}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      preferences: { ...settings.preferences, enableOnlineReservation: e.target.checked },
                    })
                  }
                  className="h-5 w-5 accent-brand-500 rounded cursor-pointer"
                />
              </li>
            </ul>
          </div>
        </Panel>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="apple-btn-primary rounded-xl px-8 py-3 text-sm font-bold text-white shadow-glow disabled:opacity-50"
        >
          {isSaving ? "Guardando cambios…" : "💾 Guardar Todos los Cambios"}
        </button>
      </div>
    </form>
  );
}

/**
 * SECCIÓN 6: LEAD SCORING INTELIGENTE (SEMÁFORO DE COMPRA)
 */
export function LeadScoringSection() {
  const [tradeIns, setTradeIns] = useState<TradeInRequest[]>([]);
  const [carRequests, setCarRequests] = useState<CarRequest[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [filterScore, setFilterScore] = useState<"all" | "hot" | "warm" | "cold">("all");

  useEffect(() => {
    fetch("/api/trade-in").then((r) => r.ok ? r.json() : { requests: [] }).then((d) => setTradeIns(d.requests || []));
    fetch("/api/car-requests").then((r) => r.ok ? r.json() : { requests: [] }).then((d) => setCarRequests(d.requests || []));
    fetch("/api/price-alerts").then((r) => r.ok ? r.json() : { alerts: [] }).then((d) => setPriceAlerts(d.alerts || []));
  }, []);

  // Consolidar todos los leads con scoring unificado
  const allLeads = [
    ...tradeIns.map((t) => ({
      id: t.id,
      name: t.clientName,
      phone: t.phone,
      type: "Entrega Auto en Parte de Pago",
      detail: `${t.brand} ${t.model} (${t.year}) → Compra: ${t.targetVehicleSlug || "Catálogo"}`,
      score: t.score || 90,
      date: t.date,
      hotText: "💎 Quiere entregar auto usado + comprar nuevo",
    })),
    ...carRequests.map((r) => ({
      id: r.id,
      name: r.clientName,
      phone: r.phone,
      type: "Auto a Pedido / Personal Shopper",
      detail: `Busca: ${r.brand} ${r.model} (Hasta ${formatCLP(r.maxBudget)})`,
      score: r.score || 85,
      date: r.date,
      hotText: "🎯 Comprador con presupuesto definido",
    })),
    ...priceAlerts.map((a) => ({
      id: a.id,
      name: a.clientName,
      phone: a.phone,
      type: "Alerta de Rebaja de Precio",
      detail: `${a.vehicleName} (Obj: ${formatCLP(a.targetPrice || a.currentPrice)})`,
      score: a.score || 80,
      date: a.date,
      hotText: "⚡ Esperando oferta comercial",
    })),
  ].sort((a, b) => b.score - a.score || new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredLeads = allLeads.filter((l) => {
    if (filterScore === "hot") return l.score >= 90;
    if (filterScore === "warm") return l.score >= 70 && l.score < 90;
    if (filterScore === "cold") return l.score < 70;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Banner Regla de los 15 minutos */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-ink-900 to-black p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⏱️</span>
          <div>
            <h3 className="text-sm font-bold text-white">Regla de Oro Comercial: Respuesta en menos de 15 min</h3>
            <p className="text-xs text-white/60">
              Un cliente calificado contactado durante los primeros 15 minutos tiene un <b>400% más de tasa de cierre</b>.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterScore("all")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              filterScore === "all" ? "bg-brand-500 text-white" : "bg-ink-950 text-white/60"
            }`}
          >
            Todos ({allLeads.length})
          </button>
          <button
            onClick={() => setFilterScore("hot")}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
              filterScore === "hot" ? "bg-emerald-500 text-white" : "bg-ink-950 text-emerald-400"
            }`}
          >
            🔥 Calientes ({allLeads.filter((l) => l.score >= 90).length})
          </button>
          <button
            onClick={() => setFilterScore("warm")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              filterScore === "warm" ? "bg-amber-500 text-white" : "bg-ink-950 text-amber-400"
            }`}
          >
            🟡 Tibios ({allLeads.filter((l) => l.score >= 70 && l.score < 90).length})
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredLeads.map((lead) => {
          const cleanPhone = lead.phone.replace(/[^0-9]/g, "");
          const waMsg = `Hola ${lead.name}, te contactamos de RG Motors respecto a tu solicitud de ${lead.type.toLowerCase()}. Vimos que tienes alta compatibilidad y queremos asesorarte personalmente.`;
          const waUrl = `https://wa.me/${cleanPhone.startsWith("56") ? cleanPhone : `56${cleanPhone}`}?text=${encodeURIComponent(waMsg)}`;

          const isHot = lead.score >= 90;
          const isWarm = lead.score >= 70 && lead.score < 90;

          return (
            <div
              key={lead.id}
              className={`rounded-2xl border p-4 backdrop-blur-md space-y-3 ${
                isHot
                  ? "border-emerald-500/40 bg-emerald-500/10 shadow-glow"
                  : isWarm
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-white/10 bg-ink-900/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                  isHot ? "bg-emerald-400/20 text-emerald-300" : "bg-amber-400/20 text-amber-300"
                }`}>
                  {isHot ? "🟢 Score " : "🟡 Score "} {lead.score}/100
                </span>
                <span className="text-[10px] text-white/40">
                  {new Date(lead.date).toLocaleDateString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <div>
                <h4 className="font-bold text-white text-sm">{lead.name}</h4>
                <p className="text-xs text-brand-300 font-semibold mt-0.5">{lead.type}</p>
                <p className="text-[11px] text-white/60 mt-1">{lead.detail}</p>
              </div>

              <div className="rounded-xl bg-ink-950 p-2.5 text-[11px] text-white/80 font-medium border border-white/5">
                {lead.hotText}
              </div>

              <div className="flex gap-2 pt-1">
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="apple-btn-primary flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white"
                >
                  <span>💬</span> WhatsApp
                </a>
                <a
                  href={`tel:${lead.phone}`}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  📞 Llamar
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SECCIÓN 7: MINERÍA DE TASACIONES & PARTE DE PAGO
 */
export function TradeInsSection() {
  const [requests, setRequests] = useState<TradeInRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTradeIns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/trade-in");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTradeIns();
  }, [fetchTradeIns]);

  const handleUpdateStatus = async (id: string, status: TradeInRequest["status"]) => {
    try {
      await fetch(`/api/trade-in/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchTradeIns();
    } catch {}
  };

  return (
    <Panel
      title="Minería de Tasaciones & Retomas"
      action={
        <span className="text-xs text-brand-300 font-semibold">
          {requests.length} tasaciones recibidas
        </span>
      }
    >
      <p className="text-xs text-white/55 mb-4">
        Oportunidades de doble negocio: compra de autos usados a valor retoma + venta de vehículos del catálogo.
      </p>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-white/40">Cargando tasaciones…</div>
      ) : requests.length === 0 ? (
        <div className="py-12 text-center text-xs text-white/40">No hay tasaciones registradas aún.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead className="text-left text-white/40 border-b border-white/10 pb-2">
              <tr>
                <th className="pb-2">Cliente & Contacto</th>
                <th className="pb-2">Auto Actual a Retoma</th>
                <th className="pb-2">Auto que Desea Comprar</th>
                <th className="pb-2">Tasación Sugerida</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {requests.map((r) => {
                const cleanPhone = r.phone.replace(/[^0-9]/g, "");
                const waMsg = `Hola ${r.clientName}, te contactamos de RG Motors respecto a la tasación de tu ${r.brand} ${r.model} (${r.year}) para la compra de tu próximo auto. Tenemos una propuesta lista.`;
                const waUrl = `https://wa.me/${cleanPhone.startsWith("56") ? cleanPhone : `56${cleanPhone}`}?text=${encodeURIComponent(waMsg)}`;

                return (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="py-3">
                      <p className="font-bold text-white">{r.clientName}</p>
                      <p className="text-white/50">{r.phone}</p>
                    </td>
                    <td className="py-3">
                      <p className="font-semibold text-brand-300">{r.brand} {r.model} ({r.year})</p>
                      <p className="text-white/50">{r.km.toLocaleString("es-CL")} km</p>
                    </td>
                    <td className="py-3 font-medium text-white">
                      {r.targetVehicleSlug || "Sin auto asignado"}
                    </td>
                    <td className="py-3 font-extrabold text-emerald-400">
                      {r.estimatedAppraisal ? formatCLP(r.estimatedAppraisal) : "Por evaluar"}
                    </td>
                    <td className="py-3">
                      <select
                        value={r.status}
                        onChange={(e) => handleUpdateStatus(r.id, e.target.value as any)}
                        className="rounded-xl border border-white/15 bg-ink-950 px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Contactado">Contactado</option>
                        <option value="Tasado">Tasado</option>
                        <option value="Cerrado">Cerrado</option>
                        <option value="Descartado">Descartado</option>
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="apple-btn-primary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-glow"
                      >
                        <span>💬</span> WhatsApp
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/**
 * SECCIÓN 8: AUTOS A PEDIDO / PERSONAL SHOPPER
 */
export function CarRequestsSection() {
  const [requests, setRequests] = useState<CarRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/car-requests");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleUpdateStatus = async (id: string, status: CarRequest["status"]) => {
    try {
      await fetch(`/api/car-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchRequests();
    } catch {}
  };

  return (
    <Panel
      title="Autos a Pedido / Personal Shopper"
      action={
        <span className="text-xs text-brand-300 font-semibold">
          {requests.length} clientes buscando auto
        </span>
      }
    >
      <p className="text-xs text-white/55 mb-4">
        Lista de clientes que buscan modelos específicos que no encontraron en stock. Notifícalos apenas ingrese inventario afín.
      </p>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-white/40">Cargando solicitudes…</div>
      ) : requests.length === 0 ? (
        <div className="py-12 text-center text-xs text-white/40">No hay búsquedas activas.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead className="text-left text-white/40 border-b border-white/10 pb-2">
              <tr>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Auto Deseado</th>
                <th className="pb-2">Presupuesto Máx.</th>
                <th className="pb-2">Detalles / Preferencias</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2 text-right">Notificar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {requests.map((r) => {
                const cleanPhone = r.phone.replace(/[^0-9]/g, "");
                const waMsg = `Hola ${r.clientName}, de RG Motors te avisamos que acaba de ingresar una opción para tu búsqueda de ${r.brand} ${r.model}. ¿Podemos enviarte fotos y ficha técnica?`;
                const waUrl = `https://wa.me/${cleanPhone.startsWith("56") ? cleanPhone : `56${cleanPhone}`}?text=${encodeURIComponent(waMsg)}`;

                return (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="py-3">
                      <p className="font-bold text-white">{r.clientName}</p>
                      <p className="text-white/50">{r.phone}</p>
                    </td>
                    <td className="py-3">
                      <p className="font-semibold text-brand-300">{r.brand} {r.model}</p>
                      <p className="text-white/50">{r.minYear ? `Año ${r.minYear}+` : "Cualquier año"}</p>
                    </td>
                    <td className="py-3 font-extrabold text-white">
                      {formatCLP(r.maxBudget)}
                    </td>
                    <td className="py-3 text-white/70 max-w-xs truncate">
                      {r.notes || `${r.fuel || "Combustible libre"} · ${r.transmission || "Transmisión libre"}`}
                    </td>
                    <td className="py-3">
                      <select
                        value={r.status}
                        onChange={(e) => handleUpdateStatus(r.id, e.target.value as any)}
                        className="rounded-xl border border-white/15 bg-ink-950 px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="En búsqueda">En búsqueda</option>
                        <option value="Encontrado">Encontrado</option>
                        <option value="Contactado">Contactado</option>
                        <option value="Descartado">Descartado</option>
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="apple-btn-primary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-glow"
                      >
                        <span>💬</span> Notificar
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/**
 * SECCIÓN 9: ALERTAS DE REBAJA DE PRECIO
 */
export function PriceAlertsSection() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/price-alerts");
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleUpdateStatus = async (id: string, status: PriceAlert["status"]) => {
    try {
      await fetch(`/api/price-alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchAlerts();
    } catch {}
  };

  return (
    <Panel
      title="Alertas de Rebaja de Precio & Ofertas"
      action={
        <span className="text-xs text-amber-300 font-semibold">
          {alerts.length} alertas activas
        </span>
      }
    >
      <p className="text-xs text-white/55 mb-4">
        Clientes en lista de espera para descuentos específicos. Úsalos para cerrar ventas rápidas antes de fin de mes.
      </p>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-white/40">Cargando alertas…</div>
      ) : alerts.length === 0 ? (
        <div className="py-12 text-center text-xs text-white/40">No hay alertas registradas.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead className="text-left text-white/40 border-b border-white/10 pb-2">
              <tr>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Vehículo de Interés</th>
                <th className="pb-2">Precio Actual</th>
                <th className="pb-2">Precio Objetivo</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {alerts.map((a) => {
                const cleanPhone = a.phone.replace(/[^0-9]/g, "");
                const waMsg = `Hola ${a.clientName}, tenemos novedades sobre el ${a.vehicleName} que tienes en seguimiento en RG Motors. ¿Podemos coordinar una oferta especial hoy?`;
                const waUrl = `https://wa.me/${cleanPhone.startsWith("56") ? cleanPhone : `56${cleanPhone}`}?text=${encodeURIComponent(waMsg)}`;

                return (
                  <tr key={a.id} className="hover:bg-white/[0.02]">
                    <td className="py-3">
                      <p className="font-bold text-white">{a.clientName}</p>
                      <p className="text-white/50">{a.phone}</p>
                    </td>
                    <td className="py-3 font-semibold text-white">{a.vehicleName}</td>
                    <td className="py-3 font-bold text-white/70">{formatCLP(a.currentPrice)}</td>
                    <td className="py-3 font-extrabold text-amber-400">
                      {a.targetPrice ? formatCLP(a.targetPrice) : "Cualquier rebaja"}
                    </td>
                    <td className="py-3">
                      <select
                        value={a.status}
                        onChange={(e) => handleUpdateStatus(a.id, e.target.value as any)}
                        className="rounded-xl border border-white/15 bg-ink-950 px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
                      >
                        <option value="Activa">Activa</option>
                        <option value="Notificada">Notificada</option>
                        <option value="Comprado">Comprado</option>
                        <option value="Cancelada">Cancelada</option>
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="apple-btn-primary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-glow"
                      >
                        <span>💬</span> Enviar Oferta
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** 
 * SECCIÓN: GESTIÓN CRM DE PRUEBAS DE MANEJO (TEST DRIVES) CON CONFIRMACIÓN WHATSAPP
 */
export function TestDrivesSection() {
  const [testDrives, setTestDrives] = useState<TestDrive[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const fetchTestDrives = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/test-drives");
      if (res.ok) {
        const data = await res.json();
        setTestDrives(data.testDrives || []);
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTestDrives();
  }, [fetchTestDrives]);

  const handleStatusChange = async (id: string, newStatus: TestDrive["status"]) => {
    try {
      const res = await fetch(`/api/test-drives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setTestDrives((prev) =>
          prev.map((td) => (td.id === id ? { ...td, status: newStatus } : td))
        );
      }
    } catch {
      alert("Error al actualizar estado del test drive.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la prueba de manejo de ${name}?`)) return;
    try {
      const res = await fetch(`/api/test-drives/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTestDrives((prev) => prev.filter((td) => td.id !== id));
      }
    } catch {
      alert("Error al eliminar.");
    }
  };

  const filtered = testDrives.filter((td) => {
    const matchSearch =
      td.clientName.toLowerCase().includes(search.toLowerCase()) ||
      td.clientPhone.includes(search) ||
      td.vehicleTitle.toLowerCase().includes(search.toLowerCase());
    const matchBranch = filterBranch === "all" || td.branch === filterBranch;
    const matchStatus = filterStatus === "all" || td.status === filterStatus;
    return matchSearch && matchBranch && matchStatus;
  });

  const totalPending = testDrives.filter((td) => td.status === "Pendiente").length;
  const totalConfirmed = testDrives.filter((td) => td.status === "Confirmada").length;
  const totalCompleted = testDrives.filter((td) => td.status === "Realizada").length;

  return (
    <div className="space-y-4">
      {/* Top Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-4">
          <p className="text-xs text-white/50">Agendamientos totales</p>
          <p className="mt-1 text-2xl font-bold text-white">{testDrives.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-xs text-amber-300/80">Pendientes de confirmar</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{totalPending}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-xs text-emerald-300/80">Confirmadas / En curso</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{totalConfirmed}</p>
        </div>
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
          <p className="text-xs text-blue-300/80">Pruebas realizadas</p>
          <p className="mt-1 text-2xl font-bold text-blue-300">{totalCompleted}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/10 bg-ink-900/60 p-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Buscar por cliente, teléfono o vehículo…"
            className="w-full rounded-xl border border-white/15 bg-ink-950 px-4 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className="rounded-xl border border-white/15 bg-ink-950 px-3 py-2 text-xs font-medium text-white outline-none focus:border-brand-500"
          >
            <option value="all">Todas las sucursales</option>
            <option value="Showroom Av. Cardonal (Puerto Montt)">Showroom Av. Cardonal</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-white/15 bg-ink-950 px-3 py-2 text-xs font-medium text-white outline-none focus:border-brand-500"
          >
            <option value="all">Todos los estados</option>
            <option value="Pendiente">🟡 Pendientes</option>
            <option value="Confirmada">🟢 Confirmadas</option>
            <option value="Realizada">🔵 Realizadas</option>
            <option value="No asistió">🔴 No asistió</option>
            <option value="Cancelada">⚪ Canceladas</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <Panel title="Pruebas de Manejo (Test Drives)">
        {isLoading ? (
          <div className="grid h-32 place-items-center text-xs text-white/40">
            Cargando agendamientos…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-white/40">
            No hay pruebas de manejo registradas con los filtros actuales.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-white/40">
                <tr className="border-b border-white/10">
                  <th className="pb-2.5 font-medium">Cita / Horario</th>
                  <th className="pb-2.5 font-medium">Cliente</th>
                  <th className="pb-2.5 font-medium">Vehículo</th>
                  <th className="pb-2.5 font-medium">Sucursal & Ejecutivo</th>
                  <th className="pb-2.5 font-medium">Canal de Origen</th>
                  <th className="pb-2.5 font-medium">Estado</th>
                  <th className="pb-2.5 font-medium text-right">Acción WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((td) => {
                  const cleanPhone = td.clientPhone.replace(/[^0-9]/g, "");
                  const phoneWithCountry = cleanPhone.startsWith("56") ? cleanPhone : `56${cleanPhone}`;
                  const waConfirmMsg = `Hola ${td.clientName}, te contactamos de RG Motors para confirmar tu prueba de manejo del ${td.vehicleTitle} el día ${td.date} a las ${td.time} en nuestra sucursal de ${td.branch}. ¿Nos confirmas tu asistencia?`;
                  const waUrl = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(waConfirmMsg)}`;

                  return (
                    <tr key={td.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                      <td className="py-3">
                        <p className="font-bold text-brand-300">{td.date}</p>
                        <p className="text-xs text-white/70 font-semibold">{td.time}</p>
                        <p className="text-[10px] text-white/35">ID: {td.id}</p>
                      </td>
                      <td className="py-3">
                        <p className="font-bold text-white">{td.clientName}</p>
                        <p className="text-xs text-white/50">{td.clientPhone}</p>
                        {td.clientEmail && <p className="text-[10px] text-white/40">{td.clientEmail}</p>}
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/vehiculo/${td.vehicleSlug}`}
                          target="_blank"
                          className="font-medium text-white hover:text-brand-300 transition hover:underline"
                        >
                          {td.vehicleTitle || td.vehicleSlug}
                        </Link>
                      </td>
                      <td className="py-3 text-xs text-white/70">
                        <p className="font-semibold text-white">{td.branch}</p>
                        <p className="text-[11px] text-white/40">Ejecutivo: {td.executive || "Sin preferencia"}</p>
                      </td>
                      <td className="py-3">
                        <ChannelBadge source={td.trafficSource?.source} />
                      </td>
                      <td className="py-3">
                        <select
                          value={td.status}
                          onChange={(e) => handleStatusChange(td.id, e.target.value as any)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold outline-none cursor-pointer ${
                            STATUS_BADGES[td.status as keyof typeof STATUS_BADGES] || "bg-white/10 text-white"
                          }`}
                        >
                          <option value="Pendiente">🟡 Pendiente</option>
                          <option value="Confirmada">🟢 Confirmada</option>
                          <option value="Realizada">🔵 Realizada</option>
                          <option value="No asistió">🔴 No asistió</option>
                          <option value="Cancelada">⚪ Cancelada</option>
                        </select>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-xl bg-[#25D366]/20 border border-[#25D366]/40 px-3 py-1.5 text-xs font-bold text-[#25D366] hover:bg-[#25D366] hover:text-white transition shadow-sm"
                            title="Confirmar cita al cliente por WhatsApp"
                          >
                            <span>💬</span> Confirmar
                          </a>
                          <button
                            onClick={() => handleDelete(td.id, td.clientName)}
                            className="rounded-lg bg-red-500/10 p-1.5 text-xs text-red-300 hover:bg-red-500 hover:text-white transition"
                            title="Eliminar registro"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * HUB DE INVENTARIO Y MULTIMEDIA UNIFICADO
 */
export function InventoryHubSection({
  initialSubTab = "catalogo",
  initialSlug,
}: {
  initialSubTab?: "catalogo" | "multimedia" | "historial";
  initialSlug?: string;
}) {
  const [subTab, setSubTab] = useState<"catalogo" | "multimedia" | "historial">(
    initialSubTab,
  );
  const [photoSlug, setPhotoSlug] = useState<string>(initialSlug || "");

  const handleManagePhotos = (slug: string) => {
    setPhotoSlug(slug);
    setSubTab("multimedia");
  };

  return (
    <div className="space-y-6">
      {/* Sub-navegación de Inventario */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink-900/80 p-2 backdrop-blur-xl">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSubTab("catalogo")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              subTab === "catalogo"
                ? "bg-brand-500 text-white shadow-glow"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>🚘</span> Catálogo de Vehículos
          </button>
          <button
            onClick={() => setSubTab("multimedia")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              subTab === "multimedia"
                ? "bg-brand-500 text-white shadow-glow"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>📸</span> Estudio de Fotos & Visores 360°
          </button>
          <button
            onClick={() => setSubTab("historial")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              subTab === "historial"
                ? "bg-brand-500 text-white shadow-glow"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>📜</span> Historial de Ventas
          </button>
        </div>
        <p className="text-xs text-white/40 px-3 hidden sm:block">
          {subTab === "catalogo"
            ? "Edición, estados y publicación de autos"
            : subTab === "multimedia"
              ? "Galería HD, portadas y giros 360° con IA"
              : "Ventas archivadas: fecha, hora y quién vendió"}
        </p>
      </div>

      {subTab === "catalogo" ? (
        <VehiclesSection onManagePhotos={handleManagePhotos} />
      ) : subTab === "multimedia" ? (
        <PhotoManager initialSlug={photoSlug} />
      ) : (
        <SoldHistorySection />
      )}
    </div>
  );
}

type SoldHistoryRow = {
  id: string;
  slug: string;
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  salePrice: number;
  supplier: string;
  soldAt: string;
  photosDeleted?: boolean;
  notes?: string;
};

export function SoldHistorySection() {
  const [rows, setRows] = useState<SoldHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/sold-vehicles");
      if (!res.ok) throw new Error("No autorizado o error de red");
      const data = await res.json();
      setRows(data.sold || []);
    } catch {
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      r.plate.toLowerCase().includes(q) ||
      r.brand.toLowerCase().includes(q) ||
      r.model.toLowerCase().includes(q) ||
      r.supplier.toLowerCase().includes(q)
    );
  });

  const formatSoldAt = (iso: string) => {
    try {
      const d = new Date(iso);
      return {
        date: d.toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
        time: d.toLocaleTimeString("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    } catch {
      return { date: iso, time: "—" };
    }
  };

  return (
    <Panel
      title="Historial de vehículos vendidos"
      action={
        <button
          onClick={load}
          className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/5"
        >
          Actualizar
        </button>
      }
    >
      <p className="mb-3 text-xs text-white/50">
        Solo queda el registro comercial (fecha, hora y quién vendió). Las fotos
        se eliminan al marcar como vendido para liberar espacio.
      </p>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por patente, marca, modelo o vendedor…"
        className="mb-4 w-full max-w-md rounded-xl border border-white/15 bg-ink-950 px-4 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-brand-500"
      />
      {isLoading ? (
        <p className="text-xs text-white/40 py-6">Cargando historial…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-white/40 py-6">
          Aún no hay ventas archivadas.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-white/40 border-b border-white/10">
              <tr>
                <th className="pb-2 pr-3">Fecha venta</th>
                <th className="pb-2 pr-3">Hora</th>
                <th className="pb-2 pr-3">Vehículo</th>
                <th className="pb-2 pr-3">Patente</th>
                <th className="pb-2 pr-3">Precio venta</th>
                <th className="pb-2 pr-3">Vendido por</th>
                <th className="pb-2">Fotos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r) => {
                const { date, time } = formatSoldAt(r.soldAt);
                return (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 pr-3 font-medium text-white">{date}</td>
                    <td className="py-3 pr-3 text-white/70">{time}</td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-white">
                        {r.brand} {r.model}
                      </p>
                      <p className="text-white/40">
                        {r.year} · {r.version}
                      </p>
                    </td>
                    <td className="py-3 pr-3 font-mono text-white/80">
                      {r.plate}
                    </td>
                    <td className="py-3 pr-3 font-bold text-brand-300">
                      {formatCLP(r.salePrice)}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-white/90">
                        {r.supplier || "—"}
                      </span>
                    </td>
                    <td className="py-3 text-white/50">
                      {r.photosDeleted ? "Eliminadas" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/**
 * HUB DE CRM COMERCIAL Y OPORTUNIDADES UNIFICADO
 */
export function CrmHubSection({
  initialTab = "leads",
}: {
  initialTab?: "leads" | "testdrives" | "reservas" | "tasaciones" | "pedidos" | "clientes";
}) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  const TABS = [
    { id: "leads", label: "Leads & Scoring", icon: "🔥" },
    { id: "testdrives", label: "Pruebas de Manejo", icon: "🚗" },
    { id: "reservas", label: "Reservas Online", icon: "★" },
    { id: "tasaciones", label: "Tasaciones / Retomas", icon: "💎" },
    { id: "pedidos", label: "Autos a Pedido & Alertas", icon: "🎯" },
    { id: "clientes", label: "Base de Clientes", icon: "👥" },
  ];

  return (
    <div className="space-y-6">
      {/* Selector de sub-pestañas CRM */}
      <div className="rounded-2xl border border-white/10 bg-ink-900/80 p-2 backdrop-blur-xl">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                activeTab === tab.id
                  ? "bg-brand-500 text-white shadow-glow"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Renderizado de la sub-sección activa */}
      {activeTab === "leads" && <LeadScoringSection />}
      {activeTab === "testdrives" && <TestDrivesSection />}
      {activeTab === "reservas" && <ReservationsSection />}
      {activeTab === "tasaciones" && <TradeInsSection />}
      {activeTab === "pedidos" && (
        <div className="space-y-6">
          <CarRequestsSection />
          <PriceAlertsSection />
        </div>
      )}
      {activeTab === "clientes" && <ClientsSection />}
    </div>
  );
}



