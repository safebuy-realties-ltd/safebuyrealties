import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type ProfessionalProfileDto = {
  id: string;
  userId: string;
  regulatoryBody: string;
  licenseNumber: string;
  licenseExpiry: string | null;
  verifiedStatus: string;
  verifiedById: string | null;
  verifiedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PendingCredentialDto = ProfessionalProfileDto & {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    professionalType: string | null;
  };
};

export type UpdateMyProfileBody = {
  regulatoryBody: string;
  licenseNumber: string;
  licenseExpiry?: string;
};

const MY_PROFILE_KEY = ["professional-profile", "me"] as const;
const PENDING_KEY = ["professional-credentials", "pending"] as const;

export function useMyProfileQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: [...MY_PROFILE_KEY, user?.id ?? "anon"],
    queryFn: () => apiRequest<ProfessionalProfileDto | null>("/professionals/me/profile"),
    enabled: isReady && !!user,
    select: (envelope) => envelope.data,
  });
}

export function useUpdateMyProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMyProfileBody) =>
      apiRequest<ProfessionalProfileDto>("/professionals/me/profile", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MY_PROFILE_KEY });
    },
  });
}

export function usePendingCredentialsQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: PENDING_KEY,
    queryFn: () => apiRequest<PendingCredentialDto[]>("/professionals/credentials/pending"),
    enabled: isReady && !!user,
    select: (envelope) => envelope.data,
  });
}

export function useVerifyCredentialMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      approve,
      rejectionNote,
    }: {
      id: string;
      approve: boolean;
      rejectionNote?: string;
    }) =>
      apiRequest<ProfessionalProfileDto>(`/professionals/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ approve, rejectionNote }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PENDING_KEY });
    },
  });
}
