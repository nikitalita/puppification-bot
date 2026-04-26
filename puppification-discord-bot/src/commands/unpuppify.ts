import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { PuppificationStore } from '../state/puppificationStore.js';
import type { SlashCommand } from './types.js';

export function createUnpuppifyCommand(
  store: PuppificationStore,
): SlashCommand {
  const data = new SlashCommandBuilder()
    .setName('unpuppify')
    .setDescription("Stop puppifying a user's messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('The user to un-puppify.')
        .setRequired(true),
    );

  return {
    name: 'unpuppify',
    data: data.toJSON(),
    handle: async (interaction) => handleUnpuppify(interaction, store),
  };
}

async function handleUnpuppify(
  interaction: ChatInputCommandInteraction,
  store: PuppificationStore,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetUser = interaction.options.getUser('user', true);
  const removed = store.unpuppify(interaction.guildId, targetUser.id);

  if (!removed) {
    await interaction.reply({
      content: `<@${targetUser.id}> isn't currently puppified.`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.reply({
    content: `<@${targetUser.id}> is no longer puppified.`,
    allowedMentions: { parse: [] },
  });
}
