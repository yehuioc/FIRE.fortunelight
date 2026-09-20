function commas(numberText) {
  const parts = String(numberText).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function money(value) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const text = abs >= 1000 ? String(Math.round(n)) : (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return `¥${commas(text)}`;
}

function integer(value) {
  return commas(String(Math.round(Number(value || 0))));
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

module.exports = { money, integer, percent };
