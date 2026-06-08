export const Webhooks = {
  verifySignature: () => true,
};

export function createPaystack() {
  return {
    transaction: {
      initialize: jest.fn(),
      verify: jest.fn(),
    },
    transferrecipient: { create: jest.fn() },
    transfer: { initiate: jest.fn() },
  };
}

export function assertOk<T>(result: { data?: T }): T {
  return result.data as T;
}
