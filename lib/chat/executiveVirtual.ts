import { COMPANY, whatsappLink } from "@/lib/company";

export type ChatVehicle = {
  slug: string;
  brand: string;
  model: string;
  price: number;
  bodyType?: string;
  fuel?: string;
  transmission?: string;
  year?: number;
  image?: string;
};

export type ChatReply = {
  text: string;
  cars?: string[];
  waMessage?: string;
  showContact?: boolean;
  intents?: string[];
  bodyType?: string;
  budget?: number;
  financing?: boolean;
  brand?: string;
  modelHint?: string;
};

export type ContactParse = {
  ok: true;
  name: string;
  contact: string;
  kind: "whatsapp" | "email";
} | {
  ok: false;
  error: string;
};

const BRAND_ALIASES: Record<string, string> = {
  vw: "volkswagen",
  "mercedes benz": "mercedes-benz",
  mercedes: "mercedes-benz",
  mb: "mercedes-benz",
  chevy: "chevrolet",
  mitsu: "mitsubishi",
};

const MODEL_ALIASES: Record<string, string[]> = {
  hilux: ["hilux"],
  l200: ["l200", "katana"],
  katana: ["katana", "l200"],
  navara: ["navara"],
  amarok: ["amarok"],
  saveiro: ["saveiro"],
  colorado: ["colorado"],
  dmax: ["dmax"],
  partner: ["partner"],
  expert: ["expert"],
  raptor: ["raptor", "f150"],
  raize: ["raize"],
  t60: ["t60"],
  porter: ["porter"],
  wrx: ["wrx", "sti"],
};

export const EXECUTIVE_SUGGESTIONS = [
  "SUV automático bajo $16M",
  "Camioneta 4x4 diésel",
  "Auto económico para ciudad",
  "Quiero agendar visita",
  "Financiamiento",
  "Parte de pago",
] as const;

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function uniqueBrands(vehicles: ChatVehicle[]) {
  return Array.from(new Set(vehicles.map((v) => norm(v.brand)).filter(Boolean)));
}

function detectBrand(query: string, vehicles: ChatVehicle[]): string | undefined {
  const q = norm(query);
  for (const [alias, brand] of Object.entries(BRAND_ALIASES)) {
    if (q.includes(alias)) return brand;
  }
  for (const brand of uniqueBrands(vehicles)) {
    if (brand.length >= 3 && q.includes(brand)) return brand;
  }
  return undefined;
}

const STOPWORDS = new Set([
  "auto",
  "autos",
  "busco",
  "buscar",
  "quiero",
  "necesito",
  "para",
  "con",
  "sin",
  "bajo",
  "hasta",
  "menos",
  "mas",
  "más",
  "una",
  "unos",
  "como",
  "tiene",
  "tienen",
  "me",
  "mi",
  "el",
  "la",
  "los",
  "las",
  "del",
  "por",
  "que",
  "ciudad",
  "familia",
  "trabajo",
]);

function detectModelHint(query: string, vehicles: ChatVehicle[]): string | undefined {
  const q = norm(query);
  for (const [key, aliases] of Object.entries(MODEL_ALIASES)) {
    if (aliases.some((a) => q.includes(a)) || q.includes(key)) return key;
  }

  const tokens = new Set<string>();
  for (const v of vehicles) {
    for (const part of norm(v.model).split(/[\s./-]+/)) {
      if (part.length >= 3 && !/^\d+$/.test(part)) tokens.add(part);
    }
  }
  for (const token of tokens) {
    if (token.length >= 4 && q.includes(token) && !STOPWORDS.has(token)) return token;
  }
  return undefined;
}

function modelMatches(v: ChatVehicle, hint: string) {
  const hay = norm(`${v.brand} ${v.model}`);
  const aliases = MODEL_ALIASES[hint] ?? [hint];
  return aliases.some((a) => hay.includes(a)) || hay.includes(hint);
}

