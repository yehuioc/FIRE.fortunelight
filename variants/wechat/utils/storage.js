const KEYS = {
  settings: 'wfb.settings',
  transactions: 'wfb.transactions', // v0.5.x legacy single-key ledger; migrated on first v0.6 read
  ledgerIndex: 'wfb.tx.index',
  presets: 'wfb.expensePresets',
  habitState: 'wfb.habitState',
  onboarding: 'wfb.onboarding',
  nextId: 'wfb.nextId',
  kernelVersion: 'wfb.kernelVersion'
};

const LEGACY_KEYS = {
  settings: 'wfb.v020.settings',
  transactions: 'wfb.v020.transactions',
  onboarding: 'wfb.v020.onboarding',
  nextId: 'wfb.v020.nextId'
};

const OPENING_KIND = 'opening_balance';
const CURRENT_KERNEL_VERSION = '0.3.3';
const BACKUP_SCHEMA = 'wealth-freedom-beacon-backup';
const BACKUP_VERSION = 2;
const LEDGER_INDEX_VERSION = 1;
const LEDGER_BUCKET_PREFIX = 'wfb.tx.';
const categories = require('./categories');
const MAX_BACKUP_FILE_BYTES = 16 * 1024 * 1024;

function toCurrencyCents(value) {
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

function centsToAmount(cents) { return Number(cents || 0) / 100; }

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidIsoDate(value) {
  const raw = String(value || '');
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = new Date(y, mo - 1, d, 12, 0, 0, 0);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

function trimNote(value, maxCodePoints) {
  return Array.from(String(value || '').trim()).slice(0, maxCodePoints || 40).join('');
}
function trimTag(value, maxCodePoints) {
  return Array.from(String(value || '').trim()).slice(0, maxCodePoints || 16).join('');
}
function monthFromIso(value) {
  const raw = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(0, 7) : '';
}
function bucketKey(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('INVALID_LEDGER_MONTH');
  return `${LEDGER_BUCKET_PREFIX}${month}`;
}
function normalizeLedgerIndex(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Number(value.version) !== LEDGER_INDEX_VERSION || !Array.isArray(value.months)) return null;
  const months = Array.from(new Set(value.months.map(String).filter(x => /^\d{4}-\d{2}$/.test(x)))).sort();
  return { version: LEDGER_INDEX_VERSION, months };
}

function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

function valueMissing(value) {
  return value === '' || value === undefined || value === null;
}

function safeGet(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return valueMissing(value) ? fallback : value;
  } catch (err) {
    return fallback;
  }
}

function strictGet(key, fallback) {
  let value;
  try { value = wx.getStorageSync(key); }
  catch (err) { throw new Error(`STORAGE_READ_FAILED:${key}`); }
  return valueMissing(value) ? fallback : value;
}

function safeSet(key, value) {
  try { wx.setStorageSync(key, value); return true; }
  catch (err) { return false; }
}

function strictSet(key, value, errorCode) {
  try { wx.setStorageSync(key, value); return true; }
  catch (err) { throw new Error(errorCode || `STORAGE_WRITE_FAILED:${key}`); }
}

function strictRemove(key) {
  try { wx.removeStorageSync(key); return true; }
  catch (err) { throw new Error(`STORAGE_REMOVE_FAILED:${key}`); }
}

function readWithLegacy(name, fallback) {
  const current = safeGet(KEYS[name], undefined);
  if (!valueMissing(current)) return current;
  const legacy = safeGet(LEGACY_KEYS[name], undefined);
  if (!valueMissing(legacy)) {
    safeSet(KEYS[name], legacy);
    return legacy;
  }
  return fallback;
}

function readWithLegacyStrict(name, fallback) {
  const current = strictGet(KEYS[name], undefined);
  if (!valueMissing(current)) return current;
  const legacy = strictGet(LEGACY_KEYS[name], undefined);
  return valueMissing(legacy) ? fallback : legacy;
}


function getHabitState() {
  const raw = safeGet(KEYS.habitState, null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { version: 1, last_weekly_report_seen: '' };
  return { version: 1, last_weekly_report_seen: typeof raw.last_weekly_report_seen === 'string' ? raw.last_weekly_report_seen : '' };
}

function markWeeklyReportSeen(weekKey) {
  const key = String(weekKey || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return safeSet(KEYS.habitState, { version: 1, last_weekly_report_seen: key });
}

function getSettings() {
  const current = safeGet(KEYS.settings, undefined);
  if (current && typeof current === 'object' && !Array.isArray(current)) return current;
  const legacy = safeGet(LEGACY_KEYS.settings, undefined);
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    safeSet(KEYS.settings, legacy);
    return legacy;
  }
  return null;
}

function getSettingsStrict() {
  const current = strictGet(KEYS.settings, undefined);
  if (!valueMissing(current)) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('SETTINGS_STATE_INVALID');
    return current;
  }
  const legacy = strictGet(LEGACY_KEYS.settings, undefined);
  if (valueMissing(legacy)) return null;
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) throw new Error('SETTINGS_STATE_INVALID');
  return legacy;
}

