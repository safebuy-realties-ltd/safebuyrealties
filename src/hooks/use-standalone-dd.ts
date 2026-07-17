import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type StandaloneDdPropertySummary = {
  kind: "LISTING" | "EXTERNAL";
  title: string;
  location: string;
  propertyId?: string | null;
} | null;

export type StandaloneDdListingSummary = {
  id: string;
  title: string;
  location: string;
  propertyId: string | null;
  currency: string;
} | null;

export type StandaloneExternalProperty = {
  id: string;
  address: string;
  state: string;
  lga?: string | null;
  propertyType?: string | null;
  approxSize?: string | null;
  titleRef?: string | null;
  sellerName?: string | null;
  sellerContact?: string | null;
  notes?: string | null;
} | null;

export type StandaloneDdReport = {
  key: string;
  url: string;
};

export type StandaloneDdOrderDto = {
  id: string;
  serviceRequestId?: string;
  serviceId: string;
  caseId: string;
  source: string;
  status: string;
  requestStatus?: string;
  fulfillmentStatus?: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  buyerId?: string | null;
  bundleId?: string | null;
  itemIds: string[];
  /** Human-readable schedule / catalog labels when available */
  services?: string[];
  subtotal: string;
  vatAmount: string;
  total: string;
  currency: string;
  listingId?: string | null;
  externalPropertyId?: string | null;
  transactionId?: string | null;
  transactionStatus?: string | null;
  paymentId?: string | null;
  paymentStatus?: string | null;
  paymentReference?: string | null;
  transactionPublicId?: string | null;
  verdict?: string | null;
  staffNotes?: string | null;
  completedAt?: string | null;
  reportStorageKeys?: string[];
  reports?: StandaloneDdReport[];
  property?: StandaloneDdPropertySummary;
  listing?: StandaloneDdListingSummary;
  externalProperty?: StandaloneExternalProperty;
  createdAt: string;
  updatedAt: string;
};

export type CreateStandaloneDdBody = {
  listingId?: string;
  externalProperty?: {
    address: string;
    state: string;
    lga?: string;
    propertyType?: string;
    approxSize?: string;
    titleRef?: string;
    sellerName?: string;
    sellerContact?: string;
    notes?: string;
  };
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  itemIds?: string[];
  bundleId?: string;
};

export type PayStandaloneDdBody = {
  callbackUrl: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type StandaloneDdPayInitResult = {
  paymentId: string;
  reference: string;
  authorizationUrl: string;
  transactionPublicId?: string | null;
};

const STANDALONE_DD_QUERY_KEY = ["standalone-dd", "orders"] as const;

export function useStandaloneDdOrderQuery(serviceId: string | null) {
  return useQuery({
    queryKey: ["standalone-dd", "order", serviceId],
    queryFn: () => apiRequest<StandaloneDdOrderDto>(`/standalone-dd/orders/${serviceId}`),
    select: (envelope) => envelope.data,
    enabled: !!serviceId,
  });
}

export function useStandaloneDdOrdersQuery(status?: string) {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: [...STANDALONE_DD_QUERY_KEY, status ?? "all", user?.id ?? "anon"],
    queryFn: () => {
      const search = status ? `?status=${encodeURIComponent(status)}` : "";
      return apiRequest<StandaloneDdOrderDto[]>(`/standalone-dd/orders${search}`);
    },
    select: (envelope) => envelope.data,
    enabled: isReady && !!user,
  });
}

export function useCreateStandaloneDdOrderMutation() {
  return useMutation({
    mutationFn: (body: CreateStandaloneDdBody) =>
      apiRequest<StandaloneDdOrderDto>("/standalone-dd/orders", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((envelope) => envelope.data),
  });
}

export function usePayStandaloneDdOrderMutation() {
  return useMutation({
    mutationFn: ({ serviceId, body }: { serviceId: string; body: PayStandaloneDdBody }) =>
      apiRequest<StandaloneDdPayInitResult>(`/standalone-dd/orders/${serviceId}/pay`, {
        method: "POST",
        body: JSON.stringify(body),
      }).then((envelope) => envelope.data),
  });
}

export function useVerifyStandaloneDdPaymentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, reference }: { serviceId: string; reference?: string }) =>
      apiRequest<StandaloneDdOrderDto>(`/standalone-dd/orders/${serviceId}/verify`, {
        method: "POST",
        body: JSON.stringify({ reference }),
      }).then((envelope) => envelope.data),
    onSuccess: (order) => {
      void qc.invalidateQueries({ queryKey: ["standalone-dd", "order", order.serviceId] });
      void qc.invalidateQueries({ queryKey: STANDALONE_DD_QUERY_KEY });
    },
  });
}

export function isStandaloneDdPaid(order: StandaloneDdOrderDto | null | undefined) {
  if (!order) return false;
  const paidStatuses = new Set(["PAID", "IN_PROGRESS", "COMPLETE"]);
  return (
    paidStatuses.has(order.status) ||
    order.requestStatus === "PAID" ||
    order.paymentStatus === "SUCCEEDED"
  );
}

export function useUpdateStandaloneDdOrderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { status?: "IN_PROGRESS" | "COMPLETE"; verdict?: string; staffNotes?: string };
    }) =>
      apiRequest<StandaloneDdOrderDto>(`/standalone-dd/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }).then((envelope) => envelope.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: STANDALONE_DD_QUERY_KEY });
    },
  });
}

export async function uploadStandaloneDdReport(orderId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/standalone-dd/orders/${orderId}/report`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const json = (await res.json()) as {
    data?: StandaloneDdOrderDto;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "Upload failed");
  }
  if (!json.data) throw new Error("Upload failed");
  return json.data;
}

export function useUploadStandaloneDdReportMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadStandaloneDdReport(id, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: STANDALONE_DD_QUERY_KEY });
    },
  });
}
