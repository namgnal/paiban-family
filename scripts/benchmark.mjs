import { performance } from 'node:perf_hooks';
import { advise } from '../src/advisor.js';
import { startGame } from '../src/game.js';
import { parseHand } from '../src/tiles.js';
import { clearHandCache } from '../src/hand.js';

const cases = [
  ['示例听牌选择', 'm123467p234s456z11'],
  ['开局分散牌', 'm1479p258s136z1256'],
  ['暗杠与保留四张', 'm111123p234s456z11'],
  ['七对倾向', 'm11225p3349s667z12'],
  ['单花色密集', 'm11122345678899'],
];
const results = [];
for (const [name, text] of cases) {
  const state = startGame({ hand: parseHand(text), dealer: 0 });
  clearHandCache();
  const start = performance.now(), quick = advise(state, { refined: false });
  const quickMs = performance.now() - start;
  const refinedStart = performance.now(), final = advise(state);
  results.push({ name, quickMs: +quickMs.toFixed(1), refinedMs: +(performance.now() - refinedStart).toFixed(1), recommendation: final.candidates[0]?.label, candidates: quick.candidates.length });
}
console.table(results);
console.log('以上为当前电脑 Node 算法计时，不含浏览器 Worker 启动，不代表安卓实机速度或策略强度。');
