const { getPlayers, getChannel, getLastRunIds, setLastRunIds } = require('./db');
const { getRecentRuns, formatRun } = require('./raiderio');
const { buildRunEmbed } = require('./embeds');

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Vérifie les nouvelles runs pour tous les joueurs suivis
 * et envoie les nouvelles dans le canal configuré.
 */
async function checkAllPlayers(client) {
  const channelId = getChannel();
  if (!channelId) return;

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch {
    console.error('Canal introuvable :', channelId);
    return;
  }

  const players = getPlayers();

  for (const player of players) {
    const playerKey = `${player.region}-${player.realm}-${player.name}`.toLowerCase();

    try {
      const { runs } = await getRecentRuns(player.region, player.realm, player.name);
      const knownIds = getLastRunIds(playerKey);

      const newRuns = runs.filter(r => !knownIds.includes(r.url));

      if (newRuns.length > 0) {
        // Envoyer du plus ancien au plus récent
        const sorted = [...newRuns].reverse();
        for (const run of sorted) {
          const formatted = formatRun(run);
          const embed = buildRunEmbed(player, formatted);
          await channel.send({ embeds: [embed] });
        }

        // Mettre à jour les IDs connus (garder les 50 derniers)
        const allIds = [...runs.map(r => r.url)];
        setLastRunIds(playerKey, allIds.slice(0, 50));
      }

      // Première initialisation : on stocke sans notifier
      if (knownIds.length === 0 && runs.length > 0) {
        setLastRunIds(playerKey, runs.map(r => r.url));
      }

    } catch (err) {
      console.error(`Erreur lors de la récupération de ${player.name} (${player.realm}) :`, err.message);
    }

    // Petite pause entre chaque joueur pour ne pas surcharger l'API
    await sleep(1000);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Démarre la boucle de polling
 */
function startPolling(client) {
  console.log(`🔄 Polling démarré (intervalle : ${POLL_INTERVAL_MS / 1000}s)`);

  // Premier check après 10 secondes (laisser le bot démarrer)
  setTimeout(() => {
    checkAllPlayers(client);
    setInterval(() => checkAllPlayers(client), POLL_INTERVAL_MS);
  }, 10_000);
}

module.exports = { startPolling, checkAllPlayers };
