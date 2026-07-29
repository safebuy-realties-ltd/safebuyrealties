/**
 * Fail-closed guard for the payment gateway.
 *
 * Without a Paystack secret key the application silently degrades to mock mode:
 * payments auto-succeed and payouts are written to the database as COMPLETED with a
 * `mock_transfer_...` reference. That is a useful local affordance and a financial
 * fiction in production, so production refuses to start without a key.
 *
 * See docs/adr/0003-payment-mock-mode-guard.md.
 */

/** Environments in which PAYSTACK_FORCE_MOCK is honoured. Everywhere else it is ignored. */
const MOCK_ALLOWED_NODE_ENVS = new Set(["development", "test"]);

const TRUTHY = new Set(["true", "1", "yes"]);

function nodeEnv(env: NodeJS.ProcessEnv): string {
  return (env.NODE_ENV?.trim() || "development").toLowerCase();
}

/** Production is either an explicit NODE_ENV or a Vercel production deployment. */
export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return nodeEnv(env) === "production" || env.VERCEL_ENV?.trim().toLowerCase() === "production";
}

/**
 * Whether a payment credential exists at all. Deliberately returns a boolean and never
 * the key, a prefix of it, or its length — callers include the public /health payload.
 */
export function hasPaymentSecretKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.PAYSTACK_SECRET_KEY?.trim() || env.PAYSTACK_TEST_SECRET_KEY?.trim());
}

/** Whether the operator asked for mock mode, regardless of whether they will get it. */
export function isForceMockRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return TRUTHY.has(env.PAYSTACK_FORCE_MOCK?.trim().toLowerCase() ?? "");
}

/** Whether that request is actually honoured: development and test only. */
export function isForceMockHonoured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isForceMockRequested(env)) return false;
  if (isProductionEnvironment(env)) return false;
  return MOCK_ALLOWED_NODE_ENVS.has(nodeEnv(env));
}

/**
 * True when real money can move. Mock mode is the complement, and is what the
 * serializers stamp onto individual payment and payout records.
 */
export function arePaymentsLive(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isForceMockHonoured(env) && hasPaymentSecretKey(env);
}

/**
 * Every gateway reference minted in mock mode carries this prefix, and no live Paystack
 * reference does. It is what lets an individual record be identified as mock without
 * adding a database column — see serializePayment() and serializePayout().
 */
export const MOCK_REFERENCE_PREFIX = "mock_";

/** Whether a stored payment or payout reference was produced by mock mode. */
export function isMockReference(reference: string | null | undefined): boolean {
  return Boolean(reference?.startsWith(MOCK_REFERENCE_PREFIX));
}

type GuardDeps = {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "error" | "warn">;
  exit?: (code: number) => never;
};

/**
 * Called from main.ts before the Nest application is created, alongside
 * assertSafeDatabaseUrl(). Exits the process rather than throwing so a
 * misconfigured production deploy fails visibly at boot.
 */
export function assertPaymentsConfigured(deps: GuardDeps = {}): void {
  const env = deps.env ?? process.env;
  const logger = deps.logger ?? console;
  const exit = deps.exit ?? ((code: number) => process.exit(code));

  if (isForceMockRequested(env) && !isForceMockHonoured(env)) {
    logger.warn(
      "\n[SafeBuyRealties] PAYSTACK_FORCE_MOCK is set but will be ignored.\n" +
        `Mock payments are only available when NODE_ENV is development or test (currently "${nodeEnv(env)}").\n` +
        "Payments will use the configured Paystack credentials.\n",
    );
  }

  if (!isProductionEnvironment(env)) return;
  if (hasPaymentSecretKey(env)) return;

  logger.error(
    "\n[SafeBuyRealties] Refusing to start: no Paystack secret key in a production environment.\n" +
      "Without one the API would record payments as succeeded and payouts as COMPLETED without moving money.\n" +
      "Set PAYSTACK_SECRET_KEY (see backend/.env.example) and redeploy.\n" +
      "See docs/adr/0003-payment-mock-mode-guard.md\n",
  );
  exit(1);
}
