import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type VerificationStepDto = {
  id: string;
  listingId: string;
  type: string;
  label: string;
  status: string;
  assignedProfessionalId: string | null;
  notes: string | null;
  completedAt: string | null;
  order: number;
  riskFlags: string[];
};

export type VerificationActivityDto = {
  id: string;
  listingId: string;
  stepId: string | null;
  action: string;
  actorId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export function useVerificationListingQuery(listingId: string, enabled = true) {
  return useQuery({
    queryKey: ["verification", "listing", listingId],
    queryFn: async () => {
      const env = await apiRequest<VerificationStepDto[]>(`/verification/listing/${listingId}`);
      return env.data;
    },
    enabled: enabled && !!listingId,
  });
}

export function useAssignVerificationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { listingId: string; professionalId: string; stepType: string }) =>
      apiRequest<VerificationStepDto>("/verification/assign", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_env, vars) => {
      void qc.invalidateQueries({ queryKey: ["verification", "listing", vars.listingId] });
      void qc.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}

export function usePatchVerificationStepMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      stepId: string;
      listingId: string;
      body: { status?: string; notes?: string; riskFlags?: string[] };
    }) =>
      apiRequest<VerificationStepDto>(`/verification/steps/${args.stepId}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: (_env, vars) => {
      void qc.invalidateQueries({ queryKey: ["verification", "listing", vars.listingId] });
      void qc.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}

export function useVerificationActivityQuery(listingId: string, enabled = true) {
  return useQuery({
    queryKey: ["verification", "activity", listingId],
    queryFn: async () => {
      const env = await apiRequest<VerificationActivityDto[]>(`/verification/listing/${listingId}/activity`);
      return env.data;
    },
    enabled: enabled && !!listingId,
  });
}
