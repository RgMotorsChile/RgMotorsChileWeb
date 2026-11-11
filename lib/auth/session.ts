/**
 * Sesiones firmadas compatibles con Edge Middleware (Web Crypto).
 */

const encoder = new TextEncoder();

function getSecret(): string | null {
  const fromEnv = process.env.ADMIN_SESSION_SECRET?.trim();
  const isProd =
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL === "1");

  if (isProd) {
    if (!fromEnv || fromEnv.length < 32) return null;
    if (/change-me|rgmotors-dev/i.test(fromEnv)) return null;
    return fromEnv;
  }

  return (
    fromEnv ||
    process.env.ADMIN_PASSWORD ||
    "rgmotors-dev-session-secret-change-me"
  );
}

/** Comparación en tiempo constante para firmas base64url. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= ca ^ cb;
  }
  return mismatch === 0;
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bufferToBase64Url(sig);
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToJson<T>(value: string): T | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return JSON.parse(atob(padded + pad)) as T;
  } catch {
    return null;
  }
}

function jsonToBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type AdminSessionPayload = {
  sub: string;
  mustChange: boolean;
  iat: number;
  exp: number;
  role?: "admin";
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días
export { SESSION_TTL_SECONDS };

export async function createAdminSessionToken(
  username: string,
  mustChange: boolean,
  role: "admin" = "admin",
): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET debe tener al menos 32 caracteres en producción.",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    sub: username,
    mustChange,
    role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const body = jsonToBase64Url(payload);
  const signature = await hmac(body, secret);
  return `${body}.${signature}`;
}

export async function verifyAdminSessionToken(
  token: string | undefined | null,
): Promise<AdminSessionPayload | null> {
  const secret = getSecret();
  if (!secret) return null;
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(body, secret);
  if (!timingSafeEqualString(expected, signature)) return null;
  const payload = base64UrlToJson<AdminSessionPayload>(body);
  if (!payload?.sub || !payload.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export const ADMIN_SESSION_COOKIE = "rgmotors_session";
