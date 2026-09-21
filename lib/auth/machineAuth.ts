/**
 * Auth máquina (cron / webhooks): Bearer o header dedicado, comparación en tiempo constante.
 */
import { timingSafeEqualString } from "@/lib/auth/session";

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL === "1")
  );
}

/** Rutas autenticadas por secreto (no por cookie admin). */
export function isMachineAuthPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/webhooks/")
  );
}

/**
 * Extrae el secreto presentado (Bearer o headers opcionales).
 */
function presentedSecrets(
  req: Request,
  extraHeaderNames: string[] = [],
): string[] {
  const out: string[] = [];
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer) out.push(bearer);
  }
  for (const name of extraHeaderNames) {
    const v = req.headers.get(name)?.trim();
    if (v) out.push(v);
  }
  return out;
}

/**
 * Autoriza con uno de los secretos de entorno (≥16 chars).
 * En producción sin secreto válido → false.
 * En desarrollo sin secreto → true (con warning).
 */
export function authorizeMachineSecret(
  req: Request,
  envSecretNames: string[],
  opts?: {
    extraHeaderNames?: string[];
    /** También aceptar ?secret= (solo no-prod salvo allowQueryInProd). */
    allowQuerySecret?: boolean;
    allowQueryInProd?: boolean;
    searchParams?: URLSearchParams | null;
    logLabel?: string;
  },
): boolean {
  const candidates = envSecretNames
    .map((name) => process.env[name]?.trim())
    .filter((s): s is string => Boolean(s && s.length >= 16));

  const isProd = isProductionRuntime();
  if (!candidates.length) {
    if (isProd) return false;
    console.warn(
      `[${opts?.logLabel || "MachineAuth"}] Sin secreto — permitido solo en desarrollo.`,
    );
    return true;
  }

  const presented = presentedSecrets(req, opts?.extraHeaderNames);
  if (opts?.allowQuerySecret) {
    const allowQ = !isProd || opts.allowQueryInProd === true;
    if (allowQ) {
      const q = opts.searchParams?.get("secret")?.trim();
      if (q) presented.push(q);
    }
  }

  return presented.some((got) =>
    candidates.some((expected) => timingSafeEqualString(got, expected)),
  );
}
