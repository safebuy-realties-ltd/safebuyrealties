/**
 * The dials for E5-S5, in one place so an incident can be answered by changing an environment
 * variable rather than by shipping.
 */

/** Every session row sits under one entity, so the existing `@@index([entity, entityId])` serves it. */
export const AUTH_SESSION_ENTITY = "AuthSession";

/**
 * How long an access token is good for.
 *
 * The criterion says fifteen minutes or less and fifteen is what this uses, because the number is a
 * trade rather than a target: it is how long a stolen access token keeps working after the session
 * behind it has been revoked. Shorter is safer and costs a refresh round trip more often. This is
 * the only value in this file that a reviewer should argue about, and `ACCESS_TOKEN_TTL` accepts
 * anything the `jsonwebtoken` library parses, so "5m" is a deploy rather than a release.
 */
export const DEFAULT_ACCESS_TOKEN_TTL = "15m";

/**
 * How long the token issued at sign-in stays valid, and this one is deliberately not longer than
 * what it replaces.
 *
 * Today the cookie is a seven-day JWT with no way to revoke it. Seven days here means the absolute
 * lifetime of a session does not grow as part of a story whose purpose is to shorten the window an
 * attacker gets. Rotation does not extend it: refreshing at hour 167 gives a token that expires in
 * an hour, not one that expires next week. A sliding window would be friendlier and would also mean
 * a session that is refreshed by a script never ends, which is the property being removed.
 */
export const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7;

/**
 * How long after a rotation the token it replaced is still answered rather than treated as theft.
 *
 * Without this, refresh token rotation breaks the ordinary case it is meant to protect. Two tabs
 * waking from sleep, or one page firing two requests that both hit an expired access token, present
 * the same refresh token within milliseconds of each other. One rotates it, the other arrives
 * holding a token that is now spent, and a strict reading revokes the family and signs the person
 * out for doing nothing wrong.
 *
 * Inside the window the spent token is answered with the current one rather than with a new
 * rotation, so a replay cannot walk the chain forward. Outside it, reuse is reuse: the family is
 * revoked and an alert is written. `REFRESH_REUSE_LEEWAY_MS=0` restores the strict reading for
 * anyone who wants it, at the cost of spurious sign-outs in a multi-tab browser.
 */
export const DEFAULT_REUSE_LEEWAY_MS = 10_000;

/**
 * The one thing a failed refresh is ever allowed to say.
 *
 * Criterion 5 in as few words as possible. Expired, revoked, reused, fabricated, belonging to a
 * deleted user: all of them get this string and a 401, because the alternative tells whoever is
 * holding the token which kind of wrong it is, and the difference between "expired" and "revoked"
 * is the difference between "wait" and "you have been caught".
 */
export const REFRESH_FAILURE_MESSAGE = "Session expired. Sign in again.";

/** Most sessions listed or revoked in one query. A person with more than this has a problem. */
export const MAX_SESSIONS_SCANNED = 200;
