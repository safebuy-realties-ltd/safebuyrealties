import { Test, TestingModule } from "@nestjs/testing";
import { SbrIdService, resolveLocationCode } from "./sbr-id.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * CHARACTERISATION TEST.
 *
 * Every assertion here pins what this code does TODAY. Several of them pin
 * behaviour we already believe is wrong, deliberately, so that when E9-S2
 * changes the location mapping there is a before-picture to diff against and
 * no change can happen silently. A failure in this file after E9-S2 is
 * expected; a failure before it is a regression.
 *
 * The two known-wrong mappings are marked KNOWN WRONG below and are logged
 * against EXT-8. Do not "fix" them here. This file records the starting
 * position, it does not endorse it.
 */

// Pinned so the date-derived segments are asserted as literals rather than
// recomputed by the test. Constructed in local time on purpose: the service
// reads getFullYear/getMonth/getDate, which are local, so this stays stable
// whatever TZ the suite runs under.
const PINNED_NOW = new Date(2026, 6, 17, 12, 0, 0);
const PINNED_DATE_KEY = "20260717";
const PINNED_YEAR_KEY = "2026";

describe("resolveLocationCode, characterisation", () => {
  describe("the two mappings that disagree with the ID Standard", () => {
    it("KNOWN WRONG: maps Ikorodu to IKY, which is Ikoyi's code in the standard", () => {
      // The standard gives Ikorodu IKD and IKY to Ikoyi. This mapping claims
      // Ikoyi's code for Ikorodu, so an Ikorodu identifier is indistinguishable
      // from an Ikoyi one. EXT-8.
      expect(resolveLocationCode("Ikorodu")).toBe("IKY");
    });

    it("KNOWN WRONG: Ikoyi itself does not get IKY, it falls into the LOS catch-all", () => {
      // The other half of the same collision, and the reason it survived
      // unnoticed: nothing ever produced an IKY that meant Ikoyi.
      expect(resolveLocationCode("Ikoyi")).toBe("LOS");
    });

    it("KNOWN WRONG: maps Ibadan to IBA, which is in neither register", () => {
      // The standard's code for Ibadan is IBD. IBA is not a code in the Lagos
      // register or the national one. EXT-8.
      expect(resolveLocationCode("Ibadan")).toBe("IBA");
    });
  });

  describe("national codes that currently agree with the standard", () => {
    it.each([
      ["Abuja", "ABJ"],
      ["FCT", "ABJ"],
      ["Port Harcourt", "PHC"],
      ["Kano", "KAN"],
      ["Enugu", "ENU"],
      ["Calabar", "CAL"],
    ])("maps %s to %s", (input, expected) => {
      expect(resolveLocationCode(input)).toBe(expected);
    });

    it("accepts Port Harcourt with any amount of internal whitespace, including none", () => {
      expect(resolveLocationCode("PortHarcourt")).toBe("PHC");
      expect(resolveLocationCode("Port  Harcourt")).toBe("PHC");
    });
  });

  describe("the LOS catch-all", () => {
    // Eight distinct Lagos areas collapse onto one code. The standard gives
    // most of them their own property code (LEK, IKY, SUR, YAB and so on), so
    // this is lossy on purpose today and is what E9-S2 is expected to widen.
    it.each(["Lagos", "Ikeja", "Lekki", "Victoria Island", "Ikoyi", "Ajah", "Surulere", "Yaba"])(
      "collapses %s to LOS",
      (input) => {
        expect(resolveLocationCode(input)).toBe("LOS");
      },
    );

    it("accepts Victoria Island with or without the space", () => {
      expect(resolveLocationCode("victoriaisland")).toBe("LOS");
      expect(resolveLocationCode("Victoria  Island")).toBe("LOS");
    });
  });

  describe("the unmatched default at line 23", () => {
    // Anything the table does not recognise is silently called Lagos. There is
    // no error, no null, and no signal at the call site that the location was
    // not understood.
    it.each(["Jos", "Kaduna", "Benin City", "Timbuktu", "", "   ", "12345"])(
      "silently returns LOS for the unrecognised input %p",
      (input) => {
        expect(resolveLocationCode(input)).toBe("LOS");
      },
    );
  });

  describe("matching rules", () => {
    it("is case insensitive", () => {
      expect(resolveLocationCode("IKORODU")).toBe("IKY");
      expect(resolveLocationCode("iKoRoDu")).toBe("IKY");
      expect(resolveLocationCode("abuja")).toBe("ABJ");
    });

    it("trims surrounding whitespace", () => {
      expect(resolveLocationCode("   Abuja   ")).toBe("ABJ");
      expect(resolveLocationCode("\tKano\n")).toBe("KAN");
    });

    it("matches on substring, so a full street address resolves", () => {
      expect(resolveLocationCode("12 Herbert Macaulay Way, Yaba")).toBe("LOS");
      expect(resolveLocationCode("Plot 4, Admiralty Way, Lekki Phase 1")).toBe("LOS");
    });

    it("takes the first match in table order, not the most specific one", () => {
      // Both of these are the consequence of substring matching plus a fixed
      // table order, and both produce a code most readers would not predict.
      // An address on Ikorodu Road in Lagos is coded IKY, not LOS, because
      // the Ikorodu entry sits above the Lagos entry.
      expect(resolveLocationCode("Ikorodu Road, Lagos")).toBe("IKY");
      // A Lagos street named after another city takes that city's code.
      expect(resolveLocationCode("Kano Street, Lagos")).toBe("KAN");
    });
  });
});

