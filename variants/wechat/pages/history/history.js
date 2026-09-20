const storage = require('../../utils/storage');
const model = require('../../utils/model');
const fmt = require('../../utils/format');
const themeUtil = require('../../utils/theme');
const categoryUtil = require('../../utils/categories');
const PAGE_SIZE = 100;

Page({
  data: { items: [], count: 0, shown: 0, hasMore: false, actionFeedback: '', themeClass: 'theme-midnight', pageBackground: '#07080c', appearanceClass: 'font-system font-scale-100' },
  onShow() {
    const settings = model.normalizeSettings(storage.getSettings());
    const theme = themeUtil.applyNavigation(settings.theme);
    this.setData({ themeClass: theme.className, pageBackground: theme.pageBackground, appearanceClass: themeUtil.getAppearanceClasses(settings) });
    this.load(true);
  },
  load(reset) {
    const offset = reset ? 0 : Number(this.data.items.length || 0);
    const page = storage.getTransactionPage(offset, PAGE_SIZE);
    const mapped = page.items.map(tx => ({
      id: tx.id, type: tx.type, occurred_on: tx.occurred_on,
      noteText: tx.system_kind === storage.OPENING_KIND ? '起始自由本金 · 系统基准' : (tx.note || (tx.type === 'income' ? '新增财富' : categoryUtil.categoryName(tx.category_id))),
      metaText: tx.type === 'expense' ? `${categoryUtil.categoryName(tx.category_id)}${tx.detail_tag ? ` · ${tx.detail_tag}` : ''}${tx.nature ? ` · ${categoryUtil.natureName(tx.nature)}` : ''}` : '',
      locked: !!tx.system_locked || tx.system_kind === storage.OPENING_KIND,
      sign: tx.type === 'income' ? '+' : '−', amountText: fmt.money(tx.amount)
    }));
    const items = reset ? mapped : (this.data.items || []).concat(mapped);
    this.setData({ items, count: page.total, shown: items.length, hasMore: page.hasMore });
  },
  loadMore() { this.load(false); },
  remove(e) {
    const id = Number(e.currentTarget.dataset.id);
    wx.showModal({
      title: '删除这笔记录？',
      content: '删除后自由天数会按当前计算口径重新计算。退款/报销如果需要冲销原支出：删除原支出，再按最终真实净消耗重新记录。',
      confirmText: '删除', confirmColor: '#b46f5d',
      success: res => {
        if (!res.confirm) return;
        try {
          const settings = model.normalizeSettings(storage.getSettingsStrict());
          const beforeTx = storage.getTransactionsStrict();
          const before = model.computeStats(settings, beforeTx);
          const removed = storage.deleteTransaction(id);
          if (!removed) { wx.showToast({ title: '记录不存在或已删除', icon: 'none' }); this.load(true); return; }
          const afterTx = storage.getTransactionsStrict();
          const after = model.computeStats(settings, afterTx);
          const rebased = before.first_record !== after.first_record && before.tracking_days !== after.tracking_days;
          const actionFeedback = rebased
            ? `已删除并重算生活成本估计：观察起点 ${before.first_record || '无'} → ${after.first_record || '无'}，观察跨度 ${before.tracking_days || 0} → ${after.tracking_days || 0} 天；自由时间 ${before.lit_count || 0} → ${after.lit_count || 0} 天。删除属于自由模型的账本修正，不播放新增财富/生活消耗仪式。`
            : `已删除并重新计算：自由时间 ${before.lit_count || 0} → ${after.lit_count || 0} 天。删除属于自由模型的账本修正，不播放新增财富/生活消耗仪式。`;
          this.setData({ actionFeedback });
          this.load(true);
          wx.showToast({ title: '已删除', icon: 'none' });
        } catch (err) { wx.showToast({ title: '账本暂时无法安全读取，未删除任何记录', icon: 'none' }); }
      }
    });
  }
});

function sortTxDesc(a, b) {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1;
  return Number(b.id || 0) - Number(a.id || 0);
}
