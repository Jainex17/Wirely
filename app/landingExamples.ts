/**
 * Three example screens for the landing page: one habit tracker brief in
 * three layout directions, the kind of set an agent writes over MCP. They are
 * static HTML rendered through srcdoc in a sandbox with no scripts, like page
 * previews in the editor, so the landing shows real pages instead of a mockup.
 * Every frame is 390 by 844, a phone screen.
 *
 * The hero copies replay an agent writing each page: sections land top to
 * bottom while an "Agent" cursor follows, the same thing the editor shows
 * when an agent writes over MCP. It is plain CSS, so it runs without scripts,
 * plays once, and is skipped under prefers-reduced-motion.
 */

const BASE_CSS =
  "*{box-sizing:border-box;margin:0;padding:0}" +
  "html,body{width:390px;height:844px;overflow:hidden}" +
  "body{position:relative;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}";

/** Registered so a ring's fill can animate; a plain custom property cannot. */
const RING_PROPERTY = "@property --p{syntax:'<percentage>';inherits:false;initial-value:0%}";

const MOTION_CSS =
  "@media (prefers-reduced-motion:no-preference){" +
  "[data-w]{animation:write .55s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--start,0s) + var(--d,0s))}" +
  "[data-pop]{animation:pop .4s cubic-bezier(.34,1.56,.64,1) both;animation-delay:calc(var(--start,0s) + var(--d,0s))}" +
  "[data-grow]{transform-origin:bottom;animation:grow .7s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--start,0s) + var(--d,0s))}" +
  "[data-ring]{animation:ring 1.1s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--start,0s) + var(--d,0s))}" +
  ".agent{animation:cursor var(--run) linear both;animation-delay:var(--start,0s)}" +
  "}" +
  "@keyframes write{from{opacity:0;transform:translateY(10px)}}" +
  "@keyframes pop{from{opacity:0;transform:scale(.3)}}" +
  "@keyframes grow{from{transform:scaleY(0)}}" +
  "@keyframes ring{from{--p:0%}}" +
  ".agent{position:absolute;left:0;top:0;z-index:9;pointer-events:none;opacity:0}" +
  ".agent i{display:block;width:15px;height:15px;background:#38bdf8;clip-path:polygon(0 0,100% 42%,48% 54%,34% 100%)}" +
  ".agent span{display:inline-block;margin:1px 0 0 13px;padding:4px 7px;border-radius:6px;background:#38bdf8;" +
  "color:#04121c;font:700 11px/1 ui-sans-serif,system-ui,sans-serif}";

/** Where the cursor is at each second of a page's write, as [second, x, y]. */
type CursorPath = Array<[number, number, number]>;

const cursorCss = (path: CursorPath) => {
  const end = path[path.length - 1][0] + 0.4;
  const stops = path
    .map(([time, x, y], index) => {
      const opacity = index === 0 ? 0 : 1;
      return `${((time / end) * 100).toFixed(1)}%{opacity:${opacity};transform:translate(${x}px,${y}px)}`;
    })
    .join("");
  const [, lastX, lastY] = path[path.length - 1];
  return `.agent{--run:${end}s}@keyframes cursor{${stops}100%{opacity:0;transform:translate(${lastX}px,${lastY}px)}}`;
};

const CURSOR_HTML = '<div class="agent" aria-hidden="true"><i></i><span>Agent</span></div>';

/** Attributes that make an element land at `d` seconds into its page's write. */
const at = (kind: "w" | "pop" | "grow" | "ring", d: number, style = "") =>
  ` data-${kind} style="--d:${d.toFixed(2)}s;${style}"`;

interface Screen {
  css: string;
  body: string;
  cursor: CursorPath;
}

/**
 * `start` delays the whole write, so hero frames land one after another. The
 * feature card copies write themselves without a cursor; their frames load
 * lazily, so that happens as the reader scrolls to them.
 */
const page = (screen: Screen, { start, cursor }: { start: number; cursor: boolean }) =>
  "<!doctype html><html><head><meta charset=\"utf-8\"><style>" +
  RING_PROPERTY +
  BASE_CSS +
  screen.css +
  MOTION_CSS +
  (cursor ? cursorCss(screen.cursor) : "") +
  `</style></head><body style="--start:${start}s">${screen.body}${cursor ? CURSOR_HTML : ""}</body></html>`;

