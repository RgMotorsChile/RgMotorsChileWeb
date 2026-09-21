import { NextRequest, NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/server/db";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { guardPublicLeadPost } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CapturedLead = {
  id: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  budget?: number;
  bodyType?: string;
  financing?: boolean;
  intents?: string[];
  models?: string[];
  name?: string;
  contact?: string;
  messages?: number;
  trafficSource?: unknown;
};

const FILENAME = "leads.json";

async function readAll(): Promise<CapturedLead[]> {
  return readJson<CapturedLead[]>(FILENAME, []);
}

async function writeAll(list: CapturedLead[]) {
  await writeJson(FILENAME, list);
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const list = await readAll();
  list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return NextResponse.json({ leads: list });
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "track", 40);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  const sessionId = String(body.sessionId || "").slice(0, 64);
  if (!sessionId) {
    return NextResponse.json({ error: "Falta sessionId" }, { status: 400 });
  }

  const list = await readAll();
  const now = new Date().toISOString();
  const existing = list.find((l) => l.sessionId === sessionId);

  const mergeArr = (a?: string[], b?: string[]) =>
    Array.from(new Set([...(a ?? []), ...(b ?? [])]));

  if (existing) {
    existing.updatedAt = now;
    if (body.budget != null) existing.budget = Number(body.budget);
    if (body.bodyType) existing.bodyType = String(body.bodyType).slice(0, 40);
    if (body.financing != null) existing.financing = Boolean(body.financing);
    if (body.name) existing.name = String(body.name).slice(0, 80);
    if (body.contact) existing.contact = String(body.contact).slice(0, 120);
    if (body.trafficSource) existing.trafficSource = body.trafficSource;
    existing.intents = mergeArr(
      existing.intents,
      Array.isArray(body.intents) ? body.intents.map(String) : undefined,
    ).slice(0, 20);
    existing.models = mergeArr(
      existing.models,
      Array.isArray(body.models) ? body.models.map(String) : undefined,
    ).slice(0, 20);
    existing.messages = (existing.messages ?? 0) + Number(body.messages ?? 1);
  } else {
    list.push({
      id: `C${Date.now().toString(36)}`,
      sessionId,
      createdAt: now,
      updatedAt: now,
      budget: body.budget != null ? Number(body.budget) : undefined,
      bodyType: body.bodyType ? String(body.bodyType).slice(0, 40) : undefined,
      financing: body.financing != null ? Boolean(body.financing) : undefined,
      intents: Array.isArray(body.intents) ? body.intents.map(String).slice(0, 20) : [],
      models: Array.isArray(body.models) ? body.models.map(String).slice(0, 20) : [],
      name: body.name ? String(body.name).slice(0, 80) : undefined,
      contact: body.contact ? String(body.contact).slice(0, 120) : undefined,
      messages: Number(body.messages ?? 1),
      trafficSource: body.trafficSource,
    });
  }

  const trimmed = list.slice(-500);
  await writeAll(trimmed);
  return NextResponse.json({ ok: true });
}
