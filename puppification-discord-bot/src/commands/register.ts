import {
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { logger } from '../util/logger.js';

export type CommandJson = RESTPostAPIChatInputApplicationCommandsJSONBody;

/** Build a REST client preconfigured for the v10 application command API. */
export function makeRest(token: string): REST {
  return new REST({ version: '10' }).setToken(token);
}

/**
 * Register / overwrite the slash command set for a single guild.
 * Per-guild registrations propagate INSTANTLY (vs up to ~1 hour for
 * global), which is why we prefer this everywhere.
 */
export async function registerCommandsForGuild(
  rest: REST,
  clientId: string,
  guildId: string,
  commands: CommandJson[],
): Promise<void> {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });
  logger.info(
    `Registered ${commands.length} slash command(s) on guild ${guildId}.`,
  );
}

/**
 * Sync slash commands to every guild in `guildIds` in parallel.
 *
 * Used at startup to cover guilds we're already in (so command-schema
 * changes from a deploy land everywhere). Discord deduplicates no-op
 * overwrites, so this is cheap to call on every restart.
 *
 * Failures are logged per-guild; one guild's failure does not abort
 * the others.
 */
export async function syncGuilds(
  rest: REST,
  clientId: string,
  guildIds: Iterable<string>,
  commands: CommandJson[],
): Promise<void> {
  const ids = [...guildIds];
  if (ids.length === 0) {
    logger.info(
      'No guilds to sync slash commands to (bot is in 0 guilds). ' +
        'Commands will be registered automatically when the bot is added to a guild.',
    );
    return;
  }
  logger.info(
    `Syncing ${commands.length} slash command(s) to ${ids.length} guild(s)...`,
  );
  const results = await Promise.allSettled(
    ids.map((id) => registerCommandsForGuild(rest, clientId, id, commands)),
  );
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error('Per-guild registration failed:', r.reason);
    }
  }
}
