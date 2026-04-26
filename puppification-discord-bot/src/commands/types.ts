import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export interface SlashCommand {
  /** Slash command name (must match `data.name`). */
  name: string;
  /** REST-ready JSON for command registration. */
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  /** Invoked by interactionCreate when this command fires. */
  handle: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
