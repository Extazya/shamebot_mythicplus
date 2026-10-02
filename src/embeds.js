const { EmbedBuilder } = require('discord.js');
const { playerUrl } = require('./player');

// Raider.io score tiers, reused as embed colors
const SCORE_COLORS = {
  legendary: 0xff8000,  // orange, 3000+
  epic:       0xa335ee,  // purple, 2000+
  rare:       0x0070dd,  // blue, 1000+
  uncommon:   0x1eff00,  // green, 500+
  common:     0x9d9d9d,  // grey
};

const FOOTER = 'Raider.io Bot • Mythic+';

function getScoreColor(score) {
  if (score >= 3000) return SCORE_COLORS.legendary;
  if (score >= 2000) return SCORE_COLORS.epic;
  if (score >= 1000) return SCORE_COLORS.rare;
  if (score >= 500)  return SCORE_COLORS.uncommon;
  return SCORE_COLORS.common;
}

function characterLabel(player) {
  return `${player.name}-${player.realm} (${player.region.toUpperCase()})`;
}

function buildRunEmbed(player, run) {
  const timedEmoji = run.timed ? '✅' : '❌';
  const timedLabel = run.timed
    ? `**TIMED**${run.upgrade ? ` (${run.upgrade})` : ''}`
    : '**DEPLETED**';
  const color = run.timed ? 0x57f287 : 0xed4245;
  const level = run.level ?? '?';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${timedEmoji} [+${level}] ${run.dungeon}`)
    .setAuthor({ name: characterLabel(player), url: playerUrl(player) })
    .addFields(
      { name: '🎯 Result',     value: timedLabel,                    inline: true },
      { name: '⏱️ Time',       value: run.duration,                  inline: true },
      { name: '⏳ Timer',      value: run.par,                       inline: true },
      { name: '🔑 Level',      value: `+${level}`,                   inline: true },
      { name: '⭐ Score',      value: run.score.toFixed(1),          inline: true },
      { name: '📅 Date',       value: run.date,                      inline: true },
    )
    .setFooter({ text: FOOTER })
    .setTimestamp();

  // discord.js throws on a null URL or thumbnail
  if (run.url) embed.setURL(run.url);
  if (run.iconUrl) embed.setThumbnail(run.iconUrl);

  if (run.affixes.length > 0) {
    embed.addFields({ name: '🌀 Affixes', value: run.affixes.join(', '), inline: false });
  }

  return embed;
}

function buildProfileEmbed(player, character, runs) {
  const score = character.mythic_plus_scores_by_season?.[0]?.scores?.all ?? 0;
  const spec = [character.active_spec_name, character.class].filter(Boolean).join(' ');

  const embed = new EmbedBuilder()
    .setColor(getScoreColor(score))
    .setTitle(`📊 M+ profile: ${character.name || player.name}`)
    .setURL(playerUrl(player))
    .addFields(
      { name: '🌍 Region / Realm', value: `${player.region.toUpperCase()} ${character.realm || player.realm}`, inline: true },
      { name: '⚔️ Class / Spec',   value: spec || 'Unknown', inline: true },
      { name: '⭐ M+ score',       value: `**${score.toFixed(0)}**`, inline: true },
    )
    .setFooter({ text: FOOTER })
    .setTimestamp();

  if (character.thumbnail_url) {
    embed.setThumbnail(character.thumbnail_url);
  }

  if (runs.length > 0) {
    const runsText = runs.slice(0, 5).map(r => {
      const icon  = r.timed ? '✅' : '❌';
      const level = r.level ?? '?';
      return `${icon} [+${level}] **${r.dungeon}** in ${r.duration}`;
    }).join('\n');
    embed.addFields({ name: '🔑 Latest runs', value: runsText, inline: false });
  }

  return embed;
}

function buildPlayerListEmbed(players) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('👥 Tracked players')
    .setTimestamp();

  if (players.length === 0) {
    embed.setDescription('No tracked player yet. Use `/add` to add one.');
    embed.setFooter({ text: FOOTER });
    return embed;
  }

  const lines = players.map((p, i) => `\`${i + 1}.\` **${characterLabel(p)}**`);

  // Embed descriptions are capped at 4096 characters
  let description = '';
  let shown = 0;
  for (const line of lines) {
    if ((description + line + '\n').length > 3900) {
      description += `\n*... and ${players.length - shown} more not shown*`;
      break;
    }
    description += line + '\n';
    shown++;
  }

  embed.setDescription(description.trim());
  embed.setFooter({ text: `${players.length} tracked player(s) • Raider.io Bot` });
  return embed;
}

module.exports = { buildRunEmbed, buildProfileEmbed, buildPlayerListEmbed };