function saveSettings(settings) {
  strictSet(KEYS.settings, settings, 'SETTINGS_STORAGE_FAILED');
  return settings;
}

function maxExistingId(items) {
  return (Array.isArray(items) ? items : []).reduce((max, item) => {
    const id = Number(item && item.id);
    return Number.isSafeInteger(id) && id > 0 ? Math.max(max, id) : max;
  }, 0);
}

function canonicalizeTransactionArray(value) {
  if (!Array.isArray(value)) return null;
  let openingSeen = false;
  const out = [];
  value.forEach(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const id = Number(item.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    if (item.type !== 'income' && item.type !== 'expense') return;
    const cents = toCurrencyCents(item.amount);
    if (cents === null || cents < 1) return;
    const occurredOn = String(item.occurred_on || '');
    if (!isValidIsoDate(occurredOn)) return;

    const markedOpening = item.system_kind === OPENING_KIND;
    const trueOpening = markedOpening && item.type === 'income';
    if (trueOpening && openingSeen) return;
    if (trueOpening) openingSeen = true;

    const clean = {
      id,
      occurred_on: occurredOn,
      type: item.type,
      amount: centsToAmount(cents),
      note: trueOpening ? '起始自由本金' : trimNote(item.note, 40)
    };
    if (item.type === 'expense' && !trueOpening) {
      clean.category_id = categories.normalizeCategoryId(item.category_id, true);
      clean.nature = categories.normalizeNature(item.nature, true);
      const detailTag = trimTag(item.detail_tag, 16);
      if (detailTag) clean.detail_tag = detailTag;
    }
    if (typeof item.created_at === 'string' && item.created_at.length <= 80) clean.created_at = item.created_at;
    if (trueOpening) { clean.system_kind = OPENING_KIND; clean.system_locked = true; }
    out.push(clean);
  });
  return out;
}

function groupTransactionsByMonth(itemsInput) {
  const groups = Object.create(null);
  (Array.isArray(itemsInput) ? itemsInput : []).forEach(tx => {
    const month = monthFromIso(tx && tx.occurred_on);
    if (!month) return;
    if (!groups[month]) groups[month] = [];
    groups[month].push(tx);
  });
  return groups;
}

function writeLedgerIndexStrict(months) {
  const clean = Array.from(new Set((Array.isArray(months) ? months : []).map(String).filter(x => /^\d{4}-\d{2}$/.test(x)))).sort();
  strictSet(KEYS.ledgerIndex, { version: LEDGER_INDEX_VERSION, months: clean }, 'LEDGER_INDEX_WRITE_FAILED');
  return clean;
}

function ensureLedgerBucketsStrict() {
  const existing = strictGet(KEYS.ledgerIndex, undefined);
  if (!valueMissing(existing)) {
    const normalized = normalizeLedgerIndex(existing);
    if (!normalized) throw new Error('LEDGER_INDEX_INVALID');
    return normalized;
  }

  let raw = strictGet(KEYS.transactions, undefined);
  let sourceKey = KEYS.transactions;
  let items = valueMissing(raw) ? null : canonicalizeTransactionArray(raw);
  if (valueMissing(raw) || !items) {
    const legacyRaw = strictGet(LEGACY_KEYS.transactions, undefined);
    const legacyItems = valueMissing(legacyRaw) ? null : canonicalizeTransactionArray(legacyRaw);
    if (legacyItems) { raw = legacyRaw; items = legacyItems; sourceKey = LEGACY_KEYS.transactions; }
    else if (valueMissing(raw) && valueMissing(legacyRaw)) items = [];
    else if (!items) throw new Error('TRANSACTION_STATE_INVALID');
  }
  const groups = groupTransactionsByMonth(items);
  const months = Object.keys(groups).sort();
  const touched = [KEYS.ledgerIndex, KEYS.nextId, KEYS.transactions, LEGACY_KEYS.transactions].concat(months.map(bucketKey));
  const snapshots = touched.map(snapshotStorageKeyStrict);
  try {
    months.forEach(month => strictSet(bucketKey(month), groups[month], `LEDGER_BUCKET_WRITE_FAILED:${month}`));
    writeLedgerIndexStrict(months);
    const maxId = maxExistingId(items);
    const stored = Number(strictGet(KEYS.nextId, 0));
    if (!Number.isSafeInteger(stored) || stored < maxId) strictSet(KEYS.nextId, maxId, 'ID_STORAGE_FAILED');
    if (!valueMissing(strictGet(sourceKey, undefined))) strictRemove(sourceKey);
    // Remove the other legacy copy too when it exists, so the 1 MB single-key ceiling is truly gone.
    const otherKey = sourceKey === KEYS.transactions ? LEGACY_KEYS.transactions : KEYS.transactions;
    if (!valueMissing(strictGet(otherKey, undefined))) strictRemove(otherKey);
    return { version: LEDGER_INDEX_VERSION, months };
  } catch (err) {
    snapshots.forEach(restoreStorageSnapshot);
    throw err;
  }
}

