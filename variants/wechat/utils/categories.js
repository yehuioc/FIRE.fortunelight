const CATEGORIES = [
  { id: 'meal', name: '正餐' },
  { id: 'snack_drink', name: '饮料/零食' },
  { id: 'household', name: '生活用品' },
  { id: 'transport', name: '交通' },
  { id: 'study_work', name: '学习/工作' },
  { id: 'entertainment', name: '娱乐' },
  { id: 'health', name: '医疗健康' },
  { id: 'housing_comms', name: '住宿/通信' },
  { id: 'other', name: '其他' },
  { id: 'uncategorized', name: '未分类', legacy: true }
];

const NATURES = [
  { id: 'necessary', name: '必要' },
  { id: 'adjustable', name: '可调' },
  { id: 'avoidable', name: '可省' },
  { id: 'unset', name: '未设定', legacy: true }
];

const CATEGORY_MAP = Object.create(null);
CATEGORIES.forEach(item => { CATEGORY_MAP[item.id] = item; });
const NATURE_MAP = Object.create(null);
NATURES.forEach(item => { NATURE_MAP[item.id] = item; });

function normalizeCategoryId(value, allowLegacy) {
  const id = String(value || '');
  if (!CATEGORY_MAP[id]) return allowLegacy === false ? '' : 'uncategorized';
  if (CATEGORY_MAP[id].legacy && allowLegacy === false) return '';
  return id;
}

function normalizeNature(value, allowLegacy) {
  const id = String(value || '');
  if (!NATURE_MAP[id]) return allowLegacy === false ? '' : 'unset';
  if (NATURE_MAP[id].legacy && allowLegacy === false) return '';
  return id;
}

function categoryName(id) {
  const item = CATEGORY_MAP[normalizeCategoryId(id, true)];
  return item ? item.name : '未分类';
}

function natureName(id) {
  const item = NATURE_MAP[normalizeNature(id, true)];
  return item ? item.name : '未设定';
}

function publicCategories() { return CATEGORIES.filter(item => !item.legacy).map(item => ({ ...item })); }
function publicNatures() { return NATURES.filter(item => !item.legacy).map(item => ({ ...item })); }

module.exports = {
  CATEGORIES,
  NATURES,
  publicCategories,
  publicNatures,
  normalizeCategoryId,
  normalizeNature,
  categoryName,
  natureName
};
