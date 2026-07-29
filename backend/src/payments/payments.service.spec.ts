import { Test, TestingModule } from "@nestjs/testing";
import { UserRole, PaymentStatus, PaymentIntent, Prisma, TransactionStatus } from "@prisma/client";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EscrowService } from "../escrow/escrow.service";
import { PaystackService } from "./paystack.service";
import { GuestCheckoutService } from "../guest-checkout/guest-checkout.service";
import { StandaloneDdService } from "../standalone-dd/standalone-dd.service";

const buyerActor = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};

describe("PaymentsService paystack integration", () => {
  let service: PaymentsService;
  let prisma: {
    payment: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    [key: string]: unknown;
  };
  let paystack: {
    isConfigured: jest.Mock;
    publicKey: jest.Mock;
    customerEmail: jest.Mock;
    initializeTransaction: jest.Mock;
  };

  beforeEach(async () => {
    paystack = {
      isConfigured: jest.fn().mockReturnValue(true),
      publicKey: jest.fn().mockReturnValue("pk_test_public"),
      customerEmail: jest.fn().mockReturnValue("buyer+buyer-1@example.com"),
      initializeTransaction: jest.fn().mockResolvedValue({
        authorizationUrl: "https://checkout.paystack.com/x",
        accessCode: "code",
        reference: "ref_1",
      }),
    };

    prisma = {
      payment: {
        create: jest.fn().mockResolvedValue({
          id: "pay-1",
          payerId: buyerActor.sub,
          status: PaymentStatus.PENDING,
        }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
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
        { provide: StandaloneDdService, useValue: { completePayment: jest.fn() } },
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

  describe("payments are identifiable as mock", () => {
    function storedPayment(providerReference: string | null) {
      return {
        id: "pay-1",
        listingId: null,
        transactionId: "tx-1",
        payerId: buyerActor.sub,
        amount: new Prisma.Decimal("5000"),
        currency: "NGN",
        provider: "paystack",
        providerReference,
        status: PaymentStatus.SUCCEEDED,
        intent: PaymentIntent.DD_SERVICE,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    it("flags a payment settled by mock mode", async () => {
      prisma.payment.findUnique.mockResolvedValue(storedPayment("mock_pay-1"));

      expect((await service.findOne("pay-1", buyerActor)).isMock).toBe(true);
    });

    it("does not flag a payment settled by Paystack", async () => {
      prisma.payment.findUnique.mockResolvedValue(storedPayment("ref_1"));

      expect((await service.findOne("pay-1", buyerActor)).isMock).toBe(false);
    });

    it("does not flag a payment that has no reference yet", async () => {
      prisma.payment.findUnique.mockResolvedValue(storedPayment(null));

      expect((await service.findOne("pay-1", buyerActor)).isMock).toBe(false);
    });

    it("mints a mock_ reference when Paystack is not configured, which is what isMock reads", async () => {
      paystack.isConfigured.mockReturnValue(false);

      const result = await service.initiate(
        {
          amount: 5000,
          currency: "NGN",
          transactionId: "tx-1",
          callbackUrl: "http://localhost:8080/callback",
        },
        buyerActor,
      );

      expect(result.reference).toBe("mock_pay-1");
      expect(paystack.initializeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("getPaymentConfig", () => {
    it("reports mock mode when Paystack is not configured", () => {
      paystack.isConfigured.mockReturnValue(false);

      expect(service.getPaymentConfig()).toEqual(
        expect.objectContaining({ enabled: false, mockMode: true }),
      );
    });

    it("reports live mode when Paystack is configured", () => {
      paystack.isConfigured.mockReturnValue(true);

      expect(service.getPaymentConfig()).toEqual(
        expect.objectContaining({ enabled: true, mockMode: false }),
      );
    });
  });
});
