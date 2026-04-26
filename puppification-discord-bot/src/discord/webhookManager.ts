import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type Webhook,
} from 'discord.js';
import { logger } from '../util/logger.js';

/**
 * The display name we set on the webhook itself (separate from the
 * per-message `username` override). We name it "Puppifier Bot" so server
 * admins inspecting their integration list can tell what it's for.
 */
const WEBHOOK_NAME = 'Puppifier Bot';

interface CachedHook {
  webhook: Webhook;
}

/**
 * Resolves and caches one "Puppifier Bot" webhook per parent text
 * channel. Threads are resolved to their parent — webhooks live on the
 * parent channel and posts are routed to the thread via `threadId` at
 * send time (handled in relayMessage.ts).
 *
 * The bot needs `Manage Webhooks` permission in the channel. If we
 * don't have it (or the channel isn't a text channel we can post to),
 * `getOrCreate` returns null and the relay path skips quietly.
 */
export class WebhookManager {
  private readonly cache = new Map<string, CachedHook>();

  constructor(private readonly client: Client) {}

  /**
   * Drop a cached webhook (e.g. after a 404 / Unknown Webhook from a
   * send). Next call to `getOrCreate` will re-fetch or recreate.
   */
  invalidate(channelId: string): void {
    this.cache.delete(channelId);
  }

  /**
   * Returns a Webhook hosted on the parent text channel of `channel`,
   * creating it if no existing "Puppifier Bot" webhook is found, or
   * `null` if we can't (permissions / unsupported channel type).
   */
  async getOrCreate(
    channel: GuildBasedChannel | GuildTextBasedChannel,
  ): Promise<Webhook | null> {
    const parent = resolveWebhookParent(channel);
    if (!parent) return null;

    const cached = this.cache.get(parent.id);
    if (cached) return cached.webhook;

    const me = parent.guild.members.me;
    if (!me) return null;
    const perms = parent.permissionsFor(me);
    if (!perms || !perms.has(PermissionFlagsBits.ManageWebhooks)) {
      logger.warn(
        `Missing Manage Webhooks permission in #${parent.name} (${parent.id}); cannot puppify here.`,
      );
      return null;
    }

    try {
      const existing = await parent.fetchWebhooks();
      const ours = existing.find(
        (hook) =>
          hook.owner !== null &&
          hook.owner.id === this.client.user?.id &&
          hook.name === WEBHOOK_NAME,
      );
      if (ours) {
        this.cache.set(parent.id, { webhook: ours });
        return ours;
      }

      const created = await parent.createWebhook({
        name: WEBHOOK_NAME,
        avatar: this.client.user?.displayAvatarURL({
          extension: 'png',
          size: 256,
        }),
        reason: 'Puppifier bot relay webhook',
      });
      this.cache.set(parent.id, { webhook: created });
      return created;
    } catch (err) {
      logger.error(
        `Failed to fetch/create webhook in channel ${parent.id}:`,
        err,
      );
      return null;
    }
  }
}

/**
 * Webhooks must live on a regular guild text channel (or announcement /
 * forum channel). Threads delegate to their parent. Voice / stage / DM
 * channels are unsupported.
 */
type WebhookParent = Extract<
  GuildBasedChannel,
  { fetchWebhooks: () => unknown; createWebhook: (...args: never[]) => unknown }
>;

function resolveWebhookParent(
  channel: GuildBasedChannel | GuildTextBasedChannel,
): WebhookParent | null {
  if (
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
  ) {
    const parent = channel.parent;
    if (!parent) return null;
    return parent as unknown as WebhookParent;
  }
  if (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildForum
  ) {
    return channel as unknown as WebhookParent;
  }
  return null;
}
