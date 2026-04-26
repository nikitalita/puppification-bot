import { expect } from 'chai';
import {
  blendActionProbability,
  composeAction,
  DEFAULT_ACTION_SHAPE,
  GRAMMARS,
  pickPaletteKey,
} from '../src/grammar.ts';
import { createRandom } from '../src/random.ts';
import { RecentBuffer } from '../src/recent.ts';
import type { PaletteMix } from '../src/tone.ts';

function highPositiveMix(): PaletteMix {
  return {
    weights: {
      highPositive: 1,
      lowPositive: 0,
      highNegative: 0,
      fear: 0,
      lowNegative: 0,
      curious: 0,
      neutral: 0,
    },
    intensity: 0.9,
  };
}

function neutralMix(): PaletteMix {
  return {
    weights: {
      highPositive: 0,
      lowPositive: 0,
      highNegative: 0,
      fear: 0,
      lowNegative: 0,
      curious: 0,
      neutral: 1,
    },
    intensity: 0.1,
  };
}

function makeBuffers() {
  return {
    verbs: new RecentBuffer<string>(6),
    verbObjects: new RecentBuffer<string>(10),
  };
}

describe('pickPaletteKey', () => {
  it('returns neutral when total weight is zero', () => {
    const { random } = createRandom(0);
    const mix: PaletteMix = {
      weights: {
        highPositive: 0,
        lowPositive: 0,
        highNegative: 0,
        fear: 0,
        lowNegative: 0,
        curious: 0,
        neutral: 0,
      },
      intensity: 0,
    };
    expect(pickPaletteKey(mix, random)).to.equal('neutral');
  });

  it('always returns the only weighted key when others are zero', () => {
    const { random } = createRandom(42);
    const mix: PaletteMix = {
      weights: {
        highPositive: 0,
        lowPositive: 0,
        highNegative: 0,
        fear: 0,
        lowNegative: 0,
        curious: 1,
        neutral: 0,
      },
      intensity: 0.5,
    };
    for (let i = 0; i < 50; i++) {
      expect(pickPaletteKey(mix, random)).to.equal('curious');
    }
  });
});

