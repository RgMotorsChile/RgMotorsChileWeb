/** Detalle que se guarda en `sync_state.detail` en cada corrida del cron. */
export type CatalogSyncDetail = {
  tenant: string;
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  photos: number;
  /** Vehículos o carpetas que no entraron en el presupuesto de esta corrida. */
  deferred: number;
  errors: string[];
  durationMs: number;
  success: boolean;
};

export type SheetSyncSlice = {
  success?: boolean;
  message?: string;
  newVehicles?: number;
  updatedVehicles?: number;
  skippedIncomplete?: number;
  rowsRead?: number;
};

export type DriveSyncSlice = {
  success?: boolean;
  message?: string;
  newPhotosDownloaded?: number;
  syncedVehicles?: number;
  skippedUnchanged?: number;
  skippedCoverLocked?: number;
  deferredVehicles?: number;
  errors?: string[];
};

export function buildCatalogSyncDetail(input: {
  tenant: string;
  sheet?: SheetSyncSlice | null;
  drive?: DriveSyncSlice | null;
  durationMs: number;
  thrown?: string;
}): CatalogSyncDetail {
  const errors: string[] = [];
  if (input.thrown) errors.push(input.thrown);
  if (input.sheet?.success === false && input.sheet.message) {
    errors.push(input.sheet.message);
  }
  if (input.drive?.success === false && input.drive.message) {
    errors.push(input.drive.message);
  }
  for (const err of input.drive?.errors || []) {
    if (err && !errors.includes(err)) errors.push(err);
  }

  const sheetOk = !input.sheet || input.sheet.success !== false;
  const driveOk = !input.drive || input.drive.success !== false;
  const ran = Boolean(input.sheet || input.drive);
  const success = !input.thrown && ran && sheetOk && driveOk;

  return {
    tenant: input.tenant,
    read: input.sheet?.rowsRead ?? 0,
    inserted: input.sheet?.newVehicles ?? 0,
    updated:
      (input.sheet?.updatedVehicles ?? 0) + (input.drive?.syncedVehicles ?? 0),
    skipped:
      (input.sheet?.skippedIncomplete ?? 0) +
      (input.drive?.skippedUnchanged ?? 0) +
      (input.drive?.skippedCoverLocked ?? 0),
    photos: input.drive?.newPhotosDownloaded ?? 0,
    deferred: input.drive?.deferredVehicles ?? 0,
    errors,
    durationMs: Math.max(0, input.durationMs),
    success,
  };
}
