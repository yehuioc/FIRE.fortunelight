const DEFAULT_ORDER = ['overview', 'grid', 'habit', 'record'];
const MODULES = {
  overview: { id: 'overview', name: '自由概览', desc: '自由天数、当前模式与当前解读' },
  grid: { id: 'grid', name: '人生方格', desc: '查看已经点亮与尚未点亮的自由时间' },
  habit: { id: 'habit', name: '记录中心', desc: '记录天数、连续性、覆盖率与活动格' },
  record: { id: 'record', name: '记一笔真实的账', desc: '最快进入收入 / 消耗登记' }
};

function normalizeOrder(input) {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set();
  const result = [];
  raw.forEach(id => {
    const key = String(id || '');
    if (!MODULES[key] || seen.has(key)) return;
    seen.add(key);
    result.push(key);
  });
  DEFAULT_ORDER.forEach(id => {
    if (!seen.has(id)) result.push(id);
  });
  return result;
}

function describeOrder(input) {
  return normalizeOrder(input).map((id, index) => ({ ...MODULES[id], index }));
}

function move(input, id, delta) {
  const order = normalizeOrder(input);
  const index = order.indexOf(id);
  if (index < 0) return order;
  const nextIndex = Math.max(0, Math.min(order.length - 1, index + Number(delta || 0)));
  if (nextIndex === index) return order;
  const next = order.slice();
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

module.exports = { DEFAULT_ORDER, MODULES, normalizeOrder, describeOrder, move };
