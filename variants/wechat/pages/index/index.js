const storage = require('../../utils/storage');
const model = require('../../utils/model');
const fmt = require('../../utils/format');
const themeUtil = require('../../utils/theme');
const ritualLib = require('../../utils/ritual_grid');
const ritualAudioLib = require('../../utils/ritual_audio');
const categoryUtil = require('../../utils/categories');
const habitUtil = require('../../utils/habits');
const homeLayout = require('../../utils/home_layout');

Page({
  data: {
    today: '',
    showOnboarding: true,
    guideStep: 0,
    guideMotionClass: 'guide-motion-forward',
    restoringBackup: false,
    onboardingSubmitting: false,
    startupBlocked: false,
    startupErrorText: '',
    appearanceClass: 'font-system font-scale-100',
    inputTextColor: '#eee9df',
    inputPlaceholderColor: '#686c75',
    onboarding: {
      birth_date: '',
      target_age: 80,
      mode: 'quick',
      expense_mode: 'manual',
      manual_daily_expense: '',
      opening_balance: '',
      use_initial_assets: false,
      initial_assets: '',
      show_past: false,
      theme: 'midnight',
      font_family: 'system',
      font_scale: '100'
    },
    settings: null,
    themeClass: 'theme-midnight',
    pageBackground: '#07080c',
    stats: {
      tracking_days: 0,
      lit_count: 0,
      remaining_days: 0,
      progress: 0,
      avg_daily_expense: 0,
      net_savings: 0,
      total_income: 0,
      total_expense: 0,
      total_cells: 0,
      past_cells: 0,
      tracked_past_cells: 0,
      overflow: 0
    },
    view: {
      litCount: '0',
      remainingDays: '0',
      progressPct: '0.0%',
      netSaving: '¥0',
      assetFreedom: '0',
      incomeFreedom: '0',
      avgExpense: '¥0',
      totalIncome: '¥0',
      totalExpense: '¥0',
      costSource: '手动设定',
      modeLabel: '上手版'
    },
    insightText: '',
    recent: [],
    expenseCategories: categoryUtil.publicCategories(),
    expenseNatures: categoryUtil.publicNatures(),
    expensePresets: [],
    visiblePresets: [],
    form: { type: 'expense', amount: '', note: '', date: '', category_id: '', detail_tag: '', nature: '' },
    submitting: false,
    lastFeedback: null,
    gridImagePath: '',
    gridRendering: true,
    todayMarkerVisible: false,
    todayMarkerStyle: '',
    ritualActive: false,
    ritualKind: 'ignite',
    ritualTitle: '',
    ritualCurrent: '0',
    ritualProgressText: '',
    ritualProgressPct: '0%',
    ritualDirectionText: '',
    freedomCelebration: false,
    heroFlip: false,
    habitSummary: null,
    activityRows: [],
    frequentPresets: [],
    achievementPreview: null,
    achievementCountText: '',
    weeklyReview: null,
    missedPrompt: null,
    achievementUnlock: null,
    homeModules: homeLayout.describeOrder(null)
  },

  onLoad() {
    this._destroyed = false;
    this._pageHidden = false;
    const today = model.isoDate();
    try {
      storage.migrateKernelV033(today);
      const rawSettings = storage.getSettingsStrict();
      const settings = usableSettings(rawSettings, today);
      const onboardingDone = storage.isOnboardingDoneStrict();
      const openingBalance = storage.getOpeningBalanceStrict();
      const showOnboarding = !settings || !onboardingDone;
      this.setData({
        today,
        settings,
        showOnboarding,
        startupBlocked: false,
        'form.date': today,
        'onboarding.birth_date': settings ? settings.birth_date : '',
        'onboarding.target_age': settings ? settings.target_age : 80,
        'onboarding.mode': settings ? settings.mode : 'quick',
        'onboarding.expense_mode': settings ? settings.expense_mode : 'manual',
        'onboarding.manual_daily_expense': settings && settings.manual_daily_expense ? String(settings.manual_daily_expense) : '',
        'onboarding.opening_balance': openingBalance ? String(openingBalance) : '',
        'onboarding.use_initial_assets': settings ? settings.use_initial_assets : false,
        'onboarding.initial_assets': settings && settings.initial_assets ? String(settings.initial_assets) : '',
        'onboarding.show_past': settings ? settings.show_past : false,
        'onboarding.theme': settings ? settings.theme : 'midnight',
        'onboarding.font_family': settings ? settings.font_family : 'system',
        'onboarding.font_scale': settings ? settings.font_scale : '100'
      });
      if (settings && settings.mode === 'advanced') this._onboardingAdvancedDraft = advancedDraftFromSettings(settings);
      else if (settings && settings.advanced_dormant) this._onboardingAdvancedDraft = { ...settings.advanced_dormant };
      this.applyTheme(settings ? settings.theme : 'midnight', settings ? settings.font_family : 'system', settings ? settings.font_scale : '100');
      this.refreshState(false);
    } catch (err) {
      this.setData({
        today,
        showOnboarding: false,
        settings: null,
        startupBlocked: true,
        startupErrorText: '本地数据暂时无法安全读取或升级。原数据没有被替换，请稍后重试。'
      });
      this.applyTheme('midnight', 'system', '100');
    }
  },

  retryStartup() {
    if (typeof wx.reLaunch === 'function') wx.reLaunch({ url: '/pages/index/index' });
  },

  onReady() {
    if (!this.data.showOnboarding && !this.data.startupBlocked) this.scheduleCanvasInit();
  },

  onShow() {
    this._pageHidden = false;
    if (this._hasShown && !this._destroyed) {
      try {
        const rawSettings = storage.getSettingsStrict();
        const settings = usableSettings(rawSettings, model.isoDate());
        const showOnboarding = !settings || !storage.isOnboardingDoneStrict();
        this.applyTheme(settings ? settings.theme : 'midnight', settings ? settings.font_family : 'system', settings ? settings.font_scale : '100');
        this.setData({ settings, showOnboarding, startupBlocked: false });
        this.refreshState(false);
        if (!showOnboarding) this.scheduleCanvasInit();
      } catch (err) {
        this.setData({ showOnboarding: false, startupBlocked: true, startupErrorText: '本地数据暂时无法安全读取。原数据没有被替换，请稍后重试。' });
      }
    }
    this._hasShown = true;
  },

  onResize() {
    if (this.data.ritualActive && this._ritualEngine) this.resizeActiveRitual();
    if (!this.data.showOnboarding && !this.data.startupBlocked) this.scheduleCanvasInit();
  },

  onHide() {
    this._pageHidden = true;
    // If WeChat backgrounds the page during an active ritual, settle to the final data state
    // instead of leaving a live Canvas timeline suspended behind the app lifecycle.
    if (this.data.freedomCelebration) this._skipCelebration = true;
    if (this.data.ritualActive) {
      this._skipRequested = true;
      if (this._ritualEngine) {
        if (typeof this._ritualEngine.destroy === 'function') this._ritualEngine.destroy('page_hidden');
        else if (typeof this._ritualEngine.skip === 'function') this._ritualEngine.skip();
      }
    }
  },

  onUnload() {
    this._destroyed = true;
    this._pageHidden = true;
    this._restoreRequestSeq = (this._restoreRequestSeq || 0) + 1;
    if (this._canvasInitTimer) clearTimeout(this._canvasInitTimer);
    if (this._canvasRetryTimer) clearTimeout(this._canvasRetryTimer);
    if (this._gridSettleTimer) clearTimeout(this._gridSettleTimer);
    this._gridRenderSequence = (this._gridRenderSequence || 0) + 1;
    if (this._ritualEngine) this._ritualEngine.destroy();
    if (this._celebrationTimer) clearTimeout(this._celebrationTimer);
    if (this._heroFlipTimer) clearTimeout(this._heroFlipTimer);
    this._ritualEngine = null;
    if (this._ritualAudio) this._ritualAudio.destroy();
    this._ritualAudio = null;
    this._canvas = null;
    this._ctx = null;
  },

  onPullDownRefresh() {
    this.refreshState(true);
    wx.stopPullDownRefresh();
  },

  applyTheme(themeId, fontFamily, fontScale) {
    const theme = themeUtil.applyNavigation(themeId);
    const family = themeUtil.normalizeFontFamily(fontFamily || (this.data.onboarding && this.data.onboarding.font_family));
    const scale = themeUtil.normalizeFontScale(fontScale || (this.data.onboarding && this.data.onboarding.font_scale));
    this._theme = theme;
    this.setData({
      themeClass: theme.className,
      pageBackground: theme.pageBackground,
      appearanceClass: themeUtil.getAppearanceClasses({ font_family: family, font_scale: scale }),
      inputTextColor: theme.id === 'paper' ? '#40372e' : '#eee9df',
      inputPlaceholderColor: theme.id === 'paper' ? '#9a8f81' : '#686c75'
    });
  },

  refreshState(redraw) {
    const rawSettings = storage.getSettings();
    const settings = rawSettings ? model.normalizeSettings(rawSettings) : null;
    const transactions = storage.getTransactions();
    const stats = model.computeStats(settings, transactions);
    const recent = storage.getRecentTransactions(5).map(viewTransaction);
    const expensePresets = storage.getExpensePresets();
    const visiblePresets = expensePresets.filter(item => item.category_id === this.data.form.category_id);
    const habitView = makeHabitView(transactions, expensePresets, settings);
    this.setData({
      settings,
      stats,
      view: makeView(stats, settings),
      insightText: model.insight(stats, settings),
      recent,
      expensePresets,
      visiblePresets,
      homeModules: homeLayout.describeOrder(settings && settings.home_module_order),
      ...habitView
    });
    if (settings) this.applyTheme(settings.theme, settings.font_family, settings.font_scale);
    if (redraw && !this.data.showOnboarding) this.renderGridSnapshot(stats);
  },

  scheduleCanvasInit() {
    if (this._pageHidden) return;
    if (this._canvasInitTimer) clearTimeout(this._canvasInitTimer);
    if (this._canvasRetryTimer) clearTimeout(this._canvasRetryTimer);
    this._canvasInitTimer = setTimeout(() => this.initCanvas(0), 40);
  },

  initCanvas(attempt) {
    if (this._pageHidden || this.data.showOnboarding) return;
    const retryCount = Number(attempt || 0);
    const query = wx.createSelectorQuery().in(this);
    query.select('#gridDisplay').boundingClientRect();
    query.select('#lifeCanvas').fields({ node: true }).exec(res => {
      const display = res && res[0];
      const canvasInfo = res && res[1];
      if (!display || !display.width || !display.height || !canvasInfo || !canvasInfo.node) {
        if (retryCount < 6 && !this.data.showOnboarding) {
          this._canvasRetryTimer = setTimeout(() => this.initCanvas(retryCount + 1), 90 * (retryCount + 1));
        }
        return;
      }

      const canvas = canvasInfo.node;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (retryCount < 6) this._canvasRetryTimer = setTimeout(() => this.initCanvas(retryCount + 1), 120 * (retryCount + 1));
        return;
      }
      const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : { pixelRatio: 2 };
      const dpr = Math.max(1, Math.min(Number(windowInfo.pixelRatio || 2), 3));
      const width = Math.max(1, Number(display.width));
      const height = Math.max(1, Number(display.height));

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      else if (typeof ctx.scale === 'function') ctx.scale(dpr, dpr);

      this._canvas = canvas;
      this._ctx = ctx;
      this._canvasWidth = width;
      this._canvasHeight = height;
      this._canvasDpr = dpr;
      this.renderGridSnapshot(this.data.stats);
    });
  },

  paintGrid(stats, highlight) {
    const ctx = this._ctx;
    if (!ctx || !stats) return;
    const palette = (this._theme || themeUtil.getTheme('midnight')).canvas;
    const width = this._canvasWidth;
    const height = this._canvasHeight;
    if (typeof ctx.setTransform === 'function') ctx.setTransform(this._canvasDpr || 1, 0, 0, this._canvasDpr || 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    const total = Math.max(0, Number(stats.total_cells || 0));
    if (!total) return;

    const layout = findGridLayout(total, Math.max(20, width - 18), Math.max(20, height - 20));
    const gridW = layout.cols * layout.cell + Math.max(0, layout.cols - 1) * layout.gap;
    const gridH = layout.rows * layout.cell + Math.max(0, layout.rows - 1) * layout.gap;
    const ox = (width - gridW) / 2;
    const oy = (height - gridH) / 2;

    const past = Number(stats.past_cells || 0);
    const trackedPast = Number(stats.tracked_past_cells || 0);
    const assetLit = Number(stats.asset_lit || 0);
    const incomeLit = Number(stats.income_lit || 0);
    const assetEnd = assetLit;
    const incomeEnd = assetLit + incomeLit;
    const h = highlight && Number(highlight.delta) !== 0 ? highlight : null;
    const changeStart = h ? Math.min(Number(h.beforeLit || 0), Number(h.afterLit || 0)) : -1;
    const changeEnd = h ? Math.max(Number(h.beforeLit || 0), Number(h.afterLit || 0)) : -1;

    for (let i = 0; i < total; i += 1) {
      const col = i % layout.cols;
      const row = Math.floor(i / layout.cols);
      const x = ox + col * (layout.cell + layout.gap);
      const y = oy + row * (layout.cell + layout.gap);
      const futureIndex = i - past;

      if (past > 0 && i < past) {
        const trackedStart = Math.max(0, past - trackedPast);
        ctx.fillStyle = i >= trackedStart ? palette.trackedPast : palette.past;
      } else if (h && futureIndex >= changeStart && futureIndex < changeEnd) {
        ctx.fillStyle = h.delta > 0 ? (palette.bloom || palette.ignite || palette.lit) : (palette.ember || palette.extinguish || palette.unlit);
      } else if (futureIndex < assetEnd) {
        ctx.fillStyle = palette.asset || palette.lit;
      } else if (futureIndex < incomeEnd) {
        ctx.fillStyle = palette.lit;
      } else {
        ctx.fillStyle = palette.unlit;
      }
      ctx.fillRect(x, y, layout.cell, layout.cell);
    }

    // 今天的“呼吸”不再烤进静态 PNG，而由普通 view 覆盖在图片上持续呼吸。
    // 这样它既保留原版的生命坐标，又与页面滚动完全同层，不重新引入可见 Canvas 拖影。
    const todayIndex = past;
    if (todayIndex >= 0 && todayIndex < total) {
      const col = todayIndex % layout.cols;
      const row = Math.floor(todayIndex / layout.cols);
      const x = ox + col * (layout.cell + layout.gap);
      const y = oy + row * (layout.cell + layout.gap);
      const cx = x + layout.cell / 2;
      const cy = y + layout.cell / 2;
      const haloSize = Math.max(12, Math.min(54, layout.cell * 8));
      this._nextTodayMarker = {
        visible: true,
        style: `left:${(cx - haloSize / 2).toFixed(2)}px;top:${(cy - haloSize / 2).toFixed(2)}px;width:${haloSize.toFixed(2)}px;height:${haloSize.toFixed(2)}px;`
      };
    } else {
      this._nextTodayMarker = { visible: false, style: '' };
    }

    if (stats.overflow > 0) {
      const glow = ctx.createRadialGradient(width / 2, height / 2, 8, width / 2, height / 2, Math.max(width, height) / 2);
      glow.addColorStop(0, palette.glow);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }
  },

  renderGridSnapshot(stats, highlight, onShown) {
    if (!this._canvas || !this._ctx || !stats) return Promise.resolve(false);
    const sequence = (this._gridRenderSequence || 0) + 1;
    this._gridRenderSequence = sequence;
    this.paintGrid(stats, highlight);
    this.setData({ gridRendering: !this.data.gridImagePath });

    return new Promise(resolve => {
      const exportSnapshot = () => {
        if (sequence !== this._gridRenderSequence || !this._canvas) { resolve(false); return; }
        if (typeof wx.canvasToTempFilePath !== 'function') {
          this.setData({ gridRendering: false });
          resolve(false);
          return;
        }
        let exportSettled = false;
        const exportTimer = setTimeout(() => finishExport(false), 1800);
        const finishExport = (ok, res) => {
          if (exportSettled) return;
          exportSettled = true;
          clearTimeout(exportTimer);
          if (ok && sequence === this._gridRenderSequence && res && res.tempFilePath) {
            const marker = this._nextTodayMarker || { visible: false, style: '' };
            this.setData({
              gridImagePath: res.tempFilePath,
              gridRendering: false,
              todayMarkerVisible: !!marker.visible,
              todayMarkerStyle: marker.style || ''
            });
            if (typeof onShown === 'function') onShown();
            resolve(true);
            return;
          }
          if (sequence === this._gridRenderSequence) {
            // 失败/超时都宁可显示“生成中”，绝不能留下与新数据不一致的旧方格。
            this.setData({ gridImagePath: '', gridRendering: true, todayMarkerVisible: false });
            if (!this._pageHidden) wx.showToast({ title: '人生方格正在重新生成', icon: 'none' });
          }
          resolve(false);
        };
        try {
          wx.canvasToTempFilePath({
            canvas: this._canvas,
            fileType: 'png',
            success: res => finishExport(true, res),
            fail: () => finishExport(false)
          }, this);
        } catch (err) {
          finishExport(false);
        }
      };

      // Canvas 2D 绘制是同步的，但导出在部分运行环境中仍可能早于合成完成。
      // 等一帧再导出；页面真正展示的是普通 image，从而避免 Canvas 随滚动产生拖影/延迟归位。
      requestCanvasFrame(this._canvas, exportSnapshot);
    });
  },

  renderGridChange(before, after, feedback) {
    // delta=0 时没有资格启动“仪式”。数据先更新，方格只重新生成最终静态图。
    if (!feedback || feedback.delta === 0) {
      this.renderGridSnapshot(after);
      return;
    }
    // 有整数格变化时，真正的视觉反馈由固定视口 Ritual Canvas 承担；静态图只在仪式完成后更新。
  },

  initRitualCanvas(attempt) {
    const retryCount = Number(attempt || 0);
    return new Promise((resolve, reject) => {
      if (this._pageHidden) { reject(new Error('ritual canvas unavailable while page hidden')); return; }
      const query = wx.createSelectorQuery().in(this);
      query.select('#ritualStage').boundingClientRect();
      query.select('#ritualCanvas').fields({ node: true }).exec(res => {
        const stage = res && res[0];
        const info = res && res[1];
        if (!stage || !stage.width || !stage.height || !info || !info.node) {
          if (retryCount < 7 && !this._pageHidden && this.data.ritualActive && !this.data.freedomCelebration) {
            setTimeout(() => {
              if (this._pageHidden) { reject(new Error('ritual canvas unavailable while page hidden')); return; }
              this.initRitualCanvas(retryCount + 1).then(resolve).catch(reject);
            }, 60 + retryCount * 45);
          } else reject(new Error('ritual canvas unavailable'));
          return;
        }
        const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : { pixelRatio: 2 };
        const dpr = Math.max(1, Math.min(Number(windowInfo.pixelRatio || 2), 3));
        const canvas = info.node;
        const engine = new ritualLib.RitualGrid(canvas, {
          createOffscreenCanvas: (width, height) => {
            if (typeof wx.createOffscreenCanvas !== 'function') return null;
            return wx.createOffscreenCanvas({ type: '2d', width, height });
          }
        });
        engine.resize(stage.width, stage.height, dpr);
        this._ritualEngine = engine;
        resolve(engine);
      });
    });
  },

  resizeActiveRitual() {
    if (!this._ritualEngine || !this.data.ritualActive || this.data.freedomCelebration) return;
    const query = wx.createSelectorQuery().in(this);
    query.select('#ritualStage').boundingClientRect().exec(res => {
      const stage = res && res[0];
      if (!stage || !stage.width || !stage.height || !this._ritualEngine) return;
      const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : { pixelRatio: 2 };
      const dpr = Math.max(1, Math.min(Number(windowInfo.pixelRatio || 2), 3));
      try { this._ritualEngine.resize(stage.width, stage.height, dpr); } catch (err) {}
    });
  },

  async runRitual(before, after, feedback) {
    const delta = Number(feedback && feedback.delta || 0);
    if (!delta || (feedback && feedback.ritual === 'none')) return { played: false, calibrated: !!(feedback && feedback.kind === 'calibration') };
    const kind = delta > 0 ? 'ignite' : 'extinguish';
    const total = Math.abs(delta);
    const title = kind === 'ignite' ? `买回 ${total} 天自由` : `交换 ${total} 天未来自由`;
    const directionText = '镜头正在寻找新的自由边界';
    const celebrate = !(feedback && feedback.suppressCelebration)
      && Number(before.lit_count || 0) < Number(before.future_cells || 0)
      && Number(after.future_cells || 0) > 0
      && Number(after.lit_count || 0) >= Number(after.future_cells || 0);

    this._ritualUiLastDone = -1;
    this._skipCelebration = false;
    this._skipRequested = false;
    if (this._ritualAudio) this._ritualAudio.resetSequence();
    this.setData({
      ritualActive: true,
      ritualKind: kind,
      ritualTitle: title,
      ritualCurrent: fmt.integer(before.lit_count || 0),
      ritualProgressText: total > 1 ? `共 ${fmt.integer(total)} 天` : '这一格，就是一天',
      ritualProgressPct: '0%',
      ritualDirectionText: directionText,
      freedomCelebration: false
    });

    try {
      const engine = await this.initRitualCanvas(0);
      const palette = (this._theme || themeUtil.getTheme('midnight')).canvas;
      const runPromise = engine.run({
        before,
        after,
        palette,
        kind,
        onCellStart: (order, all, cellKind) => {
          // 小 delta 完整逐格发声；大 delta 由音频层自动抽样，避免数百个振荡器同时堆叠。
          if (this._ritualAudio) this._ritualAudio.playCell(cellKind, order, all);
          // 第一格真正开始发光/黯淡时，立刻把“寻找边界”切换为进行态。
          // 数字仍必须等单格完整动画结束后再变化，避免反馈抢跑。
          if (order === 0) {
            this.setData({
              ritualDirectionText: cellKind === 'ignite' ? '自由时间正在一天天亮起' : '未来自由正在一天天被交换'
            });
          }
        },
        onProgress: (done, all, currentLit, triggered) => {
          // 数字只在一格真正完成点亮/熄灭后变化，不抢跑到动画前面。
          // setData 仍低频更新，Canvas 动画完全留在渲染线程自己的 RAF 中。
          const uiStep = Math.max(1, Math.ceil(all / 36));
          const lastDone = Number(this._ritualUiLastDone === undefined ? -1 : this._ritualUiLastDone);
          if (done < all && done > 0 && lastDone >= 0 && done - lastDone < uiStep) return;
          this._ritualUiLastDone = done;
          const pct = all > 0 ? Math.min(100, Math.round(done / all * 100)) : 100;
          const active = Math.max(0, Number(triggered || 0) - Number(done || 0));
          let liveCopy;
          if (done >= all) {
            liveCopy = kind === 'ignite' ? '这段时间，已经属于你' : '新的自由边界已经落定';
          } else if (active > 0) {
            const ordinal = Math.min(all, done + 1);
            liveCopy = kind === 'ignite'
              ? `第 ${fmt.integer(ordinal)} 天 · 正在被点亮`
              : `第 ${fmt.integer(ordinal)} 天 · 正在被交换`;
          } else {
            liveCopy = directionText;
          }
          const progressCopy = kind === 'ignite'
            ? (done > 0 ? `已买回 ${fmt.integer(done)} / ${fmt.integer(all)} 天` : `共 ${fmt.integer(all)} 天`)
            : (done > 0 ? `已交换 ${fmt.integer(done)} / ${fmt.integer(all)} 天` : `共 ${fmt.integer(all)} 天`);
          this.setData({
            ritualCurrent: fmt.integer(currentLit),
            ritualProgressText: progressCopy,
            ritualProgressPct: `${pct}%`,
            ritualDirectionText: liveCopy
          });
        }
      });
      // “跳过”是用户意图，不要求按钮恰好等到 Canvas engine 已创建才有效。
      if (this._skipRequested && typeof engine.skip === 'function') engine.skip();
      const result = await runPromise;

      if (!result.skipped && celebrate && this.data.ritualActive) {
        if (this._ritualAudio) this._ritualAudio.celebrateChord();
        this.setData({ freedomCelebration: true, ritualProgressPct: '100%', ritualProgressText: '当前人生区间 · 全部覆盖', ritualDirectionText: '按当前口径，现有自由资源已覆盖剩余时间' });
        for (let waited = 0; waited < 6500 && !this._skipCelebration; waited += 100) await sleep(100);
      }
      return { played: true, skipped: !!result.skipped, celebrated: celebrate && !result.skipped };
    } catch (err) {
      // 仪式失败不能阻塞账本真实性：直接回到最终数据与最终静态方格。
      return { played: false, error: err };
    } finally {
      if (this._ritualEngine) this._ritualEngine.destroy();
      this._ritualEngine = null;
      this._skipRequested = false;
    }
  },

  skipRitual() {
    this._skipRequested = true;
    if (this.data.freedomCelebration) {
      this._skipCelebration = true;
      return;
    }
    if (this._ritualEngine && typeof this._ritualEngine.skip === 'function') this._ritualEngine.skip();
  },

  noop() {},

  selectType(e) {
    const type = e.currentTarget.dataset.type;
    if (type === 'income' || type === 'expense') this.setData({ 'form.type': type });
  },
  selectExpenseCategory(e) {
    const categoryId = String(e.currentTarget.dataset.id || '');
    if (!categoryUtil.publicCategories().some(item => item.id === categoryId)) return;
    const visiblePresets = (this.data.expensePresets || []).filter(item => item.category_id === categoryId);
    this.setData({ 'form.category_id': categoryId, 'form.detail_tag': '', visiblePresets });
  },
  selectExpenseNature(e) {
    const nature = String(e.currentTarget.dataset.id || '');
    if (!categoryUtil.publicNatures().some(item => item.id === nature)) return;
    this.setData({ 'form.nature': this.data.form.nature === nature ? '' : nature });
  },
  selectExpensePreset(e) {
    const id = Number(e.currentTarget.dataset.id);
    const preset = (this.data.expensePresets || []).find(item => Number(item.id) === id);
    if (!preset) return;
    const patch = { 'form.category_id': preset.category_id, 'form.detail_tag': preset.label };
    if (preset.nature) patch['form.nature'] = preset.nature;
    if (preset.note && !String(this.data.form.note || '').trim()) patch['form.note'] = preset.note;
    patch.visiblePresets = (this.data.expensePresets || []).filter(item => item.category_id === preset.category_id);
    this.setData(patch);
  },
  clearExpensePreset() { this.setData({ 'form.detail_tag': '' }); },
  onAmount(e) { this.setData({ 'form.amount': e.detail.value }); },
  onNote(e) { this.setData({ 'form.note': e.detail.value }); },
  onDate(e) { this.setData({ 'form.date': e.detail.value }); },

  async submitTransaction() {
    if (this.data.submitting || this.data.ritualActive || this._destroyed) return;
    const rawAmount = this.data.form.amount;
    const amountCents = model.moneyToCents(rawAmount);
    if (amountCents === null || amountCents < 1) {
      wx.showToast({ title: '金额必须至少 ¥0.01，且最多保留两位小数', icon: 'none' });
      return;
    }
    const amount = amountCents / 100;
    const txDate = model.parseDateLocal(this.data.form.date || this.data.today);
    const todayDate = model.parseDateLocal(this.data.today);
    if (!txDate || !todayDate || txDate > todayDate) {
      wx.showToast({ title: '请选择今天或更早的有效日期', icon: 'none' });
      return;
    }

    let settings;
    try {
      const rawSettings = storage.getSettingsStrict();
      settings = usableSettings(rawSettings, this.data.today);
      // Write-affecting paths use strict reads: a read failure is never “there is no ledger”.
      storage.getTransactionsStrict();
    } catch (err) {
      wx.showToast({ title: '本地账本暂时无法安全读取，本次记录未保存', icon: 'none' });
      return;
    }
    if (!settings) {
      this.setData({ showOnboarding: true, guideStep: 5 });
      return;
    }
    const birthDateForLedger = model.parseDateLocal(settings.birth_date);
    if (birthDateForLedger && txDate < birthDateForLedger) {
      wx.showToast({ title: '交易日期不能早于出生日期', icon: 'none' });
      return;
    }
    if (this.data.form.type === 'expense' && !this.data.form.category_id) {
      wx.showToast({ title: '先选择一个主分类，方便后续统计', icon: 'none' });
      return;
    }

    if (!this._ritualAudio) this._ritualAudio = new ritualAudioLib.RitualAudio(typeof wx !== 'undefined' ? wx : null);
    this._ritualAudio.ensure();
    this.setData({ submitting: true, lastFeedback: null, achievementUnlock: null });
    let persisted = false;
    try {
      const beforeTransactions = storage.getTransactionsStrict();
      const before = model.computeStats(settings, beforeTransactions);
      const beforeAchievements = settings.achievements_enabled ? habitUtil.achievementData(beforeTransactions, new Date()) : [];
      storage.addTransaction({ occurred_on: this.data.form.date || this.data.today, type: this.data.form.type, amount, note: this.data.form.note, category_id: this.data.form.category_id, detail_tag: this.data.form.detail_tag, nature: this.data.form.nature });
      persisted = true;
      const transactions = storage.getTransactionsStrict();
      const after = model.computeStats(settings, transactions);
      const feedback = model.feedbackForChange(before, after, this.data.form.type, settings, amount);
      const recent = storage.getRecentTransactions(5).map(viewTransaction);
      const habitView = makeHabitView(transactions, this.data.expensePresets || [], settings);
      const afterAchievements = settings.achievements_enabled ? habitUtil.achievementData(transactions, new Date()) : [];
      const beforeUnlocked = new Set(beforeAchievements.filter(item => item.unlocked).map(item => item.id));
      const newlyUnlocked = afterAchievements.filter(item => item.unlocked && !beforeUnlocked.has(item.id));
      const achievementUnlock = newlyUnlocked.length ? { name: newlyUnlocked[0].name, group: newlyUnlocked[0].group, count: newlyUnlocked.length } : null;

      if (feedback.delta !== 0 && feedback.ritual !== 'none') await this.runRitual(before, after, feedback);
      if (this._destroyed) return;

      this.setData({
        stats: after,
        view: makeView(after, settings),
        insightText: model.insight(after, settings),
        recent,
        'form.amount': '',
        'form.note': '',
        'form.detail_tag': '',
        'form.nature': '',
        lastFeedback: feedback,
        achievementUnlock,
        ...habitView
      });
      if (Number(feedback.exactDelta || 0) !== 0) this.triggerHeroFlip();
      const snapshotReady = await this.renderGridSnapshot(after);
      if (this._destroyed) return;
      if (!snapshotReady) {
        this.setData({ gridImagePath: '', gridRendering: true, todayMarkerVisible: false });
        this.scheduleCanvasInit();
      }
      this.setData({ submitting: false, ritualActive: false, freedomCelebration: false });
    } catch (err) {
      if (this._ritualEngine) this._ritualEngine.destroy();
      this._ritualEngine = null;
      if (!this._destroyed) {
        this.setData({ submitting: false, ritualActive: false, freedomCelebration: false });
        if (persisted) {
          this.refreshState(true);
          wx.showToast({ title: '记录已保存；视觉反馈已降级刷新', icon: 'none' });
        } else {
          wx.showToast({ title: '记录未保存，请重试', icon: 'none' });
        }
      }
    }
  },

  restoreBackupOnboarding() {
    if (this.data.restoringBackup || this._destroyed) return;
    if (typeof wx.chooseMessageFile !== 'function') {
      wx.showToast({ title: '当前微信版本不支持选择备份文件', icon: 'none' });
      return;
    }
    const seq = (this._restoreRequestSeq || 0) + 1;
    this._restoreRequestSeq = seq;
    this.setData({ restoringBackup: true });
    const active = () => !this._destroyed && this._restoreRequestSeq === seq;
    try {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['json'],
        success: res => {
          if (!active()) return;
          const file = res && res.tempFiles && res.tempFiles[0];
          const fileSize = Number(file && file.size);
          if (!file || !file.path || (Number.isFinite(fileSize) && fileSize > storage.MAX_BACKUP_FILE_BYTES)) {
            this.setData({ restoringBackup: false });
            wx.showToast({ title: '备份文件无效或过大', icon: 'none' });
            return;
          }
          let fs = null;
          try { fs = wx.getFileSystemManager(); } catch (err) {}
          if (!fs || typeof fs.readFile !== 'function') {
            this.setData({ restoringBackup: false });
            wx.showToast({ title: '当前环境无法读取备份文件', icon: 'none' });
            return;
          }
          try {
            fs.readFile({
              filePath: file.path,
              encoding: 'utf8',
              success: read => { if (active()) this.previewOnboardingBackup(read.data, seq); },
              fail: () => {
                if (!active()) return;
                this.setData({ restoringBackup: false });
                wx.showToast({ title: '无法读取这个备份文件', icon: 'none' });
              }
            });
          } catch (err) {
            if (!active()) return;
            this.setData({ restoringBackup: false });
            wx.showToast({ title: '无法读取这个备份文件', icon: 'none' });
          }
        },
        fail: err => {
          if (!active()) return;
          const msg = String(err && err.errMsg || '');
          this.setData({ restoringBackup: false });
          if (!msg.includes('cancel')) wx.showToast({ title: '没有成功选择备份文件', icon: 'none' });
        }
      });
    } catch (err) {
      if (!active()) return;
      this.setData({ restoringBackup: false });
      wx.showToast({ title: '当前环境无法选择备份文件', icon: 'none' });
    }
  },

  previewOnboardingBackup(rawText, seq) {
    const active = () => !this._destroyed && (!seq || this._restoreRequestSeq === seq);
    try {
      const doc = storage.parseBackupText(rawText);
      const validated = storage.validateBackupDocument(doc);
      const normalized = model.normalizeSettings(validated.settings);
      const count = validated.transactions.length;
      const dateText = doc.created_at ? String(doc.created_at).slice(0, 19).replace('T', ' ') : '未知时间';
      if (!active()) return;
      wx.showModal({
        title: '恢复这盏指南灯？',
        content: `备份时间：${dateText}\n账本记录：${count} 笔\n\n恢复后会直接使用备份里的设置和账本，不需要重新完成首次设置。`,
        confirmText: '恢复',
        confirmColor: '#c49e43',
        success: modal => {
          if (!active()) return;
          if (!modal.confirm) { this.setData({ restoringBackup: false }); return; }
          try {
            storage.importBackup(doc, normalized);
            if (!active()) return;
            this.setData({ restoringBackup: false });
            wx.showToast({ title: `已恢复 ${count} 笔记录`, icon: 'success' });
            setTimeout(() => { if (active() && typeof wx.reLaunch === 'function') wx.reLaunch({ url: '/pages/index/index' }); }, 420);
          } catch (err) {
            if (!active()) return;
            this.setData({ restoringBackup: false });
            wx.showToast({ title: '恢复失败，当前数据未被替换', icon: 'none' });
          }
        },
        fail: () => { if (active()) this.setData({ restoringBackup: false }); }
      });
    } catch (err) {
      if (!active()) return;
      this.setData({ restoringBackup: false });
      wx.showToast({ title: '这不是有效的指南灯备份', icon: 'none' });
    }
  },

  nextGuide() {
    if (this.data.onboardingSubmitting || this._onboardingCompleted || this._destroyed) return;
    if (!this.data.showOnboarding) return;
    if (this.data.guideStep < 5) {
      this.setData({ guideStep: this.data.guideStep + 1, guideMotionClass: 'guide-motion-forward' });
      return;
    }

    const o = this.data.onboarding;
    const birth = o.birth_date;
    const age = Number(o.target_age);
    const birthDate = model.parseDateLocal(birth);
    const todayDate = model.parseDateLocal(this.data.today);
    if (!birthDate || !todayDate || birthDate > todayDate) {
      wx.showToast({ title: '请选择有效且不晚于今天的出生日期', icon: 'none' });
      return;
    }
    if (!Number.isInteger(age) || age < 20 || age > 120) {
      wx.showToast({ title: '目标年龄请输入 20–120 的整数', icon: 'none' });
      return;
    }
    if (model.targetDateFromBirth(birthDate, age) <= todayDate) {
      wx.showToast({ title: '目标年龄需要大于当前年龄', icon: 'none' });
      return;
    }

    const dailyCents = model.moneyToCents(o.manual_daily_expense);
    const openingCents = model.moneyToCents(o.opening_balance || '0');
    const assetCents = model.moneyToCents(o.initial_assets || '0');
    if ((o.mode === 'quick' || o.expense_mode === 'manual') && (dailyCents === null || dailyCents < 1)) {
      wx.showToast({ title: '日均生活成本至少 ¥0.01，且最多两位小数', icon: 'none' });
      return;
    }
    if (openingCents === null) {
      wx.showToast({ title: '起始自由本金最多保留两位小数', icon: 'none' });
      return;
    }
    if (assetCents === null) {
      wx.showToast({ title: '起始资产最多保留两位小数', icon: 'none' });
      return;
    }

    let existingTransactions;
    try { existingTransactions = storage.getTransactionsStrict(); }
    catch (err) {
      wx.showToast({ title: '现有账本暂时无法安全读取，未保存设置', icon: 'none' });
      return;
    }
    const conflict = existingTransactions.find(tx => tx && tx.system_kind !== storage.OPENING_KIND && String(tx.occurred_on || '') < birth);
    if (conflict) {
      wx.showToast({ title: `已有账本早于出生日期（${conflict.occurred_on}）`, icon: 'none' });
      return;
    }

    const advancedDraft = o.mode === 'advanced'
      ? advancedDraftFromOnboarding(o)
      : (this._onboardingAdvancedDraft || advancedDraftFromOnboarding(o));
    const settings = model.normalizeSettings({
      birth_date: birth,
      target_age: age,
      mode: o.mode,
      expense_mode: o.mode === 'quick' ? 'manual' : o.expense_mode,
      manual_daily_expense: dailyCents === null ? 0 : dailyCents / 100,
      show_past: o.mode === 'advanced' ? !!o.show_past : false,
      use_initial_assets: o.mode === 'advanced' ? !!o.use_initial_assets : false,
      initial_assets: o.mode === 'advanced' && assetCents !== null ? assetCents / 100 : 0,
      tracking_days_override: 0,
      advanced_dormant: advancedDraft,
      theme: themeUtil.normalizeTheme(o.theme),
      font_family: themeUtil.normalizeFontFamily(o.font_family),
      font_scale: themeUtil.normalizeFontScale(o.font_scale)
    });

    this.setData({ onboardingSubmitting: true });
    try {
      storage.saveConfiguration(settings, openingCents / 100, this.data.today, true);
      const stats = model.computeStats(settings, storage.getTransactionsStrict());
      if (this._destroyed) return;
      this._onboardingCompleted = true;
      this.applyTheme(settings.theme, settings.font_family, settings.font_scale);
      this.setData({
        onboardingSubmitting: false,
        showOnboarding: false,
        settings,
        stats,
        view: makeView(stats, settings),
        insightText: model.insight(stats, settings)
      });
      this.scheduleCanvasInit();
    } catch (err) {
      if (!this._destroyed) {
        this.setData({ onboardingSubmitting: false });
        wx.showToast({ title: '初始化未保存，请重试', icon: 'none' });
      }
    }
  },

  prevGuide() { this.setData({ guideStep: Math.max(0, this.data.guideStep - 1), guideMotionClass: 'guide-motion-backward' }); },
  onOnboardingBirth(e) { this.setData({ 'onboarding.birth_date': e.detail.value }); },
  onOnboardingAge(e) { this.setData({ 'onboarding.target_age': e.detail.value }); },
  onOnboardingDailyExpense(e) { this.setData({ 'onboarding.manual_daily_expense': e.detail.value }); },
  onOnboardingOpeningBalance(e) { this.setData({ 'onboarding.opening_balance': e.detail.value }); },
  onOnboardingAssets(e) { this.setData({ 'onboarding.initial_assets': e.detail.value }); },
  onOnboardingUseAssets(e) { this.setData({ 'onboarding.use_initial_assets': e.detail.value }); },
  onOnboardingShowPast(e) { this.setData({ 'onboarding.show_past': e.detail.value }); },
  selectOnboardingTheme(e) {
    const theme = themeUtil.normalizeTheme(e.currentTarget.dataset.theme);
    this.setData({ 'onboarding.theme': theme });
    this.applyTheme(theme, this.data.onboarding.font_family, this.data.onboarding.font_scale);
  },
  selectOnboardingFont(e) {
    const family = themeUtil.normalizeFontFamily(e.currentTarget.dataset.font);
    this.setData({ 'onboarding.font_family': family });
    this.applyTheme(this.data.onboarding.theme, family, this.data.onboarding.font_scale);
  },
  selectOnboardingFontScale(e) {
    const scale = themeUtil.normalizeFontScale(e.currentTarget.dataset.scale);
    this.setData({ 'onboarding.font_scale': scale });
    this.applyTheme(this.data.onboarding.theme, this.data.onboarding.font_family, scale);
  },
  captureOnboardingAdvancedDraft() { return advancedDraftFromOnboarding(this.data.onboarding); },
  selectOnboardingMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'quick' && mode !== 'advanced') return;
    const currentMode = this.data.onboarding.mode;
    if (currentMode === 'advanced' && mode === 'quick') this._onboardingAdvancedDraft = this.captureOnboardingAdvancedDraft();
    const patch = { 'onboarding.mode': mode };
    if (mode === 'quick') {
      patch['onboarding.expense_mode'] = 'manual';
      patch['onboarding.use_initial_assets'] = false;
      patch['onboarding.show_past'] = false;
    } else if (this._onboardingAdvancedDraft) {
      Object.entries(this._onboardingAdvancedDraft).forEach(([key, value]) => { patch[`onboarding.${key}`] = value; });
    }
    this.setData(patch);
  },
  selectOnboardingExpenseMode(e) {
    const source = e.currentTarget.dataset.source;
    if (source === 'manual' || source === 'ledger') this.setData({ 'onboarding.expense_mode': source });
  },

  triggerHeroFlip() {
    if (this._heroFlipTimer) clearTimeout(this._heroFlipTimer);
    this.setData({ heroFlip: false }, () => {
      setTimeout(() => {
        if (this._destroyed) return;
        this.setData({ heroFlip: true });
        this._heroFlipTimer = setTimeout(() => { if (!this._destroyed) this.setData({ heroFlip: false }); }, 650);
      }, 20);
    });
  },

  prepareBackfill() {
    const today = model.parseDateLocal(this.data.today);
    if (!today) return;
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12);
    this.setData({ 'form.date': model.isoDate(yesterday) });
    wx.showToast({ title: '日期已切到昨天，补完这笔即可', icon: 'none' });
  },

  goActivity() { wx.navigateTo({ url: '/pages/activity/activity' }); },
  goWeeklyReview() {
    const review = this.data.weeklyReview;
    if (review && review.weekKey) storage.markWeeklyReportSeen(review.weekKey);
    if (review) this.setData({ 'weeklyReview.shouldGlow': false, 'weeklyReview.seen': true });
    wx.navigateTo({ url: '/pages/analysis/analysis?period=week&source=weekly&review=previous' });
  },

  goGuide() { wx.navigateTo({ url: '/pages/guide/guide?tab=idea' }); },
  goUsageGuide() { wx.navigateTo({ url: '/pages/guide/guide?tab=usage' }); },
  goAnalysis() { wx.navigateTo({ url: '/pages/analysis/analysis' }); },
  goCategoryPresets() { wx.navigateTo({ url: '/pages/presets/presets' }); },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
  goHistory() { wx.navigateTo({ url: '/pages/history/history' }); }
});


