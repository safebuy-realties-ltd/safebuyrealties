import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSaveListingMutation,
  useUnsaveListingMutation,
  useSavedListingsQuery,
} from "@/hooks/use-saved-listings";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

export function ListingSaveButton({ listingId }: { listingId: string }) {
  const { data } = useSavedListingsQuery(1, 100);
  const isSaved = data?.savedIds?.includes(listingId) ?? false;
  const save = useSaveListingMutation();
  const unsave = useUnsaveListingMutation();
  const pending = save.isPending || unsave.isPending;

  const toggle = () => {
    const mutation = isSaved ? unsave : save;
    mutation.mutate(listingId, {
      onSuccess: () => toast.success(isSaved ? "Removed from saved" : "Saved to your list"),
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.message : "Could not update saved list"),
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      disabled={pending}
      onClick={toggle}
      aria-label={isSaved ? "Unsave listing" : "Save listing"}
    >
      <Heart className={`h-4 w-4 ${isSaved ? "fill-primary text-primary" : ""}`} />
    </Button>
  );
}
