import { expect } from 'chai';
import {
  PuppificationStore,
  type Entry,
  type UserInfo,
} from '../src/state/puppificationStore.ts';

function fakeUserInfo(): UserInfo {
  return {
    puppifiedDisplayName: 'Puppy Test 🐶',
    avatarURL: 'https://example.com/a.png',
    retrievedAt: Date.now(),
  };
}

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('PuppificationStore', () => {
  it('starts empty', () => {
    const store = new PuppificationStore();
    expect(store.size()).to.equal(0);
    expect(store.has('g', 'u')).to.equal(false);
    expect(store.get('g', 'u')).to.equal(undefined);
  });

  it('adds an entry and reports it as active', () => {
    const store = new PuppificationStore();
    const entry = store.puppify({
      guildId: 'g1',
      userId: 'u1',
      durationMs: 60_000,
      announceChannelId: 'c1',
      userInfo: fakeUserInfo(),
    });
    expect(entry.guildId).to.equal('g1');
    expect(entry.userId).to.equal('u1');
    expect(entry.expiresAt).to.be.greaterThan(Date.now());
    expect(store.has('g1', 'u1')).to.equal(true);
    expect(store.size()).to.equal(1);
    store.clear();
  });

  it('replaces an existing entry and clears the previous timer', () => {
    const store = new PuppificationStore();
    const first = store.puppify({
      guildId: 'g1',
      userId: 'u1',
      durationMs: 1_000_000,
      announceChannelId: 'c1',
      userInfo: fakeUserInfo(),
    });
    const second = store.puppify({
      guildId: 'g1',
      userId: 'u1',
      durationMs: 1_000_000,
      announceChannelId: 'c2',
      userInfo: fakeUserInfo(),
    });
    expect(first.timer).to.not.equal(second.timer);
    expect(store.size()).to.equal(1);
    expect(store.get('g1', 'u1')?.announceChannelId).to.equal('c2');
    store.clear();
  });

  it('isolates entries across guilds', () => {
    const store = new PuppificationStore();
    store.puppify({
      guildId: 'g1',
      userId: 'u1',
      durationMs: 60_000,
      announceChannelId: 'c1',
      userInfo: fakeUserInfo(),
    });
    store.puppify({
      guildId: 'g2',
      userId: 'u1',
      durationMs: 60_000,
      announceChannelId: 'c2',
      userInfo: fakeUserInfo(),
    });
    expect(store.size()).to.equal(2);
    expect(store.has('g1', 'u1')).to.equal(true);
    expect(store.has('g2', 'u1')).to.equal(true);
    store.unpuppify('g1', 'u1');
    expect(store.has('g1', 'u1')).to.equal(false);
    expect(store.has('g2', 'u1')).to.equal(true);
    store.clear();
  });

  it('unpuppify returns the removed entry and is a no-op for unknown keys', () => {
    const store = new PuppificationStore();
    expect(store.unpuppify('g', 'u')).to.equal(undefined);
    store.puppify({
      guildId: 'g',
      userId: 'u',
      durationMs: 60_000,
      announceChannelId: 'c',
      userInfo: fakeUserInfo(),
    });
    const removed = store.unpuppify('g', 'u');
    expect(removed).to.not.equal(undefined);
    expect(removed?.userId).to.equal('u');
    expect(store.has('g', 'u')).to.equal(false);
    store.clear();
  });

  it('fires the onExpire callback when the timer elapses', async () => {
    const store = new PuppificationStore();
    let expired: Entry | undefined;
    store.setOnExpire((entry) => {
      expired = entry;
    });
    store.puppify({
      guildId: 'g',
      userId: 'u',
      durationMs: 20,
      announceChannelId: 'c',
      userInfo: fakeUserInfo(),
    });
    await tick(60);
    expect(expired?.userId).to.equal('u');
    expect(store.has('g', 'u')).to.equal(false);
  });

  it('does NOT fire onExpire for a manual unpuppify', async () => {
    const store = new PuppificationStore();
    let expired = false;
    store.setOnExpire(() => {
      expired = true;
    });
    store.puppify({
      guildId: 'g',
      userId: 'u',
      durationMs: 50,
      announceChannelId: 'c',
      userInfo: fakeUserInfo(),
    });
    store.unpuppify('g', 'u');
    await tick(80);
    expect(expired).to.equal(false);
  });

  it('clear() removes everything and cancels timers', async () => {
    const store = new PuppificationStore();
    let expired = 0;
    store.setOnExpire(() => {
      expired += 1;
    });
    store.puppify({
      guildId: 'g',
      userId: 'u1',
      durationMs: 30,
      announceChannelId: 'c',
      userInfo: fakeUserInfo(),
    });
    store.puppify({
      guildId: 'g',
      userId: 'u2',
      durationMs: 30,
      announceChannelId: 'c',
      userInfo: fakeUserInfo(),
    });
    expect(store.size()).to.equal(2);
    store.clear();
    expect(store.size()).to.equal(0);
    await tick(80);
    expect(expired).to.equal(0);
  });
});
