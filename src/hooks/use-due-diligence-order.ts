import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type DueDiligenceOrderDto = {
  id: string;
  transactionId: string;
  buyerId: string;
  bundleId: string | null;
  itemIds: string[];
  subtotal: string;
  vatAmount: string;
  total: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export function useCreateDueDiligenceOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { transactionId: string; itemIds?: string[]; bundleId?: string }) =>
      apiRequest<DueDiligenceOrderDto>("/due-diligence-orders", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((envelope) => envelope.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
