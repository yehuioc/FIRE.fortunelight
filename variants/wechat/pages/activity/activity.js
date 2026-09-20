const storage = require('../../utils/storage');
const model = require('../../utils/model');
const themeUtil = require('../../utils/theme');
const habitUtil = require('../../utils/habits');

Page({
  data: {
    themeClass: 'theme-midnight', pageBackground: '#07080c', appearanceClass: 'font-system font-scale-100',
    summary: null, activityRows: [], formalAchievements: [], weirdAchievements: [], unlockedText: '0 / 0', weeklyReview: null, habitCenterEnabled: true, loadFailed: false
  },
  onShow() {
    try {
      const settings = model.normalizeSettings(storage.getSettings());
      const theme = themeUtil.applyNavigation(settings.theme);
      const items = storage.getTransactions();
      const summary = settings.habit_center ? habitUtil.summary(items, new Date()) : null;
      const cells = settings.habit_center ? habitUtil.activityGrid(items, new Date(), 12) : [];
      const activityRows = [];
      for (let d = 0; d < 7; d += 1) activityRows.push({ id: `day-${d}`, cells: cells.filter((_, index) => index % 7 === d) });
      const achievements = settings.achievements_enabled ? habitUtil.achievementData(items, new Date()) : [];
      const unlocked = achievements.filter(x => x.unlocked).length;
      const weeklyReview = settings.weekly_review_enabled ? habitUtil.weeklyReviewState(new Date(), storage.getHabitState(), items) : null;
      this.setData({
        themeClass: theme.className, pageBackground: theme.pageBackground, appearanceClass: themeUtil.getAppearanceClasses(settings),
        summary, activityRows, formalAchievements: achievements.filter(x => x.group === '正式'), weirdAchievements: achievements.filter(x => x.group === '奇怪'),
        unlockedText: `${unlocked} / ${achievements.length}`, weeklyReview, habitCenterEnabled: settings.habit_center, loadFailed: false
      });
    } catch (err) {
      this.setData({ summary: null, activityRows: [], formalAchievements: [], weirdAchievements: [], unlockedText: '0 / 0', weeklyReview: null, habitCenterEnabled: true, loadFailed: false });
    }
  },
  goWeeklyReview() {
    const review = this.data.weeklyReview;
    if (review && review.weekKey) storage.markWeeklyReportSeen(review.weekKey);
    wx.navigateTo({ url: '/pages/analysis/analysis?period=week&source=weekly&review=previous' });
  },
  goGuide() { wx.navigateTo({ url: '/pages/guide/guide' }); }
});
