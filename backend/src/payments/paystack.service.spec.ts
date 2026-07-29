import { ConfigService } from "@nestjs/config";
import { PaystackService } from "./paystack.service";

const LIVE_KEY = "sk_live_deadbeefdeadbeefdeadbeef";

function makeService(env: Record<string, string | undefined>): PaystackService {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new PaystackService(config);
}

describe("PaystackService.isConfigured", () => {
  it("is false with no secret key", () => {
    expect(makeService({ NODE_ENV: "development" }).isConfigured()).toBe(false);
  });

  it("is true with a secret key", () => {
    expect(
      makeService({ NODE_ENV: "development", PAYSTACK_SECRET_KEY: LIVE_KEY }).isConfigured(),
    ).toBe(true);
  });

  it("is true with only the test secret key", () => {
    expect(
      makeService({
        NODE_ENV: "development",
        PAYSTACK_TEST_SECRET_KEY: "sk_test_x",
      }).isConfigured(),
    ).toBe(true);
  });

  it("honours PAYSTACK_FORCE_MOCK in development", () => {
    const service = makeService({
      NODE_ENV: "development",
      PAYSTACK_FORCE_MOCK: "true",
      PAYSTACK_SECRET_KEY: LIVE_KEY,
    });

    expect(service.isConfigured()).toBe(false);
  });

  it("honours PAYSTACK_FORCE_MOCK in test", () => {
    const service = makeService({
      NODE_ENV: "test",
      PAYSTACK_FORCE_MOCK: "true",
      PAYSTACK_SECRET_KEY: LIVE_KEY,
    });

    expect(service.isConfigured()).toBe(false);
  });

  it("ignores PAYSTACK_FORCE_MOCK when NODE_ENV is production", () => {
    const service = makeService({
      NODE_ENV: "production",
      PAYSTACK_FORCE_MOCK: "true",
      PAYSTACK_SECRET_KEY: LIVE_KEY,
    });

    expect(service.isConfigured()).toBe(true);
  });

  it("ignores PAYSTACK_FORCE_MOCK on a Vercel production deployment", () => {
    const service = makeService({
      NODE_ENV: "development",
      VERCEL_ENV: "production",
      PAYSTACK_FORCE_MOCK: "true",
      PAYSTACK_SECRET_KEY: LIVE_KEY,
    });

    expect(service.isConfigured()).toBe(true);
  });

  it("ignores PAYSTACK_FORCE_MOCK in an unrecognised environment such as staging", () => {
    const service = makeService({
      NODE_ENV: "staging",
      PAYSTACK_FORCE_MOCK: "true",
      PAYSTACK_SECRET_KEY: LIVE_KEY,
    });

    expect(service.isConfigured()).toBe(true);
  });

  it("treats a falsy PAYSTACK_FORCE_MOCK value as unset", () => {
    const service = makeService({
      NODE_ENV: "development",
      PAYSTACK_FORCE_MOCK: "false",
      PAYSTACK_SECRET_KEY: LIVE_KEY,
    });

    expect(service.isConfigured()).toBe(true);
  });
});
