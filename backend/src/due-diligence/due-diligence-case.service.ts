import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit-actions.constants";
import { NotificationsService } from "../notifications/notifications.service";
import {
  NotificationEntityType,
  NotificationType,
} from "../notifications/notification-types.constants";
import { DdCoreService } from "../dd-core/dd-core.service";
import {
  DdCaseSerializer,
  ddOrderInclude,
  type DdOrderWithRelations,
} from "../dd-core/dd-case.serializer";
import {
  DD_ORDER_STATUS,
  DD_SOURCE,
  LISTING_DD_TRANSITIONS,
  isTerminalDdStatus,
} from "../dd-core/dd-case.constants";
import { ListDdOrdersQueryDto } from "./dto/list-dd-orders.query";
import { AssignDdProfessionalDto } from "./dto/assign-dd-professional.dto";
import { UpdateDdOrderDto } from "./dto/update-dd-order.dto";

type CaseMessage = { type: string; title: string; body: string };

/**
 * The lifecycle of a due diligence case raised against a platform listing.
 *
 * `DueDiligenceService` next door raises the case and prices it. This class is everything that
 * happens to it afterwards: who can see it, who is working on it, what state it is in and who was
 * told. The writes themselves live in `DdCoreService`, shared with the standalone path. What is
 * here is the part that is genuinely about listings, which is the access rules, the state table and
 * the people to notify, because a listing case has a seller and a standalone case does not.
 */
