import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readJsonOptional, writeJson } from "@/lib/server/db";
import { isVercelProduction } from "@/lib/server/storageHealth";

export const PRIMARY_CREDENTIALS_FILENAME = "admin-credentials.json";
export const ADDITIONAL_USERS_FILENAME = "admin-users.json";

const FILENAME = PRIMARY_CREDENTIALS_FILENAME;

export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "rgmotors2026";

export type AdminRole = "admin";

type StoredCredentials = {
  username: string;
  /** scrypt hash: salt:hex */
  passwordHash: string;
  mustChangePassword: boolean;
  updatedAt: string;
};

export type AdditionalAdminUser = {
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
  role: AdminRole;
  updatedAt: string;
};

export type AdditionalUsersStore = {
  users: AdditionalAdminUser[];
};

export type AdminLoginSuccess = {
  ok: true;
  mustChange: boolean;
  username: string;
  role: AdminRole;
  source: "primary" | "additional";
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

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
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

async function readPrimaryCredentials(): Promise<StoredCredentials | null> {
  const existing = await readJsonOptional<StoredCredentials>(PRIMARY_CREDENTIALS_FILENAME);
  if (existing?.username && existing?.passwordHash) return existing;
  return null;
}

async function readAdditionalUsers(): Promise<AdditionalAdminUser[]> {
  const store = await readJsonOptional<AdditionalUsersStore>(ADDITIONAL_USERS_FILENAME);
  if (!store || !Array.isArray(store.users)) return [];
  return store.users.filter((user) => Boolean(user?.username && user?.passwordHash));
}

export async function validateAdminLogin(
  username: string,
  password: string,
): Promise<AdminLoginSuccess | { ok: false }> {
  try {
    const creds = await getAdminCredentials();
    const userOk = username.trim().toLowerCase() === creds.username.toLowerCase();
    if (userOk) {
      const passOk = verifyPassword(password, creds.passwordHash);
      if (!passOk) return { ok: false };
      return {
        ok: true,
        mustChange: creds.mustChangePassword,
        username: creds.username,
        role: "admin",
        source: "primary",
      };
    }
  } catch (err) {
    console.error("[AdminAuth] Credenciales no disponibles:", err);
    // Si el registro primario no está disponible, se intenta el almacén adicional.
  }

  try {
    const users = await readAdditionalUsers();
    const match = users.find(
      (user) => normalizeUsername(user.username) === normalizeUsername(username),
    );
    if (!match) return { ok: false };
    if (!verifyPassword(password, match.passwordHash)) return { ok: false };
    return {
      ok: true,
      mustChange: match.mustChangePassword,
      username: match.username,
      role: match.role === "admin" ? match.role : "admin",
      source: "additional",
    };
  } catch (err) {
    console.error("[AdminAuth] Usuarios adicionales no disponibles:", err);
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

function usernameTakenByOther(
  nextNorm: string,
  currentNorm: string,
  primary: StoredCredentials | null,
  extras: AdditionalAdminUser[],
): boolean {
  if (primary && normalizeUsername(primary.username) === nextNorm && currentNorm !== normalizeUsername(primary.username)) {
    return true;
  }
  return extras.some(
    (user) =>
      normalizeUsername(user.username) === nextNorm &&
      normalizeUsername(user.username) !== currentNorm,
  );
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

  const nextUsername = newUsername.trim();
  const nextNorm = normalizeUsername(nextUsername);
  const currentNorm = normalizeUsername(login.username);

  const primary = await readPrimaryCredentials();
  const extras = await readAdditionalUsers();

  if (usernameTakenByOther(nextNorm, currentNorm, primary, extras)) {
    return { ok: false, error: "Ese usuario ya está en uso." };
  }

  const next: StoredCredentials = {
    username: nextUsername,
    passwordHash: hashPassword(newPassword),
    mustChangePassword: false,
    updatedAt: new Date().toISOString(),
  };

  if (login.source === "primary") {
    const saved = await writeJson(FILENAME, next);
    if (!saved) {
      return {
        ok: false,
        error: "No se pudo guardar las credenciales (revisa KV en producción).",
      };
    }
    return { ok: true };
  }

  const updated = extras.map((user) =>
    normalizeUsername(user.username) === currentNorm
      ? {
          ...user,
          username: nextUsername,
          passwordHash: next.passwordHash,
          mustChangePassword: false,
          updatedAt: next.updatedAt,
        }
      : user,
  );
  const saved = await writeJson(ADDITIONAL_USERS_FILENAME, { users: updated });
  if (!saved) {
    return {
      ok: false,
      error: "No se pudo guardar las credenciales (revisa KV en producción).",
    };
  }
  return { ok: true };
}

/**
 * Crea o actualiza UN usuario en el almacén adicional.
 * Nunca lee con siembra ni escribe admin-credentials.json.
 */
export async function upsertAdditionalAdminUser(
  username: string,
  password: string,
  options?: { mustChangePassword?: boolean; role?: AdminRole },
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const userErr = validateStrongUsername(username);
  if (userErr) return { ok: false, error: userErr };
  const passErr = validateStrongPassword(password);
  if (passErr) return { ok: false, error: passErr };

  const nextUsername = username.trim();
  const nextNorm = normalizeUsername(nextUsername);

  const primary = await readPrimaryCredentials();
  if (primary && normalizeUsername(primary.username) === nextNorm) {
    return {
      ok: false,
      error: "Ese usuario es la cuenta primaria y no se modifica desde este almacén.",
    };
  }

  const extras = await readAdditionalUsers();
  const record: AdditionalAdminUser = {
    username: nextUsername,
    passwordHash: hashPassword(password),
    mustChangePassword: options?.mustChangePassword ?? true,
    role: options?.role ?? "admin",
    updatedAt: new Date().toISOString(),
  };
  const index = extras.findIndex((user) => normalizeUsername(user.username) === nextNorm);
  const users = index >= 0 ? extras.map((user, i) => (i === index ? record : user)) : [...extras, record];
  const saved = await writeJson(ADDITIONAL_USERS_FILENAME, { users });
  if (!saved) return { ok: false, error: "No se pudo guardar el usuario adicional." };
  return { ok: true, username: nextUsername };
}

/** Fingerprint no reversible para logs. */
export function credentialFingerprint(username: string): string {
  return createHash("sha256").update(username.toLowerCase()).digest("hex").slice(0, 12);
}
