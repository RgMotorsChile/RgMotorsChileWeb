/**
 * Formato de precios sin el seed de lib/vehicles.ts: los componentes del sitio
 * público importan desde aquí para que el navegador no reciba el inventario
 * estático (con rutas de fotos) dentro del bundle.
 */
export function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}
