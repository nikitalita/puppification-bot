import { expect } from 'chai';
import {
  EASTER_EGGS,
  findEasterEgg,
  findOverride,
  findTags,
} from '../src/easterEggs.ts';

describe('easter eggs', () => {
  it('all entries declare a kind and required renderer/tag', () => {
    for (const egg of EASTER_EGGS) {
      if (egg.kind === 'override') {
        expect(typeof egg.render).to.equal('function');
      } 
      else if (egg.kind == "tag") {
        expect(egg.tag).to.be.a('string');
      }
      else if (egg.kind == "replaceWord") {
        expect(typeof egg.render).to.equal('function');
        expect(typeof egg.render).to.equal('function');
      }
      else {
        expect(egg.kind).to.be.a("string");
      }
      if (egg.grammar && egg.grammar === "action") {
        // render should include ** but need a context to test with
        expect(typeof egg.render).to.equal('function');
      }
    }
  });

  describe('overrides', () => {
    const overridesByPhrase: Array<[string, string]> = [
      ['I love you', 'i-love-you'],
      ['i love you so much', 'i-love-you'],
      ['Sorry', 'sorry'],
      ["I'm sorry", 'sorry'],
      ['good boy', 'good-boy'],
      ['good girl!', 'good-boy'],
      ['Good Pup', 'good-boy'],
      ['i\'m a good boy', 'im-a-good'],
      ["i am a good", 'im-a-good'],
    ];

    for (const [text, expectedId] of overridesByPhrase) {
      it(`${text} -> ${expectedId}`, () => {
        const egg = findOverride(text);
        expect(egg, `expected override for "${text}"`).to.exist;
        expect(egg!.id).to.equal(expectedId);
      });
    }

    it('first-match ordering is respected', () => {
      // "good boy" before "i love you good boy" — i-love-you wins because
      // it appears earlier in the list.
      const egg = findOverride('I love you, good boy!');
      expect(egg!.id).to.equal('i-love-you');
    });

    it('non-matching phrases return undefined', () => {
      expect(findOverride('the weather is fine')).to.equal(undefined);
    });
  });

  describe('tags', () => {
    it('matches walk/treat/ball/park/fetch as earsPerk tag', () => {
      for (const phrase of [
        "let's go for a walk",
        'want a treat?',
        'fetch the ball',
        'we are going to the park',
        'time for walkies',
      ]) {
        const tags = findTags(phrase);
        expect(tags.length).to.be.greaterThan(0);
        expect(tags[0]!.tag).to.equal('earsPerk');
      }
    });

    it('does not match treats inside other words', () => {
      // 'walking' should not match 'walk' (regex uses \b)
      expect(findTags('mistreated').length).to.equal(0);
      expect(findTags('walking down the street').length).to.equal(0);
    });

    it('returns empty array when no tag matches', () => {
      expect(findTags('how was your day')).to.deep.equal([]);
    });
  });

  describe('findEasterEgg', () => {
    it('returns first matching egg of any kind', () => {
      const egg = findEasterEgg('i love you');
      expect(egg!.id).to.equal('i-love-you');
      const tag = findEasterEgg('want a walk?');
      expect(tag!.kind).to.equal('tag');
    });
  });
});
