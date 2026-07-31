/**
 * The only listing document categories whose *bytes* are public.
 *
 * Every category a seller uploads — title deeds, survey plans, building approvals, tax receipts,
 * hero images, gallery photos — goes through one code path and lands under the same
 * `listings/<listingId>/` storage prefix (documents.service.ts createFromUpload). The category is
 * recorded on the Document row and never in the key, so the prefix says nothing about whether a
 * file may be served and the category is the only authorization boundary the stored data carries.
 *
 * One list, and since E3-S1d-3 exactly one importer that decides anything:
 * `private-document-authorizer.ts`, the only thing left that decides whether bytes leave the
 * building. It previously had two — the serializer that withheld storage keys and the gate in front
 * of the static mount — and both are gone because neither decision exists any more. Keep it at one.
 * Two copies drifting apart is how E3-S1 reopens, and the reason the list was extracted in the
 * first place. `private-document.controller.spec.ts` imports it as well, to check its own
 * every-category walk against this list rather than against a second hand-written copy; that is the
 * opposite of a drifting copy and the only other import that belongs here.
 *
 * Note this is narrower than documents.service.ts's PUBLIC_DOCUMENT_CATEGORIES, which is about
 * document *names* shown on a public listing page. That list includes survey plans and
 * certificates of occupancy: their existence is advertised publicly, their contents are not.
 */
export const PUBLIC_LISTING_ASSET_CATEGORIES = ["listing_hero", "listing_gallery"] as const;

export function isPublicListingAssetCategory(category: string): boolean {
  return (PUBLIC_LISTING_ASSET_CATEGORIES as readonly string[]).includes(category);
}
