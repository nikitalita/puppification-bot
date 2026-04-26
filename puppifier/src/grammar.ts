import type { Random } from './random.js';
import type { RecentBuffer } from './recent.js';
import type { PaletteKey, PaletteMix } from './tone.js';
import { PALETTE_KEYS } from './tone.js';

export interface WeightedItem<T> {
  value: T;
  weight: number;
}

/**
 * Compositional generator for a single action phrase. Keys mirror
 * `PaletteKey` so palette and action grammar move together.
 */
export interface ActionGrammar {
  verbs: WeightedItem<string>[];
  objects: WeightedItem<string>[];
  modifiers?: WeightedItem<string>[];
  /** Verb-only intransitive forms that don't take an object. */
  intransitiveVerbs?: WeightedItem<string>[];
  /** Probability of appending a modifier (independent of intransitive). */
  modifierProbability: number;
  /** Probability of using an intransitive verb (no object). */
  intransitiveProbability: number;
}

/**
 * Toggles for the structural pieces of an action phrase. When a piece is
 * disabled, `composeAction` skips it entirely regardless of the grammar's
 * own probabilities.
 */
export interface ActionShapeOptions {
  /**
   * If `false`, never emit a `verb object` form. The intransitive pool is
   * used when available; otherwise a verb is emitted alone (no object).
   */
  includeObjects: boolean;
  /** If `false`, never append a modifier. */
  includeModifiers: boolean;
}

export const DEFAULT_ACTION_SHAPE: ActionShapeOptions = {
  includeObjects: true,
  includeModifiers: true,
};

const transitiveCommon: WeightedItem<string>[] = [
  { value: 'scratches', weight: 3 },
  { value: 'sniffs', weight: 3 },
  { value: 'paws at', weight: 2 },
  { value: 'tilts', weight: 2 },
  { value: 'licks', weight: 2 },
  { value: 'nuzzles', weight: 2 },
  { value: 'cocks', weight: 1 },
];

const objectsCommon: WeightedItem<string>[] = [
  { value: 'ear', weight: 3 },
  { value: 'paw', weight: 3 },
  { value: 'nose', weight: 2 },
  { value: 'head', weight: 3 },
  { value: 'tail', weight: 2 },
  { value: 'the air', weight: 2 },
  { value: 'own paw', weight: 1 },
  { value: 'nothing in particular', weight: 1 },
];

const modifiersCommon: WeightedItem<string>[] = [
  { value: 'vigorously', weight: 2 },
  { value: 'slowly', weight: 2 },
  { value: 'confusedly', weight: 1 },
  { value: 'hopefully', weight: 1 },
  { value: 'three times', weight: 1 },
  { value: 'once', weight: 1 },
];

/**
 * Default action grammars per palette key. Each palette tilts its own
 * verb/object weights so high-arousal positive feels different from
 * low-arousal negative.
 */
