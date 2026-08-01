// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

function readDotEnvValue(fileName: string, key: string): string | undefined {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return undefined;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

// Vercel sets VERCEL=1 during builds. Nitro's vercel preset emits .vercel/output
// so SSR routes work; Cloudflare's worker output does not.
const deployToVercel = process.env.VERCEL === "1";
const apiProxyTarget =
  process.env.API_PROXY_TARGET?.trim() ||
  process.env.SBR_API_PROXY_TARGET?.trim() ||
  readDotEnvValue(".env.local", "API_PROXY_TARGET") ||
  readDotEnvValue(".env", "API_PROXY_TARGET") ||
  readDotEnvValue(".env.local", "SBR_API_PROXY_TARGET") ||
  readDotEnvValue(".env", "SBR_API_PROXY_TARGET") ||
  "http://localhost:3001";

export default defineConfig({
  cloudflare: deployToVercel ? false : undefined,
  plugins: deployToVercel ? [nitro({ preset: "vercel" })] : [],
  vite: {
    server: {
      host: process.env.VITE_DEV_HOST ?? "127.0.0.1",
      proxy: {
        "/api/v1": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: apiProxyTarget.startsWith("https://"),
        },
      },
    },
  },
});
