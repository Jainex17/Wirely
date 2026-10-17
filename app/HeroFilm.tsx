"use client";

import { useEffect, useRef } from "react";

/**
 * The hero illustration as a live pixel scene on a canvas element: terraced
 * hills in the brand blues under a square sun, shaded clouds drifting past,
 * pines and round trees along the ridges, bushes, flowers and a fence on the
 * ground, a cat sitting on the front hill whose tail sways and who blinks now
 * and then, a butterfly among the flowers, and a flock of birds crossing the
 * sky every so often.
 *
 * Everything is drawn in the usual pixel-art way: a dark outline, a base
 * tone, a shade, and a highlight, with dither bands where tones meet.
 *
 * The loop only runs while the canvas is on screen and the tab is visible,
 * and it draws a single still frame under prefers-reduced-motion.
 */

// Scene space. Everything is drawn in these units and scaled to cover the box.
const W = 1100;
const H = 400;
const GROUND = 372;
// The pixel grid. Every shape is a multiple of this.
const PX = 4;

const INK = "#1b2742";
const SKY_BANDS = ["#4f82bd", "#5789c3", "#6093cb", "#6a9cd2", "#78a7d8"];

const TERRACES = [
  { x0: -20, y: 250, w: 720, rise: 90, steps: 18, light: "#9dbde1", fill: "#8fb3dd", dark: "#7ea4d0" },
  { x0: 420, y: 290, w: 760, rise: 120, steps: 19, light: "#4d86b9", fill: "#3d78ad", dark: "#346a9b" },
  { x0: -20, y: 320, w: 640, rise: 50, steps: 14, light: "#3a74a8", fill: "#2f6699", dark: "#295a88" },
  { x0: 580, y: 350, w: 580, rise: 80, steps: 16, light: "#28587a", fill: "#1f4a69", dark: "#1a405b" },
] as const;

/** Height of a terrace at x, or null where it has no ridge. */
const terraceTop = (t: (typeof TERRACES)[number], x: number) => {
  if (x < t.x0 || x > t.x0 + t.w) return null;
  const step = Math.min(Math.floor((x - t.x0) / (t.w / t.steps)), t.steps - 1);
  return t.y - (t.rise / t.steps) * (step + 1);
};

// Sprite rows. "." is empty; other letters look up a palette.
type Sprite = readonly string[];

const CAT_PALETTE: Record<string, string> = {
  O: INK,
  X: "#f3ead8",
  S: "#d9cdb6",
  H: "#ffffff",
  P: "#f4b6cf",
  E: INK,
  I: "#ffffff",
  N: "#e98ab0",
};