function readBucketStrict(month) {
  const raw = strictGet(bucketKey(month), []);
  const normalized = canonicalizeTransactionArray(raw);
  if (!normalized) throw new Error(`LEDGER_BUCKET_INVALID:${month}`);
  return normalized;
}

function getTransactionsStrict() {
  const index = ensureLedgerBucketsStrict();
  const out = [];
  index.months.forEach(month => { out.push(...readBucketStrict(month)); });
  return out;
}

function getTransactions() {
  try { return getTransactionsStrict(); }
  catch (err) { return []; }
}

function saveTransactions(itemsInput) {
  const items = canonicalizeTransactionArray(Array.isArray(itemsInput) ? itemsInput : []);
  if (!items) throw new Error('TRANSACTION_STATE_INVALID');
  const oldIndex = ensureLedgerBucketsStrict();
  const groups = groupTransactionsByMonth(items);
  const newMonths = Object.keys(groups).sort();
  const touchedMonths = Array.from(new Set(oldIndex.months.concat(newMonths))).sort();
  const snapshots = [KEYS.ledgerIndex].concat(touchedMonths.map(bucketKey)).map(snapshotStorageKeyStrict);
  try {
    newMonths.forEach(month => strictSet(bucketKey(month), groups[month], `LEDGER_BUCKET_WRITE_FAILED:${month}`));
    oldIndex.months.filter(month => !groups[month]).forEach(month => strictRemove(bucketKey(month)));
    writeLedgerIndexStrict(newMonths);
    return items;
  } catch (err) {
    snapshots.forEach(restoreStorageSnapshot);
    throw err;
  }
}

function getTransactionsInRange(startIso, endIso) {
  const start = String(startIso || ''), end = String(endIso || '');
  if (!isValidIsoDate(start) || !isValidIsoDate(end) || start > end) return [];
  const startMonth = start.slice(0, 7), endMonth = end.slice(0, 7);
  const index = ensureLedgerBucketsStrict();
  const out = [];
  index.months.filter(month => month >= startMonth && month <= endMonth).forEach(month => {
    readBucketStrict(month).forEach(tx => { if (tx.occurred_on >= start && tx.occurred_on <= end) out.push(tx); });
  });
  return out;
}

function getRecentTransactions(limitInput) {
  const limit = Math.max(0, Math.min(1000, Math.floor(Number(limitInput || 0))));
  if (!limit) return [];
  const index = ensureLedgerBucketsStrict();
  const out = [];
  const months = index.months.slice().sort().reverse();
  for (let i = 0; i < months.length && out.length < limit; i += 1) {
    const rows = readBucketStrict(months[i]).slice().sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1;
      return Number(b.id || 0) - Number(a.id || 0);
    });
    out.push(...rows);
  }
  return out.slice(0, limit);
}

function getTransactionPage(offsetInput, limitInput) {
  const offset = Math.max(0, Math.floor(Number(offsetInput || 0)));
  const limit = Math.max(1, Math.min(500, Math.floor(Number(limitInput || 100))));
  // Month buckets prevent the storage ceiling; for the UI page we still sort the logical ledger once.
  // 1k–10k rows stay comfortably below the setData boundary because only `limit` rows leave this module.
  const all = getTransactionsStrict().slice().sort((a, b) => {
    if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1;
    return Number(b.id || 0) - Number(a.id || 0);
  });
  return { items: all.slice(offset, offset + limit), total: all.length, hasMore: offset + limit < all.length };
}

function nextIdForItems(items) {
  const used = new Set((Array.isArray(items) ? items : []).map(item => Number(item && item.id)).filter(id => Number.isSafeInteger(id) && id > 0));
  const stored = Number(readWithLegacyStrict('nextId', 0));
  const storedSafe = Number.isSafeInteger(stored) && stored > 0 ? stored : 0;
  let id = Math.max(storedSafe, maxExistingId(items)) + 1;
  if (!Number.isSafeInteger(id) || id <= 0) {
    id = 1;
    while (used.has(id) && id < Number.MAX_SAFE_INTEGER) id += 1;
  }
  if (!Number.isSafeInteger(id) || used.has(id)) throw new Error('ID_SPACE_EXHAUSTED');
  return id;
}

