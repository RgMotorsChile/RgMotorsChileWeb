import { mkdir, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { createServerSupabase, isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/client";
import { isVercelProduction } from "@/lib/server/storageHealth";
import {
  VEHICLE_PHOTOS_BUCKET,
  supabasePublicObjectUrl,
} from "@/lib/server/photoObjectPath";

export type StoredMedia = {
  /** URL pública (Supabase) o path relativo (/...) */
  url: string;
  relativePath: string;
  storage: "supabase" | "local";
};

const VEHICLE_PHOTO_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "application/json",
] as const;

let bucketReady = false;

/** Solo tests: el proceso real cachea el alta del bucket. */
export function resetVehiclePhotoBucketCacheForTests(): void {
  bucketReady = false;
}

async function ensureVehiclePhotosBucket(): Promise<void> {
  if (bucketReady) return;
  const sb = createServerSupabase();
  const existing = await sb.storage.getBucket(VEHICLE_PHOTOS_BUCKET);
  if (!existing.error && existing.data) {
    const storage = sb.storage as {
      updateBucket?: (
        id: string,
        options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] },
      ) => Promise<{ error: { message: string } | null }>;
    };
    if (typeof storage.updateBucket === "function") {
      const updated = await storage.updateBucket(VEHICLE_PHOTOS_BUCKET, {
        public: true,
        fileSizeLimit: 20 * 1024 * 1024,
        allowedMimeTypes: [...VEHICLE_PHOTO_MIME],
      });
      if (updated.error) {
        console.warn("[Media] MIME del bucket:", updated.error.message);
      }
    }
    bucketReady = true;
    return;
  }
  const notFound = /not found|does not exist/i.test(existing.error?.message || "");
  if (existing.error && !notFound) {
    throw new Error(`Supabase Storage: ${existing.error.message}`);
  }
  const created = await sb.storage.createBucket(VEHICLE_PHOTOS_BUCKET, {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: [...VEHICLE_PHOTO_MIME],
  });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
    throw new Error(`No se pudo crear el bucket ${VEHICLE_PHOTOS_BUCKET}: ${created.error.message}`);
  }
  bucketReady = true;
}

/**
 * Guarda un archivo de media.
 * - Con SUPABASE_SERVICE_ROLE_KEY → bucket público vehicle-photos.
 * - Sin service role en producción → error.
 * - Sin service role en local → public/.
 */
export async function storeMediaFile(opts: {
  bytes: Buffer;
  /** Ruta lógica. Fotos de catálogo: `{tenant}/{slug}/{sha256}.ext`. */
  relativePath: string;
  contentType?: string;
}): Promise<StoredMedia> {
  const relativePath = opts.relativePath.replace(/^\/+/, "");
  const contentType = opts.contentType || guessContentType(relativePath);

  if (isSupabaseConfigured()) {
    await ensureVehiclePhotosBucket();
    const sb = createServerSupabase();
    const { error } = await sb.storage.from(VEHICLE_PHOTOS_BUCKET).upload(relativePath, opts.bytes, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) {
      throw new Error(`Supabase Storage: ${error.message}`);
    }
    const { data } = sb.storage.from(VEHICLE_PHOTOS_BUCKET).getPublicUrl(relativePath);
    const url = data.publicUrl || supabasePublicObjectUrl(SUPABASE_URL, relativePath);
    return {
      url,
      relativePath: `/${relativePath}`,
      storage: "supabase",
    };
  }

  if (isVercelProduction()) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en producción. Las fotos se guardan en Supabase Storage, no en Vercel Blob.",
    );
  }

  const abs = join(/*turbopackIgnore: true*/ process.cwd(), "public", relativePath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, opts.bytes);
  return {
    url: `/${relativePath}`,
    relativePath: `/${relativePath}`,
    storage: "local",
  };
}

function guessContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
    case "json":
      return "application/json";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

/**
 * Borra copias locales de un vehículo. Los objetos de Supabase se borran
 * aparte, después de confirmar que la base ya no los cita.
 */
export async function deleteLocalVehicleFiles(vehicle: {
  slug: string;
  image?: string;
  gallery?: string[];
}): Promise<number> {
  let deletedLocal = 0;
  const uploadDir = join(
    /*turbopackIgnore: true*/ process.cwd(),
    "public",
    "cars",
    "uploads",
    vehicle.slug,
  );
  const spinDir = join(
    /*turbopackIgnore: true*/ process.cwd(),
    "public",
    "cars",
    "spins",
    vehicle.slug,
  );

  for (const dir of [uploadDir, spinDir]) {
    try {
      if (!existsSync(dir)) continue;
      const files = await readdir(dir);
      for (const file of files) {
        try {
          await unlink(join(dir, file));
          deletedLocal++;
        } catch {
          /* ignore */
        }
      }
      try {
        await rmdir(dir);
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error(`[Media] Error borrando disco de ${vehicle.slug}:`, err);
    }
  }

  const urls = new Set<string>();
  if (vehicle.image) urls.add(vehicle.image.split("?")[0]);
  for (const g of vehicle.gallery || []) {
    if (g) urls.add(g.split("?")[0]);
  }
  for (const url of urls) {
    if (!url.startsWith("/") || url.includes("placeholder")) continue;
    const abs = join(/*turbopackIgnore: true*/ process.cwd(), "public", url.replace(/^\/+/, ""));
    if (!existsSync(abs)) continue;
    try {
      await unlink(abs);
      deletedLocal++;
    } catch {
      /* ignore */
    }
  }
  return deletedLocal;
}
