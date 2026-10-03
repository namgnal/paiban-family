import test from 'node:test';
import assert from 'node:assert/strict';
import { advise } from '../src/advisor.js';
import { startGame, applyEvent } from '../src/game.js';
import { parseHand } from '../src/tiles.js';
import { demoRecord } from '../src/demo.js';

test('建议不修改牌局；每个操作均可合法执行；结果可重复', () => {
  const state = startGame(demoRecord().initial), original = structuredClone(state);
  const one = advise(state), two = advise(state);
  assert.deepEqual(one.candidates, two.candidates); assert.deepEqual(state, original);
  assert.ok(one.candidates.length >= 10);
  for (const candidate of one.candidates) assert.doesNotThrow(() => applyEvent(state, candidate.event));
  assert.equal(one.candidates[0].shanten, 0);
});
test('底分只改变显示积分，不改变等比例规则的操作排序', () => {
  const initial = { hand: parseHand('m111123p234s456z11'), dealer: 0 };
  const one = advise(startGame({ ...initial, rules: { base: 1 } }));
  const five = advise(startGame({ ...initial, rules: { base: 5 } }));
  assert.deepEqual(one.candidates.map((c) => c.event), five.candidates.map((c) => c.event));
  assert.equal(five.candidates.find((c) => c.action === 'kong').points, 30);
});
test('吃碰策略包括不响应和后续弃牌；禁用吃碰会移除候选', () => {
  const initial = { hand: parseHand('m23456p234s456z11'), dealer: 3 };
  for (const enabled of [true, false]) {
    let state = startGame({ ...initial, rules: { allowChi: enabled, allowPeng: enabled, allowGang: enabled } });
    state = applyEvent(state, { type: 'discard', actor: 3, tile: 0 });
    const advice = advise(state);
    assert.equal(advice.candidates.some((c) => c.action === 'claim'), enabled);
    assert.ok(advice.candidates.some((c) => c.action === 'pass'));
    for (const c of advice.candidates) assert.doesNotThrow(() => applyEvent(state, c.event));
  }
});
test('默认收下合法胡牌，展示规则积分而非伪造胜率', () => {
  const state = startGame({ hand: parseHand('m112233p4455s6677'), dealer: 0 });
  const best = advise(state).candidates[0];
  assert.equal(best.action, 'win'); assert.equal(best.points, 24);
  assert.equal(best.winProbability, undefined); assert.equal(best.expectedValue, undefined);
});
test('不能只按结构距离保留已经绝张的死听', () => {
  const state = startGame(demoRecord().initial);
  state.players[1].discards = [4, 4, 4, 4, 7, 7, 7, 7].map((tile) => ({ tile, claimedBy: null }));
  state.wall -= 8;
  const result = advise(state);
  assert.ok(result.candidates[0].count > 0);
  assert.ok(result.candidates.find((c) => c.tile === 0).count === 0);
});