// A fixed pattern so the heatmap looks lived-in and renders the same on the
// server and the client.
const HEAT_LEVELS = [
  0, 1, 2, 3, 2, 0, 1, 2, 3, 3, 1, 0, 2, 3, 1, 2, 3, 3, 2, 1, 0, 3, 3, 2, 3, 1, 2, 3,
  3, 2, 3, 0, 0, 0, 0,
];

const calendar = (picked: boolean): Screen => ({
  body: `
<header class="top"${at("w", 0)}><h1>September</h1><span class="muted">23 of 30 days</span></header>
<div class="wk"${at("w", 0.25)}><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
<div class="grid">${HEAT_LEVELS.map((level, index) => `<span class="l${level}"${at("pop", 0.35 + index * 0.025)}></span>`).join("")}</div>
<section class="card${picked ? " picked" : ""}"${at("w", 1.3)}>
  <h2>Today</h2>
  <div class="row"${at("w", 1.45)}><span class="box done"></span><span class="name">Morning run</span><span class="meta">5 km</span></div>
  <div class="row"${at("w", 1.6)}><span class="box done"></span><span class="name">Read 20 pages</span><span class="meta">p. 184</span></div>
  <div class="row"${at("w", 1.75)}><span class="box"></span><span class="name">Stretch</span><span class="meta">10 min</span></div>
  <div class="row"${at("w", 1.9)}><span class="box"></span><span class="name">No phone in bed</span><span class="meta">22:00</span></div>
</section>
<nav class="tabs"${at("w", 2.1)}><span class="on">Month</span><span>Habits</span><span>Stats</span></nav>`,
  css:
    "body{background:#f4f6f3;color:#15201a;padding:58px 22px 0}" +
    ".top{display:flex;justify-content:space-between;align-items:baseline}" +
    "h1{font-size:32px;letter-spacing:-.03em}.muted{color:#6b7a70;font-size:14px}" +
    ".wk,.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}" +
    ".wk{margin-top:22px;font-size:11px;color:#8a978e;text-align:center}.grid{margin-top:8px}" +
    ".grid span{aspect-ratio:1;border-radius:8px}" +
    ".l0{background:#e2e7e1}.l1{background:#bfe3c8}.l2{background:#7cc795}.l3{background:#2f9e5b}" +
    ".card{margin-top:24px;background:#fff;border-radius:20px;padding:18px 18px 6px;box-shadow:0 1px 2px rgba(20,40,30,.06)}" +
    ".picked{outline:2.5px solid #38bdf8;outline-offset:5px}" +
    "@media (prefers-reduced-motion:no-preference){.card.picked{animation:write .55s cubic-bezier(.16,1,.3,1) 1.3s both,pick .7s cubic-bezier(.16,1,.3,1) 2.3s both}}" +
    "@keyframes pick{from{outline-color:transparent;outline-offset:16px}}" +
    "h2{font-size:15px;color:#6b7a70;font-weight:600;margin-bottom:4px}" +
    ".row{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid #eef1ec}" +
    "h2+.row{border-top:0}" +
    ".box{width:22px;height:22px;border-radius:7px;border:2px solid #c9d3cb}" +
    ".done{background:#2f9e5b;border-color:#2f9e5b}" +
    ".name{flex:1;font-size:15px;font-weight:600}.meta{font-size:13px;color:#8a978e}" +
    ".tabs{position:absolute;left:22px;right:22px;bottom:30px;display:flex;justify-content:space-around;" +
    "background:#15201a;color:#9fb0a5;border-radius:999px;padding:14px;font-size:13px;font-weight:600}" +
    ".tabs .on{color:#fff}",
  cursor: [
    [0, 40, 50],
    [0.3, 60, 120],
    [1.2, 330, 330],
    [1.45, 70, 440],
    [1.95, 70, 600],
    [2.2, 200, 770],
  ],
});

const STREAKS = [
  { name: "Morning run", days: 23, pct: 77, color: "#fb923c" },
  { name: "Read 20 pages", days: 41, pct: 92, color: "#a3e635" },
  { name: "Stretch", days: 6, pct: 30, color: "#60a5fa" },
];

