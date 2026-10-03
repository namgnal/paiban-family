import { applyEvent, claimOptions, expectedInput, ownKongOptions } from './game.js';
import { TILES } from './tiles.js';

// Reuse the event engine so every displayed choice obeys turn, rule and tile limits.
export function operationEvents(state, operation, actor) {
  if (!state || state.phase === 'ended') return [];
  const events = [];
  const claimKind = { chi: 'chi', peng: 'peng', gang: 'minggang' }[operation];
  if (claimKind) {
    for (const option of claimOptions(state, actor).filter((option) => option.kind === claimKind)) {
      events.push({ type: 'claim', actor, kind: option.kind, tiles: option.tiles });
    }
  }
  if (operation === 'gang' && state.rules.allowGang) {
    if (actor === 0) events.push(...ownKongOptions(state));
    else if (expectedInput(state).actor === actor && state.wall > (state.phase === 'discard' ? 0 : 1)) {
      if (state.players[actor].melds.length < 4) {
        for (const tile of [null, ...TILES.map((tile) => tile.id)]) events.push({ type: 'kong', actor, kind: 'angang', tile });
      }
      state.players[actor].melds.forEach((meld, meldIndex) => {
        if (meld.kind === 'peng') events.push({ type: 'kong', actor, kind: 'bugang', tile: meld.tiles[0], meldIndex });
      });
    }
  }
  if (operation === 'hu') {
    if (state.phase === 'response' && state.pending.actor !== actor) events.push({ type: 'win', actor, method: 'ron' });
    if (expectedInput(state).actor === actor) events.push({ type: 'win', actor, method: 'self' });
  }
  return events.filter((event) => {
    try { applyEvent(state, event); return true; }
    catch { return false; }
  });
}
