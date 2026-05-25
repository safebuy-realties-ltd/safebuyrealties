// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

// Vercel sets VERCEL=1 during builds. Nitro's vercel preset emits .vercel/output
// so SSR routes work; Cloudflare's worker output does not.
const deployToVercel = process.env.VERCEL === "1";

export default defineConfig({
  cloudflare: !deployToVercel,
  plugins: deployToVercel ? [nitro({ preset: "vercel" })] : [],
});