function addTransaction(input) {
  const cents = toCurrencyCents(input.amount);
  if (cents === null || cents < 1) throw new Error('INVALID_AMOUNT');
  if (input.type !== 'income' && input.type !== 'expense') throw new Error('INVALID_TYPE');
  const occurredOn = String(input.occurred_on || '');
  if (!isValidIsoDate(occurredOn) || occurredOn > todayIso()) throw new Error('INVALID_DATE');

  const index = ensureLedgerBucketsStrict();
  const month = monthFromIso(occurredOn);
  const key = bucketKey(month);
  const snapshots = [key, KEYS.ledgerIndex, KEYS.nextId].map(snapshotStorageKeyStrict);
  try {
    const bucket = readBucketStrict(month);
    const allForId = getTransactionsStrict();
    const id = nextIdForItems(allForId);
    const tx = {
      id,
      occurred_on: occurredOn,
      type: input.type,
      amount: centsToAmount(cents),
      note: trimNote(input.note, 40),
      created_at: new Date().toISOString()
    };
    if (input.type === 'expense') {
      tx.category_id = categories.normalizeCategoryId(input.category_id, true);
      tx.nature = categories.normalizeNature(input.nature, true);
      const detailTag = trimTag(input.detail_tag, 16);
      if (detailTag) tx.detail_tag = detailTag;
    }
    strictSet(key, bucket.concat(tx), `LEDGER_BUCKET_WRITE_FAILED:${month}`);
    if (!index.months.includes(month)) writeLedgerIndexStrict(index.months.concat(month));
    strictSet(KEYS.nextId, id, 'ID_STORAGE_FAILED');
    return tx;
  } catch (err) {
    snapshots.forEach(restoreStorageSnapshot);
    throw err;
  }
}

function getOpeningTransaction() {
  return getTransactions().find(item => item && item.system_kind === OPENING_KIND && item.type === 'income') || null;
}

function getOpeningTransactionStrict() {
  return getTransactionsStrict().find(item => item && item.system_kind === OPENING_KIND && item.type === 'income') || null;
}

function getOpeningBalance() {
  const tx = getOpeningTransaction();
  return tx ? Number(tx.amount || 0) : 0;
}

function getOpeningBalanceStrict() {
  const tx = getOpeningTransactionStrict();
  return tx ? Number(tx.amount || 0) : 0;
}

function setOpeningBalanceInternal(amountInput, occurredOn) {
  const raw = Number(amountInput || 0);
  const cents = toCurrencyCents(amountInput || 0);
  if (cents === null || raw < 0 || (raw > 0 && cents < 1)) throw new Error('INVALID_OPENING_BALANCE');
  const amount = centsToAmount(cents || 0);
  let items = getTransactionsStrict();
  const index = items.findIndex(item => item && item.system_kind === OPENING_KIND && item.type === 'income');

  if (amount === 0) {
    if (index >= 0) {
      items.splice(index, 1);
      saveTransactions(items);
    }
    return null;
  }

  if (index >= 0) {
    const existingDate = String(items[index].occurred_on || '');
    const suppliedDate = String(occurredOn || '');
    const preservedDate = isValidIsoDate(existingDate)
      ? existingDate
      : (isValidIsoDate(suppliedDate) ? suppliedDate : todayIso());
    items[index] = {
      ...items[index],
      type: 'income',
      amount,
      occurred_on: preservedDate,
      note: '起始自由本金',
      system_kind: OPENING_KIND,
      system_locked: true
    };
    saveTransactions(items);
    return items[index];
  }

  const openingDate = String(occurredOn || '');
  if (!isValidIsoDate(openingDate) || openingDate > todayIso()) throw new Error('INVALID_OPENING_DATE');
  const id = nextIdForItems(items);
  const tx = {
    id,
    occurred_on: openingDate,
    type: 'income',
    amount,
    note: '起始自由本金',
    system_kind: OPENING_KIND,
    system_locked: true,
    created_at: new Date().toISOString()
  };
  items.push(tx);
  saveTransactions(items);
  strictSet(KEYS.nextId, id, 'ID_STORAGE_FAILED');
  return tx;
}

function setOpeningBalance(amountInput, occurredOn) {
  const snapshots = [KEYS.transactions, KEYS.nextId].map(snapshotStorageKeyStrict);
  try { return setOpeningBalanceInternal(amountInput, occurredOn); }
  catch (err) { snapshots.forEach(restoreStorageSnapshot); throw err; }
}

