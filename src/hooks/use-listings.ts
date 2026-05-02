import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type ListingDto = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  location: string;
  price: string;
  currency: string;
  status: string;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export function useListingsQuery() {
  return useQuery({
    queryKey: ["listings"],
    queryFn: () => apiRequest<ListingDto[]>("/listings"),
    select: (envelope) => ({
      listings: envelope.data,
      meta: envelope.meta as { page: number; pageSize: number; total: number } | undefined,
    }),
  });
}
