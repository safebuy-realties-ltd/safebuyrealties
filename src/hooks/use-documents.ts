import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, uploadDocument, type DocumentDto } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type { DocumentDto };

export function useListingDocumentsQuery(listingId: string | null) {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["documents", "listing", listingId],
    queryFn: () => apiRequest<DocumentDto[]>(`/documents/listing/${listingId}`),
    select: (envelope) => envelope.data,
    enabled: isReady && !!user && !!listingId,
  });
}

export function useUploadDocumentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { listingId: string; category: string; file: File }) =>
      uploadDocument(vars).then((envelope) => envelope.data),
    onSuccess: (_doc, vars) => {
      void qc.invalidateQueries({ queryKey: ["documents", "listing", vars.listingId] });
      void qc.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}
