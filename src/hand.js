import Majiang from '@kobalab/majiang-core';
import { countsOf, toCoreTile, isTile } from './tiles.js';
import { DEFAULT_RULES } from './rules.js';

const cache = new Map();
// Only the ordinary-hand shanten calculator is reused. Riichi scoring,
// furiten, kokushi and mandatory-yaku restrictions are intentionally excluded.
export function standardShanten(hand, melds = []) {
  const shoupai = new Majiang.Shoupai(hand.map(toCoreTile));
  // Isolated adapter to majiang-core 1.4.1; xiangting_yiban reads meld count.
  shoupai._fulou = melds.map((meld) => meld.kind);
  return Majiang.Util.xiangting_yiban(shoupai);
}
export function sevenPairsShanten(hand, quadAsPairs = true) {
  const counts = countsOf(hand);
  const pairs = counts.reduce((sum, n) => sum + (quadAsPairs ? Math.floor(n / 2) : Number(n >= 2)), 0);
  const singles = counts.reduce((sum, n) => sum + Number(quadAsPairs ? n % 2 === 1 : n === 1), 0);
  return 13 - pairs * 2 - Math.min(singles, 7 - pairs);
}
export function scatteredShanten(hand) {
  const counts = countsOf(hand);
  let kept = counts.slice(27).filter((n) => n > 0).length;
  for (let suit = 0; suit < 3; suit++) {
    // Weighted independent set on a nine-rank path; permitted differences >= 3.
    const dp = Array(10).fill(0);
    for (let rank = 1; rank <= 9; rank++) {
      dp[rank] = Math.max(dp[rank - 1], (counts[suit * 9 + rank - 1] > 0 ? 1 : 0) + dp[Math.max(0, rank - 3)]);
    }
    kept += dp[9];
  }
  return 13 - kept;
}
export function shanten(hand, melds = [], rules = DEFAULT_RULES) {
  const counts = countsOf(hand);
  const key = counts.join('') + ':' + melds.length + ':' + Number(rules.sevenPairs) + Number(rules.quadAsPairs) + Number(rules.scattered);
  if (cache.has(key)) return cache.get(key);
  const normal = standardShanten(hand, melds);
  const pairs = !melds.length && rules.sevenPairs ? sevenPairsShanten(hand, rules.quadAsPairs) : Infinity;
  const scattered = !melds.length && rules.scattered ? scatteredShanten(hand) : Infinity;
  const value = Math.min(normal, pairs, scattered);
  if (cache.size > 40000) cache.clear();
  cache.set(key, value);
  return value;
}
export function winInfo(hand, melds = [], rules = DEFAULT_RULES) {
  if (hand.length !== 14 - melds.length * 3 || !hand.every(isTile)) return { win: false, patterns: [] };
  const all = [...hand, ...melds.flatMap((meld) => meld.tiles.filter(isTile))];
  if (countsOf(all).some((count) => count > 4)) return { win: false, patterns: [] };
  const standard = standardShanten(hand, melds) === -1;
  const pairs = !melds.length && rules.sevenPairs && sevenPairsShanten(hand, rules.quadAsPairs) === -1;
  const scattered = !melds.length && rules.scattered && scatteredShanten(hand) === -1;
  if (!standard && !pairs && !scattered) return { win: false, patterns: [] };
  const patterns = [];
  if (pairs) patterns.push('小七对');
  if (scattered) patterns.push('十三烂');
  if (!patterns.length) patterns.push('普通胡');
  if (rules.pureSuit && all.length && all.every((tile) => tile < 27 && Math.floor(tile / 9) === Math.floor(all[0] / 9))) patterns.push('清一色');
  return { win: true, patterns };
}
export function improvements(hand, melds, visible, rules = DEFAULT_RULES) {
  const current = shanten(hand, melds, rules);
  const tiles = [];
  for (let tile = 0; tile < 34; tile++) {
    const left = Math.max(0, 4 - visible[tile]);
    if (!left) continue;
    if (shanten([...hand, tile], melds, rules) < current) tiles.push({ tile, count: left });
  }
  return { shanten: current, tiles, count: tiles.reduce((sum, t) => sum + t.count, 0) };
}
export function clearHandCache() { cache.clear(); }
