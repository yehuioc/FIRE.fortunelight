const assert = require('assert');
const fs = require('fs');

const indexWxml = fs.readFileSync('pages/index/index.wxml','utf8');
const indexWxss = fs.readFileSync('pages/index/index.wxss','utf8');
const settingsWxml = fs.readFileSync('pages/settings/settings.wxml','utf8');
const settingsWxss = fs.readFileSync('pages/settings/settings.wxss','utf8');
const settingsJs = fs.readFileSync('pages/settings/settings.js','utf8');
const indexJs = fs.readFileSync('pages/index/index.js','utf8');

// Real-device regression: native <input> text in paper theme must get an explicit
// style value, not only rely on inherited WXSS color.
assert(settingsWxml.includes('class="money-control__input"'));
assert(settingsWxml.includes('style="color:{{inputTextColor}};"'));
assert(settingsWxml.includes('placeholder-style="color:{{inputPlaceholderColor}};"'));
assert(settingsJs.includes("theme.id === 'paper' ? '#40372e' : '#ebe7de'"));
assert(settingsWxss.includes('.theme-paper .money-control__input { color: #40372e; }'));

// Same native input guard is applied to paper-theme onboarding, so the bug cannot
// reappear before settings are even created.
assert(indexWxml.includes('class="money-input__field"'));
assert(indexWxml.includes('style="color:{{inputTextColor}};"'));
assert(indexJs.includes("theme.id === 'paper' ? '#40372e' : '#eee9df'"));
assert(indexWxss.includes('.theme-paper .money-input input, .theme-paper .money-input__field { color:#40372e; }'));

// Header must reserve a distinct auto-sized action column. The brand is clipped
// inside its own column rather than painting underneath 理念 / 设置.
assert(indexWxml.includes('class="topbar__brand"'));
assert(indexWxss.includes('grid-template-columns: minmax(0, 1fr) auto'));
assert(indexWxss.includes('.topbar__brand { min-width: 0; overflow: hidden; }'));
assert(indexWxss.includes('.topbar__actions { display: flex; align-items: center; gap: 8rpx; flex: none; }'));
assert(indexWxss.includes('@media (max-width: 360px)'));
assert(!indexWxss.includes('.topbar > view:first-child'));

console.log('v052_true_device_regression.test.js: PASS');
