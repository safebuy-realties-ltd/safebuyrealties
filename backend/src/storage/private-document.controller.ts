import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt.guard";
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
 * The authorized read path for every stored document (E3-S1c, E3-S1d).
 *
 * Every key StorageService hands out resolves here, on both drivers, and the decision is made per
 * request from the live session rather than baked into a URL. Reachable because it is a Nest
 * route: the `/uploads` static mount used to sit in front of the router where no guard could
 * reach it, which was the whole of E3-S1a's finding. E3-S1d-3 deleted that mount — with every
 * family routed here there was nothing left for it to serve.
 *
 * Who may read what:
 *
 * | Family            | Readers                                                              |
 * | ----------------- | -------------------------------------------------------------------- |
 * | `kyc/`            | the subject user, plus STAFF/ADMIN/SUPER_ADMIN                        |
 * | `professionals/`  | the professional, plus STAFF/ADMIN/SUPER_ADMIN                        |
 * | `due-diligence/`  | the ordering buyer and any assigned professional, plus operators      |
 * | `poa/`            | the buyer who executed it and the listing's seller, plus operators    |
 * | `listings/`       | **anyone** for public media on a visible listing; otherwise the       |
 * |                   | seller, the uploader, a buyer in a transaction on it, an assigned     |
 * |                   | professional, plus operators                                          |
 *
 * Operators are included because these families exist to be reviewed by them, and the review
 * screens already sit behind `@Roles(STAFF, ADMIN, …)` — `kyc.controller.ts:queue` and
 * `professionals.controller.ts:listPending`. Narrowing to ADMIN alone would close the staff KYC
 * queue, not secure it.
 *
 * The reader set itself is `private-document-authorizer.ts`, because every family below the first
 * two needs a database lookup to answer and `private-documents.ts` is deliberately Prisma-free.
 *
 * **The guard is optional, and that is load-bearing.** `listings/` carries the marketplace's
 * gallery photographs as well as the seller's title deeds, under one prefix, so this endpoint has
 * to be reachable without a session or public listing pages stop rendering. `OptionalJwtAuthGuard`
 * still rejects a session that is present and invalid; what it permits is the absence of one, and
 * `PrivateDocumentAuthorizer.decide()` refuses an anonymous caller everything except public media
 * on a visible listing. A bad session is 401 at the guard, no session is 401 here.
 *
 * Status codes: 401 with no session or a broken one, 403 for a caller who may not read this
 * document, 404 for a key that names nothing readable. Authorization is decided before storage is
 * touched, so a caller who is refused never learns whether the object exists — and a refusal is
 * 403 even when the subject entity does not exist, so the endpoint is not an id oracle either.
 */
@Controller(PRIVATE_DOCUMENT_ROUTE)
@UseGuards(OptionalJwtAuthGuard)
export class PrivateDocumentController {
  constructor(
    private storage: StorageService,
    private authorizer: PrivateDocumentAuthorizer,
    private audit: AuditService,
  ) {}

  @Get()
  async read(
    @Query("key") key: string | undefined,
    @CurrentUser() user: JwtPayload | null,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const target = resolvePrivateDocumentTarget(key);
    if (!target) throw new NotFoundException("Document not found");

    const access = await this.authorizer.decide(target, user ?? null);
    if (!access.allowed) {
      void this.audit.log({
        actorId: user?.sub ?? null,
        action: AuditAction.PRIVATE_DOCUMENT_READ_DENIED,
        entity: target.policy.auditEntity,
        entityId: target.key,
        after: { ownerId: access.ownerId, role: user?.role ?? null, reason: access.reason },
        ipAddress: req.ip ?? null,
      });
      // A caller with no session is told to get one; a caller with one is told this is not
      // theirs. Collapsing both to 403 would make a plain "please log in" unreportable in the UI,
      // and neither answer reveals whether the object exists — that is decided above, before
      // storage is touched.
      if (!user) throw new UnauthorizedException("Authentication required");
      throw new ForbiddenException("You do not have access to this document");
    }

    // Opened before anything is written to the response, so a missing object still produces a
    // clean 404 through HttpExceptionFilter rather than a half-sent body.
    const object = await this.storage.readObject(target.key);
    const delivery = describePrivateDocument(target.key);

    const isPublicAsset = access.reason === "public-listing-asset";

    // Public listing media is served on every marketplace page view by every visitor, so auditing
    // it would write a row per image and bury the reads that matter. It is public by definition —
    // there is no access decision to record. Every other read is audited, refusals included.
    if (!isPublicAsset) {
      void this.audit.log({
        actorId: user?.sub ?? null,
        action: AuditAction.PRIVATE_DOCUMENT_READ,
        entity: target.policy.auditEntity,
        entityId: target.key,
        after: {
          ownerId: access.ownerId,
          self: access.reason === "owner",
          role: user?.role ?? null,
          reason: access.reason,
        },
        ipAddress: req.ip ?? null,
      });
    }

    res.setHeader("Content-Type", delivery.contentType);
    res.setHeader(
      "Content-Disposition",
      `${delivery.disposition}; filename="${delivery.fileName}"`,
    );
    // helmet already sets this globally; stated again here because the closed type map above is
    // only worth anything if the browser is forbidden from second-guessing it.
    res.setHeader("X-Content-Type-Options", "nosniff");
    // A per-caller authorization decision must never be cached by anything in front of us. The one
    // exception is a public listing asset, whose decision does not depend on the caller at all:
    // before E3-S1d-3 those bytes came from a static mount that any cache could hold, and making
    // every gallery image uncacheable would be a real regression dressed up as security. The
    // window is short because the decision can still change — unpublishing a listing has to take
    // effect in minutes, not at the whim of a CDN.
    res.setHeader(
      "Cache-Control",
      isPublicAsset ? "public, max-age=300" : "private, no-store, max-age=0",
    );
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
