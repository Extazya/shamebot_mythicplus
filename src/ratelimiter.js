/**
 * Rate limiter pour l'API Raider.io — token bucket avec queue sérialisée.
 *
 * L'API publique tolère ~100 req/min. On se limite à 60/min par sécurité.
 * La queue garantit qu'aucun burst n'est possible même en cas d'appels
 * simultanés : les acquireToken() s'exécutent l'un après l'autre.
 */

const MAX_REQUESTS = 60;     // requêtes max par fenêtre
const WINDOW_MS    = 60_000; // fenêtre de 60 secondes

let tokens    = MAX_REQUESTS;
let lastReset = Date.now();

// Queue de sérialisation — empêche les appels simultanés de tous recharger
// le bucket en même temps (race condition du burst)
let queueTail = Promise.resolve();

/**
 * Attend qu'un token soit disponible, puis le consomme.
 * Les appels simultanés sont mis en file et traités un par un.
 */
function acquireToken() {
  queueTail = queueTail.then(_acquire);
  return queueTail;
}

async function _acquire() {
  const now = Date.now();

  // Recharger le bucket si la fenêtre est écoulée
  if (now - lastReset >= WINDOW_MS) {
    tokens    = MAX_REQUESTS;
    lastReset = now;
  }

  if (tokens > 0) {
    tokens--;
    return;
  }

  // Bucket vide : attendre la prochaine fenêtre
  const waitMs = WINDOW_MS - (Date.now() - lastReset) + 50; // +50ms marge
  console.warn(`⏳ Rate limit Raider.io atteint, attente ${Math.ceil(waitMs / 1000)}s...`);
  await new Promise(resolve => setTimeout(resolve, waitMs));

  // Réinitialiser et consommer un token
  tokens    = MAX_REQUESTS - 1;
  lastReset = Date.now();
}

/**
 * Retourne le nombre de tokens restants (debug).
 */
function getTokensRemaining() {
  const now = Date.now();
  if (now - lastReset >= WINDOW_MS) return MAX_REQUESTS;
  return tokens;
}

/**
 * Réinitialise le bucket (utile pour les tests).
 */
function _resetForTests() {
  tokens    = MAX_REQUESTS;
  lastReset = Date.now();
  queueTail = Promise.resolve();
}

module.exports = { acquireToken, getTokensRemaining };

// Exposé séparément pour les tests — ne pas utiliser en production
module.exports._resetForTests = _resetForTests;
