import { expect } from 'chai';
import { defaultProfile } from '../src/profile.ts';
import { createRandom } from '../src/random.ts';
import { makeRecentBuffers, translateSentence } from '../src/translator.ts';
import type { ToneScore } from 'emotion-classifier';

function ctxAt(seed: number) {
  const { random } = createRandom(seed);
  return {
    rng: random,
    profile: defaultProfile,
    buffers: makeRecentBuffers(defaultProfile),
  };
}

const happyTone: ToneScore[] = [
  { label: 'joy', score: 0.92 },
  { label: 'excitement', score: 0.65 },
  { label: 'admiration', score: 0.21 },
];

const sadTone: ToneScore[] = [
  { label: 'sadness', score: 0.85 },
  { label: 'grief', score: 0.4 },
  { label: 'disappointment', score: 0.2 },
];

const angryTone: ToneScore[] = [
  { label: 'anger', score: 0.9 },
  { label: 'annoyance', score: 0.5 },
  { label: 'disapproval', score: 0.3 },
];

const curiousTone: ToneScore[] = [
  { label: 'curiosity', score: 0.7 },
  { label: 'confusion', score: 0.3 },
];

describe('translateSentence', () => {
  it('returns "" for empty / whitespace-only input', () => {
    expect(translateSentence('', happyTone, ctxAt(1))).to.equal('');
    expect(translateSentence('   ', happyTone, ctxAt(1))).to.equal('');
  });

  it('is deterministic for a fixed seed', () => {
    const a = translateSentence('I am very happy.', happyTone, ctxAt(42));
    const b = translateSentence('I am very happy.', happyTone, ctxAt(42));
    expect(a).to.equal(b);
  });

  it('full-uppercase source yields uppercase sound tokens (but lowercase actions)', () => {
    const out = translateSentence('I AM SO HAPPY!', happyTone, ctxAt(7));
    // Parse out *...* action regions and sound regions independently.
    const actionRegex = /\*[^*]+\*/g;
    const actions = out.match(actionRegex) ?? [];
    const soundRegion = out.replace(actionRegex, ' ');
    const soundLetters = soundRegion.replace(/[^A-Za-z]/g, '');
    if (soundLetters.length > 0) {
      expect(soundLetters).to.equal(
        soundLetters.toUpperCase(),
        `expected uppercase sound region, got "${soundRegion}" in: ${out}`,
      );
    }
    for (const action of actions) {
      const inner = action.slice(1, -1);
      // No uppercase letters should leak into action bodies.
      expect(inner).to.equal(
        inner.toLowerCase(),
        `expected fully lowercase action body, got "${action}" in: ${out}`,
      );
    }
  });

  it('all-caps source does NOT uppercase words inside multi-word actions', () => {
    // Force a multi-word intransitive action ("stomps off") on every call,
    // a template that always emits an action, and an all-caps source.
    // Force `actionProbability: 1` on every grammar so the per-mix
    // emission gate always fires — the test cares about action body
    // content, not the gate.
    const grammarsAlwaysFire = Object.fromEntries(
      Object.entries(defaultProfile.grammars).map(([k, g]) => [
        k,
        { ...g, actionProbability: 1 },
      ]),
    ) as typeof defaultProfile.grammars;
    const profile = {
      ...defaultProfile,
      grammars: {
        ...grammarsAlwaysFire,
        highNegative: {
          ...grammarsAlwaysFire.highNegative,
          intransitiveVerbs: [{ value: 'stomps off', weight: 1 }],
          intransitiveProbability: 1,
          modifierProbability: 0,
        },
      },
      density: {
        ...defaultProfile.density,
        actionsPerSentence: 5,
      },
      templates: [{ slots: ['sound', 'action', 'sound'] as const, weight: 1 }],
    };
    const { random } = createRandom(1);
    const ctx = {
      rng: random,
      profile,
      buffers: makeRecentBuffers(profile),
    };
    const out = translateSentence('STOP IT!', angryTone, ctx);
    expect(out).to.include('*stomps off*');
    expect(out).to.not.match(/\*[^*]*[A-Z][^*]*\*/);
  });

  it('trailing "?" is preserved on a sound token (and a head-tilt action may follow)', () => {
    const out = translateSentence(
      'is that a treat?',
      curiousTone,
      ctxAt(13),
    );
    expect(out.includes('?')).to.equal(true, `expected "?" in output: ${out}`);
    // The "?" should land on a sound token, not after a closing '*'.
    expect(/\*\?/.test(out)).to.equal(
      false,
      `expected "?" on a sound token, not after an action: ${out}`,
    );
  });

  it('trailing "!" forces last sound cluster to uppercase', () => {
    const out = translateSentence('I am SO excited!', happyTone, ctxAt(2));
    // The "!" lands on a sound token (never directly after a closing '*').
    expect(out.includes('!')).to.equal(true, `expected "!" in: ${out}`);
    expect(/\*\!/.test(out)).to.equal(
      false,
      `expected "!" on a sound token, not after an action: ${out}`,
    );
    // And whichever sound token carries the "!" is fully uppercased.
    const bang = out.match(/(\S+)!/);
    expect(bang).to.not.equal(null, `expected a "!"-bearing token in: ${out}`);
    const token = bang![1]!;
    const letters = token.replace(/[^A-Za-z]/g, '');
    expect(letters).to.equal(
      letters.toUpperCase(),
      `expected uppercase "!"-bearing token, got "${token}" in: ${out}`,
    );
  });

  it('trailing "..." is preserved', () => {
    const out = translateSentence('I am tired...', sadTone, ctxAt(3));
    // "..." appears, on a sound token rather than after a closing '*'.
    expect(out.includes('...')).to.equal(true, `expected "..." in: ${out}`);
    expect(/\*\.\.\./.test(out)).to.equal(
      false,
      `expected "..." on a sound token, not after an action: ${out}`,
    );
  });

  it('easter egg "i love you" always ends with *licks your face*', () => {
    for (let i = 0; i < 20; i++) {
      const out = translateSentence('I love you.', happyTone, ctxAt(i));
      expect(out.endsWith('*licks your face*')).to.equal(true);
    }
  });

  it('easter egg "good boy" always returns BARK BARK BARK output', () => {
    for (let i = 0; i < 5; i++) {
      const out = translateSentence('good boy!', happyTone, ctxAt(i));
      expect(out).to.equal('BARK BARK BARK! *spins in a circle*');
    }
  });

  it('soft tag (walk) prepends *ears perk up* if no opener action present', () => {
    const out = translateSentence(
      'time for a walk',
      happyTone,
      ctxAt(123),
    );
    // Either the template already led with an action OR we should see ears perk up.
    expect(out.includes('*ears perk up*') || out.startsWith('*')).to.equal(true);
  });

  it('output is non-empty for non-trivial input across many seeds and tones', () => {
    const tones = [happyTone, sadTone, angryTone, curiousTone];
    for (let i = 0; i < 50; i++) {
      const tone = tones[i % tones.length]!;
      const out = translateSentence('Hello there.', tone, ctxAt(i));
      expect(out.length).to.be.greaterThan(0);
    }
  });

  it('actionsAtEndOnly (default) keeps every action after every sound', () => {
    // Force a template that places an action mid-sentence, then verify
    // the relocation still pushes it past the sounds in the final output.
    const profile = {
      ...defaultProfile,
      density: { ...defaultProfile.density, actionsPerSentence: 5 },
      templates: [
        { slots: ['action', 'sound', 'action', 'sound'] as const, weight: 1 },
      ],
    };
    for (let seed = 0; seed < 30; seed++) {
      const { random } = createRandom(seed);
      const ctx = {
        rng: random,
        profile,
        buffers: makeRecentBuffers(profile),
      };
      const out = translateSentence('Hello there.', happyTone, ctx);
      const tokens = out.match(/\*[^*]+\*|[^\s*]+/g) ?? [];
      let seenAction = false;
      for (const tok of tokens) {
        if (tok.startsWith('*')) {
          seenAction = true;
        } else {
          // A sound token after an action would violate the contract.
          expect(seenAction).to.equal(
            false,
            `seed=${seed} sound "${tok}" appeared after an action in: ${out}`,
          );
        }
      }
    }
  });

  it('actionsAtEndOnly=false honors template positions (mid-sentence actions allowed)', () => {
    const profile = {
      ...defaultProfile,
      density: { ...defaultProfile.density, actionsPerSentence: 5 },
      templates: [
        { slots: ['sound', 'action', 'sound'] as const, weight: 1 },
      ],
      actionsAtEndOnly: false,
    };
    let sawMidAction = 0;
    for (let seed = 0; seed < 30; seed++) {
      const { random } = createRandom(seed);
      const ctx = {
        rng: random,
        profile,
        buffers: makeRecentBuffers(profile),
      };
      const out = translateSentence('Hello there.', happyTone, ctx);
      const tokens = out.match(/\*[^*]+\*|[^\s*]+/g) ?? [];
      // Look for the pattern: action followed by a sound (impossible
      // when actionsAtEndOnly is true).
      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i]!.startsWith('*') && !tokens[i + 1]!.startsWith('*')) {
          sawMidAction++;
          break;
        }
      }
    }
    expect(sawMidAction).to.be.greaterThan(
      0,
      'expected at least one mid-sentence action when actionsAtEndOnly=false',
    );
  });

  it('contains at least one *...* action phrase given high intensity over many seeds', () => {
    let withAction = 0;
    const N = 30;
    for (let i = 0; i < N; i++) {
      const out = translateSentence(
        'I am incredibly excited about this amazing news!',
        happyTone,
        ctxAt(i),
      );
      if (/\*[^*]+\*/.test(out)) withAction++;
    }
    expect(withAction / N).to.be.greaterThan(0.4);
  });

  it('happy sentences emit actions far more often than neutral sentences', () => {
    // Drives the per-mix probability gate: highPositive grammar has a
    // high `actionProbability` while neutral has a low one.
    const N = 100;
    const neutralTone: ToneScore[] = [
      { label: 'neutral', score: 1 },
    ];
    let happyHits = 0;
    let neutralHits = 0;
    for (let i = 0; i < N; i++) {
      const happyOut = translateSentence(
        'I am happy about this!',
        happyTone,
        ctxAt(1000 + i),
      );
      const neutralOut = translateSentence(
        'I am happy about this!',
        neutralTone,
        ctxAt(2000 + i),
      );
      if (/\*[^*]+\*/.test(happyOut)) happyHits++;
      if (/\*[^*]+\*/.test(neutralOut)) neutralHits++;
    }
    // The gap should be substantial — happy ~0.85, neutral ~0.25.
    expect(happyHits).to.be.greaterThan(neutralHits + N * 0.3);
  });

  it('high-arousal palettes shout far more often than calm palettes', () => {
    // Driven by per-palette `capsProbability`. We measure the share of
    // sound tokens that are fully uppercase (no actions, no source-caps
    // forcing involved). Sad sentences (palette caps ~0.05) should be
    // mostly lowercase; angry ones (palette caps ~0.7) should yell often.
    const N = 60;
    let calmCapsTokens = 0;
    let calmTotalTokens = 0;
    let loudCapsTokens = 0;
    let loudTotalTokens = 0;
    for (let i = 0; i < N; i++) {
      const calm = translateSentence(
        'this is a calm sentence',
        sadTone,
        ctxAt(3000 + i),
      );
      const loud = translateSentence(
        'this is an angry sentence',
        angryTone,
        ctxAt(4000 + i),
      );
      const soundsOf = (s: string) =>
        s.replace(/\*[^*]+\*/g, ' ').split(/\s+/).filter((t) => /[a-z]/i.test(t));
      const isCaps = (t: string) => {
        const letters = t.replace(/[^A-Za-z]/g, '');
        return letters.length > 1 && letters === letters.toUpperCase();
      };
      const calmTokens = soundsOf(calm);
      calmTotalTokens += calmTokens.length;
      calmCapsTokens += calmTokens.filter(isCaps).length;
      const loudTokens = soundsOf(loud);
      loudTotalTokens += loudTokens.length;
      loudCapsTokens += loudTokens.filter(isCaps).length;
    }
    expect(calmTotalTokens).to.be.greaterThan(0);
    expect(loudTotalTokens).to.be.greaterThan(0);
    const calmRatio = calmCapsTokens / calmTotalTokens;
    const loudRatio = loudCapsTokens / loudTotalTokens;
    // Expected (at intensity ≈ 0.85–0.9): calm ≈ 0.04, loud ≈ 0.6.
    // Use generous margins so this isn't seed-flaky.
    expect(calmRatio).to.be.lessThan(0.25, `calm caps ratio ${calmRatio}`);
    expect(loudRatio).to.be.greaterThan(0.4, `loud caps ratio ${loudRatio}`);
    expect(loudRatio).to.be.greaterThan(
      calmRatio + 0.3,
      `expected at least 30pp gap, got calm=${calmRatio} loud=${loudRatio}`,
    );
  });
});
