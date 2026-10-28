import rawDraws from "../data/power655.json" with { type: "json" };
import {
  archiveUsable,
  composeDraws,
  maxDrawId,
  normalizeDraw,
  parseJsonl,
  parseMinhNgoc,
  parseOfficialHtml,
  sortDraws,
  type DrawSnapshot,
  type Gathered,
} from "@/lib/vietlott";
import type { Draw } from "@/lib/lottery";

type RawDraw = [string, string, number[], number | null];

const ARCHIVE_URLS = [
  {
    url: "https://raw.githubusercontent.com/vietvudanh/vietlott-data/main/data/power655.jsonl",
    headers: { Accept: "text/plain,*/*" },
  },
  {
    url: "https://api.github.com/repos/vietvudanh/vietlott-data/contents/data/power655.jsonl",
    headers: {
      Accept: "application/vnd.github.raw",
      "User-Agent": "Power655Stats/1.0",
    },
  },
  {
    url: "https://cdn.jsdelivr.net/gh/vietvudanh/vietlott-data@main/data/power655.jsonl",
    headers: { Accept: "text/plain,*/*" },
  },
] as const;

const OFFICIAL_URL =
  "https://vietlott.vn/ajaxpro/Vietlott.PlugIn.WebParts.Game655CompareWebPart,Vietlott.PlugIn.WebParts.ashx";

const MIRROR_URL = "https://www.minhngoc.net.vn/ket-qua-xo-so/dien-toan-vietlott/power-6x55.html";

let bundledCache: Draw[] | null = null;
let memory: { savedAt: number; snapshot: DrawSnapshot } | null = null;

export function bundledDraws(): Draw[] {
  if (bundledCache) return bundledCache;
  const parsed: Draw[] = [];
  for (const row of rawDraws as RawDraw[]) {
    const draw = normalizeDraw(String(row[0]), String(row[1]), row[2], row[3] ?? null);
    if (draw) parsed.push(draw);
  }
  bundledCache = sortDraws(parsed);
  return bundledCache;
}

