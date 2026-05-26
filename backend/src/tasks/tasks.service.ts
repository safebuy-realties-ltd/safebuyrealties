import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { UserRole, TaskStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { CreateTaskDto } from "./dto/create-task.dto";
import { PatchTaskDto } from "./dto/patch-task.dto";
import { ListTasksMeQueryDto } from "./dto/list-tasks.query";

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private isStaff(role: UserRole) {
    return role === UserRole.STAFF || role === UserRole.ADMIN;
  }

  private serializeTask(t: {
    id: string;
    listingId: string;
    assigneeId: string;
    createdById: string;
    title: string;
    description: string | null;
    type: string;
    status: TaskStatus;
    dueAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: t.id,
      listingId: t.listingId,
      assigneeId: t.assigneeId,
      createdById: t.createdById,
      title: t.title,
      description: t.description,
      type: t.type,
      status: t.status,
      dueAt: t.dueAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  async create(dto: CreateTaskDto, actor: JwtPayload) {
    if (!this.isStaff(actor.role)) throw new ForbiddenException();
    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!assignee || assignee.role !== UserRole.PROFESSIONAL) {
      throw new BadRequestException("assigneeId must be a professional");
    }
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    if (!listing) throw new NotFoundException("Listing not found");
    const task = await this.prisma.task.create({
      data: {
        listingId: dto.listingId,
        assigneeId: dto.assigneeId,
        createdById: actor.sub,
        title: dto.title,
        type: dto.type,
        description: dto.description,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });
    return this.serializeTask(task);
  }

  async listMine(query: ListTasksMeQueryDto, actor: JwtPayload) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException("Only professionals have assigned tasks");
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.TaskWhereInput = {
      assigneeId: actor.sub,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { dueAt: "asc" },
      }),
    ]);
    return {
      data: rows.map((t) => this.serializeTask(t)),
      meta: { page, pageSize, total },
    };
  }

  async getMineById(taskId: string, actor: JwtPayload) {
    if (actor.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException("Only professionals have assigned tasks");
    }
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, assigneeId: actor.sub },
    });
    if (!task) throw new NotFoundException("Task not found");
    return this.serializeTask(task);
  }

  async patch(id: string, dto: PatchTaskDto, actor: JwtPayload) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Task not found");
    if (task.assigneeId !== actor.sub && !this.isStaff(actor.role)) {
      throw new ForbiddenException();
    }
    const reportDescription =
      dto.completionNotes !== undefined
        ? dto.completionNotes
        : dto.description !== undefined
          ? dto.description
          : undefined;

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(reportDescription !== undefined ? { description: reportDescription } : {}),
        ...(dto.dueAt !== undefined
          ? { dueAt: dto.dueAt === null ? null : new Date(dto.dueAt) }
          : {}),
      },
    });
    return this.serializeTask(updated);
  }
}
