import { readJson, writeJson } from "./db";
import { COMPANY } from "@/lib/company";

export type SystemSettings = {
  company: {
    name: string;
    legalName?: string;
    rut?: string;
    tagline: string;
    phoneDisplay: string;
    whatsapp: string;
    email: string;
    address: string;
    hours: string;
    website: string;
  };
  preferences: {
    showSpin360: boolean;
    enableChatbot: boolean;
    enableOnlineReservation: boolean;
    aiStudioMode: boolean;
    reserveAmount: number;
  };
};

const DEFAULT_SETTINGS: SystemSettings = {
  company: {
    name: COMPANY.name,
    legalName: COMPANY.legalName,
    rut: COMPANY.rut,
    tagline: COMPANY.tagline,
    phoneDisplay: COMPANY.phoneDisplay,
    whatsapp: COMPANY.whatsapp,
    email: COMPANY.email,
    address: COMPANY.address,
    hours: COMPANY.hours,
    website: COMPANY.website,
  },
  preferences: {
    showSpin360: false,
    enableChatbot: true,
    enableOnlineReservation: true,
    aiStudioMode: false,
    reserveAmount: 200000,
  },
};

const FILENAME = "settings.json";

/** Placeholders / datos de demos viejos que no deben mostrarse en producción. */
const LEGACY_BAD_EMAILS = new Set([
  "contacto@rgmotors.cl",
  "info@rgmotors.cl",
  "ventas@rgmotors.cl",
  "hola@rgmotors.cl",
]);
const LEGACY_BAD_PHONES = new Set(["+56 9 8765 4321", "56987654321", "987654321"]);
const LEGACY_BAD_SITES = new Set(["www.rgmotors.cl", "rgmotors.cl"]);

function sanitizeCompany(
  company: SystemSettings["company"],
): SystemSettings["company"] {
  const email = (company.email || "").trim().toLowerCase();
  const phone = (company.phoneDisplay || "").trim();
  const wa = (company.whatsapp || "").trim();
  const website = (company.website || "").trim().toLowerCase();

  return {
    ...company,
    name: company.name?.trim() || COMPANY.name,
    legalName: company.legalName?.trim() || COMPANY.legalName,
    tagline: company.tagline?.trim() || COMPANY.tagline,
    email:
      !email || LEGACY_BAD_EMAILS.has(email)
        ? COMPANY.email
        : company.email.trim(),
    phoneDisplay:
      !phone || LEGACY_BAD_PHONES.has(phone)
        ? COMPANY.phoneDisplay
        : phone,
    whatsapp:
      !wa || LEGACY_BAD_PHONES.has(wa)
        ? COMPANY.whatsapp
        : wa,
    website:
      !website || LEGACY_BAD_SITES.has(website)
        ? COMPANY.website
        : company.website.trim(),
    // Dirección legada (Av. El Tepual) → dirección oficial actual.
    address:
      !company.address?.trim() || /el\s+tepual/i.test(company.address)
        ? COMPANY.address
        : company.address.trim(),
    hours: company.hours?.trim() || COMPANY.hours,
  };
}

/** Preferencias del simulador de crédito retirado: no se exponen ni se vuelven a guardar. */
const RETIRED_PREFERENCES = [
  "showCuotaSimulator",
  "defaultDownPct",
  "defaultTermMonths",
  "monthlyInterestRate",
] as const;

function normalizeSettings(raw: SystemSettings): SystemSettings {
  const preferences: Record<string, unknown> = {
    ...DEFAULT_SETTINGS.preferences,
    ...raw.preferences,
  };
  for (const key of RETIRED_PREFERENCES) delete preferences[key];
  return {
    ...raw,
    preferences: preferences as SystemSettings["preferences"],
    company: sanitizeCompany({ ...DEFAULT_SETTINGS.company, ...raw.company }),
  };
}

export async function getSettings(): Promise<SystemSettings> {
  const raw = await readJson<SystemSettings>(FILENAME, DEFAULT_SETTINGS);
  const normalized = normalizeSettings(raw);
  const contactChanged =
    (raw.company?.email || "") !== normalized.company.email ||
    (raw.company?.phoneDisplay || "") !== normalized.company.phoneDisplay ||
    (raw.company?.whatsapp || "") !== normalized.company.whatsapp ||
    (raw.company?.website || "") !== normalized.company.website;
  if (contactChanged) {
    await writeJson(FILENAME, normalized).catch(() => false);
  }
  return normalized;
}

export async function updateSettings(newSettings: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSettings();
  const updated: SystemSettings = normalizeSettings({
    company: { ...current.company, ...(newSettings.company || {}) },
    preferences: { ...current.preferences, ...(newSettings.preferences || {}) },
  });
  await writeJson(FILENAME, updated);
  return updated;
}
