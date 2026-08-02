import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from "passport-jwt";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";

const cookieExtractor: JwtFromRequestFunction = (req: Request) => {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.sbr_session ?? null;
};
import { UserRole, ProfessionalType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { resolveJwtSecret } from "../config/jwt-secret";
import { SessionsService } from "./sessions.service";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  professionalType: ProfessionalType | null;
  /**
   * The session this token was minted for, when it was minted with one. E5-S5.
   *
   * Optional and it has to stay that way. Tokens signed before this existed carry no `sid`, and so
   * do tokens signed while `auth_sessions` is off. Both keep working, which is what makes turning
   * the flag on a change nobody signed out for and turning it off a rollback rather than an
   * incident. A token with no `sid` cannot be revoked, which is the state the whole application
   * was in until this story.
   */
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config.get<string>("JWT_SECRET")),
    });
  }

  /**
   * Runs on every authenticated request, so what goes in here is paid for on every authenticated
   * request. The user read was already here. E5-S5 adds one more indexed read, and only for tokens
   * that carry a `sid`, which is what turns revocation from a promise into something that takes
   * effect on the next request rather than at the end of the token's life.
   */
  async validate(payload: {
    sub: string;
    email: string;
    role: UserRole;
    professionalType?: ProfessionalType | null;
    sid?: string;
  }): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException("User no longer exists");
    if (!user.isActive) throw new UnauthorizedException("Account is deactivated");
    if (payload.sid && !(await this.sessions.isLive(payload.sid))) {
      throw new UnauthorizedException("Session ended");
    }
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      professionalType: user.professionalType,
      ...(payload.sid ? { sid: payload.sid } : {}),
    };
  }
}
