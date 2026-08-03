import { Module } from "@nestjs/common";
import { TransactionsService } from "./transactions.service";
import { TransactionsController } from "./transactions.controller";
import { TransactionStateService } from "./transaction-state.service";

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionStateService],
  exports: [TransactionsService, TransactionStateService],
})
export class TransactionsModule {}