export const GRAMMARS: Record<PaletteKey, ActionGrammar> = {
  highPositive: {
    verbs: [
      { value: 'wags', weight: 4 },
      { value: 'thumps', weight: 2 },
      { value: 'bonks', weight: 2 },
      { value: 'boops', weight: 2 },
      { value: 'licks', weight: 3 },
      { value: 'nuzzles', weight: 2 },
      { value: 'paws at', weight: 2 },
    ],
    objects: [
      { value: 'tail', weight: 4 },
      { value: 'your hand', weight: 3 },
      { value: 'your face', weight: 2 },
      { value: 'the floor', weight: 2 },
      { value: 'a passing leaf', weight: 1 },
      { value: 'the air', weight: 2 },
    ],
    modifiers: modifiersCommon,
    intransitiveVerbs: [
      { value: 'spins in a circle', weight: 3 },
      { value: 'bounces around', weight: 3 },
      { value: 'does zoomies', weight: 2 },
      { value: 'wiggles all over', weight: 2 },
    ],
    modifierProbability: 0.25,
    intransitiveProbability: 0.4,
  },
  lowPositive: {
    verbs: [
      { value: 'nuzzles', weight: 4 },
      { value: 'licks', weight: 4 },
      { value: 'leans on', weight: 3 },
      { value: 'rests against', weight: 2 },
      { value: 'gently paws at', weight: 2 },
      { value: 'sniffs', weight: 2 },
    ],
    objects: [
      { value: 'your hand', weight: 4 },
      { value: 'your face', weight: 2 },
      { value: 'your knee', weight: 3 },
      { value: 'the couch', weight: 2 },
      { value: 'a soft blanket', weight: 1 },
    ],
    modifiers: [
      { value: 'softly', weight: 3 },
      { value: 'contentedly', weight: 2 },
      { value: 'with great affection', weight: 1 },
    ],
    intransitiveVerbs: [
      { value: 'flops', weight: 2 },
      { value: 'rests its chin on your knee', weight: 2 },
    ],
    modifierProbability: 0.3,
    intransitiveProbability: 0.25,
  },
  highNegative: {
    verbs: [
      { value: 'bares teeth at', weight: 3 },
      { value: 'growls at', weight: 4 },
      { value: 'snaps at', weight: 2 },
      { value: 'pins ears back at', weight: 2 },
      { value: 'huffs at', weight: 2 },
    ],
    objects: [
      { value: 'the offender', weight: 3 },
      { value: 'the door', weight: 2 },
      { value: 'an unseen menace', weight: 2 },
      { value: 'thin air', weight: 2 },
      { value: 'the vacuum cleaner', weight: 1 },
    ],
    modifiers: [
      { value: 'with feeling', weight: 2 },
      { value: 'menacingly', weight: 2 },
      { value: 'with great prejudice', weight: 1 },
    ],
    intransitiveVerbs: [
      { value: 'stomps', weight: 2 },
      { value: 'glares', weight: 3 },
      // { value: 'hackles raise', weight: 2 },
    ],
    modifierProbability: 0.25,
    intransitiveProbability: 0.3,
  },
  fear: {
    verbs: [
      { value: 'tucks', weight: 3 },
      { value: 'hides behind', weight: 3 },
      { value: 'flinches at', weight: 2 },
      { value: 'shrinks from', weight: 2 },
    ],
    objects: [
      { value: 'tail', weight: 3 },
      { value: 'your leg', weight: 3 },
      { value: 'the couch', weight: 2 },
      { value: 'the doorway', weight: 1 },
    ],
    modifiers: [
      { value: 'tentatively', weight: 2 },
      { value: 'anxiously', weight: 2 },
      { value: 'with wide eyes', weight: 2 },
    ],
    intransitiveVerbs: [
      { value: 'whimpers softly', weight: 3 },
      { value: 'tremors', weight: 2 },
      { value: 'pins ears flat', weight: 2 },
    ],
    modifierProbability: 0.3,
    intransitiveProbability: 0.4,
  },
  lowNegative: {
    verbs: [
      { value: 'droops', weight: 4 },
      { value: 'lays down', weight: 2 },
      { value: 'rests', weight: 2 },
      { value: 'stares at', weight: 2 },
    ],
    objects: [
      { value: 'ears', weight: 3 },
      { value: 'head on paws', weight: 3 },
      { value: 'nothing in particular', weight: 3 },
      { value: 'an empty bowl', weight: 1 },
    ],
    modifiers: [
      { value: 'mournfully', weight: 2 },
      { value: 'heavily', weight: 2 },
      { value: 'with a long sigh', weight: 1 },
    ],
    intransitiveVerbs: [
      { value: 'sighs', weight: 3 },
      { value: 'flops', weight: 2 },
      { value: 'whines', weight: 2 },
    ],
    modifierProbability: 0.35,
    intransitiveProbability: 0.45,
  },
  curious: {
    verbs: [
      { value: 'tilts', weight: 4 },
      { value: 'cocks', weight: 3 },
      { value: 'sniffs', weight: 3 },
      { value: 'pricks', weight: 2 },
      { value: 'nudges', weight: 2 },
    ],
    objects: [
      { value: 'head', weight: 4 },
      { value: 'ears', weight: 3 },
      { value: 'the air', weight: 3 },
      { value: 'a curious object', weight: 2 },
      { value: 'the source of the noise', weight: 1 },
    ],
    modifiers: [
      { value: 'inquisitively', weight: 2 },
      { value: 'thoughtfully', weight: 2 },
      { value: 'just so', weight: 1 },
    ],
    intransitiveVerbs: [
      { value: 'looks around', weight: 2 },
      { value: 'perks up', weight: 3 },
    ],
    modifierProbability: 0.3,
    intransitiveProbability: 0.25,
  },
  neutral: {
    verbs: transitiveCommon,
    objects: objectsCommon,
    modifiers: modifiersCommon,
    intransitiveVerbs: [
      { value: 'looks around', weight: 2 },
      { value: 'sits down', weight: 2 },
      { value: 'sniffs the air', weight: 2 },
    ],
    modifierProbability: 0.2,
    intransitiveProbability: 0.25,
  },
};

