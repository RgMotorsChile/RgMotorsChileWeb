// Plantillas de correo de leads (contacto y consignación), compartidas por
// rgmotorschile.cl y unidadeschile.cl. HTML con tablas y estilos en línea
// (Gmail/Outlook), apto para modo oscuro y con versión de texto plano.
// TODO lo que escribe el visitante pasa por esc() o encodeURIComponent.

/**
 * @typedef {{
 *   name: string, site: string, siteLabel: string,
 *   logoUrl: string, logoWidth: number, logoHeight: number,
 *   headerBg: string, accent: string, stripe?: string, accentText: string, ink: string,
 *   whatsapp: string, phoneDisplay: string, email: string, address: string, hours: string,
 * }} Brand
 * @typedef {{ brand?: string, model?: string, year?: string|number, km?: string|number, plate?: string, photos?: number }} VehicleIn
 * @typedef {{
 *   kind: "contact"|"consigna", name: string, email?: string, phone?: string,
 *   message?: string, vehicle?: VehicleIn, id?: string, receivedAt?: Date,
 * }} Lead
 */

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Para asuntos y encabezados: una línea, sin caracteres de control. */
export function oneLine(value, max = 120) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function isValidEmail(value) {
  const v = String(value ?? "").trim();
  return v.length <= 120 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(v);
}

/** Teléfono chileno → dígitos para wa.me (569XXXXXXXX). "" si no sirve. */
export function waNumber(phone) {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("9")) d = `56${d}`;
  else if (d.length === 8) d = `569${d}`;
  return d.length >= 10 && d.length <= 13 ? d : "";
}

