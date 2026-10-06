"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/googleAnalytics";

type Props = {
  slug: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  bodyType?: string;
};

/** Evento GA4 `view_item` al abrir la ficha de un vehículo. */
export default function TrackVehicleView({ slug, brand, model, year, price, bodyType }: Props) {
  useEffect(() => {
    trackEvent("view_item", {
      currency: "CLP",
      value: price,
      items: [
        {
          item_id: slug,
          item_name: `${brand} ${model} ${year}`,
          item_brand: brand,
          item_category: bodyType,
          price,
        },
      ],
    });
  }, [slug, brand, model, year, price, bodyType]);

  return null;
}
