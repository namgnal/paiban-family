import { shanten, improvements, winInfo, sevenPairsShanten, scatteredShanten } from './hand.js';
import { claimOptions, ownKongOptions, visibleCounts, applyEvent } from './game.js';
import { countsOf, removeTiles, tileName } from './tiles.js';
import { winPayments } from './rules.js';

// These weights are a transparent first-version heuristic, not win probabilities
// or calibrated expected points. Exact hand facts are returned separately.
export const METHOD = '牌效与收益启发式 v1';
const kindName = { chi: '吃', peng: '碰', minggang: '明杠', angang: '暗杠', bugang: '补杠' };

function tileConnection(hand) {
  const counts = countsOf(hand);
  let value = 0;
  for (let tile = 0; tile < 34; tile++) {
    if (!counts[tile]) continue;
    if (counts[tile] >= 2) value += 2;
    if (tile >= 27) continue;
    if (tile % 9 < 8 && counts[tile + 1]) value += 1.2;
    if (tile % 9 < 7 && counts[tile + 2]) value += 0.6;
  }
  return value;
}

function publicRisk(state, tile) {
  let risk = 0;
  const signals = [];
  for (let seat = 1; seat < 4; seat++) {
    const player = state.players[seat];
    const exposed = player.melds.flatMap((m) => m.tiles).filter((t) => t !== null);
    const tempo = Math.min(1, player.discards.length / 16 + player.melds.length * 0.22);
    // A previously discarded tile is NOT safe in this house rule: no furiten
    // rule was confirmed. Never assign zero risk just because of a river match.
    let signal = tempo;
    if (exposed.length >= 6 && exposed.every((t) => t < 27 && Math.floor(t / 9) === Math.floor(exposed[0] / 9))) {
      if (tile < 27 && Math.floor(tile / 9) === Math.floor(exposed[0] / 9)) {
        signal += 0.9;
        signals.push('同花色副露较多');
      }
    }
    if (player.melds.length >= 3) signals.push('有对手已亮出三组以上');
    // Incremental loss of dealing in versus paying as a bystander. This is
    // house-rule-sensitive, but signal itself is not a probability estimate.
    const dealer = state.dealer === 0 || state.dealer === seat ? state.rules.dealerMultiplier : 1;
    risk += signal * Math.max(0, state.rules.discardMultiplier - state.rules.otherDiscardPay) * dealer;
  }
  return { value: risk, signals: [...new Set(signals)] };
}

function rewardPotential(hand, melds, rules, bestShanten) {
  const targets = [];
  let bonus = 0;
  if (!melds.length && rules.sevenPairs) {
    const distance = sevenPairsShanten(hand, rules.quadAsPairs);
    if (distance <= bestShanten + 1) {
      bonus = Math.max(bonus, 5 * Math.log2(rules.specialMultiplier) / (distance - bestShanten + 1));
      targets.push('小七对');
    }
  }
  if (!melds.length && rules.scattered && scatteredShanten(hand) <= bestShanten) {
    bonus = Math.max(bonus, 5 * Math.log2(rules.specialMultiplier));
    targets.push('十三烂');
  }
  const all = [...hand, ...melds.flatMap((m) => m.tiles)];
  if (rules.pureSuit && all.length) {
    const suitCounts = [0, 0, 0];
    all.forEach((tile) => { if (tile !== null && tile < 27) suitCounts[Math.floor(tile / 9)]++; });
    const suit = suitCounts.indexOf(Math.max(...suitCounts));
    const off = all.length - suitCounts[suit];
    const compatibleMelds = melds.every((m) => m.tiles.every((t) => t !== null && t < 27 && Math.floor(t / 9) === suit));
    if (compatibleMelds && off <= 3) {
      const pureBonus = (4 - off) * 3 * Math.log2(rules.specialMultiplier);
      bonus = rules.stackSpecial ? bonus + pureBonus : Math.max(bonus, pureBonus);
      targets.push('清一色');
    }
  }
  return { bonus, targets };
}

function evaluate(hand, melds, state, visible, discard = null) {
  const progress = improvements(hand, melds, visible, state.rules);
  const reward = rewardPotential(hand, melds, state.rules, progress.shanten);
  const risk = discard === null ? { value: 0, signals: [] } : publicRisk(state, discard);
  let readyValue = 0;
  const waits = [];
  if (progress.shanten === 0) {
    for (const { tile, count } of progress.tiles) {
      const info = winInfo([...hand, tile], melds, state.rules);
      if (!info.win) continue;
      const selfPoints = winPayments({ winner: 0, dealer: state.dealer, patterns: info.patterns, rules: state.rules }).delta[0];
      waits.push({ tile, count, patterns: info.patterns, selfPoints });
      readyValue += Math.log2(1 + selfPoints / state.rules.base) * count;
    }
    readyValue /= Math.max(1, progress.count);
  }
  // Progress dominates opening play; late public threats and score incentives
  // break close choices. A second draw lookahead below refines similar options.
  const score = -progress.shanten * 55 + Math.log1p(progress.count) * 11
    + tileConnection(hand) * 0.35 + reward.bonus + readyValue * 3
    - risk.value * (progress.shanten === 0 ? 1 : 2.5) - (progress.count === 0 ? 75 : 0);
  return { ...progress, waits, targets: reward.targets, risk: risk.signals, riskValue: risk.value, score };
}