function deleteTransaction(id) {
  const numericId = Number(id);
  const index = ensureLedgerBucketsStrict();
  for (let i = 0; i < index.months.length; i += 1) {
    const month = index.months[i];
    const key = bucketKey(month);
    const bucket = readBucketStrict(month);
    const pos = bucket.findIndex(item => Number(item && item.id) === numericId && !(item.system_locked || item.system_kind === OPENING_KIND));
    if (pos < 0) continue;
    const snapshots = [key, KEYS.ledgerIndex].map(snapshotStorageKeyStrict);
    try {
      bucket.splice(pos, 1);
      if (bucket.length) strictSet(key, bucket, `LEDGER_BUCKET_WRITE_FAILED:${month}`);
      else { strictRemove(key); writeLedgerIndexStrict(index.months.filter(x => x !== month)); }
      return true;
    } catch (err) {
      snapshots.forEach(restoreStorageSnapshot);
      throw err;
    }
  }
  return false;
}

function snapshotStorageKey(key) {
  try {
    const value = wx.getStorageSync(key);
    const exists = !valueMissing(value);
    return { key, exists, value };
  } catch (err) {
    return { key, exists: false, value: undefined, readFailed: true };
  }
}

function snapshotStorageKeyStrict(key) {
  let value;
  try { value = wx.getStorageSync(key); }
  catch (err) { throw new Error(`STORAGE_READ_FAILED:${key}`); }
  return { key, exists: !valueMissing(value), value };
}

function restoreStorageSnapshot(snapshot) {
  if (!snapshot) return false;
  try {
    if (snapshot.exists) wx.setStorageSync(snapshot.key, snapshot.value);
    else wx.removeStorageSync(snapshot.key);
    return true;
  } catch (err) { return false; }
}

function saveConfiguration(settings, openingBalance, occurredOn, markDone) {
  const snapshots = [KEYS.settings, KEYS.nextId, KEYS.onboarding].map(snapshotStorageKeyStrict);
  try {
    getSettingsStrict();
    getTransactionsStrict();
    // Write small metadata first. The ledger mutation is last and is independently atomic.
    saveSettings(settings);
    if (markDone) markOnboardingDone();
    setOpeningBalanceInternal(openingBalance, occurredOn);
    return true;
  } catch (err) {
    snapshots.forEach(restoreStorageSnapshot);
    throw err;
  }
}

function migrateKernelV033(today) {
  const version = strictGet(KEYS.kernelVersion, '');
  if (version === CURRENT_KERNEL_VERSION) return false;
  const settings = getSettingsStrict();
  // Ledger format migration is independently transactional. Complete it before changing model metadata.
  getTransactionsStrict();
  const snapshots = [KEYS.settings, KEYS.nextId, KEYS.kernelVersion].map(snapshotStorageKeyStrict);
  try {
    let openingAmount = 0;
    let nextSettings = settings;
    if (settings && settings.mode === 'quick') {
      const legacyAmount = Number(settings.initial_assets || 0);
      const legacyCents = toCurrencyCents(legacyAmount);
      if (legacyAmount > 0 && legacyCents !== null && legacyCents >= 1 && !getOpeningTransactionStrict()) openingAmount = legacyAmount;
      nextSettings = { ...settings, use_initial_assets: false, initial_assets: 0, expense_mode: 'manual' };
      saveSettings(nextSettings);
    }
    strictSet(KEYS.kernelVersion, CURRENT_KERNEL_VERSION, 'KERNEL_VERSION_STORAGE_FAILED');
    // Ledger mutation last. setOpeningBalanceInternal is atomic across its bucket/index/id writes.
    if (openingAmount > 0) setOpeningBalanceInternal(openingAmount, today || todayIso());
    return true;
  } catch (err) {
    snapshots.forEach(restoreStorageSnapshot);
    throw err;
  }
}

function isOnboardingDone() {
  return readWithLegacy('onboarding', false) === true;
}
function isOnboardingDoneStrict() {
  return readWithLegacyStrict('onboarding', false) === true;
}
function markOnboardingDone() {
  strictSet(KEYS.onboarding, true, 'ONBOARDING_STORAGE_FAILED');
}

function setOnboardingDone(value) {
  strictSet(KEYS.onboarding, value === true, 'ONBOARDING_STORAGE_FAILED');
  return value === true;
}

