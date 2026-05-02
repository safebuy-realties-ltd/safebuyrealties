import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type InitiatePaymentResult = {
  paymentId: string;
  authorizationUrl: string;
  reference: string;
  accessCode: string | null;
};

export function useInitiatePaymentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      amount: number;
      currency?: string;
      listingId?: string;
      transactionId?: string;
      callbackUrl: string;
    }) =>
      apiRequest<InitiatePaymentResult>("/payments/initiate", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}
