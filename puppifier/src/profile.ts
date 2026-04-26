import type { ActionGrammar, ActionShapeOptions } from './grammar.js';
import { DEFAULT_ACTION_SHAPE, GRAMMARS } from './grammar.js';
import type { MorphologyProbs } from './morphology.js';
import type { Palette } from './palettes.js';
import { PALETTES } from './palettes.js';
import type { Template } from './templates.js';
import { TEMPLATES } from './templates.js';
import type { PaletteKey } from './tone.js';

export interface DensityProfile {
  /** Average sound tokens per source word; jittered per call. */
  soundsPerWord: number;
  /** Action phrases per sentence at intensity 1; scales with intensity. */
  actionsPerSentence: number;
  /**
   * Symmetric jitter range applied to derived counts (added before round).
   * 0.5 means "+/- 0.5 expected".
   */
  jitter: number;
  /** Recent-use buffer windows. */
  windowSizes: {
    sounds: number;
    verbs: number;
    verbObjects: number;
  };
  /** Hard ceiling per sentence to keep output sane. */
  maxSoundsPerSentence: number;
  maxActionsPerSentence: number;
}

/**
 * The bundle of every personality-tunable knob. v1 ships exactly one
 * profile (`defaultProfile`); v2 adds presets without changing the
 * public API.
 */
export interface Profile {
  palettes: Record<PaletteKey, Palette>;
  grammars: Record<PaletteKey, ActionGrammar>;
  morphology: MorphologyProbs;
  density: DensityProfile;
  templates: Template[];
  /**
   * Toggles for the structural pieces of an action phrase
   * (`*verb object modifier*`). Set `includeObjects: false` for a
   * minimalist personality that only uses intransitive forms; set
   * `includeModifiers: false` to forbid trailing adverbs.
   */
  actionShape: ActionShapeOptions;
  /**
   * When `true` (the default), all `*...*` action phrases are relocated
   * to the end of each sentence regardless of where the chosen template
   * places them. Sound clusters keep their relative order; actions keep
   * their relative order. Set to `false` to honor the template's slot
   * positions (allowing openers and mid-sentence actions).
   */
  actionsAtEndOnly: boolean;
}

const defaultMorphology: MorphologyProbs = {
  stretchVowelBase: 0.15,
  stretchVowelIntensityScale: 0.35,
  vowelStretchMin: 1,
  vowelStretchMax: 4,

  doubleLeadBase: 0.1,
  doubleLeadIntensityScale: 0.25,
  leadDoubleMin: 1,
  leadDoubleMax: 3,

  // Bounded to 1 extra copy per repeat (so a single morph emits at most
  // two of the same surface form) to keep "no 3-in-a-row" achievable
  // when combined with the recent-use buffer dedup.
  repeatBase: 0.05,
  repeatIntensityScale: 0.25,
  repeatMin: 1,
  repeatMax: 1,

  capitalizeFirstBase: 0.15,
};

const defaultDensity: DensityProfile = {
  soundsPerWord: 0.85,
  actionsPerSentence: 1.0,
  jitter: 0.5,
  windowSizes: {
    sounds: 4,
    verbs: 6,
    verbObjects: 10,
  },
  maxSoundsPerSentence: 12,
  maxActionsPerSentence: 3,
};

export const defaultProfile: Profile = {
  palettes: PALETTES,
  grammars: GRAMMARS,
  morphology: defaultMorphology,
  density: defaultDensity,
  templates: TEMPLATES,
  actionShape: DEFAULT_ACTION_SHAPE,
  actionsAtEndOnly: true,
};
