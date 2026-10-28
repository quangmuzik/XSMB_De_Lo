import rawXsmb from "../data/xsmb.json" with { type: "json" };
import {
  expectedDrawDate, normalizeDraw, sortDraws,
  type DrawSnapshot, type SyncStatus, type XsmbDraw,
} from "@/lib/xsmb";

const ARCHIVE_URLS = [
  { url: "https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.json", label: "GitHub khiemdoan (xsmb.json)" },
  { url: "https://cdn.jsdelivr.net/gh/khiemdoan/vietnam-lottery-xsmb-analysis@main/data/xsmb.json", label: "jsDelivr mirror" },
] as const;

async function scrapeXosoComVn(dateIso: string): Promise<XsmbDraw | null> {
  const [y, m, d] = dateIso.split("-");
  const url = `https://xoso.com.vn/xsmb-${d}-${m}-${y}.html`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "vi-VN,vi;q=0.9",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const specialMatch =
      html.match(/class=["']?[^"'\s>]*special-prize[^"'\s>]*["']?[^>]*>(\d{5})</i) ||
      html.match(/special-prize[^>]*>(\d{5})</i) ||
      html.match(/id=["']?mb_prizeDB[^>]*>(\d{5})</i);
    if (!specialMatch) return null;
    const special = parseInt(specialMatch[1], 10);
    const prizes: number[] = [];
    const numRe = />(\d{2,5})</g;
    let m2; const seen = new Set<string>();
    while ((m2 = numRe.exec(html)) !== null) {
      const s = m2[1];
      if (seen.has(s)) continue;
      seen.add(s);
      const n = parseInt(s, 10);
      if (n === special) continue;
      if (s.length >= 2 && s.length <= 5) prizes.push(n);
    }
    if (prizes.length < 10) return null;
    return { date: dateIso, special, prizes: prizes.slice(0, 30) };
  } catch { return null; }
}

async function scrapeLatestLive(expected: string) {
  let draw = await scrapeXosoComVn(expected);
  if (draw) return { draw, error: null as string | null, source: "xoso.com.vn" };
  const prev = new Date(`${expected}T12:00:00+07:00`);
  prev.setDate(prev.getDate() - 1);
  draw = await scrapeXosoComVn(prev.toISOString().slice(0, 10));
  if (draw) return { draw, error: null, source: "xoso.com.vn (kỳ trước)" };
  return { draw: null, error: "Không scrape được từ xoso.com.vn", source: "—" };
}

async function fetchArchive() {
  for (const src of ARCHIVE_URLS) {
    try {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "XSMB-Stats/1.0", Accept: "application/json,text/plain,*/*" },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      const parsed: XsmbDraw[] = [];
      for (const row of data) {
        const d = normalizeDraw(row as Record<string, unknown>);
        if (d) parsed.push(d);
      }
      if (parsed.length > 1000) return { draws: sortDraws(parsed), error: null as string | null, source: src.label };
    } catch { /* next */ }
  }
  return { draws: [] as XsmbDraw[], error: "Không tải được archive GitHub", source: "—" };
}

let bundledCache: XsmbDraw[] | null = null;
let memory: { savedAt: number; snapshot: DrawSnapshot } | null = null;

export function bundledDraws(): XsmbDraw[] {
  if (bundledCache) return bundledCache;
  const parsed: XsmbDraw[] = [];
  for (const row of rawXsmb as Record<string, unknown>[]) {
    const d = normalizeDraw(row);
    if (d) parsed.push(d);
  }
  bundledCache = sortDraws(parsed);
  return bundledCache;
}

function mergeDraws(base: XsmbDraw[], extra: XsmbDraw[]): XsmbDraw[] {
  const map = new Map<string, XsmbDraw>();
  for (const d of base) map.set(d.date, d);
  for (const d of extra) map.set(d.date, d);
  return sortDraws([...map.values()]);
}

export async function syncDraws(force = false): Promise<DrawSnapshot> {
  const now = Date.now();
  if (!force && memory && now - memory.savedAt < 3 * 60 * 1000) return memory.snapshot;

  const checkedAt = new Date().toISOString();
  const expected = expectedDrawDate();
  let draws = bundledDraws();
  let sourceLabel = "Dữ liệu đóng gói (xsmb.json)";
  let error: string | null = null;
  let warning: string | null = null;
  let added = 0;
  let fetchedAt: string | null = null;

  const archive = await fetchArchive();
  if (archive.draws.length > 0) {
    const before = draws.length;
    draws = mergeDraws(draws, archive.draws);
    added += Math.max(0, draws.length - before);
    sourceLabel = archive.source;
    fetchedAt = checkedAt;
  } else if (archive.error) warning = archive.error;

  const latestDate = draws.length ? draws[draws.length - 1].date : "";
  if (latestDate < expected) {
    const live = await scrapeLatestLive(expected);
    if (live.draw && live.draw.date > latestDate) {
      draws = mergeDraws(draws, [live.draw]);
      added += 1;
      sourceLabel = live.source;
      fetchedAt = checkedAt;
      error = null; warning = null;
    } else {
      error = live.error || `Chưa có kết quả kỳ ${expected}. Dữ liệu mới nhất: ${latestDate}`;
    }
  }

  const finalLatest = draws.length ? draws[draws.length - 1].date : "";
  const status: SyncStatus = {
    ok: !error || draws.length > 0,
    behind: finalLatest < expected,
    sourceLabel, checkedAt, fetchedAt, error, warning, added,
    latestDate: finalLatest, drawCount: draws.length, expectedDate: expected,
  };
  const snapshot: DrawSnapshot = { draws, status };
  memory = { savedAt: now, snapshot };
  return snapshot;
}
