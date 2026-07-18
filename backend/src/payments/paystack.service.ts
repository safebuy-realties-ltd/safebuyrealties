import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { assertOk, createPaystack, Webhooks, type Paystack } from "@alexasomba/paystack-node";

export type PaystackInitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

@Injectable()
export class PaystackService {
  private client: Paystack | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * True when a secret key is configured (live Paystack, not mock mode).
   * Set PAYSTACK_FORCE_MOCK=true to force the local/demo callback path even when keys exist.
   */
  isConfigured(): boolean {
    const forceMock = this.config.get<string>("PAYSTACK_FORCE_MOCK")?.trim().toLowerCase();
    if (forceMock === "true" || forceMock === "1" || forceMock === "yes") {
      return false;
    }
    return Boolean(this.secretKey());
  }

  publicKey(): string | undefined {
    const primary = this.config.get<string>("PAYSTACK_PUBLIC_KEY")?.trim();
    if (primary) return primary;
    return this.config.get<string>("PAYSTACK_TEST_PUBLIC_KEY")?.trim() || undefined;
  }

  secretKey(): string | undefined {
    const primary = this.config.get<string>("PAYSTACK_SECRET_KEY")?.trim();
    if (primary) return primary;
    return this.config.get<string>("PAYSTACK_TEST_SECRET_KEY")?.trim() || undefined;
  }

  private getClient(): Paystack {
    const secret = this.secretKey();
    if (!secret) {
      throw new Error("Paystack secret key is not configured");
    }
    if (!this.client) {
      this.client = createPaystack({
        secretKey: secret,
        idempotencyKey: "auto",
      });
    }
    return this.client;
  }

  /** Paystack rejects `.test` seed emails — use a valid-format address for initialize only. */
  customerEmail(email: string, userId: string): string {
    const trimmed = email.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !trimmed.endsWith(".test")) {
      return trimmed;
    }
    const local = trimmed.split("@")[0]?.replace(/[^a-zA-Z0-9._+-]/g, "") || "buyer";
    return `${local}+${userId.slice(0, 8)}@example.com`;
  }

  async initializeTransaction(args: {
    email: string;
    amountMinor: number;
    currency: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackInitializeResult> {
    const paystack = this.getClient();
    const result = await paystack.transaction.initialize({
      body: {
        email: args.email,
        amount: args.amountMinor,
        currency: args.currency as "NGN",
        callback_url: args.callbackUrl,
        metadata: args.metadata as object,
      },
    });
    const data = assertOk(result) as {
      authorization_url: string;
      access_code: string;
      reference: string;
    };
    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  async verifyTransaction(reference: string): Promise<string | undefined> {
    const paystack = this.getClient();
    const result = await paystack.transaction.verify(reference);
    const data = assertOk(result) as { status?: string };
    return data.status;
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    const secret = this.secretKey();
    if (!secret || !signature) return false;
    return Webhooks.verifySignature(rawBody.toString("utf8"), signature, secret);
  }

  /**
   * Creates a transfer to a Nigerian bank account (test or live).
   * Uses PAYSTACK_PAYOUT_BANK_CODE + PAYSTACK_PAYOUT_ACCOUNT_NUMBER when set,
   * otherwise Paystack's documented Zenith test account (057 / 0000000000).
   */
  async createTransfer(args: {
    amountMinor: number;
    recipientName: string;
    reason: string;
    reference?: string;
  }): Promise<{ transferCode: string; reference: string; status: string }> {
    const paystack = this.getClient();
    const bankCode =
      this.config.get<string>("PAYSTACK_PAYOUT_BANK_CODE")?.trim() || "057";
    const accountNumber =
      this.config.get<string>("PAYSTACK_PAYOUT_ACCOUNT_NUMBER")?.trim() || "0000000000";

    const recipientResult = await paystack.transferrecipient.create({
      body: {
        type: "nuban",
        name: args.recipientName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      },
    });
    const recipient = assertOk(recipientResult) as { recipient_code: string };

    const transferResult = await paystack.transfer.initiate({
      body: {
        source: "balance",
        amount: args.amountMinor,
        recipient: recipient.recipient_code,
        reason: args.reason,
        currency: "NGN",
        reference: args.reference ?? `sbr_xfer_${Date.now()}`,
      },
    });
    const transfer = assertOk(transferResult) as {
      transfer_code: string;
      reference: string;
      status: string;
    };
    return {
      transferCode: transfer.transfer_code,
      reference: transfer.reference,
      status: transfer.status,
    };
  }
}
