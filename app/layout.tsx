import type { Metadata, Viewport } from "next";
import { Manrope, Oswald } from "next/font/google";
import "./globals.css";
import TrafficTracker from "@/components/TrafficTracker";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

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
    "Compra tu próximo auto o camioneta en Puerto Montt. Fotos reales de patio y simulación de crédito Autofin referencial.",
  keywords: [
    "autos usados",
    "camionetas 4x4",
    "vehículos seleccionados",
    "crédito automotriz",
    "RG Motors",
    "Puerto Montt",
    "Chile",
  ],
  verification: {
    google: "z1N9PtHMM1li_Sl2q1YPE9bfWwGy8Sl44nxpp-EkV9w",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "RG Motors — Vehículos Seleccionados en Puerto Montt",
    description:
      "Automotora en Puerto Montt. Catálogo con fotografías reales e financiamiento Autofin referencial.",
    type: "website",
    locale: "es_CL",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "RG Motors" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
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
