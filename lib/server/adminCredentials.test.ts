import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, scryptSync } from "node:crypto";

const store = vi.hoisted(() => ({ data: new Map<string, unknown>() }));
const isVercelProduction = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/lib/server/db", () => ({
  readJsonOptional: async (filename: string) =>
    store.data.has(filename) ? store.data.get(filename) : null,
  writeJson: async (filename: string, data: unknown) => {
    store.data.set(filename, JSON.parse(JSON.stringify(data)));
    return true;
  },
}));

vi.mock("@/lib/server/storageHealth", () => ({
  isVercelProduction,
}));

import {
  ADDITIONAL_USERS_FILENAME,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  PRIMARY_CREDENTIALS_FILENAME,
  changeAdminCredentials,
  upsertAdditionalAdminUser,
  validateAdminLogin,
  validateStrongPassword,
  validateStrongUsername,
} from "@/lib/server/adminCredentials";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function seedPrimary(username: string, password: string, mustChangePassword = false) {
  store.data.set(PRIMARY_CREDENTIALS_FILENAME, {
    username,
    passwordHash: hashPassword(password),
    mustChangePassword,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("validateStrongPassword", () => {
  it("acepta una contraseña fuerte", () => {
    expect(validateStrongPassword("RgMotors#2026!")).toBeNull();
  });

  it("rechaza cortas, sin mayúscula, sin número o sin símbolo", () => {
    expect(validateStrongPassword("corta")).not.toBeNull();
    expect(validateStrongPassword("solominusculas1!")).not.toBeNull();
    expect(validateStrongPassword("SOLOMAYUSCULAS1!")).not.toBeNull();
    expect(validateStrongPassword("SinNumeros!!")).not.toBeNull();
    expect(validateStrongPassword("SinSimbolo12")).not.toBeNull();
  });

  it("rechaza reutilizar la contraseña por defecto", () => {
    expect(validateStrongPassword(DEFAULT_ADMIN_PASSWORD)).not.toBeNull();
  });
});

describe("validateStrongUsername", () => {
  it("acepta usuarios válidos distintos al default", () => {
    expect(validateStrongUsername("mathias.rg")).toBeNull();
  });

  it("rechaza usuarios cortos o con caracteres inválidos", () => {
    expect(validateStrongUsername("ab")).not.toBeNull();
    expect(validateStrongUsername("user name")).not.toBeNull();
  });

  it("rechaza el usuario por defecto salvo override de env", () => {
    expect(validateStrongUsername(DEFAULT_ADMIN_USERNAME)).not.toBeNull();
  });
});

describe("multi-admin login y cambio de clave", () => {
  beforeEach(() => {
    store.data.clear();
    isVercelProduction.mockReturnValue(false);
  });

  it("sigue autenticando la cuenta primaria sin tocar su registro", async () => {
    seedPrimary("rg.mathias", "Primary#Pass12");
    const before = JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME));

    const ok = await validateAdminLogin("rg.mathias", "Primary#Pass12");
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.username).toBe("rg.mathias");
      expect(ok.source).toBe("primary");
      expect(ok.mustChange).toBe(false);
      expect(ok.role).toBe("admin");
    }
    expect(JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME))).toBe(before);
  });

  it("rechaza la contraseña incorrecta de la cuenta primaria", async () => {
    seedPrimary("rg.mathias", "Primary#Pass12");
    const result = await validateAdminLogin("rg.mathias", "Wrong#Pass12");
    expect(result.ok).toBe(false);
  });

  it("autentica un usuario adicional sin modificar la cuenta primaria", async () => {
    seedPrimary("rg.mathias", "Primary#Pass12");
    const before = JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME));

    const created = await upsertAdditionalAdminUser("rg.fernando", "Temp#Pass129", {
      mustChangePassword: true,
      role: "admin",
    });
    expect(created).toEqual({ ok: true, username: "rg.fernando" });
    expect(JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME))).toBe(before);
    expect(store.data.has(ADDITIONAL_USERS_FILENAME)).toBe(true);

    const login = await validateAdminLogin("rg.fernando", "Temp#Pass129");
    expect(login.ok).toBe(true);
    if (login.ok) {
      expect(login.source).toBe("additional");
      expect(login.mustChange).toBe(true);
      expect(login.role).toBe("admin");
      expect(login.username).toBe("rg.fernando");
    }
    expect(JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME))).toBe(before);

    const primaryStill = await validateAdminLogin("rg.mathias", "Primary#Pass12");
    expect(primaryStill.ok).toBe(true);
  });

  it("no permite crear un usuario adicional con el nombre de la cuenta primaria", async () => {
    seedPrimary("rg.mathias", "Primary#Pass12");
    const before = JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME));
    const result = await upsertAdditionalAdminUser("RG.mathias", "Temp#Pass129");
    expect(result.ok).toBe(false);
    expect(store.data.has(ADDITIONAL_USERS_FILENAME)).toBe(false);
    expect(JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME))).toBe(before);
  });

  it("al cambiar la clave de un adicional no modifica el registro primario", async () => {
    seedPrimary("rg.mathias", "Primary#Pass12");
    await upsertAdditionalAdminUser("rg.fernando", "Temp#Pass129", {
      mustChangePassword: true,
    });
    const before = JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME));

    const changed = await changeAdminCredentials(
      "rg.fernando",
      "Temp#Pass129",
      "rg.fernando",
      "New#Fernando1",
    );
    expect(changed).toEqual({ ok: true });
    expect(JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME))).toBe(before);

    const oldLogin = await validateAdminLogin("rg.fernando", "Temp#Pass129");
    expect(oldLogin.ok).toBe(false);
    const newLogin = await validateAdminLogin("rg.fernando", "New#Fernando1");
    expect(newLogin.ok).toBe(true);
    if (newLogin.ok) expect(newLogin.mustChange).toBe(false);
    expect((await validateAdminLogin("rg.mathias", "Primary#Pass12")).ok).toBe(true);
  });

  it("al cambiar la clave primaria no toca el almacén adicional", async () => {
    seedPrimary("rg.mathias", "Primary#Pass12");
    await upsertAdditionalAdminUser("rg.fernando", "Temp#Pass129");
    const extrasBefore = JSON.stringify(store.data.get(ADDITIONAL_USERS_FILENAME));

    const changed = await changeAdminCredentials(
      "rg.mathias",
      "Primary#Pass12",
      "rg.mathias",
      "Primary#Pass99",
    );
    expect(changed).toEqual({ ok: true });
    expect(JSON.stringify(store.data.get(ADDITIONAL_USERS_FILENAME))).toBe(extrasBefore);
    expect((await validateAdminLogin("rg.mathias", "Primary#Pass99")).ok).toBe(true);
    expect((await validateAdminLogin("rg.fernando", "Temp#Pass129")).ok).toBe(true);
  });

  it("un usuario adicional no puede tomar el nombre de la cuenta primaria", async () => {
    seedPrimary("rg.mathias", "Primary#Pass12");
    await upsertAdditionalAdminUser("rg.fernando", "Temp#Pass129");
    const before = JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME));

    const changed = await changeAdminCredentials(
      "rg.fernando",
      "Temp#Pass129",
      "rg.mathias",
      "New#Fernando1",
    );
    expect(changed.ok).toBe(false);
    expect(JSON.stringify(store.data.get(PRIMARY_CREDENTIALS_FILENAME))).toBe(before);
    expect((await validateAdminLogin("rg.fernando", "Temp#Pass129")).ok).toBe(true);
  });
});
