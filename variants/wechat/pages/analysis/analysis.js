const storage = require('../../utils/storage');
const model = require('../../utils/model');
const fmt = require('../../utils/format');
const analytics = require('../../utils/analytics');
const categoryUtil = require('../../utils/categories');
const themeUtil = require('../../utils/theme');

Page({
  data: {
    themeClass: 'theme-midnight', pageBackground: '#07080c', appearanceClass: 'font-system font-scale-100',
    period: 'month',
    periodOptions: [{ id: 'week', name: '周' }, { id: 'month', name: '月' }, { id: 'year', name: '年' }],
    summary: null,
    totalText: '¥0', previousText: '¥0', deltaText: '¥0', deltaClass: '', deltaPctText: '', topText: '暂无',
    categories: [], natures: [],
    selectedCategory: '', selectedDetailTag: '', detailTags: [], trend: [], trendTitle: '消费趋势', trendMaxText: '¥0',
    exporting: false, exportHint: '', periodMetricLabel: '本月至今', reviewMode: false
  },
  onLoad(options) {
    const requested = options && String(options.period || '');
    const previousWeekReview = requested === 'week' && options && String(options.source || '') === 'weekly' && String(options.review || '') === 'previous';
    if (previousWeekReview) {
      const now = new Date();
      this._analysisNow = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 12, 0, 0, 0);
      this.setData({ period: 'week', reviewMode: true });
    } else if (['week', 'month', 'year'].includes(requested)) this.setData({ period: requested });
  },
  onShow() {
    const settings = model.normalizeSettings(storage.getSettings());
    const theme = themeUtil.applyNavigation(settings.theme);
    this._theme = theme;
    this.setData({ themeClass: theme.className, pageBackground: theme.pageBackground, appearanceClass: themeUtil.getAppearanceClasses(settings) });
    this.load();
  },
  onReady() { this.scheduleChart(); },
  selectPeriod(e) {
    const period = String(e.currentTarget.dataset.id || '');
    if (!['week', 'month', 'year'].includes(period) || period === this.data.period) return;
    this._analysisNow = null;
    this.setData({ period, selectedDetailTag: '', reviewMode: false });
    this.load();
  },
  selectCategory(e) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    this.setData({ selectedCategory: id, selectedDetailTag: '' });
    this.refreshTrend();
  },
  selectDetailTag(e) {
    const tag = String(e.currentTarget.dataset.tag || '');
    this.setData({ selectedDetailTag: this.data.selectedDetailTag === tag ? '' : tag });
    this.refreshTrend();
  },
  load() {
    try {
      const analysisNow = this._analysisNow || new Date();
      const b = analytics.bounds(this.data.period, analysisNow);
      const items = storage.getTransactionsInRange(b.previousStart, b.end);
      this._analysisItems = items;
      const summary = analytics.summarize(items, this.data.period, analysisNow);
      let selectedCategory = this.data.selectedCategory;
      if (!summary.categoryBreakdown.some(x => x.id === selectedCategory)) selectedCategory = summary.topCategory ? summary.topCategory.id : '';
      const categories = summary.categoryBreakdown.map(x => ({ ...x, amountText: fmt.money(x.amount), shareText: `${x.share.toFixed(1)}%`, barWidth: `${Math.max(0, Math.min(100, x.share))}%` }));
      const natures = summary.natureBreakdown.map(x => ({ ...x, amountText: fmt.money(x.amount), shareText: `${x.share.toFixed(1)}%`, barWidth: `${Math.max(0, Math.min(100, x.share))}%` }));
      const deltaClass = summary.delta > 0 ? 'delta-up' : (summary.delta < 0 ? 'delta-down' : '');
      const deltaPctText = summary.deltaPct === null ? '上期同期为 0' : `${summary.deltaPct > 0 ? '+' : ''}${summary.deltaPct.toFixed(1)}%`;
      this.setData({
        summary, categories, natures, selectedCategory,
        totalText: fmt.money(summary.total), previousText: fmt.money(summary.previousTotal),
        deltaText: `${summary.delta > 0 ? '+' : summary.delta < 0 ? '−' : ''}${fmt.money(Math.abs(summary.delta))}`,
        deltaClass, deltaPctText,
        topText: summary.topCategory ? `${summary.topCategory.name} · ${fmt.money(summary.topCategory.amount)}` : '暂无消费',
        periodMetricLabel: this.data.reviewMode ? '上周' : (this.data.period === 'week' ? '本周至今' : this.data.period === 'year' ? '本年至今' : '本月至今'),
        exportHint: ''
      });
      this.refreshTrend();
    } catch (err) {
      this.setData({ summary: null, categories: [], natures: [], trend: [], exportHint: '本地账本暂时无法安全读取。' });
    }
  },
  refreshTrend() {
    const categoryId = this.data.selectedCategory;
    const allItems = this._analysisItems || [];
    const detailTags = categoryId ? analytics.availableDetailTags(allItems, categoryId) : [];
    let selectedDetailTag = this.data.selectedDetailTag;
    if (selectedDetailTag && !detailTags.includes(selectedDetailTag)) selectedDetailTag = '';
    const trend = analytics.trend(allItems, this.data.period, { category_id: categoryId, detail_tag: selectedDetailTag }, this._analysisNow || new Date());
    const max = trend.reduce((m, x) => Math.max(m, Number(x.amount || 0)), 0);
    const titleParts = [categoryId ? categoryUtil.categoryName(categoryId) : '全部消费'];
    if (selectedDetailTag) titleParts.push(selectedDetailTag);
    this.setData({ detailTags, selectedDetailTag, trend, trendTitle: `${titleParts.join(' · ')}趋势`, trendMaxText: fmt.money(max) });
    this.scheduleChart();
  },
  scheduleChart() {
    if (this._chartTimer) clearTimeout(this._chartTimer);
    this._chartTimer = setTimeout(() => this.drawTrend(), 40);
  },
  drawTrend() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#trendCanvas').fields({ node: true, size: true }).exec(res => {
      const info = res && res[0];
      if (!info || !info.node || !info.width || !info.height) return;
      const canvas = info.node, ctx = canvas.getContext('2d');
      if (!ctx) return;
      const wi = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : { pixelRatio: 2 };
      const dpr = Math.max(1, Math.min(Number(wi.pixelRatio || 2), 3));
      const width = Number(info.width), height = Number(info.height);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0); else ctx.scale(dpr, dpr);
      const paper = this.data.themeClass === 'theme-paper';
      const bg = paper ? '#f3ecdf' : '#0b0e13';
      const grid = paper ? 'rgba(70,55,35,.12)' : 'rgba(255,255,255,.08)';
      const line = paper ? '#9a6b20' : '#f1c75b';
      const point = paper ? '#7f5718' : '#ffe18a';
      ctx.clearRect(0, 0, width, height); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      const data = this.data.trend || [];
      const pad = { l: 16, r: 16, t: 20, b: 28 };
      const chartW = Math.max(1, width - pad.l - pad.r), chartH = Math.max(1, height - pad.t - pad.b);
      ctx.strokeStyle = grid; ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i += 1) { const y = pad.t + chartH * i / 3; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke(); }
      const max = Math.max(1, ...data.map(x => Number(x.amount || 0)));
      if (data.length) {
        ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath();
        data.forEach((x, i) => {
          const px = data.length === 1 ? width / 2 : pad.l + chartW * i / (data.length - 1);
          const py = pad.t + chartH * (1 - Number(x.amount || 0) / max);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        const step = data.length > 16 ? Math.ceil(data.length / 8) : 1;
        data.forEach((x, i) => {
          if (i % step !== 0 && i !== data.length - 1) return;
          const px = data.length === 1 ? width / 2 : pad.l + chartW * i / (data.length - 1);
          const py = pad.t + chartH * (1 - Number(x.amount || 0) / max);
          ctx.fillStyle = point; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = paper ? '#807568' : '#6f737d'; ctx.font = '10px sans-serif';
        ctx.textAlign = 'left'; ctx.fillText(data[0].label, pad.l, height - 8);
        ctx.textAlign = 'right'; ctx.fillText(data[data.length - 1].label, width - pad.r, height - 8);
      }
    });
  },
  exportCsv() {
    if (this.data.exporting) return;
    try {
      const analysisNow = this._analysisNow || new Date();
      const b = analytics.bounds(this.data.period, analysisNow);
      const items = storage.getTransactionsInRange(b.start, b.end);
      const csv = analytics.createCsvReport(items, this.data.period, analysisNow);
      const fs = wx.getFileSystemManager();
      const stamp = model.isoDate();
      const fileName = `财富自由指南灯_消费报告_${this.data.period}_${stamp}.csv`;
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      this.setData({ exporting: true, exportHint: '' });
      fs.writeFile({
        filePath, data: csv, encoding: 'utf8',
        success: () => {
          const finish = msg => this.setData({ exporting: false, exportHint: msg });
          if (typeof wx.shareFileMessage === 'function') {
            wx.shareFileMessage({ filePath, fileName, success: () => finish('消费报告已生成并打开转发。'), fail: () => finish(`消费报告已生成：${fileName}`) });
          } else finish(`消费报告已生成：${fileName}`);
        },
        fail: () => this.setData({ exporting: false, exportHint: 'CSV 写入失败，请检查小程序存储空间后重试。' })
      });
    } catch (err) { this.setData({ exporting: false, exportHint: '消费报告生成失败；账本没有被修改。' }); }
  },
  onUnload() { if (this._chartTimer) clearTimeout(this._chartTimer); }
});
