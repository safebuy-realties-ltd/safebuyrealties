import { loadPaystack } from "@alexasomba/paystack-inline";

export type PaystackSuccessResponse = {
  id: number;
  reference: string;
  message: string;
};

export type OpenCheckoutArgs = {
  accessCode: string;
  onSuccess: (transaction: PaystackSuccessResponse) => void;
  onCancel?: () => void;
  onError?: (error: { message: string }) => void;
};

/**
 * Resumes a server-initialized Paystack transaction in the inline popup.
 * Dynamically imported so the client-only library never runs during SSR.
 */
export async function openPaystackCheckout({
  accessCode,
  onSuccess,
  onCancel,
  onError,
}: OpenCheckoutArgs): Promise<void> {
  const PaystackPop = await loadPaystack();
  const popup = new PaystackPop();
  popup.resumeTransaction(accessCode, { onSuccess, onCancel, onError });
}