// Share of habits done on each day of the week so far.
const WEEK = [80, 100, 60, 0, 0, 0, 0];

const streaks = (pins: boolean): Screen => ({
  body: `
<p class="hello"${at("w", 0)}>Tuesday, 23 Sep</p>
<h1${at("w", 0.15)}>Keep the<br>streaks alive.</h1>
${STREAKS.map(
  (habit, index) => `<section class="card"${at("w", 0.45 + index * 0.2)}>
  <div class="ring"${at("ring", 0.55 + index * 0.2, `--p:${habit.pct}%;--c:${habit.color}`)}><span></span></div>
  <div class="info"><p class="name">${habit.name}</p><p class="sub">${habit.pct}% this month</p></div>
  <p class="days"><b style="color:${habit.color}">${habit.days}</b>days</p>
</section>`,
).join("")}
<section class="week"${at("w", 1.1)}><p>This week</p><div class="bars">${WEEK.map(
  (value, index) =>
    `<span${index === 1 ? ' class="today"' : ""}${at("grow", 1.2 + index * 0.06, `height:${value}%`)}></span>`,
).join("")}</div></section>
<button${at("w", 1.7)}>Log today</button>
${
  pins
    ? `<span class="pin"${at("pop", 0.8, "top:150px;left:334px")}>1</span>` +
      `<p class="bubble"${at("w", 1.1, "top:62px;left:176px")}><b>Priya</b>Make the day count bigger than the ring.</p>` +
      `<span class="pin"${at("pop", 1.5, "top:452px;left:30px")}>2</span>`
    : ""
}`,
  css:
    "body{background:#0f1115;color:#f3f1ea;padding:60px 20px 0}" +
    ".hello{color:#8b909c;font-size:14px}" +
    "h1{font-size:34px;line-height:1.05;letter-spacing:-.03em;margin:10px 0 26px}" +
    ".card{display:flex;align-items:center;gap:14px;background:#181b21;border:1px solid #232730;" +
    "border-radius:22px;padding:16px;margin-bottom:12px}" +
    ".ring{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;flex:none;" +
    "background:conic-gradient(var(--c) var(--p),#262a33 0)}" +
    ".ring span{width:38px;height:38px;border-radius:50%;background:#181b21}" +
    ".info{flex:1}.name{font-size:16px;font-weight:650}.sub{font-size:13px;color:#8b909c;margin-top:3px}" +
    ".days{text-align:right;font-size:12px;color:#8b909c}.days b{display:block;font-size:30px;line-height:1;letter-spacing:-.03em}" +
    "button{position:absolute;left:20px;right:20px;bottom:34px;border:0;border-radius:18px;padding:18px;" +
    "font:inherit;font-size:16px;font-weight:700;background:#f3f1ea;color:#0f1115}" +
    ".pin{position:absolute;width:30px;height:30px;border-radius:50% 50% 50% 4px;background:#38bdf8;color:#04121c;" +
    "display:grid;place-items:center;font-size:14px;font-weight:800;box-shadow:0 6px 16px rgba(0,0,0,.4)}" +
    ".week{margin-top:14px;background:#181b21;border:1px solid #232730;border-radius:22px;padding:16px}" +
    ".week p{font-size:13px;color:#8b909c}" +
    ".bars{display:flex;align-items:flex-end;gap:10px;height:96px;margin-top:12px}" +
    ".bars span{flex:1;min-height:6px;border-radius:8px;background:#2b303a}" +
    ".bars .today{background:#a3e635}" +
    ".bubble{position:absolute;width:172px;background:#f3f1ea;color:#0f1115;border-radius:14px 14px 4px 14px;" +
    "padding:10px 12px;font-size:13px;line-height:1.35;box-shadow:0 10px 24px rgba(0,0,0,.45)}" +
    ".bubble b{display:block;font-size:12px;margin-bottom:2px}",
  cursor: [
    [0, 30, 40],
    [0.2, 40, 110],
    [0.5, 50, 200],
    [0.95, 50, 400],
    [1.3, 120, 560],
    [1.75, 200, 770],
  ],
});

