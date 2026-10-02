const db = require('./db');
const raiderio = require('./raiderio');
const { buildRunEmbed } = require('./embeds');

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_POLL_DELAY_MS = 10_000;
const PLAYER_DELAY_MS = 1500;

let isPolling = false;
let timer = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function byCompletionDate(a, b) {
  return (Date.parse(a.completed_at) || 0) - (Date.parse(b.completed_at) || 0);
}

async function resolveChannels(client, channelIds, cache) {
  const channels = [];
  for (const id of channelIds) {
    if (!cache.has(id)) {
      let channel = null;
      try {
        channel = await client.channels.fetch(id);
      } catch (err) {
        console.error(`Canal ${id} introuvable :`, err.message);
      }
      cache.set(id, typeof channel?.send === 'function' ? channel : null);
    }
    if (cache.get(id)) channels.push(cache.get(id));
  }
  return channels;
}

async function pollPlayer(client, { key, player, channelIds }, channelCache) {
  const { runs } = await raiderio.getRecentRuns(player.region, player.realm, player.name);
  const currentIds = runs.map(raiderio.runId);
  const knownIds = db.getKnownRunIds(key);

  if (knownIds === null) {
    db.setKnownRunIds(key, currentIds);
    return 0;
  }

  const known = new Set(knownIds);
  const newRuns = runs.filter(r => !known.has(raiderio.runId(r))).sort(byCompletionDate);
  if (newRuns.length === 0) return 0;

  const channels = await resolveChannels(client, channelIds, channelCache);
  for (const run of newRuns) {
    const embed = buildRunEmbed(player, raiderio.formatRun(run));
    for (const channel of channels) {
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        console.error(`Envoi impossible dans le canal ${channel.id} :`, err.message);
      }
    }
  }

  // Runs are marked as seen even if a send failed: retrying would spam the
  // channels where it succeeded. Older ids are kept in case the API briefly
  // drops a run from its recent list.
  const merged = [...new Set([...currentIds, ...knownIds])];
  db.setKnownRunIds(key, merged);
  return newRuns.length;
}

/**
 * Returns { skipped: true } if a poll is already running, otherwise a summary.
 */
async function checkAllPlayers(client, { delayMs = PLAYER_DELAY_MS } = {}) {
  if (isPolling) return { skipped: true };
  isPolling = true;

  const summary = { skipped: false, players: 0, announced: 0, errors: 0 };
  try {
    const tracked = db.getTrackedPlayers();
    const channelCache = new Map();

    for (const [i, target] of tracked.entries()) {
      summary.players++;
      try {
        summary.announced += await pollPlayer(client, target, channelCache);
      } catch (err) {
        summary.errors++;
        const { name, realm } = target.player;
        console.error(`Erreur lors de la récupération de ${name} (${realm}) :`, err.message);
      }
      if (delayMs > 0 && i < tracked.length - 1) await sleep(delayMs);
    }
  } finally {
    isPolling = false;
  }
  return summary;
}

function startPolling(client) {
  if (timer) return;
  console.log(`🔄 Polling démarré (intervalle : ${POLL_INTERVAL_MS / 1000}s)`);

  const loop = async () => {
    try {
      await checkAllPlayers(client);
    } catch (err) {
      console.error('❌ Erreur pendant le poll :', err);
    }
    if (timer) timer = setTimeout(loop, POLL_INTERVAL_MS);
  };
  timer = setTimeout(loop, FIRST_POLL_DELAY_MS);
}

function stopPolling() {
  clearTimeout(timer);
  timer = null;
}

module.exports = { startPolling, stopPolling, checkAllPlayers };
