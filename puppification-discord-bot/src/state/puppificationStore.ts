import { defaultProfile, Puppifier } from 'puppifier';

/**
 * Cached identity used when relaying a puppified message via webhook.
 * Held on the Entry so we don't re-fetch the member or rebuild the
 * `Puppy <name> 🐶` string on every message. Refreshed lazily by
 * `messageCreate` when `retrievedAt` is older than `USER_INFO_TTL_MS`,
 * so nickname / avatar changes propagate within a bounded window
 * without paying a member fetch on every relay.
 */
export interface UserInfo {
  /** Already run through the `Puppy <name> 🐶` transform. */
  puppifiedDisplayName: string;
  avatarURL: string;
  /** Unix ms timestamp of the last guild-member resolution. */
  retrievedAt: number;
}

export interface Entry {
  guildId: string;
  userId: string;
  /** Unix ms timestamp at which this entry will auto-expire. */
  expiresAt: number;
  /** Channel where /puppify ran; auto-expiry posts the end notice here. */
  announceChannelId: string;
  /** Timer that fires the auto-expiry. Cleared on replace/unpuppify. */
  timer: NodeJS.Timeout;
  /**
   * Per-user Puppifier instance. Each puppified user has their own RNG
   * stream and recent-use buffers, so two puppified users in the same
   * channel don't share dedup windows or seeds. The underlying
   * GoEmotions classifier is a process-wide lazy singleton inside
   * emotion-classifier, so all per-user Puppifiers share the same loaded
   * model — we never load the ~80MB weights more than once.
   */
  puppifier: Puppifier;
  /**
   * Cached identity. Populated at /puppify time; refreshed lazily by
   * messageCreate when stale (see USER_INFO_TTL_MS).
   */
  userInfo: UserInfo;
  /**
   * In-flight refresh promise. When several messages from the same
   * puppified user arrive while the entry is stale, the first one
   * starts the refresh and stores its promise here; subsequent
   * messages await it instead of triggering parallel re-fetches.
   * Cleared once the refresh resolves (or rejects).
   */
  refreshPromise?: Promise<UserInfo> | undefined;
}

/**
 * Cached UserInfo TTL. When messageCreate sees an entry whose
 * `userInfo.retrievedAt` is older than this, it re-fetches the guild
 * member, re-runs the `Puppy <name> 🐶` transform, refreshes the avatar
 * URL, and writes the new UserInfo back onto the entry before relaying.
 * 10 minutes is a good balance between staleness and fetch cost.
 */
export const USER_INFO_TTL_MS = 10 * 60 * 1000;

export type ExpiryHandler = (entry: Entry) => void | Promise<void>;

function makeKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export interface PuppifyParams {
  guildId: string;
  userId: string;
  durationMs: number;
  announceChannelId: string;
  userInfo: UserInfo;
}

/**
 * In-memory, per-(guild,user) store of active puppifications.
 *
 * Not persisted across restarts (intentional). The caller is
 * responsible for constructing a `UserInfo` (via the shared
 * `buildUserInfo` helper) and passing it in; the store does not import
 * discord.js types so it stays trivially testable.
 */
export class PuppificationStore {
  private readonly entries = new Map<string, Entry>();
  private onExpire: ExpiryHandler | undefined;

  /**
   * Register the callback that fires when an entry auto-expires (timer
   * elapses). Manual `unpuppify(...)` calls do NOT trigger this — the
   * caller already knows; expiry is the surprise-async path.
   */
  setOnExpire(handler: ExpiryHandler | undefined): void {
    this.onExpire = handler;
  }

  has(guildId: string, userId: string): boolean {
    return this.entries.has(makeKey(guildId, userId));
  }

  get(guildId: string, userId: string): Entry | undefined {
    return this.entries.get(makeKey(guildId, userId));
  }

  /**
   * Start (or restart) puppification for (guildId, userId).
   *
   * Replaces any existing entry: clears its timer, builds a fresh
   * Puppifier, and arms a new auto-expiry timer.
   */
  puppify(params: PuppifyParams): Entry {
    const key = makeKey(params.guildId, params.userId);
    const existing = this.entries.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const profile = { ...defaultProfile };
    profile.actionShape.includeObjects = false;
    profile.actionShape.includeModifiers = false;
    profile.actionsAtEndOnly = true;

    const expiresAt = Date.now() + params.durationMs;
    const entry: Entry = {
      guildId: params.guildId,
      userId: params.userId,
      expiresAt,
      announceChannelId: params.announceChannelId,
      timer: setTimeout(() => this.handleExpiry(key), params.durationMs),
      puppifier: new Puppifier({ profile }),
      userInfo: params.userInfo,
      refreshPromise: undefined,
    };
    this.entries.set(key, entry);
    return entry;
  }

  /**
   * Stop puppification (no-op if not active). Returns the removed
   * entry, if any. Does NOT trigger the onExpire callback.
   */
  unpuppify(guildId: string, userId: string): Entry | undefined {
    const key = makeKey(guildId, userId);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    this.entries.delete(key);
    return entry;
  }

  /** Clear all entries and their timers. Useful for shutdown / tests. */
  clear(): void {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
    }
    this.entries.clear();
  }

  /** Number of active puppifications. Mostly for tests / metrics. */
  size(): number {
    return this.entries.size;
  }

  private handleExpiry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    const handler = this.onExpire;
    if (!handler) return;
    Promise.resolve()
      .then(() => handler(entry))
      .catch(() => {
        // Swallow: the handler is responsible for its own logging. We
        // don't want a thrown handler to crash the timer thread.
      });
  }
}
