const assert = require('assert');
const fs = require('fs');
const path = require('path');

const theme = require('../utils/theme');
const model = require('../utils/model');
const layout = require('../utils/home_layout');

assert.strictEqual(theme.normalizeFontScale('compact'), '90');
assert.strictEqual(theme.normalizeFontScale('standard'), '100');
assert.strictEqual(theme.normalizeFontScale('large'), '110');
assert.strictEqual(theme.normalizeFontScale('85'), '85');
assert.strictEqual(theme.normalizeFontScale('115'), '115');
assert.strictEqual(theme.normalizeFontScale('999'), '100');
assert.strictEqual(theme.getAppearanceClasses({ font_family: 'system', font_scale: '105' }), 'font-system font-scale-105');

const migrated = model.normalizeSettings({ font_scale: 'large', home_module_order: ['record', 'record', 'nope', 'grid'], inline_tips_enabled: false });
assert.strictEqual(migrated.font_scale, '110');
assert.deepStrictEqual(migrated.home_module_order, ['record', 'grid', 'overview', 'habit']);
assert.strictEqual(migrated.inline_tips_enabled, false);
assert.deepStrictEqual(layout.move(['overview', 'grid', 'habit', 'record'], 'record', -3), ['record', 'overview', 'grid', 'habit']);
assert.deepStrictEqual(layout.move(['record', 'overview', 'grid', 'habit'], 'record', 99), ['overview', 'grid', 'habit', 'record']);

const root = path.join(__dirname, '..');
const indexWxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8');
const settingsWxml = fs.readFileSync(path.join(root, 'pages/settings/settings.wxml'), 'utf8');
const guideWxml = fs.readFileSync(path.join(root, 'pages/guide/guide.wxml'), 'utf8');
const indexWxss = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8');

for (const token of ['财富自由指南灯', '消费分析', 'weekly-dock', "settings.habit_center && habitSummary", '使用提示 ›', '只用于复盘，不改变自由天数公式']) {
  assert(indexWxml.includes(token), `index missing ${token}`);
}
assert(indexWxml.indexOf('weekly-dock') < indexWxml.indexOf('wx:for="{{homeModules}}"'), 'weekly review must remain independent from record-center ordering');
for (const token of ['首页布局', '打开使用指南', '重新播放新手引导', 'fontScaleOptions', '就地使用提示']) {
  assert(settingsWxml.includes(token), `settings missing ${token}`);
}
for (const token of ['财富自由指南灯 · 说明书', '使用指南', '核心理念', '消费性质是可选的复盘标签', '首页可以按你的习惯重排']) {
  assert(guideWxml.includes(token), `guide missing ${token}`);
}
for (const token of ['.font-scale-85 .section-title', '.font-scale-115 .section-title', '.weekly-dock--glow', '.choice-chip--quick']) {
  assert(indexWxss.includes(token), `proportional UI CSS missing ${token}`);
}

for (const dir of ['activity','analysis','guide','history','index','presets','settings']) {
  const css = fs.readFileSync(path.join(root, `pages/${dir}/${dir}.wxss`), 'utf8');
  assert(css.includes('v0.6.2 proportional typography generated'), `${dir} missing proportional typography block`);
  assert(css.includes('.font-scale-85 '), `${dir} missing 85% typography rules`);
  assert(css.includes('.font-scale-115 '), `${dir} missing 115% typography rules`);
}

console.log('v062_ui_settings.test.js: PASS');