describe("SbrIdService, characterisation", () => {
  let service: SbrIdService;
  let prisma: {
    idSequence: { upsert: jest.Mock };
  };

  const givenSequence = (lastValue: number) => {
    prisma.idSequence.upsert.mockResolvedValue({ lastValue });
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(PINNED_NOW);

    prisma = {
      idSequence: { upsert: jest.fn().mockResolvedValue({ lastValue: 1 }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SbrIdService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SbrIdService>(SbrIdService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("nextBuyerId", () => {
    it("defaults the location to Lagos when called with no argument", async () => {
      await expect(service.nextBuyerId()).resolves.toBe(`SBR-BUY-LOS-${PINNED_DATE_KEY}-001`);
    });

    it("carries the resolved location code, including the wrong one", async () => {
      await expect(service.nextBuyerId("Ikorodu")).resolves.toBe(
        `SBR-BUY-IKY-${PINNED_DATE_KEY}-001`,
      );
    });

    it("keys the sequence on the location-bearing prefix and the date", async () => {
      await service.nextBuyerId("Abuja");

      expect(prisma.idSequence.upsert).toHaveBeenCalledWith({
        where: {
          prefix_dateKey: { prefix: "SBR-BUY-ABJ", dateKey: PINNED_DATE_KEY },
        },
        create: {
          prefix: "SBR-BUY-ABJ",
          dateKey: PINNED_DATE_KEY,
          lastValue: 1,
        },
        update: { lastValue: { increment: 1 } },
      });
    });
  });

  describe("nextSellerId", () => {
    it("defaults the location to Lagos when called with no argument", async () => {
      await expect(service.nextSellerId()).resolves.toBe(`SBR-SEL-LOS-${PINNED_DATE_KEY}-001`);
    });

    it("carries the resolved location code", async () => {
      await expect(service.nextSellerId("Enugu")).resolves.toBe(
        `SBR-SEL-ENU-${PINNED_DATE_KEY}-001`,
      );
    });
  });

  describe("nextPropertyId", () => {
    it("keys on the year rather than the date, and pads the sequence to five", async () => {
      await expect(service.nextPropertyId("Lagos")).resolves.toBe(
        `SBR-PROP-LOS-${PINNED_YEAR_KEY}-00001`,
      );
    });

    it("requires a location, and collapses Lekki to LOS like everything else", async () => {
      // Property is the one identifier type both the standard and the code
      // agree draws from the Lagos property register, and LEK exists there.
      await expect(service.nextPropertyId("Lekki")).resolves.toBe(
        `SBR-PROP-LOS-${PINNED_YEAR_KEY}-00001`,
      );
    });

    it("uses the year as the sequence dateKey, so one counter serves the whole year", async () => {
      await service.nextPropertyId("Kano");

      expect(prisma.idSequence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            prefix_dateKey: {
              prefix: "SBR-PROP-KAN",
              dateKey: PINNED_YEAR_KEY,
            },
          },
        }),
      );
    });
  });

  describe("nextServiceId", () => {
    it("hard-codes BUY and takes no location at all", async () => {
      // Every service request the platform issues asserts it is a buyer
      // request. FinGov writes this segment as TYPE. EXT-8.
      await expect(service.nextServiceId()).resolves.toBe(`SBR-SRV-BUY-${PINNED_DATE_KEY}-001`);
    });
  });

  describe("nextCaseId", () => {
    it("carries the DD segment and the resolved location", async () => {
      await expect(service.nextCaseId("Port Harcourt")).resolves.toBe(
        `SBR-CASE-DD-PHC-${PINNED_DATE_KEY}-001`,
      );
    });

    it("returns a LOS case id for an unrecognised location rather than failing", async () => {
      await expect(service.nextCaseId("Jos")).resolves.toBe(
        `SBR-CASE-DD-LOS-${PINNED_DATE_KEY}-001`,
      );
    });
  });

  describe("nextTransactionId", () => {
    it("carries no location segment", async () => {
      await expect(service.nextTransactionId()).resolves.toBe(`SBR-TXN-${PINNED_DATE_KEY}-001`);
    });
  });

  describe("sequence padding", () => {
    it("pads to three for the date-keyed types", async () => {
      givenSequence(42);
      await expect(service.nextBuyerId()).resolves.toBe(`SBR-BUY-LOS-${PINNED_DATE_KEY}-042`);
    });

    it("pads to five for property", async () => {
      givenSequence(42);
      await expect(service.nextPropertyId("Lagos")).resolves.toBe(
        `SBR-PROP-LOS-${PINNED_YEAR_KEY}-00042`,
      );
    });

    it("overflows the stated width rather than wrapping or throwing", async () => {
      // padStart does not truncate. Past 999 in a day the sequence simply gets
      // longer, so the segment stops being fixed-width. Pinned because any
      // consumer parsing by offset would break here.
      givenSequence(1234);
      await expect(service.nextBuyerId()).resolves.toBe(`SBR-BUY-LOS-${PINNED_DATE_KEY}-1234`);
    });
  });
});
