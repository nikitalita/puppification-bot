import { expect } from 'chai';
import {
  WEBHOOK_USERNAME_MAX_LENGTH,
  puppifyDisplayName,
} from '../src/discord/displayName.ts';

describe('puppifyDisplayName', () => {
  it('prefixes Puppy and suffixes the dog emoji on a regular name', () => {
    expect(puppifyDisplayName('Nikita Lita')).to.equal('Puppy Nikita Lita 🐶');
  });

  it('preserves a name that already starts with Puppy', () => {
    expect(puppifyDisplayName('Puppy Bandit')).to.equal('Puppy Bandit');
  });

  it('treats the Puppy prefix check case-insensitively', () => {
    expect(puppifyDisplayName('puppy bandit')).to.equal('puppy bandit');
    expect(puppifyDisplayName('PUPPY BANDIT')).to.equal('PUPPY BANDIT');
  });

  it('strips Discord-disallowed substrings (case-insensitive) before prefixing', () => {
    expect(puppifyDisplayName('Discordian')).to.equal('Puppy ian 🐶');
    expect(puppifyDisplayName('alice@bob#1')).to.equal('Puppy alicebob1 🐶');
  });

  it('falls back to a placeholder when the base is empty after sanitation', () => {
    expect(puppifyDisplayName('')).to.equal('Puppy someone 🐶');
    expect(puppifyDisplayName('   ')).to.equal('Puppy someone 🐶');
  });

  it('truncates very long names while preserving the trailing emoji', () => {
    const longName = 'a'.repeat(200);
    const out = puppifyDisplayName(longName);
    expect(out.length).to.be.at.most(WEBHOOK_USERNAME_MAX_LENGTH);
    expect(out.endsWith(' 🐶')).to.equal(true);
    expect(out.startsWith('Puppy ')).to.equal(true);
  });

  it('preserves an existing-Puppy name even when long, truncated to limit', () => {
    const longName = 'Puppy ' + 'a'.repeat(200);
    const out = puppifyDisplayName(longName);
    expect(out.length).to.be.at.most(WEBHOOK_USERNAME_MAX_LENGTH);
    expect(out.toLowerCase().startsWith('puppy')).to.equal(true);
  });
});
