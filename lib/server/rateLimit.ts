/**
 * Rate limit: memoria local + KV distribuido cuando está configurado.
 */
import { kv } from "@vercel/kv";
import { isKvReady, isVercelProduction } from "@/lib/server/storageHealth";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Rate limit en memoria del proceso (fallback / local).
 */
export function rateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000,
): { ok: boolean; remaining: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (current.count >= limit) {
    return { ok: false, remaining: 0 };
  }
  current.count += 1;
  return { ok: true, remaining: limit - current.count };
}

export type RateLimitOptions = {
  /**
   * Si KV falla en producción, denegar (p. ej. login) en lugar de
   * multiplicar el cupo por instancia en memoria.
   */
  failClosed?: boolean;
};

/**
 * Preferido en APIs: usa Vercel KV/Upstash si hay credenciales (multi-instancia).
 */
export async function rateLimitAsync(
  key: string,
  limit = 20,
  windowMs = 60_000,
  opts?: RateLimitOptions,
): Promise<{ ok: boolean; remaining: number }> {
  if (isKvReady()) {
    try {
      const redisKey = `rl:${key}`;
      const count = await kv.incr(redisKey);
      if (count === 1) {
        await kv.expire(redisKey, Math.max(1, Math.ceil(windowMs / 1000)));
      }
      if (count > limit) {
        return { ok: false, remaining: 0 };
      }
      return { ok: true, remaining: Math.max(0, limit - count) };
    } catch (err) {
      console.warn("[rateLimit] KV falló:", err);
      if (opts?.failClosed && isVercelProduction()) {
        return { ok: false, remaining: 0 };
      }
    }
  } else if (opts?.failClosed && isVercelProduction()) {
    return { ok: false, remaining: 0 };
  }
  return rateLimit(key, limit, windowMs);
}

/**
 * IP del cliente detrás de Cloudflare/Vercel.
 * Preferir CF-Connecting-IP (fijado por Cloudflare); no confiar en XFF[0].
 */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Cloudflare/Vercel agregan el hop real al final.
    if (parts.length) return parts[parts.length - 1]!;
  }

  return "unknown";
}

export function clientKey(request: Request, prefix: string): string {
  return `${prefix}:${clientIp(request)}`;
}
