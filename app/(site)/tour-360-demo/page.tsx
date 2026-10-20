import type { Metadata } from "next";
import PhotoSpin360 from "@/components/PhotoSpin360";
import { asset } from "@/lib/asset";

/**
 * Página de prueba (no indexada) para revisar el Tour 360° antes de asociarlo
 * a un vehículo del catálogo. Patente cubierta en todas las fotos.
 */
export const metadata: Metadata = {
  title: "Tour 360° (prueba)",
  robots: { index: false, follow: false },
};

const COUNT = 72;
const n = (i: number) => String(i + 1).padStart(3, "0");
const frames = Array.from({ length: COUNT }, (_, i) => asset(`/cars/spin/demo-hilux-dx-roja/${n(i)}.webp`));
const hiFrames = Array.from({ length: COUNT }, (_, i) =>
  asset(`/cars/spin/demo-hilux-dx-roja/hi/${n(i)}.webp`),
);

export default function Tour360DemoPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold text-white">Tour 360° · Toyota Hilux DX (prueba)</h1>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl sm:aspect-[16/10]">
        <PhotoSpin360 frames={frames} hiFrames={hiFrames} frontIndex={0} className="absolute inset-0 h-full w-full" />
      </div>
    </main>
  );
}
