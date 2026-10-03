import test from 'node:test';
import assert from 'node:assert/strict';
import { startGame, applyEvent, replay, visibleCounts, claimOptions, ownKongOptions, expectedInput } from '../src/game.js';
import { parseHand } from '../src/tiles.js';
import { validateRecord, saveRecord, loadRecord } from '../src/storage.js';
const initial = (text, dealer = 0, rules = undefined) => ({ hand: parseHand(text), dealer, rules });

test('起手数、四张限制、自己只能打实际持有的牌，失败无副作用', () => {
  assert.throws(() => startGame(initial('m123p123s123z1234')));
  assert.throws(() => startGame(initial('m11111p123s123z123')));
  const state = startGame(initial('m123467p234s456z11'));
  const snapshot = structuredClone(state);
  assert.throws(() => applyEvent(state, { type: 'discard', actor: 0, tile: 33 }));
  assert.throws(() => applyEvent(state, { type: 'discard', actor: 2, tile: 33 }));
  assert.deepEqual(state, snapshot);
});
test('普通轮转自动记他家摸牌，自己摸牌显式记录；重放还原', () => {
  const start = initial('m123467p234s456z11');
  const events = [0, 1, 2, 3].map((actor) => ({ type: 'discard', actor, tile: actor === 0 ? 0 : 27 + actor }));
  const beforeDraw = replay(start, events);
  assert.equal(beforeDraw.wall, 80);
  assert.deepEqual(expectedInput(beforeDraw), { kind: 'draw', actor: 0 });
  const next = applyEvent(beforeDraw, { type: 'draw', actor: 0, tile: 4 });
  assert.equal(next.wall, 79); assert.equal(next.hand.length, 14);
  assert.deepEqual(next, replay(start, [...events, { type: 'draw', actor: 0, tile: 4 }]));
  assert.deepEqual(replay(start, events.slice(0, 1)).players.map((p) => p.discards.length), [1, 0, 0, 0]);
});
test('只吃上家；吃碰改变轮次，可见弃牌不重复累计', () => {
  let state = startGame(initial('m23456p234s456z11', 3));
  state = applyEvent(state, { type: 'discard', actor: 3, tile: 0 });
  const option = claimOptions(state).find((o) => o.kind === 'chi');
  assert.deepEqual(option.tiles, [0, 1, 2]);
  const after = applyEvent(state, { type: 'claim', actor: 0, kind: 'chi', tiles: option.tiles });
  assert.equal(after.turn, 0); assert.equal(after.hand.length, 11);
  assert.equal(visibleCounts(after)[0], 1); assert.equal(after.players[3].discards[0].claimedBy, 0);
  assert.ok(!claimOptions(state, 2).some((o) => o.kind === 'chi'));
  assert.throws(() => applyEvent(state, { type: 'claim', actor: 2, kind: 'chi', tiles: [0, 1, 2] }));
});
test('他家碰牌跳过中间轮次，原弃牌在牌河中留标记', () => {
  let state = startGame(initial('m123467p234s456z11'));
  state = applyEvent(state, { type: 'discard', actor: 0, tile: 0 });
  state = applyEvent(state, { type: 'claim', actor: 2, kind: 'peng', tiles: [0, 0, 0] });
  assert.equal(state.turn, 2); assert.equal(state.wall, 83);
  assert.equal(visibleCounts(state)[0], 3);
  state = applyEvent(state, { type: 'discard', actor: 2, tile: 33 });
  assert.equal(state.wall, 83);
  assert.deepEqual(expectedInput(state), { actor: 3, kind: 'discard' });
});
test('暗杠立即记账、补牌、撤销恢复全部状态', () => {
  const start = initial('m111123p234s456z11');
  let state = startGame(start);
  const kong = ownKongOptions(state)[0]; assert.equal(kong.tile, 0);
  state = applyEvent(state, kong);
  assert.deepEqual(state.scores, [6, -2, -2, -2]);
  assert.equal(state.hand.length, 10); assert.equal(state.phase, 'draw'); assert.equal(state.wall, 83);
  state = applyEvent(state, { type: 'draw', tile: 4, actor: 0 });
  assert.equal(state.hand.length, 11); assert.equal(state.wall, 82);
  assert.equal(visibleCounts(state)[0], 4);
  assert.deepEqual(replay(start, []), startGame(start));
});
test('明杠与补杠不重算三张旧牌，计分随底分缩放', () => {
  let state = startGame(initial('m11123p234s456z11', 3, { base: 2 }));
  state = applyEvent(state, { type: 'discard', actor: 3, tile: 0 });
  state = applyEvent(state, { type: 'claim', actor: 0, kind: 'minggang', tiles: [0, 0, 0, 0] });
  assert.equal(visibleCounts(state)[0], 4); assert.deepEqual(state.scores, [12, -4, -4, -4]);
  let other = startGame(initial('m123467p234s456z11'));
  other = applyEvent(other, { type: 'discard', actor: 0, tile: 0 });
  other = applyEvent(other, { type: 'claim', actor: 1, kind: 'peng', tiles: [0, 0, 0] });
  other = applyEvent(other, { type: 'kong', actor: 1, kind: 'bugang', meldIndex: 0, tile: 0 });
  assert.equal(visibleCounts(other)[0], 4); assert.equal(other.players[1].melds.length, 1);
  assert.deepEqual(other.scores, [-2, 6, -2, -2]);
});
test('他家暗杠可保持未知；不能用已见牌充当未知事实', () => {
  let state = startGame(initial('m123467p234s456z11'));
  state = applyEvent(state, { type: 'discard', actor: 0, tile: 0 });
  state = applyEvent(state, { type: 'kong', actor: 1, kind: 'angang', tile: null });
  assert.deepEqual(state.players[1].melds[0].tiles, [null, null, null, null]);
  assert.equal(state.wall, 82); assert.equal(state.players[1].concealedCount, 10);
  assert.deepEqual(state.scores, [-2, 6, -2, -2]);
});
test('胡牌结算只算一次；自己须实牌成胡；他家特殊结构须相容', () => {
  let state = startGame(initial('m112233p4455s6677'));
  state = applyEvent(state, { type: 'win', actor: 0, method: 'self' });
  assert.deepEqual(state.scores, [24, -8, -8, -8]);
  assert.equal(state.phase, 'ended');
  assert.throws(() => applyEvent(state, { type: 'win', actor: 0, method: 'self' }));
  const incomplete = startGame(initial('m123467p234s456z11'));
  assert.throws(() => applyEvent(incomplete, { type: 'win', actor: 0, method: 'self' }));
  const pending = applyEvent(incomplete, { type: 'discard', actor: 0, tile: 0 });
  assert.throws(() => applyEvent(pending, { type: 'win', actor: 1, method: 'ron', patterns: ['小七对', '十三烂'] }));
});
test('导入/保存按事件重放，拒绝非法局面和未来版本', () => {
  const record = { format: 'paiban-v1', initial: initial('m123467p234s456z11'), events: [{ type: 'discard', actor: 0, tile: 0 }] };
  const store = new Map(); const storage = { getItem: (key) => store.get(key), setItem: (key, value) => store.set(key, value) };
  saveRecord(record, storage); assert.equal(loadRecord(storage).state.phase, 'response');
  assert.throws(() => validateRecord({ ...record, format: 'paiban-v99' }));
  assert.throws(() => validateRecord({ ...record, events: [{ type: 'discard', actor: 0, tile: 33 }] }));
});
