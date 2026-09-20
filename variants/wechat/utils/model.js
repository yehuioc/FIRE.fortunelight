const homeLayout = require('./home_layout');
const DAY_MS = 86400000;

function parseDateLocal(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Keep the model boundary identical to the storage/page boundary: canonical YYYY-MM-DD only.
  // This prevents loose strings such as 2026-8-2 from silently entering date arithmetic.
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function isoDate(dateObj) {
  const d = dateObj || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function utcDayNumber(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

function diffDays(later, earlier) {
  return utcDayNumber(later) - utcDayNumber(earlier);
}

function targetDateFromBirth(birth, targetAge) {
  const year = birth.getFullYear() + Number(targetAge || 80);
  const month = birth.getMonth();
  const date = birth.getDate();
  const candidate = new Date(year, month, date, 12, 0, 0, 0);
  if (candidate.getMonth() === month) return candidate;
  return new Date(year, month + 1, 0, 12, 0, 0, 0);
}

function round(value, digits) {
  const base = Math.pow(10, digits || 0);
  return Math.round((Number(value) + Number.EPSILON) * base) / base;
}

function moneyToCents(value) {
  // Money is a cent-domain. Reject values that would require silently rounding a
  // third decimal place (0.009 / 1.005), while tolerating normal IEEE noise such
  // as 0.29 * 100 = 28.999999999999996.
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!/^\+?\d+(?:\.\d{1,2})?$/.test(raw)) return null;
    const clean = raw.replace(/^\+/, '');
    const parts = clean.split('.');
    const whole = parts[0].replace(/^0+(?=\d)/, '') || '0';
    const frac = (parts[1] || '').padEnd(2, '0');
    const cents = Number(whole) * 100 + Number(frac || 0);
    return Number.isSafeInteger(cents) ? cents : null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const scaled = n * 100;
  const rounded = Math.round(scaled);
  const tolerance = Math.max(1e-7, Math.abs(scaled) * Number.EPSILON * 8);
  if (Math.abs(scaled - rounded) > tolerance) return null;
  return Number.isSafeInteger(rounded) ? rounded : null;
}

function centsToMoney(cents) {
  return Number(cents || 0) / 100;
}

// A long ledger can make aggregate cents exceed Number.MAX_SAFE_INTEGER even when
// every individual transaction is valid. Keep aggregate cent arithmetic exact via
// tiny decimal-string helpers instead of native BigInt (not uniform across WeChat
// runtimes). These helpers only operate on non-negative integer strings.
function decNorm(value) {
  const raw = String(value === undefined || value === null ? '0' : value).replace(/^0+(?=\d)/, '');
  return /^\d+$/.test(raw) ? raw : '0';
}
function decCompare(aInput, bInput) {
  const a = decNorm(aInput), b = decNorm(bInput);
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a === b ? 0 : (a < b ? -1 : 1);
}
function decAdd(aInput, bInput) {
  const a = decNorm(aInput), b = decNorm(bInput);
  let i = a.length - 1, j = b.length - 1, carry = 0, out = '';
  while (i >= 0 || j >= 0 || carry) {
    const n = (i >= 0 ? a.charCodeAt(i--) - 48 : 0) + (j >= 0 ? b.charCodeAt(j--) - 48 : 0) + carry;
    out = String(n % 10) + out;
    carry = Math.floor(n / 10);
  }
  return decNorm(out);
}
function decSub(aInput, bInput) {
  const a = decNorm(aInput), b = decNorm(bInput);
  if (decCompare(a, b) < 0) throw new Error('DEC_NEGATIVE');
  let i = a.length - 1, j = b.length - 1, borrow = 0, out = '';
  while (i >= 0) {
    let n = a.charCodeAt(i--) - 48 - borrow - (j >= 0 ? b.charCodeAt(j--) - 48 : 0);
    if (n < 0) { n += 10; borrow = 1; } else borrow = 0;
    out = String(n) + out;
  }
  return decNorm(out);
}
function decMulSmall(aInput, smallInput) {
  const a = decNorm(aInput);
  const m = Math.max(0, Math.floor(Number(smallInput || 0)));
  if (!Number.isSafeInteger(m)) throw new Error('DEC_MULTIPLIER_UNSAFE');
  if (m === 0 || a === '0') return '0';
  let carry = 0, out = '';
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const n = (a.charCodeAt(i) - 48) * m + carry;
    out = String(n % 10) + out;
    carry = Math.floor(n / 10);
  }
  while (carry) { out = String(carry % 10) + out; carry = Math.floor(carry / 10); }
  return decNorm(out);
}
function decDivFloor(nInput, dInput) {
  const n = decNorm(nInput), d = decNorm(dInput);
  if (d === '0') throw new Error('DEC_DIV_ZERO');
  if (decCompare(n, d) < 0) return '0';
  let rem = '0', out = '';
  for (let i = 0; i < n.length; i += 1) {
    rem = decNorm(rem === '0' ? n[i] : rem + n[i]);
    let q = 0;
    for (let candidate = 9; candidate >= 1; candidate -= 1) {
      const prod = decMulSmall(d, candidate);
      if (decCompare(prod, rem) <= 0) { q = candidate; rem = decSub(rem, prod); break; }
    }
    out += String(q);
  }
  return decNorm(out);
}
function decToClampedInt(value) {
  const s = decNorm(value), max = String(Number.MAX_SAFE_INTEGER);
  return decCompare(s, max) > 0 ? Number.MAX_SAFE_INTEGER : Number(s);
}
function decToNumber(value) {
  const n = Number(decNorm(value));
  return Number.isFinite(n) ? n : Number.MAX_VALUE;
}

function normalizeMoney(value, fallback) {
  const cents = moneyToCents(value);
  if (cents === null) return fallback === undefined ? 0 : fallback;
  return centsToMoney(Math.max(0, cents));
}

// Exact floor(a * b / c) for non-negative safe integers without multiplying a*b directly.
// b is small in this product (tracking days <= 365000), so binary doubling keeps all
// intermediate remainders below 2*c and therefore inside Number's safe integer range.
function floorMulDiv(aInput, bInput, cInput) {
  const a = Math.max(0, Math.floor(Number(aInput || 0)));
  const b = Math.max(0, Math.floor(Number(bInput || 0)));
  const c = Math.max(1, Math.floor(Number(cInput || 1)));
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(c)) {
    const approx = (Number(aInput || 0) * Number(bInput || 0)) / Number(cInput || 1);
    return Math.max(0, Math.floor(approx + Number.EPSILON * Math.max(1, Math.abs(approx)) * 8));
  }
  const whole = Math.floor(a / c);
  let result = whole * b;
  if (!Number.isSafeInteger(result) || result >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  let remTerm = a - whole * c;
  let factor = b;
  let quotientTerm = 0;
  let accRem = 0;
  while (factor > 0) {
    if (factor % 2 === 1) {
      result += quotientTerm;
      // Avoid accRem + remTerm overflow when c is close to MAX_SAFE_INTEGER.
      if (accRem >= c - remTerm) {
        result += 1;
        accRem = accRem - (c - remTerm);
      } else {
        accRem += remTerm;
      }
    }
    factor = Math.floor(factor / 2);
    if (factor <= 0) break;
    quotientTerm *= 2;
    // Double modulo c without forming 2*remTerm when that could exceed safe integer range.
    if (remTerm >= c - remTerm) {
      quotientTerm += 1;
      remTerm = remTerm - (c - remTerm);
    } else {
      remTerm += remTerm;
    }
    if (!Number.isSafeInteger(result) || result >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, result);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * v0.3.3 内核原则：
 * - quick / advanced 只是“输入界面复杂度”不同，绝不是两套公式。
 * - 快速版会把“起始自由本金”写成一笔系统基准收入，因此 computeStats 不需要知道它是快速版。
 * - 高级版继续允许原项目已有的“起始资产独立折算”扩展；该扩展与账本净储蓄是两个桶。
 */
function normalizeSettings(raw) {
  const s = raw || {};
  const legacyManual = clampNumber(s.avg_daily_expense_override, 0, Number.MAX_SAFE_INTEGER, 0);
  const mode = s.mode === 'quick' ? 'quick' : 'advanced';
  let expenseMode = s.expense_mode === 'ledger' ? 'ledger' : 'manual';
  if (!s.mode && !s.expense_mode) expenseMode = legacyManual > 0 ? 'manual' : 'ledger';
  if (mode === 'quick') expenseMode = 'manual';

  const dormantRaw = s.advanced_dormant && typeof s.advanced_dormant === 'object' && !Array.isArray(s.advanced_dormant)
    ? s.advanced_dormant : {};
  const activeManual = normalizeMoney(s.manual_daily_expense !== undefined ? s.manual_daily_expense : legacyManual, 0);
  const dormantExpenseMode = dormantRaw.expense_mode === 'ledger' ? 'ledger'
    : (dormantRaw.expense_mode === 'manual' ? 'manual' : (mode === 'advanced' ? expenseMode : 'manual'));
  const dormantManual = normalizeMoney(
    dormantRaw.manual_daily_expense !== undefined ? dormantRaw.manual_daily_expense : activeManual,
    activeManual
  );
  const activeDormant = {
    expense_mode: mode === 'advanced' ? expenseMode : dormantExpenseMode,
    manual_daily_expense: mode === 'advanced' ? activeManual : dormantManual,
    show_past: mode === 'advanced' ? !!s.show_past : !!dormantRaw.show_past,
    use_initial_assets: mode === 'advanced' ? !!s.use_initial_assets : !!dormantRaw.use_initial_assets,
    initial_assets: mode === 'advanced'
      ? normalizeMoney(s.initial_assets, 0)
      : normalizeMoney(dormantRaw.initial_assets, 0),
    tracking_days_override: mode === 'advanced' && expenseMode === 'ledger'
      ? clampInt(s.tracking_days_override, 0, 365000, 0)
      : (dormantExpenseMode === 'ledger' ? clampInt(dormantRaw.tracking_days_override, 0, 365000, 0) : 0)
  };

  return {
    birth_date: typeof s.birth_date === 'string' ? s.birth_date : '',
    target_age: clampInt(s.target_age, 20, 120, 80),
    mode,
    expense_mode: expenseMode,
    manual_daily_expense: activeManual,
    show_past: mode === 'advanced' ? !!s.show_past : false,
    use_initial_assets: mode === 'advanced' ? !!s.use_initial_assets : false,
    initial_assets: mode === 'advanced' ? normalizeMoney(s.initial_assets, 0) : 0,
    tracking_days_override: mode === 'advanced' && expenseMode === 'ledger'
      ? clampInt(s.tracking_days_override, 0, 365000, 0)
      : 0,
    advanced_dormant: activeDormant,
    theme: s.theme === 'paper' ? 'paper' : 'midnight',
    font_family: s.font_family === 'serif' ? 'serif' : 'system',
    font_scale: require('./theme').normalizeFontScale(s.font_scale),
    home_module_order: homeLayout.normalizeOrder(s.home_module_order),
    inline_tips_enabled: s.inline_tips_enabled !== false,
    freedom_delta_hint: s.freedom_delta_hint !== false,
    habit_center: s.habit_center !== false,
    achievements_enabled: s.achievements_enabled !== false,
    quick_entry_enabled: s.quick_entry_enabled !== false,
    missed_prompt_enabled: s.missed_prompt_enabled !== false,
    weekly_review_enabled: s.weekly_review_enabled !== false,
    currency: 'CNY'
  };
}

function computeStats(settingsInput, transactionsInput, nowInput) {
  const settings = normalizeSettings(settingsInput);
  const now = nowInput instanceof Date ? nowInput : new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const txs = Array.isArray(transactionsInput) ? transactionsInput : [];
  const birth = parseDateLocal(settings.birth_date);

  let totalIncomeExact = '0';
  let totalExpenseExact = '0';
  let firstRecord = null;
  let openingSeen = false;

  txs.forEach(tx => {
    if (!tx || (tx.type !== 'income' && tx.type !== 'expense')) return;
    const isOpeningBalance = tx.system_kind === 'opening_balance' && tx.type === 'income';
    if (isOpeningBalance) {
      if (openingSeen) return;
      openingSeen = true;
    }
    const cents = moneyToCents(tx.amount);
    const d = parseDateLocal(tx.occurred_on);
    if (cents === null || cents <= 0 || !d) return;
    // Opening balance is a synthetic baseline, not a real dated event. A later birth-date
    // correction or a temporary device-clock rollback must not make it disappear.
    if (!isOpeningBalance && (d > today || (birth && d < birth))) return;
    if (tx.type === 'income') totalIncomeExact = decAdd(totalIncomeExact, String(cents));
    else totalExpenseExact = decAdd(totalExpenseExact, String(cents));
    if (!isOpeningBalance && (!firstRecord || d < firstRecord)) firstRecord = d;
  });

  const totalIncomeCents = decToNumber(totalIncomeExact);
  const totalExpenseCents = decToNumber(totalExpenseExact);
  const totalIncome = totalIncomeCents / 100;
  const totalExpense = totalExpenseCents / 100;

  let trackingDays = 0;
  if (settings.tracking_days_override > 0) trackingDays = settings.tracking_days_override;
  else if (firstRecord) trackingDays = Math.max(1, diffDays(today, firstRecord) + 1);

  const manualDailyCents = moneyToCents(settings.manual_daily_expense) || 0;
  const initialAssetCents = moneyToCents(settings.initial_assets) || 0;
  let avgDailyExpense = 0;
  if (settings.expense_mode === 'manual') {
    avgDailyExpense = settings.manual_daily_expense;
  } else if (trackingDays > 0 && totalExpenseExact !== '0') {
    avgDailyExpense = (decToNumber(totalExpenseExact) / 100) / trackingDays;
  }

  const netCmp = decCompare(totalIncomeExact, totalExpenseExact);
  const netSavingsPositive = netCmp > 0;
  const netSavingsExactCents = netCmp >= 0
    ? decSub(totalIncomeExact, totalExpenseExact)
    : decSub(totalExpenseExact, totalIncomeExact);
  const netSavingsCents = (netCmp < 0 ? -1 : 1) * decToNumber(netSavingsExactCents);
  const netSavings = netSavingsCents / 100;

  let assetFreedomExact = 0;
  let incomeFreedomExact = 0;
  let assetFreedom = 0;
  let incomeFreedom = 0;
  if (settings.expense_mode === 'manual' && manualDailyCents > 0) {
    if (settings.use_initial_assets && initialAssetCents > 0) {
      assetFreedomExact = initialAssetCents / manualDailyCents;
      assetFreedom = decToClampedInt(decDivFloor(String(initialAssetCents), String(manualDailyCents)));
    }
    if (netSavingsPositive) {
      incomeFreedomExact = decToNumber(netSavingsExactCents) / manualDailyCents;
      incomeFreedom = decToClampedInt(decDivFloor(netSavingsExactCents, String(manualDailyCents)));
    }
  } else if (settings.expense_mode === 'ledger' && trackingDays > 0 && totalExpenseExact !== '0') {
    if (settings.use_initial_assets && initialAssetCents > 0) {
      assetFreedomExact = (initialAssetCents / decToNumber(totalExpenseExact)) * trackingDays;
      assetFreedom = decToClampedInt(decDivFloor(decMulSmall(String(initialAssetCents), trackingDays), totalExpenseExact));
    }
    if (netSavingsPositive) {
      incomeFreedomExact = (decToNumber(netSavingsExactCents) / decToNumber(totalExpenseExact)) * trackingDays;
      incomeFreedom = decToClampedInt(decDivFloor(decMulSmall(netSavingsExactCents, trackingDays), totalExpenseExact));
    }
  }
  const freedomDaysBought = Math.min(Number.MAX_SAFE_INTEGER, assetFreedom + incomeFreedom);

  let pastCells = 0;
  let futureCells = 0;
  let targetReached = false;
  if (birth && birth <= today) {
    const targetDate = targetDateFromBirth(birth, settings.target_age);
    pastCells = Math.max(0, diffDays(today, birth));
    futureCells = Math.max(0, diffDays(targetDate, today));
    targetReached = targetDate <= today;
  }

  const assetLit = Math.min(assetFreedom, futureCells);
  const incomeLit = Math.min(incomeFreedom, Math.max(0, futureCells - assetLit));
  const litCount = assetLit + incomeLit;
  const totalCells = settings.show_past ? pastCells + futureCells : futureCells;
  const overflow = Math.max(0, freedomDaysBought - futureCells);
  const progress = futureCells > 0 ? Math.min(1, litCount / futureCells) : 0;
  const remainingDays = Math.max(0, futureCells - litCount);
  const trackedPastCells = settings.show_past && firstRecord
    ? Math.min(pastCells, Math.max(0, diffDays(today, firstRecord)))
    : 0;

  return {
    total_income: round(totalIncome, 2),
    total_expense: round(totalExpense, 2),
    tracking_days: trackingDays,
    avg_daily_expense: round(avgDailyExpense, 4),
    net_savings: round(netSavings, 2),
    freedom_days_bought: freedomDaysBought,
    freedom_days_exact: round(assetFreedomExact + incomeFreedomExact, 4),
    asset_freedom_exact: round(assetFreedomExact, 4),
    income_freedom_exact: round(incomeFreedomExact, 4),
    asset_freedom: assetFreedom,
    income_freedom: incomeFreedom,
    asset_lit: assetLit,
    income_lit: incomeLit,
    lit_count: litCount,
    total_cells: totalCells,
    future_cells: futureCells,
    past_cells: settings.show_past ? pastCells : 0,
    tracked_past_cells: trackedPastCells,
    remaining_days: remainingDays,
    overflow,
    progress,
    target_reached: targetReached,
    first_record: firstRecord ? isoDate(firstRecord) : null,
    mode: settings.mode,
    expense_mode: settings.expense_mode
  };
}

function feedbackForChange(before, after, type, settingsInput, amountInput) {
  const settings = normalizeSettings(settingsInput);
  const delta = Number(after.lit_count || 0) - Number(before.lit_count || 0);
  const amount = Number(amountInput || 0);
  const beforeLit = Number(before.lit_count || 0);
  const afterLit = Number(after.lit_count || 0);
  const exactDelta = Number(after.freedom_days_exact || 0) - Number(before.freedom_days_exact || 0);
  const exactDeltaText = Math.abs(exactDelta) < 0.005 ? '约 0.00 天' : `${exactDelta > 0 ? '+' : '−'}${Math.abs(exactDelta).toFixed(2)} 天`;

  const ledgerCalibrationStarted = settings.expense_mode === 'ledger'
    && Number(before.avg_daily_expense || 0) <= 0
    && Number(after.avg_daily_expense || 0) > 0;
  const ledgerHistoryRebased = settings.expense_mode === 'ledger'
    && before.first_record
    && after.first_record
    && before.first_record !== after.first_record
    && Number(before.tracking_days || 0) !== Number(after.tracking_days || 0);

  if (ledgerCalibrationStarted) {
    return {
      delta,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'calibration',
      ritual: 'none',
      suppressCelebration: true,
      title: '生活成本估计已建立',
      gridLabel: delta === 0 ? '重新估算' : `${delta > 0 ? '+' : ''}${delta} 格 · 重算`,
      detail: `这笔生活消耗第一次让账本能够估计日均生活成本（${moneyPlain(after.avg_daily_expense)}/天）。方格变化来自“生活成本这把尺被建立”，不是这笔消费本身凭空创造或夺走了自由。`
    };
  }

  if (ledgerHistoryRebased) {
    return {
      delta,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'calibration',
      ritual: 'none',
      suppressCelebration: true,
      title: '生活成本估计已重算',
      gridLabel: delta === 0 ? '重新估算' : `${delta > 0 ? '+' : ''}${delta} 格 · 重算`,
      detail: `这笔回填把成本观察起点从 ${before.first_record} 调整到 ${after.first_record}，观察跨度从 ${before.tracking_days || 0} 天变为 ${after.tracking_days || 0} 天。当前方格变化包含生活成本估计被重算的影响，不能把全部格数都归因于这一笔财富增减，因此不播放点亮/熄灭仪式。`
    };
  }

  if (delta > 0) {
    const reason = settings.expense_mode === 'ledger' && type === 'expense'
      ? '账本同时改变了净储蓄与日均生活成本'
      : '净储蓄按当前日均生活成本重新折算';
    return {
      delta,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'light_up',
      title: `买回 ${delta} 天自由`,
      gridLabel: `+${delta} 格`,
      detail: `${reason}。自由时间从 ${beforeLit} 天变为 ${afterLit} 天；这些新增方格代表你多买回的未来自主时间。`
    };
  }

  if (delta < 0) {
    const reason = settings.expense_mode === 'ledger' && type === 'expense'
      ? '这笔生活消耗既减少净储蓄，也会参与重新估计日均生活成本'
      : '这笔生活消耗减少了按当前成本估计可以覆盖的完整自由日';
    return {
      delta,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'extinguish',
      title: `交换了 ${Math.abs(delta)} 天未来自由`,
      gridLabel: `${delta} 格`,
      detail: `${reason}。自由时间从 ${beforeLit} 天变为 ${afterLit} 天。方格熄灭只是在呈现机会成本：你把一部分未来自由交换成了今天的价值，值不值由你判断。`
    };
  }

  // 已经全部点亮时，delta=0 不等于“没变化”：可能只是变化进入 overflow。
  if (after.future_cells > 0 && afterLit >= after.future_cells) {
    return {
      delta: 0,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'steady',
      title: '剩余人生仍已全部点亮',
      gridLabel: '0 格',
      detail: after.overflow > 0
        ? `当前已超出剩余人生方格 ${after.overflow} 天；这笔账已计入模型，只是没有更多方格可以点亮。`
        : '这笔账已计入模型；当前剩余人生方格仍全部被覆盖。'
    };
  }

  if (after.avg_daily_expense <= 0) {
    return {
      delta: 0,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'steady',
      title: '已记账，暂时无法换算自由天数',
      gridLabel: '0 格',
      detail: settings.expense_mode === 'ledger'
        ? '账本还无法形成有效的日均生活成本估计。自由天数必须先有“每天大约需要多少钱”这把尺。'
        : '当前手动生活成本估计为 0，请先在设置里给出一个大于 0 的真实估值。'
    };
  }

  // 高级版“固定起始资产”是独立桶。若净储蓄为负、手动成本又固定，支出不会直接扣这个桶。
  if (settings.use_initial_assets && settings.expense_mode === 'manual' && after.income_freedom <= 0 && after.asset_freedom > 0) {
    return {
      delta: 0,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'steady',
      title: `仍是 ${afterLit} 天自由`,
      gridLabel: '0 格',
      detail: `当前点亮主要来自固定起始资产 ${moneyPlain(settings.initial_assets)}。这笔自由事件已经改变净储蓄，但你手动设定的生活成本估计没有变化，因此固定资产折算出的 ${after.asset_freedom} 天暂时不变。`
    };
  }

  if (after.net_savings <= 0 && after.asset_freedom <= 0) {
    return {
      delta: 0,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'steady',
      title: '已记账，当前仍没有收入自由日',
      gridLabel: '0 格',
      detail: `当前净储蓄为 ${moneyPlain(after.net_savings)}。原始模型只把正净储蓄折算成收入自由天数。`
    };
  }

  if (settings.expense_mode === 'ledger') {
    return {
      delta: 0,
      exactDelta: round(exactDelta, 4),
      exactDeltaText,
      kind: 'steady',
      title: `仍是 ${afterLit} 天自由`,
      gridLabel: '0 格',
      detail: `这笔 ${moneyPlain(amount)} 已进入自由模型。账本当前估计的日均生活成本为 ${moneyPlain(after.avg_daily_expense)}；收入自由约 ${Number(after.income_freedom_exact || 0).toFixed(2)} 天，资产自由约 ${Number(after.asset_freedom_exact || 0).toFixed(2)} 天，取整后仍落在同一组方格。`
    };
  }

  const exactIncome = Number(after.income_freedom_exact || 0);
  const fractional = Math.max(0, exactIncome - Math.floor(exactIncome));
  const toNextUp = (fractional > 0 ? 1 - fractional : 1) * after.avg_daily_expense;
  const toNextDown = (fractional > 0 ? fractional : 1) * after.avg_daily_expense;
  const boundaryMoney = type === 'income' ? toNextUp : toNextDown;
  const boundaryText = type === 'income' ? '再买回一格' : '再交换一格未来自由';

  return {
    delta: 0,
    exactDelta: round(exactDelta, 4),
    exactDeltaText,
    kind: 'steady',
    title: `仍是 ${afterLit} 天自由`,
    gridLabel: '0 格',
    detail: `这笔 ${moneyPlain(amount)} 已进入自由模型。当前收入自由约 ${exactIncome.toFixed(2)} 天，方格只显示完整天数；距离${boundaryText}的边界约 ${moneyPlain(boundaryMoney)}。`
  };
}

function insight(stats, settingsInput) {
  const settings = normalizeSettings(settingsInput);
  if (!stats || stats.avg_daily_expense <= 0) {
    if (settings.expense_mode === 'manual') {
      return '先给“一天大约需要多少钱生活”一个估计。没有这把尺，财富就无法被翻译成自由时间。';
    }
    return '当前由账本估计生活成本：累计生活消耗 ÷ 观察跨度。它是一种估计方法，不是绝对真值。';
  }

  if (stats.target_reached) {
    return '你设定的人生坐标终点已经到达。账本和财富数据仍然完整保留，请在设置中更新目标年龄后继续观察。';
  }

  if (stats.progress >= 1 && stats.future_cells > 0) {
    return stats.overflow > 0
      ? `按当前生活成本估计与人生坐标，现有自由资源已覆盖剩余人生，并额外覆盖约 ${stats.overflow} 天。这不是永久退休能力的证明。`
      : '按当前生活成本估计与人生坐标，现有自由资源已覆盖剩余人生。这不是永久退休能力的证明。';
  }

  if (stats.freedom_days_bought <= 0) {
    return `按 ${moneyPlain(stats.avg_daily_expense)}/天的生活成本，当前还没有完整的自由日被买下。先看清现实，再决定怎样改变它。`;
  }

  const source = settings.expense_mode === 'ledger' ? '账本估计' : '你的手动估计';
  return `按${source} ${moneyPlain(stats.avg_daily_expense)}/天，你当前一共买回约 ${stats.freedom_days_bought} 天自由。`;
}

function costSourceLabel(settingsInput) {
  const settings = normalizeSettings(settingsInput);
  return settings.expense_mode === 'ledger' ? '账本估计' : '手动估计';
}

function moneyPlain(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '¥0';
  const rounded = Math.round(n * 100) / 100;
  return `¥${Number.isInteger(rounded) ? rounded.toLocaleString('zh-CN') : rounded.toFixed(2)}`;
}

module.exports = {
  parseDateLocal,
  isoDate,
  diffDays,
  targetDateFromBirth,
  normalizeSettings,
  computeStats,
  feedbackForChange,
  insight,
  costSourceLabel,
  moneyToCents,
  centsToMoney,
  floorMulDiv
};