function parseBudget(query: string): number | undefined {
  const q = norm(query);
  const m = q.match(/(\d+[.,]?\d*)\s*m(?:illones?)?\b/);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 1_000_000);
  const pesos = q.match(/\$\s*([\d.]+)/);
  if (pesos) {
    const n = Number(pesos[1].replace(/\./g, ""));
    if (n >= 1_000_000) return n;
  }
  return undefined;
}

function detectBodyType(query: string): string | undefined {
  const q = norm(query);
  if (/\bsuv\b/.test(q)) return "SUV";
  if (/\b(camioneta|pickup|4x4|pick[\s-]?up)\b/.test(q)) return "Camioneta";
  if (/\b(sedan|sedán)\b/.test(q) || q.includes("sedan")) return "Sedán";
  if (/\bhatch/.test(q)) return "Hatchback";
  if (/\b(furgon|furgón|van|utilitario)\b/.test(q)) return "Furgón";
  return undefined;
}

/** Respuestas tipo ejecutivo de sala (sin LLM). */
export function answerAsExecutive(
  rawQuery: string,
  vehicles: ChatVehicle[],
  opts?: { pageVehicle?: ChatVehicle | null; siteOrigin?: string },
): ChatReply {
  const query = rawQuery.trim();
  const q = norm(query);
  const intents: string[] = [];

  // —— FAQs / intenciones de sala ——
  if (/\b(horario|hora|abierto|abren|cierran|atencion|atención)\b/.test(q)) {
    intents.push("horario");
    return {
      text: `Nuestro horario en ${COMPANY.branchName}:\n${COMPANY.hours}.\n¿Quieres que te reserve una visita o te muestre stock ahora?`,
      intents,
      showContact: true,
    };
  }

  if (/\b(direccion|dirección|ubicacion|ubicación|donde|dónde|sucursal|showroom|mapa|llegar)\b/.test(q)) {
    intents.push("ubicacion");
    return {
      text: `Estamos en ${COMPANY.address}. Showroom oficial: ${COMPANY.branchName}.\n¿Te preparo un WhatsApp para coordinar la visita?`,
      intents,
      showContact: true,
      waMessage: `Hola RG Motors, quiero ir al showroom (${COMPANY.addressShort}).`,
    };
  }

  if (/\b(financi|credito|crédito|cuota|\bpie\b)\b/.test(q)) {
    intents.push("financiamiento");
    return {
      text: `Sí, trabajamos con financiamiento. Un ejecutivo te entrega las condiciones por WhatsApp.\nSi me indicas presupuesto o pie, te muestro autos que encajen.`,
      intents,
      financing: true,
      showContact: true,
      waMessage: "Hola RG Motors, quiero información de financiamiento / cuotas.",
    };
  }

  if (/\b(test[\s-]?drive|prueba de manejo|probar|manejar)\b/.test(q)) {
    intents.push("test-drive");
    return {
      text: `Agendamos prueba de manejo en el showroom (${COMPANY.addressShort}). Dime qué auto te interesa o déjame tu WhatsApp y un ejecutivo te contacta.`,
      intents,
      showContact: true,
      waMessage: "Hola RG Motors, quiero agendar una prueba de manejo.",
    };
  }

  if (/\b(parte de pago|permuta|trade[\s-]?in|mi auto|usado como pie)\b/.test(q)) {
    intents.push("parte-de-pago");
    return {
      text: `Sí, recibimos parte de pago. Cuéntame marca, modelo, año y km de tu auto (o deja tu WhatsApp) y un ejecutivo te cotiza.`,
      intents,
      showContact: true,
      waMessage: "Hola RG Motors, quiero cotizar parte de pago de mi auto.",
    };
  }

  if (/\b(visita|agendar|reservar hora|ir a ver|conocer el local)\b/.test(q)) {
    intents.push("visita");
    return {
      text: `Perfecto. Horario: ${COMPANY.hours}. Dirección: ${COMPANY.addressShort}.\nDeja tu nombre y WhatsApp o escribe ahora y te confirmamos la visita.`,
      intents,
      showContact: true,
      waMessage: `Hola RG Motors, quiero agendar una visita al showroom (${COMPANY.addressShort}).`,
    };
  }

  if (/\b(hola|buenas|buen dia|buen día|hey)\b/.test(q) && q.split(/\s+/).length <= 3) {
    intents.push("saludo");
    const page = opts?.pageVehicle;
    if (page) {
      return {
        text: `¡Hola! Soy el ejecutivo virtual de RG Motors. Vi que estás viendo el ${page.brand} ${page.model}. ¿Te ayudo con precio, financiamiento, visita o te muestro alternativas?`,
        cars: [page.slug],
        intents,
      };
    }
    return {
      text: "¡Hola! Soy el ejecutivo virtual de RG Motors. Cuéntame qué buscas (marca, tipo, presupuesto) o elige una sugerencia abajo.",
      intents,
    };
  }

  // —— Búsqueda de stock (filtros AND) ——
  const bodyType = detectBodyType(q);
  const brand = detectBrand(q, vehicles);
  const modelHint = detectModelHint(q, vehicles);
  const budget = parseBudget(q);
  const wantDiesel = /\b(diesel|diésel)\b/.test(q);
  const wantAuto = /\b(automatic|automático|automatica|automática)\b/.test(q);
  const wantManual = /\bmanual\b/.test(q);
  const wantCheap = /\b(economic|económic|barato|barata|ciudad|entrada)\b/.test(q);
  const financing = /\b(financi|credito|crédito|cuota|\bpie\b)\b/.test(q);

  if (bodyType) intents.push(bodyType.toLowerCase());
  if (brand) intents.push(brand);
  if (modelHint) intents.push(modelHint);
  if (wantDiesel) intents.push("diesel");
  if (wantAuto) intents.push("automatico");
  if (wantCheap) intents.push("economico");
  if (financing) intents.push("financiamiento");
  if (budget) intents.push("presupuesto");

  let matches = [...vehicles];

  if (bodyType) {
    matches = matches.filter((v) => {
      const bt = String(v.bodyType || "");
      if (bodyType === "Camioneta") return bt === "Camioneta" || bt === "Pickup";
      return bt === bodyType;
    });
  }
  if (brand) {
    matches = matches.filter((v) => norm(v.brand) === brand || norm(v.brand).includes(brand));
  }
  if (modelHint) {
    matches = matches.filter((v) => modelMatches(v, modelHint));
  }
  if (wantDiesel) {
    matches = matches.filter((v) => /diesel|diésel/i.test(String(v.fuel || "")));
  }
  if (wantAuto) {
    matches = matches.filter((v) => /autom/i.test(String(v.transmission || "")));
  }
  if (wantManual) {
    matches = matches.filter((v) => /manual/i.test(String(v.transmission || "")));
  }
  if (budget) {
    matches = matches.filter((v) => Number(v.price) <= budget);
  }
  if (wantCheap) {
    matches = [...matches].sort((a, b) => a.price - b.price);
  } else {
    matches = [...matches].sort((a, b) => a.price - b.price);
  }

  const hasSearchSignal =
    Boolean(bodyType || brand || modelHint || budget || wantDiesel || wantAuto || wantManual || wantCheap);

  if (!hasSearchSignal) {
    const page = opts?.pageVehicle;
    if (page) {
      return {
        text: `Sobre el ${page.brand} ${page.model}: puedo ayudarte con financiamiento, visita al showroom o mostrarte alternativas similares. ¿Qué prefieres?`,
        cars: [page.slug],
        intents: ["contexto-ficha"],
        showContact: true,
      };
    }
    return {
      text: "Cuéntame un poco más: marca (Toyota, Mitsubishi…), tipo (SUV, camioneta) o presupuesto (ej. bajo $16M). También puedo ayudarte con horario, financiamiento o agendar visita.",
      intents,
    };
  }

  const top = matches.slice(0, 3);
  if (top.length === 0) {
    return {
      text: "No encontré coincidencias exactas en el stock actual. ¿Bajamos el presupuesto, cambiamos marca o tipo, o te paso con un ejecutivo por WhatsApp?",
      intents,
      bodyType,
      budget,
      financing,
      brand,
      modelHint,
      showContact: true,
      waMessage: buildWhatsAppInterest({
        name: undefined,
        vehicles: [],
        budget,
        note: query,
        origin: opts?.siteOrigin,
      }),
    };
  }

  const label = [
    brand ? brand.replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : null,
    modelHint ? modelHint.toUpperCase() : null,
    bodyType,
    budget ? `hasta $${Math.round(budget / 1_000_000)}M` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    text: `Encontré ${top.length} ${top.length === 1 ? "opción" : "opciones"}${label ? ` (${label})` : ""} en stock:`,
    cars: top.map((v) => v.slug),
    intents,
    bodyType,
    budget,
    financing,
    brand,
    modelHint,
    showContact: true,
    waMessage: buildWhatsAppInterest({
      name: undefined,
      vehicles: top,
      budget,
      note: query,
      origin: opts?.siteOrigin,
    }),
  };
}

