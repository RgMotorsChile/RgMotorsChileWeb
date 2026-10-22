import { asset } from "@/lib/asset";
import type { Vehicle } from "@/lib/vehicles";
import { isKnownSpec } from "@/lib/vehicles/publicSpecs";
import { pathHasPlate, plateToken, publicVehicleSlug, scrubPlate } from "@/lib/vehicles/publicSlug";
import { websiteJsonLd } from "@/lib/seo/dealerJsonLd";
import { SITE_ORIGIN, vehicleHeadline } from "@/lib/seo/vehicleMeta";

function absoluteImage(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const resolved = asset(src);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  return `${SITE_ORIGIN}${resolved.startsWith("/") ? "" : "/"}${resolved}`;
}

function availability(status: Vehicle["status"]): string {
  if (status === "Vendido") return "https://schema.org/OutOfStock";
  if (status === "En reserva") return "https://schema.org/LimitedAvailability";
  return "https://schema.org/InStock";
}

export function vehicleJsonLd(vehicle: Vehicle) {
  const name = vehicleHeadline(vehicle);
  const slug = publicVehicleSlug(vehicle);
  const url = `${SITE_ORIGIN}/vehiculo/${slug}`;
  const plate = plateToken(vehicle);
  const image = absoluteImage(vehicle.image);
  const imageHidesPlate =
    !image ||
    (!pathHasPlate(image) && !(plate && image.toLowerCase().includes(plate)));
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url,
    priceCurrency: "CLP",
    price: String(vehicle.price),
    availability: availability(vehicle.status),
    itemCondition: "https://schema.org/UsedCondition",
  };

  const car: Record<string, unknown> = {
    "@type": "Car",
    name: scrubPlate(name, vehicle.plate),
    url,
    brand: { "@type": "Brand", name: vehicle.brand },
    model: scrubPlate(vehicle.model, vehicle.plate),
    vehicleModelDate: String(vehicle.year),
    itemCondition: "https://schema.org/UsedCondition",
    offers: offer,
  };
  if (image && imageHidesPlate) car.image = image;
  if (isKnownSpec(vehicle.km)) {
    car.mileageFromOdometer = {
      "@type": "QuantitativeValue",
      value: vehicle.km,
      unitCode: "KMT",
    };
  }
  if (isKnownSpec(vehicle.fuel)) car.fuelType = vehicle.fuel;
  if (isKnownSpec(vehicle.transmission)) car.vehicleTransmission = vehicle.transmission;
  if (isKnownSpec(vehicle.traction)) car.driveWheelConfiguration = vehicle.traction;

  return {
    "@context": "https://schema.org",
    "@graph": [
      car,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Catálogo", item: `${SITE_ORIGIN}/catalogo` },
          { "@type": "ListItem", position: 3, name, item: url },
        ],
      },
      websiteJsonLd(),
    ],
  };
}
