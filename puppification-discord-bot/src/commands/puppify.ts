import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import { buildUserInfo } from '../discord/displayName.js';
import type { PuppificationStore } from '../state/puppificationStore.js';
import {
  DEFAULT_PUPPIFY_MINUTES,
  formatMinutes,
  MAX_PUPPIFY_MINUTES,
  MIN_PUPPIFY_MINUTES,
  minutesToMs,
} from '../util/duration.js';
import { logger } from '../util/logger.js';
import type { SlashCommand } from './types.js';

export function createPuppifyCommand(
  store: PuppificationStore,
): SlashCommand {
  const data = new SlashCommandBuilder()
    .setName('puppify')
    .setDescription(
      `Puppify a user's messages for the next ${DEFAULT_PUPPIFY_MINUTES} minutes (or a custom duration).`,
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('The user to puppify.')
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('minutes')
        .setDescription(
          `How long to puppify (default ${DEFAULT_PUPPIFY_MINUTES}, max ${MAX_PUPPIFY_MINUTES}).`,
        )
        .setMinValue(MIN_PUPPIFY_MINUTES)
        .setMaxValue(MAX_PUPPIFY_MINUTES)
        .setRequired(false),
    );

  return {
    name: 'puppify',
    data: data.toJSON(),
    handle: async (interaction) => handlePuppify(interaction, store),
  };
}

async function handlePuppify(
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
  const minutes =
    interaction.options.getInteger('minutes', false) ??
    DEFAULT_PUPPIFY_MINUTES;

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: 'Could not resolve this server. Try again in a moment.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let member: GuildMember;
  try {
    member = await guild.members.fetch(targetUser.id);
  } catch (err) {
    logger.warn(
      `Could not fetch member ${targetUser.id} in guild ${guild.id}:`,
      err,
    );
    await interaction.reply({
      content: `Could not find <@${targetUser.id}> in this server.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const userInfo = buildUserInfo(member);

  store.puppify({
    guildId: interaction.guildId,
    userId: targetUser.id,
    durationMs: minutesToMs(minutes),
    announceChannelId: interaction.channelId,
    userInfo,
  });

  await interaction.reply({
    content: `🐶 <@${targetUser.id}> has been puppified for ${formatMinutes(minutes)}!`,
    allowedMentions: { parse: [] },
  });
}
