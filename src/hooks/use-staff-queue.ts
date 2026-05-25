import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ListingDto } from "@/hooks/use-listings";
import type { VerificationStepDto } from "@/hooks/use-verification";

export type StaffQueueFilter = "pending" | "in_progress" | "completed" | "rejected";

type StaffQueueItem = {
  listing: ListingDto;
  steps: VerificationStepDto[];
};

export type StaffTableRowViewModel = {
  id: string;
  listingId: string;
  title: string;
  seller: string;
  location: string;
  backendStatus: string;
  status: string;
  queueStatus: StaffQueueFilter;
};

export type StaffCardViewModel = {
  id: string;
  listingId: string;
  title: string;
  subtitle: string;
  backendStatus: string;
  queueStatus: StaffQueueFilter;
};

function normalizeQueueStatus(listing: ListingDto, steps: VerificationStepDto[]): StaffQueueFilter {
  if (listing.status === "REJECTED") return "rejected";
  if (listing.status === "VERIFIED" || listing.status === "LIVE") return "completed";

  const hasInProgressStep = steps.some((s) => s.status === "IN_PROGRESS");
  if (listing.status === "ASSIGNED" || listing.status === "IN_VERIFICATION" || hasInProgressStep) {
    return "in_progress";
  }

  return "pending";
}

export function useStaffQueueQuery(filter: StaffQueueFilter | "all" = "all") {
  const { user, isReady } = useAuth();

  return useQuery({
    queryKey: ["staff", "queue", user?.id ?? "anon"],
    enabled: isReady && !!user,
    queryFn: async () => {
      const listingsEnv = await apiRequest<ListingDto[]>("/listings?page=1&pageSize=100");
      const listings = listingsEnv.data;

      const pipelineListings = listings.filter((l) =>
        ["PENDING_REVIEW", "ASSIGNED", "IN_VERIFICATION", "VERIFIED", "REJECTED", "LIVE"].includes(
          l.status,
        ),
      );

      const withSteps: StaffQueueItem[] = await Promise.all(
        pipelineListings.map(async (listing) => {
          const stepsEnv = await apiRequest<VerificationStepDto[]>(
            `/verification/listing/${listing.id}`,
          );
          return { listing, steps: stepsEnv.data };
        }),
      );

      const counts = withSteps.reduce(
        (acc, item) => {
          const key = normalizeQueueStatus(item.listing, item.steps);
          acc[key] += 1;
          return acc;
        },
        { pending: 0, in_progress: 0, completed: 0, rejected: 0 } as Record<
          StaffQueueFilter,
          number
        >,
      );

      const filtered =
        filter === "all"
          ? withSteps
          : withSteps.filter((i) => normalizeQueueStatus(i.listing, i.steps) === filter);

      const tableRows: StaffTableRowViewModel[] = filtered.map((item) => ({
        id: item.listing.id,
        listingId: item.listing.id,
        title: item.listing.title,
        seller: item.listing.sellerName ?? item.listing.sellerId,
        location: item.listing.location,
        backendStatus: item.listing.status,
        status: item.listing.status,
        queueStatus: normalizeQueueStatus(item.listing, item.steps),
      }));

      const cards: StaffCardViewModel[] = filtered.map((item) => ({
        id: item.listing.id,
        listingId: item.listing.id,
        title: item.listing.title,
        subtitle: item.listing.location,
        backendStatus: item.listing.status,
        queueStatus: normalizeQueueStatus(item.listing, item.steps),
      }));

      return { tableRows, cards, counts };
    },
  });
}
