import { Injectable, LogLevel, LoggerService } from "@nestjs/common";
import { currentRequestContext } from "./request-context";
import { redact } from "./redact";

/**
 * E7-S1 criteria 1 and 2: one line per event, structured, carrying the request it belongs to.
 *
 * Installed with `app.useLogger()`, which is also what `Logger.overrideLogger()` does — so every
 * `new Logger(Something.name)` already in this codebase starts emitting structured JSON with a
 * correlation id without a single call site changing. That is the reason this implements Nest's
 * interface rather than introducing a logging library's own: the migration is the constructor
 * nobody has to rewrite.
 *
 * Format is chosen by environment, not by flag-day: JSON wherever something machine-reads the
 * output (production, and anywhere `LOG_FORMAT=json` is set), human-readable at a terminal. A
 * developer reading `npm run start:dev` should not have to pipe through `jq`.
 *
 * Writes go straight to the file descriptor rather than through `console`, so that a stray
 * `console.log` monkey-patch in a dependency cannot silently redirect the audit trail.
 */

/** Every line carries these. Anything else is merged in from the caller and redacted first. */
export interface LogFields {
  ts: string;
  level: LogLevel;
  msg: string;
  context?: string;
  correlationId?: string;
  method?: string;
  path?: string;
  userId?: string;
  role?: string;
  [field: string]: unknown;
}

/** Ascending severity. A configured level admits itself and everything after it. */
const SEVERITY: LogLevel[] = ["verbose", "debug", "log", "warn", "error", "fatal"];

const HUMAN_COLOURS: Record<LogLevel, string> = {
  verbose: "\x1b[90m",
  debug: "\x1b[36m",
  log: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[35m",
};

function resolveLevels(): LogLevel[] {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (configured === "silent" || configured === "none") return [];
  const floor = SEVERITY.indexOf(configured as LogLevel);
  if (floor >= 0) return SEVERITY.slice(floor);
  // Silent under jest unless a spec asks otherwise. Two specs build a real app with the real
  // middleware, so without this every assertion in the suite would arrive buried in access logs and
  // a failure would be harder to find than it is now.
  if (process.env.NODE_ENV === "test") return [];
  // Debug and verbose are noise in production and cost money to ship to a log drain.
  return process.env.NODE_ENV === "production" ? SEVERITY.slice(SEVERITY.indexOf("log")) : SEVERITY;
}

function resolveJson(): boolean {
  const configured = process.env.LOG_FORMAT?.trim().toLowerCase();
  if (configured === "json") return true;
  if (configured === "human" || configured === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

@Injectable()
export class StructuredLogger implements LoggerService {
  private levels = resolveLevels();
  private readonly json = resolveJson();

  setLogLevels(levels: LogLevel[]): void {
    this.levels = levels;
  }

  log(message: unknown, ...params: unknown[]): void {
    this.emit("log", message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.emit("warn", message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.emit("error", message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.emit("fatal", message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.emit("debug", message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.emit("verbose", message, params);
  }

  /** Exposed for the interceptor and the error tracker, which already hold structured fields. */
  write(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    if (!this.levels.includes(level)) return;
    this.print(this.assemble(level, msg, fields));
  }

  private emit(level: LogLevel, message: unknown, params: unknown[]): void {
    if (!this.levels.includes(level)) return;
    const { msg, fields } = this.normalise(level, message, params);
    this.print(this.assemble(level, msg, fields));
  }

  /**
   * Reduces Nest's several calling conventions to a message plus fields.
   *
   * Nest calls `error(message, stack, context)` and `log(message, context)`, always passing the
   * context last and never labelling either. Callers in this codebase also pass an object as the
   * message to attach fields. All three shapes have to land in the same envelope.
   */
  private normalise(
    level: LogLevel,
    message: unknown,
    params: unknown[],
  ): { msg: string; fields: Record<string, unknown> } {
    const fields: Record<string, unknown> = {};
    const rest = [...params];

    // Nest appends the context as the final string argument, so long as one was given.
    if (rest.length > 0 && typeof rest[rest.length - 1] === "string") {
      fields.context = rest.pop();
    }
    // `error(message, stack)` — the remaining string is the stack, not another message.
    if ((level === "error" || level === "fatal") && typeof rest[rest.length - 1] === "string") {
      fields.stack = rest.pop();
    }

    let msg: string;
    if (message instanceof Error) {
      msg = message.message;
      fields.err = message;
      fields.stack ??= message.stack;
    } else if (typeof message === "object" && message !== null) {
      const { msg: inner, message: alt, ...others } = message as Record<string, unknown>;
      msg = String(inner ?? alt ?? "");
      Object.assign(fields, others);
    } else {
      msg = String(message);
    }

    // Anything still unconsumed was an extra argument. Keep it rather than drop it silently.
    if (rest.length > 0) fields.params = rest;
    return { msg, fields };
  }

  private assemble(level: LogLevel, msg: string, fields: Record<string, unknown>): LogFields {
    const request = currentRequestContext();
    return {
      // Fields the caller supplies come first so that none of them can overwrite the envelope:
      // a payload with its own `level` must not be able to disguise an error as an info line.
      ...(redact(fields) as Record<string, unknown>),
      ts: new Date().toISOString(),
      level,
      msg: String(redact(msg)),
      ...(request && {
        correlationId: request.correlationId,
        method: request.method,
        path: request.path,
        ...(request.userId && { userId: request.userId }),
        ...(request.role && { role: request.role }),
      }),
    };
  }

  private print(line: LogFields): void {
    const stream = line.level === "error" || line.level === "fatal" ? process.stderr : process.stdout;
    stream.write(`${this.json ? JSON.stringify(line) : this.humanise(line)}\n`);
  }

  private humanise(line: LogFields): string {
    const { ts, level, msg, context, correlationId, stack, ...rest } = line;
    const head = `${HUMAN_COLOURS[level]}${level.toUpperCase().padEnd(7)}\x1b[0m`;
    const where = context ? ` \x1b[33m[${context}]\x1b[0m` : "";
    const id = correlationId ? ` \x1b[90m(${correlationId.slice(0, 8)})\x1b[0m` : "";
    const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
    const trace = typeof stack === "string" ? `\n${stack}` : "";
    return `${ts} ${head}${where}${id} ${msg}${extra}${trace}`;
  }
}
