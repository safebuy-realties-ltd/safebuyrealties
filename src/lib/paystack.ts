import type { PaystackTransaction } from "@paystack/inline-js";

export type OpenCheckoutArgs = {
  accessCode: string;
  onSuccess: (transaction: PaystackTransaction) => void;
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
  const { default: PaystackPop } = await import("@paystack/inline-js");
  const popup = new PaystackPop();
  popup.resumeTransaction(accessCode, { onSuccess, onCancel, onError });
}
