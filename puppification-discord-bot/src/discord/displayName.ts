import type { GuildMember } from 'discord.js';
import type { UserInfo } from '../state/puppificationStore.js';

/** Discord webhook usernames must be at most 80 characters. */
export const WEBHOOK_USERNAME_MAX_LENGTH = 80;

/**
 * Discord rejects webhook usernames containing any of these substrings
 * (case-insensitive) as a name-spoofing safeguard. We strip them rather
 * than fail the relay so a user named "Discordian" doesn't break us.
 *
 * See https://discord.com/developers/docs/resources/webhook#create-webhook
 */
const FORBIDDEN_SUBSTRINGS = ['discord', '@', '#', ':', '```'];

const PUPPY_PREFIX = 'Puppy';
const PUPPY_EMOJI = '🐶';

/**
 * Apply the puppification spec to a base display name:
 *
 *   "Nikita Lita"   -> "Puppy Nikita Lita 🐶"
 *   "Puppy Bandit"  -> "Puppy Bandit"             (already starts with Puppy)
 *   "puppy bandit"  -> "puppy bandit"             (case-insensitive prefix check)
 *
 * The prefix exception applies to the WHOLE transform: if the base
 * already starts with "Puppy" we leave it alone (no prefix, no emoji).
 *
 * Output is sanitized to satisfy Discord's webhook username rules and
 * truncated to 80 chars (with the trailing emoji preserved when we add
 * one ourselves, since dropping it mid-grapheme would look broken).
 */
export function puppifyDisplayName(base: string): string {
  const trimmed = base.trim();
  const fallback = trimmed.length === 0 ? 'someone' : trimmed;

  if (startsWithPuppy(fallback)) {
    return clampWebhookUsername(sanitize(fallback));
  }

  const prefixed = `${PUPPY_PREFIX} ${sanitize(fallback)}`;
  const suffix = ` ${PUPPY_EMOJI}`;
  // Reserve room for the suffix when truncating so we don't drop the
  // emoji we just promised.
  const maxBody = WEBHOOK_USERNAME_MAX_LENGTH - suffix.length;
  const body =
    prefixed.length > maxBody ? prefixed.slice(0, maxBody).trimEnd() : prefixed;
  return `${body}${suffix}`;
}

function startsWithPuppy(name: string): boolean {
  return name.toLowerCase().startsWith(PUPPY_PREFIX.toLowerCase());
}

function sanitize(name: string): string {
  let out = name;
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    // Case-insensitive global replace.
    const re = new RegExp(escapeRegex(bad), 'gi');
    out = out.replace(re, '');
  }
  // Collapse the whitespace we may have left after removing tokens.
  return out.replace(/\s+/g, ' ').trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampWebhookUsername(name: string): string {
  if (name.length <= WEBHOOK_USERNAME_MAX_LENGTH) return name;
  return name.slice(0, WEBHOOK_USERNAME_MAX_LENGTH).trimEnd();
}

/**
 * Build a fresh `UserInfo` snapshot for a guild member. Used both at
 * /puppify time (initial fill) and during lazy refresh in
 * messageCreate. Centralised here so the resolution logic exists in
 * exactly one place.
 */
export function buildUserInfo(member: GuildMember): UserInfo {
  const base = member.displayName ?? member.user.username;
  const avatarURL = member.displayAvatarURL({
    extension: 'png',
    size: 256,
    forceStatic: false,
  });
  return {
    puppifiedDisplayName: puppifyDisplayName(base),
    avatarURL,
    retrievedAt: Date.now(),
  };
}
