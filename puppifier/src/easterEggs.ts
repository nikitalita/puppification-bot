import type { Random } from './random.js';
import type { PaletteMix } from './tone.js';

/** Render context passed to easter-egg renderers. */
export interface EasterEggContext {
  rng: Random;
  mix: PaletteMix;
  matches?: string[] | null;
}

/**
 * An easter egg either fully overrides a sentence's translation
 * (`kind: 'override'`) or tags the sentence so the translator injects an
 * additional opener (`kind: 'tag'`).
 *
 * Matching is done against a normalized form of the sentence (lowercase,
 * leading/trailing punctuation stripped, internal whitespace collapsed).
 */
export interface EasterEgg {
  /** Identifier; useful in tests. */
  id: string;
  /** String substring or RegExp matched against the normalized sentence. */
  match: string | RegExp;
  kind: 'override' | 'tag' | 'replaceWord';
  /** Required when kind === 'override' || 'replaceWord'. */
  render?: (ctx: EasterEggContext) => string;
  /** Required when kind === 'tag'. The translator interprets this. */
  tag?: 'earsPerk';
  matches?: string[] | null;
  grammar?: "default"| "action";
}

function pickOne<T>(items: readonly T[], rng: Random): T {
  return rng.pick(items);
}

/**
 * Ordered list of easter eggs. Earlier entries take precedence on first
 * match. Tags don't preempt overrides; the translator should call
 * `findOverride` first and `findTags` second.
 */
export const EASTER_EGGS: EasterEgg[] = [
  {
    id: 'i-love-you',
    match: /\bi\s+love\s+you\b/,
    kind: 'override',
    render: ({ rng }) => {
      const soft = pickOne(['mrrf', 'hrmm', 'mrrrf', 'snrrf'], rng);
      return `${soft} *licks your face*`;
    },
    grammar: "action",
  },
  {
    id: 'sorry',
    match: /\b(?:i'?m\s+)?sorry\b/,
    kind: 'override',
    render: () => `*tail between legs* *whimpers softly*`,
  },
  // More specific patterns first so they win the first-match race.
  {
    id: 'im-a-good',
    match: /\b(?:i\s+am|i'?m)\s+a\s+good\b/,
    kind: 'override',
    render: ({ rng }) => {
      const excited = pickOne(['yip!', 'arf!', 'borf!'], rng);
      return `${excited} *tail thumps loudly*`;
    },
  },
  {
    id: 'good-boy',
    match: /\bgood\s+(?:boy|dog|girl|pup|puppy)\b/,
    kind: 'override',
    render: () => `BARK BARK BARK! *spins in a circle*`,
  },
  {
    id: 'kitty',
    match: /\b(?:meow|mrow)\b/,
    kind: 'override',
    render: () => `*imitates a cat*`,
    grammar: "action",
  },
  {
    id: 'walk-treat-ball-park',
    match: /\b(?:walk|walkies|treat|treats|ball|park|fetch|bone)\b/,
    kind: 'tag',
    tag: 'earsPerk',
  },
  {
    id: 'aroo-literal',
    match: /\bar(oo+)\b/,
    kind: 'override',
    render: ({ matches }) => `Ar${matches?.[1] ?? 'oo'}!`,
  },
  {
    id: 'awoo-literal',
    match: /\baw(oo+)\b/,
    kind: 'override',
    render: ({ matches }) => `Aw${matches?.[1] ?? 'oo'}!`,
  },
  {
    id: 'aroo-long-word',
    match: /\b([a-z]{15,})\b/,
    kind: 'override',
    render: ({ rng }) => {
      const numOs = rng.int(5,25);
      const awoOrAro = pickOne(['w', 'r'], rng);
      return `A${awoOrAro}${'o'.repeat(numOs)}!`;
    },
  },
  {
    id: 'replace-discord-gif-links',
    match: /^https?:\/\/((media\d.giphy.com\/media\/(.*)\.[a-z34]{2,4})|(.*tenor.com\/.*((\.[a-z34]{2,4})|[0-9]+))|(klipy\.com\/gifs\/.*)|(cdn\.discordapp\.com\/attachments\/.*\.gif\?.*))$/,
    kind: 'override',
    render: ({ rng }) => {
      return rng.pick([
        "https://tenor.com/view/cute-puppy-aegi-golden-retriever-puppy-puppy-doggy-gif-6211630482704833346",
        "https://tenor.com/view/crystal-amaru-gif-3146029766144478049",
        "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHE4MnlxcTV2bGx4dzFsNHhhOTJnaTI3MmJmMW41bTRxbXl3N3VjdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/WQ2IwyAgYlmU0/giphy.gif",
        "https://klipy.com/gifs/perrete",
        "https://klipy.com/gifs/h2di-puppy-play",
        "https://klipy.com/gifs/dog-smile-23",
        "https://klipy.com/gifs/cute-dog-happy",
        "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZXRyOG9ta3Jhbzh6Zno1bHhsbjd5dmh6dW83bTNla2dvdXoydGF5OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/S7RmvM3aoWEtG/giphy.gif",
        "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExbHZjNmJlazlwazM3eWQzNTRuc3F5OXhjMnRhemMwNjllcTF6dGt5YSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/hPyONzUYJhLZS/giphy.gif",
        "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzYwNWRlcWR4aXkwejQ2NWwyeTd5OWl4b2ZmbDJiN2VlaXdqYnVtbSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3ov9k9AyzTiUCfsZrO/giphy.gif",
      ]);
    },
  },

  // Individual word replacements
  {
    id: 'love',
    match: /^loves?$/, // Match start and end of string instead of word boundry
    kind: 'replaceWord',
    render: () => {
      return `*licks lovingly*`;
    },
    grammar: "action",
  },
  {
    id: 'paw',
    match: /^paws?$/,
    kind: 'replaceWord',
    render: () => {
      return `*holds out paw*`;
    },
    grammar: "action",
  },
  {
    id: 'lick',
    match: /^licks?$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return `*licks*`;
    },
    grammar: "action",
  },
  {
    id: 'wag',
    match: /^wags?$/,
    kind: 'replaceWord',
    render: () => {
      return `*wags tail*`;
    },
    grammar: "action",
  },
  {
    id: 'nuzzle',
    match: /^(nuzzles?)|(nose)$/,
    kind: 'replaceWord',
    render: () => {
      return `*nuzzle*`;
    },
    grammar: "action",
  },
  {
    id: 'emoji-replacement-happy',
    match: /^(:3)|(:\))|(🙂)|😃$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick(["૮・ᴥ・ა", "🐶", "૮ฅ・ﻌ・აฅ", "🐕", "૮₍ • ᴥ • ₎ა"]);
    },
  },
  {
    id: 'emoji-replacement-excited',
    match: /^(\^_\^)|😄$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick(["૮ ˆﻌˆ ა", "🐶", "૮ฅ ˆﻌˆ აฅ"]);
    },
  },
  {
    id: 'emoji-replacement-love',
    match: /^🥰|(<3)|😘|❤$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick(["❤૮ฅ ˆﻌˆ აฅ❤", "❤U(ᵔᴥᵔ)U"]);
    },
  },
  {
    id: 'emoji-replacement-sleepy',
    match: /^😴$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick(["zᶻ ૮˶- ﻌ -˶ა⌒)ᦱ"]);
    },
  },
  {
    id: 'emoji-replacement-shock',
    match: /^😮|(:o)$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick(["૮₍ ˶°ㅁ° ₎ა !!"]);
    },
  },
  {
    id: 'emoji-replacement-v-v',
    match: /^(v_v)|(v\.v)|😔$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick(["૮ ˘ﻌ˘ ა"]);
    },
  },
  {
    id: 'emoji-replacement-sad',
    match: /^(😟|(:\()|(🙁))$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick(["૮ ◞ ﻌ ◟ ა", "U´꓃`U"]);
    },
  },
  {
    id: 'emoji-replacement-cry',
    match: /^(😢|😭)$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick(["૮ ಥ ﻌ ಥ ა", "U〒ﻌ〒U"]);
    },
  },
  {
    id: 'randomize-links',
    match: /^(?:http[s]?:\/\/.)?(?:www\.)?[-a-zA-Z0-9@%._\+~#=]{2,256}\.[a-z]{2,6}\b(?:[-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)$/,
    kind: 'replaceWord',
    render: ({ rng, matches }) => {
      return rng.pick([
        "https://www.thesprucepets.com/",
        "https://www.puppies.com/",
        "https://www.puppyfinder.com/",
        "https://unsplash.com/s/photos/puppy-wallpaper",
        "https://www.allthingsdogs.com/dog-memes/",
        "https://www.dogster.com/",
      ]);
    },
  },
];

