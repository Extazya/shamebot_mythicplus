require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, MessageFlags } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const db = require('./db');
const { startPolling, stopPolling } = require('./poller');

const missing = ['DISCORD_TOKEN'].filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Missing variables in .env: ${missing.join(', ')}`);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

/**
 * v1 stored a single channel and player list for the whole bot. Bind them to
 * the guild owning that channel, or to the only guild if the bot is in just one.
 */
async function migrateLegacyConfig() {
  const legacy = db.getLegacy();
  if (!legacy) return;

  let guildId = null;
  if (legacy.channelId) {
    try {
      guildId = (await client.channels.fetch(legacy.channelId))?.guildId ?? null;
    } catch {
      // Channel deleted or inaccessible, fall back below
    }
  }
  if (!guildId && client.guilds.cache.size === 1) guildId = client.guilds.cache.first().id;

  if (guildId) {
    db.claimLegacy(guildId);
    console.log(`📦 v1 configuration migrated to guild ${guildId}`);
  } else {
    console.warn('⚠️  v1 configuration not migrated, its guild could not be found. Run /setchannel and /add again.');
  }
}

// ─── Discord events ──────────────────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await migrateLegacyConfig();
  startPolling(client);
});

client.on(Events.GuildDelete, (guild) => {
  console.log(`👋 Removed from guild ${guild.id}, dropping its configuration`);
  db.removeGuild(guild.id);
});

client.on(Events.Warn,  (msg) => console.warn('⚠️  Discord warn:', msg));
client.on(Events.Error, (err) => console.error('❌ Discord error:', err.message));

client.on(Events.ShardDisconnect,   (_, id) => console.warn(`🔌 Shard ${id} disconnected`));
client.on(Events.ShardReconnecting, (id)    => console.log(`🔄 Shard ${id} reconnecting...`));
client.on(Events.ShardResume,       (id)    => console.log(`✅ Shard ${id} resumed`));

// ─── Interactions ─────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // Commands registered before setContexts() existed can still show up in DMs
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: '❌ This command only works in a Discord server.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ /${interaction.commandName} failed:`, error);
    const msg = { content: '❌ Something went wrong, please try again.', flags: MessageFlags.Ephemeral };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch {
      // Interaction token expired (>3s without reply or >15min after defer)
    }
  }
});

// ─── Shutdown ─────────────────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 ${signal} received, shutting down...`);
  stopPolling();
  try {
    await client.destroy();
  } finally {
    process.exit(exitCode);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled rejection:', reason);
});
// The process state is undefined after an uncaught exception, so exit and let
// the supervisor (PM2, systemd, Docker...) restart a clean instance.
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception:', err);
  shutdown('uncaughtException', 1);
});

// ─── Login ────────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('❌ Discord login failed:', err.message);
  process.exit(1);
});
