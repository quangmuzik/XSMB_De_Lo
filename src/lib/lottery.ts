export type Draw = {
  id: string;
  date: string;
  nums: number[];
  bonus: number | null;
};

const P_NUM = 6 / 55;
const P_PAIR = (6 * 5) / (55 * 54);

export const WINDOWS = [
  { id: 40, label: "40 kỳ" },
  { id: 80, label: "80 kỳ" },
  { id: 160, label: "160 kỳ" },
  { id: 400, label: "400 kỳ" },
  { id: 0, label: "Tất cả" },
] as const;

export type WindowId = (typeof WINDOWS)[number]["id"];

export const SIZES = [2, 3, 4, 5, 6] as const;
export type SetSize = (typeof SIZES)[number];

export type Combo = {
  nums: number[];
  factor: number;
  chance: number;
  baseline: number;
  weakest: number;
  hitsWindow: number;
  hitsAll: number;
  lastAgo: number | null;
  bestPair: [number, number, number];
};

export type HotNumber = {
  n: number;
  factor: number;
  hits: number;
  lastAgo: number;
};

export type Ranked = {
  windowDraws: number;
  totalDraws: number;
  combos: Combo[];
  hot: HotNumber[];
};

const POOL: Record<SetSize, number> = {
  2: 55,
  3: 34,
  4: 26,
  5: 21,
  6: 18,
};