function normalize(sentence: string): string {
  return sentence.toLowerCase().replace(/\s+/g, ' ').trim();
}

function testMatch(match: string | RegExp, normalized: string): boolean {
  if (typeof match === 'string') {
    return normalized.includes(match);
  }
  return match.test(normalized);
}

/** First override-kind egg whose `match` hits, or `undefined`. */
export function findOverride(sentence: string): EasterEgg | undefined {
  const norm = normalize(sentence);
  for (const egg of EASTER_EGGS) {
    if (egg.kind !== 'override') continue;
    if (testMatch(egg.match, norm)) {
      if (typeof egg.match !== 'string') {
        egg.matches = egg.match.exec(norm);
      }
      return egg;
    }
  }
  return undefined;
}

export function findWordReplacement(word: string): EasterEgg | undefined {
  const norm = normalize(word);
  for (const egg of EASTER_EGGS) {
    if (egg.kind !== 'replaceWord') continue;
    if (testMatch(egg.match, norm)) {
      if (typeof egg.match !== 'string') {
        egg.matches = egg.match.exec(norm);
      }
      return egg;
    }
  }
  return undefined;
}

/** All tag-kind eggs whose `match` hits, in declaration order. */
export function findTags(sentence: string): EasterEgg[] {
  const norm = normalize(sentence);
  const out: EasterEgg[] = [];
  for (const egg of EASTER_EGGS) {
    if (egg.kind !== 'tag') continue;
    if (testMatch(egg.match, norm)) { 
      out.push(egg);
    }
  }
  return out;
}

/**
 * Convenience: returns the first matching easter egg of any kind. Used by
 * tests that want to assert "something matches".
 */
export function findEasterEgg(sentence: string): EasterEgg | undefined {
  const norm = normalize(sentence);
  for (const egg of EASTER_EGGS) {
    if (testMatch(egg.match, norm)) return egg;
  }
  return undefined;
}
