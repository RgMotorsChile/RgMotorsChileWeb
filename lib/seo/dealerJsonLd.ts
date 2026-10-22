import { COMPANY } from "@/lib/company";
import { SITE_ORIGIN } from "@/lib/seo/vehicleMeta";

export function dealerJsonLd(hours: string) {
  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: COMPANY.name,
    url: `${SITE_ORIGIN}/`,
    telephone: "+56959073127",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Av. Cardonal (ex Banco de Chile)",
      addressLocality: "Puerto Montt",
      addressRegion: "Los Lagos",
      addressCountry: "CL",
    },
    openingHours: hours,
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    name: COMPANY.name,
    url: `${SITE_ORIGIN}/`,
    inLanguage: "es-CL",
  };
}
