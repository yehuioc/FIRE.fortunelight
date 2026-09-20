const assert = require('assert');
const r = require('../utils/ritual_grid');

const layout = r.computeGridLayout(20000, 340, 560);
assert(layout.cols > 1 && layout.rows > 1);
assert(layout.gridW <= 340 + 0.01);
assert(layout.gridH <= 560 + 0.01);

const small = r.computeRitualTimeline(1, 'ignite');
assert.strictEqual(small.delta, 1);
assert(small.totalMs > small.cellMs);

const medium = r.computeRitualTimeline(100, 'ignite');
assert(medium.triggerSpan > 10000 && medium.triggerSpan < 15000);
const large = r.computeRitualTimeline(1000, 'ignite');
assert(Math.abs(large.triggerSpan - 15000) < 1);
const out = r.computeRitualTimeline(1000, 'extinguish');
assert(Math.abs(out.triggerSpan - 15000) < 1);
// Total ritual duration must never drop when delta crosses an adaptive-timing boundary.
let prevIgnite = 0, prevExtinguish = 0;
for (let d = 1; d <= 1200; d += 1) {
  const ti = r.computeRitualTimeline(d, 'ignite').totalMs;
  const te = r.computeRitualTimeline(d, 'extinguish').totalMs;
  assert(ti + 1e-6 >= prevIgnite, `ignite duration regressed at ${d}`);
  assert(te + 1e-6 >= prevExtinguish, `extinguish duration regressed at ${d}`);
  prevIgnite = ti; prevExtinguish = te;
}

assert(r.pickScale(2) > r.pickScale(100));
const igniteEarly = r.igniteFrame(0.1, '#ffd166', {unlit:'#292d35', bloom:'#fff4d6'});
const igniteEnd = r.igniteFrame(1, '#ffd166', {unlit:'#292d35', bloom:'#fff4d6'});
assert(igniteEarly.scale > 1);
assert.strictEqual(igniteEnd.scale, 1);
const extinguishEnd = r.extinguishFrame(1, '#ffd166', {unlit:'#292d35', ash:'#5a4030'});
assert.strictEqual(extinguishEnd.scale, 1);

const paperIgnite = r.igniteFrame(0.16, '#a8741f', {unlit:'#cfc4b4', bloom:'#fff3d2'});
const paperRgb = paperIgnite.color.match(/rgb\((\d+),(\d+),(\d+)\)/);
assert(paperRgb, 'ignite color should stay parseable after bloom mixing');
assert(Number(paperRgb[1]) > 80 && Number(paperRgb[2]) > 60, 'paper ignite must remain warm/gold, never collapse to black');
console.log('ritual_core.test.js: PASS');


// Camera zoom must render only the visible vector window instead of scaling a cached bitmap.
const visible = r.visibleGridWindow(layout, 340, 560, { scale: 8.5, cx: 170, cy: 280 }, 2);
assert(visible.rowEnd >= visible.rowStart && visible.colEnd >= visible.colStart);
assert((visible.rowEnd - visible.rowStart + 1) < layout.rows, 'zoomed camera should cull most rows');

function fakeGradient() { return { addColorStop() {} }; }
function fakeContext() {
  return {
    fillStyle: '', globalCompositeOperation: 'source-over', imageSmoothingEnabled: true,
    setTransform() {}, clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, scale() {},
    beginPath() {}, rect() {}, fill() {}, drawImage() {},
    createRadialGradient() { return fakeGradient(); }, createLinearGradient() { return fakeGradient(); }
  };
}
function fakeCanvas() { return { width: 1, height: 1, getContext() { return fakeContext(); } }; }

(async () => {
  let time = 0;
  const canvas = fakeCanvas();
  const starts = [];
  const progress = [];
  const engine = new r.RitualGrid(canvas, {
    now: () => time,
    requestFrame: cb => setImmediate(() => { time += 16; cb(time); }),
    cancelFrame() {}
  });
  engine.resize(340, 560, 1);
  const before = { total_cells: 1000, future_cells: 1000, past_cells: 0, tracked_past_cells: 0, asset_lit: 0, income_lit: 100, lit_count: 100 };
  const after = { ...before, income_lit: 103, lit_count: 103 };
  const palette = { background:'#000000', unlit:'#222222', lit:'#ffd166', asset:'#9cc3ff', bloom:'#fff4d6', ash:'#5a4030', past:'#111111', trackedPast:'#333333' };
  const result = await engine.run({
    before, after, palette, kind:'ignite',
    onCellStart: order => starts.push(order),
    onProgress: (done, all, currentLit, triggered) => progress.push({done, all, currentLit, triggered})
  });
  assert.deepStrictEqual(starts, [0,1,2]);
  assert.strictEqual(progress[0].done, 0);
  assert.strictEqual(progress[0].currentLit, 100, 'numeric feedback must not jump before a cell finishes');
  assert(progress.some(x => x.done === 1 && x.currentLit === 101));
  assert.strictEqual(progress[progress.length - 1].done, 3);
  assert.strictEqual(progress[progress.length - 1].currentLit, 103);
  assert.strictEqual(result.skipped, false);
  console.log('ritual_core.runtime: PASS');
})().catch(err => { console.error(err); process.exit(1); });

// starfield stays deterministic and bounded; ritual atmosphere must not jitter its geometry frame-to-frame.
{
  const a = r.makeStarfield(390, 520, 40);
  const b = r.makeStarfield(390, 520, 40);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.length, 40);
  assert(a.every(s => s.x >= 0 && s.x <= 390 && s.y >= 0 && s.y <= 520 && s.r > 0));
}
