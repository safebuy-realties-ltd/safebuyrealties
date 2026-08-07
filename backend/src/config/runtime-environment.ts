/**
 * The one definition of which environment this process is running in.
 *
 * Three definitions used to exist: `isProductionEnvironment()` in ./payments-guard.ts,
 * `isProductionLike()` in ./cors-config.ts, and five bare `process.env.NODE_ENV === "production"`
 * comparisons scattered across auth, logging and the exception filter. They agreed often enough
 * to look harmless and disagreed in the case that matters.
 *
 * Two things were wrong with them, and both are fixed here.
 *
 * **They defaulted an undeclared environment to development.** `nodeEnv()` in the old payments
 * guard read `env.NODE_ENV?.trim() || "development"`, so a server that never set NODE_ENV was
 * treated as a developer's laptop: session cookies lost the Secure flag, unhandled exception text
 * went back to the caller, debug logging stayed on, and mock payments became reachable. Vercel
 * sets NODE_ENV on every deployment, which is why this never bit. The deployment target is now
 * self-managed Nigerian infrastructure, where nothing sets it for you. See ADR-0006.
 *
 * **They asked the platform rather than the operator.** `VERCEL_ENV` is a fact about one vendor.
 * It is still read here, because previews rely on it until the cutover finishes, but it is now the
 * last resort rather than half the definition.
 *
 * Resolution reads all three of APP_ENV, NODE_ENV and VERCEL_ENV and takes **the most hardened
 * value any of them claims**, rather than the first one that happens to be set. A signal can
 * therefore raise the environment and never lower it: `NODE_ENV=development` alongside
 * `VERCEL_ENV=production` is production, and so is `APP_ENV=development` on a box whose NODE_ENV
 * says production. Getting this backwards is the whole failure this module exists to prevent, so
 * the tie is always broken towards the safer answer.
 *
 * When nothing is set, or when a value is not one this application recognises, the result is
 * `unknown`, and `unknown` is treated as production by every predicate below. The failure mode of
 * forgetting to declare is a hardened server, not a silently permissive one.
 *
 * Local development declares itself through the `start` and `start:dev` npm scripts, and the test
 * runners set NODE_ENV=test themselves, so no developer has to remember anything.
 */

export type RuntimeEnvironment = "development" | "test" | "staging" | "production" | "unknown";

/** Values accepted from APP_ENV and NODE_ENV, mapped to the canonical name. */
const DIRECT: Record<string, RuntimeEnvironment> = {
  development: "development",
  dev: "development",
  test: "test",
  staging: "staging",
  stage: "staging",
  production: "production",
  prod: "production",
};

/**
 * VERCEL_ENV has its own vocabulary. `preview` is a real deployment on a real domain, so it maps
 * to staging rather than to development: it gets hardened defaults, and it does not get the
 * production-only obligations such as a live payment credential.
 */
const VERCEL: Record<string, RuntimeEnvironment> = {
  production: "production",
  preview: "staging",
  development: "development",
};

/**
 * How hardened each value is. Ranking `unknown` alongside `production` is what makes an
 * undeclared or misspelt environment safe by default, and `development` alongside `test` is
 * deliberate: they are equally permissive, and only the logger cares which of the two it is.
 */
const HARDENING: Record<RuntimeEnvironment, number> = {
  development: 0,
  test: 0,
  staging: 1,
  production: 2,
  unknown: 2,
};

/** A set-but-unrecognised value reads as `unknown`, which hardens rather than being ignored. */
function read(table: Record<string, RuntimeEnvironment>, raw?: string): RuntimeEnvironment | null {
  const key = raw?.trim().toLowerCase();
  if (!key) return null;
  return table[key] ?? "unknown";
}

/**
 * Resolves the runtime environment, or `unknown` when nothing declares it.
 *
 * Ties are broken towards the earlier signal, so APP_ENV names the environment whenever it is no
 * less hardened than the others. `development` and `test` tie at the same rank, which is why the
 * order below matters: under the test runner NODE_ENV=test is the only signal set, and it wins.
 */
export function resolveRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeEnvironment {
  const declared = [
    read(DIRECT, env.APP_ENV),
    read(DIRECT, env.NODE_ENV),
    read(VERCEL, env.VERCEL_ENV),
  ].filter((value): value is RuntimeEnvironment => value !== null);

  if (declared.length === 0) return "unknown";

  let best = declared[0];
  for (const value of declared) {
    if (HARDENING[value] > HARDENING[best]) best = value;
  }
  return best;
}

/**
 * True only on a developer's machine or under the test runner.
 *
 * This is the predicate every security default is written against, as `!isDevelopmentOrTest()`,
 * because it is the one that is safe to get wrong. Staging and `unknown` are both false, so both
 * get Secure cookies, withheld exception text and production log levels.
 */
export function isDevelopmentOrTest(env: NodeJS.ProcessEnv = process.env): boolean {
  const runtime = resolveRuntimeEnvironment(env);
  return runtime === "development" || runtime === "test";
}

/** True under the test runner only. */
export function isTestEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveRuntimeEnvironment(env) === "test";
}

/**
 * True in production, and true when the environment is undeclared.
 *
 * Distinct from `!isDevelopmentOrTest()` in exactly one place: staging is false here and false
 * there too, but staging is *not* production, so it carries no obligation to hold a live payment
 * credential. Use this for the refuse-to-start guards; use `!isDevelopmentOrTest()` for defaults
 * that should simply be hardened everywhere that is not a laptop.
 */
export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const runtime = resolveRuntimeEnvironment(env);
  return runtime === "production" || runtime === "unknown";
}

type DeclarationDeps = {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "warn">;
};

/**
 * Warns, once at boot, when nothing declared the environment.
 *
 * Deliberately a warning and not an exit. The undeclared case is now the *safe* case, so refusing
 * to start would buy nothing but downtime. What it would hide is the surprise: an operator who
 * meant to bring up staging and left APP_ENV unset gets a server that hardens correctly and that
 * says so, rather than one that quietly claims to be production.
 */
export function warnIfRuntimeEnvironmentUndeclared(deps: DeclarationDeps = {}): void {
  const env = deps.env ?? process.env;
  const logger = deps.logger ?? console;

  if (resolveRuntimeEnvironment(env) !== "unknown") return;

  const unrecognised = (
    [
      ["APP_ENV", env.APP_ENV, DIRECT],
      ["NODE_ENV", env.NODE_ENV, DIRECT],
      ["VERCEL_ENV", env.VERCEL_ENV, VERCEL],
    ] as const
  )
    .filter(([, raw, table]) => read(table, raw) === "unknown")
    .map(([name, raw]) => `${name}="${raw?.trim()}"`);

  const cause = unrecognised.length
    ? `${unrecognised.join(", ")} not recognised.`
    : "None of APP_ENV, NODE_ENV or VERCEL_ENV is set.";

  logger.warn(
    "\n[SafeBuyRealties] Environment not declared, so this process is being treated as production.\n" +
      `${cause}\n` +
      "Secure cookies, withheld exception detail and production log levels are all ON.\n" +
      'Set APP_ENV to one of "development", "test", "staging" or "production".\n' +
      "See docs/adr/0006-deployment-target-and-runtime-environment.md\n",
  );
}
