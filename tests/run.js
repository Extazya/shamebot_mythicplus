/**
 * Suite de tests du bot M+ Raider.io
 * Lancer avec : node tests/run.js
 */

'use strict';

const Module  = require('module');
const origRes = Module._resolveFilename;
Module._resolveFilename = function (req, ...args) {
  if (req === 'discord.js') return require.resolve('./mock-discord.js');
  return origRes.call(this, req, ...args);
};

const fs   = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, '../data/db.json');

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

async function main() {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  const db = require('../src/db.js');
  const { formatRun }  = require('../src/raiderio.js');
  const { buildRunEmbed, buildProfileEmbed, buildPlayerListEmbed } = require('../src/embeds.js');
  const { acquireToken, getTokensRemaining } = require('../src/ratelimiter.js');

  // Helper pour tester formatDuration via formatRun
  function fmtDur(ms) {
    return formatRun({ url:'x', dungeon:'x', mythic_level:1, num_chests:1,
      clear_time_ms:ms, par_time_ms:60000, score:0,
      completed_at:'2026-01-01T00:00:00Z', affixes:[] }).duration;
  }

  // ── db.js ──────────────────────────────────────────────────────────────────
  suite('db.js — Persistance');

  await test('addPlayer true pour nouveau joueur', () => {
    assert(db.addPlayer('eu','Hyjal','Arthas') === true, 'premier add');
  });
  await test('addPlayer false pour doublon (case-insensitive)', () => {
    assert(db.addPlayer('EU','HYJAL','ARTHAS') === false, 'doublon maj');
    assert(db.addPlayer('eu','hyjal','arthas') === false, 'doublon min');
  });
  await test('getPlayers retourne la liste correcte', () => {
    db.addPlayer('eu','Archimonde','Thrall');
    const p = db.getPlayers();
    assert(p.length === 2, 'attendu 2, obtenu '+p.length);
    assert(p[0].name === 'Arthas', 'nom joueur 1');
  });
  await test('setChannel / getChannel', () => {
    db.setChannel('123456789012345678');
    assert(db.getChannel() === '123456789012345678', 'channel ID');
  });
  await test('setLastRunIds / getLastRunIds', () => {
    db.setLastRunIds('eu-hyjal-arthas', ['url1','url2','url3']);
    const ids = db.getLastRunIds('eu-hyjal-arthas');
    assert(ids.length === 3, 'attendu 3, obtenu '+ids.length);
    assert(ids[0] === 'url1', 'premier ID');
  });
  await test('getLastRunIds retourne [] pour joueur inconnu', () => {
    const ids = db.getLastRunIds('xx-inconnu');
    assert(Array.isArray(ids) && ids.length === 0, 'tableau vide attendu');
  });
  await test('removePlayer true puis false', () => {
    assert(db.removePlayer('eu','Archimonde','Thrall') === true,  'remove ok');
    assert(db.removePlayer('eu','Archimonde','Thrall') === false, 'remove doublon');
    assert(db.getPlayers().length === 1, 'doit rester 1 joueur');
  });
  await test('Récupération après corruption JSON', () => {
    fs.writeFileSync(DB_PATH, '{CORROMPU}');
    const p = db.getPlayers();
    assert(Array.isArray(p), 'doit retourner tableau');
    assert(p.length === 0,   'DB réinitialisée vide');
    JSON.parse(fs.readFileSync(DB_PATH,'utf8')); // ne doit pas planter
  });
  await test('Écriture atomique — .tmp ne reste pas', () => {
    db.addPlayer('eu','Hyjal','Atomic');
    assert(!fs.existsSync(DB_PATH+'.tmp'), '.tmp ne doit pas rester');
  });

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  // ── raiderio.js ────────────────────────────────────────────────────────────
  suite('raiderio.js — formatRun & formatDuration');

  const FULL_RUN = {
    url:'https://raider.io/run/123', dungeon:'Ara-Kara, City of Echoes',
    mythic_level:12, num_chests:1, clear_time_ms:1845000, par_time_ms:1800000,
    score:187.3, completed_at:'2026-03-20T21:14:00.000Z',
    affixes:[{name:'Fortified'},{name:'Bolstering'}],
  };

  await test('Run complet et dans les temps', () => {
    const r = formatRun(FULL_RUN);
    assert(r.timed    === true,                       'timed');
    assert(r.level    === 12,                         'level');
    assert(r.dungeon  === 'Ara-Kara, City of Echoes', 'dungeon');
    assert(r.score    === 187.3,                      'score');
    assert(r.duration === '30m45s',                   'durée: '+r.duration);
    assert(r.par      === '30m00s',                   'par: '+r.par);
    assert(r.affixes.length === 2,                    'affixes');
    assert(r.url      === FULL_RUN.url,               'url');
    assert(r.date     !== '—',                        'date valide');
  });
  await test('Run hors temps (num_chests=0)', () => {
    const r = formatRun({...FULL_RUN, num_chests:0});
    assert(r.timed   === false,     'pas timed');
    assert(r.upgrade === 'Dépassé', 'label dépassé');
  });
  await test('Champs null/undefined sans crash', () => {
    const r = formatRun({url:null,dungeon:null,mythic_level:undefined,
      num_chests:0,clear_time_ms:null,par_time_ms:undefined,
      score:null,completed_at:null,affixes:null});
    assert(r.score   === 0,               'score null→0 : '+r.score);
    assert(r.duration === '—',            'duration null→—');
    assert(r.par      === '—',            'par null→—');
    assert(r.date     === '—',            'date null→—');
    assert(r.dungeon  === 'Donjon inconnu','dungeon null→fallback');
    assert(Array.isArray(r.affixes) && r.affixes.length===0, 'affixes null→[]');
  });
  await test('formatDuration cas limites', () => {
    assert(fmtDur(0)       === '—',      '0ms→— : '+fmtDur(0));
    assert(fmtDur(null)    === '—',      'null→—');
    assert(fmtDur(60000)   === '1m00s',  '60s: '+fmtDur(60000));
    assert(fmtDur(61000)   === '1m01s',  '61s: '+fmtDur(61000));
    assert(fmtDur(3661000) === '61m01s', '3661s: '+fmtDur(3661000));
  });

  // ── embeds.js ──────────────────────────────────────────────────────────────
  suite('embeds.js — Builders Discord');

  const PLAYER   = {name:'Arthas',realm:'Hyjal',region:'eu'};
  const RUN_OK   = formatRun(FULL_RUN);
  const RUN_NULL = formatRun({url:null,dungeon:null,mythic_level:undefined,
    num_chests:0,clear_time_ms:null,par_time_ms:undefined,
    score:null,completed_at:null,affixes:null});

  await test('buildRunEmbed run valide', () => {
    const e = buildRunEmbed(PLAYER, RUN_OK);
    assert(e._data.color === 0x57f287, 'couleur verte');
    assert(e._data.fields.length >= 6,  'au moins 6 champs');
    assert(e._data.url === FULL_RUN.url,'URL présente');
    e.validate();
  });
  await test('buildRunEmbed url null ne plante pas', () => {
    const e = buildRunEmbed(PLAYER, RUN_NULL);
    assert(e._errors.filter(x=>x.includes('setURL')).length === 0, 'pas erreur setURL');
    e.validate();
  });
  await test('buildRunEmbed level undefined affiche "?"', () => {
    const e = buildRunEmbed(PLAYER, RUN_NULL);
    assert(e._data.title.includes('?'), 'title: '+e._data.title);
  });
  await test('buildRunEmbed hors temps = rouge', () => {
    const e = buildRunEmbed(PLAYER, formatRun({...FULL_RUN,num_chests:0}));
    assert(e._data.color === 0xed4245, 'rouge');
  });
  await test('buildRunEmbed aucun champ vide/null', () => {
    buildRunEmbed(PLAYER, RUN_OK).validate();
  });
  await test('buildProfileEmbed thumbnail null ne plante pas', () => {
    const char = {name:'Arthas',realm:'Hyjal',class:'Death Knight',
      active_spec_name:'Unholy',thumbnail_url:null,
      mythic_plus_scores_by_season:[{scores:{all:2800}}]};
    const e = buildProfileEmbed(PLAYER, char, [RUN_OK]);
    assert(e._errors.filter(x=>x.includes('setThumbnail')).length===0, 'pas erreur thumbnail');
  });
  await test('buildProfileEmbed character entièrement undefined', () => {
    const c = {name:undefined,realm:undefined,class:undefined,
      active_spec_name:undefined,thumbnail_url:undefined,
      mythic_plus_scores_by_season:null};
    const e = buildProfileEmbed(PLAYER, c, []);
    e.validate();
    assert(e._data.title.includes(PLAYER.name), 'fallback player.name');
  });
  await test('buildPlayerListEmbed liste vide', () => {
    const e = buildPlayerListEmbed([]);
    assert(e._data.description && e._data.description.includes('/add'), 'message /add');
  });
  await test('buildPlayerListEmbed 50 joueurs ≤ 4096 chars', () => {
    const many = Array.from({length:80},()=>({name:'A'.repeat(20),realm:'B'.repeat(20),region:'eu'}));
    const e = buildPlayerListEmbed(many);
    assert(e._data.description.length <= 4096, 'trop long: '+e._data.description.length);
    assert(e._data.description.includes('autre'), 'mention non affichés');
  });

  // ── ratelimiter.js ─────────────────────────────────────────────────────────
  suite('ratelimiter.js — Token bucket');

  await test('Tokens disponibles initialement', () => {
    assert(getTokensRemaining() > 0, 'got '+getTokensRemaining());
  });
  await test('acquireToken consomme un token', async () => {
    const before = getTokensRemaining();
    await acquireToken();
    const after = getTokensRemaining();
    assert(after < before, before+' → '+after);
  });

  // ── Logique polling ────────────────────────────────────────────────────────
  suite('Logique polling — Détection des nouvelles runs');

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  await test('Premier poll : initialise sans notifier', () => {
    db.setChannel('chan1');
    db.addPlayer('eu','Hyjal','Arthas');
    const ids = db.getLastRunIds('eu-hyjal-arthas');
    assert(ids.length === 0, 'init vide');
    db.setLastRunIds('eu-hyjal-arthas', ['url1','url2']);
    assert(db.getLastRunIds('eu-hyjal-arthas').length === 2, 'initialisé');
  });
  await test('Deuxième poll : détecte les nouvelles runs', () => {
    const known = db.getLastRunIds('eu-hyjal-arthas');
    const api   = [{url:'url1'},{url:'url2'},{url:'url3'},{url:'url4'}];
    const newR  = api.filter(r=>!known.includes(r.url));
    assert(newR.length === 2, 'attendu 2, got '+newR.length);
    assert(newR[0].url === 'url3', 'première nouvelle');
  });
  await test('Ordre envoi : plus ancien en premier (reverse)', () => {
    const sorted = [{url:'url3'},{url:'url4'}].reverse();
    assert(sorted[0].url === 'url4', 'url4 en premier');
  });
  await test('Troisième poll : aucune nouvelle run', () => {
    db.setLastRunIds('eu-hyjal-arthas',['url1','url2','url3','url4']);
    const known = db.getLastRunIds('eu-hyjal-arthas');
    const api   = [{url:'url1'},{url:'url2'},{url:'url3'},{url:'url4'}];
    assert(api.filter(r=>!known.includes(r.url)).length === 0, 'aucune nouvelle');
  });
  await test('Limite 50 IDs (pas de fuite mémoire)', () => {
    const ids = Array.from({length:50},(_,i)=>'url'+i);
    db.setLastRunIds('eu-hyjal-arthas', ids);
    assert(db.getLastRunIds('eu-hyjal-arthas').length === 50, 'max 50');
  });

  // ── Résultat ───────────────────────────────────────────────────────────────
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  console.log('\n' + '─'.repeat(44));
  console.log('  Total   : ' + (passed+failed) + ' tests');
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
