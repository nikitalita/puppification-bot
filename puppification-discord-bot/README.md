# puppification-discord-bot

A Discord bot that hijacks designated users' messages and re-posts them as humorous dog-speech. Wires the [`emotion-classifier`](../emotion-classifier) and [`puppifier`](../puppifier) sibling packages onto Discord via [discord.js](https://discord.js.org/).

When a user is "puppified", the bot:

1. Watches messages they send in any channel of the guild they were puppified in.
2. Runs each message through the GoEmotions classifier and the puppifier translator.
3. Deletes the original and re-posts the puppified text via a per-channel webhook so the message appears under the user's own avatar with the display name `Puppy <name> 🐶`.

## Features

- `/puppify user:<User> [minutes:<1-1440>]` — puppify a user for a given duration (default 10 minutes). Mod-only (`Manage Messages`).
- `/unpuppify user:<User>` — stop puppifying a user. Mod-only.
- Mandatory model warm-up at startup so the first puppified message doesn't pay the model-load cost.
- Per-user FIFO message queue: same-user messages stay in submission order, different users process concurrently.
- Per-user `Puppifier` instance with its own RNG and recent-use buffers (the GoEmotions model itself is shared via the singleton inside `emotion-classifier`).
- Cached `UserInfo` (puppified display name + avatar URL) computed once at `/puppify` time and refreshed lazily after a 10-minute TTL, so we don't hit the member API on every relay but nickname/avatar changes still propagate.
- Auto-expiry announcement in the channel where the command ran.

## Install

The bot depends on `puppifier` and `emotion-classifier` via local file deps, so both must be built first:

```bash
cd ../emotion-classifier && npm install && npm run build
cd ../puppifier         && npm install && npm run build
cd ../puppification-discord-bot && npm install && npm run build
```

## Configure

Create the bot in the [Discord Developer Portal](https://discord.com/developers/applications):

1. **Application -> General Information**: copy the *Application ID* (this is the `CLIENT_ID`).
2. **Application -> Bot**:
   - Set the bot's username to `Puppifier Bot` (this is the bot's "default profile" identity used for slash command replies and end-of-puppification announcements).
   - Under **Privileged Gateway Intents**, enable both **Message Content Intent** and **Server Members Intent**.
   - **Reset Token** and copy it (this is `DISCORD_TOKEN`).
3. **Application -> OAuth2 -> URL Generator**:
   - Scopes: `bot`, `applications.commands`.
   - Bot permissions: `View Channels`, `Send Messages`, `Manage Messages`, `Manage Webhooks`, `Read Message History`, `Use Slash Commands`.
     - Permissions Integer: `2684431360`
     - default: https://discord.com/oauth2/authorize?client_id=1498090842244649042&permissions=2684431360&integration_type=0&scope=bot+applications.commands
   - Open the generated URL and add the bot to your server.

Then locally:

```bash
cp .env.example .env
# fill DISCORD_TOKEN and CLIENT_ID
# optionally set GUILD_ID for instant slash command propagation in dev
```

## Run

Just start the bot:

```bash
npm start         # production: build first, runs from dist/
# or
npm run dev       # development: tsx --watch
```

Slash commands are registered **per-guild, automatically**:

- On startup, the bot syncs commands to every guild it's already a member of (so command-schema changes from a deploy land everywhere immediately).
- When the bot is added to a new guild, a `guildCreate` event fires and the bot registers commands on that guild instantly. Users see `/puppify` and `/unpuppify` the moment the bot appears in their server — no propagation delay.

If `GUILD_ID` is set in the env, the bot scopes all registration to that one guild (useful in development if your bot user happens to be in other servers you don't want to touch).

The very first start will download the ~80 MB GoEmotions ONNX model into `~/.cache/huggingface/`. Subsequent starts are fully offline.

> **Dev convenience.** `npm run register` is also available — it pushes the current command schema to the guild named by `GUILD_ID` without restarting the bot. Useful when iterating on command definitions during `npm run dev`. You won't need it in production; it requires `GUILD_ID` to be set.

## Usage

Once the bot is online:

```
/puppify user:@nikita
```

Replies in-channel with `🐶 @nikita has been puppified for 10 minutes!`. From that point until the timer expires (or `/unpuppify` is run), every message Nikita sends in that guild will be replaced with a puppified version posted under their avatar as `Puppy Nikita 🐶`.

To set a custom duration:

```
/puppify user:@nikita minutes:30
```

To stop early:

```
/unpuppify user:@nikita
```

When the timer expires, the bot announces `@nikita is no longer puppified.` in the channel where `/puppify` was originally invoked.

## Architecture

```
src/
  index.ts                       entrypoint: warm up classifier, build client, login
  config.ts                      env validation
  client.ts                      discord.js client + intents
  state/puppificationStore.ts    Map<guild:user, Entry>; per-user Puppifier + UserInfo with TTL
  pipeline/puppifierPipeline.ts  mandatory startup model warm-up
  pipeline/userQueue.ts          per-key FIFO promise chain
  commands/                      /puppify, /unpuppify slash commands (mod-only)
  handlers/interactionCreate.ts  slash command dispatcher
  handlers/messageCreate.ts      message -> stale check -> queue -> classify -> relay
  discord/displayName.ts         `Puppy <name> 🐶` transform + sanitation
  discord/webhookManager.ts      per-channel cached "Puppifier Bot" webhook
  discord/relayMessage.ts        delete original + webhook send with thread/attachment support
  util/duration.ts               minutes <-> ms, pretty-print
  util/logger.ts                 timestamped console wrapper
scripts/register-commands.ts     one-shot REST PUT to Discord
tests/                           mocha + chai unit tests
```

### Concurrency

```
gateway thread          per-user queue           shared classifier
─────────────────       ──────────────────       ───────────────────
messageCreate
  → cheap filtering
  → enqueue(guild:user, …)
                        ┌────────────────┐
                        │ ensureFreshUI  │       (single ONNX pipeline,
                        │ translate(text)│ ──→    process-wide, lazy
                        │ relay (delete  │        singleton)
                        │   + webhook)   │
                        └────────────────┘
```

The gateway never awaits the classifier. Each per-user queue runs one message at a time so M1 always lands before M2 even when M1's classification is slower.

## Tests

```bash
npm test
```

Unit tests cover:

- `puppifyDisplayName` — prefix/suffix transform, prefix exception, sanitation, truncation.
- `PuppificationStore` — set/replace/clear, expiry-fires-handler, manual-unpuppify-skips-handler, cross-guild isolation.
- `userQueue` — same-key serialization, cross-key parallelism, error isolation, drain cleanup.

The integration paths (Discord gateway, real classifier inference) are not exercised in unit tests; run the bot in a dev guild to validate end-to-end.

## Known limitations

- **No persistence**: puppifications are in-memory only; restarting the bot clears all active puppifications. By design.
- **Per-guild scope only**: `/puppify` in server A does not affect server B even for the same user. By design.
- **Replies, embeds, stickers, voice messages**: not preserved across the relay. Webhooks can't replicate reply-references or stickers; embeds from the source message are dropped (only attachments are forwarded as files).
- **First-message latency on cold start**: the warm-up at boot covers model load, but the very first real puppification still has to wait for the warm-up to complete. Subsequent calls reuse the loaded model.
- **Webhook permissions**: the bot needs `Manage Webhooks` and `Manage Messages` in every channel a puppified user might post in. If the bot lacks them in a particular channel, that user's messages there are left untouched (logged as a warning).

## License

MIT.
