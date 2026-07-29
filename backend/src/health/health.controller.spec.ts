import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { PaystackService } from "../payments/paystack.service";

const LIVE_KEY = "sk_live_deadbeefdeadbeefdeadbeef";

describe("HealthController", () => {
  let controller: HealthController;
  let paystack: { isConfigured: jest.Mock; secretKey: jest.Mock };

  beforeEach(async () => {
    paystack = {
      isConfigured: jest.fn().mockReturnValue(true),
      secretKey: jest.fn().mockReturnValue(LIVE_KEY),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PaystackService, useValue: paystack }],
    }).compile();

    controller = module.get(HealthController);
  });

  it("keeps the existing response shape", () => {
    expect(controller.check()).toEqual(
      expect.objectContaining({ status: "ok", service: "safebuyrealties-api" }),
    );
  });

  it("reports payment configuration as booleans", () => {
    const body = controller.check();

    expect(body.paymentsConfigured).toBe(true);
    expect(body.paymentsMockMode).toBe(false);
  });

  it("reports mock mode when the gateway is not configured", () => {
    paystack.isConfigured.mockReturnValue(false);
    const body = controller.check();

    expect(body.paymentsConfigured).toBe(false);
    expect(body.paymentsMockMode).toBe(true);
  });

  it("never exposes the key, or any prefix or suffix of it", () => {
    const serialized = JSON.stringify(controller.check());

    expect(serialized).not.toContain(LIVE_KEY);
    // A prefix or suffix would narrow a brute-force search, so neither may appear either.
    for (let length = 6; length <= LIVE_KEY.length; length += 1) {
      expect(serialized).not.toContain(LIVE_KEY.slice(0, length));
      expect(serialized).not.toContain(LIVE_KEY.slice(-length));
    }
    expect(paystack.secretKey).not.toHaveBeenCalled();
  });

  it("emits only booleans beyond the existing string fields", () => {
    const { status, service, ...rest } = controller.check();

    expect(typeof status).toBe("string");
    expect(typeof service).toBe("string");
    for (const value of Object.values(rest)) {
      expect(typeof value).toBe("boolean");
    }
  });
});
