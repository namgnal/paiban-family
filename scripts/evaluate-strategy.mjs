// Development-only, perfect-information referee with observation-limited bots.
// No private opponent tile or future wall is passed to either decision policy.
// Simulation assumptions for unresolved rules are explicit in the output.
import { advise } from '../src/advisor.js';
import { claimOptions, ownKongOptions, visibleCounts, applyEvent, assertState } from '../src/game.js';
import { shanten, improvements, winInfo } from '../src/hand.js';
import { removeTiles, sortTiles, countsOf } from '../src/tiles.js';
import { DEFAULT_RULES, winPayments, kongPayments } from '../src/rules.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

function shuffled(seed) {
  const wall = Array.from({ length: 136 }, (_, i) => i % 34);
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = wall.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [wall[i], wall[j]] = [wall[j], wall[i]]; }
  return wall;
}
function observation(game, actor, phase = 'discard', pending = null) {
  const toRelative = (seat) => seat === null ? null : (seat - actor + 4) % 4;
  const players = Array.from({ length: 4 }, (_, relative) => {
    const seat = (actor + relative) % 4;
    return { concealedCount: game.hands[seat].length,
      melds: game.players[seat].melds.map((meld) => ({ ...meld, from: toRelative(meld.from), tiles: meld.kind === 'angang' && relative !== 0 ? [null, null, null, null] : meld.tiles })),
      discards: game.players[seat].discards.map((discard) => ({ ...discard, claimedBy: toRelative(discard.claimedBy) })) };
  });
  const state = { schema: 1, hand: sortTiles(game.hands[actor]), players, rules: DEFAULT_RULES,
    dealer: toRelative(0), turn: toRelative(game.turn), phase, pending: pending ? { ...pending, actor: toRelative(pending.actor) } : null,
    wall: game.wall.length, scores: Array.from({ length: 4 }, (_, s) => game.scores[(actor + s) % 4]), ledger: [], revision: 0, drawn: null, end: null };
  return assertState(state);
}
function baselineDiscard(state) {
  const visible = visibleCounts(state), melds = state.players[0].melds;
  const candidates = [...new Set(state.hand)].map((tile) => {
    const hand = removeTiles(state.hand, [tile]);
    return { tile, hand, distance: shanten(hand, melds, state.rules) };
  });
  const minimum = Math.min(...candidates.map((c) => c.distance));
  return candidates.filter((c) => c.distance === minimum).map((c) => ({ ...c, count: improvements(c.hand, melds, visible, state.rules).count }))
    .sort((a, b) => b.count - a.count || a.tile - b.tile)[0];
}
function choose(state, policy) {
  if (policy === 'candidate') return advise(state, { refined: true }).candidates[0]?.event ?? { type: 'pass' };
  if (state.phase === 'discard') {
    const best = baselineDiscard(state);
    const kong = ownKongOptions(state).find((event) => {
      const next = applyEvent(state, event);
      return shanten(next.hand, next.players[0].melds, state.rules) <= best.distance;
    });
    return kong ?? { type: 'discard', actor: 0, tile: best.tile };
  }
  const current = shanten(state.hand, state.players[0].melds, state.rules);
  const options = claimOptions(state).map((option) => {
    const event = { type: 'claim', actor: 0, kind: option.kind, tiles: option.tiles }, next = applyEvent(state, event);
    const distance = option.kind === 'minggang' ? shanten(next.hand, next.players[0].melds, next.rules) : baselineDiscard(next).distance;
    return { event, distance, kong: option.kind === 'minggang' };
  }).filter((o) => o.kong ? o.distance <= current : o.distance < current).sort((a, b) => a.distance - b.distance || Number(b.kong) - Number(a.kong));
  return options[0]?.event ?? { type: 'pass' };
}
function addPayment(game, payment) { game.scores = game.scores.map((value, seat) => value + payment.delta[seat]); }
function checkTiles(game) {
  const all = [...game.wall, ...game.hands.flat(), ...game.players.flatMap((p) => p.melds.flatMap((m) => m.tiles)),
    ...game.players.flatMap((p) => p.discards.filter((d) => d.claimedBy === null).map((d) => d.tile))];
  if (all.length !== 136 || countsOf(all).some((n) => n !== 4)) throw new Error('Simulation tile conservation failed');
  if (game.scores.reduce((sum, n) => sum + n, 0) !== 0) throw new Error('Simulation zero-sum failed');
}
function play(seed, hero = -1) {
  const wall = shuffled(seed), hands = Array.from({ length: 4 }, () => wall.splice(0, 13)); hands[0].push(wall.shift());
  const game = { wall, hands, players: Array.from({ length: 4 }, () => ({ melds: [], discards: [] })), turn: 0, scores: [0, 0, 0, 0] };
  let needsDraw = false, turns = 0;
  const policy = (seat) => seat === hero ? 'candidate' : 'baseline';
  const finish = (winner, from, info) => {
    addPayment(game, winPayments({ winner, from, dealer: 0, patterns: info.patterns }));
    checkTiles(game); return { scores: game.scores, winner, from, turns };
  };
  while (turns++ < 250) {
    const actor = game.turn;
    if (needsDraw) { if (!wall.length) break; hands[actor].push(wall.shift()); }
    checkTiles(game);
    const self = winInfo(hands[actor], game.players[actor].melds);
    if (self.win) return finish(actor, null, self);
    const state = observation(game, actor), event = choose(state, policy(actor));
    if (event.type === 'kong') {
      if (event.kind === 'angang') { hands[actor] = removeTiles(hands[actor], Array(4).fill(event.tile)); game.players[actor].melds.push({ kind: 'angang', tiles: Array(4).fill(event.tile), from: null }); }
      else { hands[actor] = removeTiles(hands[actor], [event.tile]); game.players[actor].melds[event.meldIndex].kind = 'bugang'; game.players[actor].melds[event.meldIndex].tiles.push(event.tile); }
      addPayment(game, kongPayments(actor)); needsDraw = true; continue;
    }
    if (event.type !== 'discard') throw new Error('Expected a discard or kong');
    hands[actor] = removeTiles(hands[actor], [event.tile]);
    const river = game.players[actor].discards;
    river.push({ tile: event.tile, claimedBy: null });
    const pending = { actor, tile: event.tile, discardIndex: river.length - 1 };
    // Assumption for evaluation only: nearest player wins if multiple can ron.
    for (let offset = 1; offset < 4; offset++) {
      const other = (actor + offset) % 4, info = winInfo([...hands[other], event.tile], game.players[other].melds);
      if (info.win) return finish(other, actor, info);
    }
    const claims = [];
    for (let offset = 1; offset < 4; offset++) {
      const other = (actor + offset) % 4, view = observation(game, other, 'response', pending);
      if (!claimOptions(view).length) continue;
      const call = choose(view, policy(other));
      if (call.type === 'claim') claims.push({ other, call, option: claimOptions(view).find((o) => o.kind === call.kind && o.tiles.join() === call.tiles.join()) });
    }
    // Assumption for evaluation: peng/gang before chi; ties by turn order.
    claims.sort((a, b) => Number(a.call.kind === 'chi') - Number(b.call.kind === 'chi'));
    if (claims.length) {
      const { other, call, option } = claims[0];
      hands[other] = removeTiles(hands[other], option.consume);
      game.players[other].melds.push({ kind: call.kind, tiles: call.tiles, from: actor });
      river.at(-1).claimedBy = other; game.turn = other; needsDraw = call.kind === 'minggang';
      if (needsDraw) addPayment(game, kongPayments(other));
    } else { game.turn = (actor + 1) % 4; needsDraw = true; }
  }
  checkTiles(game);
  if (turns >= 250) throw new Error('Simulation did not terminate');
  return { scores: game.scores, winner: null, from: null, turns };
}

