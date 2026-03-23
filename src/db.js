const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/db.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { players: [], channelId: null, lastRunIds: {} };
    saveDB(initial);
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getPlayers() {
  return loadDB().players;
}

function addPlayer(region, realm, name) {
  const db = loadDB();
  const key = `${region}-${realm}-${name}`.toLowerCase();
  const exists = db.players.some(p =>
    `${p.region}-${p.realm}-${p.name}`.toLowerCase() === key
  );
  if (exists) return false;
  db.players.push({ region, realm, name });
  saveDB(db);
  return true;
}

function removePlayer(region, realm, name) {
  const db = loadDB();
  const key = `${region}-${realm}-${name}`.toLowerCase();
  const before = db.players.length;
  db.players = db.players.filter(p =>
    `${p.region}-${p.realm}-${p.name}`.toLowerCase() !== key
  );
  if (db.players.length === before) return false;
  saveDB(db);
  return true;
}

function getChannel() {
  return loadDB().channelId;
}

function setChannel(channelId) {
  const db = loadDB();
  db.channelId = channelId;
  saveDB(db);
}

function getLastRunIds(playerKey) {
  return loadDB().lastRunIds[playerKey] || [];
}

function setLastRunIds(playerKey, ids) {
  const db = loadDB();
  if (!db.lastRunIds) db.lastRunIds = {};
  db.lastRunIds[playerKey] = ids;
  saveDB(db);
}

module.exports = {
  getPlayers,
  addPlayer,
  removePlayer,
  getChannel,
  setChannel,
  getLastRunIds,
  setLastRunIds,
};
