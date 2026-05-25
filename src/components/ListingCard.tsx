import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { BedDouble, Bath, Maximize, ShieldCheck } from "lucide-react";
import { statusBadgeClass, statusIsPublic, statusLabel } from "@/lib/listing-status";

export type Listing = {
  id: string;
  title: string;
  location: string;
  price: string;
  beds: number;
  baths: number;
  area: string;
  /** @deprecated Prefer `status`; kept for sample data */
  verified?: boolean;
  status?: string;
  image: string;
};

export function ListingCard({ listing }: { listing: Listing }) {
  const status = listing.status;
  const showVerified =
    status != null ? statusIsPublic(status) : (listing.verified ?? false);

  return (
    <Link
      to="/listings/$listingId"
      params={{ listingId: listing.id }}
      className="group block overflow-hidden rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elegant)] hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={listing.image}
          alt={listing.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {showVerified && (
          <Badge className="absolute left-3 top-3 gap-1 bg-background/95 text-primary border-0 shadow-sm">
            <ShieldCheck className="h-3 w-3" /> Verified
          </Badge>
        )}
        {status && !statusIsPublic(status) && (
          <Badge
            variant="outline"
            className={`absolute right-3 top-3 ${statusBadgeClass(status)}`}
          >
            {statusLabel(status)}
          </Badge>
        )}
      </div>
      <div className="p-5">
        <p className="text-xs text-muted-foreground">{listing.location}</p>
        <h3 className="mt-1 truncate text-base font-semibold text-foreground">{listing.title}</h3>
        <p className="mt-2 text-lg font-semibold text-primary">{listing.price}</p>
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{listing.beds}</span>
          <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{listing.baths}</span>
          <span className="flex items-center gap-1"><Maximize className="h-3.5 w-3.5" />{listing.area}</span>
        </div>
      </div>
    </Link>
  );
}

export const sampleListings: Listing[] = [
  {
    id: "1",
    title: "Garden Court Residence",
    location: "Lekki, Lagos",
    price: "$420,000",
    beds: 4, baths: 3, area: "320 m²",
    verified: true,
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
  },
  {
    id: "2",
    title: "Maple Heights Apartment",
    location: "Abuja Central",
    price: "$185,000",
    beds: 2, baths: 2, area: "120 m²",
    verified: true,
    image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
  },
  {
    id: "3",
    title: "Cedar Park Villa",
    location: "Ikoyi, Lagos",
    price: "$760,000",
    beds: 5, baths: 4, area: "480 m²",
    verified: true,
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80",
  },
  {
    id: "4",
    title: "Riverside Townhouse",
    location: "Port Harcourt",
    price: "$295,000",
    beds: 3, baths: 2, area: "210 m²",
    verified: false,
    image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80",
  },
  {
    id: "5",
    title: "Sunset Bay Condo",
    location: "Victoria Island",
    price: "$510,000",
    beds: 3, baths: 3, area: "240 m²",
    verified: true,
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
  },
  {
    id: "6",
    title: "Acacia Hills Estate",
    location: "Ibadan",
    price: "$210,000",
    beds: 4, baths: 3, area: "280 m²",
    verified: false,
    image: "https://images.unsplash.com/photo-1605276373954-0c4a0dac5b12?w=800&q=80",
  },
];
