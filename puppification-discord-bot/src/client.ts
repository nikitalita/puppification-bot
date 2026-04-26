import {
  Client,
  GatewayIntentBits,
  Options,
  Partials,
} from 'discord.js';

/**
 * Build the Discord.js client with the intents needed by the bot.
 *
 * - Guilds: required for any guild-scoped event.
 * - GuildMessages: receive messageCreate events from guild channels.
 * - MessageContent: PRIVILEGED. Required to read message text so we can
 *   actually puppify it. Must be enabled in the developer portal under
 *   Bot -> Privileged Gateway Intents.
 * - GuildMembers: PRIVILEGED. Used so member.displayName / nickname
 *   resolution works without a per-message REST fetch when the member
 *   has been seen before. Also enables initial member resolution at
 *   /puppify time.
 *
 * We keep the default cache config but enable the GuildMember partial so
 * that member events are still delivered for uncached members, and we
 * can fetch them on demand if needed.
 */
export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.GuildMember, Partials.User],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
    }),
  });
}
