/**
 * Catálogo PDF de RG Motors (cliente y servidor).
 * Imágenes SVG / rotas se omiten para no tumbar la generación.
 */
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  pdf,
  renderToBuffer,
} from "@react-pdf/renderer";
import { asset } from "@/lib/asset";
import {
  estimateMonthly,
  formatCLP,
  type Vehicle,
} from "@/lib/vehicles";

const C = {
  bg: "#090909",
  panel: "#111315",
  card: "#181A1F",
  border: "#323842",
  brand: "#006CFF",
  brandLight: "#2D8CFF",
  brandGlow: "#49A7FF",
  white: "#F8F9FB",
  muted: "#8A9099",
  soft: "#B8BDC7",
  green: "#22C55E",
};

const s = StyleSheet.create({
  cover: { backgroundColor: C.bg, color: C.white, padding: 0 },
  coverTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: C.brand,
  },
  coverBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: C.brand,
  },
  coverInner: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 48,
  },
  coverLogo: { width: 220, marginBottom: 28 },
  coverEyebrow: {
    fontSize: 10,
    color: C.brandGlow,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: C.white,
    marginBottom: 10,
    textAlign: "center",
  },
  coverSub: {
    fontSize: 11,
    color: C.muted,
    textAlign: "center",
    maxWidth: 380,
    lineHeight: 1.5,
    marginBottom: 28,
  },
  coverMetaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  coverChip: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 9,
    color: C.soft,
  },
  coverFoot: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    textAlign: "center",
    color: C.muted,
    fontSize: 9,
  },
  coverTrust: {
    marginTop: 36,
    flexDirection: "row",
    gap: 18,
    justifyContent: "center",
  },
  coverTrustItem: { fontSize: 8, color: C.soft },
  page: {
    backgroundColor: C.bg,
    color: C.white,
    paddingTop: 22,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLogo: { width: 88 },
  headerRight: { fontSize: 8, color: C.muted },
  brandLine: {
    fontSize: 9,
    color: C.brandGlow,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  title: { fontSize: 22, fontWeight: 700, color: C.white, marginBottom: 2 },
  version: { fontSize: 10, color: C.muted, marginBottom: 12 },
  heroWrap: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: C.panel,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  /** contain = auto completo visible; cover cortaba frente/ruedas */
  hero: {
    width: "100%",
    height: 300,
    objectFit: "contain",
  },
  heroPlaceholder: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: C.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholderText: { fontSize: 11, color: C.muted },
  body: { flexDirection: "row", gap: 12 },
  left: { flex: 1.15 },
  right: { flex: 0.85 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: C.white,
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  specGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: C.card,
  },
  specCell: {
    width: "50%",
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  specLabel: { fontSize: 7.5, color: C.muted, marginBottom: 2 },
  specValue: { fontSize: 9, color: C.white, fontWeight: 700 },
  priceBox: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  priceLabel: { fontSize: 8, color: C.muted, marginBottom: 3 },
  price: { fontSize: 18, fontWeight: 700, color: C.brandGlow, marginBottom: 2 },
  monthly: { fontSize: 9, color: C.soft, marginBottom: 8 },
  badgeRow: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  badge: {
    backgroundColor: "rgba(0,108,255,0.15)",
    color: C.brandGlow,
    fontSize: 7.5,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  badgeFeat: {
    backgroundColor: C.brand,
    color: C.white,
    fontSize: 7.5,
    fontWeight: 700,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  highlights: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 10,
  },
  hlItem: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 5,
    alignItems: "flex-start",
  },
  hlDot: { color: C.green, fontSize: 9 },
  hlText: { color: C.soft, fontSize: 8, flex: 1, lineHeight: 1.35 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
    fontSize: 8,
    color: C.muted,
  },
});

export type CatalogPdfMeta = {
  generatedAt: string;
  count: number;
  filterSummary: string;
  origin?: string;
};

/** Rutas/hosts seguros para embeber en @react-pdf (anti-SSRF). */
const PDF_ALLOWED_HOST_SUFFIXES = [
  "blob.vercel-storage.com",
  "public.blob.vercel-storage.com",
  "lh3.googleusercontent.com",
  "drive.google.com",
  "googleusercontent.com",
  "rgmotorschile.cl",
] as const;

function isPdfAllowedRemoteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    return PDF_ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

/** Rutas que @react-pdf no puede embeber (SVG, etc.). */
export function isPdfSafeImagePath(path: string | undefined | null): boolean {
  if (!path) return false;
  if (/^data:image\/(jpeg|jpg|png|webp)/i.test(path)) return true;
  if (/\.svg(\?|$)/i.test(path)) return false;
  if (/placeholder/i.test(path)) return false;
  if (/^https?:\/\//i.test(path)) {
    return isPdfAllowedRemoteUrl(path);
  }
  return /\.(jpe?g|png|webp)(\?|$)/i.test(path);
}

function absUrl(origin: string | undefined, path: string): string | undefined {
  if (/^data:/i.test(path)) return path;
  if (/^https?:\/\//i.test(path)) {
    return isPdfAllowedRemoteUrl(path) ? path : undefined;
  }
  const resolved = asset(path);
  return origin ? `${origin}${resolved}` : resolved;
}

function safeText(value: unknown, fallback = "—") {
  if (value == null || value === "") return fallback;
  return String(value);
}

function pdfSpecs(v: Vehicle) {
  return [
    { label: "Motor", value: safeText(v.engine) },
    { label: "Potencia", value: safeText(v.power) },
    { label: "Transmisión", value: safeText(v.transmission) },
    { label: "Tracción", value: safeText(v.traction) },
    { label: "Combustible", value: safeText(v.fuel) },
    { label: "Puertas", value: v.doors != null ? String(v.doors) : "—" },
    { label: "Kilometraje", value: `${(v.km ?? 0).toLocaleString("es-CL")} km` },
    { label: "Carrocería", value: safeText(v.bodyType) },
  ];
}

function VehiclePage({
  v,
  meta,
  index,
  total,
  logo,
  heroSrc,
}: {
  v: Vehicle;
  meta: CatalogPdfMeta;
  index: number;
  total: number;
  logo?: string;
  heroSrc?: string;
}) {
  const specs = pdfSpecs(v);
  const monthly = estimateMonthly(v.price || 0);

  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        {logo ? <Image style={s.headerLogo} src={logo} /> : <Text style={s.headerRight}>RG Motors</Text>}
        <Text style={s.headerRight}>
          Vehículo {index + 1} de {total} · {meta.generatedAt}
        </Text>
      </View>

      <Text style={s.brandLine}>{safeText(v.brand)}</Text>
      <Text style={s.title}>
        {safeText(v.model)} {safeText(v.year)}
      </Text>
      <Text style={s.version}>
        {safeText(v.version)} · {safeText(v.location)}
      </Text>

      {heroSrc ? (
        <View style={s.heroWrap}>
          <Image style={s.hero} src={heroSrc} />
        </View>
      ) : (
        <View style={s.heroPlaceholder}>
          <Text style={s.heroPlaceholderText}>Fotografías en preparación</Text>
        </View>
      )}

      <View style={s.body}>
        <View style={s.left}>
          <Text style={s.sectionTitle}>Ficha técnica</Text>
          <View style={s.specGrid}>
            {specs.map((sp) => (
              <View key={sp.label} style={s.specCell}>
                <Text style={s.specLabel}>{sp.label}</Text>
                <Text style={s.specValue}>{sp.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.right}>
          <View style={s.priceBox}>
            <Text style={s.priceLabel}>Precio</Text>
            <Text style={s.price}>{formatCLP(v.price || 0)}</Text>
            <Text style={s.monthly}>
              o {formatCLP(monthly)}/mes (pie 20% · 48 cuotas)
            </Text>
            <View style={s.badgeRow}>
              {v.featured ? <Text style={s.badgeFeat}>Destacado</Text> : null}
              <Text style={s.badge}>Patio Puerto Montt</Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>Destacados</Text>
          <View style={s.highlights}>
            {(v.highlights?.length
              ? v.highlights
              : [
                  "Unidad del inventario actual RG Motors",
                  "Financiamiento Autofin referencial",
                  "Visita el showroom en Av. El Tepual",
                ]
            ).map((h: string) => (
              <View key={h} style={s.hlItem}>
                <Text style={s.hlDot}>✓</Text>
                <Text style={s.hlText}>{h}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={s.footer}>
        <Text>RG Motors — Puerto Montt · www.rgmotorschile.cl</Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `Página ${pageNumber} de ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

export type CatalogPdfImageMap = Record<string, string>;

export function CatalogPdfDoc({
  vehicles,
  meta,
  imageMap,
}: {
  vehicles: Vehicle[];
  meta: CatalogPdfMeta;
  /** slug → data URI o URL absoluta ya resuelta */
  imageMap?: CatalogPdfImageMap;
}) {
  const logoFromMap = imageMap?.["__logo__"];
  const logo = logoFromMap
    ? logoFromMap
    : isPdfSafeImagePath("/logo.png")
      ? absUrl(meta.origin, "/logo.png")
      : undefined;

  return (
    <Document title="Catálogo RG Motors" author="RG Motors">
      <Page size="A4" style={s.cover}>
        <View style={s.coverTopBar} />
        <View style={s.coverInner}>
          {logo ? <Image style={s.coverLogo} src={logo} /> : null}
          <Text style={s.coverEyebrow}>RG Motors</Text>
          <Text style={s.coverTitle}>Catálogo de vehículos</Text>
          <Text style={s.coverSub}>
            Stock actualizado del showroom en Puerto Montt. Cada página presenta
            un vehículo con foto de patio y ficha técnica referencial.
          </Text>
          <View style={s.coverMetaRow}>
            <Text style={s.coverChip}>{meta.count} vehículos</Text>
            <Text style={s.coverChip}>{meta.filterSummary}</Text>
            <Text style={s.coverChip}>{meta.generatedAt}</Text>
          </View>
          <View style={s.coverTrust}>
            <Text style={s.coverTrustItem}>✓ Fotos reales de patio</Text>
            <Text style={s.coverTrustItem}>✓ Crédito Autofin</Text>
            <Text style={s.coverTrustItem}>✓ Av. El Tepual</Text>
          </View>
        </View>
        <Text style={s.coverFoot}>
          RG Motors · Puerto Montt, Chile · www.rgmotorschile.cl
        </Text>
        <View style={s.coverBottomBar} />
      </Page>

      {vehicles.map((v, i) => {
        const mapped = imageMap?.[v.slug];
        const heroSrc =
          mapped ||
          (isPdfSafeImagePath(v.image) ? absUrl(meta.origin, v.image) : undefined);
        return (
          <VehiclePage
            key={v.slug}
            v={v}
            meta={meta}
            index={i}
            total={vehicles.length}
            logo={logo}
            heroSrc={heroSrc}
          />
        );
      })}
    </Document>
  );
}

export async function generateCatalogPdf(
  vehicles: Vehicle[],
  meta: CatalogPdfMeta,
  imageMap?: CatalogPdfImageMap,
): Promise<Blob> {
  return pdf(
    <CatalogPdfDoc vehicles={vehicles} meta={meta} imageMap={imageMap} />,
  ).toBlob();
}

/** Buffer Node (API / scripts). */
export async function generateCatalogPdfBuffer(
  vehicles: Vehicle[],
  meta: CatalogPdfMeta,
  imageMap?: CatalogPdfImageMap,
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <CatalogPdfDoc vehicles={vehicles} meta={meta} imageMap={imageMap} />,
  );
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