const TIMELINE = [
  { time: "07:00", name: "Morning run", note: "5 km, done", done: true },
  { time: "08:30", name: "Read 20 pages", note: "Done on the train", done: true },
  { time: "13:00", name: "Walk after lunch", note: "Up next", done: false },
  { time: "19:30", name: "Stretch", note: "10 min", done: false },
  { time: "22:00", name: "No phone in bed", note: "Reminder set", done: false },
];

const timeline = (): Screen => ({
  body: `
<header${at("w", 0)}><h1>Today</h1><span class="avatar">MK</span></header>
<div class="days">${["M", "T", "W", "T", "F", "S", "S"]
    .map(
      (day, index) =>
        `<span class="${index === 1 ? "on" : ""}"${at("w", 0.2 + index * 0.04)}>${day}<b>${22 + index}</b></span>`,
    )
    .join("")}</div>
<ol${at("w", 0.55)}>${TIMELINE.map(
    (item, index) =>
      `<li class="${item.done ? "done" : ""}"${at("w", 0.6 + index * 0.18)}><time>${item.time}</time><div><p class="name">${item.name}</p><p class="note">${item.note}</p></div></li>`,
  ).join("")}</ol>
<nav class="tabs"${at("w", 1.6)}><span class="on">Today</span><span>Habits</span><span>Insights</span></nav>`,
  css:
    "body{background:#ffffff;color:#101828;padding:58px 22px 0}" +
    "header{display:flex;justify-content:space-between;align-items:center}" +
    "h1{font-size:32px;letter-spacing:-.03em}" +
    ".avatar{width:38px;height:38px;border-radius:50%;background:#e0e7ff;color:#3730a3;display:grid;place-items:center;font-size:13px;font-weight:700}" +
    ".days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin:22px 0 28px}" +
    ".days span{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0;border-radius:14px;font-size:11px;color:#667085}" +
    ".days b{font-size:15px;color:#101828}.days .on{background:#2563eb;color:#dbe6ff}.days .on b{color:#fff}" +
    "ol{list-style:none;position:relative}" +
    "ol:before{content:'';position:absolute;left:52px;top:8px;bottom:8px;width:2px;background:#e4e7ec}" +
    "li{display:flex;gap:34px;padding:0 0 22px;position:relative}" +
    "li:after{content:'';position:absolute;left:47px;top:4px;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #cbd2dc}" +
    "li.done:after{background:#2563eb;border-color:#2563eb}" +
    "time{width:40px;font-size:13px;color:#667085;padding-top:1px;font-variant-numeric:tabular-nums}" +
    ".name{font-size:16px;font-weight:650}.note{font-size:13px;color:#667085;margin-top:3px}" +
    "li.done .name{color:#667085;text-decoration:line-through}" +
    ".tabs{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-around;" +
    "border-top:1px solid #e4e7ec;padding:16px 0 30px;font-size:13px;font-weight:600;color:#98a2b3}" +
    ".tabs .on{color:#2563eb}",
  cursor: [
    [0, 30, 40],
    [0.2, 60, 110],
    [0.5, 300, 130],
    [0.65, 110, 230],
    [1.4, 110, 480],
    [1.65, 200, 790],
  ],
});

export const LANDING_FRAME = { width: 390, height: 844 } as const;

/**
 * Seconds after load when each hero frame starts being written. They overlap
 * the way a multi-page run writes pages two at a time. The canvas preview
 * types the prompt before the first one.
 */
export const LANDING_WRITE_STARTS = [1.9, 2.6, 3.5] as const;

export const LANDING_DIRECTIONS = [
  { title: "Calendar grid", html: page(calendar(false), { start: LANDING_WRITE_STARTS[0], cursor: true }) },
  { title: "Streak cards", html: page(streaks(false), { start: LANDING_WRITE_STARTS[1], cursor: true }) },
  { title: "Daily timeline", html: page(timeline(), { start: LANDING_WRITE_STARTS[2], cursor: true }) },
] as const;

/** The calendar screen with one element picked, as the element tool shows it. */
export const LANDING_PICKED_HTML = page(calendar(true), { start: 0, cursor: false });

/** The streak screen with review comment pins dropping onto it. */
export const LANDING_REVIEW_HTML = page(streaks(true), { start: 0, cursor: false });
