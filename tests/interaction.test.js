import test from 'node:test';
import assert from 'node:assert/strict';
import { operationEvents } from '../src/operations.js';
import { createDoubleTap } from '../src/double-tap.js';
import { startGame, applyEvent, replay, visibleCounts } from '../src/game.js';
import { parseHand } from '../src/tiles.js';

const initial = (hand = 'm123467p234s456z11', dealer = 0, rules) => ({ hand: parseHand(hand), dealer, rules });

test('按操作选人：吃限下一个座位，碰不能选出牌者或暴露第五张牌', () => {
  const start = startGame(initial());
  const state = applyEvent(start, { type: 'discard', actor: 0, tile: 0 });
  assert.equal(operationEvents(state, 'chi', 1).length, 1);
  for (const actor of [0, 2, 3]) assert.equal(operationEvents(state, 'chi', actor).length, 0);
  assert.equal(operationEvents(state, 'peng', 0).length, 0);
  for (const actor of [1, 2, 3]) assert.equal(operationEvents(state, 'peng', actor).length, 1);
  const limited = applyEvent(startGame(initial('m11123p234s456z111')), { type: 'discard', actor: 0, tile: 0 });
  assert.equal(operationEvents(limited, 'peng', 1).length, 0);
  const disabled = applyEvent(startGame(initial(undefined, 0, { allowChi: false, allowPeng: false, allowGang: false })), { type: 'discard', actor: 0, tile: 0 });
  for (const operation of ['chi', 'peng', 'gang']) for (let actor = 0; actor < 4; actor++) assert.deepEqual(operationEvents(disabled, operation, actor), []);
});

test('杠入口区分响应明杠、当轮暗杠和补杠，并保持原局面', () => {
  const state = applyEvent(startGame(initial()), { type: 'discard', actor: 0, tile: 0 });
  const snapshot = structuredClone(state);
  const next = operationEvents(state, 'gang', 1);
  assert.ok(next.some((event) => event.kind === 'minggang'));
  assert.ok(next.some((event) => event.kind === 'angang' && event.tile === null));
  assert.ok(!next.some((event) => event.kind === 'angang' && event.tile === 0));
  assert.deepEqual(operationEvents(state, 'gang', 2).map((event) => event.kind), ['minggang']);
  const peng = applyEvent(state, operationEvents(state, 'peng', 1)[0]);
  assert.ok(operationEvents(peng, 'gang', 1).some((event) => event.kind === 'bugang' && event.tile === 0));
  assert.deepEqual(state, snapshot);
  const own = startGame(initial('m111123p234s456z11'));
  assert.deepEqual(operationEvents(own, 'gang', 0), [{ type: 'kong', actor: 0, kind: 'angang', tile: 0 }]);
});

test('胡入口区分点炮与随后自摸，自己先验证实牌成胡', () => {
  const state = applyEvent(startGame(initial()), { type: 'discard', actor: 0, tile: 0 });
  assert.deepEqual(operationEvents(state, 'hu', 0), []);
  assert.deepEqual(operationEvents(state, 'hu', 1).map((event) => event.method), ['ron', 'self']);
  assert.deepEqual(operationEvents(state, 'hu', 2).map((event) => event.method), ['ron']);
  assert.deepEqual(operationEvents(startGame(initial()), 'hu', 0), []);
  const own = startGame(initial('m112233p4455s6677'));
  assert.deepEqual(operationEvents(own, 'hu', 0), [{ type: 'win', actor: 0, method: 'self' }]);
  const ended = applyEvent(own, operationEvents(own, 'hu', 0)[0]);
  for (const operation of ['chi', 'peng', 'gang', 'hu']) assert.deepEqual(operationEvents(ended, operation, 0), []);
});

test('最后一张弃牌仍可胡，不能再摸牌自摸或明暗杠', () => {
  let state = startGame(initial());
  // Construct a reachable late wall by repeatedly discarding legal unseen tiles.
  while (state.wall > 0 || state.phase === 'discard') {
    if (state.phase === 'response') state = applyEvent(state, { type: 'pass' });
    if (state.phase === 'exhausted') break;
    const actor = state.turn;
    const unseen = visibleCounts(state).findIndex((count) => count < 4);
    if (actor === 0 && state.phase === 'draw') state = applyEvent(state, { type: 'draw', actor, tile: unseen });
    state = applyEvent(state, { type: 'discard', actor, tile: actor === 0 ? state.hand[0] : unseen });
  }
  assert.equal(state.wall, 0); assert.equal(state.phase, 'response');
  for (let actor = 0; actor < 4; actor++) {
    assert.deepEqual(operationEvents(state, 'gang', actor), []);
    assert.ok(operationEvents(state, 'hu', actor).every((event) => event.method === 'ron'));
  }
  const other = [1, 2, 3].find((actor) => actor !== state.pending.actor);
  assert.equal(operationEvents(state, 'hu', other).length, 1);
});

test('未见计数：自己的弃牌不重复扣，别人碰补杠逐张扣，撤销和未知暗杠不造牌', () => {
  const start = initial();
  const before = visibleCounts(startGame(start));
  const discard = { type: 'discard', actor: 0, tile: 0 };
  const peng = { type: 'claim', actor: 1, kind: 'peng', tiles: [0, 0, 0] };
  const kong = { type: 'kong', actor: 1, kind: 'bugang', meldIndex: 0, tile: 0 };
  assert.deepEqual(visibleCounts(replay(start, [discard])), before);
  assert.equal(4 - visibleCounts(replay(start, [discard, peng]))[0], 1);
  assert.equal(4 - visibleCounts(replay(start, [discard, peng, kong]))[0], 0);
  assert.equal(4 - visibleCounts(replay(start, [discard, peng]))[0], 1);
  assert.deepEqual(visibleCounts(replay(start, [discard, { type: 'kong', actor: 1, kind: 'angang', tile: null }])), before);
  const drawn = replay(start, [discard, ...[1, 2, 3].map((actor) => ({ type: 'discard', actor, tile: 27 + actor })), { type: 'draw', actor: 0, tile: 4 }]);
  assert.equal(4 - visibleCounts(drawn)[4], 3);
  for (const tile of [28, 29, 30]) assert.equal(4 - visibleCounts(drawn)[tile], 3);
});

test('建议牌单击不确认，450ms内连续两次才确认一次，慢速点击不出牌', () => {
  const gesture = createDoubleTap();
  assert.equal(gesture.tap('round1:tile0', 100), false);
  assert.equal(gesture.tap('round1:tile0', 300), true);
  assert.equal(gesture.tap('round1:tile0', 350), false);
  assert.equal(gesture.tap('round1:tile0', 801), false);
  assert.equal(gesture.tap('round1:tile0', 1251), true);
});

test('建议改变、牌局改变或取消操作后，不能沿用上一次点击', () => {
  const gesture = createDoubleTap();
  assert.equal(gesture.tap('analysis1:revision1:tile0', 100), false);
  assert.equal(gesture.tap('analysis1:revision1:tile1', 150), false);
  assert.equal(gesture.tap('analysis2:revision2:tile1', 200), false);
  gesture.reset();
  assert.equal(gesture.tap('analysis2:revision2:tile1', 250), false);
  assert.equal(gesture.tap('analysis2:revision2:tile1', 400), true);
});
