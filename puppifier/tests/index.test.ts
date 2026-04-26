import { expect } from 'chai';
import {
  defaultProfile,
  Puppifier,
  puppify,
  puppify_classification,
  puppify_text,
  puppifyClassification,
  type PhraseEmotionClassification,
  type Profile,
  type PuppifyResult,
} from '../src/index.ts';
import {
  classification,
  makeFakeClassifier,
  makeThrowingClassifier,
  topK,
  vector,
} from './helpers.ts';

const happy3 = topK(
  vector({ joy: 0.92, excitement: 0.65, admiration: 0.21 }),
  3,
);
const sad3 = topK(
  vector({ sadness: 0.85, grief: 0.4, disappointment: 0.2 }),
  3,
);

const happyClassification: PhraseEmotionClassification = classification(
  'I am so happy! I got a promotion!',
  happy3,
  [
    { text: 'I am so happy!', tone: happy3 },
    { text: 'I got a promotion!', tone: happy3 },
  ],
);

const sadClassification: PhraseEmotionClassification = classification(
  'I am tired.',
  sad3,
  [{ text: 'I am tired.', tone: sad3 }],
);

function happyFake() {
  return makeFakeClassifier({
    vectorsByText: {
      'I am so happy! I got a promotion!': vector({
        joy: 0.92,
        excitement: 0.65,
        admiration: 0.21,
      }),
      'I am so happy!': vector({ joy: 0.92, excitement: 0.65 }),
      'I got a promotion!': vector({ admiration: 0.6, joy: 0.5 }),
    },
  });
}

describe('puppify (function form)', () => {
  it('returns a result with the expected shape', async () => {
    const fake = happyFake();
    const r = await puppify('I am so happy! I got a promotion!', {
      seed: 42,
      classifier: fake,
    });
    expect(r).to.have.all.keys(
      'text',
      'source',
      'phraseTone',
      'sentences',
      'seed',
    );
    expect(r.source).to.equal('I am so happy! I got a promotion!');
    expect(r.sentences).to.have.lengthOf(2);
    expect(r.text.length).to.be.greaterThan(0);
    expect(r.seed).to.equal(42);
    for (const s of r.sentences) {
      expect(s.source).to.be.a('string');
      expect(s.dog).to.be.a('string');
      expect(s.tone).to.be.an('array');
    }
  });

  it('is deterministic given the same seed', async () => {
    const a = await puppify('I am so happy! I got a promotion!', {
      seed: 42,
      classifier: happyFake(),
    });
    const b = await puppify('I am so happy! I got a promotion!', {
      seed: 42,
      classifier: happyFake(),
    });
    expect(a).to.deep.equal(b);
  });

  it('different seeds produce different output', async () => {
    const a = await puppify('I am so happy! I got a promotion!', {
      seed: 1,
      classifier: happyFake(),
    });
    const b = await puppify('I am so happy! I got a promotion!', {
      seed: 2,
      classifier: happyFake(),
    });
    expect(a.text).to.not.equal(b.text);
  });

  it('camelCase / snake_case aliases match function form output', async () => {
    const seed = 'aliases';
    const text = 'I am so happy! I got a promotion!';
    const a = await puppify(text, { seed, classifier: happyFake() });
    const b = await puppify_text(text, { seed, classifier: happyFake() });
    expect(a).to.deep.equal(b);
  });

  it('empty input returns empty text and does not invoke classifyOne', async () => {
    const fake = happyFake();
    const r = await puppify('', { seed: 1, classifier: fake });
    expect(r.text).to.equal('');
    expect(r.sentences).to.deep.equal([]);
    expect(r.phraseTone).to.deep.equal([]);
    expect(typeof r.seed).to.equal('number');
    expect(fake.classifyOneCalls).to.deep.equal([]);
  });

  it('easter egg "i love you" always ends with *licks your face*', async () => {
    const fake = makeFakeClassifier({
      vectorsByText: { 'I love you.': vector({ love: 0.9 }) },
      defaultVector: vector({ love: 0.9 }),
    });
    for (let i = 0; i < 25; i++) {
      const r = await puppify('I love you.', { seed: i, classifier: fake });
      expect(r.text.endsWith('*licks your face*')).to.equal(
        true,
        `seed ${i} did not end with licks-your-face: ${r.text}`,
      );
    }
  });
});

