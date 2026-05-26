import { Injectable, NotFoundException } from "@nestjs/common";
import { ProfessionalProfile, ProfessionalType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import { VerifyCredentialDto } from "./dto/verify-credential.dto";

export type ProfessionalProfileResponse = {
  id: string;
  userId: string;
  regulatoryBody: string;
  licenseNumber: string;
  licenseExpiry: string | null;
  verifiedStatus: string;
  verifiedById: string | null;
  verifiedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type PendingUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  professionalType: ProfessionalType | null;
};

export type PendingCredentialResponse = ProfessionalProfileResponse & {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    professionalType: ProfessionalType | null;
  };
};

@Injectable()
export class ProfessionalsService {
  constructor(private prisma: PrismaService) {}

  async getMyProfile(userId: string): Promise<ProfessionalProfileResponse | null> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    return profile ? this.serialize(profile) : null;
  }

  async upsertMyProfile(
    userId: string,
    dto: UpdateMyProfileDto,
  ): Promise<ProfessionalProfileResponse> {
    const licenseExpiry = dto.licenseExpiry ? new Date(dto.licenseExpiry) : null;
    const data = {
      regulatoryBody: dto.regulatoryBody,
      licenseNumber: dto.licenseNumber,
      licenseExpiry,
      // Any edit resets the review state to PENDING.
      verifiedStatus: "PENDING",
      verifiedById: null,
      verifiedAt: null,
      rejectionNote: null,
    };

    const profile = await this.prisma.professionalProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.serialize(profile);
  }

  async listPending(): Promise<PendingCredentialResponse[]> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { verifiedStatus: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            professionalType: true,
          },
        },
      },
    });

    return profiles.map((profile) => {
      const { user, ...rest } = profile as ProfessionalProfile & { user: PendingUser };
      return {
        ...this.serialize(rest),
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          professionalType: user.professionalType,
        },
      };
    });
  }

  async verify(
    id: string,
    dto: VerifyCredentialDto,
    actorId: string,
  ): Promise<ProfessionalProfileResponse> {
    const existing = await this.prisma.professionalProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Professional profile not found");

    const profile = await this.prisma.professionalProfile.update({
      where: { id },
      data: {
        verifiedStatus: dto.approve ? "VERIFIED" : "REJECTED",
        verifiedById: actorId,
        verifiedAt: new Date(),
        rejectionNote: dto.approve ? null : (dto.rejectionNote ?? null),
      },
    });
    return this.serialize(profile);
  }

  private serialize(profile: ProfessionalProfile): ProfessionalProfileResponse {
    return {
      id: profile.id,
      userId: profile.userId,
      regulatoryBody: profile.regulatoryBody,
      licenseNumber: profile.licenseNumber,
      licenseExpiry: profile.licenseExpiry?.toISOString() ?? null,
      verifiedStatus: profile.verifiedStatus,
      verifiedById: profile.verifiedById,
      verifiedAt: profile.verifiedAt?.toISOString() ?? null,
      rejectionNote: profile.rejectionNote,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
