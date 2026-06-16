import { ListingStatus, Prisma } from "@prisma/client";

export type ListingVisibilityFields = {
  status: ListingStatus;
  isPublished: boolean;
};

export function isPubliclyVisible(listing: ListingVisibilityFields): boolean {
  return (
    listing.status === ListingStatus.LIVE ||
    (listing.status === ListingStatus.VERIFIED && listing.isPublished === true)
  );
}

export function publiclyVisibleWhere(): Prisma.ListingWhereInput {
  return {
    OR: [
      { status: ListingStatus.LIVE },
      { status: ListingStatus.VERIFIED, isPublished: true },
    ],
  };
}
