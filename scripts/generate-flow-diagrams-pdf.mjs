#!/usr/bin/env node
/**
 * Generate PDF from docs/virtual-meeting-flow-diagrams.html
 *   node scripts/generate-flow-diagrams-pdf.mjs
 *   node scripts/generate-flow-diagrams-pdf.mjs --out docs/SafeBuy-Realties-Platform-Flow-Diagrams.pdf
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const out =
  process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : "docs/SafeBuy-Realties-Platform-Flow-Diagrams.pdf";

const html = resolve("docs/virtual-meeting-flow-diagrams.html");
const pdf = resolve(out);
const profile = "/tmp/chrome-pdf-profile-sbr";

mkdirSync(dirname(pdf), { recursive: true });
mkdirSync(profile, { recursive: true });

const chrome = process.env.CHROME_PATH ?? "google-chrome";
const args = [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  `--user-data-dir=${profile}`,
  "--run-all-compositor-stages-before-draw",
  "--virtual-time-budget=20000",
  `--print-to-pdf=${pdf}`,
  `file://${html}`,
];

const result = spawnSync(chrome, args, { encoding: "utf8" });
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
console.log(`Wrote ${pdf}`);
