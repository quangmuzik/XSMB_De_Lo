import type { Draw } from "@/lib/lottery";

export type SyncStatus = {
  ok: boolean;
  behind: boolean;
  sourceLabel: string;
  checkedAt: string;
  fetchedAt: string | null;
  error: string | null;
  warning: string | null;
  added: number;
  latestId: string;
  latestDate: string;
  drawCount: number;
  expectedDate: string;
};

export type DrawSnapshot = {
  draws: Draw[];
  status: SyncStatus;
};

export type Gathered = {
  official: Draw[];
  officialError: string | null;
  archive: Draw[];
  archiveError: string | null;
  mirror: Draw | null;
  mirrorError: string | null;
};

const DRAW_DAYS = new Set([2, 4, 6]);

export function ictParts(now = new Date()): { iso: string; minutes: number; utcMs: number } {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return {
    iso,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    utcMs: Date.UTC(y, m, d),
  };
}

export function expectedDrawDate(now = new Date()): string {
  const { minutes, utcMs } = ictParts(now);
  for (let i = 0; i < 7; i++) {
    const dt = new Date(utcMs - i * 86_400_000);
    if (!DRAW_DAYS.has(dt.getUTCDay())) continue;
    if (i === 0 && minutes < 18 * 60 + 45) continue;
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const day = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return ictParts(now).iso;
}

export function formatSyncTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const shifted = new Date(parsed.getTime() + 7 * 60 * 60 * 1000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${hh}:${mm} ${dd}/${mo}/${shifted.getUTCFullYear()} (giờ Việt Nam)`;
}

export function normalizeDraw(
  id: string,
  date: string,
  nums: number[],
  bonus: number | null,
): Draw | null {
  const cleanId = id.trim();
  if (!/^\d{4,6}$/.test(cleanId)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (nums.length !== 6 || nums.some((n) => !Number.isInteger(n))) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  if (new Set(sorted).size !== 6) return null;
  if (sorted.some((n) => n < 1 || n > 55)) return null;
  if (bonus !== null) {
    if (!Number.isInteger(bonus) || bonus < 1 || bonus > 55 || sorted.includes(bonus)) return null;
  }
  return { id: cleanId.padStart(5, "0"), date, nums: sorted, bonus };
}

export function sortDraws(draws: Draw[]): Draw[] {
  return [...draws].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
}

function dedupe(draws: Draw[]): Draw[] {
  const map = new Map<string, Draw>();
  for (const draw of draws) map.set(draw.id, draw);
  return [...map.values()];
}

export function sameDraw(a: Draw, b: Draw): boolean {
  return (
    a.id === b.id &&
    a.date === b.date &&
    a.bonus === b.bonus &&
    a.nums.length === b.nums.length &&
    a.nums.every((n, i) => n === b.nums[i])
  );
}

export function maxDrawId(draws: Draw[]): number {
  let max = 0;
  for (const draw of draws) max = Math.max(max, Number(draw.id));
  return max;
}

export function parseJsonl(text: string): Draw[] {
  const draws: Draw[] = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("<")) continue;
    let row: unknown;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const rec = row as { id?: unknown; date?: unknown; result?: unknown };
    if (typeof rec.id !== "string" && typeof rec.id !== "number") continue;
    if (typeof rec.date !== "string" || !Array.isArray(rec.result)) continue;
    const nums = rec.result.map((value) => Number(value));
    const bonus = nums.length >= 7 && Number.isInteger(nums[6]) ? nums[6] : null;
    const draw = normalizeDraw(String(rec.id), rec.date, nums.slice(0, 6), bonus);
    if (draw) draws.push(draw);
  }
  return dedupe(draws);
}

export function archiveUsable(draws: Draw[], bundledCount: number, bundledMax: number): boolean {
  if (draws.length < 1000) return false;
  if (!draws.some((draw) => draw.id === "00001")) return false;
  const max = maxDrawId(draws);
  if (max + 40 < bundledMax && draws.length + 40 < bundledCount) return false;
  return true;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function parseOfficialHtml(html: string): Draw[] {
  if (/just a moment|cf-browser-verification|attention required/i.test(html) && !/<table/i.test(html)) {
    return [];
  }
  const draws: Draw[] = [];
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[\s\S]*?<\/td>/gi)].map((match) => match[0]);
    if (cells.length < 3) continue;
    const dateText = stripTags(cells[0]);
    const idText = stripTags(cells[1]);
    const dateMatch = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const idMatch = idText.match(/(\d{4,6})/);
    if (!dateMatch || !idMatch) continue;
    const spans = [...cells[2].matchAll(/>(\d{1,2})</g)]
      .map((match) => Number(match[1]))
      .filter((n) => n >= 1 && n <= 55);
    if (spans.length < 6) continue;
    const draw = normalizeDraw(
      idMatch[1],
      `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      spans.slice(0, 6),
      spans.length >= 7 ? spans[6] : null,
    );
    if (draw) draws.push(draw);
  }
  return dedupe(draws);
}