function normalizePreset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = Number(value.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const categoryId = categories.normalizeCategoryId(value.category_id, false);
  const label = trimTag(value.label, 12);
  if (!categoryId || !label) return null;
  const clean = { id, category_id: categoryId, label };
  const note = trimNote(value.note, 40);
  if (note) clean.note = note;
  const nature = categories.normalizeNature(value.nature, false);
  if (nature) clean.nature = nature;
  return clean;
}

function getExpensePresetsStrict() {
  const raw = strictGet(KEYS.presets, []);
  if (!Array.isArray(raw)) throw new Error('PRESET_STATE_INVALID');
  const seen = new Set();
  const out = [];
  raw.forEach(item => {
    const p = normalizePreset(item);
    if (!p || seen.has(p.id)) return;
    seen.add(p.id); out.push(p);
  });
  return out;
}
function getExpensePresets() { try { return getExpensePresetsStrict(); } catch (err) { return []; } }
function saveExpensePresets(itemsInput) {
  if (!Array.isArray(itemsInput)) throw new Error('PRESET_STATE_INVALID');
  const out = []; const ids = new Set(); const signatures = new Set();
  itemsInput.forEach(item => {
    const p = normalizePreset(item);
    if (!p) throw new Error('PRESET_INVALID');
    const sig = `${p.category_id}::${p.label}`;
    if (ids.has(p.id) || signatures.has(sig)) throw new Error('PRESET_DUPLICATE');
    ids.add(p.id); signatures.add(sig); out.push(p);
  });
  strictSet(KEYS.presets, out.slice(0, 100), 'PRESET_STORAGE_FAILED');
  return out;
}
function addExpensePreset(input) {
  const items = getExpensePresetsStrict();
  let id = items.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0) + 1;
  const candidate = normalizePreset({ ...input, id });
  if (!candidate) throw new Error('PRESET_INVALID');
  if (items.some(x => x.category_id === candidate.category_id && x.label === candidate.label)) throw new Error('PRESET_DUPLICATE');
  saveExpensePresets(items.concat(candidate));
  return candidate;
}
function deleteExpensePreset(idInput) {
  const id = Number(idInput);
  const items = getExpensePresetsStrict();
  const next = items.filter(x => x.id !== id);
  if (next.length === items.length) return false;
  saveExpensePresets(next); return true;
}

function backupTextByteLength(value) {
  const text = String(value || '');
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) { bytes += 4; i += 1; } else bytes += 3;
    } else bytes += 3;
    if (bytes > MAX_BACKUP_FILE_BYTES) return bytes;
  }
  return bytes;
}

function parseBackupText(rawText) {
  let text = String(rawText === undefined || rawText === null ? '' : rawText);
  if (backupTextByteLength(text) > MAX_BACKUP_FILE_BYTES) throw new Error('BACKUP_FILE_TOO_LARGE');
  text = text.replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('BACKUP_EMPTY');
  return JSON.parse(text);
}

function normalizeBackupSettings(rawSettings) {
  if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) throw new Error('BACKUP_INVALID_SETTINGS');
  const s = rawSettings;
  if (s.mode !== undefined && s.mode !== 'quick' && s.mode !== 'advanced') throw new Error('BACKUP_INVALID_SETTINGS_MODE');
  if (s.expense_mode !== undefined && s.expense_mode !== 'manual' && s.expense_mode !== 'ledger') throw new Error('BACKUP_INVALID_SETTINGS_EXPENSE_MODE');
  if (s.theme !== undefined && s.theme !== 'midnight' && s.theme !== 'paper') throw new Error('BACKUP_INVALID_SETTINGS_THEME');
  if (s.font_family !== undefined && s.font_family !== 'system' && s.font_family !== 'serif') throw new Error('BACKUP_INVALID_SETTINGS_FONT');
  if (s.font_scale !== undefined && !['compact','standard','large','85','90','95','100','105','110','115'].includes(String(s.font_scale))) throw new Error('BACKUP_INVALID_SETTINGS_FONT_SCALE');
  if (s.advanced_dormant !== undefined) {
    if (!s.advanced_dormant || typeof s.advanced_dormant !== 'object' || Array.isArray(s.advanced_dormant)) throw new Error('BACKUP_INVALID_DORMANT');
    const d = s.advanced_dormant;
    if (d.expense_mode !== undefined && d.expense_mode !== 'manual' && d.expense_mode !== 'ledger') throw new Error('BACKUP_INVALID_DORMANT');
  }
  const birth = String(s.birth_date || '');
  if (!isValidIsoDate(birth)) throw new Error('BACKUP_INVALID_BIRTH');
  const age = Number(s.target_age);
  if (!Number.isInteger(age) || age < 20 || age > 120) throw new Error('BACKUP_INVALID_TARGET_AGE');
  const normalized = require('./model').normalizeSettings(s);
  const manualCents = toCurrencyCents(normalized.manual_daily_expense || 0);
  if (manualCents === null || ((normalized.mode === 'quick' || normalized.expense_mode === 'manual') && manualCents < 1)) throw new Error('BACKUP_INVALID_SETTINGS_DAILY_COST');
  const assetCents = toCurrencyCents(normalized.initial_assets || 0);
  if (assetCents === null) throw new Error('BACKUP_INVALID_SETTINGS_ASSETS');
  return normalized;
}

