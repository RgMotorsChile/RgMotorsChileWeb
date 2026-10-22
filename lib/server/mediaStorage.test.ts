import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => vi.fn());
const getPublicUrl = vi.hoisted(() => vi.fn());
const getBucket = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  SUPABASE_URL: "https://tuybpizjeszgwtcvunmp.supabase.co",
  isSupabaseConfigured: () => true,
  createServerSupabase: () => ({
    storage: { getBucket, from },
  }),
}));

import { resetVehiclePhotoBucketCacheForTests, storeMediaFile } from "@/lib/server/mediaStorage";
import { photoContentHash, vehiclePhotoRelativePath } from "@/lib/server/photoObjectPath";

describe("storeMediaFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetVehiclePhotoBucketCacheForTests();
    getBucket.mockResolvedValue({ data: { id: "vehicle-photos" }, error: null });
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockImplementation((path: string) => ({
      data: {
        publicUrl: `https://tuybpizjeszgwtcvunmp.supabase.co/storage/v1/object/public/vehicle-photos/${path}`,
      },
    }));
    from.mockReturnValue({ upload, getPublicUrl });
  });

  it("sube al bucket vehicle-photos con el hash del contenido", async () => {
    const bytes = Buffer.from("foto-a");
    const relativePath = vehiclePhotoRelativePath({
      tenantSlug: "unidades-chile",
      slug: "hilux",
      contentHash: photoContentHash(bytes),
      ext: "jpg",
    });
    const stored = await storeMediaFile({ bytes, relativePath, contentType: "image/jpeg" });
    expect(from).toHaveBeenCalledWith("vehicle-photos");
    expect(upload).toHaveBeenCalledWith(relativePath, bytes, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    expect(stored.storage).toBe("supabase");
    expect(stored.url).toContain(`/vehicle-photos/${relativePath}`);
    expect(relativePath).toMatch(/^unidades-chile\/hilux\/[a-f0-9]{64}\.jpg$/);

    await storeMediaFile({ bytes, relativePath });
    expect(getBucket).toHaveBeenCalledTimes(1);
  });
});