async function fetchText(url: string, ms: number, headers: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Power655Stats/1.0 (statistics mirror of public Vietlott results)",
      ...headers,
    },
    signal: AbortSignal.timeout(ms),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchOfficial(): Promise<{ draws: Draw[]; error: string | null }> {
  try {
    const body = {
      ORenderInfo: {
        SiteId: "main.frontend.vi",
        SiteAlias: "main.vi",
        UserSessionId: "",
        SiteLang: "vi",
        IsPageDesign: false,
        ExtraParam1: "",
        ExtraParam2: "",
        ExtraParam3: "",
        SiteURL: "",
        WebPage: null,
        SiteName: "Vietlott",
        OrgPageAlias: null,
        PageAlias: null,
        FullPageAlias: null,
        RefKey: null,
        System: 1,
      },
      Key: "23bbd667",
      GameDrawId: "",
      ArrayNumbers: Array.from({ length: 5 }, () => Array.from({ length: 18 }, () => "")),
      CheckMulti: false,
      PageIndex: 1,
    };
    const response = await fetch(OFFICIAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=UTF-8",
        "X-AjaxPro-Method": "ServerSideDrawResult",
        Origin: "https://vietlott.vn",
        Referer: "https://vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/655",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    const text = await response.text();
    if (!response.ok || /just a moment|cf-browser-verification/i.test(text)) {
      return { draws: [], error: "vietlott.vn chặn truy cập tự động." };
    }
    let html = text;
    try {
      const parsed = JSON.parse(text) as { value?: { HtmlContent?: string } };
      if (parsed.value?.HtmlContent) html = parsed.value.HtmlContent;
    } catch {
      // HTML body is fine.
    }
    const draws = parseOfficialHtml(html);
    if (draws.length === 0) return { draws: [], error: "vietlott.vn không trả bảng kết quả đọc được." };
    return { draws, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "lỗi mạng";
    return { draws: [], error: `Không gọi được vietlott.vn (${message}).` };
  }
}

async function fetchArchive(bundled: Draw[]): Promise<{ draws: Draw[]; error: string | null }> {
  const deadline = Date.now() + 8000;
  const errors: string[] = [];
  for (const source of ARCHIVE_URLS) {
    const ms = deadline - Date.now();
    if (ms < 700) break;
    try {
      const text = await fetchText(source.url, ms, { ...source.headers });
      const draws = parseJsonl(text);
      if (!archiveUsable(draws, bundled.length, maxDrawId(bundled))) {
        errors.push("kho vietlott-data thiếu hoặc bị cắt.");
        continue;
      }
      return { draws, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "lỗi mạng";
      errors.push(message);
    }
  }
  return {
    draws: [],
    error: `Không tải được kho vietlott-data (${errors[errors.length - 1] ?? "hết thời gian chờ"}).`,
  };
}

async function fetchMirror(): Promise<{ draw: Draw | null; error: string | null }> {
  try {
    const html = await fetchText(MIRROR_URL, 8000, {
      Accept: "text/html",
      "Accept-Language": "vi-VN,vi;q=0.9",
    });
    const draw = parseMinhNgoc(html);
    if (!draw) return { draw: null, error: "Minh Ngọc không có kỳ Power 6/55 đọc được." };
    return { draw, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "lỗi mạng";
    return { draw: null, error: `Không tải được Minh Ngọc (${message}).` };
  }
}

function ttl(snapshot: DrawSnapshot): number {
  if (!snapshot.status.ok) return 60_000;
  if (snapshot.status.behind) return 3 * 60_000;
  return 15 * 60_000;
}

function withClock(
  composed: ReturnType<typeof composeDraws>,
  checkedAt: string,
  fetchedAt: string | null,
): DrawSnapshot {
  return {
    draws: composed.draws,
    status: {
      ok: composed.status.ok,
      behind: composed.status.behind,
      sourceLabel: composed.status.sourceLabel,
      checkedAt,
      fetchedAt,
      error: composed.status.error,
      warning: composed.status.warning,
      added: composed.status.added,
      latestId: composed.status.latestId,
      latestDate: composed.status.latestDate,
      drawCount: composed.status.drawCount,
      expectedDate: composed.status.expectedDate,
    },
  };
}

async function gather(bundled: Draw[]): Promise<Gathered> {
  const [official, archive, mirror] = await Promise.all([
    fetchOfficial(),
    fetchArchive(bundled),
    fetchMirror(),
  ]);
  return {
    official: official.draws,
    officialError: official.error,
    archive: archive.draws,
    archiveError: archive.error,
    mirror: mirror.draw,
    mirrorError: mirror.error,
  };
}

export async function syncDraws(force = false): Promise<DrawSnapshot> {
  const nowMs = Date.now();
  if (!force && memory && nowMs - memory.savedAt < ttl(memory.snapshot)) {
    return memory.snapshot;
  }

  const bundled = bundledDraws();
  const checkedAt = new Date(nowMs).toISOString();
  try {
    const gathered = await gather(bundled);
    const composed = composeDraws(bundled, gathered, new Date(nowMs));
    const previousGood = memory?.snapshot.status.ok ? memory.snapshot : null;
    const snapshot = composed.status.live
      ? withClock(composed, checkedAt, checkedAt)
      : withClock(
          {
            ...composed,
            draws: previousGood?.draws ?? composed.draws,
            status: {
              ...composed.status,
              latestId: (previousGood?.draws[0] ?? composed.draws[0])?.id ?? "",
              latestDate: (previousGood?.draws[0] ?? composed.draws[0])?.date ?? "",
              drawCount: (previousGood?.draws ?? composed.draws).length,
              added: previousGood?.status.added ?? composed.status.added,
              behind: previousGood?.status.behind ?? composed.status.behind,
              sourceLabel: previousGood?.status.sourceLabel ?? composed.status.sourceLabel,
            },
          },
          checkedAt,
          previousGood?.status.fetchedAt ?? null,
        );
    if (!composed.status.live && previousGood) {
      snapshot.draws = previousGood.draws;
    }
    memory = { savedAt: nowMs, snapshot };
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "lỗi không xác định";
    const fallbackDraws = memory?.snapshot.draws ?? bundled;
    const latest = fallbackDraws[0];
    const snapshot: DrawSnapshot = {
      draws: fallbackDraws,
      status: {
        ok: false,
        behind: memory?.snapshot.status.behind ?? false,
        sourceLabel: memory?.snapshot.status.sourceLabel ?? "bản lưu trong ứng dụng",
        checkedAt,
        fetchedAt: memory?.snapshot.status.fetchedAt ?? null,
        error: `Không lấy được dữ liệu mới (${message}).`,
        warning: null,
        added: memory?.snapshot.status.added ?? 0,
        latestId: latest?.id ?? "",
        latestDate: latest?.date ?? "",
        drawCount: fallbackDraws.length,
        expectedDate: memory?.snapshot.status.expectedDate ?? "",
      },
    };
    memory = { savedAt: nowMs, snapshot };
    return snapshot;
  }
}