const CAT: Sprite = [
  "......OO..............OO....",
  ".....OXXO............OXXO...",
  ".....OXPXO..........OXPXO...",
  ".....OXPPXO........OXPPXO...",
  ".....OXXPXXOOOOOOOOXXPXXO...",
  ".....OXXXXXXXXXXXXXXXXXXO...",
  ".....OXXXXXXXXXXXXXXXXXXO...",
  "....OXXXXXXXXXXXXXXXXXXXXO..",
  "....OXXXEEXXXXXXXXXXEEXXXO..",
  "....OXXXEIXXXXXXXXXXEIXXXO..",
  "....OXXXEEXXXXXXXXXXEEXXXO..",
  "OO..OXXXXXXXXXNNXXXXXXXXXO..",
  "..OOOSXXXXXXXNXXNXXXXXXXSOOO",
  "OO...OSXXXXXXXXXXXXXXXXSO...",
  ".....OOSSXXXXXXXXXXXXSSOO.OO",
  "....OXXXOOOOXXXXXXOOOOXXXO..",
  "...OXXXXXXXXHHHHHHXXXXXXXXO.",
  "..OXXXXXXXXHHHHHHHHXXXXXXXXO",
  "..OXXXXXXXXHHHHHHHHXXXXXXXXO",
  "..OXXXXXXXXXHHHHHHXXXXXXXSXO",
  "..OXXXXXXXXXXXXXXXXXXXXXSSXO",
  "..OXXXXXXXXXXXXXXXXXXXXSSXXO",
  "..OXXOOOXXXOOOXXXXXXXXSXXXO.",
  "...OO...OOO...OOOOOOOOOOOO..",
];
// Rows 8 to 10 with the eyes shut, swapped in for a blink.
const CAT_SHUT: Record<number, string> = {
  8: "....OXXXXXXXXXXXXXXXXXXXXO..",
  9: "....OXXXOOXXXXXXXXXXOOXXXO..",
  10: "....OXXXXXXXXXXXXXXXXXXXXO..",
};
// Three tail poses, drawn to the right of the body and bottom aligned.
const CAT_TAILS: Sprite[] = [
  ["........", "........", "........", "......OO", ".....OXO", "....OXSO", "...OXSO.", "..OXSO..", ".OXSO...", "OOOO...."],
  ["........", "......OO", ".....OXXO", ".....OXSO", "....OXSO.", "....OXSO.", "...OXSO..", "..OXSO...", ".OXSO....", "OOOO....."],
  ["....OO..", "...OXXO.", "...OXSO.", "...OXSO.", "...OXSO.", "...OXSO.", "...OXSO.", "..OXSO..", ".OXSO...", "OOOO...."],
];
const CAT_CELL = 5;
const CAT_X = 140;
const CAT_Y = GROUND - CAT.length * CAT_CELL + PX;

const TREE_PALETTE: Record<string, string> = {
  O: INK,
  X: "#1f4a69",
  L: "#2f6699",
  D: "#17395a",
  T: "#2b1d12",
};
const FAR_TREE_PALETTE: Record<string, string> = {
  O: "#2f5a84",
  X: "#3d78ad",
  L: "#4f8bc0",
  D: "#346a9b",
  T: "#2f5a84",
};
const PINE: Sprite = [
  ".....O.....",
  "....OLO....",
  "...OXLXO...",
  "..OXXLXXO..",
  "...OXLXDO..",
  "..OXXLXXDO.",
  ".OXXXLXXXDO",
  "..OXXLXXDO.",
  ".OXXXLXXXDO",
  "OXXXXLXXXDDO",
  "OOOOOOTOOOOO",
  "......T.....",
  "......T.....",
];
const ROUND_TREE: Sprite = [
  "...OOOOO....",
  "..OLLXXXO...",
  ".OLLXXXXXO..",
  "OLXXXXXXXDO.",
  "OXXXXXXXXDDO",
  "OXXXXXXXDDDO",
  ".OXXXXXDDDO.",
  "..OOXXXDOO..",
  "....OTTO....",
  ".....TT.....",
  ".....TT.....",
];
// Trees on the ridges, as [x, terrace index, kind, cell size].
const TREES = [
  [60, 0, ROUND_TREE, 4],
  [110, 0, PINE, 4],
  [640, 1, PINE, 4],
  [690, 1, ROUND_TREE, 4],
  [40, 2, PINE, 6],
  [420, 2, PINE, 6],
  [480, 2, ROUND_TREE, 7],
  [540, 2, PINE, 5],
  [730, 3, PINE, 7],
  [800, 3, ROUND_TREE, 6],
  [860, 3, PINE, 5],
  [990, 3, PINE, 7],
  [1050, 3, ROUND_TREE, 6],
] as const;

const BUSH: Sprite = ["..OOOO...", ".OLXXXO..", "OLXXXXDO.", "OXXXXDDDO", ".OOOOOOO."];
const BUSHES = [260, 600, 920] as const;

const FLOWER: Sprite = [".P.", "PCP", ".P.", ".G.", ".G."];
const FLOWER_PALETTE: Record<string, string> = { P: "#f4b6cf", C: "#fff1b8", G: "#2f6699" };
const FLOWERS = [330, 350, 375, 580, 700, 720, 1000] as const;

