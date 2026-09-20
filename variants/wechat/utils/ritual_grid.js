'use strict';

const DEFAULT_TIMING = {
  focusMs: 600,
  igniteMs: 2000,
  extinguishMs: 2600,
  settleMs: 1100,
  maxSequenceMs: 15000
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutQuart(t) { const x = 1 - clamp(t, 0, 1); return 1 - x * x * x * x; }
function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function parseHex(input) {
  if (Array.isArray(input)) return input.slice(0, 3).map(v => clamp(Number(v || 0), 0, 255));
  const raw = String(input || '#000000').trim();
  const rgbMatch = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgbMatch) return [clamp(Number(rgbMatch[1]),0,255), clamp(Number(rgbMatch[2]),0,255), clamp(Number(rgbMatch[3]),0,255)];
  const clean = raw.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixColor(a, b, t) {
  const A = Array.isArray(a) ? a : parseHex(a);
  const B = Array.isArray(b) ? b : parseHex(b);
  const k = clamp(t, 0, 1);
  return `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`;
}

function makeStarfield(widthInput, heightInput, countInput) {
  const width = Math.max(1, Number(widthInput || 1));
  const height = Math.max(1, Number(heightInput || 1));
  const count = Math.max(0, Math.floor(Number(countInput === undefined ? 56 : countInput)));
  let seed = ((Math.floor(width * 17) * 73856093) ^ (Math.floor(height * 19) * 19349663) ^ 0x9e3779b9) >>> 0;
  const rnd = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17; seed >>>= 0;
    seed ^= seed << 5; seed >>>= 0;
    return (seed >>> 0) / 4294967296;
  };
  const stars = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: rnd() * width,
      y: rnd() * height,
      r: 0.35 + rnd() * 0.85,
      phase: rnd() * Math.PI * 2,
      speed: 0.00055 + rnd() * 0.00115
    });
  }
  return stars;
}

function pickScale(delta) {
  const d = Math.max(1, Number(delta || 1));
  if (d >= 500) return 3.6;
  if (d >= 100) return 5;
  if (d >= 30) return 7;
  if (d >= 10) return 8.5;
  return 10;
}

function targetTriggerSpan(deltaInput, maxSequenceMsInput) {
  const d = Math.max(1, Math.floor(Number(deltaInput || 1)));
  if (d <= 1) return 0;
  const maxMs = Math.max(1, Number(maxSequenceMsInput || DEFAULT_TIMING.maxSequenceMs));
  // Preserve the original slow/weighty feel at small deltas, but interpolate trigger span
  // continuously so 201 changed days can never finish dramatically faster than 200.
  const points = [
    [1, 0],
    [3, 1560],
    [8, 3780],
    [20, 6460],
    [60, 10620],
    [200, 15000]
  ];
  if (d >= 200) return maxMs;
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    if (d <= x1) {
      const [x0, y0] = points[i - 1];
      const t = (d - x0) / (x1 - x0);
      return Math.min(maxMs, lerp(y0, y1, t));
    }
  }
  return maxMs;
}

function intervalFor(delta, maxSequenceMs) {
  const d = Math.max(1, Math.floor(Number(delta || 1)));
  if (d <= 1) return 0;
  return targetTriggerSpan(d, maxSequenceMs) / (d - 1);
}