export function buildWhatsAppInterest(opts: {
  name?: string;
  vehicles: ChatVehicle[];
  budget?: number;
  note?: string;
  origin?: string;
}) {
  const lines: string[] = [];
  if (opts.name) lines.push(`Hola RG Motors, soy ${opts.name}.`);
  else lines.push("Hola RG Motors, me contacto desde el ejecutivo virtual del sitio.");

  if (opts.vehicles.length) {
    lines.push("Me interesan:");
    for (const v of opts.vehicles) {
      const url = opts.origin ? `${opts.origin}/vehiculo/${v.slug}` : `/vehiculo/${v.slug}`;
      lines.push(`• ${v.brand} ${v.model} — ${url}`);
    }
  }
  if (opts.budget) {
    lines.push(`Presupuesto referencial: hasta $${opts.budget.toLocaleString("es-CL")}.`);
  }
  if (opts.note) lines.push(`Consulta: ${opts.note}`);
  lines.push("¿Me pueden ayudar?");
  return lines.join("\n");
}

export function whatsappHref(message: string) {
  return whatsappLink(message);
}

/** Valida nombre + WhatsApp Chile o email. */
export function parseLeadContact(nameRaw: string, contactRaw: string): ContactParse {
  const name = nameRaw.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    return { ok: false, error: "Indica tu nombre (mín. 2 caracteres)." };
  }

  const contact = contactRaw.trim();
  if (!contact) {
    return { ok: false, error: "Indica tu WhatsApp o email." };
  }

  if (contact.includes("@")) {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    if (!ok) return { ok: false, error: "Email inválido." };
    return { ok: true, name, contact, kind: "email" };
  }

  const digits = contact.replace(/\D/g, "");
  let phone = digits;
  if (phone.startsWith("56") && phone.length >= 11) {
    // ok internacional
  } else if (phone.startsWith("9") && phone.length === 9) {
    phone = `56${phone}`;
  } else if (phone.length === 8) {
    phone = `569${phone}`;
  } else if (!(phone.startsWith("569") && phone.length === 11)) {
    return {
      ok: false,
      error: "WhatsApp inválido. Usa formato 9 XXXX XXXX o +56 9…",
    };
  }

  if (!/^569\d{8}$/.test(phone) && !(phone.startsWith("56") && phone.length >= 11)) {
    return { ok: false, error: "WhatsApp inválido. Usa un móvil chileno." };
  }

  return { ok: true, name, contact: phone.startsWith("+") ? phone : `+${phone}`, kind: "whatsapp" };
}

export function greetingForPage(pageVehicle?: ChatVehicle | null): string {
  if (pageVehicle) {
    return `¡Hola! Soy el ejecutivo virtual de RG Motors. Vi que estás viendo el ${pageVehicle.brand} ${pageVehicle.model}. ¿Te ayudo con precio, financiamiento, visita o alternativas del stock?`;
  }
  return "¡Hola! Soy el ejecutivo virtual de RG Motors. Cuéntame qué buscas (marca, tipo o presupuesto) y te muestro opciones de nuestro stock.";
}
