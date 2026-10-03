import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES as rules, winPayments, kongPayments, normalizeRules } from '../src/rules.js';

test('用户确认：闲家点炮、庄家旁观的收付为2/2/1', () => {
  assert.deepEqual(winPayments({ winner: 1, from: 0, dealer: 2 }).delta, [-2, 5, -2, -1]);
});
test('用户确认：庄家自摸小七对，每家8；清七对再翻倍', () => {
  assert.deepEqual(winPayments({ winner: 0, dealer: 0, patterns: ['小七对'] }).delta, [24, -8, -8, -8]);
  assert.deepEqual(winPayments({ winner: 0, dealer: 0, patterns: ['小七对', '清一色'] }).delta, [48, -16, -16, -16]);
});
test('杠牌乘底分，独立于所有胡牌与庄家倍率', () => {
  assert.deepEqual(kongPayments(1).delta, [-2, 6, -2, -2]);
  assert.deepEqual(kongPayments(1, { ...rules, base: 3, dealerMultiplier: 9, specialMultiplier: 99, cap: 1 }).delta, [-6, 18, -6, -6]);
});
test('所有赢家/庄家/支付来源的结算守恒；底分等比例变化', () => {
  for (let winner = 0; winner < 4; winner++) for (let dealer = 0; dealer < 4; dealer++) {
    for (const from of [null, 0, 1, 2, 3].filter((s) => s !== winner)) {
      const input = { winner, dealer, from, patterns: ['小七对', '清一色'] };
      const one = winPayments(input).delta, three = winPayments({ ...input, rules: { ...rules, base: 3 } }).delta;
      assert.equal(one.reduce((s, n) => s + n, 0), 0);
      assert.deepEqual(three, one.map((n) => n * 3));
    }
  }
});
test('配置影响结算；不接受畸形或未知规则覆盖', () => {
  const configured = normalizeRules({ base: 2, stackSpecial: false, cap: 3, robKong: true });
  assert.equal(configured.robKong, 'unknown');
  assert.deepEqual(winPayments({ winner: 0, dealer: 0, patterns: ['小七对', '清一色'], rules: configured }).delta, [18, -6, -6, -6]);
  assert.throws(() => normalizeRules({ base: -1 }));
  assert.throws(() => normalizeRules({ base: Infinity }));
  assert.throws(() => normalizeRules({ allowChi: 'true' }));
});
