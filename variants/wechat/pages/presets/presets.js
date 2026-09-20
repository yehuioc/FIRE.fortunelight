const storage = require('../../utils/storage');
const model = require('../../utils/model');
const categoryUtil = require('../../utils/categories');
const themeUtil = require('../../utils/theme');

Page({
  data: {
    themeClass: 'theme-midnight', pageBackground: '#07080c', appearanceClass: 'font-system font-scale-100',
    categories: categoryUtil.publicCategories(),
    categoryIndex: 0,
    natureOptions: [{ id: '', name: '不预设' }].concat(categoryUtil.publicNatures()),
    natureIndex: 0,
    form: { label: '', note: '' },
    items: []
  },
  onShow() {
    const settings = model.normalizeSettings(storage.getSettings());
    const theme = themeUtil.applyNavigation(settings.theme);
    this.setData({ themeClass: theme.className, pageBackground: theme.pageBackground, appearanceClass: themeUtil.getAppearanceClasses(settings) });
    this.load();
  },
  load() {
    const items = storage.getExpensePresets().map(item => ({
      ...item,
      categoryName: categoryUtil.categoryName(item.category_id),
      natureName: item.nature ? categoryUtil.natureName(item.nature) : '不预设',
      noteText: item.note || '只填入子标签，不自动补备注'
    }));
    this.setData({ items });
  },
  onCategory(e) { this.setData({ categoryIndex: Number(e.detail.value || 0) }); },
  onNature(e) { this.setData({ natureIndex: Number(e.detail.value || 0) }); },
  onLabel(e) { this.setData({ 'form.label': e.detail.value }); },
  onNote(e) { this.setData({ 'form.note': e.detail.value }); },
  addPreset() {
    const category = this.data.categories[this.data.categoryIndex];
    const nature = this.data.natureOptions[this.data.natureIndex];
    const label = storage.trimTag(this.data.form.label, 12);
    const note = storage.trimNote(this.data.form.note, 40);
    if (!category || !label) { wx.showToast({ title: '先填写快捷标签名称', icon: 'none' }); return; }
    try {
      storage.addExpensePreset({ category_id: category.id, label, note, nature: nature && nature.id });
      this.setData({ form: { label: '', note: '' }, natureIndex: 0 });
      this.load();
      wx.showToast({ title: '已加入快捷标签', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: String(err && err.message) === 'PRESET_DUPLICATE' ? '这个分类下已有同名标签' : '保存失败，请重试', icon: 'none' });
    }
  },
  remove(e) {
    const id = Number(e.currentTarget.dataset.id);
    const item = (this.data.items || []).find(x => Number(x.id) === id);
    if (!item) return;
    wx.showModal({
      title: `删除“${item.label}”？`,
      content: '已记账的历史记录不会被改动；只是以后不再显示这个快捷标签。',
      confirmText: '删除', confirmColor: '#b46f5d',
      success: res => {
        if (!res.confirm) return;
        try { storage.deleteExpensePreset(id); this.load(); wx.showToast({ title: '已删除', icon: 'none' }); }
        catch (err) { wx.showToast({ title: '删除失败，请重试', icon: 'none' }); }
      }
    });
  }
});
