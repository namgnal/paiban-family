import { TILES, tileName, NUMBERS } from './tiles.js';

const pipLayouts = [[], [[20, 28]], [[20, 16], [20, 40]], [[12, 14], [20, 28], [28, 42]],
  [[11, 15], [29, 15], [11, 41], [29, 41]],
  [[11, 13], [29, 13], [20, 28], [11, 43], [29, 43]],
  [[11, 12], [29, 12], [11, 28], [29, 28], [11, 44], [29, 44]],
  [[10, 11], [20, 17], [30, 23], [11, 33], [29, 33], [11, 46], [29, 46]],
  [[11, 9], [29, 9], [11, 22], [29, 22], [11, 35], [29, 35], [11, 48], [29, 48]],
  [[9, 12], [20, 12], [31, 12], [9, 28], [20, 28], [31, 28], [9, 44], [20, 44], [31, 44]]];
function face(id) {
  if (id === null) return '<svg viewBox="0 0 40 56" aria-hidden="true"><rect x="6" y="7" width="28" height="42" rx="4" fill="#6c9582"/><path d="M10 15h20M10 23h20M10 31h20M10 39h20" stroke="#bdd1c0" stroke-width="2"/></svg>';
  const tile = TILES[id];
  if (tile.suit === 0) return `<svg viewBox="0 0 40 56" aria-hidden="true"><text x="20" y="26" text-anchor="middle" class="tile-number">${NUMBERS[tile.rank - 1]}</text><text x="20" y="48" text-anchor="middle" class="tile-wan">萬</text></svg>`;
  if (tile.suit === 1) return `<svg viewBox="0 0 40 56" aria-hidden="true">${pipLayouts[tile.rank].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${tile.rank === 1 ? 10 : 4}" fill="none" stroke="${(tile.rank === 5 && i === 2) || tile.rank === 1 ? '#b34136' : '#2d6471'}" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="1.1" fill="#2d6471"/>`).join('')}</svg>`;
  if (tile.suit === 2) {
    if (tile.rank === 1) return '<svg viewBox="0 0 40 56" aria-hidden="true"><path d="M23 9c-10 0-15 12-11 22 2 5 7 8 12 7l-7 12 12-10c6-7 3-15-5-15l5-10z" fill="#347554"/><circle cx="25" cy="12" r="2" fill="#af4536"/><path d="m27 14 8 3-8 2M11 29l14 4M15 23l10 4" stroke="#efd9ad" stroke-width="2"/></svg>';
    return `<svg viewBox="0 0 40 56" aria-hidden="true">${pipLayouts[tile.rank].map(([x, y]) => `<path d="M${x} ${y - 4}v8" stroke="#367552" stroke-width="3.2" stroke-linecap="round"/><path d="M${x - 2} ${y - 2}h4M${x - 2} ${y + 2}h4" stroke="#367552" stroke-width="1.3"/>`).join('')}</svg>`;
  }
  if (id === 33) return '<svg viewBox="0 0 40 56" aria-hidden="true"><rect x="9" y="10" width="22" height="36" rx="1" fill="none" stroke="#547b98" stroke-width="3"/><path d="M13 14h14v28H13z" fill="none" stroke="#547b98" stroke-width=".8"/></svg>';
  return `<svg viewBox="0 0 40 56" aria-hidden="true"><text x="20" y="39" text-anchor="middle" class="tile-honor" fill="${id === 31 ? '#b34136' : id === 32 ? '#367552' : '#253e39'}">${id === 32 ? '發' : tile.label}</text></svg>`;
}
export function tileView(id, { action = '', index, small = false, selected = false, disabled = false, count = null, extra = '', label } = {}) {
  const attrs = `${action ? `data-action="${action}" data-tile="${id}"` : ''} ${index !== undefined ? `data-index="${index}"` : ''}`;
  const tag = action ? 'button' : 'span';
  return `<${tag} ${action ? 'type="button"' : 'role="img"'} class="tile ${small ? 'tile-small' : ''} ${selected ? 'tile-selected' : ''} ${extra}" ${attrs} ${disabled ? 'disabled' : ''} aria-label="${label ?? tileName(id)}" title="${tileName(id)}">${face(id)}${count !== null ? `<span class="tile-count">${count}</span>` : ''}</${tag}>`;
}
export function tileRow(tiles, options = {}) { return tiles.map((id) => tileView(id, options)).join(''); }
