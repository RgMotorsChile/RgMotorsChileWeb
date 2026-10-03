import { COMPANY } from "@/lib/company";

/** Marca para los correos de leads (logo PNG absoluto: Gmail/Outlook no muestran SVG). */
export const RG_EMAIL_BRAND = {
  name: COMPANY.name,
  site: `https://${COMPANY.website}`,
  siteLabel: COMPANY.website.replace(/^www\./, ""),
  logoUrl: `https://${COMPANY.website}/email/rg-logo.png`,
  logoWidth: 260,
  logoHeight: 84,
  headerBg: "#0B1E40",
  accent: "#173A79",
  stripe: "#E11D2E",
  accentText: "#ffffff",
  ink: "#111827",
  whatsapp: COMPANY.whatsapp,
  phoneDisplay: COMPANY.phoneDisplay,
  email: COMPANY.email,
  address: COMPANY.address,
  hours: COMPANY.hours,
};
