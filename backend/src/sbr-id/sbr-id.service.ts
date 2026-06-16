import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const LOCATION_CODES: { pattern: RegExp; code: string }[] = [
  { pattern: /ikorodu/i, code: "IKY" },
  { pattern: /abuja|fct/i, code: "ABJ" },
  { pattern: /port\s*harcourt/i, code: "PHC" },
  { pattern: /ibadan/i, code: "IBA" },
  { pattern: /kano/i, code: "KAN" },
  { pattern: /enugu/i, code: "ENU" },
  { pattern: /calabar/i, code: "CAL" },
  {
    pattern: /lagos|ikeja|lekki|victoria\s*island|ikoyi|ajah|surulere|yaba/i,
    code: "LOS",
  },
];

export function resolveLocationCode(location: string): string {
  const trimmed = location.trim();
  for (const { pattern, code } of LOCATION_CODES) {
    if (pattern.test(trimmed)) return code;
  }
  return "LOS";
}

@Injectable()
export class SbrIdService {
  constructor(private prisma: PrismaService) {}

  private formatDateKey(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }

  private formatYearKey(d = new Date()): string {
    return String(d.getFullYear());
  }

  private async nextSequence(prefix: string, dateKey: string): Promise<number> {
    const row = await this.prisma.idSequence.upsert({
      where: { prefix_dateKey: { prefix, dateKey } },
      create: { prefix, dateKey, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return row.lastValue;
  }

  private pad(value: number, length: number): string {
    return String(value).padStart(length, "0");
  }

  async nextBuyerId(location = "Lagos"): Promise<string> {
    const loc = resolveLocationCode(location);
    const prefix = `SBR-BUY-${loc}`;
    const dateKey = this.formatDateKey();
    const seq = await this.nextSequence(prefix, dateKey);
    return `${prefix}-${dateKey}-${this.pad(seq, 3)}`;
  }

  async nextSellerId(location = "Lagos"): Promise<string> {
    const loc = resolveLocationCode(location);
    const prefix = `SBR-SEL-${loc}`;
    const dateKey = this.formatDateKey();
    const seq = await this.nextSequence(prefix, dateKey);
    return `${prefix}-${dateKey}-${this.pad(seq, 3)}`;
  }

  async nextPropertyId(location: string): Promise<string> {
    const loc = resolveLocationCode(location);
    const prefix = `SBR-PROP-${loc}`;
    const dateKey = this.formatYearKey();
    const seq = await this.nextSequence(prefix, dateKey);
    return `${prefix}-${dateKey}-${this.pad(seq, 5)}`;
  }

  async nextServiceId(): Promise<string> {
    const prefix = "SBR-SRV-BUY";
    const dateKey = this.formatDateKey();
    const seq = await this.nextSequence(prefix, dateKey);
    return `${prefix}-${dateKey}-${this.pad(seq, 3)}`;
  }

  async nextCaseId(location: string): Promise<string> {
    const loc = resolveLocationCode(location);
    const prefix = `SBR-CASE-DD-${loc}`;
    const dateKey = this.formatDateKey();
    const seq = await this.nextSequence(prefix, dateKey);
    return `${prefix}-${dateKey}-${this.pad(seq, 3)}`;
  }

  async nextTransactionId(): Promise<string> {
    const prefix = "SBR-TXN";
    const dateKey = this.formatDateKey();
    const seq = await this.nextSequence(prefix, dateKey);
    return `${prefix}-${dateKey}-${this.pad(seq, 3)}`;
  }
}