function canonicalizeBackupTransactions(itemsInput) {
  const items = canonicalizeTransactionArray(itemsInput) || [];
  const used = new Set();
  let nextCandidate = Math.max(1, maxExistingId(items) + 1);
  return items.map(tx => {
    let id = Number(tx.id);
    if (!Number.isSafeInteger(id) || id <= 0 || used.has(id)) {
      while (used.has(nextCandidate) && nextCandidate < Number.MAX_SAFE_INTEGER) nextCandidate += 1;
      if (!Number.isSafeInteger(nextCandidate) || nextCandidate > Number.MAX_SAFE_INTEGER) {
        nextCandidate = 1;
        while (used.has(nextCandidate) && nextCandidate < Number.MAX_SAFE_INTEGER) nextCandidate += 1;
      }
      if (!Number.isSafeInteger(nextCandidate) || used.has(nextCandidate)) throw new Error('BACKUP_ID_SPACE_EXHAUSTED');
      id = nextCandidate++;
    }
    used.add(id);
    return { ...tx, id };
  });
}

function createBackup() {
  const rawSettings = getSettingsStrict();
  if (!rawSettings) throw new Error('BACKUP_SETTINGS_REQUIRED');
  const settings = require('./model').normalizeSettings(rawSettings);
  const transactions = canonicalizeBackupTransactions(getTransactionsStrict());
  const maxId = maxExistingId(transactions);
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    app: '财富自由指南灯',
    created_at: new Date().toISOString(),
    settings: cloneJson(settings),
    transactions: cloneJson(transactions),
    expense_presets: cloneJson(getExpensePresetsStrict()),
    onboarding_done: isOnboardingDoneStrict(),
    // Diagnostic only. Restore never lets a backup control the running kernel state.
    kernel_version: CURRENT_KERNEL_VERSION,
    next_id: maxId
  };
}

function validateBackupDocument(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BACKUP_INVALID_ROOT');
  const backupVersion = Number(input.version);
  if (input.schema !== BACKUP_SCHEMA || ![1, BACKUP_VERSION].includes(backupVersion)) throw new Error('BACKUP_UNSUPPORTED_VERSION');
  const settings = normalizeBackupSettings(input.settings);
  if (!Array.isArray(input.transactions) || input.transactions.length > 200000) throw new Error('BACKUP_INVALID_TRANSACTIONS');

  const birthRaw = settings.birth_date;
  const ids = new Set();
  let openingSeen = false;
  const transactions = input.transactions.map((tx, index) => {
    if (!tx || typeof tx !== 'object' || Array.isArray(tx)) throw new Error(`BACKUP_INVALID_TX_${index}`);
    const id = Number(tx.id);
    if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) throw new Error(`BACKUP_INVALID_ID_${index}`);
    ids.add(id);
    if (tx.type !== 'income' && tx.type !== 'expense') throw new Error(`BACKUP_INVALID_TYPE_${index}`);
    const cents = toCurrencyCents(tx.amount);
    if (cents === null || cents < 1) throw new Error(`BACKUP_INVALID_AMOUNT_${index}`);
    const occurredOn = String(tx.occurred_on || '');
    if (!isValidIsoDate(occurredOn)) throw new Error(`BACKUP_INVALID_DATE_${index}`);

    const markedOpening = tx.system_kind === OPENING_KIND;
    if (markedOpening && tx.type !== 'income') throw new Error('BACKUP_INVALID_OPENING_BALANCE');
    if (markedOpening) {
      if (openingSeen) throw new Error('BACKUP_INVALID_OPENING_BALANCE');
      openingSeen = true;
    } else if (occurredOn < birthRaw) {
      throw new Error(`BACKUP_TX_BEFORE_BIRTH_${index}`);
    }

    const clean = {
      id,
      occurred_on: occurredOn,
      type: tx.type,
      amount: centsToAmount(cents),
      note: markedOpening ? '起始自由本金' : trimNote(tx.note, 40)
    };
    if (tx.type === 'expense' && !markedOpening) {
      clean.category_id = categories.normalizeCategoryId(tx.category_id, true);
      clean.nature = categories.normalizeNature(tx.nature, true);
      const detailTag = trimTag(tx.detail_tag, 16);
      if (detailTag) clean.detail_tag = detailTag;
    }
    if (typeof tx.created_at === 'string' && tx.created_at.length <= 80) clean.created_at = tx.created_at;
    if (markedOpening) { clean.system_kind = OPENING_KIND; clean.system_locked = true; }
    return clean;
  });

  const presetsRaw = backupVersion >= 2 ? input.expense_presets : [];
  if (!Array.isArray(presetsRaw) || presetsRaw.length > 100) throw new Error('BACKUP_INVALID_PRESETS');
  const presets = []; const presetIds = new Set(); const presetSigs = new Set();
  presetsRaw.forEach((raw, index) => {
    const p = normalizePreset(raw);
    if (!p || presetIds.has(p.id)) throw new Error(`BACKUP_INVALID_PRESET_${index}`);
    const sig = `${p.category_id}::${p.label}`;
    if (presetSigs.has(sig)) throw new Error(`BACKUP_DUPLICATE_PRESET_${index}`);
    presetIds.add(p.id); presetSigs.add(sig); presets.push(p);
  });

  return {
    settings,
    transactions,
    expense_presets: presets,
    onboarding_done: input.onboarding_done === true,
    // Rebuild internal metadata from current code + actual ledger. Backup values are ignored.
    kernel_version: CURRENT_KERNEL_VERSION,
    next_id: maxExistingId(transactions)
  };
}

