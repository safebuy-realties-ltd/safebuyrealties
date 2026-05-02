import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRole, PaymentStatus, ListingStatus, TransactionStatus, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { InitiatePaymentDto } from "./dto/initiate-payment.dto";

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private isStaff(role: UserRole) {
    return role === UserRole.STAFF || role === UserRole.ADMIN;
  }

  private serializePayment(p: {
    id: string;
    listingId: string | null;
    transactionId: string | null;
    payerId: string;
    amount: Prisma.Decimal;
    currency: string;
    provider: string;
    providerReference: string | null;
    status: PaymentStatus;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      listingId: p.listingId,
      transactionId: p.transactionId,
      payerId: p.payerId,
      amount: p.amount.toString(),
      currency: p.currency,
      provider: p.provider,
      providerReference: p.providerReference,
      status: p.status,
      metadata: p.metadata,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  async initiate(dto: InitiatePaymentDto, actor: JwtPayload) {
    if (actor.role !== UserRole.BUYER && !this.isStaff(actor.role)) {
      throw new ForbiddenException("Only buyers can initiate payments");
    }
    if (!dto.listingId && !dto.transactionId) {
      throw new BadRequestException("Provide listingId or transactionId");
    }
    if (dto.listingId) {
      const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
      if (!listing) throw new NotFoundException("Listing not found");
      if (listing.status !== ListingStatus.LIVE && !this.isStaff(actor.role)) {
        throw new BadRequestException("Payments are only allowed for live listings");
      }
    }
    if (dto.transactionId) {
      const tx = await this.prisma.transaction.findUnique({ where: { id: dto.transactionId } });
      if (!tx) throw new NotFoundException("Transaction not found");
      if (tx.buyerId !== actor.sub && !this.isStaff(actor.role)) {
        throw new ForbiddenException();
      }
      if (tx.status === TransactionStatus.COMPLETED) {
        throw new BadRequestException("This transaction is already completed");
      }
    }

    const currency = dto.currency ?? "NGN";
    const payment = await this.prisma.payment.create({
      data: {
        payerId: actor.sub,
        amount: dto.amount,
        currency,
        listingId: dto.listingId ?? null,
        transactionId: dto.transactionId ?? null,
        status: PaymentStatus.PENDING,
        provider: "paystack",
        metadata: { callbackUrl: dto.callbackUrl } as object,
      },
    });

    if (dto.transactionId) {
      await this.prisma.transaction.updateMany({
        where: {
          id: dto.transactionId,
          status: TransactionStatus.INITIATED,
          ...(this.isStaff(actor.role) ? {} : { buyerId: actor.sub }),
        },
        data: { status: TransactionStatus.IN_PROGRESS },
      });
    }

    const payer = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.sub } });
    const secret = this.config.get<string>("PAYSTACK_SECRET_KEY");
    const amountMinor = Math.round(Number(dto.amount) * 100);

    if (!secret) {
      const mockRef = `mock_${payment.id}`;
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerReference: mockRef, status: PaymentStatus.PROCESSING },
      });
      await this.applyPaymentChargeSuccess(payment.id);
      return {
        paymentId: payment.id,
        authorizationUrl: `${dto.callbackUrl}?mock=1&ref=${mockRef}&paymentId=${payment.id}`,
        reference: mockRef,
        accessCode: null as string | null,
      };
    }

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: payer.email,
        amount: amountMinor,
        currency,
        callback_url: dto.callbackUrl,
        metadata: { paymentId: payment.id },
      }),
    });
    const json = (await res.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };
    if (!res.ok || !json.status || !json.data?.reference) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, metadata: { error: json.message } as object },
      });
      throw new BadRequestException(json.message || "Paystack initialize failed");
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerReference: json.data.reference,
        status: PaymentStatus.PROCESSING,
        metadata: {
          callbackUrl: dto.callbackUrl,
          authorizationUrl: json.data.authorization_url,
        } as object,
      },
    });

    return {
      paymentId: payment.id,
      authorizationUrl: json.data.authorization_url,
      reference: json.data.reference,
      accessCode: json.data.access_code,
    };
  }

  /** Marks payment succeeded and completes linked transaction (same as Paystack charge.success). */
  private async applyPaymentChargeSuccess(paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: p.id },
        data: { status: PaymentStatus.SUCCEEDED },
      });
      if (p.transactionId) {
        await tx.transaction.updateMany({
          where: {
            id: p.transactionId,
            status: { in: [TransactionStatus.INITIATED, TransactionStatus.IN_PROGRESS] },
          },
          data: { status: TransactionStatus.COMPLETED },
        });
      }
    });
  }

  async findOne(id: string, actor: JwtPayload) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Payment not found");
    if (p.payerId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    return this.serializePayment(p);
  }

  verifyPaystackSignature(rawBody: Buffer, signature: string | undefined): boolean {
    const secret = this.config.get<string>("PAYSTACK_SECRET_KEY");
    if (!secret || !signature) return false;
    const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async handlePaystackWebhook(payload: {
    event?: string;
    data?: { reference?: string; status?: string };
  }) {
    const ref = payload.data?.reference;
    if (!ref) return { received: true };
    const payment = await this.prisma.payment.findFirst({
      where: { providerReference: ref },
    });
    if (!payment) return { received: true };

    const success =
      payload.event === "charge.success" && payload.data?.status === "success";
    const failed = payload.event === "charge.failed" || payload.data?.status === "failed";

    if (success) {
      await this.applyPaymentChargeSuccess(payment.id);
    } else if (failed) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
    }
    return { received: true };
  }
}
