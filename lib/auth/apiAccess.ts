/**
 * Política de acceso a APIs: allowlist explícita de {ruta, métodos}.
 * Todo lo no listado exige sesión admin en el middleware.
 */

export const PII_LIST_PREFIXES = [
  "/api/car-requests",
  "/api/test-drives",
  "/api/price-alerts",
  "/api/trade-in",
  "/api/credits",
  "/api/reservations",
  "/api/contact",
  "/api/track",
  "/api/simulations",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname === p || pathname.startsWith(`${p}/`);
}

type PublicRule = {
  methods: ReadonlySet<string>;
  match: (pathname: string, searchParams?: URLSearchParams | null) => boolean;
};

/** Solo POST crea leads / sesión. */
const LEAD_POST_PREFIXES = [
  "/api/car-requests",
  "/api/test-drives",
  "/api/price-alerts",
  "/api/trade-in",
  "/api/contact",
  "/api/credits",
  "/api/reservations",
  "/api/track",
  "/api/simulations",
] as const;

const PUBLIC_GET_PREFIXES = [
  "/api/vehicles",
  "/api/spin",
  "/api/settings",
  "/api/photos",
  "/api/catalog",
  "/api/health",
] as const;

const PUBLIC_RULES: PublicRule[] = [
  {
    methods: new Set(["GET", "POST"]),
    match: (p) => p.startsWith("/api/cron/"),
  },
  {
    methods: new Set(["GET", "POST"]),
    match: (p) => p.startsWith("/api/webhooks/inventory-sync"),
  },
  {
    methods: new Set(["POST", "GET"]),
    match: (p) => matchesPrefix(p, "/api/auth"),
  },
  {
    methods: new Set(["POST"]),
    match: (p) => LEAD_POST_PREFIXES.some((prefix) => matchesPrefix(p, prefix)),
  },
  {
    methods: new Set(["GET"]),
    match: (p, searchParams) => {
      if (!PUBLIC_GET_PREFIXES.some((prefix) => matchesPrefix(p, prefix))) {
        return false;
      }
      // Vista admin del catálogo
      if (
        matchesPrefix(p, "/api/vehicles") &&
        searchParams?.get("admin") === "true"
      ) {
        return false;
      }
      return true;
    },
  },
];

/**
 * @returns true si la petición puede pasar sin cookie de admin.
 */
export function isPublicApi(
  pathname: string,
  method: string,
  searchParams?: URLSearchParams | null,
): boolean {
  const m = method.toUpperCase();
  return PUBLIC_RULES.some(
    (rule) => rule.methods.has(m) && rule.match(pathname, searchParams),
  );
}
