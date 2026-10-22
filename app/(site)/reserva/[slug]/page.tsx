import { redirect } from "next/navigation";
import { getVehicleBySlug } from "@/lib/server/vehiclesStore";
import { publishesOnRg } from "@/lib/vehicles/branch";
import { publicVehicleSlug } from "@/lib/vehicles/publicSlug";

export const dynamic = "force-dynamic";

export default async function ReservaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const v = await getVehicleBySlug(slug);
  if (!v || !publishesOnRg(v)) {
    redirect("/catalogo");
  }
  redirect(`/vehiculo/${publicVehicleSlug(v)}`);
}
