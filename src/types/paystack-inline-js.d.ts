declare module "@paystack/inline-js" {
  export interface PaystackTransaction {
    id: number;
    reference: string;
    message: string;
  }

  export interface PaystackCallbacks {
    onSuccess?: (transaction: PaystackTransaction) => void;
    onCancel?: () => void;
    onError?: (error: { message: string }) => void;
    onLoad?: (response: { id: number; accessCode: string; customer: object }) => void;
  }

  export interface NewTransactionOptions extends PaystackCallbacks {
    key: string;
    email: string;
    amount: number;
    reference?: string;
    currency?: string;
    metadata?: Record<string, unknown>;
  }

  export default class PaystackPop {
    isLoaded(): boolean;
    newTransaction(options: NewTransactionOptions): unknown;
    resumeTransaction(accessCode: string, callbacks?: PaystackCallbacks): unknown;
    cancelTransaction(idOrTransaction: number | object): unknown;
  }
}