const TUFT: Sprite = ["L.L.L", "LLXLL", ".LXL.", ".LXL."];
const TUFT_PALETTE: Record<string, string> = { L: "#2f6699", X: "#3d78ad" };
const TUFTS = [20, 90, 230, 410, 520, 650, 870, 1060] as const;

const FENCE_X = 760;
const FENCE_POSTS = 7;

const CLOUD_PALETTE: Record<string, string> = { X: "#f6f9fd", S: "#d6e3f2", D: "#bfd2ea" };
const CLOUD_SMALL: Sprite = ["...XXXX...", ".XXXXXXXX.", "XXXXXXXXXS", ".SSSSSSDD."];
const CLOUD_BIG: Sprite = [
  ".....XXXX.......",
  "...XXXXXXXX..XX.",
  "..XXXXXXXXXXXXXX",
  ".XXXXXXXXXXXXXXS",
  "XXXXXXXXXXXXXSSS",
  ".SSSSSSSSSDDDDD.",
];
const CLOUDS = [
  { y: 50, sprite: CLOUD_BIG, cell: 5, speed: 6, phase: 0 },
  { y: 110, sprite: CLOUD_SMALL, cell: 4, speed: 10, phase: 420 },
  { y: 30, sprite: CLOUD_SMALL, cell: 6, speed: 4, phase: 760 },
  { y: 140, sprite: CLOUD_SMALL, cell: 3, speed: 12, phase: 230 },
  { y: 86, sprite: CLOUD_BIG, cell: 4, speed: 7, phase: 1000 },
] as const;

const BIRD_FRAMES: Sprite[] = [
  ["X...X", ".X.X.", "..X.."],
  ["..X..", ".X.X.", "X...X"],
];
const FLOCK_PERIOD = 26;
const FLOCK_FLIGHT = 9;
const FLOCK = [
  [0, 0],
  [34, 14],
  [66, -8],
] as const;

const BUTTERFLY_FRAMES: Sprite[] = [
  ["P.P", "PBP", "P.P"],
  [".P.", "PBP", ".P."],
];
const BUTTERFLY_PALETTE: Record<string, string> = { P: "#f4b6cf", B: INK };

const snap = (v: number) => Math.round(v / PX) * PX;

const drawSprite = (
  ctx: CanvasRenderingContext2D,
  rows: Sprite,
  palette: Record<string, string>,
  x: number,
  y: number,
  cell: number,
) => {
  const ox = snap(x);
  const oy = snap(y);
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      const fill = palette[row[c]];
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
    }
  });
};

/** A checker of cells between two rows, for dithering one tone into another. */
const dither = (ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, fill: string) => {
  ctx.fillStyle = fill;
  for (let y = snap(y0); y < y1; y += PX) {
    for (let x = snap(x0) + ((y / PX) % 2) * PX; x < x1; x += PX * 2) ctx.fillRect(x, y, PX, PX);
  }
};

const drawSky = (ctx: CanvasRenderingContext2D) => {
  const bandH = 80;
  SKY_BANDS.forEach((band, i) => {
    ctx.fillStyle = band;
    ctx.fillRect(0, i * bandH, W, bandH);
    if (i > 0) dither(ctx, 0, W, i * bandH - 12, i * bandH, band);
  });
};

const drawTerrace = (ctx: CanvasRenderingContext2D, t: (typeof TERRACES)[number]) => {
  const tread = t.w / t.steps;
  const riser = t.rise / t.steps;
  ctx.fillStyle = t.fill;
  ctx.beginPath();
  ctx.moveTo(t.x0, H);
  ctx.lineTo(t.x0, t.y);
  for (let i = 0; i < t.steps; i += 1) {
    const x = t.x0 + tread * (i + 1);
    ctx.lineTo(x, t.y - riser * i);
    ctx.lineTo(x, t.y - riser * (i + 1));
  }
  ctx.lineTo(t.x0 + t.w, H);
  ctx.closePath();
  ctx.fill();
  // Per column: a lit edge on the tread, then the slope darkens toward its
  // foot through a dither band.
  for (let x = snap(Math.max(t.x0, 0)); x < Math.min(t.x0 + t.w, W); x += PX) {
    const top = terraceTop(t, x);
    if (top === null) continue;
    const y = snap(top);
    ctx.fillStyle = t.light;
    ctx.fillRect(x, y, PX, PX * 2);
    ctx.fillStyle = t.dark;
    ctx.fillRect(x, y + 44, PX, H - y - 44);
    if ((x / PX) % 2 === 0) {
      ctx.fillRect(x, y + 36, PX, PX);
      ctx.fillRect(x, y + 28, PX, PX);
    } else {
      ctx.fillRect(x, y + 40, PX, PX);
    }
  }
};