function discardCandidates(hand, melds, state, visible) {
  return [...new Set(hand)].map((tile) => {
    const rest = removeTiles(hand, [tile]);
    return { tile, hand: rest, melds, ...evaluate(rest, melds, state, visible, tile) };
  }).sort((a, b) => b.score - a.score || a.tile - b.tile);
}

function lookahead(candidate, visible, rules) {
  if (candidate.shanten <= 0 || !candidate.hand) return 0;
  let sum = 0, total = 0;
  // Enumerate all improving draws, then all next discards. Counts denote
  // unseen copies, not guaranteed wall tiles. Opponent hands remain unknown.
  for (const { tile, count } of candidate.tiles) {
    const next = [...candidate.hand, tile];
    let best = -Infinity;
    for (const discard of new Set(next)) {
      const hand = removeTiles(next, [discard]);
      const distance = shanten(hand, candidate.melds, rules);
      const shape = tileConnection(hand);
      best = Math.max(best, -distance * 5 + shape * 0.2);
    }
    sum += best * count;
    total += count;
  }
  return total ? sum / total : 0;
}

export function advise(state, { refined = true } = {}) {
  const started = performance.now();
  const visible = visibleCounts(state);
  const melds = state.players[0].melds;
  const result = { method: METHOD, candidates: [], warning: '策略仍在验证；公开危险信号不代表放铳概率，未见牌也可能在别人手里。' };
  if (state.phase === 'ended' || state.phase === 'exhausted') return result;
  const selfTurn = state.turn === 0 && state.phase === 'discard';
  const responding = state.phase === 'response' && state.pending.actor !== 0;
  const info = selfTurn ? winInfo(state.hand, melds, state.rules)
    : responding ? winInfo([...state.hand, state.pending.tile], melds, state.rules) : { win: false };
  if (info.win) {
    const event = { type: 'win', actor: 0, method: selfTurn ? 'self' : 'ron' };
    const payment = winPayments({ winner: 0, from: selfTurn ? null : state.pending.actor, dealer: state.dealer, patterns: info.patterns, rules: state.rules });
    // Conservative v1 policy: take a legal win. It does not claim passing a win
    // can never have higher expectation under a known opponent model.
    result.candidates.push({ action: 'win', label: selfTurn ? '可以自摸' : '可以胡牌', event, points: payment.delta[0], patterns: info.patterns, score: Infinity });
  }
  if (selfTurn) {
    for (const candidate of discardCandidates(state.hand, melds, state, visible)) {
      result.candidates.push({ ...candidate, action: 'discard', label: `打${tileName(candidate.tile)}`, event: { type: 'discard', actor: 0, tile: candidate.tile } });
    }
    for (const event of ownKongOptions(state)) {
      const next = applyEvent(state, event);
      const candidate = evaluate(next.hand, next.players[0].melds, state, visibleCounts(next));
      const points = next.scores[0] - state.scores[0];
      result.candidates.push({ ...candidate, hand: next.hand, melds: next.players[0].melds, action: 'kong', event,
        label: `${kindName[event.kind]}${tileName(event.tile)}`, points, score: candidate.score + points / state.rules.base * 5 });
    }
  } else if (responding) {
    const candidate = evaluate(state.hand, melds, state, visible);
    result.candidates.push({ ...candidate, hand: state.hand, melds, action: 'pass', label: state.wall ? '先不吃碰，继续摸牌' : '不响应，确认流局', event: { type: 'pass' } });
    for (const option of state.wall ? claimOptions(state) : []) {
      const event = { type: 'claim', actor: 0, kind: option.kind, tiles: option.tiles };
      const next = applyEvent(state, event);
      if (option.kind === 'minggang') {
        const candidate = evaluate(next.hand, next.players[0].melds, next, visibleCounts(next));
        const points = next.scores[0] - state.scores[0];
        result.candidates.push({ ...candidate, hand: next.hand, melds: next.players[0].melds, action: 'claim', event,
          label: `明杠${tileName(option.tiles[0])}`, points, score: candidate.score + points / state.rules.base * 5 });
      } else {
        const best = discardCandidates(next.hand, next.players[0].melds, next, visibleCounts(next))[0];
        result.candidates.push({ ...best, action: 'claim', event, followDiscard: best.tile,
          label: `${kindName[option.kind]}后打${tileName(best.tile)}` });
      }
    }
  } else {
    result.waiting = true;
    result.progress = improvements(state.hand, melds, visible, state.rules);
  }
  if (refined) {
    for (const candidate of result.candidates) if (candidate.action !== 'win') {
      candidate.score += lookahead(candidate, visible, state.rules);
    }
  }
  result.candidates.sort((a, b) => b.score - a.score || (a.tile ?? 40) - (b.tile ?? 40));
  // Internal weights and hypothetical followup hands are not product metrics.
  result.candidates = result.candidates.map(({ hand, melds: _, score, riskValue, ...candidate }) => candidate);
  result.elapsedMs = Math.round(performance.now() - started);
  return result;
}
