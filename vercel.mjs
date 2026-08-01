/**
 * Vercel deployment config. API proxy target comes from the platform env var
 * API_PROXY_TARGET (set in Vercel Project → Settings → Environment Variables).
 * Do not commit the Render hostname here.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/$/, "") ?? "";

if (process.env.VERCEL === "1" && !apiProxyTarget) {
  throw new Error(
    "API_PROXY_TARGET is required on Vercel (e.g. https://your-service.onrender.com). " +
      "Set it in Project Settings → Environment Variables for Production and Preview.",
  );
}

/** @type {import('vercel').VercelConfig} */
export const config = {
  ignoreCommand: "node scripts/vercel-ignore-frontend.mjs",
  ...(apiProxyTarget
    ? {
        // `/uploads/:path*` used to be rewritten here too. E3-S1d-3 deleted the static mount it
        // pointed at; documents are served by `/api/v1/documents/file`, which the rewrite above
        // already covers. Leaving the rewrite in place would have forwarded a public path to an
        // API that no longer answers on it.
        rewrites: [
          {
            source: "/api/v1/:path*",
            destination: `${apiProxyTarget}/api/v1/:path*`,
          },
        ],
      }
    : {}),
};