describe('composeAction', () => {
  it('produces a *...*-wrapped non-empty body', () => {
    const { random } = createRandom(1);
    const out = composeAction(highPositiveMix(), random, makeBuffers(), GRAMMARS);
    expect(out.startsWith('*')).to.equal(true);
    expect(out.endsWith('*')).to.equal(true);
    expect(out.length).to.be.greaterThan(2);
  });

  it('penalizes recently-used verbs (no immediate verb repetition within window)', () => {
    const { random } = createRandom(7);
    // Use a transitive-only grammar so the dedup pool is the full 7-verb list.
    const grammars = {
      ...GRAMMARS,
      highPositive: {
        ...GRAMMARS.highPositive,
        intransitiveProbability: 0,
        modifierProbability: 0,
      },
    };
    const buffers = makeBuffers();
    const verbs: string[] = [];
    for (let i = 0; i < 6; i++) {
      const action = composeAction(highPositiveMix(), random, buffers, grammars);
      const inner = action.slice(1, -1);
      // verb is the longest leading run that matches a known verb (since
      // some verbs include spaces, e.g. 'paws at').
      const knownVerbs = grammars.highPositive.verbs.map((v) => v.value);
      const verb = knownVerbs
        .filter((v) => inner.startsWith(v))
        .sort((a, b) => b.length - a.length)[0]!;
      verbs.push(verb);
    }
    expect(new Set(verbs).size).to.equal(verbs.length);
  });

  it('always picks from the chosen palette grammar (intransitive verbs are valid)', () => {
    const { random } = createRandom(3);
    // Force a high-intransitive-probability grammar.
    const grammars = {
      ...GRAMMARS,
      neutral: {
        ...GRAMMARS.neutral,
        intransitiveProbability: 1,
        modifierProbability: 0,
      },
    };
    const intransitives = new Set(
      grammars.neutral.intransitiveVerbs!.map((v) => v.value),
    );
    for (let i = 0; i < 10; i++) {
      const out = composeAction(neutralMix(), random, makeBuffers(), grammars);
      const body = out.slice(1, -1);
      expect(intransitives).to.satisfy((set: Set<string>) =>
        Array.from(set).some((v) => body.startsWith(v)),
      );
    }
  });

  it('appends a modifier with probability 1 when modifierProbability=1', () => {
    const { random } = createRandom(5);
    const grammars = {
      ...GRAMMARS,
      neutral: {
        ...GRAMMARS.neutral,
        intransitiveProbability: 0,
        modifierProbability: 1,
        modifiers: [{ value: 'vigorously', weight: 1 }],
      },
    };
    for (let i = 0; i < 5; i++) {
      const out = composeAction(neutralMix(), random, makeBuffers(), grammars);
      expect(out).to.match(/vigorously\*$/);
    }
  });

  describe('action shape options', () => {
    it('omits objects when includeObjects=false (uses intransitive pool)', () => {
      const { random } = createRandom(11);
      // Make every transitive verb's bare form unmistakable (no overlap
      // with intransitive verb prefixes), and force modifiers off.
      const intransitives = GRAMMARS.highPositive.intransitiveVerbs!.map(
        (v) => v.value,
      );
      for (let i = 0; i < 30; i++) {
        const out = composeAction(
          highPositiveMix(),
          random,
          makeBuffers(),
          GRAMMARS,
          { includeObjects: false, includeModifiers: false },
        );
        const body = out.slice(1, -1);
        // Body must be exactly one of the intransitive forms.
        expect(intransitives).to.include(body);
      }
    });

    it('emits a verb alone when includeObjects=false and no intransitive pool exists', () => {
      const { random } = createRandom(13);
      const grammars = {
        ...GRAMMARS,
        neutral: {
          ...GRAMMARS.neutral,
          intransitiveVerbs: [],
        },
      };
      const verbs = grammars.neutral.verbs.map((v) => v.value);
      for (let i = 0; i < 20; i++) {
        const out = composeAction(
          neutralMix(),
          random,
          makeBuffers(),
          grammars,
          { includeObjects: false, includeModifiers: false },
        );
        const body = out.slice(1, -1);
        expect(verbs).to.include(body);
      }
    });

    it('omits modifiers when includeModifiers=false even at modifierProbability=1', () => {
      const { random } = createRandom(17);
      const grammars = {
        ...GRAMMARS,
        neutral: {
          ...GRAMMARS.neutral,
          intransitiveProbability: 0,
          modifierProbability: 1,
          modifiers: [{ value: 'vigorously', weight: 1 }],
        },
      };
      for (let i = 0; i < 10; i++) {
        const out = composeAction(
          neutralMix(),
          random,
          makeBuffers(),
          grammars,
          { includeObjects: true, includeModifiers: false },
        );
        expect(out).to.not.match(/vigorously/);
      }
    });

    it('default shape includes both objects and modifiers', () => {
      // Just a smoke test: with the default shape and a modifier-probability=1
      // grammar, the modifier always appears.
      const { random } = createRandom(19);
      const grammars = {
        ...GRAMMARS,
        neutral: {
          ...GRAMMARS.neutral,
          intransitiveProbability: 0,
          modifierProbability: 1,
          modifiers: [{ value: 'vigorously', weight: 1 }],
        },
      };
      for (let i = 0; i < 5; i++) {
        const out = composeAction(
          neutralMix(),
          random,
          makeBuffers(),
          grammars,
          DEFAULT_ACTION_SHAPE,
        );
        expect(out).to.match(/vigorously\*$/);
      }
    });
  });
});

describe('blendActionProbability', () => {
  it('returns the picked palette probability for a single-key mix', () => {
    expect(
      blendActionProbability(highPositiveMix(), GRAMMARS),
    ).to.equal(GRAMMARS.highPositive.actionProbability);
    expect(
      blendActionProbability(neutralMix(), GRAMMARS),
    ).to.equal(GRAMMARS.neutral.actionProbability);
  });

  it('blends linearly across a two-palette mix', () => {
    const mix: PaletteMix = {
      weights: {
        highPositive: 0.6,
        lowPositive: 0,
        highNegative: 0,
        fear: 0,
        lowNegative: 0,
        curious: 0,
        neutral: 0.4,
      },
      intensity: 0.5,
    };
    const expected =
      0.6 * GRAMMARS.highPositive.actionProbability +
      0.4 * GRAMMARS.neutral.actionProbability;
    const got = blendActionProbability(mix, GRAMMARS);
    expect(Math.abs(got - expected)).to.be.lessThan(1e-9);
  });

  it('falls back to neutral on an empty mix', () => {
    const empty: PaletteMix = {
      weights: {
        highPositive: 0,
        lowPositive: 0,
        highNegative: 0,
        fear: 0,
        lowNegative: 0,
        curious: 0,
        neutral: 0,
      },
      intensity: 0,
    };
    expect(blendActionProbability(empty, GRAMMARS)).to.equal(
      GRAMMARS.neutral.actionProbability,
    );
  });

  it('default grammars assign neutral a low probability and highPositive a higher one', () => {
    expect(GRAMMARS.neutral.actionProbability).to.be.lessThan(
      GRAMMARS.highPositive.actionProbability,
    );
    expect(GRAMMARS.neutral.actionProbability).to.be.lessThan(0.4);
    expect(GRAMMARS.highPositive.actionProbability).to.be.greaterThan(0.7);
  });
});
