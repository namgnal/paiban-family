import { parseHand } from './tiles.js';
import { DEFAULT_RULES } from './rules.js';

export function demoRecord(rules = DEFAULT_RULES) {
  return { format: 'paiban-v1', initial: { hand: parseHand('m123467p234s456z11'), dealer: 0, rules, demo: true }, events: [] };
}
