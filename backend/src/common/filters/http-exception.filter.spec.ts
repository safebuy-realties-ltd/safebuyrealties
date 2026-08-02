import { ArgumentsHost, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { TooManyRequestsException } from "../throttle/too-many-requests.exception";
import { HttpExceptionFilter } from "./http-exception.filter";

type ErrorPayload = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};

describe("HttpExceptionFilter", () => {
  let res: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    filter = new HttpExceptionFilter();
  });

  function host(): ArgumentsHost {
    const req = { method: "POST", originalUrl: "/api/v1/auth/login", headers: {} };
    return {
      switchToHttp: () => ({
        getResponse: () => res as unknown as Response,
        getRequest: () => req,
      }),
    } as unknown as ArgumentsHost;
  }

  function payload(): ErrorPayload {
    return res.json.mock.calls[0][0] as ErrorPayload;
  }

  describe("a refusal from either rate limiting tier (E5-S1 criterion 2)", () => {
    it("answers 429 and sets Retry-After to the seconds the caller must wait", () => {
      filter.catch(new TooManyRequestsException("Too many requests.", 42), host());

      expect(res.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "42");
    });

    it("puts the same number in the body, so a client that ignores headers still has it", () => {
      filter.catch(new TooManyRequestsException("Too many requests.", 42), host());

      expect(payload().error.code).toBe("TOO_MANY_REQUESTS");
      expect(payload().error.details).toEqual({ retryAfterSeconds: 42 });
    });

    it("never emits Retry-After: 0, which tells a client to retry immediately", () => {
      filter.catch(new TooManyRequestsException("Too many requests.", 0), host());

      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "1");
    });

    it("rounds a part-second up rather than down", () => {
      filter.catch(new TooManyRequestsException("Too many requests.", 0.2), host());

      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "1");
    });
  });

  it("leaves Retry-After off every other status", () => {
    filter.catch(new NotFoundException("Nope"), host());

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("survives a 429 raised by something that carried no seconds", () => {
    filter.catch(new HttpException("Slow down", HttpStatus.TOO_MANY_REQUESTS), host());

    expect(res.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(payload().error.message).toBe("Slow down");
  });
});
