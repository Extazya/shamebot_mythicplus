const { acquireToken } = require('./ratelimiter');

const BASE_URL = 'https://raider.io/api/v1';
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const DEFAULT_RETRY_AFTER_S = 5;

class RaiderIOError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'RaiderIOError';
    this.status = status;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelayMs(res) {
  const header = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
  return (Number.isNaN(header) ? DEFAULT_RETRY_AFTER_S : header) * 1000;
}

async function apiGet(urlPath) {
  for (let attempt = 0; ; attempt++) {
    // Retries consume a token too, so a 429 storm cannot bypass the limiter
    await acquireToken();

    let res;
    try {
      res = await fetch(`${BASE_URL}${urlPath}`, {
        headers: { 'User-Agent': 'WoW-MPlus-Discord-Bot/2.0' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err.name === 'TimeoutError') throw new RaiderIOError(`Raider.io timeout (${TIMEOUT_MS / 1000}s)`);
      throw new RaiderIOError(`Raider.io unreachable: ${err.message}`);
    }

    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const delay = retryDelayMs(res);
      console.warn(`⚠️  Raider.io HTTP ${res.status}, retrying in ${delay / 1000}s...`);
      await sleep(delay);
      continue;
    }

    const body = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      // Error pages (502, Cloudflare...) are HTML, only the status matters then
    }

    if (!res.ok) {
      if (res.status === 429) throw new RaiderIOError('Raider.io rate limit reached, try again in a moment', 429);
      throw new RaiderIOError(parsed?.message || `HTTP ${res.status}`, res.status);
    }
    if (parsed === null) throw new RaiderIOError('Invalid response from Raider.io', res.status);
    return parsed;
  }
}

/**
 * Raider.io accepts the realm display name as well as its slug.
 */
async function getCharacterProfile(region, realm, name) {
  const params = new URLSearchParams({
    region,
    realm,
    name,
    fields: 'mythic_plus_recent_runs,mythic_plus_scores_by_season:current',
  });
  return apiGet(`/characters/profile?${params}`);
}

async function getRecentRuns(region, realm, name) {
  const profile = await getCharacterProfile(region, realm, name);
  return {
    character: profile,
    runs: profile.mythic_plus_recent_runs || [],
    score: profile.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0,
  };
}

/**
 * Stable identifier of a run. The URL is kept first so ids stored by v1 stay valid.
 */
function runId(run) {
  if (run.url) return run.url;
  if (run.keystone_run_id) return `run-${run.keystone_run_id}`;
  return `${run.dungeon}|${run.mythic_level}|${run.completed_at}`;
}

function keystoneUpgrades(run) {
  // The API replaced num_chests with num_keystone_upgrades, accept both
  const upgrades = run.num_keystone_upgrades ?? run.num_chests;
  return typeof upgrades === 'number' ? upgrades : null;
}

function isTimed(run) {
  const upgrades = keystoneUpgrades(run);
  if (upgrades !== null) return upgrades > 0;
  if (run.clear_time_ms && run.par_time_ms) return run.clear_time_ms <= run.par_time_ms;
  return false;
}

function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return 'N/A';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
}

function formatDate(isoDate) {
  const date = isoDate ? new Date(isoDate) : null;
  if (!date || Number.isNaN(date.getTime())) return 'N/A';
  // Discord timestamp markup: rendered in each reader's own timezone
  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function formatRun(run) {
  const timed = isTimed(run);
  const upgrades = keystoneUpgrades(run);

  return {
    id: runId(run),
    dungeon: run.dungeon || 'Unknown dungeon',
    level: run.mythic_level,
    timed,
    upgrade: timed ? (upgrades ? `+${upgrades}` : '') : 'Depleted',
    duration: formatDuration(run.clear_time_ms),
    par: formatDuration(run.par_time_ms),
    score: run.score ?? 0,
    date: formatDate(run.completed_at),
    completedAt: run.completed_at ?? null,
    url: run.url ?? null,
    iconUrl: run.icon_url ?? null,
    affixes: run.affixes?.map(a => a.name).filter(Boolean) || [],
  };
}

module.exports = {
  RaiderIOError,
  getCharacterProfile,
  getRecentRuns,
  runId,
  isTimed,
  formatRun,
};
