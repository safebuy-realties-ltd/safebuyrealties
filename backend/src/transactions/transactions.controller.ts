import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { TransactionsService } from "./transactions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { CreateTransactionDto } from "./dto/create-transaction.dto";

@Controller("transactions")
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private transactions: TransactionsService) {}

  @Post()
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: JwtPayload) {
    return this.transactions.create(dto, user);
  }

  @Get("me")
  listMine(@CurrentUser() user: JwtPayload) {
    return this.transactions.findMe(user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.transactions.findOne(id, user);
  }
}
