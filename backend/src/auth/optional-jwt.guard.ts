import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest<TUser = any>(err: Error | null, user: TUser): TUser {
    if (err) throw err;
    return user ?? (null as TUser);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      cookies?: Record<string, string>;
    }>();
    const hasSession = !!req.headers.authorization || !!req.cookies?.sbr_session;
    if (!hasSession) return true;

    let ok = false;
    try {
      ok = (await super.canActivate(context)) as boolean;
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new UnauthorizedException("Invalid or expired session");
    }
    return true;
  }
}
