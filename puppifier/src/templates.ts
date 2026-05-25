import type { Random } from './random.js';

export type Slot = 'sound' | 'action' | 'opener' | 'closer' | 'allowedInput';

export interface Template {
  slots: Slot[];
  weight: number;
  /** Template only eligible when `intensity >= minIntensity`. */
  minIntensity?: number;
}

/**
 * Sentence-level shape catalogue. Each translation picks one and fills
 * its slots from the palette + grammar.
 */
export const TEMPLATES: Template[] = [
  { slots: ['sound'], weight: 3 },
  { slots: ['sound', 'action',  'allowedInput'], weight: 4 },
  { slots: ['opener', 'allowedInput', 'sound'], weight: 1 },
  { slots: ['sound', 'action', 'allowedInput', 'sound'], weight: 2, minIntensity: 0.5 },
  { slots: ['action', 'allowedInput', 'sound'], weight: 1 },
  { slots: ['sound', 'allowedInput', 'closer'], weight: 1, minIntensity: 0.3 },
];

/**
 * Pick a template eligible at the given intensity, weighted. If no
 * template is eligible (shouldn't happen with the default catalogue but
 * is defensible), falls back to a single-sound shape.
 */
export function pickTemplate(
  intensity: number,
  rng: Random,
  templates: readonly Template[] = TEMPLATES,
): Template {
  const eligible = templates.filter(
    (t) => (t.minIntensity ?? 0) <= intensity,
  );
  if (eligible.length === 0) {
    return { slots: ['sound'], weight: 1 };
  }
  return rng.pickWeighted(
    eligible,
    eligible.map((t) => t.weight),
  );
}
