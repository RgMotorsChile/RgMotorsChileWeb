import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readJsonOptional, writeJson } from "@/lib/server/db";
import { isVercelProduction } from "@/lib/server/storageHealth";

const FILENAME = "admin-credentials.json";

export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "rgmotors2026";

type StoredCredentials = {
  username: string;
  /** scrypt hash: salt:hex */
  passwordHash: string;
  mustChangePassword: boolean;
  updatedAt: string;
};

function hashPassword(password: string, salt?: string): string {
  const realSalt = salt || randomBytes(16).toString("hex");
  const derived = scryptSync(password, realSalt, 64).toString("hex");
  return `${realSalt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

function defaultCredentials(): StoredCredentials {
  return {
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    mustChangePassword: true,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * En producción NO se re-siembra admin/rgmotors2026 si falta el JSON en KV
 * (evita reabrir la puerta por defecto tras pérdida de key).
 * Bootstrap explícito: ADMIN_ALLOW_DEFAULT_SEED=1 (solo una vez, luego quitar).
 */
export async function getAdminCredentials(): Promise<StoredCredentials> {
  const existing = await readJsonOptional<StoredCredentials>(FILENAME);
  if (existing?.username && existing?.passwordHash) {
    return existing;
  }

  const allowSeed =
    process.env.ADMIN_ALLOW_DEFAULT_SEED === "1" || !isVercelProduction();

  if (!allowSeed) {
    throw new Error(
      "Credenciales admin no inicializadas en KV. Definí ADMIN_ALLOW_DEFAULT_SEED=1, iniciá sesión, cambiá usuario/clave y eliminá el flag.",
    );
  }

  const defaults = defaultCredentials();
  const ok = await writeJson(FILENAME, defaults);
  if (!ok && isVercelProduction()) {
    throw new Error(
      "No se pudieron inicializar credenciales admin: KV obligatorio en producción.",
    );
  }
  return defaults;
}

export async function validateAdminLogin(
  username: string,
  password: string,
): Promise<{ ok: true; mustChange: boolean; username: string } | { ok: false }> {
  try {
    const creds = await getAdminCredentials();
    const userOk = username.trim().toLowerCase() === creds.username.toLowerCase();
    const passOk = verifyPassword(password, creds.passwordHash);
    if (!userOk || !passOk) return { ok: false };
    return {
      ok: true,
      mustChange: creds.mustChangePassword,
      username: creds.username,
    };
  } catch (err) {
    console.error("[AdminAuth] Credenciales no disponibles:", err);
    return { ok: false };
  }
}

/** Requisitos mínimos de contraseña fuerte. */
export function validateStrongPassword(password: string): string | null {
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (!/[A-Z]/.test(password)) return "Debe incluir al menos una mayúscula.";
  if (!/[a-z]/.test(password)) return "Debe incluir al menos una minúscula.";
  if (!/[0-9]/.test(password)) return "Debe incluir al menos un número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Debe incluir al menos un símbolo.";
  if (password === DEFAULT_ADMIN_PASSWORD) return "No puedes reutilizar la contraseña por defecto.";
  return null;
}

export function validateStrongUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 4) return "El usuario debe tener al menos 4 caracteres.";
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) return "Usuario: solo letras, números, punto, guion o guion bajo.";
  if (u.toLowerCase() === DEFAULT_ADMIN_USERNAME && process.env.ALLOW_DEFAULT_ADMIN_USER !== "1") {
    return "Elige un usuario distinto a \"admin\".";
  }
  return null;
}

export async function changeAdminCredentials(
  currentUsername: string,
  currentPassword: string,
  newUsername: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const login = await validateAdminLogin(currentUsername, currentPassword);
  if (!login.ok) return { ok: false, error: "Credenciales actuales incorrectas." };

  const userErr = validateStrongUsername(newUsername);
  if (userErr) return { ok: false, error: userErr };
  const passErr = validateStrongPassword(newPassword);
  if (passErr) return { ok: false, error: passErr };

  const next: StoredCredentials = {
    username: newUsername.trim(),
    passwordHash: hashPassword(newPassword),
    mustChangePassword: false,
    updatedAt: new Date().toISOString(),
  };
  const saved = await writeJson(FILENAME, next);
  if (!saved) {
    return {
      ok: false,
      error: "No se pudo guardar las credenciales (revisa KV en producción).",
    };
  }
  return { ok: true };
}

/** Fingerprint no reversible para logs. */
export function credentialFingerprint(username: string): string {
  return createHash("sha256").update(username.toLowerCase()).digest("hex").slice(0, 12);
}