export function baselineProb(k: number): number {
  let p = 1;
  for (let i = 0; i < k; i++) p *= (6 - i) / (55 - i);
  return p;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function weekday(iso: string): string {
  const names = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"] as const;
  return names[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

export function nextDrawDate(lastIso: string): string {
  const start = Date.parse(`${lastIso}T00:00:00Z`);
  for (let step = 1; step <= 5; step++) {
    const day = new Date(start + step * 86_400_000).getUTCDay();
    if (day === 2 || day === 4 || day === 6) {
      return new Date(start + step * 86_400_000).toISOString().slice(0, 10);
    }
  }
  return lastIso;
}

export function nextDrawId(lastId: string): string {
  return String(Number(lastId) + 1).padStart(lastId.length, "0");
}

export function ballLabel(n: number): string {
  return String(n).padStart(2, "0");
}

export function agoLabel(ago: number | null): string {
  if (ago === null) return "chưa từng về đủ bộ";
  if (ago === 0) return "vừa về kỳ mới nhất";
  if (ago === 1) return "1 kỳ trước";
  return `${ago} kỳ trước`;
}

export function oneInLabel(probability: number): string {
  if (!Number.isFinite(probability) || probability <= 0) return "—";
  const n = 1 / probability;
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  const [whole, frac] = rounded.toFixed(n >= 100 ? 0 : 1).split(".");
  const withDots = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (!frac || Number(frac) === 0) return withDots;
  return `${withDots},${frac}`;
}

export function factorLabel(factor: number): string {
  return `${factor.toFixed(1).replace(".", ",")}×`;
}

function sliceWindow(draws: Draw[], windowId: WindowId): Draw[] {
  if (windowId <= 0 || windowId >= draws.length) return draws;
  return draws.slice(0, windowId);
}

function containsAll(drawNums: number[], set: number[]): boolean {
  let i = 0;
  for (const n of set) {
    while (i < drawNums.length && drawNums[i] < n) i++;
    if (i >= drawNums.length || drawNums[i] !== n) return false;
    i++;
  }
  return true;
}

function enumerateSubsets(nums: number[], k: number, visit: (key: string) => void) {
  const chosen: number[] = [];
  const walk = (start: number) => {
    if (chosen.length === k) {
      visit(chosen.join("-"));
      return;
    }
    const need = k - chosen.length;
    for (let i = start; i <= nums.length - need; i++) {
      chosen.push(nums[i]);
      walk(i + 1);
      chosen.pop();
    }
  };
  walk(0);
}

function recentPenalty(draws: Draw[], set: number[], k: number): number {
  let factor = 1;
  const latest = draws[0];
  const prev = draws[1];
  if (latest && containsAll(latest.nums, set)) {
    if (k >= 6) factor *= 0.12;
    else if (k >= 5) factor *= 0.22;
    else if (k >= 4) factor *= 0.45;
    else if (k >= 3) factor *= 0.72;
  } else if (prev && k >= 5 && containsAll(prev.nums, set)) {
    factor *= 0.55;
  }
  return factor;
}

export function rankSets(draws: Draw[], windowId: WindowId, k: SetSize, limit = 8): Ranked {
  const window = sliceWindow(draws, windowId);
  const n = window.length;
  const uniform = windowId === 0;
  const numW = new Float64Array(56);
  const pairW = new Float64Array(56 * 56);
  const hits = new Int16Array(56);
  const lastAgo = new Int16Array(56).fill(-1);
  let weightSum = 0;

  for (let t = 0; t < n; t++) {
    const wt = uniform || n === 1 ? 1 : 0.55 + 0.45 * (1 - t / (n - 1));
    weightSum += wt;
    const nums = window[t].nums;
    for (let a = 0; a < nums.length; a++) {
      const i = nums[a];
      numW[i] += wt;
      hits[i]++;
      if (lastAgo[i] < 0) lastAgo[i] = t;
      for (let b = a + 1; b < nums.length; b++) {
        pairW[i * 56 + nums[b]] += wt;
      }
    }
  }

  const kappaW = 24 * (weightSum / n);
  const numFactor = (i: number) => (numW[i] + kappaW * P_NUM) / ((weightSum + kappaW) * P_NUM);
  const pairFactor = (i: number, j: number) => {
    const lo = i < j ? i : j;
    const hi = i < j ? j : i;
    return (pairW[lo * 56 + hi] + kappaW * P_PAIR) / ((weightSum + kappaW) * P_PAIR);
  };

  const hotOrder = Array.from({ length: 55 }, (_, i) => i + 1).sort(
    (a, b) => numFactor(b) - numFactor(a) || a - b,
  );

  const poolSet = new Set<number>(hotOrder.slice(0, Math.min(10, POOL[k])));
  if (k > 2) {
    const pairs: { i: number; j: number; f: number }[] = [];
    for (let i = 1; i <= 55; i++) {
      for (let j = i + 1; j <= 55; j++) pairs.push({ i, j, f: pairFactor(i, j) });
    }
    pairs.sort((a, b) => b.f - a.f);
    for (const pair of pairs) {
      if (poolSet.size >= POOL[k]) break;
      poolSet.add(pair.i);
      if (poolSet.size >= POOL[k]) break;
      poolSet.add(pair.j);
    }
  } else {
    for (const value of hotOrder) poolSet.add(value);
  }
  for (const value of hotOrder) {
    if (poolSet.size >= POOL[k]) break;
    poolSet.add(value);
  }
  const pool = [...poolSet].sort((a, b) => a - b);

  const windowHits = new Map<string, number>();
  for (const draw of window) {
    enumerateSubsets(draw.nums, k, (key) => {
      windowHits.set(key, (windowHits.get(key) ?? 0) + 1);
    });
  }

  type Draft = {
    nums: number[];
    factor: number;
    weakest: number;
    bestPair: [number, number, number];
    hitsWindow: number;
  };

  const drafts: Draft[] = [];
  const chosen: number[] = [];

  const scoreChosen = () => {
    let logPair = 0;
    let inv = 0;
    let pairs = 0;
    let weakest = Number.POSITIVE_INFINITY;
    let best: [number, number, number] = [chosen[0], chosen[1], 0];
    for (let a = 0; a < chosen.length; a++) {
      for (let b = a + 1; b < chosen.length; b++) {
        const f = pairFactor(chosen[a], chosen[b]);
        if (f < weakest) weakest = f;
        if (f > best[2]) best = [chosen[a], chosen[b], f];
        logPair += Math.log(f);
        inv += 1 / f;
        pairs++;
      }
    }
    const geomPair = Math.exp(logPair / pairs);
    const harmPair = pairs / inv;
    let logNum = 0;
    for (const value of chosen) logNum += Math.log(numFactor(value));
    const geomNum = Math.exp(logNum / chosen.length);
    const nums = chosen.slice();
    const weakGate = k >= 4 ? Math.min(1, weakest / 0.85) : 1;
    const factor = harmPair ** 0.72 * geomPair ** 0.28 * geomNum ** 0.3 * weakGate * recentPenalty(draws, nums, k);
    drafts.push({
      nums,
      factor,
      weakest,
      bestPair: best,
      hitsWindow: windowHits.get(nums.join("-")) ?? 0,
    });
  };

  const walk = (start: number) => {
    if (chosen.length === k) {
      scoreChosen();
      return;
    }
    const need = k - chosen.length;
    for (let i = start; i <= pool.length - need; i++) {
      chosen.push(pool[i]);
      walk(i + 1);
      chosen.pop();
    }
  };
  walk(0);

  drafts.sort((a, b) => b.factor - a.factor || b.hitsWindow - a.hitsWindow || a.nums[0] - b.nums[0]);
  const top = drafts.slice(0, limit);
  const base = baselineProb(k);

  const combos: Combo[] = top.map((draft) => {
    let hitsAll = 0;
    let seen: number | null = null;
    for (let t = 0; t < draws.length; t++) {
      if (!containsAll(draws[t].nums, draft.nums)) continue;
      hitsAll++;
      if (seen === null) seen = t;
    }
    return {
      nums: draft.nums,
      factor: draft.factor,
      chance: base * draft.factor,
      baseline: base,
      weakest: draft.weakest,
      hitsWindow: draft.hitsWindow,
      hitsAll,
      lastAgo: seen,
      bestPair: draft.bestPair,
    };
  });

  const hot: HotNumber[] = hotOrder.slice(0, 12).map((value) => ({
    n: value,
    factor: numFactor(value),
    hits: hits[value],
    lastAgo: lastAgo[value],
  }));

  return { windowDraws: n, totalDraws: draws.length, combos, hot };
}
