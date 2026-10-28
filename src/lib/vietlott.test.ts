import assert from "node:assert/strict";
import test from "node:test";
import type { Draw } from "./lottery.ts";
import {
  archiveUsable,
  composeDraws,
  expectedDrawDate,
  parseJsonl,
  parseMinhNgoc,
  parseOfficialHtml,
} from "./vietlott.ts";

function draw(id: string, date: string, nums: number[], bonus: number | null = 1): Draw {
  return { id, date, nums, bonus };
}

function base(): Draw[] {
  return [
    draw("00002", "2017-08-03", [4, 9, 24, 25, 27, 45], 40),
    draw("00001", "2017-08-01", [5, 10, 14, 23, 24, 38], 35),
  ];
}

test("expected draw waits until 18:45 ICT on a draw day", () => {
  const before = expectedDrawDate(new Date("2026-10-27T10:00:00Z"));
  const after = expectedDrawDate(new Date("2026-10-27T12:00:00Z"));
  const nextMorning = expectedDrawDate(new Date("2026-10-28T02:00:00Z"));
  assert.equal(before, "2026-10-24");
  assert.equal(after, "2026-10-27");
  assert.equal(nextMorning, "2026-10-27");
});

test("parse jsonl keeps a draw with no bonus and skips garbage", () => {
  const text = [
    '{"date":"2017-08-01","id":"00001","result":[5,10,14,23,24,38,35]}',
    "not json",
    '{"date":"2022-09-23","id":"00944","result":[1,12,21,28,30,44]}',
    '{"date":"2026-10-27","id":"01416","result":[9,18,27,28,31,35,50]}',
  ].join("\n");
  const draws = parseJsonl(text);
  assert.equal(draws.length, 3);
  assert.equal(draws.find((item) => item.id === "00944")?.bonus, null);
  assert.deepEqual(draws.find((item) => item.id === "01416")?.nums, [9, 18, 27, 28, 31, 35]);
});

test("parse official html rows", () => {
  const html = `<table><tr><td>Ngày</td><td>Kỳ</td></tr>
    <tr><td>27/10/2026</td><td>01416</td><td><span>09</span><span>18</span><span>27</span><span>28</span><span>31</span><span>35</span><span>|</span><span>50</span></td></tr>
    </table>`;
  const draws = parseOfficialHtml(html);
  assert.equal(draws.length, 1);
  assert.equal(draws[0].bonus, 50);
  assert.equal(draws[0].date, "2026-10-27");
});

test("cloudflare challenge is not parsed as results", () => {
  assert.deepEqual(parseOfficialHtml("<html><title>Just a moment...</title></html>"), []);
});

test("parse minh ngoc latest block", () => {
  const html = `<span id="DT6X45_KY_VE">#01417</span> | Ng&agrave;y quay thưởng 29/10/2026
    <div class="finnish1 bool">01</div><div class="finnish2 bool">02</div>
    <div class="finnish3 bool">03</div><div class="finnish4 bool">04</div>
    <div class="finnish5 bool">05</div><div class="finnish6 bool">06</div>
    <div class="finnish7 bool">07</div>`;
  const draw = parseMinhNgoc(html);
  assert.equal(draw?.id, "01417");
  assert.equal(draw?.date, "2026-10-29");
  assert.equal(draw?.bonus, 7);
});

test("archive must look like the full history", () => {
  const bundled = [draw("01416", "2026-10-27", [9, 18, 27, 28, 31, 35], 50)];
  const tiny = [draw("00001", "2017-08-01", [5, 10, 14, 23, 24, 38], 35)];
  assert.equal(archiveUsable(tiny, 1416, 1416), false);
});

test("compose appends only the immediate next draw and refuses a gap", () => {
  const bundled = [
    draw("01416", "2026-10-27", [9, 18, 27, 28, 31, 35], 50),
    draw("01415", "2026-10-24", [6, 7, 18, 41, 44, 50], 53),
  ];
  const appended = composeDraws(
    bundled,
    {
      official: [],
      officialError: "vietlott.vn chặn truy cập tự động.",
      archive: [],
      archiveError: "Không tải được kho.",
      mirror: draw("01417", "2026-10-29", [1, 2, 3, 4, 5, 6], 7),
      mirrorError: null,
    },
    new Date("2026-10-29T13:00:00Z"),
  );
  assert.equal(appended.status.ok, true);
  assert.equal(appended.status.added, 1);
  assert.equal(appended.draws[0].id, "01417");

  const gapped = composeDraws(
    bundled,
    {
      official: [],
      officialError: "vietlott.vn chặn truy cập tự động.",
      archive: [],
      archiveError: "Không tải được kho.",
      mirror: draw("01420", "2026-11-05", [1, 2, 3, 4, 5, 6], 7),
      mirrorError: null,
    },
    new Date("2026-11-05T13:00:00Z"),
  );
  assert.equal(gapped.status.ok, false);
  assert.equal(gapped.draws[0].id, "01416");
  assert.match(gapped.status.error ?? "", /Không lấy được/);
  assert.match(gapped.status.warning ?? "", /không chèn/);
});

test("failed sources keep the saved history and do not claim success", () => {
  const bundled = base();
  const result = composeDraws(
    bundled,
    {
      official: [],
      officialError: "vietlott.vn chặn truy cập tự động.",
      archive: [],
      archiveError: "Không tải được kho vietlott-data.",
      mirror: null,
      mirrorError: "Không tải được Minh Ngọc.",
    },
    new Date("2026-10-27T13:00:00Z"),
  );
  assert.equal(result.status.ok, false);
  assert.equal(result.status.live, false);
  assert.equal(result.draws.length, 2);
  assert.match(result.status.error ?? "", /vietlott-data/);
});

test("official numbers replace the archive on the same id", () => {
  const bundled = [draw("01416", "2026-10-27", [1, 2, 3, 4, 5, 6], 7)];
  const result = composeDraws(
    bundled,
    {
      official: [draw("01416", "2026-10-27", [9, 18, 27, 28, 31, 35], 50)],
      officialError: null,
      archive: [draw("01416", "2026-10-27", [1, 2, 3, 4, 5, 6], 7)],
      archiveError: null,
      mirror: null,
      mirrorError: null,
    },
    new Date("2026-10-27T13:00:00Z"),
  );
  assert.deepEqual(result.draws[0].nums, [9, 18, 27, 28, 31, 35]);
  assert.equal(result.status.ok, true);
  assert.equal(result.status.behind, false);
});
