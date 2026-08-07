import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService, type IssuedCredentials } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ActivateAccountDto } from "./dto/activate-account.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Throttle } from "../common/decorators/throttle.decorator";
import { JwtPayload } from "./jwt.strategy";
import { SessionsService } from "./sessions.service";
import { isDevelopmentOrTest } from "../config/runtime-environment";

const COOKIE_NAME = "sbr_session";
const REFRESH_COOKIE_NAME = "sbr_refresh";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The refresh cookie is scoped to the auth routes and nowhere else.
 *
 * The access cookie has to go everywhere, because every API call needs it. The refresh cookie is
 * only ever read by two handlers, so a path narrow enough to cover just those two is a cookie that
 * is not sent on the hundreds of other requests a session makes, and therefore one that is not
 * sitting in the logs, proxies and error reports of routes that have no use for it. It is the
 * longer-lived of the two credentials, so it is the one worth keeping off the wire.
 *
 * Must track `app.setGlobalPrefix("api/v1")` in app-bootstrap.ts. If the prefix moves and this does
 * not, the browser stops sending the cookie and every refresh fails, which is a sign-out storm
 * fifteen minutes after the deploy rather than at the moment of it.
 */
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function sessionCookieOptions() {
  // Secure everywhere except a developer's machine and the test runner, so staging and an
  // undeclared environment both get it. It used to read NODE_ENV directly, which meant a host
  // that did not set NODE_ENV issued session and refresh cookies over plain http. See ADR-0006.
  //
  // SameSite=Lax works when the browser talks to the API on the same origin, which is true both
  // for the Vercel rewrite /api/v1 → backend and for a reverse proxy in front of both processes.
  // SameSite=None is only needed for direct cross-subdomain calls, which third-party cookie rules
  // often block.
  return {
    httpOnly: true,
    secure: !isDevelopmentOrTest(),
    sameSite: "lax" as const,
    path: "/",
  };
}

function refreshCookieOptions() {
  return { ...sessionCookieOptions(), path: REFRESH_COOKIE_PATH };
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    maxAge: SEVEN_DAYS_MS,
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, sessionCookieOptions());
}

/**
 * Writes whichever cookies the credentials call for.
 *
 * The access cookie keeps its seven-day `maxAge` even when the token inside it lives fifteen
 * minutes, and that is on purpose: a cookie that expired with its token would be gone from the
 * browser before the refresh call that replaces it could be made, and the person would be signed
 * out rather than refreshed. The token's own expiry is what is enforced; the cookie is only the
 * envelope. `refreshToken` is null while `auth_sessions` is off, and then nothing is written.
 */
function applyCredentials(res: Response, credentials: IssuedCredentials) {
  setSessionCookie(res, credentials.accessToken);
  if (credentials.refreshToken && credentials.refreshExpiresAt) {
    res.cookie(REFRESH_COOKIE_NAME, credentials.refreshToken, {
      ...refreshCookieOptions(),
      // Not a fixed window. Rotation does not extend a session, so the cookie has to expire when
      // the family does rather than seven days after whichever refresh happened to be the last.
      expires: credentials.refreshExpiresAt,
    });
  }
}

function readRefreshCookie(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE_NAME] ?? null;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post("register")
  @Throttle("register")
  async register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto, { ip, userAgent });
    applyCredentials(res, result.data);
    return { data: { user: result.data.user } };
  }

  /**
   * Two limits sit in front of this route and they count different things. `@Throttle("login")` is
   * per address and per minute and catches a burst; the lockout inside `AuthService.login` is per
   * account, durable, and catches a slow grind spread over an hour. Either can answer 429.
   */
  @Post("login")
  @HttpCode(200)
  @Throttle("login")
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, ip, userAgent);
    applyCredentials(res, result.data);
    return { data: { user: result.data.user } };
  }

  /**
   * Spends the refresh cookie and writes back a new pair.
   *
   * Unauthenticated on purpose: it is reached precisely when the access token has expired, so
   * requiring one would make it unreachable at the only moment it is wanted. The refresh cookie is
   * the credential. Every way this can fail answers 401 with the same body, and the cookie is
   * cleared on the way out so a browser holding a dead token stops presenting it, which is the
   * difference between one 401 and a retry loop.
   */
  @Post("refresh")
  @HttpCode(200)
  @Throttle("refresh")
  async refresh(
    @Req() req: Request,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = readRefreshCookie(req);
    try {
      const credentials = await this.auth.refresh(presented ?? "", { ip, userAgent });
      applyCredentials(res, credentials);
      return { data: { refreshed: true } };
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
      clearSessionCookie(res);
      throw err;
    }
  }

  /**
   * Ends the session rather than only forgetting it.
   *
   * Clearing the cookies was the whole of logout before this story, which meant a copy of the token
   * taken beforehand stayed good for a week. Now the session behind it is revoked, so signing out
   * on a shared machine actually signs out. Still 204 whatever happens: a logout that reports
   * failure gives a person nothing they can act on, and the cookies are cleared either way.
   */
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = readRefreshCookie(req);
    if (presented && this.sessions.enabled()) {
      await this.sessions.revokePresented(presented, "logout");
    }
    clearSessionCookie(res);
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user);
  }

  @Get("activate/:token")
  @Throttle("activate")
  getActivationPreview(@Param("token") token: string) {
    return this.auth.getActivationPreview(token);
  }

  @Post("activate")
  @HttpCode(200)
  @Throttle("activate")
  async activate(
    @Body() dto: ActivateAccountDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.activateAccount(dto.token, dto.password, { ip, userAgent });
    applyCredentials(res, result.data);
    return { data: { user: result.data.user } };
  }
}
