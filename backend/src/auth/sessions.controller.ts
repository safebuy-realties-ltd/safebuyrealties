import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "./jwt.strategy";
import { SessionsService } from "./sessions.service";

/**
 * The two routes that make a session something a person can see and end.
 *
 * Criterion 3. Everything else in E5-S5 happens to a user rather than for them: rotation is
 * invisible, revocation on KYC rejection is a decision somebody else made. This is the part they
 * hold. "Sign out my old phone" is the answer to a stolen device, and until now the answer was
 * "wait a week".
 *
 * Both routes answer 404 when `auth_sessions` is off, rather than an empty list or a 403. Off means
 * there are no sessions to manage, so a route that lists them does not exist, and the rollback is
 * the flag rather than a deploy.
 */
@Controller("auth/sessions")
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    this.assertEnabled();
    return { data: await this.sessions.list(user.sub, user.sid ?? null) };
  }

  /**
   * Ends one session.
   *
   * The id is the session's, and ownership is checked inside the service as part of the same query
   * that finds it, so a session belonging to somebody else is answered exactly like one that never
   * existed. Revoking the session you are asking from is allowed: it is what "sign out everywhere
   * including here" is made of, and the refresh cookie in the browser stops working immediately
   * while the access token in flight lasts out its fifteen minutes.
   */
  @Delete(":id")
  @HttpCode(204)
  async revoke(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    this.assertEnabled();
    const revoked = await this.sessions.revoke(user.sub, id, "user_revoked");
    if (!revoked) throw new NotFoundException("Session not found");
  }

  private assertEnabled(): void {
    if (!this.sessions.enabled()) throw new NotFoundException();
  }
}
