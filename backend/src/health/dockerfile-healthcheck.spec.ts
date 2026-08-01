/**
 * The container healthcheck is deploy-path configuration, so it is verified by running it
 * rather than by matching strings.
 *
 * Each case extracts the real `node -e` command out of backend/Dockerfile, points it at a stub
 * server on an ephemeral port, and asserts the exit code Docker would act on. A string assertion
 * would have passed happily against the bug this story fixes: the old command was well-formed,
 * it just polled an endpoint that returns 200 from static values, so a container with an
 * unreachable database reported itself healthy.
 *
 * Found while writing the deploy section in E7-S5, tracked as E7-S6b. See docs/RUNBOOK.md §2.2.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { AddressInfo } from "node:net";
import { HealthController } from "./health.controller";

const DOCKERFILE = join(__dirname, "..", "..", "Dockerfile");
const APP_BOOTSTRAP = join(__dirname, "..", "app-bootstrap.ts");

/** The Dockerfile with line continuations folded away, so directives can be read as one line each. */
function dockerfile(): string {
  return readFileSync(DOCKERFILE, "utf8").replace(/\\\r?\n\s*/g, " ");
}

/** The HEALTHCHECK directive: its flags and the shell command Docker runs. */
function healthcheck(): { flags: string; command: string } {
  const match = dockerfile().match(/^HEALTHCHECK\s+(.*?)\s+CMD\s+(.*)$/m);
  if (!match) throw new Error("backend/Dockerfile has no HEALTHCHECK directive");
  return { flags: match[1], command: match[2] };
}

/** The script inside `node -e "..."`. It contains no double quotes, so the bounds are unambiguous. */
function healthcheckScript(): string {
  const match = healthcheck().command.match(/^node -e "([^"]+)"$/);
  if (!match) throw new Error(`HEALTHCHECK CMD is not a node -e script: ${healthcheck().command}`);
  return match[1];
}

/** A `--flag=90s` duration in seconds. */
function flagSeconds(name: string): number {
  const match = healthcheck().flags.match(new RegExp(`--${name}=(\\d+)([smh])`));
  if (!match) throw new Error(`HEALTHCHECK has no --${name} flag`);
  const multiplier = { s: 1, m: 60, h: 3600 }[match[2] as "s" | "m" | "h"];
  return Number(match[1]) * multiplier;
}

/**
 * Runs the real healthcheck command against `port` and resolves with the exit code Docker sees.
 * 0 is healthy; anything else is a failed check.
 */
function runHealthcheck(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["-e", healthcheckScript()],
      { env: { ...process.env, PORT: String(port) }, timeout: 10_000 },
      (error: (Error & { code?: number | string }) | null) => {
        if (!error) return resolve(0);
        if (typeof error.code === "number") return resolve(error.code);
        reject(error);
      },
    );
  });
}

/** A server that answers `status` on `path` and 404 everywhere else, on an ephemeral port. */
async function stubServer(path: string, status: number): Promise<{ server: Server; port: number }> {
  const requested: string[] = [];
  const server = createServer((req, res) => {
    requested.push(req.url ?? "");
    res.writeHead(req.url === path ? status : 404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: status === 200 ? "ok" : "unavailable" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** The path the application actually serves, derived from Nest metadata rather than restated. */
function readinessRoute(): string {
  const prefix = readFileSync(APP_BOOTSTRAP, "utf8").match(/setGlobalPrefix\(\s*"([^"]+)"/)?.[1];
  if (!prefix) throw new Error("could not read the global prefix from app-bootstrap.ts");
  const controller = Reflect.getMetadata("path", HealthController) as string;
  const method = Reflect.getMetadata("path", HealthController.prototype.ready) as string;
  return `/${prefix}/${controller}/${method}`;
}

describe("backend/Dockerfile HEALTHCHECK", () => {
  const READY = "/api/v1/health/ready";

  it("polls the readiness probe, not the endpoint that cannot fail", () => {
    expect(healthcheckScript()).toContain(READY);
    // The bug this story fixes: the bare endpoint returns 200 from static values.
    expect(healthcheckScript()).not.toMatch(/'\/api\/v1\/health'/);
  });

  it("polls the path the controller actually serves", () => {
    // Renaming the route or the global prefix must fail here rather than in production.
    expect(readinessRoute()).toBe(READY);
    expect(healthcheckScript()).toContain(readinessRoute());
  });

  it("leaves the bare /health endpoint in place for anything already polling it", () => {
    expect(Reflect.getMetadata("path", HealthController.prototype.check)).toBe("/");
    expect(Reflect.getMetadata("path", HealthController.prototype.live)).toBe("live");
  });

  describe("the exit code Docker acts on", () => {
    it("is 0 when readiness answers 200", async () => {
      const { server, port } = await stubServer(READY, 200);
      try {
        await expect(runHealthcheck(port)).resolves.toBe(0);
      } finally {
        await close(server);
      }
    });

    it("is non-zero when readiness answers 503, which is how a dead dependency reports", async () => {
      const { server, port } = await stubServer(READY, 503);
      try {
        await expect(runHealthcheck(port)).resolves.not.toBe(0);
      } finally {
        await close(server);
      }
    });

    it("is non-zero on any other error status", async () => {
      for (const status of [500, 502, 404]) {
        const { server, port } = await stubServer(READY, status);
        try {
          await expect(runHealthcheck(port)).resolves.not.toBe(0);
        } finally {
          await close(server);
        }
      }
    });

    it("is non-zero when nothing is listening at all", async () => {
      const { server, port } = await stubServer(READY, 200);
      await close(server);

      // The connection is refused rather than answered, which is the crashed-process case.
      await expect(runHealthcheck(port)).resolves.not.toBe(0);
    });
  });

  describe("timings", () => {
    it("allows prisma migrate deploy plus boot before the first verdict counts", () => {
      // The container migrates the shared cloud Postgres before it serves, and readiness cannot
      // pass until it does. 20s did not cover that.
      expect(flagSeconds("start-period")).toBeGreaterThanOrEqual(120);
      // Render cancels a deploy whose instances are not all healthy within 15 minutes, so a
      // start period at or beyond that would make the check meaningless there.
      expect(flagSeconds("start-period")).toBeLessThan(900);
    });

    it("gives the probe more time than its own internal budget", () => {
      // health-check.ts caps the database check at 2s and the other two at 500ms, run in
      // parallel, so /health/ready always answers well inside this.
      expect(flagSeconds("timeout")).toBeGreaterThanOrEqual(5);
      expect(flagSeconds("timeout")).toBeLessThan(flagSeconds("interval"));
    });

    it("requires consecutive failures before declaring the container unhealthy", () => {
      expect(Number(healthcheck().flags.match(/--retries=(\d+)/)?.[1])).toBeGreaterThanOrEqual(3);
    });
  });
});