const drawSun = (ctx: CanvasRenderingContext2D, t: number) => {
  const cx = 980;
  const cy = 72;
  // An octagon in three tones.
  ctx.fillStyle = "#e2ecf8";
  ctx.fillRect(cx - 28, cy - 16, 56, 32);
  ctx.fillRect(cx - 16, cy - 28, 32, 56);
  ctx.fillRect(cx - 24, cy - 24, 48, 48);
  ctx.fillStyle = "#f4f8fd";
  ctx.fillRect(cx - 20, cy - 12, 40, 24);
  ctx.fillRect(cx - 12, cy - 20, 24, 40);
  ctx.fillStyle = "#fff8e1";
  ctx.fillRect(cx - 12, cy - 12, 16, 16);
  // Rays: the straight and diagonal sets take turns every second.
  const diagonal = Math.floor(t) % 2 === 1;
  ctx.fillStyle = "#e2ecf8";
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2 + (diagonal ? Math.PI / 4 : 0);
    ctx.fillRect(snap(cx + Math.cos(a) * 42 - 4), snap(cy + Math.sin(a) * 42 - 4), 8, 8);
    ctx.fillRect(snap(cx + Math.cos(a) * 54 - 2), snap(cy + Math.sin(a) * 54 - 2), 4, 4);
  }
};

const drawFence = (ctx: CanvasRenderingContext2D) => {
  const y = GROUND - 28;
  for (let i = 0; i < FENCE_POSTS; i += 1) {
    const x = FENCE_X + i * 20;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 2, y - 6, 8, 36);
    ctx.fillStyle = "#e6dcc6";
    ctx.fillRect(x, y - 4, 4, 32);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(FENCE_X - 6, y + 6, FENCE_POSTS * 20 + 4, 8);
  ctx.fillRect(FENCE_X - 6, y + 18, FENCE_POSTS * 20 + 4, 8);
  ctx.fillStyle = "#e6dcc6";
  ctx.fillRect(FENCE_X - 4, y + 8, FENCE_POSTS * 20, 4);
  ctx.fillRect(FENCE_X - 4, y + 20, FENCE_POSTS * 20, 4);
};

const drawCat = (ctx: CanvasRenderingContext2D, t: number) => {
  const blink = t % 4.3 > 4.1;
  const body = blink ? CAT.map((row, i) => CAT_SHUT[i] ?? row) : CAT;
  // Shadow under the cat, then the tail behind the body.
  ctx.fillStyle = "#1a405b";
  ctx.fillRect(CAT_X + 8, GROUND - 4, CAT[0].length * CAT_CELL - 8, 8);
  const tail = CAT_TAILS[[0, 1, 2, 1][Math.floor(t * 1.5) % 4]];
  drawSprite(ctx, tail, CAT_PALETTE, CAT_X + 24 * CAT_CELL, GROUND - tail.length * CAT_CELL, CAT_CELL);
  drawSprite(ctx, body, CAT_PALETTE, CAT_X, CAT_Y, CAT_CELL);
};

