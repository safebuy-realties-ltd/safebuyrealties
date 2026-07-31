import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { PrivateDocumentAuthorizer } from "./private-document-authorizer";
import { StorageService } from "./storage.service";
import {
  PRIVATE_DOCUMENT_ROUTE,
  describePrivateDocument,
  resolvePrivateDocumentTarget,
} from "./private-documents";

/**
 * The authorized read path for private documents (E3-S1c, E3-S1d).
 *
 * Every private key StorageService hands out resolves here, on both drivers, and the decision is
 * made per request from the live session rather than baked into a URL. Reachable because it is a
 * Nest route: the `/uploads` static mount sits in front of the router where no guard can reach it,
 * which was the whole of E3-S1a's finding.
 *
 * Who may read what:
 *
 * | Family            | Readers                                                         |
 * | ----------------- | --------------------------------------------------------------- |
 * | `kyc/`            | the subject user, plus STAFF/ADMIN/SUPER_ADMIN                   |
 * | `professionals/`  | the professional, plus STAFF/ADMIN/SUPER_ADMIN                   |
 * | `due-diligence/`  | the ordering buyer and any assigned professional, plus operators |
 *
 * Operators are included because these families exist to be reviewed by them, and the review
 * screens already sit behind `@Roles(STAFF, ADMIN, …)` — `kyc.controller.ts:queue` and
 * `professionals.controller.ts:listPending`. Narrowing to ADMIN alone would close the staff KYC
 * queue, not secure it.
 *
 * The reader set itself is `private-document-authorizer.ts`, because the due diligence family
 * needs a database lookup to answer and `private-documents.ts` is deliberately Prisma-free.
 *
 * Status codes: 401 with no session (the guard), 403 for a caller who may not read this document,
 * 404 for a key that names nothing readable. Authorization is decided before storage is touched,
 * so a caller who is refused never learns whether the object exists — and a refusal is 403 even
 * when the subject entity does not exist, so the endpoint is not an id oracle either.
 */
@Controller(PRIVATE_DOCUMENT_ROUTE)
@UseGuards(JwtAuthGuard)
export class PrivateDocumentController {
  constructor(
    private storage: StorageService,
    private authorizer: PrivateDocumentAuthorizer,
    private audit: AuditService,
  ) {}

  @Get()
  async read(
    @Query("key") key: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const target = resolvePrivateDocumentTarget(key);
    if (!target) throw new NotFoundException("Document not found");

    const access = await this.authorizer.decide(target, user);
    if (!access.allowed) {
      void this.audit.log({
        actorId: user.sub,
        action: AuditAction.PRIVATE_DOCUMENT_READ_DENIED,
        entity: target.policy.auditEntity,
        entityId: target.key,
        after: { ownerId: access.ownerId, role: user.role, reason: access.reason },
        ipAddress: req.ip ?? null,
      });
      throw new ForbiddenException("You do not have access to this document");
    }

    // Opened before anything is written to the response, so a missing object still produces a
    // clean 404 through HttpExceptionFilter rather than a half-sent body.
    const object = await this.storage.readObject(target.key);
    const delivery = describePrivateDocument(target.key);

    void this.audit.log({
      actorId: user.sub,
      action: AuditAction.PRIVATE_DOCUMENT_READ,
      entity: target.policy.auditEntity,
      entityId: target.key,
      after: {
        ownerId: access.ownerId,
        self: access.reason === "owner",
        role: user.role,
        reason: access.reason,
      },
      ipAddress: req.ip ?? null,
    });

    res.setHeader("Content-Type", delivery.contentType);
    res.setHeader(
      "Content-Disposition",
      `${delivery.disposition}; filename="${delivery.fileName}"`,
    );
    // helmet already sets this globally; stated again here because the closed type map above is
    // only worth anything if the browser is forbidden from second-guessing it.
    res.setHeader("X-Content-Type-Options", "nosniff");
    // A per-caller authorization decision must never be cached by anything in front of us.
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    if (object.contentLength !== null) {
      res.setHeader("Content-Length", String(object.contentLength));
    }

    object.stream.on("error", () => {
      // Mid-transfer failure: destroy rather than end, so the client sees a truncated
      // transfer instead of a short file that looks complete.
      res.destroy();
    });
    object.stream.pipe(res);
  }
}
