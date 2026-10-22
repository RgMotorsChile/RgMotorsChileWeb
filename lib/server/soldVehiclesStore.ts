import { readJson, writeJson } from "./db";
import { Vehicle } from "@/lib/vehicles";
import { deleteLocalVehicleFiles } from "./mediaStorage";
import { releaseVehiclePhotos } from "./vehiclePhotoGc";
import { deleteVehicle } from "./vehiclesStore";
import {
  isSaleSupplier,
  type SaleSupplier,
} from "@/lib/sales/suppliers";

export interface SoldVehicleRecord {
  id: string;
  slug: string;
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  salePrice: number;
  listPrice?: number;
  km: number;
  fuel: string;
  transmission: string;
  bodyType: string;
  location: string;
  /** Quién vendió: RG Motors | Unidades Chile | Salgado Automotoriz */
  supplier: SaleSupplier | string;
  /** ISO datetime de la venta (fecha + hora) */
  soldAt: string;
  status: "Vendido";
  notes?: string;
  photosDeleted?: boolean;
}

const SOLD_FILENAME = "sold_vehicles.json";

export async function getSoldVehicles(): Promise<SoldVehicleRecord[]> {
  return readJson<SoldVehicleRecord[]>(SOLD_FILENAME, []);
}

export async function archiveSoldVehicle(
  vehicle: Vehicle,
  salePrice?: number,
  notes?: string,
  supplierOverride?: string,
): Promise<{ success: boolean; record?: SoldVehicleRecord; error?: string }> {
  const records = await getSoldVehicles();
  const supplier =
    (supplierOverride && isSaleSupplier(supplierOverride)
      ? supplierOverride
      : undefined) ||
    (vehicle.supplier && isSaleSupplier(vehicle.supplier)
      ? vehicle.supplier
      : undefined) ||
    vehicle.supplier ||
    "RG Motors";

  const record: SoldVehicleRecord = {
    id: `sold-${vehicle.slug}-${Date.now()}`,
    slug: vehicle.slug,
    plate: vehicle.plate || "SIN PLACA",
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
    year: vehicle.year,
    salePrice: salePrice && salePrice > 0 ? salePrice : vehicle.price,
    listPrice: vehicle.listPrice,
    km: vehicle.km,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    bodyType: vehicle.bodyType,
    location: vehicle.location,
    supplier,
    soldAt: new Date().toISOString(),
    status: "Vendido",
    notes: notes || "Vendido y archivado para historial comercial",
    photosDeleted: false,
  };

  // Evitar duplicados del mismo slug
  const filtered = records.filter((r) => r.slug !== vehicle.slug);
  filtered.unshift(record);

  const ok = await writeJson(SOLD_FILENAME, filtered);
  if (!ok) {
    return { success: false, error: "No se pudo guardar en el registro de ventas." };
  }

  // Las fotos de Storage se borran después de sacar el auto del catálogo
  // (markVehicleAsSold o el replace de la planilla). Acá solo se limpia disco local.
  try {
    const deletedLocal = await deleteLocalVehicleFiles(vehicle);
    record.photosDeleted = deletedLocal > 0;
    filtered[0] = record;
    await writeJson(SOLD_FILENAME, filtered);
  } catch (err) {
    console.error(`[ArchiveSold] Error al limpiar fotos locales de ${vehicle.slug}:`, err);
  }

  return { success: true, record };
}

/**
 * Marca como vendido desde admin: archiva historial, borra fotos y saca del inventario activo.
 */
export async function markVehicleAsSold(opts: {
  vehicle: Vehicle;
  supplier: SaleSupplier;
  salePrice?: number;
  notes?: string;
}): Promise<{
  success: boolean;
  record?: SoldVehicleRecord;
  error?: string;
}> {
  const { vehicle, supplier, salePrice, notes } = opts;

  const archived = await archiveSoldVehicle(
    vehicle,
    salePrice,
    notes || `Vendido por ${supplier} desde panel admin`,
    supplier,
  );
  if (!archived.success || !archived.record) {
    return {
      success: false,
      error: archived.error || "No se pudo archivar la venta.",
    };
  }

  const removed = await deleteVehicle(vehicle.slug);
  if (removed.success) {
    const released = await releaseVehiclePhotos(vehicle, "sold").catch((err) => {
      console.error(`[ArchiveSold] No se pudieron borrar fotos de ${vehicle.slug}:`, err);
      return { deleted: [] as string[], kept: [] as string[] };
    });
    if (released.deleted.length > 0) {
      archived.record.photosDeleted = true;
      const records = await getSoldVehicles();
      const idx = records.findIndex((r) => r.id === archived.record?.id);
      if (idx >= 0) {
        records[idx] = { ...records[idx], photosDeleted: true };
        await writeJson(SOLD_FILENAME, records);
      }
    }
  }
  if (!removed.success) {
    return {
      success: false,
      error:
        removed.error ||
        "Venta archivada y fotos limpiadas, pero no se pudo sacar del inventario activo.",
      record: archived.record,
    };
  }

  return { success: true, record: archived.record };
}
