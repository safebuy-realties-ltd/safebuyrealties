import { Test, TestingModule } from "@nestjs/testing";
import { UserRole, PaymentStatus, ListingStatus, TransactionStatus } from "@prisma/client";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EscrowService } from "../escrow/escrow.service";
import { ConfigService } from "@nestjs/config";

const buyerActor = {
  sub: "buyer-1",
  email: "buyer@safebuyrealties.test",
  role: UserRole.BUYER,
  professionalType: null,
};

describe("PaymentsService paystack email", () => {
  let service: PaymentsService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/x",
          access_code: "code",
          reference: "ref_1",
        },
      }),
    });
    global.fetch = fetchMock;

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
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === "PAYSTACK_TEST_SECRET_KEY" ? "sk_test_x" : undefined,
          },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it("maps .test seed emails to example.com for Paystack initialize", async () => {
    await service.initiate(
      {
        amount: 5000,
        currency: "NGN",
        transactionId: "tx-1",
        callbackUrl: "http://localhost:8080/callback",
      },
      buyerActor,
    );

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.email).toBe("buyer+buyer-1@example.com");
    expect(body.email).not.toContain(".test");
  });
});
