const storage = require('../../utils/storage');
const model = require('../../utils/model');
const themeUtil = require('../../utils/theme');
const fmt = require('../../utils/format');
const homeLayout = require('../../utils/home_layout');

Page({
  data: {
    today: '',
    themeClass: 'theme-midnight',
    pageBackground: '#07080c',
    inputTextColor: '#ebe7de',
    inputPlaceholderColor: '#686c75',
    appearanceClass: 'font-system font-scale-100',
    quickNetSavings: '¥0',
    saving: false,
    backupBusy: false,
    backupHint: '',
    fontScaleOptions: ['85','90','95','100','105','110','115'],
    homeLayoutRows: homeLayout.describeOrder(null),
    form: {
      birth_date: '', target_age: 80, mode: 'quick', expense_mode: 'manual',
      manual_daily_expense: 0, opening_balance: 0, show_past: false,
      use_initial_assets: false, initial_assets: 0, tracking_days_override: 0,
      theme: 'midnight', font_family: 'system', font_scale: '100', advanced_dormant: null,
      home_module_order: homeLayout.DEFAULT_ORDER.slice(), inline_tips_enabled: true,
      freedom_delta_hint: true, habit_center: true, achievements_enabled: true, quick_entry_enabled: true, missed_prompt_enabled: true, weekly_review_enabled: true
    }
  },

  onLoad() {
    this._destroyed = false;
    const today = model.isoDate();
    try {
      storage.migrateKernelV033(today);
      const raw = storage.getSettingsStrict();
      const settings = model.normalizeSettings(raw || {});
      const transactions = storage.getTransactionsStrict();
      const opening = storage.getOpeningBalanceStrict();
      const stats = model.computeStats(settings, transactions);
      const form = { ...settings, opening_balance: opening };
      this.setData({ today, form, quickNetSavings: fmt.money(stats.net_savings), homeLayoutRows: homeLayout.describeOrder(form.home_module_order) });
      this._persistedFormFingerprint = fingerprintSettingsForm(settings, opening);
      this._advancedDraft = settings.mode === 'advanced' ? this.captureAdvancedDraft(form) : { ...settings.advanced_dormant };
      this.applyAppearance(settings);
    } catch (err) {
      wx.showToast({ title: '本地数据暂时无法安全读取，请稍后重试', icon: 'none' });
      this._abortLoad = true;
      if (typeof wx.navigateBack === 'function') this._loadBackTimer = setTimeout(() => { if (!this._destroyed) wx.navigateBack(); }, 350);
    }
  },

  onShow() {
    if (this._loadedOnce && !this._destroyed && !this._abortLoad) this.applyAppearance(this.data.form);
    this._loadedOnce = true;
  },

  onUnload() {
    this._destroyed = true;
    this._importSeq = (this._importSeq || 0) + 1;
    if (this._saveBackTimer) clearTimeout(this._saveBackTimer);
    if (this._loadBackTimer) clearTimeout(this._loadBackTimer);
  },

  applyAppearance(source) {
    const s = source || this.data.form || {};
    const theme = themeUtil.applyNavigation(s.theme);
    this.setData({
      themeClass: theme.className,
      pageBackground: theme.pageBackground,
      inputTextColor: theme.id === 'paper' ? '#40372e' : '#ebe7de',
      inputPlaceholderColor: theme.id === 'paper' ? '#9a8f81' : '#686c75',
      appearanceClass: themeUtil.getAppearanceClasses(s)
    });
  },

  captureAdvancedDraft(form) {
    const f = form || this.data.form || {};
    return {
      expense_mode: f.expense_mode === 'ledger' ? 'ledger' : 'manual',
      manual_daily_expense: Number(f.manual_daily_expense || 0),
      use_initial_assets: !!f.use_initial_assets,
      initial_assets: Number(f.initial_assets || 0),
      tracking_days_override: Number(f.tracking_days_override || 0),
      show_past: !!f.show_past
    };
  },

  onBirth(e) { this.setData({ 'form.birth_date': e.detail.value }); },
  onAge(e) { this.setData({ 'form.target_age': e.detail.value }); },
  onShowPast(e) { this.setData({ 'form.show_past': e.detail.value }); },
  onUseAssets(e) { this.setData({ 'form.use_initial_assets': e.detail.value }); },
  onAssets(e) { this.setData({ 'form.initial_assets': e.detail.value }); },
  onTrackingDays(e) { this.setData({ 'form.tracking_days_override': e.detail.value }); },
  onManualDailyExpense(e) { this.setData({ 'form.manual_daily_expense': e.detail.value }); },
  onFreedomDeltaHint(e) { this.setData({ 'form.freedom_delta_hint': !!e.detail.value }); },
  onHabitCenter(e) { this.setData({ 'form.habit_center': !!e.detail.value }); },
  onAchievements(e) { this.setData({ 'form.achievements_enabled': !!e.detail.value }); },
  onQuickEntry(e) { this.setData({ 'form.quick_entry_enabled': !!e.detail.value }); },
  onMissedPrompt(e) { this.setData({ 'form.missed_prompt_enabled': !!e.detail.value }); },
  onWeeklyReview(e) { this.setData({ 'form.weekly_review_enabled': !!e.detail.value }); },
  onInlineTips(e) { this.setData({ 'form.inline_tips_enabled': !!e.detail.value }); },
  onOpeningBalance(e) {
    const value = e.detail.value;
    let currentOpening = 0, transactions = [];
    try { currentOpening = storage.getOpeningBalanceStrict(); transactions = storage.getTransactionsStrict(); }
    catch (err) { this.setData({ 'form.opening_balance': value }); return; }
    const nextCents = model.moneyToCents(value || '0');
    const stats = model.computeStats(this.data.form, transactions);
    const previewNet = Number(stats.net_savings || 0) - currentOpening + (nextCents === null ? 0 : nextCents / 100);
    this.setData({ 'form.opening_balance': value, quickNetSavings: fmt.money(previewNet) });
  },


  moveHomeModule(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const next = homeLayout.move(this.data.form.home_module_order, id, delta);
    this.setData({ 'form.home_module_order': next, homeLayoutRows: homeLayout.describeOrder(next) });
  },
  resetHomeLayout() {
    const next = homeLayout.DEFAULT_ORDER.slice();
    this.setData({ 'form.home_module_order': next, homeLayoutRows: homeLayout.describeOrder(next) });
  },
  goUsageGuide() { wx.navigateTo({ url: '/pages/guide/guide?tab=usage' }); },
  goIdeaGuide() { wx.navigateTo({ url: '/pages/guide/guide?tab=idea' }); },
  goActivity() { wx.navigateTo({ url: '/pages/activity/activity' }); },
  replayOnboarding() {
    if (this._destroyed) return;
    wx.showModal({
      title: '重新查看新手引导？',
      content: '不会清空账本或设置，只会重新播放首次使用说明。完成后仍使用现有数据。',
      confirmText: '重新查看',
      confirmColor: '#c49e43',
      success: res => {
        if (this._destroyed || !res.confirm) return;
        try {
          storage.setOnboardingDone(false);
          wx.reLaunch({ url: '/pages/index/index' });
        } catch (err) { wx.showToast({ title: '暂时无法重新打开引导', icon: 'none' }); }
      }
    });
  },

  selectMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'quick' && mode !== 'advanced') return;
    const currentMode = this.data.form.mode;
    if (currentMode === 'advanced' && mode === 'quick') this._advancedDraft = this.captureAdvancedDraft(this.data.form);
    const patch = { 'form.mode': mode };
    if (mode === 'quick') {
      patch['form.expense_mode'] = 'manual';
      patch['form.use_initial_assets'] = false;
      patch['form.show_past'] = false;
      patch['form.initial_assets'] = 0;
      patch['form.tracking_days_override'] = 0;
    } else if (this._advancedDraft) {
      Object.entries(this._advancedDraft).forEach(([key, value]) => { patch[`form.${key}`] = value; });
    }
    this.setData(patch);
  },

  selectExpenseMode(e) {
    const source = e.currentTarget.dataset.source;
    if (source === 'manual' || source === 'ledger') this.setData({ 'form.expense_mode': source });
  },
  selectTheme(e) {
    const theme = themeUtil.normalizeTheme(e.currentTarget.dataset.theme);
    this.setData({ 'form.theme': theme }, () => this.applyAppearance(this.data.form));
  },
  selectFontFamily(e) {
    const family = themeUtil.normalizeFontFamily(e.currentTarget.dataset.font);
    this.setData({ 'form.font_family': family }, () => this.applyAppearance(this.data.form));
  },
  selectFontScale(e) {
    const scale = themeUtil.normalizeFontScale(e.currentTarget.dataset.scale);
    this.setData({ 'form.font_scale': scale }, () => this.applyAppearance(this.data.form));
  },

  buildNormalizedSettings() {
    const f = this.data.form;
    const advanced = f.mode === 'advanced' ? this.captureAdvancedDraft(f) : (this._advancedDraft || f.advanced_dormant || {});
    return model.normalizeSettings({
      ...f,
      mode: f.mode,
      expense_mode: f.mode === 'quick' ? 'manual' : f.expense_mode,
      manual_daily_expense: f.manual_daily_expense,
      use_initial_assets: f.mode === 'advanced' ? !!f.use_initial_assets : false,
      show_past: f.mode === 'advanced' ? !!f.show_past : false,
      tracking_days_override: f.mode === 'advanced' && f.expense_mode === 'ledger' ? f.tracking_days_override : 0,
      initial_assets: f.mode === 'advanced' ? f.initial_assets : 0,
      advanced_dormant: advanced,
      theme: themeUtil.normalizeTheme(f.theme),
      font_family: themeUtil.normalizeFontFamily(f.font_family),
      font_scale: themeUtil.normalizeFontScale(f.font_scale),
      home_module_order: homeLayout.normalizeOrder(f.home_module_order),
      inline_tips_enabled: f.inline_tips_enabled !== false
    });
  },

  validateForm() {
    const f = this.data.form;
    const age = Number(f.target_age);
    const birth = model.parseDateLocal(f.birth_date);
    const today = model.parseDateLocal(this.data.today);
    if (!Number.isInteger(age) || age < 20 || age > 120) return '目标年龄请输入 20–120 的整数';
    if (!birth || !today || birth > today) return '请选择有效且不晚于今天的出生日期';
    if (model.targetDateFromBirth(birth, age) <= today) return '目标年龄需要大于当前年龄';
    const tracking = Number(f.tracking_days_override || 0);
    if (f.mode === 'advanced' && f.expense_mode === 'ledger' && (!Number.isInteger(tracking) || tracking < 0 || tracking > 365000)) return '观察跨度请输入 0–365000 的整数';
    const dailyCents = model.moneyToCents(f.manual_daily_expense);
    if ((f.mode === 'quick' || f.expense_mode === 'manual') && (dailyCents === null || dailyCents < 1)) return '日均生活成本至少 ¥0.01，且最多两位小数';
    if (model.moneyToCents(f.opening_balance || '0') === null) return '起始自由本金最多保留两位小数';
    if (model.moneyToCents(f.initial_assets || '0') === null) return '起始资产最多保留两位小数';
    return '';
  },

  hasUnsavedChanges() {
    if (this.validateForm()) return true;
    const candidate = this.buildNormalizedSettings();
    const openingCents = model.moneyToCents(this.data.form.opening_balance || '0');
    if (openingCents === null) return true;
    return fingerprintSettingsForm(candidate, openingCents / 100) !== this._persistedFormFingerprint;
  },

  save() {
    if (this.data.saving || this._destroyed || this._abortLoad) return;
    const validation = this.validateForm();
    if (validation) { wx.showToast({ title: validation, icon: 'none' }); return; }
    let transactions;
    try { transactions = storage.getTransactionsStrict(); }
    catch (err) { wx.showToast({ title: '现有账本暂时无法安全读取，未保存设置', icon: 'none' }); return; }
    const birthRaw = this.data.form.birth_date;
    const conflict = transactions.find(tx => tx && tx.system_kind !== storage.OPENING_KIND && String(tx.occurred_on || '') < birthRaw);
    if (conflict) { wx.showToast({ title: `已有账本早于出生日期（${conflict.occurred_on}）`, icon: 'none' }); return; }

    const normalized = this.buildNormalizedSettings();
    const openingCents = model.moneyToCents(this.data.form.opening_balance || '0');
    this.setData({ saving: true });
    try {
      storage.saveConfiguration(normalized, openingCents / 100, this.data.today, true);
      this._advancedDraft = normalized.mode === 'advanced' ? this.captureAdvancedDraft(normalized) : { ...normalized.advanced_dormant };
      if (this._destroyed) return;
      const savedForm = { ...normalized, opening_balance: openingCents / 100 };
      this._persistedFormFingerprint = fingerprintSettingsForm(normalized, openingCents / 100);
      this.setData({ saving: false, form: savedForm });
      wx.showToast({ title: '已保存并重新计算', icon: 'success' });
      if (this._saveBackTimer) clearTimeout(this._saveBackTimer);
      this._saveBackTimer = setTimeout(() => { if (!this._destroyed && typeof wx.navigateBack === 'function') wx.navigateBack(); }, 450);
    } catch (err) {
      if (!this._destroyed) { this.setData({ saving: false }); wx.showToast({ title: '保存失败，原数据未被替换', icon: 'none' }); }
    }
  },

  goAnalysis() { wx.navigateTo({ url: '/pages/analysis/analysis' }); },
  goPresets() { wx.navigateTo({ url: '/pages/presets/presets' }); },

  exportBackup() {
    if (this.data.backupBusy || this._destroyed) return;
    try {
      if (this.hasUnsavedChanges()) {
        wx.showToast({ title: '当前设置有未保存改动，请先保存再导出', icon: 'none' });
        return;
      }
    } catch (err) {
      wx.showToast({ title: '本地数据暂时无法安全读取，未生成备份', icon: 'none' });
      return;
    }
    this.setData({ backupBusy: true, backupHint: '' });
    try {
      const backup = storage.createBackup();
      const json = JSON.stringify(backup);
      if (storage.backupTextByteLength(json) > storage.MAX_BACKUP_FILE_BYTES) throw new Error('BACKUP_FILE_TOO_LARGE');
      const fs = wx.getFileSystemManager();
      const now = new Date();
      const seq = (this._backupExportSequence || 0) + 1;
      this._backupExportSequence = seq;
      const stamp = `${this.data.today || model.isoDate()}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}_${String(now.getMilliseconds()).padStart(3,'0')}_${String(seq).padStart(2,'0')}`;
      const fileName = `财富自由指南灯_备份_${stamp}.json`;
      const root = wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : '';
      const filePath = `${root}/${fileName}`;
      fs.writeFile({
        filePath, data: json, encoding: 'utf8',
        success: () => {
          if (this._destroyed) return;
          const finish = msg => { if (!this._destroyed) this.setData({ backupBusy: false, backupHint: msg }); };
          if (typeof wx.shareFileMessage === 'function') {
            try {
              wx.shareFileMessage({ filePath, fileName, success: () => finish(`备份已生成并打开转发：${backup.transactions.length} 笔记录。请保存到可信位置。`), fail: () => finish(`备份已生成：${fileName}。当前环境无法直接转发文件。`) });
            } catch (err) { finish(`备份已生成：${fileName}。当前环境无法直接转发文件。`); }
          } else finish(`备份已生成：${fileName}。当前环境不支持直接转发文件。`);
        },
        fail: () => { if (!this._destroyed) this.setData({ backupBusy: false, backupHint: '备份文件写入失败，请检查小程序存储空间后重试。' }); }
      });
    } catch (err) {
      if (!this._destroyed) this.setData({ backupBusy: false, backupHint: '备份生成失败；当前数据没有被修改。' });
    }
  },

  importBackup() {
    if (this.data.backupBusy || this._destroyed) return;
    try {
      if (this.hasUnsavedChanges()) { wx.showToast({ title: '当前设置有未保存改动，请先保存或放弃改动', icon: 'none' }); return; }
    } catch (err) { wx.showToast({ title: '本地数据暂时无法安全读取，未开始导入', icon: 'none' }); return; }
    if (typeof wx.chooseMessageFile !== 'function') { wx.showToast({ title: '当前微信版本不支持选择备份文件', icon: 'none' }); return; }
    const seq = (this._importSeq || 0) + 1; this._importSeq = seq;
    const active = () => !this._destroyed && this._importSeq === seq;
    this.setData({ backupBusy: true, backupHint: '' });
    try {
      wx.chooseMessageFile({ count:1, type:'file', extension:['json'],
        success: res => {
          if (!active()) return;
          const file = res && res.tempFiles && res.tempFiles[0];
          const fileSize = Number(file && file.size);
          if (!file || !file.path || (Number.isFinite(fileSize) && fileSize > storage.MAX_BACKUP_FILE_BYTES)) { this.setData({ backupBusy:false, backupHint:'备份文件无效或过大。' }); return; }
          let fs = null; try { fs = wx.getFileSystemManager(); } catch (err) {}
          if (!fs || typeof fs.readFile !== 'function') { this.setData({ backupBusy:false, backupHint:'当前环境无法读取备份文件。' }); return; }
          try { fs.readFile({ filePath:file.path, encoding:'utf8', success: read => { if (active()) this.previewBackupImport(read.data, seq); }, fail: () => { if (active()) this.setData({backupBusy:false,backupHint:'无法读取这个备份文件。'}); } }); }
          catch (err) { if (active()) this.setData({backupBusy:false,backupHint:'无法读取这个备份文件。'}); }
        },
        fail: err => { if (!active()) return; const msg=String(err&&err.errMsg||''); this.setData({backupBusy:false,backupHint:msg.includes('cancel')?'':'没有成功选择备份文件。'}); }
      });
    } catch (err) { if (active()) this.setData({backupBusy:false,backupHint:'当前环境无法选择备份文件。'}); }
  },

  previewBackupImport(rawText, seq) {
    const active = () => !this._destroyed && (!seq || this._importSeq === seq);
    try {
      const doc = storage.parseBackupText(rawText);
      const validated = storage.validateBackupDocument(doc);
      const normalized = model.normalizeSettings(validated.settings);
      const count = validated.transactions.length;
      const dateText = doc.created_at ? String(doc.created_at).slice(0,19).replace('T',' ') : '未知时间';
      if (!active()) return;
      wx.showModal({ title:'导入这份备份？', content:`备份时间：${dateText}\n账本记录：${count} 笔\n\n导入会用备份中的设置和账本替换当前本地数据。当前数据不会自动合并。`, confirmText:'确认导入', confirmColor:'#c49e43',
        success: modal => {
          if (!active()) return;
          if (!modal.confirm) { this.setData({backupBusy:false}); return; }
          try {
            const result = storage.importBackup(doc, normalized);
            if (!active()) return;
            this.setData({backupBusy:false,backupHint:`已恢复 ${result.transaction_count} 笔记录，正在重新加载。`});
            setTimeout(() => { if (active() && typeof wx.reLaunch === 'function') wx.reLaunch({url:'/pages/index/index'}); }, 550);
          } catch (err) { if (active()) this.setData({backupBusy:false,backupHint:'导入失败，当前数据已保留。'}); }
        }, fail: () => { if (active()) this.setData({backupBusy:false}); }
      });
    } catch (err) { if (active()) this.setData({backupBusy:false,backupHint:'这不是有效的“财富自由指南灯”备份，未修改当前数据。'}); }
  },

  clearData() {
    if (this._destroyed) return;
    wx.showModal({ title:'确认清空？', content:'设置与全部账本都会被删除，且无法撤销。建议先导出备份。', confirmText:'清空', confirmColor:'#b46f5d',
      success: res => {
        if (this._destroyed || !res.confirm) return;
        const cleared = storage.clearAll();
        if (!cleared) { wx.showToast({title:'清空失败，已尽量恢复原数据',icon:'none'}); return; }
        wx.showToast({title:'已清空',icon:'none'});
        setTimeout(() => { if (!this._destroyed && typeof wx.reLaunch === 'function') wx.reLaunch({url:'/pages/index/index'}); }, 350);
      }
    });
  }
});

function fingerprintSettingsForm(settingsInput, openingBalance) {
  const s = model.normalizeSettings(settingsInput || {});
  const cents = model.moneyToCents(openingBalance || 0);
  return JSON.stringify({ settings: s, opening_cents: cents === null ? null : cents });
}
