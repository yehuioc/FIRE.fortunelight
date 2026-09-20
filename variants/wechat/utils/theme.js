const THEMES = {
  midnight: {
    id: 'midnight',
    name: '深夜金',
    className: 'theme-midnight',
    pageBackground: '#07080c',
    navBackground: '#080a0f',
    navFront: '#ffffff',
    canvas: {
      background: '#0b0e13',
      unlit: '#292d35',
      lit: '#ffd166',
      asset: '#9cc3ff',
      bloom: '#fff4d6',
      ash: '#5a4030',
      ember: '#d77957',
      ignite: '#fff1a6',
      extinguish: '#d77957',
      past: '#1a1d23',
      trackedPast: '#343126',
      glow: 'rgba(241,199,91,0.13)'
    }
  },
  paper: {
    id: 'paper',
    name: '纸上自由',
    className: 'theme-paper',
    pageBackground: '#eee7db',
    navBackground: '#eee7db',
    navFront: '#000000',
    canvas: {
      background: '#e5ddcf',
      unlit: '#cfc4b4',
      lit: '#a8741f',
      asset: '#58769a',
      bloom: '#fff3d2',
      ash: '#8f7868',
      ember: '#a65f4d',
      ignite: '#d49a32',
      extinguish: '#a65f4d',
      past: '#d9d0c3',
      trackedPast: '#9b8e78',
      glow: 'rgba(168,116,31,0.12)'
    }
  }
};

function normalizeTheme(value) {
  return THEMES[value] ? value : 'midnight';
}

function getTheme(value) {
  return THEMES[normalizeTheme(value)];
}

const FONT_FAMILIES = {
  system: { id: 'system', name: '系统黑体', className: 'font-system' },
  serif: { id: 'serif', name: '宋体阅读', className: 'font-serif' }
};

const FONT_SCALES = {
  '85': { id: '85', name: '85%', className: 'font-scale-85', ratio: 0.85 },
  '90': { id: '90', name: '90%', className: 'font-scale-90', ratio: 0.90 },
  '95': { id: '95', name: '95%', className: 'font-scale-95', ratio: 0.95 },
  '100': { id: '100', name: '100%', className: 'font-scale-100', ratio: 1.00 },
  '105': { id: '105', name: '105%', className: 'font-scale-105', ratio: 1.05 },
  '110': { id: '110', name: '110%', className: 'font-scale-110', ratio: 1.10 },
  '115': { id: '115', name: '115%', className: 'font-scale-115', ratio: 1.15 }
};

const LEGACY_FONT_SCALE_MAP = { compact: '90', standard: '100', large: '110' };

function normalizeFontFamily(value) { return FONT_FAMILIES[value] ? value : 'system'; }
function normalizeFontScale(value) {
  const raw = String(value === undefined || value === null ? '' : value);
  const mapped = LEGACY_FONT_SCALE_MAP[raw] || raw;
  return FONT_SCALES[mapped] ? mapped : '100';
}
function getAppearanceClasses(settings) {
  const s = settings || {};
  return `${FONT_FAMILIES[normalizeFontFamily(s.font_family)].className} ${FONT_SCALES[normalizeFontScale(s.font_scale)].className}`;
}

function applyNavigation(value) {
  const theme = getTheme(value);
  if (typeof wx !== 'undefined' && typeof wx.setNavigationBarColor === 'function') {
    wx.setNavigationBarColor({
      frontColor: theme.navFront,
      backgroundColor: theme.navBackground,
      animation: { duration: 120, timingFunc: 'easeInOut' }
    });
  }
  return theme;
}

module.exports = {
  THEMES, FONT_FAMILIES, FONT_SCALES,
  normalizeTheme, getTheme, applyNavigation,
  normalizeFontFamily, normalizeFontScale, getAppearanceClasses
};
