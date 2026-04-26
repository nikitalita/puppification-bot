import { expect } from 'chai';
import {
  capitalizeFirst,
  doubleLead,
  morph,
  repeatToken,
  stretchVowel,
  uppercase,
  type MorphologyProbs,
} from '../src/morphology.ts';
import type { Random } from '../src/random.ts';

function fixedRandom(value: number): Random {
  return {
    next: () => value,
    int: (lo, hi) => lo + Math.floor(value * (hi - lo + 1)),
    pick: (items) => items[Math.floor(value * items.length)]!,
    pickWeighted: (items) => items[Math.floor(value * items.length)]!,
    bool: (p) => value < p,
    shuffle: (items) => items.slice(),
  };
}

describe('morphology atoms', () => {
  describe('stretchVowel', () => {
    it('extends the longest vowel run by `count` chars', () => {
      const out = stretchVowel('ruff', 3, fixedRandom(0));
      expect(out).to.equal('ruuuuff');
    });

    it('returns base unchanged when count <= 0', () => {
      expect(stretchVowel('ruff', 0, fixedRandom(0))).to.equal('ruff');
      expect(stretchVowel('ruff', -1, fixedRandom(0))).to.equal('ruff');
    });

    it('returns base unchanged when there are no vowels', () => {
      expect(stretchVowel('grr', 3, fixedRandom(0))).to.equal('grr');
    });

    it('skips a silent terminal "e" and stretches the earlier vowel', () => {
      // With or without the picker preferring the first run, the
      // silent-e candidate must be dropped, so `whine` always becomes
      // `whiiine`, never `whineee`.
      for (const v of [0, 0.25, 0.5, 0.75, 0.99]) {
        expect(stretchVowel('whine', 2, fixedRandom(v))).to.equal('whiiine');
        expect(stretchVowel('hide', 2, fixedRandom(v))).to.equal('hiiide');
      }
    });

    it('stretches a non-silent terminal vowel run normally', () => {
      // `bee` ends in `ee` (length ≥ 2) so it isn't silent; `e` is the
      // only run, so it must be the one picked. count=2 adds 2 chars.
      expect(stretchVowel('bee', 2, fixedRandom(0))).to.equal('beeee');
      // Single-letter `e` is the only vowel run, so we stretch it
      // (silent-e filter only fires when a fallback exists).
      expect(stretchVowel('the', 2, fixedRandom(0))).to.equal('theee');
    });
  });

  describe('doubleLead', () => {
    it('prepends `count` extra copies of a sustainable leading consonant', () => {
      expect(doubleLead('ruff', 2)).to.equal('rrruff');
      expect(doubleLead('snarl', 1)).to.equal('ssnarl');
      expect(doubleLead('mrrf', 2)).to.equal('mmmrrf');
    });

    it('returns base unchanged when leading char is a stop or semivowel', () => {
      // Stops would read as a stutter ("buh-buh-bark", "guh-guh-grr").
      expect(doubleLead('bark', 2)).to.equal('bark');
      expect(doubleLead('boof', 2)).to.equal('boof');
      expect(doubleLead('grr', 2)).to.equal('grr');
      expect(doubleLead('gnar', 2)).to.equal('gnar');
      expect(doubleLead('woof', 2)).to.equal('woof');
      expect(doubleLead('yip', 2)).to.equal('yip');
    });

    it('returns base unchanged when leading char is a vowel', () => {
      expect(doubleLead('arf', 2)).to.equal('arf');
    });

    it('returns base unchanged when count <= 0', () => {
      expect(doubleLead('ruff', 0)).to.equal('ruff');
    });
  });

  describe('repeatToken', () => {
    it('joins copies with single spaces', () => {
      expect(repeatToken('bark', 1)).to.equal('bark bark');
      expect(repeatToken('bark', 2)).to.equal('bark bark bark');
    });

    it('returns base unchanged when count <= 0', () => {
      expect(repeatToken('bark', 0)).to.equal('bark');
    });
  });

  describe('uppercase / capitalizeFirst', () => {
    it('uppercases or capitalizes correctly', () => {
      expect(uppercase('bark')).to.equal('BARK');
      expect(capitalizeFirst('bark')).to.equal('Bark');
      expect(capitalizeFirst('')).to.equal('');
    });
  });
});

describe('morph composer', () => {
  const baseProbs: MorphologyProbs = {
    stretchVowelBase: 0,
    stretchVowelIntensityScale: 0,
    vowelStretchMin: 1,
    vowelStretchMax: 1,
    doubleLeadBase: 0,
    doubleLeadIntensityScale: 0,
    leadDoubleMin: 1,
    leadDoubleMax: 1,
    repeatBase: 0,
    repeatIntensityScale: 0,
    repeatMin: 1,
    repeatMax: 1,
    uppercaseBase: 0,
    uppercaseIntensityScale: 0,
    capitalizeFirstBase: 0,
  };

  const ruff = { base: 'ruff', weight: 1 };

  it('returns base unchanged when all probabilities are zero', () => {
    const rng = fixedRandom(0.99);
    expect(morph(ruff, 0.5, rng, baseProbs)).to.equal('ruff');
  });

  it('always-true rng with all probs at 1 fires every op', () => {
    const probs: MorphologyProbs = {
      ...baseProbs,
      stretchVowelBase: 1,
      doubleLeadBase: 1,
      repeatBase: 1,
      uppercaseBase: 1,
      vowelStretchMin: 2,
      vowelStretchMax: 2,
      leadDoubleMin: 1,
      leadDoubleMax: 1,
      repeatMin: 1,
      repeatMax: 1,
    };
    const rng: Random = {
      next: () => 0,
      int: (_lo, _hi) => _lo,
      pick: (items) => items[0]!,
      pickWeighted: (items) => items[0]!,
      bool: () => true,
      shuffle: (items) => items.slice(),
    };
    const out = morph(ruff, 1, rng, probs);
    expect(out.toUpperCase()).to.equal(out);
    expect(out).to.include(' ');
  });

  it('intensity scaling is monotonic for stretch probability', () => {
    const probs: MorphologyProbs = {
      ...baseProbs,
      stretchVowelBase: 0.0,
      stretchVowelIntensityScale: 1.0,
    };
    const rngThatFiresAt = (threshold: number): Random => ({
      next: () => threshold,
      int: () => 1,
      pick: (items) => items[0]!,
      pickWeighted: (items) => items[0]!,
      bool: (p) => threshold < p,
      shuffle: (items) => items.slice(),
    });
    const rng = rngThatFiresAt(0.4);
    expect(morph(ruff, 0.3, rng, probs)).to.equal('ruff');
    expect(morph(ruff, 0.5, rng, probs)).to.not.equal('ruff');
  });

  it('uppercase is mutually exclusive with capitalizeFirst', () => {
    const probs: MorphologyProbs = {
      ...baseProbs,
      uppercaseBase: 1,
      capitalizeFirstBase: 1,
    };
    // Probability-honest rng: bool(p) only fires when p >= 1.
    const rng: Random = {
      next: () => 0,
      int: () => 1,
      pick: (items) => items[0]!,
      pickWeighted: (items) => items[0]!,
      bool: (p) => p >= 1,
      shuffle: (items) => items.slice(),
    };
    expect(morph(ruff, 0, rng, probs)).to.equal('RUFF');
  });
});
