import type { Client, GuildMember, Message } from 'discord.js';
import { buildUserInfo } from '../discord/displayName.js';
import { relayPuppifiedMessage } from '../discord/relayMessage.js';
import type { WebhookManager } from '../discord/webhookManager.js';
import { enqueue } from '../pipeline/userQueue.js';
import {
  USER_INFO_TTL_MS,
  type Entry,
  type PuppificationStore,
  type UserInfo,
} from '../state/puppificationStore.js';
import { logger } from '../util/logger.js';

export interface MessageCreateHandlerOptions {
  client: Client;
  store: PuppificationStore;
  webhooks: WebhookManager;
}

/**
 * Hook the messageCreate event. The handler is intentionally tiny and
 * synchronous on the gateway side — it does cheap filtering, then
 * enqueues the heavy work (classification + relay) onto a per-user
 * FIFO queue so:
 *
 *   - we never block the gateway awaiting inference;
 *   - same-user messages stay strictly in order;
 *   - different users run in parallel.
 *
 * Webhook messages from our own webhook (`webhookId` set, author id
 * equal to a webhook hosted by us) are ignored to avoid an infinite
 * relay loop. Messages from regular bots and other users are accepted —
 * if the author is currently puppified we relay them just like a human.
 */
export function attachMessageHandler(
  options: MessageCreateHandlerOptions,
): void {
  const { client, store, webhooks } = options;

  client.on('messageCreate', (message: Message) => {
    void handle(message, store, webhooks);
  });
}

async function handle(
  message: Message,
  store: PuppificationStore,
  webhooks: WebhookManager,
): Promise<void> {
  // Ignore DMs (per-guild scope).
  if (!message.inGuild()) return;

  // Ignore anything originating from a webhook. This catches our own
  // relays (which would otherwise loop) and any other webhook traffic.
  // Human and regular-bot messages have `webhookId === null`.
  if (message.webhookId !== null) return;

  // Ignore the bot's own non-webhook messages (e.g. its slash command
  // replies / expiry announcements).
  if (message.author.id === message.client.user.id) return;

  const entry = store.get(message.guildId, message.author.id);
  if (!entry) return;

  // Snapshot the text and identity here; everything downstream runs
  // on the per-user queue.
  const key = `${message.guildId}:${message.author.id}`;

  enqueue(key, async () => {
    try {
      await ensureFreshUserInfo(entry, message);
      const result = await entry.puppifier.translate(message.content);
      const puppifiedText = result.text.trim();
      await relayPuppifiedMessage({
        message,
        entry,
        puppifiedText,
        webhooks,
      });
    } catch (err) {
      logger.error(
        `Failed to puppify message ${message.id} from ${message.author.id} in guild ${message.guildId}:`,
        err,
      );
    }
  });
}

/**
 * If `entry.userInfo` is older than the TTL, refresh it from the
 * current guild member. Concurrent stale messages share a single
 * in-flight refresh promise so we don't trigger N parallel REST
 * fetches for the same user.
 */
async function ensureFreshUserInfo(
  entry: Entry,
  message: Message<true>,
): Promise<void> {
  const age = Date.now() - entry.userInfo.retrievedAt;
  if (age <= USER_INFO_TTL_MS) return;

  if (entry.refreshPromise) {
    await entry.refreshPromise;
    return;
  }

  const refresh = doRefresh(entry, message).finally(() => {
    if (entry.refreshPromise === refresh) {
      entry.refreshPromise = undefined;
    }
  });
  entry.refreshPromise = refresh;
  await refresh;
}

async function doRefresh(
  entry: Entry,
  message: Message<true>,
): Promise<UserInfo> {
  let member: GuildMember;
  try {
    // Prefer the cached member on the message; fall back to a REST
    // fetch if it's missing (e.g. uncached partial).
    member =
      message.member ?? (await message.guild.members.fetch(message.author.id));
  } catch (err) {
    logger.warn(
      `Could not refresh member ${message.author.id} in guild ${message.guildId}; keeping stale UserInfo:`,
      err,
    );
    // Mark as recently refreshed so we don't hammer the API on every
    // message until the TTL elapses again.
    entry.userInfo = {
      ...entry.userInfo,
      retrievedAt: Date.now(),
    };
    return entry.userInfo;
  }

  const next = buildUserInfo(member);
  entry.userInfo = next;
  return next;
}