export function formatSantiago(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function kmLabel(km) {
  const n = Number(String(km ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("es-CL")} km` : "";
}

export function vehicleTitle(v = {}) {
  return oneLine([v.brand, v.model, v.year].filter(Boolean).join(" "), 90);
}

function rows(lead) {
  const v = lead.vehicle || {};
  const list = [
    ["Nombre", lead.name],
    ["WhatsApp / teléfono", lead.phone],
    ["Correo", lead.email],
  ];
  if (lead.kind === "consigna") {
    list.push(
      ["Marca", v.brand],
      ["Modelo", v.model],
      ["Año", v.year],
      ["Kilometraje", kmLabel(v.km)],
      ["Patente", v.plate],
    );
    if (v.photos) list.push(["Fotos adjuntas", String(v.photos)]);
  }
  list.push([lead.kind === "consigna" ? "Comentarios" : "Mensaje", lead.message]);
  return list.filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== "");
}

// ---------- piezas HTML ----------

function button(href, label, bg, color) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 10px 0"><tr>
<td align="center" bgcolor="${bg}" style="border-radius:10px;background:${bg}">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:600;line-height:18px;color:${color};text-decoration:none;border-radius:10px;border:1px solid ${bg}">${esc(label)}</a>
</td></tr></table>`;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function fieldTable(list, brand) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="uc-card2" style="border:1px solid #e6e8ee;border-radius:12px;border-collapse:separate;background:#fafbfc">
${list
  .map(
    ([k, v], i) => `<tr><td class="uc-muted" style="padding:12px 16px;${i ? "border-top:1px solid #eceef3;" : ""}font-family:${FONT};font-size:12px;line-height:16px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;width:38%;vertical-align:top">${esc(k)}</td>
<td class="uc-ink" style="padding:12px 16px;${i ? "border-top:1px solid #eceef3;" : ""}font-family:${FONT};font-size:15px;line-height:22px;color:${brand.ink};vertical-align:top;white-space:pre-wrap;word-break:break-word">${esc(v)}</td></tr>`,
  )
  .join("\n")}
</table>`;
}

function vehicleCard(lead, brand) {
  const v = lead.vehicle || {};
  const title = vehicleTitle(v) || "Vehículo";
  const meta = [kmLabel(v.km), v.plate ? `Patente ${oneLine(v.plate, 10).toUpperCase()}` : ""].filter(Boolean).join(" · ");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr>
<td bgcolor="${brand.headerBg}" style="background:${brand.headerBg};border-radius:12px;padding:18px 20px;border-left:4px solid ${brand.accent}">
<div style="font-family:${FONT};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c7cbd4">Vehículo a consignar</div>
<div style="font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;color:#ffffff;margin-top:4px">${esc(title)}</div>
${meta ? `<div style="font-family:${FONT};font-size:14px;line-height:20px;color:#e5e7eb;margin-top:4px">${esc(meta)}</div>` : ""}
</td></tr></table>`;
}

function layout({ brand, preheader, eyebrow, title, intro, body, footer }) {
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%}
  a{color:${brand.accent}}
  @media (max-width:620px){ .uc-wrap{width:100%!important} .uc-pad{padding-left:20px!important;padding-right:20px!important} .uc-h1{font-size:24px!important;line-height:30px!important} }
  @media (prefers-color-scheme:dark){
    .uc-bg{background:#0b0c10!important} .uc-card{background:#15171c!important}
    .uc-card2{background:#1b1e24!important;border-color:#2a2e37!important}
    .uc-ink{color:#f3f4f6!important} .uc-muted{color:#9ca3af!important}
    .uc-card2 td{border-color:#2a2e37!important} .uc-link{color:#e5e7eb!important;text-decoration:underline!important}
  }
  [data-ogsc] .uc-ink{color:#f3f4f6!important}
</style>
</head>
<body class="uc-bg" style="margin:0;padding:0;background:#f3f4f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="uc-bg" bgcolor="#f3f4f6" style="background:#f3f4f6">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="uc-wrap" style="width:600px;max-width:600px">
<tr><td align="center" bgcolor="${brand.headerBg}" style="background:${brand.headerBg};border-radius:16px 16px 0 0;padding:26px 24px">
<a href="${esc(brand.site)}" target="_blank" style="text-decoration:none"><img src="${esc(brand.logoUrl)}" width="${brand.logoWidth}" height="${brand.logoHeight}" alt="${esc(brand.name)}" style="display:block;border:0;outline:none;width:${brand.logoWidth}px;max-width:100%;height:auto;color:#ffffff;font-family:${FONT};font-size:22px;font-weight:700"></a>
</td></tr>
<tr><td height="4" bgcolor="${brand.stripe || brand.accent}" style="background:${brand.stripe || brand.accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="uc-card uc-pad" bgcolor="#ffffff" style="background:#ffffff;padding:32px 36px 28px;border-radius:0 0 16px 16px">
<div class="uc-muted" style="font-family:${FONT};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${brand.accent};font-weight:700">${esc(eyebrow)}</div>
<h1 class="uc-ink uc-h1" style="margin:6px 0 10px;font-family:${FONT};font-size:28px;line-height:34px;font-weight:700;color:${brand.ink}">${esc(title)}</h1>
<p class="uc-muted" style="margin:0 0 22px;font-family:${FONT};font-size:15px;line-height:23px;color:#4b5563">${intro}</p>
${body}
</td></tr>
<tr><td align="center" style="padding:18px 24px 6px;font-family:${FONT};font-size:12px;line-height:18px;color:#8b919c">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function contactBlock(brand) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px"><tr>
<td class="uc-muted" style="font-family:${FONT};font-size:14px;line-height:22px;color:#4b5563;border-top:1px solid #eceef3;padding-top:18px">
<strong class="uc-ink" style="color:${brand.ink}">${esc(brand.name)}</strong><br>
${esc(brand.address)}<br>
${esc(brand.hours)}<br>
WhatsApp <a href="https://wa.me/${esc(brand.whatsapp)}" class="uc-link" style="color:${brand.accent};text-decoration:none">${esc(brand.phoneDisplay)}</a> · <a href="mailto:${esc(brand.email)}" class="uc-link" style="color:${brand.accent};text-decoration:none">${esc(brand.email)}</a>
</td></tr></table>`;
}

// ---------- correos ----------

/** Aviso interno al equipo. */
export function teamEmail(brand, lead) {
  const when = formatSantiago(lead.receivedAt || new Date());
  const name = oneLine(lead.name, 80) || "Sin nombre";
  const isConsigna = lead.kind === "consigna";
  const vt = vehicleTitle(lead.vehicle);
  const subject = isConsigna
    ? `Nueva consigna — ${vt || "vehículo sin datos"} · ${name}`
    : `Nuevo contacto web — ${name}`;
  const list = rows(lead);

  const wa = waNumber(lead.phone);
  const firstName = name.split(" ")[0];
  const waText = isConsigna
    ? `Hola ${firstName}, te escribimos de ${brand.name} por la consignación de tu ${vt || "vehículo"}.`
    : `Hola ${firstName}, te escribimos de ${brand.name} por tu mensaje en ${brand.siteLabel}.`;
  const buttons = [
    isValidEmail(lead.email)
      ? button(
          `mailto:${lead.email}?subject=${encodeURIComponent(`Re: ${isConsigna ? `Consignación ${vt}` : "Tu mensaje"} — ${brand.name}`)}`,
          "Responder por correo",
          brand.accent,
          brand.accentText,
        )
      : "",
    wa ? button(`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`, "Escribir por WhatsApp", "#25D366", "#06240f") : "",
  ].join("");

  const html = layout({
    brand,
    preheader: isConsigna ? `${vt} · ${name} · ${oneLine(lead.phone, 30)}` : `${name}: ${oneLine(lead.message, 90)}`,
    eyebrow: isConsigna ? "Consignación · sitio web" : "Contacto · sitio web",
    title: isConsigna ? "Nueva solicitud de consignación" : "Nuevo contacto desde la web",
    intro: `Recibido el <strong>${esc(when)}</strong> (hora de Chile).`,
    body: `${isConsigna ? vehicleCard(lead, brand) : ""}${fieldTable(list, brand)}
${buttons ? `<div style="margin-top:22px">${buttons}</div>` : ""}
<p class="uc-muted" style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:#6b7280">Si respondes este correo, la respuesta le llega directo a ${esc(name)}.</p>`,
    footer: `Aviso automático de ${esc(brand.siteLabel)}${lead.id ? ` · ID ${esc(oneLine(lead.id, 40))}` : ""}`,
  });

  const text = [
    isConsigna ? "NUEVA SOLICITUD DE CONSIGNACIÓN" : "NUEVO CONTACTO DESDE LA WEB",
    `${brand.name} · ${brand.siteLabel}`,
    `Recibido: ${when} (hora de Chile)`,
    "",
    ...list.map(([k, v]) => `${k}: ${String(v).replace(/\r?\n/g, "\n  ")}`),
    "",
    isValidEmail(lead.email) ? `Responder: ${lead.email}` : "",
    wa ? `WhatsApp: https://wa.me/${wa}` : "",
    lead.id ? `ID: ${lead.id}` : "",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");

  return { subject: oneLine(subject, 150), html, text };
}

/** Confirmación automática al visitante. */
export function visitorEmail(brand, lead) {
  const name = oneLine(lead.name, 80);
  const firstName = name.split(" ")[0] || "";
  const isConsigna = lead.kind === "consigna";
  const vt = vehicleTitle(lead.vehicle);
  const subject = isConsigna
    ? `Recibimos tu solicitud de consignación — ${brand.name}`
    : `Recibimos tu mensaje — ${brand.name}`;
  const list = rows(lead).filter(([k]) => k !== "Correo");

  const steps = isConsigna
    ? [
        "Revisamos los datos de tu vehículo.",
        "Te contactamos por WhatsApp o teléfono, en horario de atención, para coordinar la revisión y conversar el precio de publicación.",
        "Si avanzamos, lo publicamos y nos encargamos de la venta. Tú decides en cada paso.",
      ]
    : [
        "Un asesor lee tu mensaje.",
        `Te respondemos por correo o WhatsApp dentro del horario de atención (${brand.hours}).`,
        "Si es urgente, escríbenos directo por WhatsApp.",
      ];
  const stepsHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px">
${steps
  .map(
    (s, i) => `<tr><td width="34" valign="top" style="padding:0 0 12px"><div style="width:26px;height:26px;border-radius:13px;background:${brand.accent};color:${brand.accentText};font-family:${FONT};font-size:13px;font-weight:700;line-height:26px;text-align:center">${i + 1}</div></td>
<td class="uc-ink" valign="top" style="padding:3px 0 12px;font-family:${FONT};font-size:15px;line-height:22px;color:${brand.ink}">${esc(s)}</td></tr>`,
  )
  .join("\n")}
</table>`;

  const html = layout({
    brand,
    preheader: isConsigna
      ? `Ya tenemos los datos de tu ${vt || "vehículo"}. Te contactamos pronto.`
      : "Ya tenemos tu mensaje. Te respondemos pronto.",
    eyebrow: brand.name,
    title: isConsigna ? "Recibimos tu solicitud" : "Recibimos tu mensaje",
    intro: `Hola${firstName ? ` <strong>${esc(firstName)}</strong>` : ""}, gracias por escribirnos. ${
      isConsigna
        ? `Ya tenemos los datos de tu <strong>${esc(vt || "vehículo")}</strong> y un asesor de ${esc(brand.name)} te contactará pronto.`
        : `Ya llegó tu mensaje al equipo de ${esc(brand.name)} y te responderemos a la brevedad.`
    }`,
    body: `<div class="uc-muted" style="font-family:${FONT};font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin:0 0 8px">Lo que nos enviaste</div>
${fieldTable(list, brand)}
<div class="uc-muted" style="font-family:${FONT};font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin:24px 0 0">Próximos pasos</div>
${stepsHtml}
<div style="margin-top:10px">${button(`https://wa.me/${brand.whatsapp}?text=${encodeURIComponent(`Hola ${brand.name}, envié ${isConsigna ? "una solicitud de consignación" : "un mensaje"} desde la web.`)}`, "Escríbenos por WhatsApp", "#25D366", "#06240f")}${button(brand.site, `Ver ${brand.siteLabel}`, brand.headerBg, "#ffffff")}</div>
${contactBlock(brand)}`,
    footer: `Recibiste este correo porque enviaste un formulario en ${esc(brand.siteLabel)}. Si no fuiste tú, puedes ignorarlo.`,
  });

  const text = [
    `${isConsigna ? "Recibimos tu solicitud de consignación" : "Recibimos tu mensaje"} — ${brand.name}`,
    "",
    `Hola ${firstName}, gracias por escribirnos.`,
    isConsigna
      ? `Ya tenemos los datos de tu ${vt || "vehículo"} y un asesor te contactará pronto.`
      : "Ya llegó tu mensaje y te responderemos a la brevedad.",
    "",
    "Lo que nos enviaste:",
    ...list.map(([k, v]) => `- ${k}: ${String(v).replace(/\r?\n/g, " ")}`),
    "",
    "Próximos pasos:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `WhatsApp: ${brand.phoneDisplay} (https://wa.me/${brand.whatsapp})`,
    `Correo: ${brand.email}`,
    `${brand.address} · ${brand.hours}`,
    brand.site,
  ].join("\n");

  return { subject: oneLine(subject, 150), html, text };
}