describe('puppify_classification (function form)', () => {
  it('is synchronous (returns a PuppifyResult, not a Promise)', () => {
    const r = puppify_classification(happyClassification, { seed: 42 });
    expect(r).to.not.have.property('then');
    expect(r.text).to.be.a('string');
  });

  it('parity with puppify when given the same classification', async () => {
    // Configure the fake so its top-3 outputs match `happy3` for both
    // the phrase and each sentence; that way the resulting
    // PhraseEmotionClassification is structurally equal to
    // `happyClassification`.
    const happyVector = vector({
      joy: 0.92,
      excitement: 0.65,
      admiration: 0.21,
    });
    const fakeReturning = makeFakeClassifier({
      vectorsByText: {
        'I am so happy! I got a promotion!': happyVector,
        'I am so happy!': happyVector,
        'I got a promotion!': happyVector,
      },
      defaultVector: happyVector,
    });
    const viaText = await puppify('I am so happy! I got a promotion!', {
      seed: 42,
      classifier: fakeReturning,
      topK: 3,
    });
    const viaClassification = puppify_classification(happyClassification, {
      seed: 42,
    });
    expect(viaClassification.text).to.equal(viaText.text);
    expect(viaClassification.sentences.map((s) => s.dog)).to.deep.equal(
      viaText.sentences.map((s) => s.dog),
    );
  });

  it('does not invoke the classifier (throwing fake survives)', () => {
    const throwing = makeThrowingClassifier();
    const r = puppify_classification(happyClassification, {
      seed: 42,
      classifier: throwing,
      topK: 5,
    });
    expect(r.text.length).to.be.greaterThan(0);
  });

  it('camelCase alias produces identical output', () => {
    const a = puppify_classification(happyClassification, { seed: 7 });
    const b = puppifyClassification(happyClassification, { seed: 7 });
    expect(a).to.deep.equal(b);
  });

  it('is deterministic given the same seed', () => {
    const a = puppify_classification(happyClassification, { seed: 42 });
    const b = puppify_classification(happyClassification, { seed: 42 });
    expect(a).to.deep.equal(b);
  });

  it('echoes the classification phrase text and tones', () => {
    const r = puppify_classification(sadClassification, { seed: 1 });
    expect(r.source).to.equal('I am tired.');
    expect(r.phraseTone).to.deep.equal(sad3);
  });
});

describe('Puppifier class', () => {
  it('translate() runs the classifier and returns a result', async () => {
    const fake = happyFake();
    const dog = new Puppifier({ seed: 42, classifier: fake });
    const r = await dog.translate('I am so happy! I got a promotion!');
    expect(r.text.length).to.be.greaterThan(0);
    expect(fake.classifyOneCalls.length + fake.classifyManyCalls.length)
      .to.be.greaterThan(0);
  });

  it('preserves RNG stream across calls (function form re-seeds; class form does not)', async () => {
    const dog = new Puppifier({ seed: 42, classifier: happyFake() });
    const r1 = await dog.translate('I am so happy! I got a promotion!');
    const r2 = await dog.translate('I am so happy! I got a promotion!');
    // Stream advances: second call differs from first.
    expect(r1.text).to.not.equal(r2.text);

    // Re-seeding restores deterministic stream from start.
    dog.setSeed(42);
    const r1b = await dog.translate('I am so happy! I got a promotion!');
    const r2b = await dog.translate('I am so happy! I got a promotion!');
    expect(r1b.text).to.equal(r1.text);
    expect(r2b.text).to.equal(r2.text);

    // The function form re-seeds every call, so it equals r1b.
    const fn = await puppify('I am so happy! I got a promotion!', {
      seed: 42,
      classifier: happyFake(),
    });
    expect(fn.text).to.equal(r1.text);
  });

  it('translateClassification() does not invoke the classifier', () => {
    const throwing = makeThrowingClassifier();
    const dog = new Puppifier({ seed: 42, classifier: throwing });
    const r = dog.translateClassification(happyClassification);
    expect(r.text.length).to.be.greaterThan(0);
  });

  it('translateClassification() is stream-stable after setSeed', () => {
    const throwing = makeThrowingClassifier();
    const dog = new Puppifier({ seed: 'pin', classifier: throwing });
    const a1 = dog.translateClassification(happyClassification);
    const a2 = dog.translateClassification(happyClassification);

    dog.setSeed('pin');
    const b1 = dog.translateClassification(happyClassification);
    const b2 = dog.translateClassification(happyClassification);

    expect(a1.text).to.equal(b1.text);
    expect(a2.text).to.equal(b2.text);
    expect(a1.text).to.not.equal(a2.text);
  });

  it('setSeed accepts string seeds', async () => {
    const dog = new Puppifier({ classifier: happyFake() });
    dog.setSeed('hello');
    const r1 = await dog.translate('I am so happy! I got a promotion!');
    dog.setSeed('hello');
    const r2 = await dog.translate('I am so happy! I got a promotion!');
    expect(r1.text).to.equal(r2.text);
  });

  it('recent-use buffers persist across translateClassification calls', () => {
    // The Puppifier carries its recent-use buffers across calls, so the
    // second call's RNG _and_ dedup history both differ from a fresh
    // puppify_classification call seeded to match its mid-stream state.
    //
    // Concretely: a Puppifier-second-call differs from a function-form
    // call seeded with that Puppifier's resulting `seed`, because the
    // function form sees an empty buffer.
    const dog = new Puppifier({ seed: 'persist-test' });
    const a1 = dog.translateClassification(happyClassification);
    const a2 = dog.translateClassification(happyClassification);

    // Sanity: stream advances.
    expect(a1.text).to.not.equal(a2.text);

    // A fresh function-form call with the same seed equals the FIRST
    // Puppifier call (both start with empty buffers + identical RNG).
    const fn = puppify_classification(happyClassification, {
      seed: 'persist-test',
    });
    expect(fn.text).to.equal(a1.text);
  });
});

