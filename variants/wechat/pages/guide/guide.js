const storage = require('../../utils/storage');
const model = require('../../utils/model');
const themeUtil = require('../../utils/theme');

Page({
  data: {
    themeClass: 'theme-midnight',
    pageBackground: '#07080c',
    appearanceClass: 'font-system font-scale-100',
    activeTab: 'usage'
  },
  onLoad(options) {
    const tab = options && options.tab === 'idea' ? 'idea' : 'usage';
    this.setData({ activeTab: tab });
  },
  onShow() {
    const settings = model.normalizeSettings(storage.getSettings());
    const theme = themeUtil.applyNavigation(settings.theme);
    this.setData({ themeClass: theme.className, pageBackground: theme.pageBackground, appearanceClass: themeUtil.getAppearanceClasses(settings) });
  },
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'usage' || tab === 'idea') this.setData({ activeTab: tab });
  },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
  goAnalysis() { wx.navigateTo({ url: '/pages/analysis/analysis' }); },
  goPresets() { wx.navigateTo({ url: '/pages/presets/presets' }); },
  goHistory() { wx.navigateTo({ url: '/pages/history/history' }); }
});
