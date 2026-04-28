import type { Random } from './random.js';
import type { PaletteMix } from './tone.js';

/** Render context passed to easter-egg renderers. */
export interface EasterEggContext {
  rng: Random;
  mix: PaletteMix;
}

/**
 * An easter egg either fully overrides a sentence's translation
 * (`kind: 'override'`) or tags the sentence so the translator injects an
 * additional opener (`kind: 'tag'`).
 *
 * Matching is done against a normalized form of the sentence (lowercase,
 * leading/trailing punctuation stripped, internal whitespace collapsed).
 */
export interface EasterEgg {
  /** Identifier; useful in tests. */
  id: string;
  /** String substring or RegExp matched against the normalized sentence. */
  match: string | RegExp;
  kind: 'override' | 'tag';
  /** Required when kind === 'override'. */
  render?: (ctx: EasterEggContext) => string;
  /** Required when kind === 'tag'. The translator interprets this. */
  tag?: 'earsPerk';
}

function pickOne<T>(items: readonly T[], rng: Random): T {
  return rng.pick(items);
}

/**
 * Ordered list of easter eggs. Earlier entries take precedence on first
 * match. Tags don't preempt overrides; the translator should call
 * `findOverride` first and `findTags` second.
 */
export const EASTER_EGGS: EasterEgg[] = [
  {
    id: 'i-love-you',
    match: /\bi\s+love\s+you\b/,
    kind: 'override',
    render: ({ rng }) => {
      const soft = pickOne(['mrrf', 'hrmm', 'mrrrf', 'snrrf'], rng);
      return `${soft} *licks your face*`;
    },
  },
  {
    id: 'sorry',
    match: /\b(?:i'?m\s+)?sorry\b/,
    kind: 'override',
    render: () => `*tail between legs* *whimpers softly*`,
  },
  // More specific patterns first so they win the first-match race.
  {
    id: 'im-a-good',
    match: /\b(?:i\s+am|i'?m)\s+a\s+good\b/,
    kind: 'override',
    render: ({ rng }) => {
      const excited = pickOne(['yip!', 'arf!', 'borf!'], rng);
      return `${excited} *tail thumps loudly*`;
    },
  },
  {
    id: 'good-boy',
    match: /\bgood\s+(?:boy|dog|girl|pup|puppy)\b/,
    kind: 'override',
    render: () => `BARK BARK BARK! *spins in a circle*`,
  },
  {
    id: 'kitty',
    match: /\b(?:meow|mrow)\b/,
    kind: 'override',
    render: () => `*imitates a cat*`,
  },
  {
    id: 'aroo-long-word',
    match: /\b(?:[a-z]{15,})\b/,
    kind: 'override',
    render: ({ rng }) => {
      const numOs = rng.int(5,25);
      return `Ar${'o'.repeat(numOs)}!`;
    },
  },
  {
    id: 'walk-treat-ball-park',
    match: /\b(?:walk|walkies|treat|treats|ball|park|fetch)\b/,
    kind: 'tag',
    tag: 'earsPerk',
  },
];

function normalize(sentence: string): string {
  return sentence.toLowerCase().replace(/\s+/g, ' ').trim();
}

function testMatch(match: string | RegExp, normalized: string): boolean {
  if (typeof match === 'string') {
    return normalized.includes(match);
  }
  return match.test(normalized);
}

/** First override-kind egg whose `match` hits, or `undefined`. */
export function findOverride(sentence: string): EasterEgg | undefined {
  const norm = normalize(sentence);
  for (const egg of EASTER_EGGS) {
    if (egg.kind !== 'override') continue;
    if (testMatch(egg.match, norm)) return egg;
  }
  return undefined;
}

/** All tag-kind eggs whose `match` hits, in declaration order. */
export function findTags(sentence: string): EasterEgg[] {
  const norm = normalize(sentence);
  const out: EasterEgg[] = [];
  for (const egg of EASTER_EGGS) {
    if (egg.kind !== 'tag') continue;
    if (testMatch(egg.match, norm)) { 
      out.push(egg);
    }
  }
  return out;
}

/**
 * Convenience: returns the first matching easter egg of any kind. Used by
 * tests that want to assert "something matches".
 */
export function findEasterEgg(sentence: string): EasterEgg | undefined {
  const norm = normalize(sentence);
  for (const egg of EASTER_EGGS) {
    if (testMatch(egg.match, norm)) return egg;
  }
  return undefined;
}
