export const REDACTED = "[redacted]";

/**
 * E7-S1 criterion 4: secrets never reach the log sink.
 *
 * Two independent passes, because either alone leaks:
 *
 *   By key — `password`, `token`, `authorization`, `accountNumber` and friends are redacted whatever
 *     they contain. This catches the value that does not look dangerous: a six-digit OTP is
 *     indistinguishable from a page number.
 *   By shape — a JWT, a bearer header or a long run of digits is redacted whatever it is called.
 *     This catches the key nobody thought of, which is the one that leaks in practice. This story's
 *     own evidence note says the current filter logs `exception.message`, and a Prisma error message
 *     quotes the offending value under no key at all.
 *
 * Redaction is not reversible and not partial, with one exception: account-shaped digit runs keep
 * their last four so support can confirm an account without the log holding one. That is the same
 * trade-off a bank statement makes.
 */

/**
 * A key *containing* any of these is sensitive wherever the word sits, so `newPassword`,
 * `password_hash` and `resetPasswordToken` are all caught by one entry. Over-redacting a field
 * called `authorId` is a cost worth paying for never missing one called `sellerBvn`.
 */
const SENSITIVE_SUBSTRINGS = [
  "password",
  "passphrase",
  "secret",
  "token",
  "apikey",
  "accesskey",
  "privatekey",
  "auth",
  "cookie",
  "session",
  "signature",
  "credential",
  "otp",
  "pincode",
  "cvv",
  "accountnumber",
  "accountno",
  "bvn",
  "nin",
  "salt",
  "hash",
  "jwt",
];

/**
 * Whole-key matches, after separators are stripped. These are the structural names a request body
 * arrives under, and criterion 3 says the tracker never captures one. Substring matching would be
 * too greedy here — `contentType` and `dataSource` say nothing and are worth keeping.
 */
const SENSITIVE_EXACT = new Set([
  "body",
  "payload",
  "buffer",
  "content",
  "data",
  "file",
  "files",
  "document",
  "documents",
  "raw",
]);

/** A JSON Web Token, in a field called anything at all. */
const JWT_SHAPE = /^ey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

/** `Bearer <anything>`, `Basic <anything>` — an Authorization value that escaped its key. */
const AUTH_SCHEME_SHAPE = /^(bearer|basic|digest)\s+\S/i;

/** Ten or more consecutive digits: Nigerian NUBAN accounts are 10, BVN and NIN are 11. */
const ACCOUNT_SHAPE = /\d{10,}/g;

/** Depth beyond which a value is summarised rather than walked. Guards against deep Prisma payloads. */
const MAX_DEPTH = 6;

/** Strings longer than this are truncated: a log line is not a place to store a document. */
const MAX_STRING = 512;

export function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    SENSITIVE_EXACT.has(normalised) ||
    SENSITIVE_SUBSTRINGS.some((needle) => normalised.includes(needle))
  );
}

function redactString(value: string): string {
  if (JWT_SHAPE.test(value) || AUTH_SCHEME_SHAPE.test(value)) return REDACTED;
  // Keep the last four so an operator can match a complaint to an account without the log holding
  // one: `1234567890123` becomes `[redacted:0123]`.
  const masked = value.replace(ACCOUNT_SHAPE, (digits) => `[redacted:${digits.slice(-4)}]`);
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…[truncated]` : masked;
}

/** Everything that is not a plain object or array. Returns `undefined` when there is no such case. */
function redactLeaf(value: object): unknown {
  // A document's bytes, whatever the field is called. Size is useful; content never is.
  if (Buffer.isBuffer(value)) return `[Buffer ${value.byteLength} bytes]`;
  if (ArrayBuffer.isView(value)) return `[${value.constructor.name} ${value.byteLength} bytes]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      // The stack quotes source, not request data, and is the reason anyone reads an error log.
      stack: value.stack,
    };
  }
  return undefined;
}

/**
 * Returns a JSON-safe copy of `value` with sensitive fields removed.
 *
 * Never mutates its argument: the caller is logging something it is still using.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case "string":
      return redactString(value);
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "function":
    case "symbol":
      return undefined;
    default:
      break;
  }

  const leaf = redactLeaf(value as object);
  if (leaf !== undefined) return leaf;

  if (depth >= MAX_DEPTH) return "[depth limit]";

  // A cycle is a bug in the caller, not a reason to crash the request that logged it.
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    const redacted = redact(item, depth + 1, seen);
    if (redacted !== undefined) out[key] = redacted;
  }
  return out;
}
