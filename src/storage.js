import { replay } from './game.js';
import { normalizeRules } from './rules.js';

const GAME_KEY = 'paiban.game.v1';
const RULES_KEY = 'paiban.rules.v1';
export function validateRecord(record) {
  if (!record || record.format !== 'paiban-v1' || !record.initial || !Array.isArray(record.events)) throw new Error('不是可识别的牌伴牌局文件');
  const initial = { hand: record.initial.hand, dealer: record.initial.dealer,
    rules: normalizeRules(record.initial.rules), demo: Boolean(record.initial.demo) };
  const state = replay(initial, record.events);
  return { record: { format: 'paiban-v1', initial, events: record.events }, state };
}
export function loadRecord(storage = globalThis.localStorage) {
  const raw = storage.getItem(GAME_KEY);
  return raw ? validateRecord(JSON.parse(raw)) : null;
}
export function saveRecord(record, storage = globalThis.localStorage) {
  storage.setItem(GAME_KEY, JSON.stringify(record));
}
export function loadRules(storage = globalThis.localStorage) {
  const raw = storage.getItem(RULES_KEY);
  return normalizeRules(raw ? JSON.parse(raw) : {});
}
export function saveRules(rules, storage = globalThis.localStorage) {
  storage.setItem(RULES_KEY, JSON.stringify(normalizeRules(rules)));
}
