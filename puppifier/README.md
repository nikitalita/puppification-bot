# puppifier

A small TypeScript Node.js library that translates English text into humorous dog-speech: dog noises (`bark`, `ruff`, `awoo`) interspersed with action phrases (`*scratches ear*`, `*tilts head*`). Tone, density, and sound choice are driven by per-sentence GoEmotions tones from the [`emotion-classifier`](../emotion-classifier) sibling package.

Default behavior is non-deterministic. Pass `seed` for repeatable output (used heavily in tests).

## Install

```bash
npm install
npm run build
```

The library depends on `emotion-classifier` via a relative file dependency, so `emotion-classifier/dist/` must already be built. The first call that uses the real classifier will download the ONNX model (~80 MB quantized) into the local Hugging Face cache.

## Usage

```ts
import { puppify } from 'puppifier';

const result = await puppify('I am so happy! I got a promotion!', { seed: 42 });
console.log(result.text);
// e.g. "BARK ruff yip woof! *wags tail* Ruff arf bark woof!"
console.log(JSON.stringify(result, null, 2));
```

The result is a `PuppifyResult`:

```ts
interface PuppifyResult {
  text: string;                     // joined dog string (the deliverable)
  source: string;                   // trimmed input text
  phraseTone: ToneScore[];          // top-K tones for the whole phrase
  sentences: PuppifiedSentence[];   // per-sentence source + dog + tone
  seed: number;                     // numeric seed actually used
}

interface PuppifiedSentence {
  source: string;
  dog: string;
  tone: ToneScore[];
}
```

`result.seed` is always populated, so a particularly funny (or unfunny) translation can always be reproduced by passing the same seed back in.

## API

### `puppify(text, options?)`

```ts
function puppify(text: string, options?: PuppifyOptions): Promise<PuppifyResult>;
```

Runs the emotion-classifier on `text`, then translates. A snake_case alias `puppify_text` is also exported.

### `puppify_classification(classification, options?)`

```ts
function puppify_classification(
  classification: PhraseEmotionClassification,
  options?: PuppifyOptions,
): PuppifyResult;
```

Synchronous. Renders directly from a pre-computed classification, useful when callers already have the classification (cached, batched, or computed elsewhere) and want to avoid re-running inference. The `classifier` and `topK` options are ignored on this path. A camelCase alias `puppifyClassification` is also exported.

### `Puppifier`

```ts
class Puppifier {
  constructor(options?: PuppifyOptions);
  translate(text: string): Promise<PuppifyResult>;
  translateClassification(classification: PhraseEmotionClassification): PuppifyResult;
  setSeed(seed: number | string): void;
}
```

Stateful variant that keeps a single RNG stream across `translate()` / `translateClassification()` calls. Useful when you want a sequence of translations to share a deterministic stream after `setSeed(...)`, or when you want to share a warmed classifier across many calls.

### `PuppifyOptions`

```ts
interface PuppifyOptions {
  seed?: number | string;     // omit for crypto-random; pass to reproduce
  classifier?: Classifier;    // injectable for tests; ignored by *_classification
  topK?: number;              // forwarded to emotion-classifier; ignored by *_classification
  profile?: Profile;          // custom personality profile; defaults to defaultProfile
}
```

### `Profile`

A `Profile` bundles every personality-tunable knob: palettes, action grammars,
morphology probabilities, density, and sentence templates. The exported
`defaultProfile` is the shipped personality; build derived profiles by spreading:

```ts
import { defaultProfile, puppify, type Profile } from 'puppifier';

const chillPup: Profile = {
  ...defaultProfile,
  density: {
    ...defaultProfile.density,
    soundsPerWord: 0.5,
    actionsPerSentence: 0.4,
  },
};

await puppify('I am so happy! I got a promotion!', {
  seed: 42,
  profile: chillPup,
});
```

## How it works

1. **Classify** the input via `emotion-classifier`, getting top-K tones for the phrase and each sentence.
2. **Map** each sentence's tone vector onto a small palette key (`highPositive`, `lowNegative`, `curious`, etc.) and blend the palettes by tone score.
3. **Pick a sentence template** weighted by intensity (e.g. `[sound]`, `[sound, action]`, `[opener, sound]`).
4. **Generate sound tokens** by sampling base sounds from the blended palette and applying random morphology (vowel stretching, repetition, capitalization). Recent base sounds get zero weight to fight monotony.
5. **Compose action phrases** from a verb/object/modifier grammar (e.g. `*scratches ear*`, `*tilts head confusedly*`). Recent verbs and verb+object pairs are likewise penalized.
6. **Preserve punctuation and caps** from the source sentence so `?`/`!`/`...`/ALL CAPS show up in the dog version.
7. **Easter eggs**: a small dictionary of phrase-level overrides (e.g. `i love you`, `good boy`, `sorry`) catches specific inputs and emits guaranteed-cute responses.

## Determinism

```ts
await puppify(text, { seed: 42 });   // -> always the same output
await puppify(text);                 // -> different each call; result.seed is the resolved seed

const dog = new Puppifier({ seed: 42 });
await dog.translate(text);           // call A
await dog.translate(text);           // call B; differs from A but stream is reproducible
dog.setSeed(42);
await dog.translate(text);           // == call A
```

## Scripts

- `npm run build` - type-check and emit JS/d.ts to `dist/`.
- `npm run example` - run `examples/basic.ts`.
- `npm test` - fast unit + property tests (no model download).
- `npm run test:integration` - real-model integration tests under `tests/integration/`. The first run downloads the ONNX model.
- `npm run test:all` - run the unit suite followed by the integration suite.

## License

MIT.
