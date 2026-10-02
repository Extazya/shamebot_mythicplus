require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Missing variables in .env: ${missing.join(', ')}`);
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'src/commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    // GUILD_ID registers instantly on one server, global registration can take up to an hour
    const guildId = process.env.GUILD_ID;
    const route = guildId
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    console.log(`📡 Registering ${commands.length} slash commands (${guildId ? `guild ${guildId}` : 'global'})...`);

    const data = await rest.put(route, { body: commands });

    console.log(`✅ ${data.length} commands registered`);
    data.forEach(cmd => console.log(`  - /${cmd.name}`));
  } catch (error) {
    console.error('❌ Command registration failed:', error);
    process.exit(1);
  }
})();
