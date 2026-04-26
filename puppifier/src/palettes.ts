import type { PaletteKey } from './tone.js';

export interface SoundEntry {
  /** Base form before morphology. Lowercase. */
  base: string;
  /** Sampling weight; 0 disables the entry. */
  weight: number;
}

export interface Palette {
  /** Main pool of sound bases. Morphology is applied on top. */
  sounds: SoundEntry[];
  /**
   * Optional pool used for the `'opener'` template slot. Falls back to
   * `sounds` when omitted.
   */
  interjections?: SoundEntry[];
}

/**
 * Hand-curated sound bases per palette. Quantities are intentionally small
 * so the morphology layer carries most of the variety; widening these
 * tables is fine, but add property-test thresholds with that in mind.
 */
export const PALETTES: Record<PaletteKey, Palette> = {
  highPositive: {
    sounds: [
      { base: 'bark', weight: 4 },
      { base: 'woof', weight: 4 },
      { base: 'ruff', weight: 3 },
      { base: 'yip', weight: 3 },
      { base: 'yap', weight: 2 },
      { base: 'arf', weight: 3 },
      { base: 'boof', weight: 0.2 },
    ],
    interjections: [
      { base: 'arrruuf', weight: 3 },
      { base: 'arooo', weight: 2 },
      { base: 'yipe', weight: 2 },
    ],
  },
  lowPositive: {
    sounds: [
      { base: 'mrrf', weight: 4 },
      { base: 'hrrm', weight: 3 },
      { base: 'woof', weight: 2 },
      { base: 'snrrf', weight: 2 },
      { base: 'brrf', weight: 2 },
      { base: 'hmpf', weight: 2 },
      { base: 'boof', weight: 0.2 },
    ],
    interjections: [
      { base: 'mrrrf', weight: 2 },
      { base: 'hrrm', weight: 2 },
    ],
  },
  highNegative: {
    sounds: [
      { base: 'grr', weight: 4 },
      { base: 'grrr', weight: 4 },
      { base: 'rrgh', weight: 3 },
      { base: 'woof', weight: 1 },
      { base: 'snarl', weight: 2 },
      { base: 'gnar', weight: 2 },
    ],
    interjections: [
      { base: 'grrrr', weight: 3 },
      { base: 'rrrgh', weight: 2 },
    ],
  },
  fear: {
    sounds: [
      { base: 'whine', weight: 4 },
      { base: 'hrr', weight: 3 },
      { base: 'mrrr', weight: 3 },
      { base: 'ehhh', weight: 2 },
      { base: 'eeep', weight: 2 },
      { base: 'awoo', weight: 1 },
    ],
    interjections: [
      { base: 'eeep', weight: 2 },
      { base: 'mrrr', weight: 2 },
    ],
  },
  lowNegative: {
    sounds: [
      { base: 'awoo', weight: 4 },
      { base: 'ohhhh', weight: 3 },
      { base: 'hrmmm', weight: 3 },
      { base: 'mrrr', weight: 3 },
      { base: 'whine', weight: 2 },
    ],
    interjections: [
      { base: 'awooo', weight: 3 },
      { base: 'ohhhh', weight: 2 },
    ],
  },
  curious: {
    sounds: [
      { base: 'ruff', weight: 3 },
      { base: 'boof', weight: 0.2 },
      { base: 'mrrf', weight: 3 },
      { base: 'hrm', weight: 3 },
      { base: 'ahrooo', weight: 2 },
    ],
    interjections: [
      { base: 'hrm', weight: 3 },
      { base: 'ahrooo', weight: 2 },
    ],
  },
  neutral: {
    sounds: [
      { base: 'bark', weight: 4 },
      { base: 'woof', weight: 4 },
      { base: 'ruff', weight: 3 },
      { base: 'hrm', weight: 1 },
      { base: 'mrrf', weight: 1 },
      { base: 'boof', weight: 0.2 },
      { base: 'snrf', weight: 1 },
    ],
    interjections: [
      { base: 'arrruuf', weight: 3 },
    ]
  },
};
