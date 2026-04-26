import {
  MessageFlags,
  type Client,
  type Interaction,
} from 'discord.js';
import type { SlashCommand } from '../commands/index.js';
import { logger } from '../util/logger.js';

export function attachInteractionHandler(
  client: Client,
  commands: Map<string, SlashCommand>,
): void {
  client.on('interactionCreate', (interaction: Interaction) => {
    void dispatch(interaction, commands);
  });
}

async function dispatch(
  interaction: Interaction,
  commands: Map<string, SlashCommand>,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    logger.warn(`No handler registered for /${interaction.commandName}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: 'This command is not currently available.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => undefined);
    }
    return;
  }

  try {
    await command.handle(interaction);
  } catch (err) {
    logger.error(`Error handling /${interaction.commandName}:`, err);
    const reply = {
      content: 'Something went wrong handling that command.',
      flags: MessageFlags.Ephemeral as const,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => undefined);
    } else {
      await interaction.reply(reply).catch(() => undefined);
    }
  }
}
