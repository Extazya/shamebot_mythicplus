const { EmbedBuilder } = require('discord.js');

// Couleurs WoW classes (optionnel, utilisé pour le score)
const SCORE_COLORS = {
  legendary: 0xff8000,  // Orange (> 3000)
  epic:       0xa335ee,  // Violet (> 2000)
  rare:       0x0070dd,  // Bleu   (> 1000)
  uncommon:   0x1eff00,  // Vert   (> 500)
  common:     0x9d9d9d,  // Gris
};

function getScoreColor(score) {
  if (score >= 3000) return SCORE_COLORS.legendary;
  if (score >= 2000) return SCORE_COLORS.epic;
  if (score >= 1000) return SCORE_COLORS.rare;
  if (score >= 500)  return SCORE_COLORS.uncommon;
  return SCORE_COLORS.common;
}

/**
 * Embed pour annoncer une nouvelle run détectée
 */
function buildRunEmbed(player, run) {
  const timedEmoji = run.timed ? '✅' : '❌';
  const timedLabel = run.timed ? `**DANS LES TEMPS** (${run.upgrade})` : '**HORS TEMPS**';
  const color = run.timed ? 0x57f287 : 0xed4245;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${timedEmoji} [+${run.level}] ${run.dungeon}`)
    .setURL(run.url)
    .setAuthor({
      name: `${player.name} — ${player.realm} (${player.region.toUpperCase()})`,
      url: `https://raider.io/characters/${player.region}/${encodeURIComponent(player.realm)}/${player.name}`,
    })
    .addFields(
      { name: '🎯 Résultat',   value: timedLabel,          inline: true },
      { name: '⏱️ Durée',      value: run.duration,        inline: true },
      { name: '⏳ Par Time',   value: run.par,             inline: true },
      { name: '🔑 Niveau',     value: `+${run.level}`,     inline: true },
      { name: '⭐ Score',      value: `${run.score.toFixed(1)}`, inline: true },
      { name: '📅 Date',       value: run.date,            inline: true },
    )
    .setFooter({ text: 'Raider.io Bot • Mythic+' })
    .setTimestamp();

  if (run.affixes.length > 0) {
    embed.addFields({ name: '🌀 Affixes', value: run.affixes.join(', '), inline: false });
  }

  return embed;
}

/**
 * Embed récapitulatif du profil d'un joueur
 */
function buildProfileEmbed(player, character, runs) {
  const score = character.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0;
  const color = getScoreColor(score);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📊 Profil M+ — ${character.name}`)
    .setURL(`https://raider.io/characters/${player.region}/${encodeURIComponent(player.realm)}/${player.name}`)
    .setThumbnail(character.thumbnail_url)
    .addFields(
      { name: '🌍 Région / Serveur', value: `${player.region.toUpperCase()} — ${character.realm}`, inline: true },
      { name: '⚔️ Classe / Spec',   value: `${character.active_spec_name || ''} ${character.class}`, inline: true },
      { name: '⭐ Score M+',        value: `**${score.toFixed(0)}**`, inline: true },
    )
    .setFooter({ text: 'Raider.io Bot • Mythic+' })
    .setTimestamp();

  if (runs.length > 0) {
    const runsText = runs.slice(0, 5).map(r => {
      const icon = r.timed ? '✅' : '❌';
      return `${icon} [+${r.level}] **${r.dungeon}** — ${r.duration}`;
    }).join('\n');
    embed.addFields({ name: '🔑 5 derniers runs', value: runsText, inline: false });
  }

  return embed;
}

/**
 * Embed liste des joueurs suivis
 */
function buildPlayerListEmbed(players) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('👥 Joueurs suivis')
    .setFooter({ text: 'Raider.io Bot • Mythic+' })
    .setTimestamp();

  if (players.length === 0) {
    embed.setDescription('Aucun joueur suivi. Utilisez `/add` pour en ajouter.');
  } else {
    const list = players.map((p, i) =>
      `\`${i + 1}.\` **${p.name}** — ${p.realm} (${p.region.toUpperCase()})`
    ).join('\n');
    embed.setDescription(list);
    embed.setFooter({ text: `${players.length} joueur(s) suivi(s) • Raider.io Bot` });
  }

  return embed;
}

module.exports = { buildRunEmbed, buildProfileEmbed, buildPlayerListEmbed };