/** Pick a palette key from the mix, weighted. Falls back to `neutral`. */
export function pickPaletteKey(mix: PaletteMix, rng: Random): PaletteKey {
  const keys = PALETTE_KEYS;
  const weights = keys.map((k) => mix.weights[k]);
  const total = weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
  if (total <= 0) return 'neutral';
  return rng.pickWeighted(keys, weights);
}

function weightsWithDedup<T>(
  items: readonly WeightedItem<T>[],
  recent: RecentBuffer<T>,
): { values: T[]; weights: number[] } {
  const values = items.map((i) => i.value);
  const weights = items.map((i) => (recent.has(i.value) ? 0 : i.weight));
  return { values, weights };
}

/**
 * Generate a single action phrase, e.g. `*scratches ear*` or `*spins in a circle*`.
 *
 * Picks a `PaletteKey` from the mix, then either:
 * - intransitive: just `verb` (with optional modifier)
 * - transitive: `verb object` (with optional modifier)
 *
 * Recent buffers zero out the weight of recently-used verbs and verb+object
 * pairs to push the sampler toward fresh combinations.
 *
 * `shape` toggles whether objects and modifiers are emitted at all. With
 * `includeObjects: false`, intransitive verbs are preferred when available
 * and otherwise a transitive verb is emitted alone (no object).
 */
export function composeAction(
  mix: PaletteMix,
  rng: Random,
  recent: { verbs: RecentBuffer<string>; verbObjects: RecentBuffer<string> },
  grammars: Record<PaletteKey, ActionGrammar>,
  shape: ActionShapeOptions = DEFAULT_ACTION_SHAPE,
): string {
  const key = pickPaletteKey(mix, rng);
  const grammar = grammars[key];

  const hasIntransitive =
    !!grammar.intransitiveVerbs && grammar.intransitiveVerbs.length > 0;

  // When objects are disabled, force the intransitive path (when
  // available). Otherwise, sample by the grammar's own probability.
  const useIntransitive = !shape.includeObjects
    ? hasIntransitive
    : hasIntransitive && rng.bool(grammar.intransitiveProbability);

  let body: string;
  let verb: string;

  if (useIntransitive) {
    const { values, weights } = weightsWithDedup(
      grammar.intransitiveVerbs!,
      recent.verbs,
    );
    verb = rng.pickWeighted(values, weights);
    body = verb;
  } else if (!shape.includeObjects) {
    // No intransitive pool to fall back on; emit the verb alone.
    const verbDedup = weightsWithDedup(grammar.verbs, recent.verbs);
    verb = rng.pickWeighted(verbDedup.values, verbDedup.weights);
    body = verb;
  } else {
    const verbDedup = weightsWithDedup(grammar.verbs, recent.verbs);
    verb = rng.pickWeighted(verbDedup.values, verbDedup.weights);

    const objects = grammar.objects;
    const objWeights = objects.map((o) => {
      const pair = `${verb}:${o.value}`;
      return recent.verbObjects.has(pair) ? 0 : o.weight;
    });
    const obj = rng.pickWeighted(
      objects.map((o) => o.value),
      objWeights,
    );
    body = `${verb} ${obj}`;
    recent.verbObjects.push(`${verb}:${obj}`);
  }

  recent.verbs.push(verb);

  if (
    shape.includeModifiers &&
    grammar.modifiers &&
    grammar.modifiers.length > 0 &&
    rng.bool(grammar.modifierProbability)
  ) {
    const mod = rng.pickWeighted(
      grammar.modifiers.map((m) => m.value),
      grammar.modifiers.map((m) => m.weight),
    );
    body = `${body} ${mod}`;
  }

  return `*${body}*`;
}
