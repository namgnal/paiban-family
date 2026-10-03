export const NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
export const HONORS = ['东', '南', '西', '北', '中', '发', '白'];
export const SEATS = ['我', '下家', '对家', '上家'];
export const TILES = Array.from({ length: 34 }, (_, id) => ({
  id,
  suit: id < 27 ? Math.floor(id / 9) : 3,
  rank: id < 27 ? id % 9 + 1 : id - 26,
  label: id < 27 ? NUMBERS[id % 9] + ['万', '筒', '条'][Math.floor(id / 9)] : HONORS[id - 27],
}));
export const tileName = (id) => id === null ? '暗牌' : (TILES[id]?.label ?? '未知牌');
export const isTile = (id) => Number.isInteger(id) && id >= 0 && id < 34;
export const nextSeat = (seat) => (seat + 1) % 4;
export const sortTiles = (tiles) => [...tiles].sort((a, b) => a - b);
export function countsOf(tiles) {
  const counts = Array(34).fill(0);
  for (const tile of tiles) {
    if (!isTile(tile)) throw new Error('牌面无效');
    counts[tile]++;
  }
  return counts;
}
export function toCoreTile(id) {
  if (!isTile(id)) throw new Error('牌面无效');
  return id < 27 ? ['m', 'p', 's'][Math.floor(id / 9)] + (id % 9 + 1)
    : 'z' + [1, 2, 3, 4, 7, 6, 5][id - 27];
}
export function removeTiles(hand, removed) {
  const result = [...hand];
  for (const tile of removed) {
    const index = result.indexOf(tile);
    if (index < 0) throw new Error(`手牌里没有足够的${tileName(tile)}`);
    result.splice(index, 1);
  }
  return result;
}
export function parseHand(text) {
  const hand = [];
  const groups = text.replace(/\s/g, '').matchAll(/([mpsz])([1-9]+)/g);
  for (const [, suit, ranks] of groups) {
    for (const rank of ranks) {
      const n = Number(rank);
      const tile = suit === 'z' ? 27 + [1, 2, 3, 4, 7, 6, 5].indexOf(n)
        : ['m', 'p', 's'].indexOf(suit) * 9 + n - 1;
      if (!isTile(tile) || (suit === 'z' && n > 7)) throw new Error('牌面无效');
      hand.push(tile);
    }
  }
  return sortTiles(hand);
}
