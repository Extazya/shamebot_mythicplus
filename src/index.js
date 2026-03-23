require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { startPolling } = require('./poller');

// Validation des variables d'environnement
const missing = ['DISCORD_TOKEN'].filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Variables manquantes dans .env : ${missing.join(', ')}`);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// Charger toutes les commandes
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// ─── Événements Discord ──────────────────────────────────────────────────────

client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  startPolling(client);
});

// Reconnexion automatique gérée par discord.js, mais on log les événements
client.on('warn',  (msg) => console.warn('⚠️  Discord warn:', msg));
client.on('error', (err) => console.error('❌ Discord error:', err.message));

client.on('shardDisconnect', (_, id) => console.warn(`🔌 Shard ${id} déconnecté`));
client.on('shardReconnecting', (id)  => console.log(`🔄 Shard ${id} en reconnexion...`));
client.on('shardResume',      (id)   => console.log(`✅ Shard ${id} reconnecté`));

// ─── Gestion des interactions ─────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Erreur commande /${interaction.commandName}:`, error);
    const msg = { content: '❌ Une erreur inattendue est survenue. Réessayez.', ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch {
      // L'interaction a peut-être expiré (>3s) — on ne peut plus répondre
    }
  }
});

// ─── Arrêt propre ─────────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n🛑 Signal ${signal} reçu, arrêt propre...`);
  client.destroy();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Erreurs non catchées : logger sans crasher si possible
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception:', err);
  // On ne quitte pas — discord.js se reconnecte tout seul
});

// ─── Connexion ────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);
