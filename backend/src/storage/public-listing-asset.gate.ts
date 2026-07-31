import type { RequestHandler } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { PUBLIC_LISTING_ASSET_CATEGORIES } from "../documents/document-categories";
import { isPubliclyVisible } from "../listings/listings-public.helper";

/**
 * E3-S1b. Stands in front of the `/uploads` static mount and lets through only the files that are
 * genuinely public: a listing hero or gallery image belonging to a publicly visible listing.
 *
 * The mount used to serve the whole upload root to anyone (E3-S1a, uploads-exposure.spec.ts).
 * Narrowing it by path prefix does not work — `listings/<id>/` holds title deeds and survey plans
 * next to the photos — so the gate resolves the requested key back to its Document row and
 * decides on the category, which is where the truth actually lives.
 *
 * Anything else is 404, not 403: a key with no public Document row should not be distinguishable
 * from a key that does not exist. That covers every private listing document and every key under
 * `kyc/`, `professionals/`, `poa/` and `due-diligence/`, none of which have a Document row at all.
 *
 * This closes the exposure; it does not give the private documents an authorized path. That is
 * still E3-S1's job, and probe one of uploads-exposure.spec.ts stays red until it lands.
 */

/**
 * The request path under the mount (`/listings/abc/1_photo.jpg`) back to the storage key as
 * documents.service.ts wrote it (`listings/abc/1_photo.jpg`).
 *
 * Returns null for anything that cannot be a stored key. Traversal cannot reach a file here in
 * any case — the lookup is an exact string match against a stored key, and no stored key contains
 * a `..` segment — but rejecting it early keeps the DB out of it.
 */
export function storageKeyFromRequestPath(requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes("\0")) return null;

  const key = decoded.replace(/^\/+/, "");
  if (!key) return null;
  if (key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  return key;
}

export function createPublicListingAssetGate(prisma: PrismaService): RequestHandler {
  return (req, res, next) => {
    const storageKey = storageKeyFromRequestPath(req.path);
    if (!storageKey) {
      res.status(404).end();
      return;
    }

    void prisma.document
      .findFirst({
        where: {
          storageKey,
          category: { in: [...PUBLIC_LISTING_ASSET_CATEGORIES] },
        },
        select: { listing: { select: { status: true, isPublished: true } } },
      })
      .then((doc) => {
        if (!doc || !isPubliclyVisible(doc.listing)) {
          res.status(404).end();
          return;
        }
        next();
      })
      .catch(() => {
        // A gate that cannot reach the database cannot authorize, so it serves nothing.
        res.status(404).end();
      });
  };
}
