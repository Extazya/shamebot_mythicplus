/**
 * Character identity helpers.
 *
 * Users type realms in many forms ("Tarren Mill", "tarren-mill", "Blade's Edge",
 * "Aggra (Português)"), so every comparison goes through a slug close to the one
 * Raider.io/Blizzard use. Letters outside ASCII are kept so non-latin realms
 * still get a usable key.
 */

function realmSlug(realm) {
  return String(realm)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function playerKey({ region, realm, name }) {
  return `${region}-${realmSlug(realm)}-${name}`.toLowerCase();
}

function playerUrl(player) {
  if (player.profileUrl) return player.profileUrl;
  return `https://raider.io/characters/${player.region}/${realmSlug(player.realm)}/${encodeURIComponent(player.name)}`;
}

/**
 * Prefers Raider.io's canonical spelling over what the user typed.
 */
function playerFromProfile(character, input) {
  return {
    region: character.region || input.region,
    realm: character.realm || input.realm,
    name: character.name || input.name,
    ...(character.profile_url && { profileUrl: character.profile_url }),
  };
}

module.exports = { realmSlug, playerKey, playerUrl, playerFromProfile };
