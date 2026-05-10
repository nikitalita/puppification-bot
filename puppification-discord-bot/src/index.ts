import { ChannelType, Events, MessageFlags, type Guild } from 'discord.js';
import { createClient } from './client.js';
import { buildCommandMap, buildCommands } from './commands/index.js';
import {
  makeRest,
  registerCommandsForGuild,
  syncGuilds,
  type CommandJson,
} from './commands/register.js';
import { WebhookManager } from './discord/webhookManager.js';
import { attachInteractionHandler } from './handlers/interactionCreate.js';
import { attachMessageHandler } from './handlers/messageCreate.js';
import { warmUpPuppifier } from './pipeline/puppifierPipeline.js';
import { loadConfig, type Config } from './config.js';
import { ChannelExemptionStore } from './state/channelExemptions.js';
import {
  PuppificationStore,
  type Entry,
} from './state/puppificationStore.js';
import { logger } from './util/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();

  // Mandatory warm-up: load the GoEmotions model BEFORE we log in.
  // If this fails the process exits — we'd rather not come online with
  // a broken inference path.
  await warmUpPuppifier();

  const client = createClient();

  const store = new PuppificationStore();
  const exemptions = new ChannelExemptionStore();
  const webhooks = new WebhookManager(client);

  const commands = buildCommands({ store, exemptions });
  const commandsJson: CommandJson[] = commands.map((c) => c.data);
  const rest = makeRest(config.discordToken);

  // Auto-expiry: announce in the same channel where /puppify ran.
  store.setOnExpire(async (entry: Entry) => {
    try {
      const channel = await client.channels.fetch(entry.announceChannelId);
      if (!channel) return;
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement &&
        channel.type !== ChannelType.PublicThread &&
        channel.type !== ChannelType.PrivateThread &&
        channel.type !== ChannelType.AnnouncementThread &&
        channel.type !== ChannelType.GuildVoice &&
        channel.type !== ChannelType.GuildStageVoice
      ) {
        return;
      }
      if (!('send' in channel)) return;
      await channel.send({
        content: `<@${entry.userId}> is no longer puppified.`,
        allowedMentions: { parse: [] },
        flags: [MessageFlags.SuppressNotifications],
      });
    } catch (err) {
      logger.warn(
        `Failed to announce puppification end for ${entry.userId} in ${entry.announceChannelId}:`,
        err,
      );
    }
  });

  const commandMap = buildCommandMap(commands);
  attachInteractionHandler(client, commandMap);
  attachMessageHandler({ client, store, exemptions, webhooks });

  // Slash command registration is per-guild only:
  //
  // - Guilds we're already in: synced on `clientReady` (so deploys
  //   that change command schemas land immediately on every existing
  //   guild).
  // - Guilds we join later: registered on `guildCreate` (so commands
  //   light up the instant the bot is added to a new server).
  //
  // We never register globally — per-guild propagation is instant
  // while global can take up to ~1 hour, and there is no behavioural
  // benefit when we already have the per-guild path.
  //
  // GUILD_ID, when set, scopes ALL registration to a single guild —
  // useful in development if your bot user is in multiple servers and
  // you want to avoid touching them.
  let isFullyReady = false;

  client.once(Events.ClientReady, async (c) => {
    logger.info(`Logged in as ${c.user.tag} (id ${c.user.id}).`);
    try {
      await syncStartupGuilds(rest, config, c.guilds.cache.keys(), commandsJson);
    } catch (err) {
      logger.error('Initial slash command sync failed:', err);
    }
    isFullyReady = true;
  });

  client.on(Events.GuildCreate, (guild: Guild) => {
    // discord.js fires `guildCreate` for every guild during initial
    // gateway handshake too; the `clientReady` sync above already
    // covered those, so we ignore anything before we've finished
    // booting.
    if (!isFullyReady) return;
    if (config.guildId && guild.id !== config.guildId) {
      logger.info(
        `Joined guild ${guild.id} but GUILD_ID dev override restricts registration to ${config.guildId}; skipping.`,
      );
      return;
    }
    logger.info(
      `Joined guild ${guild.name} (${guild.id}); registering slash commands...`,
    );
    void registerCommandsForGuild(
      rest,
      config.clientId,
      guild.id,
      commandsJson,
    ).catch((err) => {
      logger.error(
        `Failed to register slash commands on newly-joined guild ${guild.id}:`,
        err,
      );
    });
  });

  client.on(Events.Error, (err) => {
    logger.error('Discord client error:', err);
  });

  setupShutdown(async () => {
    logger.info('Shutting down...');
    // Don't clear() on shutdown because it would delete the save. 
    // Just need to exit to clear memory.
    client.destroy();
  });

  await client.login(config.discordToken);
}

/**
 * Sync slash commands to the right set of guilds at startup.
 *
 * - With GUILD_ID set (dev): only that guild, even if the bot user is
 *   in others.
 * - Without GUILD_ID (prod): every guild the bot is currently in.
 */
async function syncStartupGuilds(
  rest: ReturnType<typeof makeRest>,
  config: Config,
  cachedGuildIds: Iterable<string>,
  commandsJson: CommandJson[],
): Promise<void> {
  if (config.guildId) {
    await registerCommandsForGuild(
      rest,
      config.clientId,
      config.guildId,
      commandsJson,
    );
    return;
  }
  await syncGuilds(rest, config.clientId, cachedGuildIds, commandsJson);
}

function setupShutdown(handler: () => Promise<void> | void): void {
  let shuttingDown = false;
  const wrap = (signal: string) => async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}.`);
    try {
      await handler();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGINT', wrap('SIGINT'));
  process.once('SIGTERM', wrap('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal error during startup:', err);
  process.exit(1);
});