describe('result.seed surfacing', () => {
  it('is the resolved numeric seed', () => {
    const r = puppify_classification(happyClassification, { seed: 12345 });
    expect(r.seed).to.equal(12345);
  });

  it('is a number when seed is a string', () => {
    const r = puppify_classification(happyClassification, { seed: 'hello' });
    expect(r.seed).to.be.a('number');
    expect(Number.isInteger(r.seed)).to.equal(true);
  });

  it('is a number when seed is omitted', () => {
    const r: PuppifyResult = puppify_classification(happyClassification);
    expect(r.seed).to.be.a('number');
  });
});

describe('custom profile option', () => {
  // A profile that forces every sound base to "yip" with no morphology
  // and no actions, so the output is trivially predictable.
  const yipOnly: Profile = {
    ...defaultProfile,
    palettes: Object.fromEntries(
      (
        [
          'highPositive',
          'lowPositive',
          'highNegative',
          'fear',
          'lowNegative',
          'curious',
          'neutral',
        ] as const
      ).map((k) => [k, { sounds: [{ base: 'yip', weight: 1 }] }]),
    ) as Profile['palettes'],
    morphology: {
      ...defaultProfile.morphology,
      stretchVowelBase: 0,
      stretchVowelIntensityScale: 0,
      doubleLeadBase: 0,
      doubleLeadIntensityScale: 0,
      repeatBase: 0,
      repeatIntensityScale: 0,
      uppercaseBase: 0,
      uppercaseIntensityScale: 0,
      capitalizeFirstBase: 0,
    },
    density: {
      ...defaultProfile.density,
      actionsPerSentence: 0,
    },
    templates: [{ slots: ['sound'], weight: 1 }],
  };

  it('puppify_classification respects a custom profile', () => {
    const r = puppify_classification(happyClassification, {
      seed: 1,
      profile: yipOnly,
    });
    // Every emitted sound token is exactly 'yip' (case-insensitive: the
    // translator may uppercase the last cluster on '!'), no actions.
    for (const s of r.sentences) {
      const tokens = s.dog.split(/\s+/).filter((t) => t.length > 0);
      expect(tokens.length).to.be.greaterThan(0);
      for (const tok of tokens) {
        expect(tok).to.not.match(/^\*/, `unexpected action token: ${tok}`);
        expect(tok.replace(/[!?.]+$/, '').toLowerCase()).to.equal(
          'yip',
          `expected token "yip", got "${tok}" in: ${s.dog}`,
        );
      }
    }
  });

  it('puppify forwards profile through to render', async () => {
    const r = await puppify('I am so happy! I got a promotion!', {
      seed: 1,
      classifier: happyFake(),
      profile: yipOnly,
    });
    expect(r.text).to.match(/^(?:yip[!?.]?\s*)+$/i);
  });

  it('Puppifier uses the profile passed at construction', async () => {
    const dog = new Puppifier({
      seed: 1,
      classifier: happyFake(),
      profile: yipOnly,
    });
    const r = await dog.translate('I am so happy! I got a promotion!');
    expect(r.text).to.match(/^(?:yip[!?.]?\s*)+$/i);
  });

  it('omitted profile falls back to defaultProfile', () => {
    const a = puppify_classification(happyClassification, { seed: 7 });
    const b = puppify_classification(happyClassification, {
      seed: 7,
      profile: defaultProfile,
    });
    expect(a).to.deep.equal(b);
  });

  it('different profiles produce different output for the same seed', () => {
    const a = puppify_classification(happyClassification, { seed: 7 });
    const b = puppify_classification(happyClassification, {
      seed: 7,
      profile: yipOnly,
    });
    expect(a.text).to.not.equal(b.text);
  });
});
