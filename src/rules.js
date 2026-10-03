export const DEFAULT_RULES = Object.freeze({
  version: 1, name: '家庭麻将', base: 1,
  allowChi: true, allowPeng: true, allowGang: true,
  sevenPairs: true, quadAsPairs: true, pureSuit: true, scattered: true,
  specialMultiplier: 2, stackSpecial: true, cap: null,
  dealerMultiplier: 2, discardMultiplier: 2, otherDiscardPay: 1,
  selfDrawMultiplier: 2, kongPayment: 2,
  robKong: 'unknown', multiRon: 'unknown', passWin: 'unknown',
});
export function normalizeRules(input = {}) {
  const result = { ...DEFAULT_RULES };
  const booleans = ['allowChi', 'allowPeng', 'allowGang', 'sevenPairs', 'quadAsPairs', 'pureSuit', 'scattered', 'stackSpecial'];
  const positives = ['base', 'specialMultiplier', 'dealerMultiplier', 'discardMultiplier', 'selfDrawMultiplier'];
  const nonnegatives = ['otherDiscardPay', 'kongPayment'];
  for (const key of booleans) {
    if (key in input && typeof input[key] !== 'boolean') throw new Error('规则开关格式不正确');
    if (key in input) result[key] = input[key];
  }
  for (const key of [...positives, ...nonnegatives]) {
    if (!(key in input)) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < (positives.includes(key) ? 0.01 : 0) || value > 10000) throw new Error('规则数值应在允许范围内');
    result[key] = value;
  }
  if (input.cap != null && input.cap !== '') {
    const cap = Number(input.cap);
    if (!Number.isFinite(cap) || cap < 1 || cap > 10000) throw new Error('封顶倍率应为1至10000，或不封顶');
    result.cap = cap;
  }
  return result;
}
export function specialFactor(patterns, rules) {
  const specials = [...new Set(patterns)].filter((p) => ['小七对', '清一色', '十三烂'].includes(p));
  return specials.length ? rules.specialMultiplier ** (rules.stackSpecial ? specials.length : 1) : 1;
}
export function winPayments({ winner, from = null, dealer, patterns = [], rules = DEFAULT_RULES }) {
  if (![winner, dealer].every((seat) => Number.isInteger(seat) && seat >= 0 && seat < 4)
      || (from !== null && (!Number.isInteger(from) || from < 0 || from > 3 || from === winner))) throw new Error('结算玩家无效');
  const delta = [0, 0, 0, 0];
  const details = [];
  for (let payer = 0; payer < 4; payer++) {
    if (payer === winner) continue;
    const method = from === null ? rules.selfDrawMultiplier : payer === from ? rules.discardMultiplier : rules.otherDiscardPay;
    const dealerFactor = winner === dealer || payer === dealer ? rules.dealerMultiplier : 1;
    let multiplier = method * dealerFactor * specialFactor(patterns, rules);
    if (rules.cap !== null) multiplier = Math.min(multiplier, rules.cap);
    const amount = Math.round(rules.base * multiplier * 100) / 100;
    delta[payer] -= amount;
    delta[winner] += amount;
    details.push({ payer, receiver: winner, amount });
  }
  return { delta: delta.map((n) => Math.round(n * 100) / 100), details };
}
export function kongPayments(actor, rules = DEFAULT_RULES) {
  if (!Number.isInteger(actor) || actor < 0 || actor > 3) throw new Error('开杠玩家无效');
  const amount = Math.round(rules.base * rules.kongPayment * 100) / 100;
  return { delta: Array.from({ length: 4 }, (_, seat) => seat === actor ? amount * 3 : -amount),
    details: Array.from({ length: 4 }, (_, payer) => payer).filter((p) => p !== actor).map((payer) => ({ payer, receiver: actor, amount })) };
}
