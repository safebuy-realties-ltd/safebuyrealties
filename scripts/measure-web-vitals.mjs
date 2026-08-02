#!/usr/bin/env node
/**
 * Core Web Vitals on the listing detail page (E8-S4 criterion 6).
 *
 *   npm run measure:web-vitals
 *   SBR_WEB_BASE=https://safebuyrealties-app.vercel.app npm run measure:web-vitals
 *   SBR_VITALS_PROFILE=desktop SBR_VITALS_RUNS=9 npm run measure:web-vitals
 *   SBR_VITALS_CHANNEL=chrome npm run measure:web-vitals
 *
 * The channel variable exists because the browser Playwright bundles has to be downloaded, and on a
 * machine or a runner that cannot reach that CDN there is otherwise no way to take the measurement
 * at all. Setting it to `chrome` uses the Google Chrome already installed on the machine. Record
 * which one a baseline came from, because a bundled headless shell and a full Chrome are not the
 * same browser and only measurements taken the same way are comparable.
 *
 * This records a baseline, it does not gate anything. There is no threshold that fails the build,
 * because a number measured on one laptop against one deployment is not a contract; it is the
 * reference point the next measurement gets compared against. The run is throttled on purpose so
 * that reference means something: an unthrottled localhost render flatters every metric and would
 * make a real regression invisible.
 *
 * LCP and CLS come from the browser's own PerformanceObserver, which is the same source the field
 * data comes from. INP needs a real person clicking things, so the lab stands in Total Blocking
 * Time for it, which is what Lighthouse does and for the same reason.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const WEB_BASE = (process.env.SBR_WEB_BASE ?? "http://localhost:4173").replace(/\/+$/, "");
const API_BASE = (process.env.SBR_API_BASE ?? `${WEB_BASE}/api/v1`).replace(/\/+$/, "");
const RUNS = Number(process.env.SBR_VITALS_RUNS ?? 7);
const PROFILE = process.env.SBR_VITALS_PROFILE ?? "mobile";
const OUT = process.env.SBR_VITALS_OUT;
const CHANNEL = process.env.SBR_VITALS_CHANNEL;

/**
 * Lighthouse's mobile defaults, near enough. The point is not to reproduce Lighthouse exactly, it is
 * to measure the same page under the same handicap every time so two runs can be compared.
 */
const PROFILES = {
  mobile: {
    cpuThrottling: 4,
    viewport: { width: 412, height: 823 },
    network: { downloadKbps: 1600, uploadKbps: 750, latencyMs: 150 },
  },
  desktop: {
    cpuThrottling: 1,
    viewport: { width: 1366, height: 768 },
    network: { downloadKbps: 10240, uploadKbps: 10240, latencyMs: 20 },
  },
};

/** Google's own good / needs-improvement boundaries. TBT's are Lighthouse's. */
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "" },
  TBT: { good: 200, poor: 600, unit: "ms" },
  FCP: { good: 1800, poor: 3000, unit: "ms" },
  TTFB: { good: 800, poor: 1800, unit: "ms" },
};

/** Installed before any page script runs, so nothing that happens on load is missed. */
const COLLECTOR = () => {
  const state = { lcp: 0, cls: 0, blocking: 0 };
  window.__vitals = state;

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) state.lcp = entry.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // Shifts the user caused by interacting are not layout instability, they are the page working.
      if (!entry.hadRecentInput) state.cls += entry.value;
    }
  }).observe({ type: "layout-shift", buffered: true });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // Anything over 50ms is what makes a tap feel ignored; only the excess counts.
      if (entry.duration > 50) state.blocking += entry.duration - 50;
    }
  }).observe({ type: "longtask", buffered: true });
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function rate(metric, value) {
  const t = THRESHOLDS[metric];
  if (!t) return "";
  if (value <= t.good) return "good";
  return value <= t.poor ? "needs improvement" : "poor";
}

