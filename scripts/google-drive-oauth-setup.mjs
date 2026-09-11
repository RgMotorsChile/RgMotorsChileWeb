/**
 * One-shot: obtiene GOOGLE_DRIVE_REFRESH_TOKEN con la cuenta que ve FOTOS RG/UNIDADES.
 *
 * Prerrequisitos:
 * 1. Google Cloud Console → habilitar "Google Drive API"
 * 2. Credenciales OAuth → tipo "Aplicación de escritorio"
 * 3. Tipo OAuth: "Aplicación de escritorio" (usa loopback http://127.0.0.1:PUERTO/)
 *
 * Uso:
 *   node scripts/google-drive-oauth-setup.mjs
 *
 * (Lee GOOGLE_DRIVE_CLIENT_ID / SECRET desde .env.local o el entorno.)
 * Abrí el link, iniciá sesión con la cuenta U (o la que tenga acceso),
 * y el refresh_token se guarda solo en .env.local.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
/** Desktop OAuth: Google exige loopback sin path custom (redirect_uri_mismatch si no). */
const REDIRECT_URI = "http://127.0.0.1:53682/";
const PORT = 53682;

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    if (process.env[key]) continue;
    process.env[key] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error(
    "Faltan GOOGLE_DRIVE_CLIENT_ID y/o GOOGLE_DRIVE_CLIENT_SECRET.\n" +
      "Creálos en Google Cloud → APIs y servicios → Credenciales → OAuth (Desktop).\n" +
      "Podés ponerlos en .env.local o exportarlos en la shell.",
  );
  process.exit(1);
}

function buildAuthUrl() {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  return u.toString();
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(json, null, 2));
  }
  return json;
}

function waitForCodeViaLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
        const code = url.searchParams.get("code");
        const err = url.searchParams.get("error");
        if (err) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>Error OAuth: ${err}</h1>`);
          server.close();
          reject(new Error(err));
          return;
        }
        if (!code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>Esperando código OAuth…</h1>");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<h1>OK</h1><p>Ya podés cerrar esta ventana y volver a Cursor.</p>",
        );
        server.close();
        resolve(code);
      } catch (e) {
        reject(e);
      }
    });
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Escuchando callback en ${REDIRECT_URI}`);
    });
    server.on("error", reject);
  });
}

async function waitForCodeViaPaste() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) =>
    new Promise((resolve) =>
      rl.question(q, (a) => resolve(String(a || "").trim())),
    );
  console.log(
    "\nSi el browser no redirige solo, copiá el parámetro ?code= de la URL final.",
  );
  const code = await ask("Pegá el authorization code: ");
  rl.close();
  return code;
}

async function main() {
  const url = buildAuthUrl();
  console.log("\n=== Google Drive OAuth setup (readonly) ===\n");
  console.log(
    "1) En Google Cloud, URI de redirección autorizado:\n   ",
    REDIRECT_URI,
  );
  console.log(
    "\n2) Se abrirá el navegador. Iniciá sesión con la cuenta que VE la carpeta de fotos.",
  );
  console.log("   Link de respaldo:\n");
  console.log(url);
  console.log("\nEsperando consentimiento…\n");

  try {
    const { exec } = await import("node:child_process");
    const openCmd =
      process.platform === "win32"
        ? `start "" "${url}"`
        : process.platform === "darwin"
          ? `open "${url}"`
          : `xdg-open "${url}"`;
    exec(openCmd);
  } catch {
    /* usuario abre el link a mano */
  }

  let code;
  try {
    code = await waitForCodeViaLocalServer();
  } catch (e) {
    console.warn("Servidor local falló:", e instanceof Error ? e.message : e);
    code = await waitForCodeViaPaste();
  }

  if (!code) {
    console.error("No se obtuvo código.");
    process.exit(1);
  }

  const tokens = await exchangeCode(code);
  if (!tokens.refresh_token) {
    console.error(
      "Google no devolvió refresh_token. Revocá el acceso de la app en " +
        "https://myaccount.google.com/permissions y reintentá (prompt=consent).",
    );
    console.log(JSON.stringify(tokens, null, 2));
    process.exit(1);
  }

  // Guardar en .env.local sin imprimir el token completo
  let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const upsert = (k, v) => {
    const re = new RegExp("^" + k + "=.*$", "m");
    const line = k + "=" + v;
    if (re.test(envText)) envText = envText.replace(re, line);
    else
      envText =
        (envText && !envText.endsWith("\n") ? envText + "\n" : envText) +
        line +
        "\n";
  };
  upsert("GOOGLE_DRIVE_CLIENT_ID", clientId);
  upsert("GOOGLE_DRIVE_CLIENT_SECRET", clientSecret);
  upsert("GOOGLE_DRIVE_REFRESH_TOKEN", tokens.refresh_token);
  upsert("DRIVE_PHOTOS_FOLDER_ID", "1etQDf-_InkLx8m4_AUMnc8xg2O_137St");
  fs.writeFileSync(envPath, envText);

  console.log("\nOK: refresh_token guardado en .env.local");
  console.log(
    "Ahora subí a Vercel (Production) estas vars: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, DRIVE_PHOTOS_FOLDER_ID",
  );
  console.log(
    "Luego redeploy y dispará GET /api/cron/sync (varias corridas hasta cubrir el stock).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
