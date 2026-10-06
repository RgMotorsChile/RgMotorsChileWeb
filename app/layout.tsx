import type { Metadata, Viewport } from "next";
import { Manrope, Oswald } from "next/font/google";
import "./globals.css";
import TrafficTracker from "@/components/TrafficTracker";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/** Valor "content" de la meta google-site-verification (Search Console). */
const googleSiteVerification = process.env.NEXT_PUBLIC_GSC_VERIFICATION?.trim();

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.rgmotorschile.cl",
  ),
  title: "RG Motors — Vehículos Seleccionados en Puerto Montt",
  description:
    "Compra tu próximo auto o camioneta en Puerto Montt. Fotos reales de patio y atención en showroom.",
  keywords: [
    "autos usados",
    "camionetas 4x4",
    "vehículos seleccionados",
    "crédito automotriz",
    "RG Motors",
    "Puerto Montt",
    "Chile",
  ],
  ...(googleSiteVerification && {
    verification: { google: googleSiteVerification },
  }),
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "RG Motors — Vehículos Seleccionados en Puerto Montt",
    description:
      "Automotora en Puerto Montt. Catálogo con fotografías reales y atención en showroom.",
    type: "website",
    locale: "es_CL",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "RG Motors" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-CL" className={`${manrope.variable} ${oswald.variable}`}>
      <body>
        <TrafficTracker />
        {children}
      </body>
    </html>
  );
}
