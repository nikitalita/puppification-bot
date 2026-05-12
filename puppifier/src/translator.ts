import type { ToneScore } from 'emotion-classifier';
import { EasterEgg, findOverride, findTags, findWordReplacement } from './easterEggs.js';
import { blendActionProbability, composeAction, puppyWordsString, puppyWordsRegex } from './grammar.js';
import { morph } from './morphology.js';
import type { Palette, SoundEntry } from './palettes.js';
import type { Profile } from './profile.js';
import type { Random } from './random.js';
import { RecentBuffer } from './recent.js';
import { pickTemplate } from './templates.js';
import type { Slot, Template } from './templates.js';
import { blendTones, PALETTE_KEYS } from './tone.js';
import type { PaletteKey, PaletteMix } from './tone.js';

export interface TranslateBuffers {
  sounds: RecentBuffer<string>;
  verbs: RecentBuffer<string>;
  verbObjects: RecentBuffer<string>;
}

export interface TranslateContext {
  rng: Random;
  profile: Profile;
  buffers: TranslateBuffers;
}

/** Construct a fresh set of recent-use buffers from a profile. */
export function makeRecentBuffers(profile: Profile): TranslateBuffers {
  const w = profile.density.windowSizes;
  return {
    sounds: new RecentBuffer<string>(w.sounds),
    verbs: new RecentBuffer<string>(w.verbs),
    verbObjects: new RecentBuffer<string>(w.verbObjects),
  };
}

function isAllowedWord(word: string): boolean {
  let testWord = word.toLowerCase();
  if (puppyWordsString.has(testWord)) {
    return true;
  }
  for (let r of puppyWordsRegex) {
    if (r.test(testWord)) {
      return true;
    }
  }

  return false;
}

function getWords(s: string): string[] | null {
  const m = s.trim().match(/(\S+)/g);
  return m;
}

function endsWithEllipsis(s: string): boolean {
  return /\.\.\.\s*["')\]]*\s*$/.test(s);
}

function trailingPunctuation(s: string): '!' | '?' | '...' | '.' | '' {
  const trimmed = s.trim();
  if (trimmed.length === 0) return '';
  if (endsWithEllipsis(trimmed)) return '...';
  const last = trimmed[trimmed.length - 1]!;
  if (last === '!' || last === '?' || last === '.') return last;
  return '';
}

function isAllUppercase(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
}

interface PickedSound {
  entry: SoundEntry;
  /** Caps probability of the palette this entry was drawn from. */
  capsProbability: number;
}

/**
 * Pick a sound from a blended palette mix.
 *
 * Strategy: pick a palette key by mix weight, then within that palette
 * pick a `SoundEntry` weighted by its base weight, with recently-used
 * base sounds zeroed out. If the chosen palette has every entry recent,
 * we fall back to ignoring the dedup so we never deadlock. Returns the
 * full entry plus the picked palette's caps probability so the caller
 * can pass both through to `morph`.
 */
function pickSound(
  mix: PaletteMix,
  rng: Random,
  recent: RecentBuffer<string>,
  palettes: Record<PaletteKey, Palette>,
  source: 'sounds' | 'interjections',
): PickedSound {
  const keys = PALETTE_KEYS;
  const keyWeights = keys.map((k) => mix.weights[k]);
  const keyTotal = keyWeights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
  const key: PaletteKey =
    keyTotal > 0 ? rng.pickWeighted(keys, keyWeights) : 'neutral';

  const palette = palettes[key];
  let entries: SoundEntry[] | undefined =
    source === 'interjections' ? palette.interjections : palette.sounds;
  if (!entries || entries.length === 0) entries = palette.sounds;

  const dedupedWeights = entries.map((e) =>
    recent.has(e.base) ? 0 : e.weight,
  );
  const total = dedupedWeights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
  const weights = total > 0 ? dedupedWeights : entries.map((e) => e.weight);

  const chosen = rng.pickWeighted(entries, weights);
  recent.push(chosen.base);
  return { entry: chosen, capsProbability: palette.capsProbability };
}

interface SoundClusterResult {
  cluster: string;
  bases: string[];
}

/** Generate a single sound cluster of `count` morphed sound tokens. */
function generateSoundCluster(
  count: number,
  mix: PaletteMix,
  ctx: TranslateContext,
  source: 'sounds' | 'interjections',
): SoundClusterResult {
  const { rng, profile, buffers } = ctx;
  const tokens: string[] = [];
  const bases: string[] = [];
  for (let i = 0; i < count; i++) {
    const picked = pickSound(mix, rng, buffers.sounds, profile.palettes, source);
    bases.push(picked.entry.base);
    const token = morph(
      picked.entry,
      mix.intensity,
      picked.capsProbability,
      rng,
      profile.morphology,
    );
    tokens.push(token);
  }
  return { cluster: tokens.join(' '), bases };
}

function clusterSizesForSlots(
  template: Template,
  totalSounds: number,
): number[] {
  const soundSlots = template.slots.filter((s) => s === 'sound').length;
  if (soundSlots === 0) return [];
  const base = Math.floor(totalSounds / soundSlots);
  const remainder = totalSounds - base * soundSlots;
  const sizes: number[] = [];
  for (let i = 0; i < soundSlots; i++) {
    sizes.push(Math.max(1, base + (i < remainder ? 1 : 0)));
  }
  return sizes;
}

function jittered(
  expected: number,
  jitter: number,
  rng: Random,
  min: number,
  max: number,
): number {
  const offset = (rng.next() * 2 - 1) * jitter;
  const raw = Math.round(expected + offset);
  return Math.min(max, Math.max(min, raw));
}

function uppercaseLastCluster(parts: string[]): string[] {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    if (p.startsWith('*')) continue; // skip action phrases
    parts[i] = p.toUpperCase();
    break;
  }
  return parts;
}