function computeGridLayout(totalInput, widthInput, heightInput, opts) {
  const total = Math.max(0, Math.floor(Number(totalInput || 0)));
  const width = Math.max(1, Number(widthInput || 1));
  const height = Math.max(1, Number(heightInput || 1));
  const options = opts || {};
  const padX = Number(options.padX !== undefined ? options.padX : 18);
  const padY = Number(options.padY !== undefined ? options.padY : 22);
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);
  if (!total) return { cols: 1, rows: 0, cell: 1, gap: 0, x: width / 2, y: height / 2, gridW: 0, gridH: 0 };

  let best = null;
  for (let cell = 12; cell >= 0.8; cell -= cell > 4 ? 0.5 : 0.2) {
    const gap = cell >= 5 ? 1 : (cell >= 2.5 ? 0.65 : 0.35);
    const cols = Math.max(1, Math.floor((innerW + gap) / (cell + gap)));
    const rows = Math.ceil(total / cols);
    const gridH = rows * cell + Math.max(0, rows - 1) * gap;
    if (gridH <= innerH) {
      const gridW = Math.min(total, cols) * cell + Math.max(0, Math.min(total, cols) - 1) * gap;
      best = { cols, rows, cell, gap, gridW, gridH };
      break;
    }
  }
  if (!best) {
    const cols = Math.max(1, Math.floor(Math.sqrt(total * innerW / innerH)));
    const rows = Math.ceil(total / cols);
    const gap = 0.2;
    const cell = Math.max(0.45, Math.min((innerW - Math.max(0, cols - 1) * gap) / cols, (innerH - Math.max(0, rows - 1) * gap) / rows));
    best = { cols, rows, cell, gap, gridW: cols * cell + Math.max(0, cols - 1) * gap, gridH: rows * cell + Math.max(0, rows - 1) * gap };
  }
  best.x = (width - best.gridW) / 2;
  best.y = (height - best.gridH) / 2;
  return best;
}

function computeRitualTimeline(deltaInput, kind, timingInput) {
  const timing = Object.assign({}, DEFAULT_TIMING, timingInput || {});
  const delta = Math.max(0, Math.floor(Math.abs(Number(deltaInput || 0))));
  const cellMs = kind === 'extinguish' ? timing.extinguishMs : timing.igniteMs;
  let triggerSpan = targetTriggerSpan(delta, timing.maxSequenceMs);
  if (kind === 'extinguish' && delta > 1) {
    // Loss is intentionally heavier/slower, but still monotonic and bounded.
    triggerSpan = Math.min(timing.maxSequenceMs, triggerSpan * 1.4);
  }
  const interval = delta > 1 ? triggerSpan / (delta - 1) : 0;
  return {
    delta,
    focusMs: timing.focusMs,
    cellMs,
    interval,
    triggerSpan,
    sequenceEnd: timing.focusMs + triggerSpan + cellMs,
    totalMs: timing.focusMs + triggerSpan + cellMs + timing.settleMs,
    settleMs: timing.settleMs
  };
}

function futureCellColor(stats, futureIndex, palette) {
  if (futureIndex < 0) return palette.past;
  const assetLit = Math.max(0, Number(stats.asset_lit || 0));
  const incomeLit = Math.max(0, Number(stats.income_lit || 0));
  if (futureIndex < assetLit) return palette.asset || palette.lit;
  if (futureIndex < assetLit + incomeLit) return palette.lit;
  return palette.unlit;
}

function cellRect(layout, absoluteIndex) {
  const col = absoluteIndex % layout.cols;
  const row = Math.floor(absoluteIndex / layout.cols);
  return {
    x: layout.x + col * (layout.cell + layout.gap),
    y: layout.y + row * (layout.cell + layout.gap),
    w: layout.cell,
    h: layout.cell
  };
}

function visibleGridWindow(layout, width, height, camera, overscanInput) {
  if (!layout || !layout.rows) return { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 };
  const scale = Math.max(0.001, Number(camera && camera.scale || 1));
  const cx = Number(camera && camera.cx !== undefined ? camera.cx : width / 2);
  const cy = Number(camera && camera.cy !== undefined ? camera.cy : height / 2);
  const overscan = Math.max(0, Math.floor(Number(overscanInput === undefined ? 2 : overscanInput)));
  const halfW = width / (2 * scale);
  const halfH = height / (2 * scale);
  const step = layout.cell + layout.gap;
  const left = cx - halfW;
  const right = cx + halfW;
  const top = cy - halfH;
  const bottom = cy + halfH;
  const colStart = clamp(Math.floor((left - layout.x) / step) - overscan, 0, layout.cols - 1);
  const colEnd = clamp(Math.ceil((right - layout.x) / step) + overscan, 0, layout.cols - 1);
  const rowStart = clamp(Math.floor((top - layout.y) / step) - overscan, 0, layout.rows - 1);
  const rowEnd = clamp(Math.ceil((bottom - layout.y) / step) + overscan, 0, layout.rows - 1);
  return { rowStart, rowEnd, colStart, colEnd };
}

