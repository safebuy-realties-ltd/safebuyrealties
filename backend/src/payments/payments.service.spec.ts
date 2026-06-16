import { Test, TestingModule } from "@nestjs/testing";
import { UserRole, PaymentStatus, TransactionStatus } from "@prisma/client";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EscrowService } from "../escrow/escrow.service";
import { PaystackService } from "./paystack.service";
import { GuestCheckoutService } from "../guest-checkout/guest-checkout.service";

const buyerActor = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};

describe("PaymentsService paystack integration", () => {
  let service: PaymentsService;
  let paystack: {
    isConfigured: jest.Mock;
    customerEmail: jest.Mock;
    initializeTransaction: jest.Mock;
  };

  beforeEach(async () => {
    paystack = {
      isConfigured: jest.fn().mockReturnValue(true),
      customerEmail: jest.fn().mockReturnValue("buyer+buyer-1@example.com"),
      initializeTransaction: jest.fn().mockResolvedValue({
        authorizationUrl: "https://checkout.paystack.com/x",
        accessCode: "code",
        reference: "ref_1",
      }),
    };

    const prisma = {
      payment: {
        create: jest.fn().mockResolvedValue({
          id: "pay-1",
          payerId: buyerActor.sub,
          status: PaymentStatus.PENDING,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      transaction: {
        findUnique: jest.fn().mockResolvedValue({
          id: "tx-1",
          buyerId: buyerActor.sub,
          status: TransactionStatus.INITIATED,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      listing: { findUnique: jest.fn() },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: buyerActor.sub,
          email: "buyer@safebuyrealties.test",
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { create: jest.fn(), createForStaff: jest.fn() } },
        { provide: EscrowService, useValue: { hold: jest.fn() } },
        { provide: PaystackService, useValue: paystack },
        { provide: GuestCheckoutService, useValue: { completePayment: jest.fn() } },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it("maps .test seed emails via PaystackService and initializes checkout", async () => {
    const result = await service.initiate(
      {
        amount: 5000,
        currency: "NGN",
        transactionId: "tx-1",
        callbackUrl: "http://localhost:8080/callback",
      },
      buyerActor,
    );

    expect(paystack.customerEmail).toHaveBeenCalledWith("buyer@safebuyrealties.test", "buyer-1");
    expect(paystack.initializeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "buyer+buyer-1@example.com",
        amountMinor: 500000,
        currency: "NGN",
      }),
    );
    expect(result.accessCode).toBe("code");
    expect(result.reference).toBe("ref_1");
  });
});