function importBackup(input, normalizedSettings) {
  const doc = validateBackupDocument(input);
  const settings = normalizedSettings ? require('./model').normalizeSettings(normalizedSettings) : doc.settings;
  const snapshots = [KEYS.settings, KEYS.nextId, KEYS.onboarding, KEYS.kernelVersion, KEYS.presets].map(snapshotStorageKeyStrict);
  try {
    // Metadata first; ledger last because saveTransactions has its own multi-key rollback.
    saveSettings(settings);
    saveExpensePresets(doc.expense_presets || []);
    strictSet(KEYS.nextId, maxExistingId(doc.transactions), 'BACKUP_NEXT_ID_FAILED');
    strictSet(KEYS.onboarding, doc.onboarding_done === true, 'BACKUP_ONBOARDING_FAILED');
    strictSet(KEYS.kernelVersion, CURRENT_KERNEL_VERSION, 'BACKUP_KERNEL_FAILED');
    saveTransactions(doc.transactions);
    return { transaction_count: doc.transactions.length, created_at: String(input.created_at || '') };
  } catch (err) {
    snapshots.forEach(restoreStorageSnapshot);
    throw err;
  }
}

function clearAll() {
  let bucketKeys = [];
  try {
    const index = normalizeLedgerIndex(strictGet(KEYS.ledgerIndex, undefined));
    if (index) bucketKeys = index.months.map(bucketKey);
  } catch (err) {}
  const keys = Array.from(new Set([...Object.values(KEYS), ...Object.values(LEGACY_KEYS), ...bucketKeys]));
  const snapshots = keys.map(snapshotStorageKeyStrict);
  try {
    keys.forEach(key => {
      const snap = snapshots.find(x => x.key === key);
      if (snap && snap.exists) strictRemove(key);
    });
    return true;
  } catch (err) {
    snapshots.forEach(restoreStorageSnapshot);
    return false;
  }
}

module.exports = {
  KEYS,
  LEGACY_KEYS,
  OPENING_KIND,
  CURRENT_KERNEL_VERSION,
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  MAX_BACKUP_FILE_BYTES,
  getHabitState,
  markWeeklyReportSeen,
  getSettings,
  getSettingsStrict,
  saveSettings,
  getTransactions,
  getTransactionsStrict,
  saveTransactions,
  getTransactionsInRange,
  getRecentTransactions,
  getTransactionPage,
  addTransaction,
  deleteTransaction,
  getOpeningTransaction,
  getOpeningBalance,
  getOpeningBalanceStrict,
  setOpeningBalance,
  saveConfiguration,
  migrateKernelV033,
  isOnboardingDone,
  isOnboardingDoneStrict,
  markOnboardingDone,
  setOnboardingDone,
  getExpensePresets,
  getExpensePresetsStrict,
  saveExpensePresets,
  addExpensePreset,
  deleteExpensePreset,
  createBackup,
  validateBackupDocument,
  importBackup,
  backupTextByteLength,
  parseBackupText,
  clearAll,
  toCurrencyCents,
  isValidIsoDate,
  trimNote,
  trimTag,
  monthFromIso,
  bucketKey,
  ensureLedgerBucketsStrict,
  snapshotStorageKey,
  restoreStorageSnapshot
};
