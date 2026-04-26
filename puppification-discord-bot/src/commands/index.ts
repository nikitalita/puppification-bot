import type { PuppificationStore } from '../state/puppificationStore.js';
import { createPuppifyCommand } from './puppify.js';
import type { SlashCommand } from './types.js';
import { createUnpuppifyCommand } from './unpuppify.js';

export type { SlashCommand } from './types.js';

export function buildCommands(store: PuppificationStore): SlashCommand[] {
  return [createPuppifyCommand(store), createUnpuppifyCommand(store)];
}

export function buildCommandMap(
  commands: SlashCommand[],
): Map<string, SlashCommand> {
  const map = new Map<string, SlashCommand>();
  for (const cmd of commands) {
    map.set(cmd.name, cmd);
  }
  return map;
}
