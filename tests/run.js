/**
 * M+ Raider.io bot test suite
 * Run with: npm test
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

// Isolated DB, never touch the real data/db.json of a running bot
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mplus-bot-tests-'));
process.env.DB_PATH = path.join(TMP_DIR, 'db.json');
const DB_PATH = process.env.DB_PATH;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error('Assertion failed: ' + message);
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
  suite('player.js: character identity');

  await test('realmSlug normalizes spaces, apostrophes, accents and parentheses', () => {
    assert(realmSlug('Tarren Mill') === 'tarren-mill', realmSlug('Tarren Mill'));
    assert(realmSlug('tarren-mill') === 'tarren-mill', 'already a slug');
    assert(realmSlug("Blade's Edge") === 'blades-edge', realmSlug("Blade's Edge"));
    assert(realmSlug('Chants éternels') === 'chants-eternels', realmSlug('Chants éternels'));
    assert(realmSlug('Aggra (Português)') === 'aggra-portugues', realmSlug('Aggra (Português)'));
    assert(realmSlug('Гордунни') === 'гордунни', 'cyrillic kept');
  });
  await test('playerKey is the same whatever the input spelling', () => {
    assert(playerKey(KASUME) === playerKey({ region:'EU', realm:'tarren-mill', name:'kasume' }), 'keys differ');
  });
  await test('playerUrl prefers profileUrl, otherwise builds the URL', () => {
    assert(playerUrl(KASUME) === KASUME.profileUrl, 'profileUrl');
    const built = playerUrl({ region:'eu', realm:"Blade's Edge", name:'Guldañ' });
    assert(built === 'https://raider.io/characters/eu/blades-edge/Gulda%C3%B1', built);
  });

  // ── db.js ──────────────────────────────────────────────────────────────────
  suite('db.js: per-guild storage');
  resetDB();

  await test('addPlayer returns true for a new player', () => {
    assert(db.addPlayer(G1, ARTHAS) === true, 'first add');
  });
  await test('addPlayer returns false for a duplicate (case and realm spelling)', () => {
    assert(db.addPlayer(G1, { region:'EU', realm:'HYJAL', name:'ARTHAS' }) === false, 'uppercase duplicate');
    db.addPlayer(G1, KASUME);
    assert(db.addPlayer(G1, { region:'eu', realm:'tarren-mill', name:'kasume' }) === false, 'slug duplicate');
  });
  await test('Players and channels are isolated per guild', () => {
    assert(db.getPlayers(G1).length === 2, 'G1 has 2 players');
    assert(db.getPlayers(G2).length === 0, 'G2 is empty');
    db.setChannel(G1, 'chan-1');
    db.setChannel(G2, 'chan-2');
    assert(db.getChannel(G1) === 'chan-1' && db.getChannel(G2) === 'chan-2', 'channels');
    assert(db.getChannel('unknown') === null, 'unknown guild gives null');
  });
  await test('getKnownRunIds is null when never initialized, [] when initialized without run', () => {
    assert(db.getKnownRunIds(playerKey(ARTHAS)) === null, 'null expected');
    db.initKnownRunIds(playerKey(ARTHAS), []);
    const ids = db.getKnownRunIds(playerKey(ARTHAS));
    assert(Array.isArray(ids) && ids.length === 0, '[] expected');
  });
  await test('initKnownRunIds does not overwrite an existing state', () => {
    db.setKnownRunIds(playerKey(ARTHAS), ['a']);
    assert(db.initKnownRunIds(playerKey(ARTHAS), ['b']) === false, 'must refuse');
    assert(db.getKnownRunIds(playerKey(ARTHAS))[0] === 'a', 'state kept');
  });
  await test('setKnownRunIds keeps at most 50 ids', () => {
    db.setKnownRunIds(playerKey(ARTHAS), Array.from({ length: 80 }, (_, i) => 'u' + i));
    assert(db.getKnownRunIds(playerKey(ARTHAS)).length === 50, 'max 50');
  });
  await test('getTrackedPlayers deduplicates players and groups channels', () => {
    db.addPlayer(G2, { region:'eu', realm:'hyjal', name:'arthas' });
    const tracked = db.getTrackedPlayers();
    assert(tracked.length === 2, 'expected 2, got ' + tracked.length);
    const arthas = tracked.find(t => t.key === playerKey(ARTHAS));
    assert(arthas.channelIds.length === 2, 'two channels');
  });
  await test('removePlayer keeps run state while another guild tracks the player', () => {
    const removed = db.removePlayer(G2, { region:'eu', realm:'Hyjal', name:'Arthas' });
    assert(removed && removed.name === 'arthas', 'removed player returned');
    assert(db.getKnownRunIds(playerKey(ARTHAS)) !== null, 'state kept, G1 still tracks it');
    assert(db.removePlayer(G2, ARTHAS) === null, 'second remove gives null');
  });
  await test('removePlayer drops run state once nobody tracks the player', () => {
    db.removePlayer(G1, ARTHAS);
    assert(db.getKnownRunIds(playerKey(ARTHAS)) === null, 'state dropped');
  });
  await test('removeGuild deletes the guild configuration', () => {
    db.initKnownRunIds(playerKey(KASUME), ['x']);
    db.removeGuild(G1);
    assert(db.getPlayers(G1).length === 0, 'players deleted');
    assert(db.getKnownRunIds(playerKey(KASUME)) === null, 'state dropped');
  });
  await test('Corrupted JSON is backed up and reset', () => {
    fs.writeFileSync(DB_PATH, '{CORRUPTED}');
    const p = db.getPlayers(G1);
    assert(Array.isArray(p) && p.length === 0, 'empty DB after reset');
    JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const backups = fs.readdirSync(TMP_DIR).filter(f => f.includes('.corrupt-'));
    assert(backups.length === 1, 'backup expected');
    assert(fs.readFileSync(path.join(TMP_DIR, backups[0]), 'utf8') === '{CORRUPTED}', 'backup content');
  });
  await test('Atomic write leaves no .tmp file', () => {
    db.addPlayer(G1, { region:'eu', realm:'Hyjal', name:'Atomic' });
    assert(!fs.existsSync(DB_PATH + '.tmp'), '.tmp must not remain');
  });
  await test('v1 migration binds data to the original guild', () => {
    resetDB();
    fs.writeFileSync(DB_PATH, JSON.stringify({
      players: [{ region:'eu', realm:'Tarren Mill', name:'Kasume' }, { region:'eu', realm:'Hyjal', name:'Arthas' }],
      channelId: 'old-chan',
      lastRunIds: { 'eu-tarren mill-kasume': ['url1', 'url2'] },
    }));
    const legacy = db.getLegacy();
    assert(legacy && legacy.channelId === 'old-chan' && legacy.players.length === 2, 'legacy');
    assert(db.getKnownRunIds(playerKey(KASUME)).length === 2, 'runs moved to the new key');
    assert(db.getKnownRunIds(playerKey(ARTHAS)) === null, 'player without runs stays never polled');
    assert(db.getTrackedPlayers().length === 0, 'not tracked before being claimed');
    db.claimLegacy(G1);
    assert(db.getLegacy() === null, 'legacy consumed');
    assert(db.getChannel(G1) === 'old-chan', 'channel migrated');
    assert(db.getPlayers(G1).length === 2, 'players migrated');
  });

  // ── raiderio.js ────────────────────────────────────────────────────────────
  suite('raiderio.js: run formatting');

  const FULL_RUN = {
    url:'https://raider.io/mythic-plus-runs/season-mn-2/123-12-ara-kara', keystone_run_id:123,
    dungeon:'Ara-Kara, City of Echoes', mythic_level:12, num_keystone_upgrades:2,
    clear_time_ms:1545000, par_time_ms:1800000, score:187.3,
    completed_at:'2026-03-20T21:14:00.000Z', icon_url:'https://cdn/icon.jpg',
    affixes:[{name:'Fortified'},{name:'Tyrannical'}],
  };

  await test('Timed run (num_keystone_upgrades)', () => {
    const r = formatRun(FULL_RUN);
    assert(r.timed    === true,                       'timed');
    assert(r.upgrade  === '+2',                       'upgrade: ' + r.upgrade);
    assert(r.level    === 12,                         'level');
    assert(r.dungeon  === 'Ara-Kara, City of Echoes', 'dungeon');
    assert(r.score    === 187.3,                      'score');
    assert(r.duration === '25m45s',                   'duration: ' + r.duration);
    assert(r.par      === '30m00s',                   'par: ' + r.par);
    assert(r.affixes.length === 2,                    'affixes');
    assert(r.url      === FULL_RUN.url,               'url');
    assert(r.iconUrl  === FULL_RUN.icon_url,          'icon');
  });
  await test('Depleted run (num_keystone_upgrades=0)', () => {
    const r = formatRun({ ...FULL_RUN, num_keystone_upgrades:0, clear_time_ms:1900000 });
    assert(r.timed   === false,      'not timed');
    assert(r.upgrade === 'Depleted', 'depleted label');
  });
  await test('Legacy num_chests field still supported', () => {
    const { num_keystone_upgrades, ...old } = FULL_RUN;
    assert(isTimed({ ...old, num_chests:1 }) === true,  'num_chests=1');
    assert(isTimed({ ...old, num_chests:0 }) === false, 'num_chests=0');
  });
  await test('Without upgrade count, compare against the timer', () => {
    const { num_keystone_upgrades, ...bare } = FULL_RUN;
    assert(isTimed(bare) === true, 'under the timer');
    assert(isTimed({ ...bare, clear_time_ms:1900000 }) === false, 'over the timer');
    const r = formatRun(bare);
    assert(r.timed && r.upgrade === '', 'no made-up +N');
  });
  await test('Date uses Discord timestamp markup', () => {
    const r = formatRun(FULL_RUN);
    const ts = Math.floor(Date.parse(FULL_RUN.completed_at) / 1000);
    assert(r.date === `<t:${ts}:f>`, 'date: ' + r.date);
  });
  await test('Null/undefined fields do not crash', () => {
    const r = formatRun({url:null,dungeon:null,mythic_level:undefined,
      num_keystone_upgrades:0,clear_time_ms:null,par_time_ms:undefined,
      score:null,completed_at:null,affixes:null});
    assert(r.score    === 0,                 'score null gives 0: ' + r.score);
    assert(r.duration === 'N/A',             'duration null gives N/A');
    assert(r.par      === 'N/A',             'par null gives N/A');
    assert(r.date     === 'N/A',             'date null gives N/A');
    assert(r.dungeon  === 'Unknown dungeon', 'dungeon fallback');
    assert(r.url      === null,              'url null');
    assert(Array.isArray(r.affixes) && r.affixes.length === 0, 'affixes null gives []');
  });
  await test('formatDuration edge cases', () => {
    assert(fmtDur(0)       === 'N/A',    '0ms: ' + fmtDur(0));
    assert(fmtDur(null)    === 'N/A',    'null');
    assert(fmtDur(60000)   === '1m00s',  '60s: ' + fmtDur(60000));
    assert(fmtDur(61000)   === '1m01s',  '61s: ' + fmtDur(61000));
    assert(fmtDur(3661000) === '61m01s', '3661s: ' + fmtDur(3661000));
  });
  await test('runId: URL, then keystone_run_id, then composite key', () => {
    assert(runId(FULL_RUN) === FULL_RUN.url, 'url');
    assert(runId({ ...FULL_RUN, url:null }) === 'run-123', 'keystone_run_id');
    const a = runId({ dungeon:'X', mythic_level:10, completed_at:'2026-01-01T00:00:00Z' });
    const b = runId({ dungeon:'X', mythic_level:10, completed_at:'2026-01-02T00:00:00Z' });
    assert(a !== b, 'two runs without url must not collide');
  });

  suite('raiderio.js: HTTP client');
  const realFetch = global.fetch;

  await test('429 is retried after Retry-After and goes through the rate limiter again', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return calls === 1
        ? fakeResponse(429, '', { 'retry-after':'0' })
        : fakeResponse(200, JSON.stringify({ name:'Arthas' }));
    };
    const before = getTokensRemaining();
    const res = await getCharacterProfile('eu', 'Hyjal', 'Arthas');
    assert(res.name === 'Arthas', 'response');
    assert(calls === 2, 'expected 2 calls, got ' + calls);
    assert(before - getTokensRemaining() === 2, 'two tokens used');
  });
  await test('400 gives an error with status and Raider.io message', async () => {
    global.fetch = async () => fakeResponse(400, JSON.stringify({ message:'Could not find requested character' }));
    try {
      await getCharacterProfile('eu', 'Hyjal', 'Nobody');
      throw new Error('should have failed');
    } catch (err) {
      assert(err.status === 400, 'status: ' + err.status);
      assert(err.message.includes('Could not find'), err.message);
    }
  });
  await test('HTML 502 gives an explicit HTTP error, not "invalid response"', async () => {
    global.fetch = async () => fakeResponse(502, '<html>Bad Gateway</html>');
    try {
      await getCharacterProfile('eu', 'Hyjal', 'Arthas');
      throw new Error('should have failed');
    } catch (err) {
      assert(err.status === 502 && err.message === 'HTTP 502', err.message);
    }
  });
  await test('Realm is sent as is, the API accepts names with spaces', async () => {
    let url;
    global.fetch = async (u) => { url = new URL(u); return fakeResponse(200, '{}'); };
    await getCharacterProfile('eu', 'Tarren Mill', 'Kasume');
    assert(url.searchParams.get('realm') === 'Tarren Mill', 'realm: ' + url.searchParams.get('realm'));
  });
  global.fetch = realFetch;

  // ── embeds.js ──────────────────────────────────────────────────────────────
  suite('embeds.js: Discord builders');

  const RUN_OK   = formatRun(FULL_RUN);
  const RUN_NULL = formatRun({url:null,dungeon:null,mythic_level:undefined,
    num_keystone_upgrades:0,clear_time_ms:null,par_time_ms:undefined,
    score:null,completed_at:null,affixes:null});

  await test('buildRunEmbed with a valid run', () => {
    const e = buildRunEmbed(KASUME, RUN_OK);
    assert(e._data.color === 0x57f287, 'green');
    assert(e._data.fields.length >= 6, 'at least 6 fields');
    assert(e._data.url === FULL_RUN.url, 'URL set');
    assert(e._data.author.url === KASUME.profileUrl, 'profile link');
    assert(e._data.author.name === 'Kasume-Tarren Mill (EU)', 'author: ' + e._data.author.name);
    assert(e._data.thumbnail === FULL_RUN.icon_url, 'dungeon icon');
    e.validate();
  });
  await test('buildRunEmbed with null url/icon does not crash', () => {
    buildRunEmbed(ARTHAS, RUN_NULL).validate();
  });
  await test('buildRunEmbed shows "?" for an undefined level', () => {
    const e = buildRunEmbed(ARTHAS, RUN_NULL);
    assert(e._data.title.includes('?'), 'title: ' + e._data.title);
  });
  await test('buildRunEmbed depleted is red', () => {
    const e = buildRunEmbed(ARTHAS, formatRun({ ...FULL_RUN, num_keystone_upgrades:0 }));
    assert(e._data.color === 0xed4245, 'red');
  });
  await test('buildRunEmbed timed without upgrade count shows no "()"', () => {
    const { num_keystone_upgrades, ...bare } = FULL_RUN;
    const e = buildRunEmbed(ARTHAS, formatRun(bare));
    const result = e._data.fields.find(f => f.name.includes('Result')).value;
    assert(result === '**TIMED**', result);
  });
  await test('buildProfileEmbed with null thumbnail does not crash', () => {
    const char = {name:'Arthas',realm:'Hyjal',class:'Death Knight',
      active_spec_name:'Unholy',thumbnail_url:null,
      mythic_plus_scores_by_season:[{scores:{all:2800}}]};
    buildProfileEmbed(ARTHAS, char, [RUN_OK]).validate();
  });
  await test('buildProfileEmbed with a fully undefined character', () => {
    const c = {name:undefined,realm:undefined,class:undefined,
      active_spec_name:undefined,thumbnail_url:undefined,
      mythic_plus_scores_by_season:null};
    const e = buildProfileEmbed(ARTHAS, c, []);
    e.validate();
    assert(e._data.title.includes(ARTHAS.name), 'falls back to player.name');
  });
  await test('buildPlayerListEmbed with an empty list', () => {
    const e = buildPlayerListEmbed([]);
    assert(e._data.description && e._data.description.includes('/add'), 'mentions /add');
  });
  await test('buildPlayerListEmbed with 80 players stays under 4096 chars', () => {
    const many = Array.from({length:80},()=>({name:'A'.repeat(20),realm:'B'.repeat(20),region:'eu'}));
    const e = buildPlayerListEmbed(many);
    assert(e._data.description.length <= 4096, 'too long: ' + e._data.description.length);
    assert(e._data.description.includes('more not shown'), 'mentions hidden players');
  });

  // ── ratelimiter.js ─────────────────────────────────────────────────────────
  suite('ratelimiter.js: token bucket');

  await test('Tokens available', () => {
    assert(getTokensRemaining() > 0, 'got ' + getTokensRemaining());
  });
  await test('acquireToken uses a token', async () => {
    const before = getTokensRemaining();
    await acquireToken();
    const after = getTokensRemaining();
    assert(after < before, before + ' to ' + after);
  });

  // ── commands ───────────────────────────────────────────────────────────────
  suite('commands: loading');

  await test('Every command exposes data.name and execute()', () => {
    const dir = path.join(__dirname, '../src/commands');
    const names = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => {
      const cmd = require(path.join(dir, f));
      assert(typeof cmd.execute === 'function', f + ': execute missing');
      return cmd.data.name;
    });
    for (const n of ['add', 'remove', 'list', 'check', 'setchannel', 'forcepoll']) {
      assert(names.includes(n), '/' + n + ' missing');
    }
  });

  // ── poller.js ──────────────────────────────────────────────────────────────
  suite('poller.js: new run detection and announcement');

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
    return { url:'run-' + n, dungeon:'Dungeon ' + n, mythic_level:10, num_keystone_upgrades:1,
      clear_time_ms:1500000, par_time_ms:1800000, score:200, completed_at:completedAt, affixes:[] };
  }
  const poll = (client) => checkAllPlayers(client, { delayMs: 0 });
  const titles = (ch) => ch.sent.map(p => p.embeds[0]._data.title);

  await test('Never polled player is initialized without announcement', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.addPlayer(G1, ARTHAS);
    apiRuns = { [playerKey(ARTHAS)]: [run(2, '2026-01-02T00:00:00Z'), run(1, '2026-01-01T00:00:00Z')] };
    const { client, channels } = makeClient();
    const res = await poll(client);
    assert(res.announced === 0, 'no announcement');
    assert(!channels['chan-1'] || channels['chan-1'].sent.length === 0, 'nothing sent');
    assert(db.getKnownRunIds(playerKey(ARTHAS)).length === 2, 'state initialized');
  });
  await test('New runs are announced from oldest to newest', async () => {
    apiRuns[playerKey(ARTHAS)] = [
      run(4, '2026-01-04T00:00:00Z'), run(3, '2026-01-03T00:00:00Z'),
      run(2, '2026-01-02T00:00:00Z'), run(1, '2026-01-01T00:00:00Z'),
    ];
    const { client, channels } = makeClient();
    const res = await poll(client);
    assert(res.announced === 2, 'expected 2, got ' + res.announced);
    const t = titles(channels['chan-1']);
    assert(t[0].includes('Dungeon 3') && t[1].includes('Dungeon 4'), 'order: ' + t.join(' / '));
  });
  await test('Next poll finds no new run', async () => {
    const { client } = makeClient();
    const res = await poll(client);
    assert(res.announced === 0, 'expected 0, got ' + res.announced);
  });
  await test('First run of a player added without history is announced', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.addPlayer(G1, KASUME);
    db.initKnownRunIds(playerKey(KASUME), []); // what /add does for a player with no run
    apiRuns = { [playerKey(KASUME)]: [run(1, '2026-01-01T00:00:00Z')] };
    const { client, channels } = makeClient();
    const res = await poll(client);
    assert(res.announced === 1, 'expected 1, got ' + res.announced);
    assert(channels['chan-1'].sent.length === 1, 'one message sent');
  });
  await test('Player tracked by two guilds: one API call, announced in both channels', async () => {
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
    assert(apiCalls === 1, 'expected 1 call, got ' + apiCalls);
    assert(channels['chan-1'].sent.length === 1 && channels['chan-2'].sent.length === 1, 'two announcements');
  });
  await test('Send failure in one channel: the other still receives, runs marked as seen', async () => {
    apiRuns[playerKey(ARTHAS)] = [run(2, '2026-01-02T00:00:00Z'), run(1, '2026-01-01T00:00:00Z')];
    const { client, channels } = makeClient({ failing: ['chan-1'] });
    await poll(client);
    assert(channels['chan-2'].sent.length === 1, 'chan-2 received the announcement');
    const again = await poll(makeClient().client);
    assert(again.announced === 0, 'no re-announcement');
  });
  await test('Deleted channel does not crash the poll', async () => {
    apiRuns[playerKey(ARTHAS)].unshift(run(3, '2026-01-03T00:00:00Z'));
    const { client, channels } = makeClient({ missing: ['chan-1'] });
    const res = await poll(client);
    assert(res.errors === 0, 'no player error');
    assert(channels['chan-2'].sent.length === 1, 'chan-2 received the announcement');
  });
  await test('API error on one player: the others are still processed', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.addPlayer(G1, ARTHAS);
    db.addPlayer(G1, KASUME);
    db.initKnownRunIds(playerKey(ARTHAS), []);
    db.initKnownRunIds(playerKey(KASUME), []);
    apiRuns = {
      [playerKey(ARTHAS)]: new Error('Raider.io timeout (10s)'),
      [playerKey(KASUME)]: [run(1, '2026-01-01T00:00:00Z')],
    };
    const { client } = makeClient();
    const res = await poll(client);
    assert(res.errors === 1, 'one error');
    assert(res.announced === 1, 'Kasume announced');
    assert(db.getKnownRunIds(playerKey(ARTHAS)).length === 0, 'Arthas unchanged');
  });
  await test('Concurrent poll: the second one is skipped', async () => {
    const { client } = makeClient();
    const [a, b] = await Promise.all([poll(client), poll(client)]);
    assert(!a.skipped && b.skipped === true, 'second skipped');
  });
  await test('Known ids are merged, a run dropped then returned by the API is not re-announced', async () => {
    resetDB();
    db.setChannel(G1, 'chan-1');
    db.addPlayer(G1, ARTHAS);
    db.initKnownRunIds(playerKey(ARTHAS), ['run-1', 'run-2']);
    apiRuns = { [playerKey(ARTHAS)]: [run(3, '2026-01-03T00:00:00Z'), run(2, '2026-01-02T00:00:00Z')] };
    await poll(makeClient().client);
    const ids = db.getKnownRunIds(playerKey(ARTHAS));
    assert(ids.includes('run-1') && ids.includes('run-3'), 'ids: ' + ids.join(','));
    apiRuns[playerKey(ARTHAS)].push(run(1, '2026-01-01T00:00:00Z'));
    const res = await poll(makeClient().client);
    assert(res.announced === 0, 'returning run-1 must not be announced');
  });

  raiderio.getRecentRuns = realGetRecentRuns;

  // ── Summary ────────────────────────────────────────────────────────────────
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log('\n' + '─'.repeat(44));
  console.log('  Total:  ' + (passed + failed) + ' tests');
  console.log('  ✅ Passed: ' + passed);
  if (failed > 0) {
    console.log('  ❌ Failed: ' + failed);
    process.exit(1);
  } else {
    console.log('\n  ✅ All tests passed.\n');
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
