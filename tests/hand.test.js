import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHand, countsOf } from '../src/tiles.js';
import { standardShanten, winInfo, shanten, improvements } from '../src/hand.js';
import { DEFAULT_RULES as rules } from '../src/rules.js';

// Independent complete-hand oracle. It does not use majiang-core or shanten.
function ordinaryOracle(hand, groups = 4) {
  const counts = countsOf(hand);
  if (hand.length !== groups * 3 + 2 || counts.some((n) => n > 4)) return false;
  function sets(left) {
    if (left === 0) return counts.every((n) => n === 0);
    const tile = counts.findIndex((n) => n > 0);
    if (tile < 0) return false;
    if (counts[tile] >= 3) {
      counts[tile] -= 3; const ok = sets(left - 1); counts[tile] += 3; if (ok) return true;
    }
    if (tile < 27 && tile % 9 <= 6 && counts[tile + 1] && counts[tile + 2]) {
      counts[tile]--; counts[tile + 1]--; counts[tile + 2]--;
      const ok = sets(left - 1);
      counts[tile]++; counts[tile + 1]++; counts[tile + 2]++; if (ok) return true;
    }
    return false;
  }
  for (let pair = 0; pair < 34; pair++) if (counts[pair] >= 2) {
    counts[pair] -= 2; const ok = sets(groups); counts[pair] += 2; if (ok) return true;
  }
  return false;
}
function random(seed = 541) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }; }

test('普通胡判定与独立拆牌器对照：随机手牌和构造完成牌，含副露', () => {
  const rng = random(); let checked = 0;
  for (let iteration = 0; iteration < 2400; iteration++) {
    const open = iteration % 5, hand = [];
    const melds = Array.from({ length: open }, () => ({ kind: 'chi', tiles: [] }));
    if (iteration % 2) {
      const pair = Math.floor(rng() * 34); hand.push(pair, pair);
      for (let g = open; g < 4; g++) {
        if (rng() < 0.5) { const t = Math.floor(rng() * 34); hand.push(t, t, t); }
        else { const t = Math.floor(rng() * 3) * 9 + Math.floor(rng() * 7); hand.push(t, t + 1, t + 2); }
      }
      if (countsOf(hand).some((n) => n > 4)) continue;
    } else {
      while (hand.length < 14 - open * 3) { const tile = Math.floor(rng() * 34); if (hand.filter((t) => t === tile).length < 4) hand.push(tile); }
    }
    assert.equal(standardShanten(hand, melds) === -1, ordinaryOracle(hand, 4 - open), JSON.stringify({ hand, open }));
    checked++;
  }
  assert.ok(checked > 2100);
});
test('普通胡不要求日麻役；字牌不能成顺子；十三幺未擅自启用', () => {
  assert.equal(winInfo(parseHand('m123p234s345678z11')).win, true);
  assert.equal(winInfo(parseHand('m123p234s345z12311'), [], { ...rules, scattered: false }).win, false);
  assert.equal(winInfo(parseHand('m119p19s19z1234567')).win, false);
});
test('小七对四张计两对，关闭开关和副露后正确禁用', () => {
  const hand = parseHand('m111122p3344s5566');
  assert.deepEqual(winInfo(hand).patterns, ['小七对']);
  assert.equal(winInfo(hand, [], { ...rules, quadAsPairs: false }).win, false);
  assert.equal(winInfo(hand, [], { ...rules, sevenPairs: false }).win, false);
  assert.equal(winInfo(hand, [{ kind: 'peng', tiles: [27, 27, 27] }]).win, false);
});
test('十三烂：14张、间隔至少3、不重复；147不是唯一允许组合', () => {
  for (const text of ['m147p258s369z12345', 'm148p269s37z123456']) {
    const hand = parseHand(text); assert.equal(hand.length, 14);
    assert.deepEqual(winInfo(hand).patterns, ['十三烂']);
    assert.equal(winInfo(hand, [], { ...rules, scattered: false }).win, false);
  }
  assert.equal(winInfo(parseHand('m137p258s369z12345')).win, false);
  assert.equal(winInfo(parseHand('m147p258s369z11234')).win, false);
  assert.equal(winInfo(parseHand('m147p258s369z1234')).win, false);
});
test('清一色先成胡，再叠加奖励；支持副露普通胡', () => {
  assert.deepEqual(winInfo(parseHand('m11223344556677')).patterns, ['小七对', '清一色']);
  assert.equal(winInfo(parseHand('m11112345678999')).win, true);
  assert.equal(winInfo(parseHand('m11234566778899'), [], { ...rules, sevenPairs: false }).win, false);
  const melds = [{ kind: 'chi', tiles: [0, 1, 2] }];
  assert.deepEqual(winInfo(parseHand('m44456788999'), melds).patterns, ['普通胡', '清一色']);
});
test('有效牌排除已见四张；从可见数量而非假定牌墙计算', () => {
  const hand = parseHand('m123467p234s456z1');
  const visible = countsOf(hand); visible[4] = 4;
  assert.equal(shanten(hand), 1);
  const result = improvements(hand, [], visible);
  assert.ok(!result.tiles.some((t) => t.tile === 4));
  assert.equal(result.count, result.tiles.reduce((sum, t) => sum + t.count, 0));
});
