import { MetadataRoute } from "next";
import { getVehicles } from "@/lib/server/vehiclesStore";
import { vehicles as fallbackVehicles } from "@/lib/vehicles";
import { isPublicCatalogVehicle } from "@/lib/vehicles/publicCatalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.rgmotorschile.cl";
  const allVehicles = await getVehicles().catch(() => fallbackVehicles);

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/catalogo`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/consigna`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/comparador`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contacto`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  const vehicleRoutes: MetadataRoute.Sitemap = allVehicles
    .filter(isPublicCatalogVehicle)
    .map((v) => ({
      url: `${baseUrl}/vehiculo/${v.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  return [...staticRoutes, ...vehicleRoutes];
}