@Injectable()
export class DueDiligenceCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: DdCoreService,
    private readonly serializer: DdCaseSerializer,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The queue. An operator sees every listing case, anybody else sees their own and nothing else.
   *
   * The route already turns away roles that have no business here, so the scope filter looks
   * redundant. It is not. It is what stops one buyer reading another buyer's queue, and it belongs
   * next to the query rather than in a decorator, where a later route added to this service would
   * not inherit it.
   */
  async list(query: ListDdOrdersQueryDto, actor: JwtPayload) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.DueDiligenceOrderWhereInput = {
      source: DD_SOURCE.LISTING,
      ...(isInternalRole(actor.role) ? {} : { buyerId: actor.sub }),
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.dueDiligenceOrder.count({ where }),
      this.prisma.dueDiligenceOrder.findMany({
        where,
        include: ddOrderInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const data = await Promise.all(rows.map((row) => this.serializer.serializeOrder(row)));
    return { data, meta: { page, pageSize, total } };
  }

  async getOne(id: string, actor: JwtPayload) {
    const order = await this.loadListingCase(id, actor);
    return this.serializer.serializeOrder(order);
  }

  /**
   * Puts a verified professional on a schedule.
   *
   * An unverified professional is a 422 rather than a 400. The request is well formed and the
   * operator meant exactly what they said; it is the state of somebody else's profile that makes it
   * impossible to carry out, and the message says which part of that profile is the problem so the
   * operator can chase the document instead of guessing.
   */
  async assign(orderId: string, dto: AssignDdProfessionalDto, actor: JwtPayload) {
    const order = await this.loadListingCase(orderId, actor);
    if (order.status === DD_ORDER_STATUS.PENDING) {
      throw new BadRequestException(
        "A due diligence case cannot be assigned before it is paid for",
      );
    }
    if (isTerminalDdStatus(order.status)) {
      throw new BadRequestException(
        `A ${order.status.toLowerCase()} due diligence case cannot take new assignments`,
      );
    }

    const resolution = await this.core.resolveAssignableProfessional(dto.professionalId);
    if (!resolution.ok) {
      throw new UnprocessableEntityException(resolution.reason);
    }

    const assignment = await this.core.createAssignment(order, resolution.professional.id, dto);

    await this.audit.log({
      actorId: actor.sub,
      action: AuditAction.DD_CASE_ASSIGNED,
      entity: "DueDiligenceOrder",
      entityId: order.id,
      before: { status: order.status },
      after: {
        status:
          order.status === DD_ORDER_STATUS.PAID || order.status === DD_ORDER_STATUS.SUBMITTED
            ? DD_ORDER_STATUS.IN_PROGRESS
            : order.status,
        assignmentId: assignment.id,
        professionalId: assignment.professionalId,
        scheduleCode: assignment.scheduleCode,
      },
    });

    await this.notifications.create({
      userId: assignment.professionalId,
      type: NotificationType.TASK_ASSIGNED,
      title: "Due diligence assignment",
      body: assignment.title,
      entityId: assignment.id,
      entityType: NotificationEntityType.Task,
    });
    await this.notifyCaseParticipants(
      order,
      {
        type: NotificationType.DD_CASE_STATUS_CHANGED,
        title: "Due diligence under way",
        body: `${assignment.title} has been assigned on case ${this.caseLabel(order)}.`,
      },
      assignment.professionalId,
    );

    return this.serializer.serializeOrder(
      await this.core.reloadOrder(order.id, "after assignment"),
    );
  }

  /**
   * Moves the case along the state table, and the transaction with it.
   *
   * The verdict check runs after the transition check on purpose. A request to complete a case that
   * is still `PENDING` is wrong because of where the case is, not because of a missing verdict, and
   * being told to supply a verdict would send the operator off to write one for a case that is not
   * going to accept it.
   */
  async updateStatus(id: string, dto: UpdateDdOrderDto, actor: JwtPayload) {
    const order = await this.loadListingCase(id, actor);

    if (dto.status) {
      this.core.assertTransition(order.status, dto.status, LISTING_DD_TRANSITIONS);
      if (dto.status === DD_ORDER_STATUS.COMPLETE) {
        this.core.assertVerdictOnCompletion(order.verdict, dto.verdict);
      }
    }

    await this.core.applyStatusChange(order, dto);

    await this.audit.log({
      actorId: actor.sub,
      action: AuditAction.DD_CASE_STATUS_CHANGED,
      entity: "DueDiligenceOrder",
      entityId: order.id,
      before: { status: order.status, verdict: order.verdict },
      after: {
        status: dto.status ?? order.status,
        verdict: dto.verdict?.trim() || order.verdict,
      },
    });

    if (dto.status && dto.status !== order.status) {
      await this.notifyCaseParticipants(order, this.messageForStatus(order, dto));
    }

    return this.serializer.serializeOrder(await this.core.reloadOrder(order.id));
  }

  /**
   * Takes a report from the professional who was given the work, and from nobody else.
   *
   * A caller who is not the assignee gets the same 404 as a caller naming an assignment that does
   * not exist. Telling them the assignment is real but not theirs would let anybody holding a list
   * of ids map out who is working on what.
   */
  async submitAssignmentReport(assignmentId: string, file: Express.Multer.File, actor: JwtPayload) {
    const assignment = await this.core.findAssignment(assignmentId);
    if (!assignment) {
      throw new NotFoundException("Assignment not found");
    }
    const order = assignment.dueDiligenceOrder;
    if (assignment.professionalId !== actor.sub || order.source !== DD_SOURCE.LISTING) {
      throw new NotFoundException("Assignment not found");
    }
    if (isTerminalDdStatus(order.status)) {
      throw new BadRequestException(
        `Case ${this.caseLabel(order)} is ${order.status.toLowerCase()} and is no longer taking reports`,
      );
    }

    const storageKey = await this.core.attachAssignmentReport(order, assignment, file);

    await this.audit.log({
      actorId: actor.sub,
      action: AuditAction.DD_CASE_REPORT_SUBMITTED,
      entity: "DueDiligenceOrder",
      entityId: order.id,
      before: { status: order.status, assignmentStatus: assignment.status },
      after: {
        status: order.status === DD_ORDER_STATUS.PAID ? DD_ORDER_STATUS.IN_PROGRESS : order.status,
        assignmentId: assignment.id,
        assignmentStatus: "SUBMITTED",
        storageKey,
      },
    });

    await this.notifyCaseParticipants(
      order,
      {
        type: NotificationType.REPORT_SUBMITTED,
        title: "Due diligence report submitted",
        body: `${assignment.title} has been submitted on case ${this.caseLabel(order)}.`,
      },
      actor.sub,
    );
    await this.notifications.createForStaff({
      type: NotificationType.REPORT_SUBMITTED,
      title: "DD report submitted",
      body: `${assignment.title} report uploaded for ${this.caseLabel(order)}.`,
      entityId: order.id,
      entityType: NotificationEntityType.DueDiligenceOrder,
    });

    return this.serializer.serializeOrder(await this.core.reloadOrder(order.id, "after report"));
  }

  /**
   * Reads a listing case the actor is allowed to read, or 404.
   *
   * Ownership failure is a 404 rather than a 403 because a 403 confirms the case exists. Case ids
   * are guessable in the sense that a buyer holds one of them, and knowing that a neighbouring id
   * resolves is enough to learn that a given property is under due diligence.
   */
  private async loadListingCase(id: string, actor: JwtPayload): Promise<DdOrderWithRelations> {
    const order = await this.core.findOrderOrThrow(id);
    if (order.source !== DD_SOURCE.LISTING) {
      throw new NotFoundException("Due diligence order not found");
    }
    if (!isInternalRole(actor.role) && order.buyerId !== actor.sub) {
      throw new NotFoundException("Due diligence order not found");
    }
    return order;
  }

  private messageForStatus(order: DdOrderWithRelations, dto: UpdateDdOrderDto): CaseMessage {
    const label = this.caseLabel(order);
    if (dto.status === DD_ORDER_STATUS.COMPLETE) {
      const verdict = dto.verdict?.trim() || order.verdict;
      const clause = verdict ? ` with the verdict ${verdict}` : "";
      return {
        type: NotificationType.DD_CASE_STATUS_CHANGED,
        title: "Due diligence complete",
        body: `Case ${label} is complete${clause}.`,
      };
    }
    if (dto.status === DD_ORDER_STATUS.CANCELLED) {
      return {
        type: NotificationType.DD_CASE_STATUS_CHANGED,
        title: "Due diligence cancelled",
        body: `Case ${label} has been cancelled.`,
      };
    }
    return {
      type: NotificationType.DD_CASE_STATUS_CHANGED,
      title: "Due diligence updated",
      body: `Case ${label} moved from ${order.status} to ${dto.status}.`,
    };
  }

  /**
   * Everybody with a stake in the case: the buyer who paid for it, the seller whose property it is
   * about, and every professional working on it. Deduplicated, because one person can hold two of
   * those roles and being told twice reads like two separate things happening.
   */
  private async notifyCaseParticipants(
    order: DdOrderWithRelations,
    message: CaseMessage,
    excludeUserId?: string,
  ) {
    const recipients = new Set<string>([order.buyerId]);
    const sellerId = await this.findSellerId(order.listingId);
    if (sellerId) recipients.add(sellerId);
    for (const assignment of order.assignments ?? []) {
      recipients.add(assignment.professionalId);
    }
    if (excludeUserId) recipients.delete(excludeUserId);

    await Promise.all(
      Array.from(recipients).map((userId) =>
        this.notifications.create({
          userId,
          type: message.type,
          title: message.title,
          body: message.body,
          entityId: order.id,
          entityType: NotificationEntityType.DueDiligenceOrder,
        }),
      ),
    );
  }

  /**
   * The seller, fetched separately rather than through the shared case include.
   *
   * Adding `sellerId` to that include would put it in the standalone response too, where a guest
   * holding a Service ID can read a case. The seller is nothing to do with them.
   */
  private async findSellerId(listingId: string | null): Promise<string | null> {
    if (!listingId) return null;
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true },
    });
    return listing?.sellerId ?? null;
  }

  private caseLabel(order: {
    serviceId: string | null;
    caseId: string | null;
    id: string;
  }): string {
    return order.serviceId ?? order.caseId ?? order.id;
  }
}
