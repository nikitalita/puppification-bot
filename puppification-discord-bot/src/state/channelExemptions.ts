import { logger } from '../util/logger.js';
import { loadStore, saveStore } from './saveState.js';

/**
 * Per-guild set of channels in which the bot will NOT puppify any
 * message, regardless of whether the author is puppified.
 *
 * In-memory only (lost on restart) to match the rest of the bot's
 * state model. Per-guild scoped: an exemption in guild A has no effect
 * in guild B.
 *
 * Threads inherit their parent's exemption: if `#general` is exempt,
 * a thread under `#general` is also treated as exempt. The `is`
 * predicate accepts both the channel id and an optional parent id and
 * returns true when either is exempt.
 */
export class ChannelExemptionStore {
  private readonly byGuild = new Map<string, Set<string>>();

  constructor() {
    this.load();
  }

  /**
   * Add a channel to the exempt set for `guildId`. Returns true if the
   * channel was newly added, false if it was already exempt.
   */
  exempt(guildId: string, channelId: string): boolean {
    let set = this.byGuild.get(guildId);
    if (!set) {
      set = new Set();
      this.byGuild.set(guildId, set);
    }
    if (set.has(channelId)) return false;
    set.add(channelId);
    this.save();
    return true;
  }

  /**
   * Remove a channel from the exempt set. Returns true if the channel
   * was actually exempt and is now removed, false if it wasn't exempt.
   */
  unexempt(guildId: string, channelId: string): boolean {
    const set = this.byGuild.get(guildId);
    if (!set) return false;
    const removed = set.delete(channelId);
    if (set.size === 0) {
      this.byGuild.delete(guildId);
    }
    this.save();
    return removed;
  }

  /**
   * True iff `channelId` (or its `parentId`, when supplied) is in
   * `guildId`'s exempt set. Pass `parentId` when checking a thread so
   * exemption of the parent channel covers all of its threads.
   */
  is(
    guildId: string,
    channelId: string,
    parentId: string | null | undefined,
  ): boolean {
    const set = this.byGuild.get(guildId);
    if (!set) return false;
    if (set.has(channelId)) return true;
    if (parentId && set.has(parentId)) return true;
    return false;
  }

  /** Snapshot of exempt channel ids for the given guild. */
  list(guildId: string): string[] {
    const set = this.byGuild.get(guildId);
    if (!set) return [];
    return [...set];
  }

  /** Drop all exemptions. Tests / shutdown only. */
  clear(): void {
    this.byGuild.clear();
    this.save();
  }

  private save(): void {
    let safeGuildInfo: Record<string, Array<string>> = {};
    for (let [k, v] of this.byGuild.entries()) {
      safeGuildInfo[k] = Array.from(v.values());
    }
    saveStore("exemptions", { byGuild: safeGuildInfo });
  }

  private async load(): Promise<void> {
    try {
      let count = 0;
      const state = await loadStore("exemptions");
      if (!state.byGuild) {
        return;
      }

      for (let [guildId, channels] of Object.entries(state.byGuild)) {
        this.byGuild.set(guildId, new Set(channels as Array<string>) );
        count =+ (channels as Array<string>).length;
      }
      logger.info("Loaded", count, "channel exemptions");
    } catch (error) {
      logger.error('Failed to load state:', error);
    }
  }
}
