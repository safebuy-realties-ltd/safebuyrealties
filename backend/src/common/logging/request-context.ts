import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The per-request facts every log line should carry, wherever it is written from.
 *
 * Threading a correlation id through call signatures would mean touching every service, every
 * repository and every helper between the controller and the line that actually logs — and it would
 * be wrong again the first time someone adds a method and forgets the parameter. `AsyncLocalStorage`
 * is the platform's answer: the store follows the async call chain, so `EscrowService` can log with
 * the caller's correlation id without knowing a request exists.
 *
 * The store is deliberately mutable. `CorrelationIdMiddleware` runs before authentication, so who is
 * calling is not known yet; `RequestLoggingInterceptor` fills the actor in once the guards have run.
 */
export interface RequestContext {
  /** Echoed to the client in `x-request-id`. Accepted from the caller when it looks safe. */
  readonly correlationId: string;
  readonly method: string;
  /** The route path as the client sent it, without the query string. */
  readonly path: string;
  /** Populated after the guards resolve the caller. Absent on anonymous and pre-auth failures. */
  userId?: string;
  role?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` — and everything it awaits — with `context` attached. */
export function runInRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * The calling request's context, or undefined outside one.
 *
 * Undefined is normal, not a failure: bootstrap, scheduled work and the test suite all log without a
 * request. Callers must treat the correlation id as optional rather than defaulting it to a
 * placeholder, so that "no request" and "request whose id went missing" stay distinguishable.
 */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Records who turned out to be calling. No-op outside a request. */
export function setRequestActor(userId?: string, role?: string): void {
  const context = storage.getStore();
  if (!context) return;
  if (userId !== undefined) context.userId = userId;
  if (role !== undefined) context.role = role;
}
