import { buildCommands } from '../src/commands/index.js';
import {
  makeRest,
  registerCommandsForGuild,
} from '../src/commands/register.js';
import { loadConfig } from '../src/config.js';
import { PuppificationStore } from '../src/state/puppificationStore.js';

/**
 * Force a slash command sync for a single guild without restarting
 * the bot. Strictly a development convenience.
 *
 * Production does NOT need this: the running bot registers commands
 * automatically on startup (per-guild for every guild it's in) and
 * again on every `guildCreate` event (instant when the bot joins a
 * new server). See `src/index.ts`.
 *
 * Requires `GUILD_ID` in the env so we know which guild to push to.
 * If you want to push to every guild, just restart the bot.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.guildId) {
    console.error(
      'GUILD_ID is not set in the environment.\n\n' +
        'This script targets a single guild for instant propagation during development.\n' +
        'Either set GUILD_ID and re-run, or just (re)start the bot — it auto-registers\n' +
        'per-guild on every guild it is in and on every guildCreate event.',
    );
    process.exit(2);
  }
  const store = new PuppificationStore();
  const commands = buildCommands(store).map((c) => c.data);
  const rest = makeRest(config.discordToken);
  await registerCommandsForGuild(
    rest,
    config.clientId,
    config.guildId,
    commands,
  );
}

main().catch((err) => {
  console.error('Failed to register commands:', err);
  process.exit(1);
});
