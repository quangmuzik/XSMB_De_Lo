/** Xổ số miền Bắc – types & pure statistics (no fake data) */

export type XsmbDraw = {
  date: string;
  special: number;
  prizes: number[];
};

export type SyncStatus = {
  ok: boolean;
  behind: boolean;
  sourceLabel: string;
  checkedAt: string;
  fetchedAt: string | null;
  error: string | null;
  warning: string | null;
  added: number;
  latestDate: string;
  drawCount: number;
  expectedDate: string;
};

export type DrawSnapshot = {
  draws: XsmbDraw[];
  status: SyncStatus;
};

export const WINDOWS = [
  { id: 30, label: "30 kỳ" },
  { id: 60, label: "60 kỳ" },
  { id: 100, label: "100 kỳ" },
  { id: 200, label: "200 kỳ" },
  { id: 0, label: "Tất cả" },
] as const;

export type WindowId = (typeof WINDOWS)[number]["id"];

export type RankedNumber = {
  n: number;
  hits: number;
  rate: number;
  lastAgo: number | null;
  score: number;
  label: string;
};

export type Ranked = {
  windowDraws: number;
  totalDraws: number;
  de2: RankedNumber[];
  de3: RankedNumber[];
  lo: RankedNumber[];
};

export function tail2(n: number): number {
  return Math.abs(n) % 100;
}

export function tail3(n: number): number {
  return Math.abs(n) % 1000;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function weekday(iso: string): string {
  const names = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"] as const;
  return names[new Date(`${iso}T12:00:00+07:00`).getDay()];
}

export function nextDrawDate(lastIso: string): string {
  const [y, m, d] = lastIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

export function agoLabel(ago: number | null): string {
  if (ago === null) return "chưa từng về";
  if (ago === 0) return "vừa về kỳ mới nhất";
  if (ago === 1) return "1 kỳ trước";
  return `${ago} kỳ trước`;
}

export function ictNow(now = new Date()) {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { iso, minutes, y, m, d };
}

export function expectedDrawDate(now = new Date()): string {
  const { iso, minutes } = ictNow(now);
  if (minutes >= 18 * 60 + 45) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return dt.toISOString().slice(0, 10);
}

export function formatSyncTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function extractLoTails(draw: XsmbDraw): number[] {
  const tails = new Set<number>();
  tails.add(tail2(draw.special));
  for (const p of draw.prizes) tails.add(tail2(p));
  return [...tails];
}

function scoreNumber(hits: number, windowSize: number, lastAgo: number | null): number {
  if (windowSize === 0) return 0;
  const rate = hits / windowSize;
  let gapBonus = 0;
  if (lastAgo !== null) {
    if (lastAgo >= 3 && lastAgo <= 15) gapBonus = 8;
    else if (lastAgo > 30) gapBonus = -5;
    else if (lastAgo === 0) gapBonus = 3;
  }
  return rate * 120 + gapBonus + (hits > 0 ? Math.log2(hits + 1) * 2 : 0);
}

export function rankDeAndLo(draws: XsmbDraw[], windowId: WindowId): Ranked {
  const sorted = [...draws].sort((a, b) => b.date.localeCompare(a.date));
  const totalDraws = sorted.length;
  const windowDraws = windowId === 0 ? totalDraws : Math.min(windowId, totalDraws);
  const window = sorted.slice(0, windowDraws);

  const de2Hits = new Map<number, number>();
  const de2Last = new Map<number, number>();
  for (let i = 0; i < 100; i++) {
    de2Hits.set(i, 0);
    de2Last.set(i, -1);
  }
  window.forEach((d, idx) => {
    const t = tail2(d.special);
    de2Hits.set(t, (de2Hits.get(t) ?? 0) + 1);
    if (de2Last.get(t) === -1) de2Last.set(t, idx);
  });
  const de2: RankedNumber[] = [];
  for (let n = 0; n < 100; n++) {
    const hits = de2Hits.get(n) ?? 0;
    const lastAgo = de2Last.get(n) === -1 ? null : de2Last.get(n)!;
    de2.push({
      n, hits,
      rate: windowDraws ? hits / windowDraws : 0,
      lastAgo,
      score: scoreNumber(hits, windowDraws, lastAgo),
      label: pad2(n),
    });
  }
  de2.sort((a, b) => b.score - a.score || b.hits - a.hits);

  const de3Hits = new Map<number, number>();
  const de3Last = new Map<number, number>();
  for (let i = 0; i < 1000; i++) {
    de3Hits.set(i, 0);
    de3Last.set(i, -1);
  }
  window.forEach((d, idx) => {
    const t = tail3(d.special);
    de3Hits.set(t, (de3Hits.get(t) ?? 0) + 1);
    if (de3Last.get(t) === -1) de3Last.set(t, idx);
  });
  const de3: RankedNumber[] = [];
  for (let n = 0; n < 1000; n++) {
    const hits = de3Hits.get(n) ?? 0;
    if (hits === 0) continue;
    const lastAgo = de3Last.get(n) === -1 ? null : de3Last.get(n)!;
    de3.push({
      n, hits,
      rate: windowDraws ? hits / windowDraws : 0,
      lastAgo,
      score: scoreNumber(hits, windowDraws, lastAgo),
      label: pad3(n),
    });
  }
  de3.sort((a, b) => b.score - a.score || b.hits - a.hits);

  const loHits = new Map<number, number>();
  const loLast = new Map<number, number>();
  for (let i = 0; i < 100; i++) {
    loHits.set(i, 0);
    loLast.set(i, -1);
  }
  window.forEach((d, idx) => {
    for (const t of extractLoTails(d)) {
      loHits.set(t, (loHits.get(t) ?? 0) + 1);
      if (loLast.get(t) === -1) loLast.set(t, idx);
    }
  });
  const lo: RankedNumber[] = [];
  for (let n = 0; n < 100; n++) {
    const hits = loHits.get(n) ?? 0;
    const lastAgo = loLast.get(n) === -1 ? null : loLast.get(n)!;
    lo.push({
      n, hits,
      rate: windowDraws ? hits / windowDraws : 0,
      lastAgo,
      score: scoreNumber(hits, windowDraws, lastAgo),
      label: pad2(n),
    });
  }
  lo.sort((a, b) => b.score - a.score || b.hits - a.hits);

  return { windowDraws, totalDraws, de2, de3, lo };
}

export function normalizeDraw(raw: Record<string, unknown>): XsmbDraw | null {
  const dateRaw = String(raw.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return null;
  const special = Number(raw.special);
  if (!Number.isFinite(special) || special < 0) return null;
  const prizes: number[] = [];
  const keys = [
    "prize1", "prize2_1", "prize2_2",
    "prize3_1", "prize3_2", "prize3_3", "prize3_4", "prize3_5", "prize3_6",
    "prize4_1", "prize4_2", "prize4_3", "prize4_4",
    "prize5_1", "prize5_2", "prize5_3", "prize5_4", "prize5_5", "prize5_6",
    "prize6_1", "prize6_2", "prize6_3",
    "prize7_1", "prize7_2", "prize7_3", "prize7_4",
  ];
  for (const k of keys) {
    const v = Number(raw[k]);
    if (Number.isFinite(v) && v >= 0) prizes.push(v);
  }
  if (prizes.length < 4) return null;
  return { date: dateRaw, special: Math.trunc(special), prizes };
}

export function sortDraws(draws: XsmbDraw[]): XsmbDraw[] {
  return [...draws].sort((a, b) => a.date.localeCompare(b.date));
}
