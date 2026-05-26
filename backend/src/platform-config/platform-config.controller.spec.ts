import { Test, TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { PlatformConfigController } from "./platform-config.controller";
import { PlatformConfigService } from "./platform-config.service";

describe("PlatformConfigController", () => {
  let controller: PlatformConfigController;
  let service: {
    get: jest.Mock;
    getForRole: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    const fullConfig = {
      id: "singleton",
      vatRate: "0.075",
      maxUploadMb: 15,
      paystackEnabled: true,
      flutterwaveEnabled: false,
      maintenanceMode: false,
      updatedAt: "2026-05-26T12:00:00.000Z",
    };
    service = {
      get: jest.fn().mockResolvedValue(fullConfig),
      getForRole: jest.fn((_role, config) => config),
      update: jest.fn().mockResolvedValue({ ...fullConfig, vatRate: "0.08" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformConfigController],
      providers: [{ provide: PlatformConfigService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PlatformConfigController);
  });

  it("uses JWT authentication at the controller level", () => {
    const guards = Reflect.getMetadata("__guards__", PlatformConfigController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  it("restricts PATCH to admins", () => {
    const reflector = new Reflector();
    const roles = reflector.get<UserRole[]>(ROLES_KEY, controller.update);
    const guards = Reflect.getMetadata("__guards__", controller.update);

    expect(roles).toEqual([UserRole.ADMIN]);
    expect(guards).toEqual(expect.arrayContaining([RolesGuard]));
  });

  it("delegates GET and PATCH to the service", async () => {
    const admin = { sub: "admin-1", role: UserRole.ADMIN } as Parameters<typeof controller.get>[0];
    await expect(controller.get(admin)).resolves.toMatchObject({ vatRate: "0.075" });
    await expect(
      controller.update({ vatRate: 0.08 }, { sub: "admin-1", role: UserRole.ADMIN } as Parameters<
        typeof controller.update
      >[1]),
    ).resolves.toMatchObject({ vatRate: "0.08" });

    expect(service.get).toHaveBeenCalledTimes(1);
    expect(service.getForRole).toHaveBeenCalledWith(UserRole.ADMIN, expect.any(Object));
    expect(service.update).toHaveBeenCalledWith({ vatRate: 0.08 }, "admin-1");
  });
});
