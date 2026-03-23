const https = require('https');

const BASE_URL = 'https://raider.io/api/v1';

/**
 * Appel générique à l'API Raider.io
 */
function apiGet(urlPath) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${urlPath}`;
    const req = https.get(url, { headers: { 'User-Agent': 'WoW-MPlus-Discord-Bot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Réponse invalide de Raider.io'));
        }
      });
    });

    // Timeout de 10 secondes
    req.setTimeout(10_000, () => {
      req.destroy(new Error('Timeout Raider.io (10s)'));
    });

    req.on('error', reject);
  });
}

/**
 * Récupère le profil d'un personnage avec ses runs récents M+
 * @param {string} region - us, eu, kr, tw
 * @param {string} realm  - nom du serveur (ex: "hyjal")
 * @param {string} name   - nom du personnage
 */
async function getCharacterProfile(region, realm, name) {
  const fields = [
    'mythic_plus_recent_runs',
    'mythic_plus_scores_by_season:current',
    'mythic_plus_best_runs',
  ].join(',');

  const realmEncoded = encodeURIComponent(realm.toLowerCase());
  const nameEncoded = encodeURIComponent(name.toLowerCase());

  return apiGet(
    `/characters/profile?region=${region}&realm=${realmEncoded}&name=${nameEncoded}&fields=${fields}`
  );
}

/**
 * Récupère uniquement les runs récents M+ d'un personnage
 */
async function getRecentRuns(region, realm, name) {
  const profile = await getCharacterProfile(region, realm, name);
  return {
    character: profile,
    runs: profile.mythic_plus_recent_runs || [],
    score: profile.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0,
  };
}

/**
 * Formate la durée en mm:ss
 */
function formatDuration(ms) {
  if (!ms || isNaN(ms)) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
}

/**
 * Formate un run M+ en objet lisible
 */
function formatRun(run) {
  const timed = run.num_chests > 0;
  const upgradeStr = run.num_chests > 0 ? `+${run.num_chests}` : 'Dépassé';
  const duration = formatDuration(run.clear_time_ms);
  const par = formatDuration(run.par_time_ms);
  const rawDate = run.completed_at ? new Date(run.completed_at) : null;
  const date = rawDate && !isNaN(rawDate)
    ? rawDate.toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

  return {
    id: run.url,
    dungeon: run.dungeon || 'Donjon inconnu',
    level: run.mythic_level,
    timed,
    upgrade: upgradeStr,
    duration,
    par,
    score: run.score ?? 0,
    date,
    url: run.url,
    affixes: run.affixes?.map(a => a.name) || [],
  };
}

module.exports = { getCharacterProfile, getRecentRuns, formatRun };