function drawRect(ctx, rect, color, scale) {
  const s = Number(scale || 1);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const w = rect.w * s;
  const h = rect.h * s;
  ctx.fillStyle = color;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
}

function drawHalo(ctx, rect, color, alpha, radiusScale) {
  if (!ctx.createRadialGradient || alpha <= 0.005) return;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = Math.max(3, rect.w * (radiusScale || 4));
  const rgb = parseHex(color);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
  g.addColorStop(0.4, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.38})`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  const old = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalCompositeOperation = old || 'source-over';
}

function igniteFrame(t, finalColor, palette) {
  const x = clamp(t, 0, 1);
  if (x >= 1) return { color: finalColor, halo: 0.04, scale: 1 };
  const env = x < 0.10 ? easeOutQuart(x / 0.10) : Math.pow(Math.max(0, 1 - (x - 0.10) / 0.90), 1.4);
  const colorT = easeOutQuart(Math.min(1, x / 0.22));
  let color = mixColor(palette.unlit, finalColor, colorT);
  color = mixColor(color, palette.bloom || '#fff4d6', env * env * 0.45);
  return { color, halo: env * 0.48, scale: 1 + env * 0.16 };
}

function extinguishFrame(t, startColor, palette) {
  const x = clamp(t, 0, 1);
  if (x >= 1) return { color: palette.unlit, halo: 0, scale: 1 };
  const env = x < 0.18 ? easeOutQuart(x / 0.18) : Math.pow(Math.max(0, 1 - (x - 0.18) / 0.82), 1.4);
  let color;
  if (x < 0.65) color = mixColor(startColor, palette.ash || '#5a4030', x / 0.65);
  else color = mixColor(palette.ash || '#5a4030', palette.unlit, easeOutQuart((x - 0.65) / 0.35));
  return { color, halo: env * 0.30, scale: 1 + env * 0.10 };
}

class RitualGrid {
  constructor(canvas, options) {
    if (!canvas) throw new Error('RitualGrid requires a canvas');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('RitualGrid requires a 2d context');
    const opts = options || {};
    this.now = opts.now || (() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()));
    this.requestFrame = opts.requestFrame || (cb => {
      if (canvas.requestAnimationFrame) return canvas.requestAnimationFrame(cb);
      if (typeof requestAnimationFrame !== 'undefined') return requestAnimationFrame(cb);
      return setTimeout(() => cb(this.now()), 16);
    });
    this.cancelFrame = opts.cancelFrame || (id => {
      if (canvas.cancelAnimationFrame) return canvas.cancelAnimationFrame(id);
      if (typeof cancelAnimationFrame !== 'undefined') return cancelAnimationFrame(id);
      clearTimeout(id);
    });
    this.createOffscreenCanvas = opts.createOffscreenCanvas || null;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.skipRequested = false;
    this.running = false;
    this.raf = null;
    this._activeRun = null;
    this._runBefore = null;
    this._runPalette = null;
  }

  resize(width, height, dpr) {
    this.width = Math.max(1, Number(width || 1));
    this.height = Math.max(1, Number(height || 1));
    this.dpr = clamp(Number(dpr || 1), 1, 3);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.stars = makeStarfield(this.width, this.height, Math.round(clamp(this.width * this.height / 5200, 34, 72)));
    this.layout = this._runBefore
      ? computeGridLayout(this._runBefore.total_cells, this.width, this.height, { padX: 22, padY: 26 })
      : null;
    if (this.running && this._runBefore && this._runPalette) this._buildBase(this._runBefore, this._runPalette);
  }

  skip() { this.skipRequested = true; }

  destroy(reason) {
    this.skipRequested = true;
    this.running = false;
    if (this.raf !== null) this.cancelFrame(this.raf);
    this.raf = null;
    this.baseCanvas = null;
    this._runBefore = null;
    this._runPalette = null;
    if (this._activeRun && typeof this._activeRun.abort === 'function') {
      const active = this._activeRun;
      this._activeRun = null;
      active.abort(reason || 'destroyed');
    }
  }

  _buildBase(stats, palette) {
    if (!this.createOffscreenCanvas) {
      this.baseCanvas = null;
      return;
    }
    try {
      const off = this.createOffscreenCanvas(Math.round(this.width * this.dpr), Math.round(this.height * this.dpr));
      if (!off) return;
      off.width = Math.round(this.width * this.dpr);
      off.height = Math.round(this.height * this.dpr);
      const ctx = off.getContext('2d');
      if (!ctx) return;
      if (typeof ctx.setTransform === 'function') ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      else if (typeof ctx.scale === 'function') ctx.scale(this.dpr, this.dpr);
      // 离屏缓存只保存方格本体，背景/星光留在视口坐标系。否则 Camera 回到 1:1 时缓存会把氛围层整块盖掉。
      ctx.clearRect(0, 0, this.width, this.height);
      this._drawGridBase(ctx, stats, palette, null);
      this.baseCanvas = off;
    } catch (err) {
      this.baseCanvas = null;
    }
  }

  _drawRange(ctx, fromAbs, toAbs, color, visible) {
    if (toAbs <= fromAbs) return;
    const layout = this.layout;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (!visible) {
      for (let i = fromAbs; i < toAbs; i += 1) {
        const r = cellRect(layout, i);
        ctx.rect(r.x, r.y, r.w, r.h);
      }
    } else if (visible.rowEnd >= visible.rowStart && visible.colEnd >= visible.colStart) {
      for (let row = visible.rowStart; row <= visible.rowEnd; row += 1) {
        const visibleStart = row * layout.cols + visible.colStart;
        const visibleEnd = row * layout.cols + visible.colEnd + 1;
        const start = Math.max(fromAbs, visibleStart);
        const end = Math.min(toAbs, visibleEnd);
        for (let i = start; i < end; i += 1) {
          const r = cellRect(layout, i);
          ctx.rect(r.x, r.y, r.w, r.h);
        }
      }
    }
    ctx.fill();
  }

  _drawGridBase(ctx, stats, palette, visible) {
    const total = Math.max(0, Number(stats.total_cells || 0));
    if (!total) return;
    if (!this.layout) this.layout = computeGridLayout(total, this.width, this.height, { padX: 22, padY: 26 });
    const past = Math.max(0, Number(stats.past_cells || 0));
    const tracked = Math.max(0, Number(stats.tracked_past_cells || 0));
    const trackedStart = Math.max(0, past - tracked);
    const assetEnd = past + Math.max(0, Number(stats.asset_lit || 0));
    const incomeEnd = assetEnd + Math.max(0, Number(stats.income_lit || 0));
    this._drawRange(ctx, 0, trackedStart, palette.past || '#16161e', visible);
    this._drawRange(ctx, trackedStart, past, palette.trackedPast || '#2c2418', visible);
    this._drawRange(ctx, past, Math.min(assetEnd, total), palette.asset || palette.lit, visible);
    this._drawRange(ctx, Math.min(assetEnd, total), Math.min(incomeEnd, total), palette.lit, visible);
    this._drawRange(ctx, Math.min(incomeEnd, total), total, palette.unlit, visible);
  }

  _drawLitWash(ctx, stats, palette, camera) {
    const lit = Math.max(0, Number(stats && stats.lit_count || 0));
    const total = Math.max(0, Number(stats && stats.total_cells || 0));
    if (!lit || !total || !this.layout) return;
    const scale = Math.max(1, Number(camera && camera.scale || 1));
    // 原版远景里，已点亮区域不是一条死板的纯色带，而有一层非常克制的整体暖光。
    // Camera 放大后让单格 halo 接管，避免把局部画面洗白。
    if (scale >= 2.0 || !ctx.createLinearGradient) return;
    const past = Math.max(0, Number(stats.past_cells || 0));
    const from = Math.min(total - 1, past);
    const to = Math.min(total - 1, past + lit - 1);
    if (to < from) return;
    const first = cellRect(this.layout, from);
    const last = cellRect(this.layout, to);
    const rgb = parseHex(palette && palette.lit || '#ffd166');
    const g = ctx.createLinearGradient(0, first.y, 0, last.y + last.h);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.055)`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(this.layout.x - 8, first.y - 8, this.layout.gridW + 16, Math.max(1, last.y + last.h - first.y + 16));
  }

  _drawStaticInto(ctx, stats, palette, todayGlow) {
    ctx.fillStyle = palette.background || '#06060c';
    ctx.fillRect(0, 0, this.width, this.height);
    this._drawGridBase(ctx, stats, palette, null);
    this._drawLitWash(ctx, stats, palette, { scale: 1 });
    if (todayGlow) this._drawToday(ctx, stats, palette, this.now());
  }

  drawStatic(stats, palette) {
    if (!stats) return;
    this.layout = computeGridLayout(stats.total_cells, this.width, this.height, { padX: 22, padY: 26 });
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = palette.background || '#06060c';
    ctx.fillRect(0, 0, this.width, this.height);
    this._drawAtmosphere(ctx, palette, this.now());
    this._drawGridBase(ctx, stats, palette, null);
    this._drawLitWash(ctx, stats, palette, { scale: 1 });
    this._drawToday(ctx, stats, palette, this.now());
  }

  _drawAtmosphere(ctx, palette, nowInput) {
    const background = parseHex(palette && palette.background || '#06060c');
    const luminance = 0.2126 * background[0] + 0.7152 * background[1] + 0.0722 * background[2];
    // 深色主舞台恢复原版星空呼吸；纸张主题保持干净，不强塞星点。
    if (luminance > 105 || !this.stars || !this.stars.length) return;
    const color = parseHex(palette && palette.bloom || '#fff4d6');
    const now = Number(nowInput || 0);
    for (const star of this.stars) {
      const wave = 0.5 + 0.5 * Math.sin(star.phase + now * star.speed);
      const alpha = 0.045 + wave * 0.17;
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha.toFixed(3)})`;
      ctx.fillRect(star.x, star.y, star.r, star.r);
    }
  }

  _drawToday(ctx, stats, palette, now) {
    const total = Math.max(0, Number(stats.total_cells || 0));
    const idx = Math.max(0, Number(stats.past_cells || 0));
    if (!total || idx >= total || !this.layout) return;
    const r = cellRect(this.layout, idx);
    const breath = 0.5 + 0.5 * Math.sin(Number(now || 0) * 0.0042);
    drawHalo(ctx, r, palette.bloom || '#fff4d6', 0.20 + breath * 0.18, 4.6);
    const color = futureCellColor(stats, 0, palette);
    drawRect(ctx, r, mixColor(color, palette.bloom || '#fff4d6', 0.35 + breath * 0.2), 1 + breath * 0.08);
  }

  _drawBase(ctx, before, palette, camera) {
    // 全局 1:1 视图可以直接复用缓存；Camera 一开始放大后改为矢量重绘可见区域。
    // 不能把整张离屏位图放大，否则底层方格会糊成一片，失去原版逐格追焦的清晰感。
    const scale = Math.max(1, Number(camera && camera.scale || 1));
    if (this.baseCanvas && scale <= 1.015) {
      const oldSmooth = ctx.imageSmoothingEnabled;
      if (typeof ctx.imageSmoothingEnabled === 'boolean') ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.baseCanvas, 0, 0, this.width, this.height);
      if (typeof oldSmooth === 'boolean') ctx.imageSmoothingEnabled = oldSmooth;
      this._drawLitWash(ctx, before, palette, camera);
      return;
    }
    const visible = visibleGridWindow(this.layout, this.width, this.height, camera, 3);
    this._drawGridBase(ctx, before, palette, visible);
    this._drawLitWash(ctx, before, palette, camera);
  }

  _drawFinalRange(ctx, after, palette, fromFuture, toFuture) {
    if (toFuture <= fromFuture) return;
    const past = Math.max(0, Number(after.past_cells || 0));
    const assetEnd = Math.max(0, Number(after.asset_lit || 0));
    const a0 = fromFuture;
    const a1 = Math.min(toFuture, assetEnd);
    if (a1 > a0) this._drawRange(ctx, past + a0, past + a1, palette.asset || palette.lit);
    const i0 = Math.max(fromFuture, assetEnd);
    if (toFuture > i0) this._drawRange(ctx, past + i0, past + toFuture, palette.lit);
  }

  _setCameraTransform(ctx, camera) {
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.cx, -camera.cy);
  }

  _cellCenterAbsolute(absIndex) {
    const r = cellRect(this.layout, absIndex);
    return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
  }

  async run(config) {
    if (this.running || this._activeRun) this.destroy('restarted');
    const before = config.before;
    const after = config.after;
    const palette = config.palette;
    const kind = config.kind === 'extinguish' ? 'extinguish' : 'ignite';
    const beforeLit = Math.max(0, Number(before.lit_count || 0));
    const afterLit = Math.max(0, Number(after.lit_count || 0));
    const delta = Math.abs(afterLit - beforeLit);
    if (!delta) {
      this.drawStatic(after, palette);
      return { skipped: false, aborted: false, durationMs: 0, frames: 1 };
    }

    this.running = true;
    this.skipRequested = false;
    this._runBefore = before;
    this._runPalette = palette;
    this.layout = computeGridLayout(before.total_cells, this.width, this.height, { padX: 22, padY: 26 });
    this._buildBase(before, palette);
    const timeline = computeRitualTimeline(delta, kind, config.timing);
    const scale = pickScale(delta);
    const past = Math.max(0, Number(before.past_cells || 0));
    const firstFuture = kind === 'ignite' ? beforeLit : beforeLit - 1;
    const camera = { scale: 1, cx: this.width / 2, cy: this.height / 2 };
    let target = { scale, cx: this.width / 2, cy: this.height / 2 };
    let start = null;
    let last = null;
    let frames = 0;
    let lastReportedCompleted = -1;
    let lastTriggeredCallback = 0;

    return new Promise((resolve, reject) => {
      let settled = false;
      let watchdog = null;
      const cleanup = () => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = null;
        this.running = false;
        if (this.raf !== null) this.cancelFrame(this.raf);
        this.raf = null;
        this.baseCanvas = null;
        this._runBefore = null;
        this._runPalette = null;
        this._activeRun = null;
      };
      const settleResolve = payload => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(payload);
      };
      const settleReject = err => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err || 'RITUAL_FAILED')));
      };
      const abort = reason => {
        settleResolve({ skipped: true, aborted: true, reason: reason || 'destroyed', durationMs: 0, frames });
      };
      this._activeRun = { abort };
      // requestAnimationFrame may stop entirely when a page/runtime is suspended. A live
      // ritual must never own an unresolved Promise forever; fail closed to the final static
      // state, which the page layer can always rebuild from the ledger.
      watchdog = setTimeout(() => settleReject(new Error('RITUAL_TIMEOUT')), Math.max(8000, timeline.totalMs + 6000));

      const finish = (skipped, elapsed) => {
        if (settled) return;
        try {
          this.layout = computeGridLayout(after.total_cells, this.width, this.height, { padX: 22, padY: 26 });
          this.drawStatic(after, palette);
          if (typeof config.onProgress === 'function') config.onProgress(delta, delta, afterLit, delta);
          settleResolve({ skipped: !!skipped, aborted: false, durationMs: Math.max(0, Math.round(elapsed || 0)), frames });
        } catch (err) {
          settleReject(err);
        }
      };

      const tick = ts => {
        if (settled) return;
        if (!this.running) { abort('stopped'); return; }
        try {
          const now = Number(ts !== undefined ? ts : this.now());
          if (start === null) { start = now; last = now; }
          const elapsed = now - start;
          const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
          last = now;
          frames += 1;

          if (this.skipRequested) {
            finish(true, elapsed);
            return;
          }

          // resize() may rebuild layout while the ritual is running. Re-read geometry every frame.
          if (!this.layout) this.layout = computeGridLayout(before.total_cells, this.width, this.height, { padX: 22, padY: 26 });

          let triggered = 0;
          let completed = 0;
          if (elapsed >= timeline.focusMs) {
            const seqElapsed = elapsed - timeline.focusMs;
            triggered = timeline.interval === 0 ? delta : Math.min(delta, Math.floor(seqElapsed / timeline.interval) + 1);
            if (seqElapsed >= timeline.cellMs) {
              completed = timeline.interval === 0 ? delta : Math.min(delta, Math.floor((seqElapsed - timeline.cellMs) / timeline.interval) + 1);
            }
          }

          if (triggered > lastTriggeredCallback && typeof config.onCellStart === 'function') {
            for (let order = lastTriggeredCallback; order < triggered; order += 1) config.onCellStart(order, delta, kind);
            lastTriggeredCallback = triggered;
          }

          const currentPast = Math.max(0, Number(before.past_cells || 0));
          if (elapsed < timeline.sequenceEnd) {
            let latestFuture = firstFuture;
            if (triggered > 0) latestFuture = kind === 'ignite' ? beforeLit + triggered - 1 : beforeLit - triggered;
            const c = this._cellCenterAbsolute(currentPast + latestFuture);
            target = { scale, cx: c.cx, cy: c.cy };
          } else {
            target = { scale: 1, cx: this.width / 2, cy: this.height / 2 };
          }

          const damping = 1 - Math.exp(-8.0 * dt);
          camera.scale = lerp(camera.scale, target.scale, damping);
          camera.cx = lerp(camera.cx, target.cx, damping);
          camera.cy = lerp(camera.cy, target.cy, damping);

          const ctx = this.ctx;
          if (!ctx) throw new Error('RITUAL_CONTEXT_LOST');
          ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          ctx.clearRect(0, 0, this.width, this.height);
          ctx.fillStyle = palette.background || '#06060c';
          ctx.fillRect(0, 0, this.width, this.height);
          this._drawAtmosphere(ctx, palette, now);
          ctx.save();
          this._setCameraTransform(ctx, camera);
          this._drawBase(ctx, before, palette, camera);

          if (kind === 'ignite') {
            if (completed > 0) this._drawFinalRange(ctx, after, palette, beforeLit, beforeLit + completed);
            const activeStart = completed;
            const activeEnd = triggered;
            for (let order = activeStart; order < activeEnd; order += 1) {
              const futureIndex = beforeLit + order;
              const triggerAt = timeline.focusMs + order * timeline.interval;
              const t = clamp((elapsed - triggerAt) / timeline.cellMs, 0, 1);
              const r = cellRect(this.layout, currentPast + futureIndex);
              const finalColor = futureCellColor(after, futureIndex, palette);
              const frame = igniteFrame(t, finalColor, palette);
              if ((order - activeStart) % Math.max(1, Math.ceil((activeEnd - activeStart) / 34)) === 0) drawHalo(ctx, r, palette.bloom || '#fff4d6', frame.halo * 0.62, 4.5);
              drawRect(ctx, r, frame.color, frame.scale);
            }
          } else {
            if (completed > 0) this._drawRange(ctx, currentPast + beforeLit - completed, currentPast + beforeLit, palette.unlit);
            const activeStart = completed;
            const activeEnd = triggered;
            for (let order = activeStart; order < activeEnd; order += 1) {
              const futureIndex = beforeLit - 1 - order;
              const triggerAt = timeline.focusMs + order * timeline.interval;
              const t = clamp((elapsed - triggerAt) / timeline.cellMs, 0, 1);
              const r = cellRect(this.layout, currentPast + futureIndex);
              const startColor = futureCellColor(before, futureIndex, palette);
              const frame = extinguishFrame(t, startColor, palette);
              if ((order - activeStart) % Math.max(1, Math.ceil((activeEnd - activeStart) / 28)) === 0) drawHalo(ctx, r, palette.ember || '#d77957', frame.halo * 0.46, 3.8);
              drawRect(ctx, r, frame.color, frame.scale);
            }
          }

          this._drawToday(ctx, after, palette, now);
          ctx.restore();

          if (completed !== lastReportedCompleted) {
            lastReportedCompleted = completed;
            if (typeof config.onProgress === 'function') {
              const currentLit = kind === 'ignite' ? beforeLit + completed : beforeLit - completed;
              config.onProgress(completed, delta, currentLit, triggered);
            }
          }

          if (elapsed >= timeline.totalMs) {
            finish(false, elapsed);
            return;
          }
          this.raf = this.requestFrame(tick);
        } catch (err) {
          settleReject(err);
        }
      };
      this.raf = this.requestFrame(tick);
    });
  }
}

module.exports = {
  DEFAULT_TIMING,
  computeGridLayout,
  computeRitualTimeline,
  targetTriggerSpan,
  visibleGridWindow,
  makeStarfield,
  intervalFor,
  pickScale,
  igniteFrame,
  extinguishFrame,
  RitualGrid
};
