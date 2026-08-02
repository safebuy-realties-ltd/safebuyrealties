import { createMiddleware, createStart } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { robotsTagFor } from "@/lib/seo";

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
    const raw =
      process.env.VITE_API_URL ??
      (process.env.NODE_ENV === "production" ? "/api/v1" : "http://localhost:3001/api/v1");
    if (raw.startsWith("/")) return "";
    try {
      return new URL(raw).origin;
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
    "font-src 'self' data: https://fonts.gstatic.com https://checkout.paystack.com https://standard.paystack.co",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://checkout.paystack.com https://js.paystack.co https://standard.paystack.co",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""} https://api.paystack.co https://checkout.paystack.com https://standard.paystack.co https:`,
    "script-src 'self' 'unsafe-inline' https://js.paystack.co https://checkout.paystack.com https://standard.paystack.co",
    "frame-src 'self' https://checkout.paystack.com https://js.paystack.co https://standard.paystack.co https://*.paystack.com https://*.paystack.co",
    "upgrade-insecure-requests",
  ].join("; ");

  setResponseHeader("Content-Security-Policy", csp);
  setResponseHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  setResponseHeader("X-Frame-Options", "DENY");
  setResponseHeader("X-Content-Type-Options", "nosniff");
  setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  setResponseHeader(
    "Permissions-Policy",
    'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.paystack.com" "https://js.paystack.co" "https://standard.paystack.co")',
  );

  // E8-S4 criterion 5. The meta tag in the document says the same thing, and this says it for the
  // responses that are not a document: a JSON payload, a redirect, a file the API streamed back.
  const robotsTag = robotsTagFor(new URL(getRequest().url).pathname);
  if (robotsTag) setResponseHeader("X-Robots-Tag", robotsTag);

  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
}));
