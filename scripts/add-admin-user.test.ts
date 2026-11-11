import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "add-admin-user.mjs");

describe("scripts/add-admin-user.mjs", () => {
  it("crea un usuario adicional, escribe la clave solo al archivo y no toca la cuenta primaria", () => {
    const dir = mkdtempSync(join(tmpdir(), "rg-admin-user-"));
    const dataDir = join(dir, "data");
    const output = join(dir, "acceso.txt");
    const primary = {
      username: "rg.mathias",
      passwordHash: "00:deadbeef",
      mustChangePassword: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "admin-credentials.json"), JSON.stringify(primary), "utf8");

    const stdout = execFileSync(
      process.execPath,
      [SCRIPT, "rg.fernando", output, "--local", "--data-dir", dataDir],
      { encoding: "utf8", cwd: ROOT },
    );

    expect(stdout).toContain("Usuario listo: rg.fernando");
    expect(stdout).toContain(output);
    expect(stdout.toLowerCase()).not.toMatch(/contraseña temporal:/);
    expect(stdout).not.toMatch(/RgMotors#/);

    const file = readFileSync(output, "utf8");
    expect(file).toContain("Usuario: rg.fernando");
    expect(file).toMatch(/Contraseña temporal: /);
    expect(file).toContain("Debes cambiar la contraseña en el primer ingreso.");

    const extras = JSON.parse(readFileSync(join(dataDir, "admin-users.json"), "utf8"));
    expect(extras.users).toHaveLength(1);
    expect(extras.users[0].username).toBe("rg.fernando");
    expect(extras.users[0].mustChangePassword).toBe(true);
    expect(extras.users[0].role).toBe("admin");
    expect(extras.users[0].passwordHash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);

    const primaryAfter = JSON.parse(readFileSync(join(dataDir, "admin-credentials.json"), "utf8"));
    expect(primaryAfter).toEqual(primary);
    expect(existsSync(join(dataDir, "admin-credentials.json"))).toBe(true);
  });

  it("rechaza usar el nombre de la cuenta primaria y no escribe almacén ni archivo", () => {
    const dir = mkdtempSync(join(tmpdir(), "rg-admin-user-"));
    const dataDir = join(dir, "data");
    const output = join(dir, "acceso.txt");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "admin-credentials.json"),
      JSON.stringify({
        username: "rg.mathias",
        passwordHash: "00:deadbeef",
        mustChangePassword: false,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      "utf8",
    );

    let failed = false;
    try {
      execFileSync(
        process.execPath,
        [SCRIPT, "rg.mathias", output, "--local", "--data-dir", dataDir],
        { encoding: "utf8", cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err) {
      failed = true;
      const message = String((err as { stderr?: string }).stderr || "");
      expect(message).toMatch(/cuenta primaria/i);
    }
    expect(failed).toBe(true);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(join(dataDir, "admin-users.json"))).toBe(false);
  });
});
