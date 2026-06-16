import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type GuestCheckoutOrderLine = {
  code: string;
  name: string;
  price: string;
};

export type GuestCheckoutOrderDto = {
  serviceId: string;
  caseId: string;
  buyerId?: string | null;
  transactionId?: string | null;
  transactionNumber?: string | null;
  listingId: string;
  listingTitle?: string;
  listingLocation?: string;
  propertyId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  itemIds: string[];
  includeInspection: boolean;
  services: GuestCheckoutOrderLine[];
  subtotal: string;
  vatAmount: string;
  total: string;
  status: string;
  paidAt?: string | null;
  createdAt?: string;
};

export type CreateGuestOrderBody = {
  listingId: string;
  itemIds: string[];
  includeInspection: boolean;
};

export type PayGuestOrderBody = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  callbackUrl?: string;
};

export type GuestPayInitResult = {
  paymentId: string;
  reference: string;
  authorizationUrl: string;
  accessCode?: string | null;
};

export function useGuestCheckoutOrderQuery(serviceId: string | null) {
  return useQuery({
    queryKey: ["guest-checkout", "order", serviceId],
    queryFn: () => apiRequest<GuestCheckoutOrderDto>(`/guest-checkout/orders/${serviceId}`),
    select: (envelope) => envelope.data,
    enabled: !!serviceId,
  });
}

export function useCreateGuestOrderMutation() {
  return useMutation({
    mutationFn: (body: CreateGuestOrderBody) =>
      apiRequest<GuestCheckoutOrderDto>("/guest-checkout/orders", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((envelope) => envelope.data),
  });
}

export function usePayGuestOrderMutation() {
  return useMutation({
    mutationFn: ({ serviceId, body }: { serviceId: string; body: PayGuestOrderBody }) =>
      apiRequest<GuestPayInitResult>(`/guest-checkout/orders/${serviceId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          name: body.guestName,
          email: body.guestEmail,
          phone: body.guestPhone,
          callbackUrl: body.callbackUrl,
        }),
      }).then((envelope) => envelope.data),
  });
}

export type ActivationTokenDto = {
  name: string;
  email: string;
  phone: string;
  buyerId: string;
};

export function useActivationTokenQuery(token: string) {
  return useQuery({
    queryKey: ["auth", "activate", token],
    queryFn: () => apiRequest<ActivationTokenDto>(`/auth/activate/${token}`),
    select: (envelope) => envelope.data,
    enabled: !!token,
    retry: false,
  });
}

export function useActivateAccountMutation() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      apiRequest<{ message: string }>("/auth/activate", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((envelope) => envelope.data),
  });
}