function appendPunctuationToLastSound(
  parts: string[],
  punct: string,
): string[] {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    if (p.startsWith('*')) continue;
    parts[i] = p + punct;
    return parts;
  }
  if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1] + punct;
  return parts;
}

function hasOpenerAction(parts: string[]): boolean {
  return parts.length > 0 && parts[0]!.startsWith('*');
}

function getAllowedWordCount(wordArray: string[]): number {
  let returnCount = 0;
  for (let word of wordArray) {
    let wordReplace: EasterEgg | undefined = undefined;
    if (isAllowedWord(word)) {
      returnCount++;
    }
    else if (
      (wordReplace = findWordReplacement(word)) 
      && wordReplace?.render
    ) {
      returnCount++;
    }
  }
  return returnCount;
}

/**
 * Translate a single sentence into a dog-speech string. See the plan's
 * "translator algorithm" section for the full step-by-step.
 */
export function translateSentence(
  sentence: string,
  tone: readonly ToneScore[],
  ctx: TranslateContext,
): string {
  const trimmed = sentence.trim();
  if (trimmed.length === 0) return '';

  let addNewLine = false;
  if (sentence.charAt(sentence.length-1) === "\n") {
    addNewLine = true;
  }

  const mix = blendTones(tone);

  const override = findOverride(trimmed);
  if (override?.render) {
    return override.render({ rng: ctx.rng, mix, matches: override.matches }) + (addNewLine ? '\n' : '');
  }

  const tags = findTags(trimmed);
  const wantsEarsPerk = tags.some((t) => t.tag === 'earsPerk');

  const template = pickTemplate(mix.intensity, ctx.rng, ctx.profile.templates);
  const density = ctx.profile.density;

  const wordArray = getWords(trimmed);
  if (!wordArray) { return ""; }
  const wordCount = wordArray?.length;
  const expectedSounds = Math.max(
    1,
    (wordCount - getAllowedWordCount(wordArray)) * density.soundsPerWord + (mix.intensity > 0 ? 0 : 0),
  );
  const totalSounds = jittered(
    expectedSounds,
    density.jitter,
    ctx.rng,
    1,
    density.maxSoundsPerSentence,
  );

  const expectedActions = density.actionsPerSentence * mix.intensity;
  const actionSlotsInTemplate = template.slots.filter(
    (s) => s === 'action' || s === 'opener' || s === 'closer',
  ).length;
  const targetActions = jittered(
    expectedActions,
    density.jitter,
    ctx.rng,
    0,
    Math.max(0, density.maxActionsPerSentence),
  );

  // Per-mix probability gate: the weighted blend of each palette's
  // `actionProbability`. A "happy" sentence (high-positive heavy) clears
  // the gate often; a "neutral" sentence rarely does. Sampled fresh per
  // candidate slot so multi-action templates don't all-or-nothing.
  const actionGateProbability = blendActionProbability(
    mix,
    ctx.profile.grammars,
  );
  const tryEmitAction = () => ctx.rng.bool(actionGateProbability);

  const clusterSizes = clusterSizesForSlots(template, totalSounds);
  let soundIdx = 0;
  let actionsEmitted = 0;
  const parts: string[] = [];
  let allowedInputEmitted = false;

  /**
   * Side effect: increments actions emitted for every action easter egg. 
   * @param wordArray input separated into words
   * @returns array of parts for sentence from allowed and replaced words
   */
  function getAllowedWords(wordArray: string[]): string[] {
    let returnParts = [];
    for (let word of wordArray) {
      let wordReplace: EasterEgg | undefined = undefined;
      if (isAllowedWord(word)) {
        returnParts.push(word);
      }
      else if (
        (wordReplace = findWordReplacement(word)) 
        && wordReplace?.render
      ) {
        returnParts.push(wordReplace.render({ rng: ctx.rng, mix, matches: wordReplace.matches }));
        if (wordReplace.grammar === "action") {
          actionsEmitted++;
        }
      }
    }
    return returnParts;
  }

  for (const slot of template.slots) {
    switch (slot satisfies Slot) {
      case 'sound': {
        const size = clusterSizes[soundIdx++] ?? 1;
        const { cluster } = generateSoundCluster(size, mix, ctx, 'sounds');
        parts.push(cluster);
        break;
      }
      case 'allowedInput':
        parts.push(... getAllowedWords(wordArray));
        allowedInputEmitted = true;
        break;
      case 'opener': {
        if (
          actionSlotsInTemplate > 0 &&
          actionsEmitted < targetActions &&
          tryEmitAction()
        ) {
          const action = composeAction(
            mix,
            ctx.rng,
            { verbs: ctx.buffers.verbs, verbObjects: ctx.buffers.verbObjects },
            ctx.profile.grammars,
            ctx.profile.actionShape,
          );
          parts.push(action);
          actionsEmitted++;
        } else {
          // No action slot, exhausted, or gated out: open with an
          // interjection sound so the sentence still has shape.
          const { cluster } = generateSoundCluster(1, mix, ctx, 'interjections');
          parts.push(cluster);
        }
        break;
      }
      case 'action':
      case 'closer': {
        if (actionsEmitted < targetActions && tryEmitAction()) {
          const action = composeAction(
            mix,
            ctx.rng,
            { verbs: ctx.buffers.verbs, verbObjects: ctx.buffers.verbObjects },
            ctx.profile.grammars,
            ctx.profile.actionShape,
          );
          parts.push(action);
          actionsEmitted++;
        }
        break;
      }
    }
  }

  // Append allowed parts to the end if not included in template
  if (!allowedInputEmitted) {
    parts.push(... getAllowedWords(wordArray));
    allowedInputEmitted = true;
  }

  // Optionally force all `*...*` action phrases to trail the sounds.
  // Done before punctuation so `!` / `?` still land on the last sound
  // (which now sits just before the action group).
  if (ctx.profile.actionsAtEndOnly) {
    const sounds: string[] = [];
    const actions: string[] = [];
    for (const p of parts) {
      (p.startsWith('*') ? actions : sounds).push(p);
    }
    parts.length = 0;
    parts.push(...sounds, ...actions);
  }

  // Soft easter-egg tag: prepend an ears-perk opener if the template
  // didn't already place an action at the front.
  if (wantsEarsPerk && !hasOpenerAction(parts)) {
    parts.unshift('*ears perk up*');
  }

  // Separate sequential actions with a comma
  parts.forEach((part, idx) => {
    if (idx >= parts.length - 1) {
      return;
    }
    if (part.startsWith("*") && parts[idx+1]?.startsWith("*")) {
      parts[idx] = parts[idx] + ",";
    }
  });

  // Punctuation + caps preservation from the source sentence.
  const punct = trailingPunctuation(trimmed);
  if (punct === '!') {
    appendPunctuationToLastSound(parts, '!');
    uppercaseLastCluster(parts);
  } else if (punct === '?') {
    appendPunctuationToLastSound(parts, '?');
    if (!parts.some((p) => p.startsWith('*') && /tilt|cock|head/.test(p))) {
      // Add a head-tilt action only if we haven't already and there's room.
      if (
        actionsEmitted < density.maxActionsPerSentence &&
        ctx.rng.bool(ctx.profile.grammars.curious.actionProbability)
      ) {
        const tilt = composeAction(
          { weights: { ...mix.weights, curious: 1, neutral: 0, highPositive: 0, lowPositive: 0, highNegative: 0, fear: 0, lowNegative: 0 }, intensity: mix.intensity },
          ctx.rng,
          { verbs: ctx.buffers.verbs, verbObjects: ctx.buffers.verbObjects },
          ctx.profile.grammars,
          ctx.profile.actionShape,
        );
        parts.push(tilt);
      }
    }
  } else if (punct === '...') {
    appendPunctuationToLastSound(parts, '...');
  } else if (punct === '.') {
    // Soft trailing punctuation; only add if we don't end with an action.
    const last = parts[parts.length - 1];
    if (last && !last.startsWith('*') && !/[.!?]$/.test(last)) {
      appendPunctuationToLastSound(parts, '.');
    }
  }

  let finalParts = parts.filter((p) => p.length > 0);

  if (isAllUppercase(trimmed)) {
    // Uppercase sound clusters but leave action *...* phrases lowercase so
    // they read naturally. We map across `finalParts` (pre-join) rather
    // than the joined string because actions can contain internal
    // whitespace (e.g. "*stomps off*"); a naive space-split would miss
    // the leading "*" on inner tokens like "off*".
    finalParts = finalParts.map((p) =>
      p.startsWith('*') ? p : p.toUpperCase(),
    );
  }

  return finalParts.join(' ') + (addNewLine ? '\n' : '');
}
