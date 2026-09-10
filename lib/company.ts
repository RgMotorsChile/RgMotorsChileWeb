/**
 * Datos de contacto oficiales de RG Motors Chile.
 * RUT de empresa: no se publica (dejar vacío a propósito).
 */
export const COMPANY = {
  name: "RG Motors",
  /** Razón social / nombre comercial para legales y footer */
  legalName:
    process.env.COMPANY_LEGAL_NAME?.trim() || "RG Motors Chile",
  /** Intencionalmente vacío: no se muestra RUT en el sitio. */
  rut: "",
  tagline: "Autos usados seleccionados en Puerto Montt",
  phoneDisplay: "+56 9 5907 3127",
  /** Solo dígitos, formato internacional sin + */
  whatsapp: "56959073127",
  email: process.env.COMPANY_EMAIL?.trim() || "administracion@rgmotorschile.cl",
  address: "Av. El Tepual (Ex Banco de Chile), Puerto Montt",
  addressShort: "Av. El Tepual, Puerto Montt",
  region: "Región de Los Lagos, Chile",
  /** Sucursal única oficial (showroom / pruebas de manejo) */
  branchName: "Showroom Av. El Tepual",
  hours: "Lun a Jue 9:00–19:00 · Vie 9:00–18:00 · Sáb 10:00–13:00",
  website: "www.rgmotorschile.cl",
  instagram: "https://www.instagram.com/_rgmotors/",
  facebook: "https://www.facebook.com/automotoraga?locale=es_LA",
  facebookLabel: "Facebook oficial RG Motors",
};

/**
 * Canal concesionario Autofin (simulador oficial).
 * Las cuotas de este portal son las mismas que se usan en sucursal.
 */
export const AUTOFIN_PARTNER = {
  cesId: "C891S89101",
  name: "Autofin",
  simulatorBaseUrl: "https://solicitatufinanciamiento.autofin.cl/",
};

/** URL del simulador oficial Autofin para RG Motors. */
export function autofinSimulatorUrl(extraParams?: Record<string, string>): string {
  const url = new URL(AUTOFIN_PARTNER.simulatorBaseUrl);
  url.searchParams.set("ces_id", AUTOFIN_PARTNER.cesId);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/** Link de WhatsApp con mensaje prearmado. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(message)}`;
}
