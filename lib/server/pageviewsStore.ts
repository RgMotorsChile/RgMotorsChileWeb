import { readJson, writeJson } from "@/lib/server/db";

const FILENAME = "pageviews.json";
const MAX_DAYS = 400;
const MAX_TODAY_SESSIONS = 8_000;
const MAX_PATHS_PER_DAY = 40;

export type DayBucket = {
  date: string; // YYYY-MM-DD America/Santiago
  views: number;
  uniques: number;
  paths: Record<string, number>;
};

type PageviewsFile = {
  days: Record<string, DayBucket>;
  todayKey: string;
  todaySessions: string[];
};

function emptyStore(): PageviewsFile {
  return { days: {}, todayKey: "", todaySessions: [] };
}

/** Fecha civil en zona Chile (evita cortes de día por UTC). */
export function chileDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function normalizePath(path: string): string {
  const p = (path || "/").split("?")[0].split("#")[0].trim() || "/";
  if (p.length > 120) return p.slice(0, 120);
  if (p.startsWith("/admin")) return "/admin";
  return p;
}

function prunePaths(paths: Record<string, number>): Record<string, number> {
  const entries = Object.entries(paths).sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_PATHS_PER_DAY));
}

function pruneDays(days: Record<string, DayBucket>): Record<string, DayBucket> {
  const keys = Object.keys(days).sort();
  if (keys.length <= MAX_DAYS) return days;
  const drop = keys.slice(0, keys.length - MAX_DAYS);
  const next = { ...days };
  for (const k of drop) delete next[k];
  return next;
}

async function load(): Promise<PageviewsFile> {
  const data = await readJson<PageviewsFile>(FILENAME, emptyStore());
  if (!data || typeof data !== "object" || !data.days) return emptyStore();
  return {
    days: data.days ?? {},
    todayKey: data.todayKey ?? "",
    todaySessions: Array.isArray(data.todaySessions) ? data.todaySessions : [],
  };
}

export async function recordPageview(input: {
  path: string;
  sessionId: string;
}): Promise<{ ok: boolean }> {
  const sessionId = String(input.sessionId || "").slice(0, 64);
  if (!sessionId) return { ok: false };

  const path = normalizePath(input.path);
  if (path === "/admin") return { ok: true }; // no contar panel admin

  const store = await load();
  const today = chileDateKey();

  if (store.todayKey !== today) {
    store.todayKey = today;
    store.todaySessions = [];
  }

  const bucket =
    store.days[today] ??
    ({ date: today, views: 0, uniques: 0, paths: {} } satisfies DayBucket);

  bucket.views += 1;
  bucket.paths[path] = (bucket.paths[path] || 0) + 1;
  bucket.paths = prunePaths(bucket.paths);

  if (!store.todaySessions.includes(sessionId)) {
    if (store.todaySessions.length < MAX_TODAY_SESSIONS) {
      store.todaySessions.push(sessionId);
    }
    bucket.uniques += 1;
  }

  store.days[today] = bucket;
  store.days = pruneDays(store.days);
  await writeJson(FILENAME, store);
  return { ok: true };
}

export async function getPageviewStats(): Promise<{
  today: { views: number; uniques: number };
  month: { views: number; uniques: number };
  year: { views: number; uniques: number };
  last30Days: { date: string; views: number; uniques: number }[];
  topPaths: { path: string; views: number }[];
  trackingSince: string | null;
}> {
  const store = await load();
  const today = chileDateKey();
  const now = new Date();
  const yearPrefix = today.slice(0, 4);
  const monthPrefix = today.slice(0, 7);

  let monthViews = 0;
  let monthUniques = 0;
  let yearViews = 0;
  let yearUniques = 0;
  const pathTotals: Record<string, number> = {};
  let earliest: string | null = null;

  for (const [date, b] of Object.entries(store.days)) {
    if (!earliest || date < earliest) earliest = date;
    if (date.startsWith(yearPrefix)) {
      yearViews += b.views;
      yearUniques += b.uniques;
    }
    if (date.startsWith(monthPrefix)) {
      monthViews += b.views;
      monthUniques += b.uniques;
    }
    for (const [p, n] of Object.entries(b.paths || {})) {
      pathTotals[p] = (pathTotals[p] || 0) + n;
    }
  }

  const todayBucket = store.days[today] ?? { views: 0, uniques: 0, paths: {} };

  const last30Days: { date: string; views: number; uniques: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = chileDateKey(d);
    const b = store.days[key];
    last30Days.push({
      date: key,
      views: b?.views ?? 0,
      uniques: b?.uniques ?? 0,
    });
  }

  const topPaths = Object.entries(pathTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, views]) => ({ path, views }));

  return {
    today: { views: todayBucket.views || 0, uniques: todayBucket.uniques || 0 },
    month: { views: monthViews, uniques: monthUniques },
    year: { views: yearViews, uniques: yearUniques },
    last30Days,
    topPaths,
    trackingSince: earliest,
  };
}
