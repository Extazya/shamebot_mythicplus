const fs = require('fs');
const path = require('path');
const { playerKey } = require('./player');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../data/db.json');

const MAX_KNOWN_RUNS = 50;

/*
 * Schema v2:
 * {
 *   version: 2,
 *   guilds: { [guildId]: { channelId, players: [{ region, realm, name, profileUrl? }] } },
 *   runs:   { [playerKey]: [runId, ...] },   // shared by every guild tracking the player
 *   legacy: { channelId, players }           // v1 data waiting to be bound to a guild
 * }
 * A missing `runs[key]` means "never polled"; an empty array means "polled, no run yet".
 */

function emptyDB() {
  return { version: 2, guilds: {}, runs: {} };
}

function migrateV1(raw) {
  const db = emptyDB();
  const players = Array.isArray(raw.players) ? raw.players : [];
  for (const p of players) {
    // v1 keyed runs on the raw realm string typed by the user
    const oldKey = `${p.region}-${p.realm}-${p.name}`.toLowerCase();
    const ids = raw.lastRunIds?.[oldKey];
    if (Array.isArray(ids) && ids.length > 0) db.runs[playerKey(p)] = ids;
  }
  if (players.length > 0 || raw.channelId) {
    db.legacy = { channelId: raw.channelId ?? null, players };
  }
  return db;
}

function backupCorrupted() {
  const backup = `${DB_PATH}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(DB_PATH, backup);
    console.error(`⚠️  db.json corrompu, sauvegardé dans ${backup} puis réinitialisé`);
  } catch (e) {
    console.error('⚠️  db.json corrompu et impossible à sauvegarder :', e.message);
  }
}

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = emptyDB();
    saveDB(initial);
    return initial;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    backupCorrupted();
    const initial = emptyDB();
    saveDB(initial);
    return initial;
  }

  if (raw.version !== 2) {
    const migrated = migrateV1(raw);
    saveDB(migrated);
    return migrated;
  }
  raw.guilds ??= {};
  raw.runs ??= {};
  return raw;
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function guildOf(db, guildId) {
  db.guilds[guildId] ??= { channelId: null, players: [] };
  return db.guilds[guildId];
}

function isTrackedAnywhere(db, key) {
  return Object.values(db.guilds).some(g => g.players.some(p => playerKey(p) === key))
    || (db.legacy?.players ?? []).some(p => playerKey(p) === key);
}

// ─── Guild configuration ─────────────────────────────────────────────────────

function getPlayers(guildId) {
  return loadDB().guilds[guildId]?.players ?? [];
}

function addPlayer(guildId, player) {
  const db = loadDB();
  const guild = guildOf(db, guildId);
  const key = playerKey(player);
  if (guild.players.some(p => playerKey(p) === key)) return false;
  guild.players.push(player);
  saveDB(db);
  return true;
}

/**
 * Returns the removed player, or null if it was not tracked in this guild.
 */
function removePlayer(guildId, query) {
  const db = loadDB();
  const guild = db.guilds[guildId];
  if (!guild) return null;

  const key = playerKey(query);
  const removed = guild.players.find(p => playerKey(p) === key);
  if (!removed) return null;

  guild.players = guild.players.filter(p => p !== removed);
  if (!isTrackedAnywhere(db, key)) delete db.runs[key];
  saveDB(db);
  return removed;
}

function getChannel(guildId) {
  return loadDB().guilds[guildId]?.channelId ?? null;
}

function setChannel(guildId, channelId) {
  const db = loadDB();
  guildOf(db, guildId).channelId = channelId;
  saveDB(db);
}

function removeGuild(guildId) {
  const db = loadDB();
  const guild = db.guilds[guildId];
  if (!guild) return;
  delete db.guilds[guildId];
  for (const p of guild.players) {
    const key = playerKey(p);
    if (!isTrackedAnywhere(db, key)) delete db.runs[key];
  }
  saveDB(db);
}

/**
 * Every tracked character, deduplicated across guilds, with the announcement
 * channels interested in it.
 */
function getTrackedPlayers() {
  const db = loadDB();
  const byKey = new Map();
  for (const guild of Object.values(db.guilds)) {
    for (const player of guild.players) {
      const key = playerKey(player);
      if (!byKey.has(key)) byKey.set(key, { key, player, channelIds: new Set() });
      if (guild.channelId) byKey.get(key).channelIds.add(guild.channelId);
    }
  }
  return [...byKey.values()].map(t => ({ ...t, channelIds: [...t.channelIds] }));
}

// ─── Known runs ──────────────────────────────────────────────────────────────

/** null when the player has never been polled. */
function getKnownRunIds(key) {
  return loadDB().runs[key] ?? null;
}

function setKnownRunIds(key, ids) {
  const db = loadDB();
  db.runs[key] = ids.slice(0, MAX_KNOWN_RUNS);
  saveDB(db);
}

function initKnownRunIds(key, ids) {
  const db = loadDB();
  if (db.runs[key]) return false;
  db.runs[key] = ids.slice(0, MAX_KNOWN_RUNS);
  saveDB(db);
  return true;
}

// ─── v1 migration ────────────────────────────────────────────────────────────

function getLegacy() {
  return loadDB().legacy ?? null;
}

function claimLegacy(guildId) {
  const db = loadDB();
  if (!db.legacy) return;
  const guild = guildOf(db, guildId);
  if (!guild.channelId) guild.channelId = db.legacy.channelId;
  for (const p of db.legacy.players) {
    if (!guild.players.some(q => playerKey(q) === playerKey(p))) guild.players.push(p);
  }
  delete db.legacy;
  saveDB(db);
}

module.exports = {
  DB_PATH,
  MAX_KNOWN_RUNS,
  getPlayers,
  addPlayer,
  removePlayer,
  getChannel,
  setChannel,
  removeGuild,
  getTrackedPlayers,
  getKnownRunIds,
  setKnownRunIds,
  initKnownRunIds,
  getLegacy,
  claimLegacy,
};