const seeds = Math.max(1, Math.min(2000, Number(process.argv[2] || 32)));
const seedStart = Number(process.argv[3] || 91001), started = performance.now();
const groups = [], results = [];
for (let seed = seedStart; seed < seedStart + seeds; seed++) {
  const baseline = play(seed); const diffs = [];
  for (let hero = 0; hero < 4; hero++) {
    const candidate = play(seed, hero);
    const delta = candidate.scores[hero] - baseline.scores[hero];
    diffs.push(delta); results.push({ seed, hero, score: candidate.scores[hero], baseline: baseline.scores[hero], delta, winner: candidate.winner, from: candidate.from, turns: candidate.turns });
  }
  groups.push(diffs.reduce((a, b) => a + b, 0) / 4);
  if (groups.length % 8 === 0) console.log(`已完成 ${groups.length}/${seeds} 组牌序；${Math.round((performance.now() - started) / 1000)}秒`);
}
const mean = groups.reduce((a, b) => a + b, 0) / groups.length;
const variance = groups.length > 1 ? groups.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (groups.length - 1) : null;
const radius = variance === null ? null : 1.96 * Math.sqrt(variance / groups.length);
const summary = { method: 'paired shuffled walls; 4 hero seats; seed-clustered normal-approx CI', seeds, games: seeds * 5, candidateSeatGames: results.length, seedStart,
  meanPointDelta: mean, confidence95: radius === null ? null : [mean - radius, mean + radius],
  candidateWinRate: results.filter((r) => r.winner === r.hero).length / results.length,
  elapsedSeconds: +(performance.now() - started).toFixed(1) / 1000,
  assumptions: ['最近座位优先胡，仅仿真约定', '不处理抢杠胡、过手胡、流局罚分', '无跨局连庄价值', '对手仅为单一牌效基线', '独立杠牌按每家2倍底分', '决策只获取可见信息'],
  warning: '研究性仿真结果，不是实桌效果证明；小样本正态近似区间只供观察。' };
await mkdir('.test-artifacts', { recursive: true });
await writeFile(`.test-artifacts/strategy-${seedStart}-${seeds}.json`, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
