import {
  ChannelType,
  DiscordAPIError,
  type AttachmentPayload,
  type Message,
} from 'discord.js';
import type { Entry } from '../state/puppificationStore.js';
import { logger } from '../util/logger.js';
import type { WebhookManager } from './webhookManager.js';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dogURlsJson from '../assets/urls.json' with { type: "json" };


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Discord error codes we treat specially.
 *
 * - 10008 Unknown Message: the original was already deleted (race with
 *   another bot, the user, or a moderator). Nothing to relay — bail.
 * - 10015 Unknown Webhook: our cached webhook was deleted server-side.
 *   Drop the cache and retry once.
 */
const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_WEBHOOK = 10015;

export interface RelayInput {
  message: Message;
  entry: Entry;
  puppifiedText: string;
  webhooks: WebhookManager;
}

const DOG_IMG_URLS = dogURlsJson.urls;

/**
 * Helper function to pick a dog url.
 */
function pickDogUrl(): string {
  let idx = Math.floor(Math.random() * DOG_IMG_URLS.length);
  return DOG_IMG_URLS.slice(idx, idx+1)[0] ?? '';
}

/**
 * Delete the original message and re-send a puppified version via the
 * channel webhook so it appears under the user's avatar with the
 * `Puppy <name> 🐶` display name.
 *
 * All errors are caught and logged. The relay is best-effort: if we
 * can't delete (no perms) or can't send (no webhook perms), we leave
 * the original alone and move on.
 */
export async function relayPuppifiedMessage(input: RelayInput): Promise<void> {
  const { message, entry, puppifiedText, webhooks } = input;
  const channel = message.channel;
  if (!('guild' in channel) || !channel.guild)  {
    logger.warn("No guild property on channel", channel);
    return;
  }

  const webhook = await webhooks.getOrCreate(channel);
  if (!webhook) {
    logger.warn("No available webhook for message", channel.type);
    return;
  }

  // Forward attachments as files. Embeds, stickers, reply-references,
  // and voice messages can't be replicated through a webhook; documented
  // as a known limitation.
  const files: AttachmentPayload[] = message.attachments.map((att) => ({
    attachment: pickDogUrl(),
    name: att.name,
    description: att.description ?? undefined,
  }));

  // If both the puppified text and the attachment list are empty we'd
  // be sending an empty message (rejected by Discord). Leave the
  // original in place rather than silently deleting nothing-for-nothing.
  if (puppifiedText.trim() === '' && files.length === 0) {
    return;
  }

  // Delete the original first, then send the relay. If deletion fails
  // we abort (sending the relay anyway would result in two messages).
  try {
    await message.delete();
  } catch (err) {
    if (isDiscordError(err, UNKNOWN_MESSAGE)) {
      // Already gone; treat as success and proceed with the relay so
      // the puppified version still lands.
    } else {
      logger.warn(
        `Failed to delete original message ${message.id} in channel ${message.channelId}:`,
        err,
      );
      return;
    }
  }

  const threadId =
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
      ? channel.id
      : undefined;

  try {
    await webhook.send({
      content: puppifiedText.length > 0 ? puppifiedText : undefined,
      username: entry.userInfo.puppifiedDisplayName,
      avatarURL: entry.userInfo.avatarURL,
      threadId,
      allowedMentions: { parse: [] },
      files: files.length > 0 ? files : undefined,
    });
  } catch (err) {
    if (isDiscordError(err, UNKNOWN_WEBHOOK)) {
      // Webhook was deleted server-side (admin nuked it). Drop the
      // cached entry and retry once with a fresh one.
      webhooks.invalidate(channel.id);
      const retry = await webhooks.getOrCreate(channel);
      if (!retry) return;
      try {
        await retry.send({
          content: puppifiedText.length > 0 ? puppifiedText : undefined,
          username: entry.userInfo.puppifiedDisplayName,
          avatarURL: entry.userInfo.avatarURL,
          threadId,
          allowedMentions: { parse: [] },
          files: files.length > 0 ? files : undefined,
        });
      } catch (retryErr) {
        logger.error(
          `Webhook resend failed after recreate in channel ${channel.id}:`,
          retryErr,
        );
      }
      return;
    }
    logger.error(
      `Webhook send failed in channel ${channel.id}:`,
      err,
    );
  }
}

function isDiscordError(err: unknown, code: number): boolean {
  return err instanceof DiscordAPIError && err.code === code;
}
