import { ArgumentsHost, HttpStatus, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { AnonymousNotFoundFilter } from "./anonymous-not-found.filter";

type ErrorPayload = { error: { code: string; message: string } };

/**
 * The question behind every case here is what a stranger can learn by asking. E1-S3 criterion 3
 * says an unauthenticated request and a request from the wrong buyer both get 404, and the only way
 * that holds is if the two are indistinguishable on the wire.
 */
describe("AnonymousNotFoundFilter", () => {
  let res: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
  let filter: AnonymousNotFoundFilter;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    filter = new AnonymousNotFoundFilter();
  });

  function host(req: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  }): ArgumentsHost {
    const request = {
      method: "GET",
      originalUrl: "/api/v1/due-diligence-orders/order-1/reports",
      headers: req.headers ?? {},
      cookies: req.cookies,
    };
    return {
      switchToHttp: () => ({
        getResponse: () => res as unknown as Response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  }

  function payload(): ErrorPayload {
    return res.json.mock.calls[0][0] as ErrorPayload;
  }

  it("answers a caller who presented nothing with 404, not 401", () => {
    filter.catch(new UnauthorizedException("Unauthorized"), host({}));

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(payload().error.code).toBe("NOT_FOUND");
  });

  it("says the same thing a wrong-buyer refusal says, word for word", () => {
    // `DueDiligenceCaseService` throws NotFoundException("Due diligence order not found") for a
    // buyer who does not own the order. If this message drifted from that one, the pair would be
    // told apart by their bodies and the 404 would stop hiding anything.
    filter.catch(new UnauthorizedException("Unauthorized"), host({}));

    expect(payload().error.message).toBe("Due diligence order not found");
  });

  it("leaves an expired bearer token as a 401, so the interface can say sign in again", () => {
    filter.catch(
      new UnauthorizedException("Invalid or expired session"),
      host({ headers: { authorization: "Bearer stale.token.value" } }),
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(payload().error.message).toBe("Invalid or expired session");
  });

  it("leaves an expired session cookie as a 401 for the same reason", () => {
    filter.catch(
      new UnauthorizedException("Invalid or expired session"),
      host({ cookies: { sbr_session: "stale" } }),
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });

  it("treats a request with cookies but no session cookie as anonymous", () => {
    // A visitor who has only ever accepted the consent banner carries cookies and no session. They
    // are a stranger, and the answer has to match what a caller with no cookies at all gets.
    filter.catch(new UnauthorizedException("Unauthorized"), host({ cookies: { theme: "dark" } }));

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });
});
