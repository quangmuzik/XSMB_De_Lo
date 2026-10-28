import { useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Info, TrendingUp } from "lucide-react";
import {
  WINDOWS, rankDeAndLo, formatDate, weekday, nextDrawDate, agoLabel, pad2, pad3, formatSyncTime, tail3,
  type WindowId, type DrawSnapshot, type RankedNumber,
} from "@/lib/xsmb";

type Props = {
  snapshot: DrawSnapshot;
  refreshing: boolean;
  refreshError: string | null;
  onRefresh: () => void;
};

function NumberBall({ label, highlight, size = "md" }: { label: string; highlight?: "hot" | "top"; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-10 min-w-10 px-1.5" : "h-9 min-w-9 px-1";
  const base = `inline-flex ${dim} items-center justify-center rounded-full text-sm font-bold tabular-nums shadow-sm`;
  const colors =
    highlight === "top" ? "bg-amber-500 text-white ring-2 ring-amber-300"
    : highlight === "hot" ? "bg-rose-500 text-white"
    : "bg-white text-slate-800 border border-slate-200";
  return <span className={`${base} ${colors}`}>{label}</span>;
}

function RankTable({
  title, subtitle, items, kind, topN = 15,
}: {
  title: string; subtitle: string; items: RankedNumber[]; kind: "de2" | "de3" | "lo"; topN?: number;
}) {
  const top = items.slice(0, topN);
  const note =
    kind === "de2" ? "Đề 2 so = 2 số cuối giải Đặc biệt. Diem = tan suat + khoang cach lan ve."
    : kind === "de3" ? "Đề 3 so = 3 số cuối giải Đặc biệt. Chi liet ke bo da tung ve trong cua so."
    : "Đuôi lô = 2 số cuối mọi giải (mỗi số đếm 1 lần/kỳ).";

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        <TrendingUp className="h-5 w-5 shrink-0 text-amber-500" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2 pr-2 font-medium">#</th>
              <th className="pb-2 pr-2 font-medium">Số</th>
              <th className="pb-2 pr-2 font-medium">Lần về</th>
              <th className="pb-2 pr-2 font-medium">Tỷ lệ</th>
              <th className="pb-2 font-medium">Lần gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {top.map((item, i) => (
              <tr key={item.n} className={`border-b border-slate-50 ${i < 3 ? "bg-amber-50/60" : ""}`}>
                <td className="py-2.5 pr-2 tabular-nums text-slate-400">{i + 1}</td>
                <td className="py-2.5 pr-2">
                  <NumberBall label={item.label} highlight={i < 3 ? "top" : i < 8 ? "hot" : undefined} size={kind === "de3" ? "lg" : "md"} />
                </td>
                <td className="py-2.5 pr-2 font-medium tabular-nums text-slate-800">{item.hits}</td>
                <td className="py-2.5 pr-2 tabular-nums text-slate-600">
                  {kind === "de3" ? `${(item.rate * 100).toFixed(2)}%` : `${(item.rate * 100).toFixed(1)}%`}
                </td>
                <td className="py-2.5 text-slate-500">{agoLabel(item.lastAgo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{note}</p>
    </section>
  );
}

export function Board({ snapshot, refreshing, refreshError, onRefresh }: Props) {
  const [windowId, setWindowId] = useState<WindowId>(60);
  const { draws, status } = snapshot;
  const ranked = useMemo(() => rankDeAndLo(draws, windowId), [draws, windowId]);
  const latest = draws.length ? draws[draws.length - 1] : null;
  const nextDate = latest ? nextDrawDate(latest.date) : status.expectedDate;
  const de2Top = ranked.de2.slice(0, 5).map((x) => x.label).join(" · ");
  const de3Top = ranked.de3.slice(0, 5).map((x) => x.label).join(" · ");
  const loTop = ranked.lo.slice(0, 8).map((x) => x.label).join(" · ");

  return (
    <main className="desk min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-amber-300/90">Thống kê Xổ số miền Bắc</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Dự đoán đề 2 số · đề 3 số & đuôi lô</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">Dữ liệu thật từ nguồn công khai · Không giả lập · Xếp hạng theo tần suất</p>
            </div>
            <button type="button" onClick={onRefresh} disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow transition hover:bg-amber-400 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Đang cập nhật…" : "Cập nhật dữ liệu"}
            </button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Kỳ mới nhất</p>
              <p className="mt-0.5 font-semibold tabular-nums">{latest ? `${formatDate(latest.date)} · ${weekday(latest.date)}` : "—"}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">ĐB · Đề 2 · Đề 3</p>
              <p className="mt-0.5 font-semibold tabular-nums">
                {latest ? (<>{latest.special} → <span className="text-amber-300">{pad2(latest.special % 100)}</span>{" / "}<span className="text-amber-200">{pad3(tail3(latest.special))}</span></>) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Tổng số kỳ</p>
              <p className="mt-0.5 font-semibold tabular-nums">{status.drawCount.toLocaleString("vi-VN")}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Kỳ tiếp theo</p>
              <p className="mt-0.5 font-semibold tabular-nums">{formatDate(nextDate)}</p>
            </div>
          </div>
        </header>

        {(status.error || status.warning || status.behind || refreshError) && (
          <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${status.error || refreshError ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              {refreshError && <p className="font-medium">{refreshError}</p>}
              {status.error && <p className="font-medium">{status.error}</p>}
              {status.warning && !status.error && <p>{status.warning}</p>}
              {status.behind && !status.error && (
                <p>Dữ liệu chậm hơn kỳ mong đợi ({formatDate(status.expectedDate)}). Đang dùng: <strong>{formatDate(status.latestDate)}</strong>.</p>
              )}
              <p className="text-xs opacity-80">
                Nguồn: {status.sourceLabel} · {formatSyncTime(status.checkedAt)}
              </p>
            </div>
          </div>
        )}

        {!status.error && !status.behind && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Đã cập nhật đến {formatDate(status.latestDate)} · {status.sourceLabel} · {formatSyncTime(status.checkedAt)}</span>
          </div>
        )}

        <section className="rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-amber-900">
            <Info className="h-5 w-5" />
            <h2 className="font-semibold">Gợi ý kỳ {formatDate(nextDate)}</h2>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700/80">Top đề 2 số</p>
              <p className="mt-1 text-lg font-bold tracking-wide text-slate-900">{de2Top || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700/80">Top đề 3 số</p>
              <p className="mt-1 text-lg font-bold tracking-wide text-slate-900">{de3Top || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700/80">Top đuôi lô</p>
              <p className="mt-1 text-lg font-bold tracking-wide text-slate-900">{loTop || "—"}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-amber-800/70">Chỉ mang tính thống kê tham khảo. Xổ số là ngẫu nhiên.</p>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Cửa sổ:</span>
          {WINDOWS.map((w) => (
            <button key={w.id} type="button" onClick={() => setWindowId(w.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${windowId === w.id ? "bg-slate-900 text-white shadow" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {w.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">
            {ranked.windowDraws.toLocaleString("vi-VN")} / {ranked.totalDraws.toLocaleString("vi-VN")} ky
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <RankTable title="Đề 2 số — xác suất cao" subtitle="2 số cuối giải Đặc biệt" items={ranked.de2} kind="de2" />
          <RankTable title="Đề 3 số — xác suất cao" subtitle="3 số cuối giải Đặc biệt" items={ranked.de3} kind="de3" />
        </div>

        <RankTable title="Số đuôi lô kỳ tới" subtitle="2 số cuối các giải — ứng viên lô tô" items={ranked.lo} kind="lo" />

        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Kết quả gần đây</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3 font-medium">Ngày</th>
                  <th className="pb-2 pr-3 font-medium">Thứ</th>
                  <th className="pb-2 pr-3 font-medium">Giải ĐB</th>
                  <th className="pb-2 pr-3 font-medium">Đề 2</th>
                  <th className="pb-2 font-medium">Đề 3</th>
                </tr>
              </thead>
              <tbody>
                {[...draws].reverse().slice(0, 12).map((d) => (
                  <tr key={d.date} className="border-b border-slate-50">
                    <td className="py-2 pr-3 tabular-nums text-slate-700">{formatDate(d.date)}</td>
                    <td className="py-2 pr-3 text-slate-500">{weekday(d.date)}</td>
                    <td className="py-2 pr-3 font-mono font-medium tabular-nums">{d.special}</td>
                    <td className="py-2 pr-3"><NumberBall label={pad2(d.special % 100)} highlight="hot" /></td>
                    <td className="py-2"><NumberBall label={pad3(tail3(d.special))} highlight="top" size="lg" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="pb-8 text-center text-xs text-slate-400">
          Nguồn: GitHub khiemdoan + scrape xoso.com.vn. Chi phuc vu thong ke.
        </footer>
      </div>
    </main>
  );
}
