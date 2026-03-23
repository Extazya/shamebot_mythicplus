require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Validation des variables d'environnement
const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Variables manquantes dans .env : ${missing.join(', ')}`);
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
    console.log(`📡 Enregistrement de ${commands.length} commandes slash...`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log(`✅ ${data.length} commandes enregistrées avec succès !`);
    data.forEach(cmd => console.log(`  - /${cmd.name}`));
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement des commandes :', error);
    process.exit(1);
  }
})();
