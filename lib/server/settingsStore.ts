import { readJson, writeJson } from "./db";
import { COMPANY } from "@/lib/company";
import { AUTOFIN_DEFAULT_MONTHLY_RATE } from "@/lib/finance/autofin";

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
    showCuotaSimulator: boolean;
    enableOnlineReservation: boolean;
    aiStudioMode: boolean;
    reserveAmount: number;
    defaultDownPct: number;
    defaultTermMonths: number;
    /**
     * Override opcional. 0 = usar tabla Autofin por tramo.
     * Solo sube la cuota si es mayor a la tasa del tramo.
     */
    monthlyInterestRate: number;
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
    showCuotaSimulator: true,
    enableOnlineReservation: true,
    aiStudioMode: false,
    reserveAmount: 200000,
    defaultDownPct: 20,
    defaultTermMonths: 48,
    monthlyInterestRate: 0,
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
    address: company.address?.trim() || COMPANY.address,
    hours: company.hours?.trim() || COMPANY.hours,
  };
}

function normalizeSettings(raw: SystemSettings): SystemSettings {
  const rate = Number(raw.preferences?.monthlyInterestRate);
  // Tasas legadas (1.85/1.9/2.5/3.21 fijo) → 0 (tabla por tramo).
  // Solo se conservan overrides claramente al alza (> mediana matriz + margen).
  let fixedRate = 0;
  if (Number.isFinite(rate) && rate >= AUTOFIN_DEFAULT_MONTHLY_RATE + 0.001) {
    fixedRate = rate;
  }
  return {
    ...raw,
    preferences: {
      ...DEFAULT_SETTINGS.preferences,
      ...raw.preferences,
      monthlyInterestRate: fixedRate,
    },
    company: sanitizeCompany({ ...DEFAULT_SETTINGS.company, ...raw.company }),
  };
}

export async function getSettings(): Promise<SystemSettings> {
  const raw = await readJson<SystemSettings>(FILENAME, DEFAULT_SETTINGS);
  const normalized = normalizeSettings(raw);
  const rateChanged =
    Number(raw.preferences?.monthlyInterestRate) !==
    normalized.preferences.monthlyInterestRate;
  const contactChanged =
    (raw.company?.email || "") !== normalized.company.email ||
    (raw.company?.phoneDisplay || "") !== normalized.company.phoneDisplay ||
    (raw.company?.whatsapp || "") !== normalized.company.whatsapp ||
    (raw.company?.website || "") !== normalized.company.website;
  if (rateChanged || contactChanged) {
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