function format(metric, value) {
  return metric === "CLS" ? value.toFixed(3) : `${Math.round(value)} ms`;
}

/** The page needs a listing that exists, and hard-coding a seeded id would rot within the week. */
async function resolveListingId() {
  if (process.env.SBR_LISTING_ID) return process.env.SBR_LISTING_ID;
  const res = await fetch(`${API_BASE}/listings?page=1&pageSize=10`);
  if (!res.ok) throw new Error(`Could not list listings: HTTP ${res.status} from ${API_BASE}`);
  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  const live = rows.find(
    (l) => l.status === "LIVE" || (l.status === "VERIFIED" && l.isPublished === true),
  );
  if (!live) throw new Error(`No publicly visible listing at ${API_BASE}`);
  return live.id;
}

async function measureOnce(browser, url, profile) {
  // A fresh context every run, so run two is not measuring run one's cache.
  const context = await browser.newContext({ viewport: profile.viewport });
  const page = await context.newPage();
  await page.addInitScript(COLLECTOR);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: profile.network.latencyMs,
    downloadThroughput: (profile.network.downloadKbps * 1024) / 8,
    uploadThroughput: (profile.network.uploadKbps * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuThrottling });

  try {
    await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    await page.waitForLoadState("networkidle", { timeout: 90_000 }).catch(() => {});
    // LCP is only final once the page stops painting, so give the late images their chance.
    await page.waitForTimeout(2_000);

    return await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      const v = window.__vitals;
      return {
        LCP: v.lcp,
        CLS: v.cls,
        TBT: v.blocking,
        FCP: fcp ? fcp.startTime : 0,
        TTFB: nav ? nav.responseStart : 0,
        transferredKb: performance
          .getEntriesByType("resource")
          .reduce((sum, r) => sum + (r.transferSize || 0), nav?.transferSize || 0),
      };
    });
  } finally {
    await context.close();
  }
}

async function main() {
  const profile = PROFILES[PROFILE];
  if (!profile) throw new Error(`Unknown profile "${PROFILE}". Use mobile or desktop.`);

  const listingId = await resolveListingId();
  const url = `${WEB_BASE}/listings/${listingId}`;
  console.log(`Core Web Vitals — ${url}`);
  console.log(
    `profile=${PROFILE} runs=${RUNS} cpu=${profile.cpuThrottling}x ` +
      `net=${profile.network.downloadKbps}kbps/${profile.network.latencyMs}ms ` +
      `browser=${CHANNEL ?? "bundled chromium"}\n`,
  );

  const browser = await chromium.launch(CHANNEL ? { channel: CHANNEL } : {});
  const samples = [];
  try {
    for (let run = 1; run <= RUNS; run += 1) {
      const sample = await measureOnce(browser, url, profile);
      samples.push(sample);
      console.log(
        `  run ${run}/${RUNS}  LCP ${format("LCP", sample.LCP)}  CLS ${format("CLS", sample.CLS)}  ` +
          `TBT ${format("TBT", sample.TBT)}  FCP ${format("FCP", sample.FCP)}  ` +
          `TTFB ${format("TTFB", sample.TTFB)}`,
      );
    }
  } finally {
    await browser.close();
  }

  const summary = {};
  console.log("\n  metric   median          rating");
  for (const metric of ["LCP", "CLS", "TBT", "FCP", "TTFB"]) {
    const value = median(samples.map((s) => s[metric]));
    summary[metric] = value;
    console.log(`  ${metric.padEnd(7)}  ${format(metric, value).padEnd(14)}  ${rate(metric, value)}`);
  }
  const kb = median(samples.map((s) => s.transferredKb)) / 1024;
  console.log(`  bytes    ${kb.toFixed(0)} KB transferred (median)`);

  if (OUT) {
    writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          url,
          profile: PROFILE,
          browser: CHANNEL ?? "bundled chromium",
          runs: RUNS,
          samples,
          median: summary,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\n  written to ${OUT}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
