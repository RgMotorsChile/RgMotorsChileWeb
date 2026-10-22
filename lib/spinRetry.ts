/** Errores del pool de Supabase o de la red, para reintentar una firma o una subida. */
export function isRetryableSpinFailure(status: number | undefined, message: string): boolean {
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  return /too many connections|too many clients|remaining connection slots|connection terminated|econnreset|eai_again/i.test(
    message,
  );
}

export function spinRetryDelayMs(attempt: number, baseMs: number): number {
  if (baseMs <= 0) return 0;
  return baseMs * 2 ** Math.max(0, attempt - 1);
}
