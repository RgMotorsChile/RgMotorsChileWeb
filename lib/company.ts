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
  address: "Av. Cardonal (Ex Banco de Chile), Puerto Montt",
  addressShort: "Av. Cardonal, Puerto Montt",
  region: "Región de Los Lagos, Chile",
  /** Sucursal única oficial (showroom / pruebas de manejo) */
  branchName: "Showroom Av. Cardonal",
  hours: "Lun a Jue 9:00–19:00 · Vie 9:00–18:00 · Sáb 10:00–13:00",
  website: "www.rgmotorschile.cl",
  instagram: "https://www.instagram.com/_rgmotors/",
  facebook: "https://www.facebook.com/automotoraga?locale=es_LA",
  facebookLabel: "Facebook oficial RG Motors",
};

/** Link de WhatsApp con mensaje prearmado. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(message)}`;
}
