/**
 * How many reverse proxies sit in front of this process, and therefore whose address `req.ip` is.
 *
 * Express defaults `trust proxy` to off, which is right for a process on the open internet and
 * wrong for every deployment this application has. On Render there is exactly one proxy in front of
 * the container, so with the setting off `req.ip` is that proxy's address on every request from
 * every caller in the world.
 *
 * That was already costing something before rate limiting existed. Four call sites write `req.ip`
 * into the audit log — two in private-document.controller.ts, one in permissions.guard.ts, one in
 * poa.controller.ts — and in production every one of them has been recording the proxy. It becomes
 * urgent here because a limit keyed on the caller's address, with every caller sharing one address,
 * is not a rate limiter: the first person to reach the login ceiling locks out everybody behind it.
 *
 * **A count rather than a boolean, and the count matters.** `trust proxy: true` tells Express to
 * believe the whole of `X-Forwarded-For`, including the part the client wrote, so a caller can send
 * a header and choose which bucket to be counted in, which is the same as not counting at all. With
 * the number 1, Express takes the address one hop from the right, which is the value the trusted
 * proxy appended and the client cannot reach past. Deployments with a CDN in front of the platform
 * proxy set 2, and so on: the number is a property of the deployment, so it is configuration.
 *
 * Zero is valid and means trust nothing, which is the correct value for a process reached directly.
 */

export const TRUST_PROXY_HOPS_ENV_VAR = "TRUST_PROXY_HOPS";

/** Render, Vercel and Fly all put exactly one proxy in front of a container. */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

/**
 * Reads the hop count, falling back to the default for anything it does not understand.
 *
 * Unparseable falls back rather than throwing because a typo here must not stop the API booting,
 * and because the default is the safe direction: at worst it trusts one hop where the deployment
 * has none, and at one hop nothing a client sends can move the address. The caller reports what it
 * dropped, so nobody is left thinking the variable took effect.
 */
export function resolveTrustProxyHops(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) return DEFAULT_TRUST_PROXY_HOPS;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) return DEFAULT_TRUST_PROXY_HOPS;
  return hops;
}

/** True when the variable is set to something the resolver had to ignore. */
export function isTrustProxyValueIgnored(raw: string | undefined): boolean {
  const value = raw?.trim();
  if (!value) return false;
  const hops = Number(value);
  return !Number.isInteger(hops) || hops < 0;
}
