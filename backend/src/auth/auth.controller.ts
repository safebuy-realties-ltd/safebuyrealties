import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ActivateAccountDto } from "./dto/activate-account.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "./jwt.strategy";

const COOKIE_NAME = "sbr_session";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function sessionCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  // SameSite=Lax works when the browser talks to the API on the same origin
  // (Vercel rewrite /api/v1 → backend). SameSite=None is only needed for direct
  // cross-subdomain calls, which third-party cookie rules often block.
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
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

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto);
    setSessionCookie(res, result.data.accessToken);
    return { data: { user: result.data.user } };
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    setSessionCookie(res, result.data.accessToken);
    return { data: { user: result.data.user } };
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookie(res);
    return;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user);
  }

  @Get("activate/:token")
  getActivationPreview(@Param("token") token: string) {
    return this.auth.getActivationPreview(token);
  }

  @Post("activate")
  @HttpCode(200)
  async activate(
    @Body() dto: ActivateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.activateAccount(dto.token, dto.password);
    setSessionCookie(res, result.data.accessToken);
    return { data: { user: result.data.user } };
  }
}