function usableSettings(rawSettings, todayIso) {
  if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) return null;
  const settings = model.normalizeSettings(rawSettings);
  const birth = model.parseDateLocal(settings.birth_date);
  const today = model.parseDateLocal(todayIso || model.isoDate());
  if (!birth || !today || birth > today) return null;
  return settings;
}

function advancedDraftFromSettings(settingsInput) {
  const s = model.normalizeSettings(settingsInput || {});
  return {
    expense_mode: s.expense_mode,
    manual_daily_expense: s.manual_daily_expense,
    show_past: !!s.show_past,
    use_initial_assets: !!s.use_initial_assets,
    initial_assets: s.initial_assets,
    tracking_days_override: s.tracking_days_override
  };
}

function advancedDraftFromOnboarding(oInput) {
  const o = oInput || {};
  return {
    expense_mode: o.expense_mode === 'ledger' ? 'ledger' : 'manual',
    manual_daily_expense: Number(o.manual_daily_expense || 0),
    show_past: !!o.show_past,
    use_initial_assets: !!o.use_initial_assets,
    initial_assets: Number(o.initial_assets || 0),
    tracking_days_override: 0
  };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function requestCanvasFrame(canvas, callback) {
  // A page can be backgrounded between draw and export. Some runtimes then stop delivering
  // Canvas RAF callbacks. Use RAF when available, but never let a static snapshot wait forever.
  let fired = false;
  let timer = null;
  const once = () => {
    if (fired) return;
    fired = true;
    if (timer) clearTimeout(timer);
    callback();
  };
  timer = setTimeout(once, 96);
  try {
    if (canvas && typeof canvas.requestAnimationFrame === 'function') canvas.requestAnimationFrame(once);
    else setTimeout(once, 16);
  } catch (err) {
    once();
  }
}

function findGridLayout(total, width, height) {
  let best = { cell: 0.8, gap: 0.25, cols: Math.max(1, Math.floor(width / 1.05)), rows: 1 };
  for (let cell = 4; cell >= 0.8; cell -= 0.2) {
    const gap = cell >= 2 ? 0.8 : 0.35;
    const cols = Math.max(1, Math.floor((width + gap) / (cell + gap)));
    const rows = Math.ceil(total / cols);
    const usedHeight = rows * cell + Math.max(0, rows - 1) * gap;
    if (usedHeight <= height) {
      best = { cell, gap, cols, rows };
      break;
    }
  }
  best.rows = Math.ceil(total / best.cols);
  return best;
}

function makeView(stats, settingsInput) {
  const settings = model.normalizeSettings(settingsInput);
  return {
    litCount: fmt.integer(stats.lit_count),
    remainingDays: fmt.integer(stats.remaining_days),
    progressPct: fmt.percent(stats.progress),
    netSaving: fmt.money(stats.net_savings),
    assetFreedom: fmt.integer(stats.asset_freedom),
    incomeFreedom: fmt.integer(stats.income_freedom),
    avgExpense: fmt.money(stats.avg_daily_expense),
    totalIncome: fmt.money(stats.total_income),
    totalExpense: fmt.money(stats.total_expense),
    costSource: model.costSourceLabel(settings),
    modeLabel: settings.mode === 'advanced' ? '高级自主版' : '上手版',
    modeHint: settings.mode === 'advanced' ? '完整开放参数 · 同一核心公式' : '简化输入 · 同一核心公式',
    incomeLabel: '计入模型财富'
  };
}

function viewTransaction(tx) {
  const categoryText = tx.type === 'expense' ? categoryUtil.categoryName(tx.category_id) : '';
  const detailText = tx.type === 'expense' && tx.detail_tag ? ` · ${tx.detail_tag}` : '';
  const fallback = tx.type === 'income' ? '新增财富' : `${categoryText}${detailText}`;
  return {
    id: tx.id,
    type: tx.type,
    occurred_on: tx.occurred_on,
    amountText: fmt.money(tx.amount),
    noteText: tx.system_kind === storage.OPENING_KIND ? '起始自由本金 · 基准' : (tx.note || fallback || '生活消耗'),
    metaText: tx.type === 'expense' ? `${categoryText}${detailText}${tx.nature ? ` · ${categoryUtil.natureName(tx.nature)}` : ''}` : '',
    sign: tx.type === 'income' ? '+' : '−'
  };
}

function makeHabitView(transactions, presets, settingsInput) {
  const settings = model.normalizeSettings(settingsInput || {});
  if (!settings.habit_center && !settings.achievements_enabled && !settings.quick_entry_enabled && !settings.missed_prompt_enabled && !settings.weekly_review_enabled) {
    return { habitSummary: null, activityRows: [], frequentPresets: [], achievementPreview: null, achievementCountText: '', weeklyReview: null, missedPrompt: null };
  }
  const today = new Date();
  const habitSummary = habitUtil.summary(transactions, today);
  const cells = settings.habit_center ? habitUtil.activityGrid(transactions, today, 12) : [];
  const activityRows = [];
  if (cells.length) {
    for (let d = 0; d < 7; d += 1) activityRows.push({ id: `day-${d}`, cells: cells.filter((_, index) => index % 7 === d) });
  }
  const achievements = settings.achievements_enabled ? habitUtil.achievementData(transactions, today) : [];
  const unlocked = achievements.filter(item => item.unlocked);
  const frequentPresets = settings.quick_entry_enabled ? habitUtil.frequentPresets(transactions, presets, 4, today) : [];
  const weeklyReview = settings.weekly_review_enabled ? habitUtil.weeklyReviewState(today, storage.getHabitState(), transactions) : null;
  const missedPrompt = settings.missed_prompt_enabled ? habitUtil.missedPrompt(transactions, today) : null;
  return {
    habitSummary: settings.habit_center ? habitSummary : null, activityRows, frequentPresets,
    achievementPreview: unlocked.length ? unlocked[unlocked.length - 1] : null,
    achievementCountText: achievements.length ? `${unlocked.length} / ${achievements.length}` : '',
    weeklyReview, missedPrompt
  };
}

function sortTxDesc(a, b) {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1;
  return Number(b.id || 0) - Number(a.id || 0);
}
