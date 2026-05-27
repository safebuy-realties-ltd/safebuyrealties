import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type KycRecordDto = {
  id: string | null;
  userId: string;
  status: string;
  documentKeys: string[];
  reviewerId: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type KycDocumentLinkDto = {
  storageKey: string;
  url: string;
};

export type KycQueueItemDto = KycRecordDto & {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  documents: KycDocumentLinkDto[];
};

const MY_KYC_KEY = ["kyc", "me"] as const;
const KYC_QUEUE_KEY = ["kyc", "queue"] as const;

export function useMyKycQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: [...MY_KYC_KEY, user?.id ?? "anon"],
    queryFn: () => apiRequest<KycRecordDto>("/kyc/me"),
    enabled: isReady && !!user,
    select: (envelope) => envelope.data,
  });
}

export async function uploadKycDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/kyc/upload`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const json = (await res.json()) as {
    data?: { storageKey: string; url: string };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "Upload failed");
  }
  if (!json.data) throw new Error("Upload failed");
  return json.data;
}

export function useSubmitKycMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentKeys: string[]) =>
      apiRequest<KycRecordDto>("/kyc/submit", {
        method: "POST",
        body: JSON.stringify({ documentKeys }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MY_KYC_KEY });
      void qc.invalidateQueries({ queryKey: KYC_QUEUE_KEY });
    },
  });
}

export function useKycQueueQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: KYC_QUEUE_KEY,
    queryFn: () => apiRequest<KycQueueItemDto[]>("/kyc/queue"),
    enabled: isReady && !!user,
    select: (envelope) => envelope.data,
  });
}

export function useVerifyKycMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiRequest<KycRecordDto>(`/kyc/${userId}/verify`, { method: "PATCH" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KYC_QUEUE_KEY });
    },
  });
}

export function useRejectKycMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, note }: { userId: string; note: string }) =>
      apiRequest<KycRecordDto>(`/kyc/${userId}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KYC_QUEUE_KEY });
    },
  });
}