export function parseMinhNgoc(html: string): Draw | null {
  const block = html.match(/id="DT6X45_KY_VE"[\s\S]{0,1800}/i);
  if (!block) return null;
  const chunk = block[0];
  const idMatch = chunk.match(/#(\d{4,6})/);
  const dateMatch = chunk.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!idMatch || !dateMatch) return null;
  const balls = [...chunk.matchAll(/finnish\d+\s+bool">(\d{1,2})</gi)].map((match) => Number(match[1]));
  if (balls.length < 6) return null;
  return normalizeDraw(
    idMatch[1],
    `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
    balls.slice(0, 6),
    balls.length >= 7 ? balls[6] : null,
  );
}

type MirrorDecision = "append" | "confirm" | "conflict" | "gap" | "ignore";

function considerMirror(existing: Draw[], candidate: Draw, today: string): MirrorDecision {
  if (candidate.date > today) return "ignore";
  const prev = existing.find((draw) => draw.id === candidate.id);
  if (prev) return sameDraw(prev, candidate) ? "confirm" : "conflict";
  const max = maxDrawId(existing);
  const latestDate = existing.reduce((maxDate, draw) => (draw.date > maxDate ? draw.date : maxDate), "0000-00-00");
  const nextId = Number(candidate.id);
  if (nextId === max + 1 && candidate.date >= latestDate) return "append";
  if (nextId > max + 1) return "gap";
  return "ignore";
}

function overlay(base: Draw[], incoming: Draw[]): Draw[] {
  const map = new Map(base.map((draw) => [draw.id, draw]));
  for (const draw of incoming) map.set(draw.id, draw);
  return sortDraws([...map.values()]);
}

export function composeDraws(bundled: Draw[], gathered: Gathered, now = new Date()): Omit<DrawSnapshot, "status"> & {
  status: Omit<SyncStatus, "checkedAt" | "fetchedAt"> & { live: boolean };
} {
  const today = ictParts(now).iso;
  const expectedDate = expectedDrawDate(now);
  const bundledIds = new Set(bundled.map((draw) => draw.id));
  let draws = sortDraws(bundled);
  let live = false;
  const sources: string[] = [];
  const problems: string[] = [];

  if (gathered.archiveError) problems.push(gathered.archiveError);
  if (gathered.archive.length > 0) {
    draws = overlay(draws, gathered.archive);
    live = true;
    sources.push("kho vietlott-data (cào từ vietlott.vn)");
  } else if (!gathered.archiveError) {
    problems.push("Kho vietlott-data không có kỳ hợp lệ.");
  }

  if (gathered.officialError) problems.push(gathered.officialError);
  if (gathered.official.length > 0) {
    draws = overlay(draws, gathered.official);
    live = true;
    sources.push("vietlott.vn");
  }

  let mirrorNote: string | null = null;
  if (gathered.mirrorError) problems.push(gathered.mirrorError);
  if (gathered.mirror) {
    const decision = considerMirror(draws, gathered.mirror, today);
    if (decision === "append") {
      draws = sortDraws([...draws, gathered.mirror]);
      live = true;
      sources.push(`kỳ #${gathered.mirror.id} từ Minh Ngọc`);
    } else if (decision === "confirm") {
      live = true;
      sources.push("đối chiếu Minh Ngọc");
    } else if (decision === "gap") {
      mirrorNote = `Minh Ngọc đang có kỳ #${gathered.mirror.id} ngày ${gathered.mirror.date.split("-").reverse().join("/")}, nhưng các kỳ liền trước chưa có trong lịch sử nên không chèn bộ số này vào thống kê.`;
    } else if (decision === "conflict") {
      mirrorNote = `Minh Ngọc lệch số ở kỳ #${gathered.mirror.id} so với lịch sử đã lưu — giữ bộ số cũ, không lấy bản lệch.`;
    }
  }

  const latest = draws[0];
  const added = draws.reduce((count, draw) => count + (bundledIds.has(draw.id) ? 0 : 1), 0);
  const behind = Boolean(latest) && latest.date < expectedDate;
  const sourceLabel = sources.length > 0 ? sources.join(" · ") : "bản lưu trong ứng dụng";

  let warning: string | null = null;
  if (live && behind) {
    const expectedLabel = expectedDate.split("-").reverse().join("/");
    warning = `Kỳ quay ngày ${expectedLabel} chưa có trên nguồn. Thống kê vẫn dừng ở kỳ #${latest.id} ngày ${latest.date.split("-").reverse().join("/")} — chưa cộng kỳ mới.`;
  }
  if (mirrorNote) warning = warning ? `${warning} ${mirrorNote}` : mirrorNote;

  const error = live
    ? null
    : `Không lấy được dữ liệu mới. ${problems.filter(Boolean).join(" ")}`.trim();

  return {
    draws,
    status: {
      ok: live,
      live,
      behind,
      sourceLabel,
      error,
      warning,
      added,
      latestId: latest?.id ?? "",
      latestDate: latest?.date ?? "",
      drawCount: draws.length,
      expectedDate,
    },
  };
}
