const assert = require('assert');

let exportedCanvas = null;
global.wx = {
  setNavigationBarColor() {},
  canvasToTempFilePath(options) {
    exportedCanvas = options.canvas;
    options.success({ tempFilePath: 'wxfile://life-grid-v032.png' });
  }
};

let def = null;
global.Page = d => { def = d; };
require('../pages/index/index');
assert(def, 'index page definition missing');

const page = {};
Object.keys(def).forEach(key => {
  if (key === 'data') page.data = JSON.parse(JSON.stringify(def.data));
  else page[key] = def[key];
});
page.setData = function(patch) { Object.assign(this.data, patch); };

const rects = [];
const ctx = {
  fillStyle: '',
  clearRect() {},
  fillRect(x, y, w, h) { rects.push([x, y, w, h, this.fillStyle]); },
  createRadialGradient() { return { addColorStop() {} }; }
};
const canvas = {
  requestAnimationFrame(cb) { cb(); },
  getContext() { return ctx; }
};
page._canvas = canvas;
page._ctx = ctx;
page._canvasWidth = 330;
page._canvasHeight = 235;
page._theme = require('../utils/theme').getTheme('midnight');

const stats = {
  total_cells: 100,
  past_cells: 0,
  tracked_past_cells: 0,
  lit_count: 25,
  overflow: 0
};
page.renderGridSnapshot(stats, { delta: -5, beforeLit: 30, afterLit: 25 });
assert.strictEqual(exportedCanvas, canvas, 'must export the same Canvas 2D node');
assert.strictEqual(page.data.gridImagePath, 'wxfile://life-grid-v032.png');
assert.strictEqual(page.data.gridRendering, false);
assert(rects.length >= 101, 'background + grid cells should be painted before export');

console.log('grid_render.test.js: PASS');
