import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { DdCmsModule } from "../dd-cms/dd-cms.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { DdCaseSerializer } from "./dd-case.serializer";
import { DdCoreService } from "./dd-core.service";

/**
 * The due diligence case machinery, imported by every module that runs a case.
 *
 * It carries no controller. There is no such thing as a case that belongs to no product, so there
 * is no route to hang here: `StandaloneDdModule` and `DueDiligenceModule` own the routes and this
 * module owns what they both do underneath. PrismaModule is `@Global()`, so it needs no import.
 *
 * `TransactionsModule` is here for `TransactionStateService`, which owns the one write that moves a
 * transaction. A case moving is the largest reason a transaction moves, and the direction of that
 * import is deliberate: the case knows about the transaction it belongs to, and the transaction
 * knows nothing about due diligence.
 */
@Module({
  imports: [StorageModule, DdCmsModule, TransactionsModule],
  providers: [DdCaseSerializer, DdCoreService],
  exports: [DdCaseSerializer, DdCoreService],
})
export class DdCoreModule {}
