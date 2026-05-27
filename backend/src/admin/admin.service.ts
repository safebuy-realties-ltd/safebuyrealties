import { Injectable, ForbiddenException } from "@nestjs/common";
import { ListingStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt.strategy";
import { KycStatus } from "../kyc/kyc.constants";

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getAnalytics(actor: JwtPayload) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.STAFF) {
      throw new ForbiddenException();
    }

    const [
      totalListings,
      liveListings,
      totalTransactions,
      ddOrdersAgg,
      pendingKyc,
      pendingVerifications,
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
    ]);

    const totalDdRevenue = ddOrdersAgg._sum.total?.toString() ?? "0";

    return {
      totalListings,
      liveListings,
      totalTransactions,
      totalDdRevenue,
      pendingKyc,
      pendingVerifications,
    };
  }
}
