// Login throttling for the two-step OPAQUE login.
//
// Tiddlyhost counts attempts with Rack::Attack in front of Devise. MWS uses two
// requests per login (/login/1 starts the OPAQUE login, /login/2 finishes it),
// so the IP counter counts only /login/1: one complete login is one attempt.
// The identity counter counts failed attempts for a username and is cleared by
// a successful /login/2, just like Tiddlyhost's Warden failure counter.
//
// Counters live in this process only, like the password-lookup limiter in
// sessions.ts. They reset on restart and are not shared by several server
// instances. Nothing is persisted, so there is no Prisma model or migration.

import { readPrefs } from "./PrefsRoutes";

interface Counter {
  count: number;
  expiresAt: number;
}

interface LoginInfo {
  username: string;
  expiresAt: number;
}

const counters = new Map<string, Counter>();
const loginInfos = new Map<string, LoginInfo>();
let lastSweep = 0;

/** OPAQUE login states expire after five minutes. Keep the username mapping a
 *  little longer so a slow client still gets its failure counted. */
const LOGIN_INFO_TTL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

type RateLimitState = {
  engine: PrismaTxnClient;
  remoteAddress?: string;
  sendJSON<T>(status: number, obj: T, headers?: Record<string, unknown>): typeof STREAM_ENDED;
};

/** Remove expired buckets occasionally. Reads also delete their own expiry. */
function sweep(): void {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, counter] of counters) {
    if (counter.expiresAt <= now) counters.delete(key);
  }
  for (const [key, info] of loginInfos) {
    if (info.expiresAt <= now) loginInfos.delete(key);
  }
}

function increment(key: string, windowMs: number): number {
  const now = Date.now();
  const existing = counters.get(key);
  if (!existing || existing.expiresAt <= now) {
    counters.set(key, { count: 1, expiresAt: now + windowMs });
    return 1;
  }
  existing.count++;
  return existing.count;
}

function read(key: string): number {
  const counter = counters.get(key);
  if (!counter) return 0;
  if (counter.expiresAt <= Date.now()) {
    counters.delete(key);
    return 0;
  }
  return counter.count;
}

function identityKey(username: string): string {
  // Usernames are looked up case-sensitively, but a throttle key must not be
  // trivially evaded by changing the case of the same account name.
  return `id:${username.trim().toLowerCase()}`;
}

/** 429 with a machine-readable reason and the same Retry-After header as
 *  Tiddlyhost. FomController maps the reason to a translated message; sending
 *  English prose from the server would not respect the client's language. */
function sendTooMany(state: RateLimitState, retryAfterSeconds: number): never {
  throw state.sendJSON(429, {
    reason: "LOGIN_RATE_LIMITED",
    status: 429,
    retryAfterSeconds,
  }, { "Retry-After": String(retryAfterSeconds) });
}

function windowMs(prefs: Awaited<ReturnType<typeof readPrefs>>): number {
  return (prefs.loginRateLimitPeriodMinutes ?? 5) * 60 * 1000;
}

/** Called by /login/1, before the user is looked up. Counts every start,
 *  failed or successful, and also rejects usernames with too many failures. */
export async function checkLoginStart(state: RateLimitState, username: string): Promise<void> {
  sweep();
  const prefs = await readPrefs(state.engine);
  if (!prefs.loginRateLimitEnabled) return;

  const retryAfterSeconds = (prefs.loginRateLimitPeriodMinutes ?? 5) * 60;
  if (state.remoteAddress) {
    const limit = prefs.loginRateLimitIpAttempts ?? 5;
    const count = increment(`ip:${state.remoteAddress}`, windowMs(prefs));
    if (count > limit) sendTooMany(state, retryAfterSeconds);
  }

  const failures = read(identityKey(username));
  if (failures >= (prefs.loginRateLimitEmailFailures ?? 5)) sendTooMany(state, retryAfterSeconds);
}

/** Called by /login/2: the OPAQUE finish may only be attempted by a login
 *  whose username has not been blocked meanwhile. */
export async function checkLoginFinish(state: RateLimitState, loginSession: string): Promise<void> {
  const info = loginInfos.get(loginSession);
  if (!info || info.expiresAt <= Date.now()) return;
  sweep();
  const prefs = await readPrefs(state.engine);
  if (!prefs.loginRateLimitEnabled) return;
  if (read(identityKey(info.username)) >= (prefs.loginRateLimitEmailFailures ?? 5)) {
    sendTooMany(state, (prefs.loginRateLimitPeriodMinutes ?? 5) * 60);
  }
}

/** Feed the identity counter for a real login failure (unknown username in
 *  /login/1 or a rejected OPAQUE finish in /login/2). */
export async function noteFailedLogin(state: RateLimitState, username: string): Promise<void> {
  const prefs = await readPrefs(state.engine);
  if (!prefs.loginRateLimitEnabled) return;
  increment(identityKey(username), windowMs(prefs));
}

/** A correct password resets the failure counter for that account. */
export function clearFailedLogins(username: string): void {
  counters.delete(identityKey(username));
}

/** Keep the username of a /login/1 request so a later /login/2 failure can be
 *  attributed to an account. The OPAQUE generator hides it until it succeeds. */
export function rememberLogin(loginSession: string, username: string): void {
  loginInfos.set(loginSession, { username, expiresAt: Date.now() + LOGIN_INFO_TTL_MS });
}

/** Consume the username mapping. Called once for every /login/2 attempt. */
export function forgetLogin(loginSession: string): string | undefined {
  const info = loginInfos.get(loginSession);
  loginInfos.delete(loginSession);
  return info && info.expiresAt > Date.now() ? info.username : undefined;
}
