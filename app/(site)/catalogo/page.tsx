"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  vehicles as initialVehicles,
  formatCLP,
  Vehicle,
} from "@/lib/vehicles";
import { isCamionetaBody } from "@/lib/vehicles/publicCatalog";
import VehicleCard from "@/components/VehicleCard";
import CatalogPdfButton from "@/components/CatalogPdfButton";
import QuickCategoryFilter, { CategoryPill } from "@/components/QuickCategoryFilter";
import CarRequestModal from "@/components/CarRequestModal";

function matchesSelectedBodyType(bodyType: string, selected: string[]): boolean {
  if (!selected.length) return true;
  return selected.some((t) => {
    if (isCamionetaBody(t) && isCamionetaBody(bodyType)) return true;
    return t === bodyType;
  });
}

const MAX_PRICE = 80000000;

type Sort = "relevancia" | "precio-asc" | "precio-desc" | "km-asc" | "year-desc";

export default function CatalogPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-white/40">Cargando catálogo…</div>}>
      <CatalogContent />
    </Suspense>
  );
}

function CatalogContent() {
  const [vehicleList, setVehicleList] = useState<Vehicle[]>(initialVehicles);

  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeCat, setActiveCat] = useState<CategoryPill>("todos");
  const [brands, setBrands] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [fuels, setFuels] = useState<string[]>([]);
  const [trans, setTrans] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  const [minYear, setMinYear] = useState(2010);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("relevancia");
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [isCarRequestOpen, setIsCarRequestOpen] = useState(false);

  // Load from API on mount
  useEffect(() => {
    fetch("/api/vehicles?fields=card")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.vehicles && data.vehicles.length > 0) {
          setVehicleList(data.vehicles);
        }
      })
      .catch(() => {});
  }, []);

  // Initialize filters from URL search params
  useEffect(() => {
    const brandParam = searchParams.get("marca");
    if (brandParam) setBrands(brandParam.split(","));

    const typeParam = searchParams.get("carroceria");
    if (typeParam) setTypes(typeParam.split(","));

    const fuelParam = searchParams.get("combustible");
    if (fuelParam) setFuels(fuelParam.split(","));

    const qParam = searchParams.get("q");
    if (qParam) setQuery(qParam);

    const sortParam = searchParams.get("sort") as Sort;
    if (sortParam) setSort(sortParam);
  }, [searchParams]);

  // Sync state changes to URL
  const updateUrlParams = (newBrands: string[], newTypes: string[], newFuels: string[], newQ: string) => {
    const params = new URLSearchParams();
    if (newBrands.length) params.set("marca", newBrands.join(","));
    if (newTypes.length) params.set("carroceria", newTypes.join(","));
    if (newFuels.length) params.set("combustible", newFuels.join(","));
    if (newQ) params.set("q", newQ);
    const queryString = params.toString();
    router.replace(queryString ? `/catalogo?${queryString}` : "/catalogo", { scroll: false });
  };

  const categoryCounts = useMemo(() => ({
    todos: vehicleList.length,
    hibridos: vehicleList.filter((v) => v.fuel === "Híbrido" || v.fuel === "Eléctrico").length,
    suv: vehicleList.filter((v) => v.bodyType === "SUV").length,
    sedan: vehicleList.filter((v) => v.bodyType === "Sedán").length,
    camioneta: vehicleList.filter((v) => isCamionetaBody(v.bodyType)).length,
    "bajo-km": vehicleList.filter((v) => v.km <= 30000).length,
  }), [vehicleList]);

  const handleSelectQuickCategory = (cat: CategoryPill) => {
    setActiveCat(cat);
    switch (cat) {
      case "hibridos":
        setFuels(["Híbrido"]);
        setTypes([]);
        updateUrlParams(brands, [], ["Híbrido"], query);
        break;
      case "suv":
        setTypes(["SUV"]);
        setFuels([]);
        updateUrlParams(brands, ["SUV"], [], query);
        break;
      case "sedan":
        setTypes(["Sedán"]);
        setFuels([]);
        updateUrlParams(brands, ["Sedán"], [], query);
        break;
      case "camioneta":
        setTypes(["Camioneta"]);
        setFuels([]);
        updateUrlParams(brands, ["Camioneta"], [], query);
        break;
      default:
        setTypes([]);
        setFuels([]);
        updateUrlParams(brands, [], [], query);
        break;
    }
  };

  const toggleBrand = (b: string) => {
    const updated = brands.includes(b) ? brands.filter((x) => x !== b) : [...brands, b];
    setBrands(updated);
    updateUrlParams(updated, types, fuels, query);
  };

  const toggleType = (t: string) => {
    const updated = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
    setTypes(updated);
    updateUrlParams(brands, updated, fuels, query);
  };

  const toggleFuel = (f: string) => {
    const updated = fuels.includes(f) ? fuels.filter((x) => x !== f) : [...fuels, f];
    setFuels(updated);
    updateUrlParams(brands, types, updated, query);
  };

  const toggleTrans = (t: string) => {
    setTrans(trans.includes(t) ? trans.filter((x) => x !== t) : [...trans, t]);
  };

  const filtered = useMemo(() => {
    let result = vehicleList.filter((v) => {
      if (activeCat === "bajo-km" && v.km > 30000) return false;
      if (brands.length && !brands.includes(v.brand)) return false;
      if (!matchesSelectedBodyType(v.bodyType, types)) return false;
      if (fuels.length && !fuels.includes(v.fuel)) return false;
      if (trans.length && !trans.includes(v.transmission)) return false;
      if (v.price > maxPrice) return false;
      if (v.year < minYear) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${v.brand} ${v.model} ${v.version}`.toLowerCase().includes(q))
          return false;
      }
      return true;
    });

    switch (sort) {
      case "precio-asc":
        result = [...result].sort((a, b) => a.price - b.price);
        break;
      case "precio-desc":
        result = [...result].sort((a, b) => b.price - a.price);
        break;
      case "km-asc":
        result = [...result].sort((a, b) => a.km - b.km);
        break;
      case "year-desc":
        result = [...result].sort((a, b) => b.year - a.year);
        break;
      default:
        result = [...result].sort(
          (a, b) => Number(b.featured) - Number(a.featured)
        );
    }
    return result;
  }, [vehicleList, activeCat, brands, types, fuels, trans, maxPrice, minYear, query, sort]);

  const bodyTypesAvailable = useMemo(() => {
    const set = new Set(
      vehicleList.map((v) => (isCamionetaBody(v.bodyType) ? "Camioneta" : v.bodyType)),
    );
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [vehicleList]);

  const brandsAvailable = useMemo(() => {
    const set = new Set(vehicleList.map((v) => v.brand));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [vehicleList]);

  const fuelsAvailable = useMemo(() => {
    const set = new Set(vehicleList.map((v) => v.fuel));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [vehicleList]);

  const transmissionsAvailable = useMemo(() => {
    const set = new Set(vehicleList.map((v) => v.transmission));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [vehicleList]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (brands.length) parts.push(brands.join(", "));
    if (types.length) parts.push(types.join(", "));
    if (fuels.length) parts.push(fuels.join(", "));
    if (trans.length) parts.push(trans.join(", "));
    if (maxPrice < MAX_PRICE) parts.push(`hasta ${formatCLP(maxPrice)}`);
    if (minYear > 2010) parts.push(`${minYear}+`);
    if (query) parts.push(`"${query}"`);
    return parts.length ? parts.join(" · ") : "Catálogo completo";
  }, [brands, types, fuels, trans, maxPrice, minYear, query]);

  const clearAll = () => {
    setBrands([]);
    setTypes([]);
    setFuels([]);
    setTrans([]);
    setMaxPrice(MAX_PRICE);
    setMinYear(2010);
    setQuery("");
    setActiveCat("todos");
    router.replace("/catalogo", { scroll: false });
  };

  const Filters = (
    <div className="space-y-6">
      <FilterGroup title="Marca">
        {brandsAvailable.map((b) => (
          <Check key={b} label={b} checked={brands.includes(b)} onChange={() => toggleBrand(b)} />
        ))}
      </FilterGroup>

      <FilterGroup title="Tipo de vehículo">
        {bodyTypesAvailable.map((t) => (
          <Check key={t} label={t} checked={types.includes(t)} onChange={() => toggleType(t)} />
        ))}
      </FilterGroup>

      <FilterGroup title="Precio máximo">
        <input
          type="range"
          min={5000000}
          max={MAX_PRICE}
          step={500000}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="apple-range w-full cursor-pointer"
        />
        <div className="mt-1.5 flex justify-between text-xs font-semibold text-brand-300">
          <span>Hasta {formatCLP(maxPrice)}</span>
        </div>
      </FilterGroup>

      <FilterGroup title="Año desde">
        <input
          type="range"
          min={2010}
          max={2026}
          step={1}
          value={minYear}
          onChange={(e) => setMinYear(Number(e.target.value))}
          className="apple-range w-full cursor-pointer"
        />
        <div className="mt-1.5 flex justify-between text-xs font-semibold text-brand-300">
          <span>{minYear} en adelante</span>
        </div>
      </FilterGroup>

      <FilterGroup title="Combustible">
        {fuelsAvailable.map((f) => (
          <Check key={f} label={f} checked={fuels.includes(f)} onChange={() => toggleFuel(f)} />
        ))}
      </FilterGroup>

      <FilterGroup title="Transmisión">
        {transmissionsAvailable.map((t) => (
          <Check key={t} label={t} checked={trans.includes(t)} onChange={() => toggleTrans(t)} />
        ))}
      </FilterGroup>

      <button
        onClick={clearAll}
        className="apple-btn-secondary w-full rounded-2xl py-2.5 text-xs font-semibold tracking-wide"
      >
        Limpiar filtros
      </button>
    </div>
  );

  return (
    <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.08] pb-4 sm:mb-8 sm:gap-4 sm:pb-6">
        <div>
          <h1 className="text-[1.35rem] font-extrabold tracking-tight text-white sm:text-4xl">
            Catálogo
          </h1>
          <p className="mt-1 text-[12px] text-white/50 sm:text-sm">
            Vehículos seleccionados con inspección técnica.
          </p>
        </div>
        <CatalogPdfButton vehicles={filtered} filterSummary={filterSummary} />
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#12141c] p-3.5 sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
        <div>
          <h2 className="text-[13px] font-bold text-white sm:text-sm">¿Quieres vender tu vehículo?</h2>
          <p className="mt-0.5 text-[11px] text-white/55 sm:text-xs">
            Consígnalo con nosotros: lo tasamos, lo publicamos y lo vendemos por ti.
          </p>
        </div>
        <div className="flex w-full flex-row gap-2 sm:w-auto sm:flex-wrap shrink-0">
          <Link
            href="/consigna"
            className="apple-btn-primary inline-flex min-h-10 flex-1 items-center justify-center rounded-full px-3 py-2 text-[11px] font-bold text-white sm:min-h-11 sm:flex-none sm:px-5 sm:py-2.5 sm:text-xs"
          >
            Consigna tu vehículo
          </Link>
          <button
            onClick={() => setIsCarRequestOpen(true)}
            className="apple-btn-secondary min-h-10 flex-1 rounded-full px-3 py-2 text-[11px] font-semibold text-white/80 hover:text-white sm:min-h-11 sm:flex-none sm:px-4 sm:py-2.5 sm:text-xs"
          >
            Pedir a medida
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Sidebar filters (desktop) */}
        <aside className="hidden lg:block">
          <div className="apple-glass-card sticky top-24 rounded-3xl p-6">
            <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white/60">
                Filtros
              </h2>
              <span className="text-[11px] text-brand-300 font-medium">{filtered.length} resultados</span>
            </div>
            {Filters}
          </div>
        </aside>

        {/* Results */}
        <div className="space-y-6">
          <QuickCategoryFilter
            activeCategory={activeCat}
            onSelectCategory={handleSelectQuickCategory}
            counts={categoryCounts}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="relative w-full min-w-0 sm:max-w-xs">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-white/40">
                🔍
              </span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  updateUrlParams(brands, types, fuels, e.target.value);
                }}
                placeholder="Buscar marca o modelo…"
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="none"
                className="min-h-11 w-full rounded-full border border-white/15 bg-white/[0.05] pl-10 pr-4 py-2.5 text-base text-white placeholder-white/40 outline-none focus:border-brand-500 focus:bg-white/[0.08] focus:ring-2 focus:ring-brand-500/20 transition sm:text-sm"
              />
            </div>

            <div className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto">
              <button
                onClick={() => setShowFilters((s) => !s)}
                className="apple-btn-secondary min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-medium lg:hidden sm:flex-none"
              >
                Filtros {showFilters ? "▲" : "▼"}
              </button>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="min-h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-base font-medium text-white outline-none focus:border-brand-500 transition cursor-pointer backdrop-blur-md sm:flex-none sm:px-4 sm:text-sm"
              >
                <option value="relevancia" className="bg-ink-900">Relevancia</option>
                <option value="precio-asc" className="bg-ink-900">Precio ↑</option>
                <option value="precio-desc" className="bg-ink-900">Precio ↓</option>
                <option value="km-asc" className="bg-ink-900">Menor km</option>
                <option value="year-desc" className="bg-ink-900">Más nuevos</option>
              </select>
            </div>
          </div>

          {showFilters && (
            <div className="mb-6 apple-glass-card rounded-3xl p-6 lg:hidden">
              {Filters}
            </div>
          )}

          <p className="mb-4 text-xs font-medium text-white/45">
            Mostrando {filtered.length} {filtered.length === 1 ? "vehículo" : "vehículos"}
          </p>

          {filtered.length ? (
            <div className="grid gap-3 sm:gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((v) => (
                <VehicleCard key={v.slug} vehicle={v} />
              ))}
            </div>
          ) : (
            <div className="apple-glass-card rounded-3xl p-10 text-center text-white/50 space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-2xl text-brand-300">
                🔍
              </div>
              <h2 className="text-base font-bold text-white">¿No encuentras el auto exacto que buscas?</h2>
              <p className="text-xs text-white/60 max-w-md mx-auto">
                No te preocupes. Con nuestro servicio de <b>Personal Shopper Automotriz</b>, buscamos, revisamos y certificamos el modelo que quieres en menos de 48 horas.
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button
                  onClick={() => setIsCarRequestOpen(true)}
                  className="apple-btn-primary rounded-full px-6 py-2.5 text-xs font-bold text-white shadow-glow"
                >
                  Buscar auto por mí
                </button>
                <button
                  onClick={clearAll}
                  className="apple-btn-secondary rounded-full px-6 py-2.5 text-xs font-semibold text-white/70"
                >
                  Restablecer filtros
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CarRequestModal
        isOpen={isCarRequestOpen}
        onClose={() => setIsCarRequestOpen(false)}
      />
    </main>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1 text-[13px] font-medium text-white/70 hover:text-white transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 shrink-0 rounded border-white/20 bg-white/10 accent-brand-500 cursor-pointer"
      />
      {label}
    </label>
  );
}
