import { createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

/**
 * Security headers applied to every SSR document and server route response.
 * - HSTS: force HTTPS for a year, including subdomains
 * - X-Frame-Options: prevent clickjacking
 * - X-Content-Type-Options: prevent MIME sniffing
 * - Referrer-Policy: avoid leaking full URLs cross-origin
 * - Permissions-Policy: lock down powerful APIs by default
 * - CSP: conservative policy that allows the app's own assets, Google Fonts,
 *   the Lovable badge/uploads CDN, and the API origin used at runtime.
 */
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const apiOrigin = (() => {
    try {
      return new URL(process.env.VITE_API_URL ?? "http://localhost:3001").origin;
    } catch {
      return "http://localhost:3001";
    }
  })();

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `connect-src 'self' ${apiOrigin} https:`,
    "script-src 'self' 'unsafe-inline'",
    "upgrade-insecure-requests",
  ].join("; ");

  setResponseHeader("Content-Security-Policy", csp);
  setResponseHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  setResponseHeader("X-Frame-Options", "DENY");
  setResponseHeader("X-Content-Type-Options", "nosniff");
  setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  setResponseHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );

  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
}));
