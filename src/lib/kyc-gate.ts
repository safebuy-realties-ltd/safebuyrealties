import { isSafeInternalRedirect } from "@/lib/auth";

/**
 * What the browser does with a refusal from the KYC gate (E4-S2).
 *
 * The gate itself lives on the server, at `backend/src/kyc/kyc-gate.ts`, and that is the whole
 * point: hiding a button is a courtesy, and the endpoint refuses whether or not the button was
 * drawn. This file is the courtesy, done properly. A buyer who is stopped needs to know why, needs
 * one click to the screen that fixes it, and needs to land back where they were when it is fixed.
 */

/**
 * The code the API refuses a gated action with.
 *
 * The same string as `KYC_BLOCK_CODE` on the server, which is also what `PURCHASE_BLOCK.KYC_REQUIRED`
 * is set to, so a purchase refused before the request and a purchase refused by the endpoint arrive
 * here as the same code and the browser needs one branch rather than two.
 */
export const KYC_REQUIRED_CODE = "KYC_REQUIRED";

/** Where a blocked buyer goes to fix it. */
export const KYC_SCREEN_PATH = "/dashboard/buyer/kyc";

/**
 * Whether this is the gate talking.
 *
 * Structural rather than `instanceof ApiError` on purpose. Several component tests replace
 * `@/lib/api` with a stub, and the same refusal can arrive as a different class object depending on
 * which copy of the module built it. The `code` field is the contract the server sends; the class is
 * only how this bundle happens to carry it. Reading the message instead would be worse again, since
 * prose changes and a sentence that happens to contain the code is not a refusal.
 */
export function isKycRequiredError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === KYC_REQUIRED_CODE
  );
}

/**
 * The search params for the link to the KYC screen, with the way back in them.
 *
 * `isSafeInternalRedirect` is the same guard the login redirect uses, and it is here for the same
 * reason: this value ends up in a URL a buyer can be handed, so an unchecked one turns the KYC
 * screen into an open redirect off the site. An unsafe path is dropped rather than rejected, because
 * the buyer still needs to verify their identity either way and losing the way back is a smaller
 * failure than not offering the screen at all.
 */
export function kycGateSearch(returnTo?: string): { redirect: string | undefined } {
  return { redirect: isSafeInternalRedirect(returnTo) ? returnTo : undefined };
}