const drawScene = (ctx: CanvasRenderingContext2D, t: number) => {
  drawSky(ctx);
  drawSun(ctx, t);

  for (const cloud of CLOUDS) {
    const width = cloud.sprite[0].length * cloud.cell;
    const x = ((cloud.phase + t * cloud.speed) % (W + width)) - width;
    drawSprite(ctx, cloud.sprite, CLOUD_PALETTE, x, cloud.y, cloud.cell);
  }

  const flight = t % FLOCK_PERIOD;
  if (flight < FLOCK_FLIGHT) {
    const x = W + 40 - (flight / FLOCK_FLIGHT) * (W + 180);
    const frame = BIRD_FRAMES[Math.floor(t * 6) % 2];
    for (const [dx, dy] of FLOCK) {
      drawSprite(ctx, frame, { X: INK }, x + dx, 92 + dy + Math.sin(t * 2 + dx) * 4, 4);
    }
  }

  TERRACES.forEach((terrace, index) => {
    drawTerrace(ctx, terrace);
    for (const [x, on, kind, cell] of TREES) {
      if (on !== index) continue;
      const top = terraceTop(terrace, x) ?? terrace.y;
      const palette = index >= 2 ? TREE_PALETTE : FAR_TREE_PALETTE;
      drawSprite(ctx, kind, palette, x - (kind[0].length * cell) / 2, top + 8 - kind.length * cell, cell);
    }
  });

  // The ground: a lit lip, a body, and a dithered foot.
  ctx.fillStyle = "#2a5b7e";
  ctx.fillRect(0, GROUND, W, PX);
  ctx.fillStyle = "#1f4a69";
  ctx.fillRect(0, GROUND + PX, W, H - GROUND);
  dither(ctx, 0, W, GROUND + 12, GROUND + 20, "#17395a");
  ctx.fillStyle = "#17395a";
  ctx.fillRect(0, GROUND + 20, W, H - GROUND - 20);

  drawFence(ctx);
  for (const x of BUSHES) drawSprite(ctx, BUSH, TREE_PALETTE, x, GROUND - 26, 6);

  // Grass: short blocks along the ground that brighten in waves, like wind.
  const grassTones = ["#1f4a69", "#2f6699", "#3d78ad"];
  for (let i = 0; i < 95; i += 1) {
    const x = i * 12 + 4;
    const wave = Math.sin(t * 2.2 + i * 0.6);
    ctx.fillStyle = grassTones[wave > 0.4 ? 2 : wave > -0.4 ? 1 : 0];
    ctx.fillRect(x, 364 - (wave > 0.6 ? 4 : 0), 4, 8 + (wave > 0.6 ? 4 : 0));
  }
  for (const x of FLOWERS) {
    const lean = Math.sin(t * 2 + x) > 0.5 ? PX : 0;
    drawSprite(ctx, FLOWER, FLOWER_PALETTE, x + lean, GROUND - 20, 4);
  }

  // A butterfly flutters in a loop above the first flowers.
  const bx = 350 + Math.sin(t * 0.7) * 40;
  const by = GROUND - 50 + Math.sin(t * 2.3) * 10 - Math.sin(t * 0.7) * 8;
  drawSprite(ctx, BUTTERFLY_FRAMES[Math.floor(t * 8) % 2], BUTTERFLY_PALETTE, bx, by, 4);

  drawCat(ctx, t);

  // Tall tufts in the foreground, in front of everything.
  for (const x of TUFTS) {
    const lean = Math.sin(t * 1.6 + x) > 0.3 ? PX : 0;
    drawSprite(ctx, TUFT, TUFT_PALETTE, x + lean, GROUND - 14, 5);
  }
};

export default function HeroFilm({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = false;
    const started = performance.now();

    const paint = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      // Cover the box and keep the ground on the bottom edge.
      const scale = Math.max(width / W, height / H);
      ctx.setTransform(
        dpr * scale,
        0,
        0,
        dpr * scale,
        ((width - W * scale) / 2) * dpr,
        (height - H * scale) * dpr,
      );
      drawScene(ctx, (now - started) / 1000);
    };

    const tick = (now: number) => {
      paint(now);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame || reduceMotion) return;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const sync = () => {
      if (visible && document.visibilityState === "visible") start();
      else stop();
    };

    if (reduceMotion) paint(started);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, []);

  return <canvas ref={canvasRef} className={`block size-full ${className}`} aria-hidden="true" />;
}
