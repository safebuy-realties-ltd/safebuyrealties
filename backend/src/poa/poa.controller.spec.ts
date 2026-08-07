import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PoaController } from "./poa.controller";
import { PoaService } from "./poa.service";

const hash64 = "a".repeat(64);

describe("PoaController", () => {
  let controller: PoaController;
  let service: { execute: jest.Mock; verifyByHash: jest.Mock };

  beforeEach(async () => {
    service = {
      execute: jest.fn(),
      verifyByHash: jest.fn().mockResolvedValue({
        verified: true,
        documentHash: hash64,
        listingTitle: "4-Bed Duplex",
        listingAddress: "Lekki Phase 1, Lagos",
        executedAt: "2026-05-26T12:00:00.000Z",
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PoaController],
      providers: [{ provide: PoaService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PoaController);
  });

  it("applies no guard at the controller level", () => {
    expect(Reflect.getMetadata("__guards__", PoaController)).toBeUndefined();
  });

  it("keeps GET /poa/verify outside JwtAuthGuard", () => {
    const guards = Reflect.getMetadata("__guards__", controller.verify) as unknown[] | undefined;

    expect(guards ?? []).toHaveLength(0);
  });

  it("still guards POST /poa/execute, so the absence above is deliberate", () => {
    const guards = Reflect.getMetadata("__guards__", controller.execute) as unknown[];

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it("serves an unauthenticated verify request", async () => {
    await expect(controller.verify(hash64)).resolves.toMatchObject({
      verified: true,
      documentHash: hash64,
      listingTitle: "4-Bed Duplex",
    });

    expect(service.verifyByHash).toHaveBeenCalledWith(hash64);
  });

  it("passes an empty string through when the hash query is missing", async () => {
    service.verifyByHash.mockRejectedValueOnce(new NotFoundException());

    await expect(controller.verify(undefined as unknown as string)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(service.verifyByHash).toHaveBeenCalledWith("");
  });
});
