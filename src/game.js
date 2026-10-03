import { isTile, countsOf, removeTiles, sortTiles, nextSeat, tileName, SEATS } from './tiles.js';
import { DEFAULT_RULES, normalizeRules, kongPayments, winPayments } from './rules.js';
import { winInfo } from './hand.js';

const validSeat = (seat) => Number.isInteger(seat) && seat >= 0 && seat < 4;
function ensure(condition, message) { if (!condition) throw new Error(message); }
export function startGame({ hand, dealer = 0, rules = DEFAULT_RULES, demo = false }) {
  ensure(validSeat(dealer), '请选择庄家');
  ensure(Array.isArray(hand) && hand.every(isTile), '初始手牌无效');
  ensure(hand.length === (dealer === 0 ? 14 : 13), `请录入${dealer === 0 ? 14 : 13}张初始手牌`);
  ensure(!countsOf(hand).some((n) => n > 4), '同一种牌不能超过4张');
  const state = {
    schema: 1, demo: !!demo, dealer, rules: normalizeRules(rules), hand: sortTiles(hand),
    players: Array.from({ length: 4 }, () => ({ melds: [], discards: [], concealedCount: 13 })),
    turn: dealer, phase: 'discard', pending: null, drawn: null,
    wall: 83, scores: [0, 0, 0, 0], ledger: [], end: null, revision: 0,
  };
  state.players[dealer].concealedCount = 14;
  assertState(state);
  return state;
}
export function visibleCounts(state) {
  const counts = countsOf(state.hand);
  for (const player of state.players) {
    for (const discard of player.discards) if (discard.claimedBy === null) counts[discard.tile]++;
    for (const meld of player.melds) for (const tile of meld.tiles) if (isTile(tile)) counts[tile]++;
  }
  return counts;
}
export function assertState(state) {
  ensure(state.hand.length === state.players[0].concealedCount, '自己的手牌张数与牌局不一致');
  ensure(state.wall >= 0 && state.wall <= 83, '牌墙计数无效');
  const visible = visibleCounts(state);
  ensure(visible.every((count) => count <= 4 && count >= 0), '同一种牌已经超过4张，请检查刚才的记录');
  const unknownKongs = state.players.flatMap((p) => p.melds).filter((m) => m.tiles.every((t) => t === null)).length;
  ensure(visible.filter((n) => n === 0).length >= unknownKongs, '未知暗杠已没有可能的牌面，请检查记录');
  const hidden = state.players.slice(1).reduce((sum, p) => sum + p.concealedCount, 0);
  ensure(visible.reduce((sum, n) => sum + n, 0) + hidden + unknownKongs * 4 + state.wall === 136, '牌局总张数不一致');
  ensure(Math.abs(state.scores.reduce((sum, n) => sum + n, 0)) < 0.001, '积分收付不平衡');
  for (let seat = 0; seat < 4; seat++) {
    const player = state.players[seat];
    ensure(player.melds.length <= 4, '吃碰杠组合已超过4组');
    const size = 13 - player.melds.length * 3;
    ensure(player.concealedCount === size || player.concealedCount === size + 1, `${SEATS[seat]}的牌数不正确`);
  }
  return state;
}
function recordPayment(state, result, label) {
  state.scores = state.scores.map((n, seat) => Math.round((n + result.delta[seat]) * 100) / 100);
  state.ledger.push({ ...result, label, event: state.revision + 1 });
}
function afterPass(state) {
  ensure(state.phase === 'response' && state.pending, '当前没有可放过的弃牌');
  state.turn = nextSeat(state.pending.actor);
  state.phase = state.wall === 0 ? 'exhausted' : 'draw';
  state.pending = null;
}
function drawUnknown(state, actor) {
  ensure(state.turn === actor && actor !== 0 && state.phase === 'draw', '尚未轮到这位玩家摸牌');
  ensure(state.wall > 0, '牌墙已摸完');
  state.wall--;
  state.players[actor].concealedCount++;
  state.phase = 'discard';
}
export function claimOptions(state, actor = 0) {
  if (state.phase !== 'response' || !state.pending || state.pending.actor === actor) return [];
  const tile = state.pending.tile;
  const result = [];
  const own = actor === 0;
  const counts = own ? countsOf(state.hand) : null;
  const possible = (removed) => !own || removed.every((t) => counts[t] >= removed.filter((v) => v === t).length);
  if (state.players[actor].melds.length >= 4) return result;
  if (state.rules.allowPeng && possible([tile, tile])) result.push({ kind: 'peng', tiles: [tile, tile, tile], consume: [tile, tile] });
  if (state.rules.allowGang && state.wall > 0 && possible([tile, tile, tile])) result.push({ kind: 'minggang', tiles: [tile, tile, tile, tile], consume: [tile, tile, tile] });
  if (state.rules.allowChi && actor === nextSeat(state.pending.actor) && tile < 27) {
    const suitStart = Math.floor(tile / 9) * 9;
    for (let first = Math.max(suitStart, tile - 2); first <= Math.min(tile, suitStart + 6); first++) {
      const tiles = [first, first + 1, first + 2];
      const consume = tiles.filter((t) => t !== tile);
      if (possible(consume)) result.push({ kind: 'chi', tiles, consume });
    }
  }
  return result;
}
export function ownKongOptions(state) {
  if (state.turn !== 0 || state.phase !== 'discard' || !state.rules.allowGang || !state.wall) return [];
  const counts = countsOf(state.hand);
  const options = [];
  if (state.players[0].melds.length < 4) counts.forEach((n, tile) => {
    if (n === 4) options.push({ type: 'kong', actor: 0, kind: 'angang', tile });
  });
  state.players[0].melds.forEach((meld, meldIndex) => {
    if (meld.kind === 'peng' && counts[meld.tiles[0]] > 0) options.push({ type: 'kong', actor: 0, kind: 'bugang', tile: meld.tiles[0], meldIndex });
  });
  return options;
}
export function applyEvent(previous, event) {
  ensure(previous && previous.schema === 1, '牌局版本不正确');
  ensure(event && typeof event === 'object', '操作记录无效');
  ensure(previous.phase !== 'ended', '本局已经结束，先撤销或开始新一局');
  const state = structuredClone(previous);
  const actor = event.actor;
  if ('actor' in event) ensure(validSeat(actor), '玩家无效');
  if (event.type === 'pass') {
    afterPass(state);
  } else if (event.type === 'draw') {
    if (state.phase === 'response') {
      ensure(nextSeat(state.pending.actor) === 0, '还没有轮到自己摸牌');
      afterPass(state);
    }
    ensure(state.turn === 0 && state.phase === 'draw' && isTile(event.tile), '当前不能记录自己的摸牌');
    ensure(state.wall > 0, '牌墙已摸完');
    state.hand = sortTiles([...state.hand, event.tile]);
    state.players[0].concealedCount++;
    state.drawn = event.tile;
    state.wall--;
    state.phase = 'discard';
  } else if (event.type === 'discard') {
    ensure(isTile(event.tile), '请选择要打出的牌');
    if (state.phase === 'response') {
      ensure(actor === nextSeat(state.pending.actor), '如有人吃碰杠，请先记录该操作');
      afterPass(state);
    }
    if (state.phase === 'draw' && actor !== 0) drawUnknown(state, actor);
    ensure(state.phase === 'discard' && state.turn === actor, '请按当前轮次记录出牌');
    if (actor === 0) state.hand = removeTiles(state.hand, [event.tile]);
    state.players[actor].concealedCount--;
    state.players[actor].discards.push({ tile: event.tile, claimedBy: null, event: state.revision + 1 });
    state.pending = { actor, tile: event.tile, discardIndex: state.players[actor].discards.length - 1 };
    state.phase = 'response';
    state.drawn = null;
  } else if (event.type === 'claim') {
    ensure(state.phase === 'response', '当前没有可吃碰杠的弃牌');
    const option = claimOptions(state, actor).find((o) => o.kind === event.kind && o.tiles.join(',') === event.tiles?.join(','));
    ensure(option, '这组吃碰杠不符合当前牌局');
    const pending = state.pending;
    if (actor === 0) state.hand = removeTiles(state.hand, option.consume);
    state.players[actor].concealedCount -= option.consume.length;
    state.players[actor].melds.push({ kind: option.kind, tiles: option.tiles, from: pending.actor });
    state.players[pending.actor].discards[pending.discardIndex].claimedBy = actor;
    state.turn = actor;
    state.pending = null;
    state.drawn = null;
    state.phase = option.kind === 'minggang' ? 'draw' : 'discard';
    if (option.kind === 'minggang') recordPayment(state, kongPayments(actor, state.rules), `${SEATS[actor]}明杠`);
  } else if (event.type === 'kong') {
    if (state.phase === 'response') {
      ensure(actor === nextSeat(state.pending.actor), '尚未轮到这位玩家');
      afterPass(state);
    }
    if (state.phase === 'draw' && actor !== 0) drawUnknown(state, actor);
    ensure(state.rules.allowGang && state.phase === 'discard' && state.turn === actor, '当前不能开杠');
    ensure(state.wall > 0, '没有补牌可摸，不能开杠');
    const player = state.players[actor];
    if (event.kind === 'angang') {
      ensure(player.melds.length < 4, '已经有4组吃碰杠');
      ensure(isTile(event.tile) || (event.tile === null && actor !== 0), '自己的暗杠需要明确牌面');
      if (actor === 0) state.hand = removeTiles(state.hand, Array(4).fill(event.tile));
      player.concealedCount -= 4;
      player.melds.push({ kind: 'angang', tiles: Array(4).fill(event.tile), from: null });
    } else if (event.kind === 'bugang') {
      const meld = player.melds[event.meldIndex];
      ensure(meld && meld.kind === 'peng' && meld.tiles[0] === event.tile, '请选择要补杠的碰牌');
      if (actor === 0) state.hand = removeTiles(state.hand, [event.tile]);
      player.concealedCount--;
      player.melds[event.meldIndex] = { ...meld, kind: 'bugang', tiles: Array(4).fill(event.tile) };
    } else throw new Error('杠牌种类无效');
    recordPayment(state, kongPayments(actor, state.rules), `${SEATS[actor]}${event.kind === 'angang' ? '暗杠' : '补杠'}`);
    state.phase = 'draw';
    state.pending = null;
    state.drawn = null;
  } else if (event.type === 'win') {
    ensure(event.method === 'ron' || event.method === 'self', '请选择胡牌方式');
    let from = null;
    let patterns = event.patterns ?? [];
    if (event.method === 'ron') {
      ensure(state.phase === 'response' && state.pending.actor !== actor, '当前没有可胡的弃牌');
      from = state.pending.actor;
    } else {
      if (state.phase === 'response') {
        ensure(actor === nextSeat(state.pending.actor) && actor !== 0, '还未轮到该玩家自摸');
        afterPass(state);
      }
      if (state.phase === 'draw' && actor !== 0) drawUnknown(state, actor);
      ensure(state.turn === actor && state.phase === 'discard', '当前不能记录自摸');
    }
    if (actor === 0) {
      const hand = from === null ? state.hand : [...state.hand, state.pending.tile];
      const info = winInfo(hand, state.players[0].melds, state.rules);
      ensure(info.win, '当前手牌还不符合已启用的胡牌规则');
      patterns = info.patterns;
    } else {
      const enabled = { '小七对': state.rules.sevenPairs, '清一色': state.rules.pureSuit, '十三烂': state.rules.scattered, '普通胡': true };
      ensure(Array.isArray(patterns) && patterns.every((p) => enabled[p]), '胡牌奖励与本局规则不符');
      ensure(!(patterns.includes('小七对') && patterns.includes('十三烂')), '小七对与十三烂不能同时成立');
      ensure(!(patterns.includes('十三烂') && patterns.includes('清一色')), '十三烂与清一色不能同时成立');
      ensure(!(playerHasMeld(state, actor) && (patterns.includes('小七对') || patterns.includes('十三烂'))), '吃碰杠后的手牌不能按该特殊结构结算');
    }
    const payment = winPayments({ winner: actor, from, dealer: state.dealer, patterns, rules: state.rules });
    recordPayment(state, payment, `${SEATS[actor]}${from === null ? '自摸' : '胡牌'}`);
    state.end = { kind: 'win', winner: actor, from, patterns, payment, tile: from === null ? state.drawn : state.pending.tile };
    state.phase = 'ended';
  } else if (event.type === 'end') {
    // User-confirmed termination; no unconfirmed draw penalties are invented.
    state.end = { kind: 'draw', note: '本局结束；保留已记录的杠牌积分，未自动计算流局罚分。' };
    state.phase = 'ended';
  } else throw new Error('不认识的操作');
  state.revision++;
  return assertState(state);
}
const playerHasMeld = (state, actor) => state.players[actor].melds.length > 0;
export function replay(initial, events) {
  ensure(Array.isArray(events) && events.length <= 500, '操作记录数量异常');
  return events.reduce(applyEvent, startGame(initial));
}
export function eventText(event) {
  const who = SEATS[event.actor] ?? '';
  if (event.type === 'draw') return `我摸入${tileName(event.tile)}`;
  if (event.type === 'discard') return `${who}打出${tileName(event.tile)}`;
  if (event.type === 'pass') return '无人吃碰胡，继续摸牌';
  if (event.type === 'claim') return `${who}${{ chi: '吃', peng: '碰', minggang: '明杠' }[event.kind]}${event.tiles.map(tileName).join('·')}`;
  if (event.type === 'kong') return `${who}${event.kind === 'angang' ? '暗杠' : '补杠'}${tileName(event.tile)}`;
  if (event.type === 'win') return `${who}${event.method === 'self' ? '自摸' : '胡牌'}`;
  return '结束本局';
}
export function expectedInput(state) {
  if (state.phase === 'ended' || state.phase === 'exhausted') return { kind: 'none', actor: null };
  if (state.phase === 'response') {
    if (state.wall === 0) return { kind: 'none', actor: null };
    const actor = nextSeat(state.pending.actor);
    return { kind: actor === 0 ? 'draw' : 'discard', actor };
  }
  return { kind: state.turn === 0 ? state.phase : 'discard', actor: state.turn };
}
