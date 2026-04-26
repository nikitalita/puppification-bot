import {
  get_phrase_emotion_classification,
  type Classifier,
  type PhraseEmotionClassification,
  type ToneScore,
} from 'emotion-classifier';
import { defaultProfile, type Profile } from './profile.js';
import { createRandom, type Random } from './random.js';
import { makeRecentBuffers, translateSentence } from './translator.js';

export type { Classifier, PhraseEmotionClassification, ToneScore };
export type { Profile } from './profile.js';

export interface PuppifiedSentence {
  source: string;
  dog: string;
  tone: ToneScore[];
}

export interface PuppifyResult {
  text: string;
  source: string;
  phraseTone: ToneScore[];
  sentences: PuppifiedSentence[];
  seed: number;
}

export interface PuppifyOptions {
  /** If omitted, a fresh crypto-random seed is generated each call. */
  seed?: number | string;
  /**
   * Inject a Classifier (e.g. the fake from tests). Defaults to the
   * emotion-classifier singleton. Ignored by `puppify_classification` /
   * `Puppifier#translateClassification`, which never invoke the classifier.
   */
  classifier?: Classifier;
  /**
   * Forwarded to emotion-classifier. Default 3. Ignored by
   * `puppify_classification` / `Puppifier#translateClassification`.
   */
  topK?: number;
}

/**
 * Single shared render path. Both entry points and the Puppifier class
 * delegate here, so they cannot drift.
 */
function renderClassification(
  classification: PhraseEmotionClassification,
  random: Random,
  seed: number,
  profile: Profile,
): PuppifyResult {
  const buffers = makeRecentBuffers(profile);
  const ctx = { rng: random, profile, buffers };
  const sentences: PuppifiedSentence[] = classification.sentences.map((s) => ({
    source: s.text,
    tone: s.tone,
    dog: translateSentence(s.text, s.tone, ctx),
  }));
  return {
    text: sentences.map((s) => s.dog).join(' ').trim(),
    source: classification.phrase.text,
    phraseTone: classification.phrase.tone,
    sentences,
    seed,
  };
}

/**
 * Core translation entry point. Skips the classifier entirely; renders
 * dog-speech directly from a pre-computed `PhraseEmotionClassification`.
 *
 * Synchronous: no inference, no I/O. Useful when callers already have the
 * classification (cached, batched, or computed elsewhere) and want to
 * avoid re-running inference.
 *
 * `options.classifier` and `options.topK` are ignored on this path.
 */
export function puppify_classification(
  classification: PhraseEmotionClassification,
  options: PuppifyOptions = {},
): PuppifyResult {
  const { random, seed } = createRandom(options.seed);
  return renderClassification(classification, random, seed, defaultProfile);
}

/** camelCase alias of {@link puppify_classification}. */
export const puppifyClassification = puppify_classification;

/**
 * Convenience entry point: runs the emotion-classifier on `text`, then
 * delegates to `puppify_classification` to render the result.
 */
export async function puppify(
  text: string,
  options: PuppifyOptions = {},
): Promise<PuppifyResult> {
  const classification = await get_phrase_emotion_classification(text, {
    classifier: options.classifier,
    topK: options.topK,
  });
  return puppify_classification(classification, options);
}

/**
 * snake_case alias matching the emotion-classifier convention. Same
 * function signature and behavior as {@link puppify}.
 */
export const puppify_text = puppify;

/**
 * Stateful variant. Holds a single RNG stream and (optionally) an
 * injected classifier so successive `translate()` / `translateClassification()`
 * calls share the same deterministic stream after `setSeed(...)`.
 */
export class Puppifier {
  private random: Random;
  private currentSeed: number;
  private readonly classifier: Classifier | undefined;
  private readonly topK: number | undefined;
  private readonly profile: Profile;

  constructor(options: PuppifyOptions = {}) {
    const { random, seed } = createRandom(options.seed);
    this.random = random;
    this.currentSeed = seed;
    this.classifier = options.classifier;
    this.topK = options.topK;
    this.profile = defaultProfile;
  }

  /** Reset the RNG stream from a fresh seed. */
  setSeed(seed: number | string): void {
    const { random, seed: numericSeed } = createRandom(seed);
    this.random = random;
    this.currentSeed = numericSeed;
  }

  /** Runs the classifier on `text`, then renders. */
  async translate(text: string): Promise<PuppifyResult> {
    const classification = await get_phrase_emotion_classification(text, {
      classifier: this.classifier,
      topK: this.topK,
    });
    return renderClassification(
      classification,
      this.random,
      this.currentSeed,
      this.profile,
    );
  }

  /**
   * Renders directly from a pre-computed classification. Synchronous;
   * the classifier is never invoked.
   */
  translateClassification(
    classification: PhraseEmotionClassification,
  ): PuppifyResult {
    return renderClassification(
      classification,
      this.random,
      this.currentSeed,
      this.profile,
    );
  }
}
