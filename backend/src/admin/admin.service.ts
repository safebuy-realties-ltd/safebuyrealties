import { Injectable, ForbiddenException } from "@nestjs/common";
import { ListingStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { isInternalRole } from "../common/user-roles";
import { KycStatus } from "../kyc/kyc.constants";

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getAnalytics(actor: JwtPayload) {
    if (!isInternalRole(actor.role)) {
      throw new ForbiddenException();
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      totalListings,
      liveListings,
      totalTransactions,
      ddOrdersAgg,
      pendingKyc,
      pendingVerifications,
      usersByRoleRows,
      listingsByStatusRows,
      recentTransactionsCount,
    ] = await Promise.all([
      this.prisma.listing.count(),
      this.prisma.listing.count({ where: { status: ListingStatus.LIVE } }),
      this.prisma.transaction.count(),
      this.prisma.dueDiligenceOrder.aggregate({
        where: { status: { in: ["PAID", "IN_PROGRESS", "COMPLETE"] } },
        _sum: { total: true },
      }),
      this.prisma.kycRecord.count({ where: { status: KycStatus.SUBMITTED } }),
      this.prisma.listing.count({
        where: {
          status: {
            in: [
              ListingStatus.PENDING_REVIEW,
              ListingStatus.ASSIGNED,
              ListingStatus.IN_VERIFICATION,
            ],
          },
        },
      }),
      this.prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      this.prisma.listing.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.transaction.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);

    const totalDdRevenue = ddOrdersAgg._sum.total?.toString() ?? "0";
    const usersByRole = Object.fromEntries(
      usersByRoleRows.map((row) => [row.role.toLowerCase(), row._count._all]),
    );
    const listingsByStatus = Object.fromEntries(
      listingsByStatusRows.map((row) => [row.status.toLowerCase(), row._count._all]),
    );

    return {
      totalListings,
      liveListings,
      totalTransactions,
      totalDdRevenue,
      pendingKyc,
      pendingVerifications,
      usersByRole,
      listingsByStatus,
      recentTransactionsCount,
    };
  }
}
