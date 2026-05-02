import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { JwtPayload } from "../../auth/jwt.strategy";

export const CurrentUserOptional = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload | null => {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload | null }>();
    return req.user ?? null;
  },
);
