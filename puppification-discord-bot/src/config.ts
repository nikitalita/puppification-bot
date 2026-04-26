import 'dotenv/config';

export interface Config {
  discordToken: string;
  clientId: string;
  guildId: string | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim();
}

export function loadConfig(): Config {
  return {
    discordToken: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('CLIENT_ID'),
    guildId: optionalEnv('GUILD_ID'),
  };
}
