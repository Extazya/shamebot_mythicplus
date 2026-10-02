/**
 * Suite de tests du bot M+ Raider.io
 * Lancer avec : npm test
 */

'use strict';

const Module  = require('module');
const origRes = Module._resolveFilename;
Module._resolveFilename = function (req, ...args) {
  if (req === 'discord.js') return require.resolve('./mock-discord.js');
  return origRes.call(this, req, ...args);
};

const fs   = require('fs');
const os   = require('os');
const path = require('path');

// Isolated DB: never touch the real data/db.json of a running bot
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mplus-bot-tests-'));
process.env.DB_PATH = path.join(TMP_DIR, 'db.json');
const DB_PATH = process.env.DB_PATH;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error('Assertion échouée : ' + message);
}

async function test(name, fn) {
  try {
    await fn();
    console.log('  ✅ ' + name);
    passed++;
  } catch (err) {
    console.error('  ❌ ' + name);
    console.error('     ' + err.message);
    failed++;
  }
}

function suite(name) {
  console.log('\n📦 ' + name);
}

function resetDB() {
  for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f));
}

function fakeResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    text: async () => body,
  };
}

async function main() {
  const db = require('../src/db.js');
  const raiderio = require('../src/raiderio.js');
  const { formatRun, runId, isTimed, getCharacterProfile } = raiderio;
  const { realmSlug, playerKey, playerUrl } = require('../src/player.js');
  const { buildRunEmbed, buildProfileEmbed, buildPlayerListEmbed } = require('../src/embeds.js');
  const { acquireToken, getTokensRemaining } = require('../src/ratelimiter.js');
  const { checkAllPlayers } = require('../src/poller.js');

  function fmtDur(ms) {
    return formatRun({ url:'x', dungeon:'x', mythic_level:1, num_keystone_upgrades:1,
      clear_time_ms:ms, par_time_ms:60000, score:0,
      completed_at:'2026-01-01T00:00:00Z', affixes:[] }).duration;
  }

  const G1 = 'guild-1';
  const G2 = 'guild-2';
  const ARTHAS = { region:'eu', realm:'Hyjal', name:'Arthas' };
  const KASUME = { region:'eu', realm:'Tarren Mill', name:'Kasume', profileUrl:'https://raider.io/characters/eu/tarren-mill/Kasume' };

  // ── player.js ──────────────────────────────────────────────────────────────
  suite('player.js — Identité des personnages');

  await test('realmSlug normalise espaces, apostrophes, accents, parenthèses', () => {
    assert(realmSlug('Tarren Mill') === 'tarren-mill', realmSlug('Tarren Mill'));
    assert(realmSlug('tarren-mill') === 'tarren-mill', 'slug déjà normalisé');
    assert(realmSlug("Blade's Edge") === 'blades-edge', realmSlug("Blade's Edge"));
    assert(realmSlug('Chants éternels') === 'chants-eternels', realmSlug('Chants éternels'));
    assert(realmSlug('Aggra (Português)') === 'aggra-portugues', realmSlug('Aggra (Português)'));
    assert(realmSlug('Гордунни') === 'гордунни', 'cyrillique conservé');
  });
  await test('playerKey identique quelle que soit la saisie', () => {
    assert(playerKey(KASUME) === playerKey({ region:'EU', realm:'tarren-mill', name:'kasume' }), 'clés différentes');
  });
  await test('playerUrl : profileUrl prioritaire, sinon URL construite', () => {
    assert(playerUrl(KASUME) === KASUME.profileUrl, 'profileUrl');
    assert(playerUrl({ region:'eu', realm:"Blade's Edge", name:'Guldañ' })
      === 'https://raider.io/characters/eu/blades-edge/Gulda%C3%B1', playerUrl({ region:'eu', realm:"Blade's Edge", name:'Guldañ' }));
  });

  // ── db.js ──────────────────────────────────────────────────────────────────
  suite('db.js — Persistance par serveur');
  resetDB();

  await test('addPlayer true pour nouveau joueur', () => {
    assert(db.addPlayer(G1, ARTHAS) === true, 'premier add');
  });
  await test('addPlayer false pour doublon (casse et forme du serveur)', () => {
    assert(db.addPlayer(G1, { region:'EU', realm:'HYJAL', name:'ARTHAS' }) === false, 'doublon maj');
    db.addPlayer(G1, KASUME);
    assert(db.addPlayer(G1, { region:'eu', realm:'tarren-mill', name:'kasume' }) === false, 'doublon slug');
  });
  await test('Joueurs et canaux isolés par serveur', () => {
    assert(db.getPlayers(G1).length === 2, 'G1 : 2 joueurs');
    assert(db.getPlayers(G2).length === 0, 'G2 : vide');
    db.setChannel(G1, 'chan-1');
    db.setChannel(G2, 'chan-2');
    assert(db.getChannel(G1) === 'chan-1' && db.getChannel(G2) === 'chan-2', 'canaux');
    assert(db.getChannel('inconnu') === null, 'serveur inconnu → null');
  });
  await test('getKnownRunIds : null si jamais initialisé, [] si initialisé sans run', () => {
    assert(db.getKnownRunIds(playerKey(ARTHAS)) === null, 'null attendu');
    db.initKnownRunIds(playerKey(ARTHAS), []);
    const ids = db.getKnownRunIds(playerKey(ARTHAS));
    assert(Array.isArray(ids) && ids.length === 0, '[] attendu');
  });
  await test('initKnownRunIds n\'écrase pas un état existant', () => {
    db.setKnownRunIds(playerKey(ARTHAS), ['a']);
    assert(db.initKnownRunIds(playerKey(ARTHAS), ['b']) === false, 'doit refuser');
    assert(db.getKnownRunIds(playerKey(ARTHAS))[0] === 'a', 'état conservé');
  });
  await test('setKnownRunIds limite à 50 IDs', () => {
    db.setKnownRunIds(playerKey(ARTHAS), Array.from({ length: 80 }, (_, i) => 'u' + i));
    assert(db.getKnownRunIds(playerKey(ARTHAS)).length === 50, 'max 50');
  });
  await test('getTrackedPlayers dédoublonne et regroupe les canaux', () => {
    db.addPlayer(G2, { region:'eu', realm:'hyjal', name:'arthas' });
    const tracked = db.getTrackedPlayers();
    assert(tracked.length === 2, 'attendu 2, obtenu ' + tracked.length);
    const arthas = tracked.find(t => t.key === playerKey(ARTHAS));
    assert(arthas.channelIds.length === 2, 'deux canaux');
  });
  await test('removePlayer garde l\'état des runs tant qu\'un serveur suit le joueur', () => {
    const removed = db.removePlayer(G2, { region:'eu', realm:'Hyjal', name:'Arthas' });
    assert(removed && removed.name === 'arthas', 'joueur retiré renvoyé');
    assert(db.getKnownRunIds(playerKey(ARTHAS)) !== null, 'état conservé (suivi par G1)');
    assert(db.removePlayer(G2, ARTHAS) === null, 'second remove → null');
  });
  await test('removePlayer purge l\'état quand plus personne ne suit le joueur', () => {
    db.removePlayer(G1, ARTHAS);
    assert(db.getKnownRunIds(playerKey(ARTHAS)) === null, 'état purgé');
  });
  await test('removeGuild supprime la configuration du serveur', () => {
    db.initKnownRunIds(playerKey(KASUME), ['x']);
    db.removeGuild(G1);
    assert(db.getPlayers(G1).length === 0, 'joueurs supprimés');
    assert(db.getKnownRunIds(playerKey(KASUME)) === null, 'état purgé');
  });
  await test('Récupération après corruption JSON avec sauvegarde', () => {
    fs.writeFileSync(DB_PATH, '{CORROMPU}');
    const p = db.getPlayers(G1);
    assert(Array.isArray(p) && p.length === 0, 'DB réinitialisée vide');
    JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const backups = fs.readdirSync(TMP_DIR).filter(f => f.includes('.corrupt-'));
    assert(backups.length === 1, 'sauvegarde attendue');
    assert(fs.readFileSync(path.join(TMP_DIR, backups[0]), 'utf8') === '{CORROMPU}', 'contenu sauvegardé');
  });
  await test('Écriture atomique — .tmp ne reste pas', () => {
    db.addPlayer(G1, { region:'eu', realm:'Hyjal', name:'Atomic' });
    assert(!fs.existsSync(DB_PATH + '.tmp'), '.tmp ne doit pas rester');
  });
  await test('Migration v1 : données rattachées au serveur d\'origine', () => {
    resetDB();
    fs.writeFileSync(DB_PATH, JSON.stringify({
      players: [{ region:'eu', realm:'Tarren Mill', name:'Kasume' }, { region:'eu', realm:'Hyjal', name:'Arthas' }],
      channelId: 'old-chan',
      lastRunIds: { 'eu-tarren mill-kasume': ['url1', 'url2'] },
    }));
    const legacy = db.getLegacy();
    assert(legacy && legacy.channelId === 'old-chan' && legacy.players.length === 2, 'legacy');
    assert(db.getKnownRunIds(playerKey(KASUME)).length === 2, 'runs migrés vers la nouvelle clé');
    assert(db.getKnownRunIds(playerKey(ARTHAS)) === null, 'joueur sans runs → jamais initialisé');
    assert(db.getTrackedPlayers().length === 0, 'non suivi avant rattachement');
    db.claimLegacy(G1);
    assert(db.getLegacy() === null, 'legacy consommé');
    assert(db.getChannel(G1) === 'old-chan', 'canal migré');
    assert(db.getPlayers(G1).length === 2, 'joueurs migrés');
  });

  // ── raiderio.js ────────────────────────────────────────────────────────────
  suite('raiderio.js — Formatage des runs');

  const FULL_RUN = {
    url:'https://raider.io/mythic-plus-runs/season-mn-2/123-12-ara-kara', keystone_run_id:123,
    dungeon:'Ara-Kara, City of Echoes', mythic_level:12, num_keystone_upgrades:2,
    clear_time_ms:1545000, par_time_ms:1800000, score:187.3,
    completed_at:'2026-03-20T21:14:00.000Z', icon_url:'https://cdn/icon.jpg',
    affixes:[{name:'Fortified'},{name:'Tyrannical'}],
  };

  await test('Run dans les temps (num_keystone_upgrades)', () => {
    const r = formatRun(FULL_RUN);
    assert(r.timed    === true,                       'timed');
    assert(r.upgrade  === '+2',                       'upgrade: ' + r.upgrade);
    assert(r.level    === 12,                         'level');
    assert(r.dungeon  === 'Ara-Kara, City of Echoes', 'dungeon');
    assert(r.score    === 187.3,                      'score');
    assert(r.duration === '25m45s',                   'durée: ' + r.duration);
    assert(r.par      === '30m00s',                   'par: ' + r.par);
    assert(r.affixes.length === 2,                    'affixes');
    assert(r.url      === FULL_RUN.url,               'url');
    assert(r.iconUrl  === FULL_RUN.icon_url,          'icône');
  });
  await test('Run hors temps (num_keystone_upgrades=0)', () => {
    const r = formatRun({ ...FULL_RUN, num_keystone_upgrades:0, clear_time_ms:1900000 });
    assert(r.timed   === false,     'pas timed');
    assert(r.upgrade === 'Dépassé', 'label dépassé');
  });
  await test('Ancien champ num_chests toujours pris en charge', () => {
    const { num_keystone_upgrades, ...old } = FULL_RUN;
    assert(isTimed({ ...old, num_chests:1 }) === true,  'num_chests=1');
    assert(isTimed({ ...old, num_chests:0 }) === false, 'num_chests=0');
  });
  await test('Sans compteur d\'améliorations : comparaison au timer', () => {
    const { num_keystone_upgrades, ...bare } = FULL_RUN;
    assert(isTimed(bare) === true, 'sous le timer');
    assert(isTimed({ ...bare, clear_time_ms:1900000 }) === false, 'au-dessus du timer');
    const r = formatRun(bare);
    assert(r.timed && r.upgrade === '', 'pas de +N inventé');
  });
  await test('Date au format timestamp Discord', () => {
    const r = formatRun(FULL_RUN);
    const ts = Math.floor(Date.parse(FULL_RUN.completed_at) / 1000);
    assert(r.date === `<t:${ts}:f>`, 'date: ' + r.date);
  });
  await test('Champs null/undefined sans crash', () => {
    const r = formatRun({url:null,dungeon:null,mythic_level:undefined,
      num_keystone_upgrades:0,clear_time_ms:null,par_time_ms:undefined,
      score:null,completed_at:null,affixes:null});
    assert(r.score   === 0,               'score null→0 : ' + r.score);
    assert(r.duration === '—',            'duration null→—');
    assert(r.par      === '—',            'par null→—');
    assert(r.date     === '—',            'date null→—');
    assert(r.dungeon  === 'Donjon inconnu','dungeon null→fallback');
    assert(r.url      === null,           'url null');
    assert(Array.isArray(r.affixes) && r.affixes.length === 0, 'affixes null→[]');
  });
  await test('formatDuration cas limites', () => {
    assert(fmtDur(0)       === '—',      '0ms→— : ' + fmtDur(0));
    assert(fmtDur(null)    === '—',      'null→—');
    assert(fmtDur(60000)   === '1m00s',  '60s: ' + fmtDur(60000));
    assert(fmtDur(61000)   === '1m01s',  '61s: ' + fmtDur(61000));
    assert(fmtDur(3661000) === '61m01s', '3661s: ' + fmtDur(3661000));
  });
  await test('runId : URL, puis keystone_run_id, puis clé composite', () => {
    assert(runId(FULL_RUN) === FULL_RUN.url, 'url');
    assert(runId({ ...FULL_RUN, url:null }) === 'run-123', 'keystone_run_id');
    const a = runId({ dungeon:'X', mythic_level:10, completed_at:'2026-01-01T00:00:00Z' });
    const b = runId({ dungeon:'X', mythic_level:10, completed_at:'2026-01-02T00:00:00Z' });
    assert(a !== b, 'deux runs sans url ne doivent pas se confondre');
  });

  suite('raiderio.js — Client HTTP');
  const realFetch = global.fetch;

  await test('429 : nouvel essai après Retry-After, en repassant par le rate limiter', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return calls === 1
        ? fakeResponse(429, '', { 'retry-after':'0' })
        : fakeResponse(200, JSON.stringify({ name:'Arthas' }));
    };
    const before = getTokensRemaining();
    const res = await getCharacterProfile('eu', 'Hyjal', 'Arthas');
    assert(res.name === 'Arthas', 'réponse');
    assert(calls === 2, 'attendu 2 appels, obtenu ' + calls);
    assert(before - getTokensRemaining() === 2, 'deux tokens consommés');
  });
  await test('400 : erreur avec statut et message Raider.io', async () => {
    global.fetch = async () => fakeResponse(400, JSON.stringify({ message:'Could not find requested character' }));
    try {
      await getCharacterProfile('eu', 'Hyjal', 'Personne');
      throw new Error('aurait dû échouer');
    } catch (err) {
      assert(err.status === 400, 'status: ' + err.status);
      assert(err.message.includes('Could not find'), err.message);
    }
  });
  await test('502 HTML : erreur HTTP explicite (pas "réponse invalide")', async () => {
    global.fetch = async () => fakeResponse(502, '<html>Bad Gateway</html>');
    try {
      await getCharacterProfile('eu', 'Hyjal', 'Arthas');
      throw new Error('aurait dû échouer');
    } catch (err) {
      assert(err.status === 502 && err.message === 'HTTP 502', err.message);
    }
  });
  await test('Le serveur est transmis tel quel (nom avec espaces accepté par l\'API)', async () => {
    let url;
    global.fetch = async (u) => { url = new URL(u); return fakeResponse(200, '{}'); };
    await getCharacterProfile('eu', 'Tarren Mill', 'Kasume');
    assert(url.searchParams.get('realm') === 'Tarren Mill', 'realm: ' + url.searchParams.get('realm'));
  });
  global.fetch = realFetch;

  // ── embeds.js ──────────────────────────────────────────────────────────────
  suite('embeds.js — Builders Discord');

  const RUN_OK   = formatRun(FULL_RUN);
  const RUN_NULL = formatRun({url:null,dungeon:null,mythic_level:undefined,
    num_keystone_upgrades:0,clear_time_ms:null,par_time_ms:undefined,
    score:null,completed_at:null,affixes:null});

  await test('buildRunEmbed run valide', () => {
    const e = buildRunEmbed(KASUME, RUN_OK);
    assert(e._data.color === 0x57f287, 'couleur verte');
    assert(e._data.fields.length >= 6, 'au moins 6 champs');
    assert(e._data.url === FULL_RUN.url, 'URL présente');
    assert(e._data.author.url === KASUME.profileUrl, 'lien profil');
    assert(e._data.thumbnail === FULL_RUN.icon_url, 'icône du donjon');
    e.validate();
  });
  await test('buildRunEmbed url/icône null ne plante pas', () => {
    const e = buildRunEmbed(ARTHAS, RUN_NULL);
    e.validate();
  });
  await test('buildRunEmbed level undefined affiche "?"', () => {
    const e = buildRunEmbed(ARTHAS, RUN_NULL);
    assert(e._data.title.includes('?'), 'title: ' + e._data.title);
  });
  await test('buildRunEmbed hors temps = rouge', () => {
    const e = buildRunEmbed(ARTHAS, formatRun({ ...FULL_RUN, num_keystone_upgrades:0 }));
    assert(e._data.color === 0xed4245, 'rouge');
  });
  await test('buildRunEmbed dans les temps sans compteur : pas de "()"', () => {
    const { num_keystone_upgrades, ...bare } = FULL_RUN;
    const e = buildRunEmbed(ARTHAS, formatRun(bare));
    const result = e._data.fields.find(f => f.name.includes('Résultat')).value;
    assert(result === '**DANS LES TEMPS**', result);
  });
  await test('buildProfileEmbed thumbnail null ne plante pas', () => {
    const char = {name:'Arthas',realm:'Hyjal',class:'Death Knight',
      active_spec_name:'Unholy',thumbnail_url:null,
      mythic_plus_scores_by_season:[{scores:{all:2800}}]};
    const e = buildProfileEmbed(ARTHAS, char, [RUN_OK]);
    e.validate();
  });
  await test('buildProfileEmbed character entièrement undefined', () => {
    const c = {name:undefined,realm:undefined,class:undefined,
      active_spec_name:undefined,thumbnail_url:undefined,
      mythic_plus_scores_by_season:null};
    const e = buildProfileEmbed(ARTHAS, c, []);
    e.validate();
    assert(e._data.title.includes(ARTHAS.name), 'fallback player.name');
  });
  await test('buildPlayerListEmbed liste vide', () => {
    const e = buildPlayerListEmbed([]);
    assert(e._data.description && e._data.description.includes('/add'), 'message /add');
  });
  await test('buildPlayerListEmbed 80 joueurs ≤ 4096 chars', () => {
    const many = Array.from({length:80},()=>({name:'A'.repeat(20),realm:'B'.repeat(20),region:'eu'}));
    const e = buildPlayerListEmbed(many);
    assert(e._data.description.length <= 4096, 'trop long: ' + e._data.description.length);
    assert(e._data.description.includes('autre'), 'mention non affichés');
  });

  // ── ratelimiter.js ─────────────────────────────────────────────────────────
  suite('ratelimiter.js — Token bucket');

  await test('Tokens disponibles', () => {
    assert(getTokensRemaining() > 0, 'got ' + getTokensRemaining());
  });
  await test('acquireToken consomme un token', async () => {
    const before = getTokensRemaining();
    await acquireToken();
    const after = getTokensRemaining();
    assert(after < before, before + ' → ' + after);
  });

  // ── commandes ──────────────────────────────────────────────────────────────
  suite('commands — Chargement');

  await test('Chaque commande expose data.name et execute()', () => {
    const dir = path.join(__dirname, '../src/commands');
    const names = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => {
      const cmd = require(path.join(dir, f));
      assert(typeof cmd.execute === 'function', f + ' : execute manquant');
      return cmd.data.name;
    });
    for (const n of ['add', 'remove', 'list', 'check', 'setchannel', 'forcepoll']) {
      assert(names.includes(n), '/' + n + ' manquante');
    }
  });

  // ── poller.js ──────────────────────────────────────────────────────────────
  suite('poller.js — Détection et annonce des nouvelles runs');

  const realGetRecentRuns = raiderio.getRecentRuns;
  let apiRuns = {};
  let apiCalls = 0;
  raiderio.getRecentRuns = async (region, realm, name) => {
    apiCalls++;
    const runs = apiRuns[playerKey({ region, realm, name })];
    if (runs instanceof Error) throw runs;
    return { character: {}, runs: runs ?? [], score: 0 };
  };

  function makeClient(opts = {}) {
    const channels = {};
    const client = {
      channels: {
        fetch: async (id) => {
          if (opts.missing?.includes(id)) throw new Error('Unknown Channel');
          channels[id] ??= {
            id,
            sent: [],
            send: async (payload) => {
              if (opts.failing?.includes(id)) throw new Error('Missing Permissions');
              payload.embeds.forEach(e => e.validate());
              channels[id].sent.push(payload);
            },
          };
          return channels[id];
        },
      },
    };
    return { client, channels };
  }

  function run(n, completedAt) {
    return { url:'run-' + n, dungeon:'Donjon ' + n, mythic_level:10, num_keystone_upgrades:1,
      clear_time_ms:1500000, par_time_ms:1800000, score:200, completed_at:completedAt, affixes:[] };
  }
  const poll = (client) => checkAllPlayers(client, { delayMs: 0 });
  const titles = (ch) => ch.sent.map(p => p.embeds[0]._data.title);

  await test('Joueur jamais interrogé : initialise sans annoncer', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.addPlayer(G1, ARTHAS);
    apiRuns = { [playerKey(ARTHAS)]: [run(2, '2026-01-02T00:00:00Z'), run(1, '2026-01-01T00:00:00Z')] };
    const { client, channels } = makeClient();
    const res = await poll(client);
    assert(res.announced === 0, 'aucune annonce');
    assert(!channels['chan-1'] || channels['chan-1'].sent.length === 0, 'rien envoyé');
    assert(db.getKnownRunIds(playerKey(ARTHAS)).length === 2, 'état initialisé');
  });
  await test('Nouvelles runs annoncées, de la plus ancienne à la plus récente', async () => {
    apiRuns[playerKey(ARTHAS)] = [
      run(4, '2026-01-04T00:00:00Z'), run(3, '2026-01-03T00:00:00Z'),
      run(2, '2026-01-02T00:00:00Z'), run(1, '2026-01-01T00:00:00Z'),
    ];
    const { client, channels } = makeClient();
    const res = await poll(client);
    assert(res.announced === 2, 'attendu 2, obtenu ' + res.announced);
    const t = titles(channels['chan-1']);
    assert(t[0].includes('Donjon 3') && t[1].includes('Donjon 4'), 'ordre : ' + t.join(' / '));
  });
  await test('Poll suivant : aucune nouvelle run', async () => {
    const { client } = makeClient();
    const res = await poll(client);
    assert(res.announced === 0, 'attendu 0, obtenu ' + res.announced);
  });
  await test('Première run d\'un joueur ajouté sans historique : annoncée', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.addPlayer(G1, KASUME);
    db.initKnownRunIds(playerKey(KASUME), []); // what /add does for a player with no run
    apiRuns = { [playerKey(KASUME)]: [run(1, '2026-01-01T00:00:00Z')] };
    const { client, channels } = makeClient();
    const res = await poll(client);
    assert(res.announced === 1, 'attendu 1, obtenu ' + res.announced);
    assert(channels['chan-1'].sent.length === 1, 'un message envoyé');
  });
  await test('Joueur suivi par deux serveurs : un seul appel API, annonce dans les deux canaux', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.setChannel(G2, 'chan-2');
    db.addPlayer(G1, ARTHAS);
    db.addPlayer(G2, { region:'eu', realm:'hyjal', name:'arthas' });
    db.initKnownRunIds(playerKey(ARTHAS), []);
    apiRuns = { [playerKey(ARTHAS)]: [run(1, '2026-01-01T00:00:00Z')] };
    apiCalls = 0;
    const { client, channels } = makeClient();
    await poll(client);
    assert(apiCalls === 1, 'attendu 1 appel, obtenu ' + apiCalls);
    assert(channels['chan-1'].sent.length === 1 && channels['chan-2'].sent.length === 1, 'deux annonces');
  });
  await test('Échec d\'envoi dans un canal : l\'autre reçoit, runs marquées vues', async () => {
    apiRuns[playerKey(ARTHAS)] = [run(2, '2026-01-02T00:00:00Z'), run(1, '2026-01-01T00:00:00Z')];
    const { client, channels } = makeClient({ failing: ['chan-1'] });
    await poll(client);
    assert(channels['chan-2'].sent.length === 1, 'chan-2 a reçu l\'annonce');
    const again = await poll(makeClient().client);
    assert(again.announced === 0, 'pas de ré-annonce');
  });
  await test('Canal supprimé : pas de crash', async () => {
    apiRuns[playerKey(ARTHAS)].unshift(run(3, '2026-01-03T00:00:00Z'));
    const { client, channels } = makeClient({ missing: ['chan-1'] });
    const res = await poll(client);
    assert(res.errors === 0, 'aucune erreur joueur');
    assert(channels['chan-2'].sent.length === 1, 'chan-2 a reçu l\'annonce');
  });
  await test('Erreur API sur un joueur : les autres sont quand même traités', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.addPlayer(G1, ARTHAS);
    db.addPlayer(G1, KASUME);
    db.initKnownRunIds(playerKey(ARTHAS), []);
    db.initKnownRunIds(playerKey(KASUME), []);
    apiRuns = {
      [playerKey(ARTHAS)]: new Error('Timeout Raider.io (10s)'),
      [playerKey(KASUME)]: [run(1, '2026-01-01T00:00:00Z')],
    };
    const { client } = makeClient();
    const res = await poll(client);
    assert(res.errors === 1, 'une erreur');
    assert(res.announced === 1, 'Kasume annoncé');
    assert(db.getKnownRunIds(playerKey(ARTHAS)).length === 0, 'Arthas inchangé');
  });
  await test('Poll concurrent : le second est ignoré', async () => {
    const { client } = makeClient();
    const [a, b] = await Promise.all([poll(client), poll(client)]);
    assert(!a.skipped && b.skipped === true, 'second skipped');
  });
  await test('IDs connus fusionnés (une run qui disparaît de l\'API n\'est pas re-annoncée)', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.addPlayer(G1, ARTHAS);
    db.initKnownRunIds(playerKey(ARTHAS), ['run-1', 'run-2']);
    apiRuns = { [playerKey(ARTHAS)]: [run(3, '2026-01-03T00:00:00Z'), run(2, '2026-01-02T00:00:00Z')] };
    await poll(makeClient().client);
    const ids = db.getKnownRunIds(playerKey(ARTHAS));
    assert(ids.includes('run-1') && ids.includes('run-3'), 'ids : ' + ids.join(','));
    apiRuns[playerKey(ARTHAS)].push(run(1, '2026-01-01T00:00:00Z'));
    const res = await poll(makeClient().client);
    assert(res.announced === 0, 'run-1 revenue ne doit pas être annoncée');
  });

  raiderio.getRecentRuns = realGetRecentRuns;

  // ── Résultat ───────────────────────────────────────────────────────────────
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log('\n' + '─'.repeat(44));
  console.log('  Total   : ' + (passed + failed) + ' tests');
  console.log('  ✅ Passés : ' + passed);
  if (failed > 0) {
    console.log('  ❌ Échoués : ' + failed);
    process.exit(1);
  } else {
    console.log('\n  ✅ Tous les tests passent.\n');
  }
}

main().catch(err => {
  console.error('💥 Erreur fatale :', err);
  process.exit(1);
});
