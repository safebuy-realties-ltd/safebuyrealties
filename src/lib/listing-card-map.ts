import type { Listing } from "@/components/ListingCard";
import type { ListingDto } from "@/hooks/use-listings";

export const LISTING_CARD_PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80";

function formatNgn(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

export function listingDtoToCard(listing: ListingDto): Listing {
  return {
    id: listing.id,
    title: listing.title,
    location: listing.location,
    price: formatNgn(listing.price),
    beds: listing.beds ?? 0,
    baths: listing.baths ?? 0,
    area: listing.landAreaSqm ? `${listing.landAreaSqm} m²` : "—",
    status: listing.status,
    image: LISTING_CARD_PLACEHOLDER_IMG,
  };
}
