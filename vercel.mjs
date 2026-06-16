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
        rewrites: [
          {
            source: "/api/v1/:path*",
            destination: `${apiProxyTarget}/api/v1/:path*`,
          },
          {
            source: "/uploads/:path*",
            destination: `${apiProxyTarget}/uploads/:path*`,
          },
        ],
      }
    : {}),
};
