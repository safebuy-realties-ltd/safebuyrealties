import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { PoaConsentFlags } from "@/lib/poa-instrument";

export type PowerOfAttorneyDto = {
  id: string;
  transactionId: string;
  buyerId: string;
  listingId: string;
  pdfStorageKey: string;
  documentHash: string;
  qrCodeStorageKey: string;
  signatureMethod: "DRAWN" | "TYPED";
  signatureName: string;
  consentFlags: PoaConsentFlags;
  executedAt: string;
};

export type PoaVerifyDto = {
  verified: true;
  documentHash: string;
  buyerName: string;
  listingTitle: string;
  listingAddress: string;
  executedAt: string;
  signatureMethod: string;
};

export function useExecutePoaMutation() {
  return useMutation({
    mutationFn: (body: {
      transactionId: string;
      signatureMethod: "DRAWN" | "TYPED";
      signatureName: string;
      consentFlags: PoaConsentFlags;
    }) =>
      apiRequest<PowerOfAttorneyDto>("/poa/execute", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((envelope) => envelope.data),
  });
}

export function useVerifyPoaQuery(hash: string | null) {
  return useQuery({
    queryKey: ["poa", "verify", hash],
    queryFn: () =>
      apiRequest<PoaVerifyDto>(`/poa/verify?hash=${encodeURIComponent(hash ?? "")}`).then(
        (envelope) => envelope.data,
      ),
    enabled: !!hash && /^[a-f0-9]{64}$/i.test(hash),
    retry: false,
  });
}
