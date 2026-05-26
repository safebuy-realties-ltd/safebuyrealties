import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { OptionalJwtAuthGuard } from "./optional-jwt.guard";

function mockContext(cookies: Record<string, string> = {}, authorization?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization },
        cookies,
      }),
    }),
  } as ExecutionContext;
}

describe("OptionalJwtAuthGuard", () => {
  it("allows anonymous requests without session", async () => {
    const guard = new OptionalJwtAuthGuard();
    await expect(guard.canActivate(mockContext())).resolves.toBe(true);
  });

  it("rejects requests with an invalid session cookie", async () => {
    const guard = new OptionalJwtAuthGuard();
    const parentActivate = jest
      .spyOn(Object.getPrototypeOf(OptionalJwtAuthGuard.prototype), "canActivate")
      .mockRejectedValue(new Error("invalid token"));

    await expect(
      guard.canActivate(mockContext({ sbr_session: "not-a-valid-jwt" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    parentActivate.mockRestore();
  });
});
