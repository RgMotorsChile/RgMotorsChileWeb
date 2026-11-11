/**
 * Agrega o actualiza UN usuario en el almacén adicional (admin-users.json).
 * Nunca escribe ni re-siembra admin-credentials.json.
 *
 *   node scripts/add-admin-user.mjs <username> <archivo-salida> [--local]
 *
 * --local  escribe solo en data/ (o --data-dir). Sin este flag exige Supabase.
 * La contraseña temporal se escribe SOLO en el archivo de salida, nunca a stdout.
 */
import fs from "fs";
import path from "path";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIMARY_FILENAME = "admin-credentials.json";
const USERS_FILENAME = "admin-users.json";
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "rgmotors2026";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) {
      const key = t.slice(0, i).trim();
      if (process.env[key]) continue;
      process.env[key] = t
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

function parseArgs(argv) {
  const args = argv.slice(2);
  let dataDir = path.join(ROOT, "data");
  let local = false;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--local") {
      local = true;
    } else if (a === "--data-dir") {
      const next = args[++i];
      if (!next || next.startsWith("--")) {
        throw new Error("Falta la ruta de --data-dir.");
      }
      dataDir = path.resolve(next);
    } else if (a.startsWith("--data-dir=")) {
      dataDir = path.resolve(a.slice("--data-dir=".length));
    } else if (a.startsWith("--")) {
      throw new Error(`Flag no reconocida: ${a}`);
    } else {
      positional.push(a);
    }
  }
  return {
    username: positional[0] || "",
    outputFile: positional[1] || "",
    local,
    dataDir,
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

function generatePassword() {
  const body = randomBytes(10).toString("hex");
  return `RgMotors#${body}9`;
}

function validateStrongPassword(password) {
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (!/[A-Z]/.test(password)) return "Debe incluir al menos una mayúscula.";
  if (!/[a-z]/.test(password)) return "Debe incluir al menos una minúscula.";
  if (!/[0-9]/.test(password)) return "Debe incluir al menos un número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Debe incluir al menos un símbolo.";
  if (password === DEFAULT_ADMIN_PASSWORD) return "No puedes reutilizar la contraseña por defecto.";
  return null;
}

function validateStrongUsername(username) {
  const u = username.trim();
  if (u.length < 4) return "El usuario debe tener al menos 4 caracteres.";
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) {
    return "Usuario: solo letras, números, punto, guion o guion bajo.";
  }
  if (u.toLowerCase() === DEFAULT_ADMIN_USERNAME && process.env.ALLOW_DEFAULT_ADMIN_USER !== "1") {
    return 'Elige un usuario distinto a "admin".';
  }
  return null;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readDocument(supabase, filename, dataDir) {
  if (supabase) {
    const { data, error } = await supabase
      .from("app_documents")
      .select("value")
      .eq("key", filename)
      .maybeSingle();
    if (error) throw new Error(`No se pudo leer ${filename}.`);
    if (data && data.value !== null && data.value !== undefined) return data.value;
  }
  return readJsonFile(path.join(dataDir, filename));
}

async function writeUsersDocument(supabase, dataDir, store, localOnly) {
  if (localOnly) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, USERS_FILENAME), JSON.stringify(store, null, 2), "utf8");
    return;
  }
  if (!supabase) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  const { error } = await supabase.from("app_documents").upsert(
    { key: USERS_FILENAME, value: store, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw new Error("No se pudo guardar admin-users.json en el almacén remoto.");
}

async function main() {
  const { username, outputFile, local, dataDir } = parseArgs(process.argv);
  if (!username || !outputFile) {
    console.error("Uso: node scripts/add-admin-user.mjs <username> <archivo-salida> [--local] [--data-dir <dir>]");
    process.exit(1);
  }

  const userErr = validateStrongUsername(username);
  if (userErr) {
    console.error(userErr);
    process.exit(1);
  }

  const password = generatePassword();
  const passErr = validateStrongPassword(password);
  if (passErr || !verifyPassword(password, hashPassword(password))) {
    console.error("No se pudo generar una contraseña válida.");
    process.exit(1);
  }

  const supabase = local ? null : getSupabase();
  if (!local && !supabase) {
    console.error("Faltan credenciales de Supabase. Usa --local para un almacén de desarrollo.");
    process.exit(1);
  }

  const primary = await readDocument(supabase, PRIMARY_FILENAME, dataDir);
  if (primary?.username && String(primary.username).toLowerCase() === username.trim().toLowerCase()) {
    console.error("Ese usuario es la cuenta primaria y no se modifica desde este script.");
    process.exit(1);
  }

  const existing = (await readDocument(supabase, USERS_FILENAME, dataDir)) || { users: [] };
  const users = Array.isArray(existing.users) ? existing.users : [];
  const record = {
    username: username.trim(),
    passwordHash: hashPassword(password),
    mustChangePassword: true,
    role: "admin",
    updatedAt: new Date().toISOString(),
  };
  const index = users.findIndex(
    (u) => String(u?.username || "").toLowerCase() === record.username.toLowerCase(),
  );
  const nextUsers = index >= 0 ? users.map((u, i) => (i === index ? record : u)) : [...users, record];

  await writeUsersDocument(supabase, dataDir, { users: nextUsers }, local);

  const dest = path.resolve(outputFile);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const body = [
    "Panel: https://www.rgmotorschile.cl/admin/login",
    `Usuario: ${record.username}`,
    `Contraseña temporal: ${password}`,
    "Debes cambiar la contraseña en el primer ingreso.",
    "",
  ].join("\n");
  fs.writeFileSync(dest, body, { encoding: "utf8", mode: 0o600 });

  console.log(`Usuario listo: ${record.username}`);
  console.log(`Contraseña escrita en: ${dest}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Error inesperado.");
  process.exit(1);
});
