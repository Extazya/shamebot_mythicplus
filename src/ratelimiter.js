/**
 * Raider.io rate limiter: fixed-window token bucket behind a serialized queue.
 *
 * The public API tolerates about 100 req/min, we stay at 60/min for margin.
 * Callers are queued so concurrent acquireToken() calls cannot all refill the
 * bucket at once and burst.
 */

const MAX_REQUESTS = 60;
const WINDOW_MS    = 60_000;

let tokens    = MAX_REQUESTS;
let lastReset = Date.now();
let queueTail = Promise.resolve();

function acquireToken() {
  queueTail = queueTail.then(_acquire);
  return queueTail;
}

async function _acquire() {
  const now = Date.now();

  if (now - lastReset >= WINDOW_MS) {
    tokens    = MAX_REQUESTS;
    lastReset = now;
  }

  if (tokens > 0) {
    tokens--;
    return;
  }

  const waitMs = WINDOW_MS - (Date.now() - lastReset) + 50;
  console.warn(`⏳ Raider.io rate limit reached, waiting ${Math.ceil(waitMs / 1000)}s...`);
  await new Promise(resolve => setTimeout(resolve, waitMs));

  tokens    = MAX_REQUESTS - 1;
  lastReset = Date.now();
}

function getTokensRemaining() {
  const now = Date.now();
  if (now - lastReset >= WINDOW_MS) return MAX_REQUESTS;
  return tokens;
}

function _resetForTests() {
  tokens    = MAX_REQUESTS;
  lastReset = Date.now();
  queueTail = Promise.resolve();
}

module.exports = { acquireToken, getTokensRemaining };
module.exports._resetForTests = _resetForTests;
