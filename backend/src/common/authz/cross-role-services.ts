/**
 * E4-S3: wires the real services onto the fixture store.
 *
 * These are the production classes, constructed by hand rather than through Nest. The matrix has to
 * exercise the code that actually decides, so nothing here reimplements or subclasses a service.
 * What is replaced is only what sits on the far side of a decision already made: the audit writer,
 * the payment gateway, the object store. Every one of those is called strictly after the ownership
 * check the matrix is measuring, so stubbing them cannot move a cell.
 *
 * `NotificationsService` and `ListingsService` are the real ones on the same fixture store, because
 * `VerificationService` calls back into listing status sync and a stub there would quietly skip a
 * second database round trip that a wrong-role actor should never have reached.
 */
import { SessionsService } from "../../auth/sessions.service";
import type { DdCmsService } from "../../dd-cms/dd-cms.service";
import { DdCaseSerializer } from "../../dd-core/dd-case.serializer";
import { DdCoreService } from "../../dd-core/dd-core.service";
import { DocumentsService } from "../../documents/documents.service";
import { DueDiligenceCaseService } from "../../due-diligence/due-diligence-case.service";
import { EscrowService } from "../../escrow/escrow.service";
import { InspectionsService } from "../../inspections/inspections.service";
import { ListingsService } from "../../listings/listings.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { PaymentsService } from "../../payments/payments.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { StorageService } from "../../storage/storage.service";
import { TasksService } from "../../tasks/tasks.service";
import { TransactionsService } from "../../transactions/transactions.service";
import { UsersService } from "../../users/users.service";
import { VerificationService } from "../../verification/verification.service";

/**
 * A collaborator that answers every method with a resolved `undefined`. The generic is inferred
 * from the constructor parameter it is passed to, which keeps this file from importing a dozen
 * classes it never touches.
 */
function stub<T>(overrides: Record<string, unknown> = {}): T {
  return new Proxy(overrides, {
    get: (target, property) =>
      typeof property === "string" && property in target ? target[property] : async () => undefined,
  }) as unknown as T;
}

export interface Services {
  ddCases: DueDiligenceCaseService;
  documents: DocumentsService;
  escrow: EscrowService;
  inspections: InspectionsService;
  listings: ListingsService;
  notifications: NotificationsService;
  payments: PaymentsService;
  sessions: SessionsService;
  tasks: TasksService;
  transactions: TransactionsService;
  users: UsersService;
  verification: VerificationService;
}

export function buildServices(prisma: PrismaService): Services {
  const notifications = new NotificationsService(prisma);
  const listings = new ListingsService(prisma, stub(), notifications, stub());
  const escrow = new EscrowService(prisma, stub(), notifications, stub());

  // E1-S1. The report route is the only one on the case lifecycle that is not an operator route, so
  // it is the only one this matrix owns. The serializer and the core service are the real ones,
  // because the report write runs through both before the response is built, and a stub there would
  // hide a reload that a wrong actor should never have reached. The checklist CMS answers with an
  // empty catalogue: it decides what a case says, never who may say it.
  const storage = stub<StorageService>({
    upload: async () => undefined,
    getSignedUrl: async (key: string) => `https://storage.test/${key}`,
  });
  const ddCms = stub<DdCmsService>({
    getActiveDefinitions: async () => [],
    suggestedTypesForSchedules: async () => [],
  });
  const ddSerializer = new DdCaseSerializer(prisma, storage, ddCms);

  return {
    ddCases: new DueDiligenceCaseService(
      prisma,
      new DdCoreService(prisma, storage, ddCms, ddSerializer),
      ddSerializer,
      notifications,
      stub(),
    ),
    documents: new DocumentsService(
      prisma,
      stub({ getSignedUrl: async (key: string) => `https://storage.test/${key}` }),
      stub(),
    ),
    escrow,
    inspections: new InspectionsService(prisma),
    listings,
    notifications,
    payments: new PaymentsService(prisma, notifications, escrow, stub(), stub(), stub()),
    // E5-S5. The flag stub says on, because a matrix row for a route that answers 404 to everybody
    // while the flag is off would prove nothing about ownership. The config stub answers nothing so
    // the service falls back to its own defaults, which is the shape a deployment without the
    // optional variables set has.
    sessions: new SessionsService(
      prisma,
      stub(),
      stub({ isEnabled: () => true }),
      stub({ get: () => undefined }),
    ),
    tasks: new TasksService(prisma, notifications),
    transactions: new TransactionsService(prisma),
    users: new UsersService(prisma, stub()),
    verification: new VerificationService(prisma, stub(), notifications, listings),
  };
}
