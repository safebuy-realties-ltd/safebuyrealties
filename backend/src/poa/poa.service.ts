import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PowerOfAttorney, UserRole } from "@prisma/client";
import { createHash } from "crypto";
import PDFDocument from "pdfkit";
import * as QRCode from "qrcode";
import * as path from "path";
import { JwtPayload } from "../auth/jwt.strategy";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ExecutePoaDto } from "./dto/execute-poa.dto";

const VERIFY_BASE_URL = "https://safebuyrealties.com/verify";

export type PoaConsentFlags = {
  legalCapacity: boolean;
  witnessingRequired: boolean;
  landRegistryRegistration: boolean;
  irrevocability: boolean;
};

export type PowerOfAttorneyResponse = {
  id: string;
  transactionId: string;
  buyerId: string;
  listingId: string;
  pdfStorageKey: string;
  documentHash: string;
  qrCodeStorageKey: string;
  signatureMethod: string;
  signatureName: string;
  consentFlags: PoaConsentFlags;
  executedAt: string;
};

export type PoaVerifyResponse = {
  verified: true;
  documentHash: string;
  buyerName: string;
  listingTitle: string;
  listingAddress: string;
  executedAt: string;
  signatureMethod: string;
};

@Injectable()
export class PoaService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  computeDocumentHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  buildVerifyUrl(hash: string): string {
    return `${VERIFY_BASE_URL}?hash=${hash}`;
  }

  async generate(
    buyerName: string,
    listingTitle: string,
    listingAddress: string,
    executedAt: Date,
    signatureName: string,
    signatureMethod: string,
    consentFlags: PoaConsentFlags,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).font("Helvetica-Bold").text("SafeBuyRealties", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(14).text("IRREVOCABLE POWER OF ATTORNEY", { align: "center" });
      doc.moveDown(1);

      doc.fontSize(11).font("Helvetica");
      doc.text(`Date of Execution: ${executedAt.toISOString().slice(0, 10)}`);
      doc.text(`Principal (Buyer): ${buyerName}`);
      doc.text(`Property: ${listingTitle}`);
      doc.text(`Property Address: ${listingAddress}`);
      doc.moveDown(1);

      doc.font("Helvetica-Bold").text("1. Appointment");
      doc.font("Helvetica").text(
        "I, the Principal named above, hereby irrevocably appoint SafeBuyRealties " +
          "(the \"Attorney\") as my true and lawful attorney-in-fact to act on my behalf " +
          "in connection with the acquisition and perfection of title to the property described above.",
      );
      doc.moveDown(0.75);

      doc.font("Helvetica-Bold").text("2. Scope of Authority");
      doc.font("Helvetica").text(
        "The Attorney is authorised to: (a) conduct due diligence and verification in respect of " +
          "the property; (b) process and perfect title documentation; (c) apply for and obtain " +
          "Governor's Consent and Certificate of Occupancy where applicable; (d) pay statutory " +
          "fees and charges on my behalf; (e) receive, execute, and deliver documents necessary " +
          "for the transaction; and (f) take any ancillary steps reasonably required to complete " +
          "the purchase.",
      );
      doc.moveDown(0.75);

      doc.font("Helvetica-Bold").text("3. Revocation");
      doc.font("Helvetica").text(
        "This Power of Attorney is irrevocable until the completion of the transaction and " +
          "registration of title in my name, or until released in writing by SafeBuyRealties " +
          "following completion of all obligations under the transaction.",
      );
      doc.moveDown(0.75);

      doc.font("Helvetica-Bold").text("4. Indemnity");
      doc.font("Helvetica").text(
        "I agree to indemnify and hold harmless SafeBuyRealties, its officers, and agents against " +
          "all claims, losses, and expenses arising from actions taken in good faith pursuant to " +
          "this instrument, except where caused by gross negligence or wilful misconduct.",
      );
      doc.moveDown(0.75);

      doc.font("Helvetica-Bold").text("5. Legal Framework");
      doc.font("Helvetica").text(
        "This instrument is executed in accordance with the laws of the Federal Republic of Nigeria, " +
          "including the Evidence Act 2011 and the Electronic Transactions Act 2023. I acknowledge " +
          "that independent witnessing may be required for this document to be legally binding and " +
          "that registration at the relevant Land Registry within 60 days is my responsibility.",
      );
      doc.moveDown(1);

      doc.font("Helvetica-Bold").text("6. Consents Confirmed");
      doc.font("Helvetica");
      doc.text(`• Legal capacity: ${consentFlags.legalCapacity ? "Yes" : "No"}`);
      doc.text(`• Witnessing requirement acknowledged: ${consentFlags.witnessingRequired ? "Yes" : "No"}`);
      doc.text(
        `• Land Registry registration within 60 days: ${consentFlags.landRegistryRegistration ? "Yes" : "No"}`,
      );
      doc.text(`• Irrevocability acknowledged: ${consentFlags.irrevocability ? "Yes" : "No"}`);
      doc.moveDown(1);

      doc.font("Helvetica-Bold").text("7. Signature");
      doc.font("Helvetica");
      doc.text(`Method: ${signatureMethod}`);
      doc.text(`Signed as: ${signatureName}`);
      doc.moveDown(2);
      doc.text("_______________________________");
      doc.text(signatureName);

      doc.end();
    });
  }

  async execute(
    dto: ExecutePoaDto,
    actor: JwtPayload,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<PowerOfAttorneyResponse> {
    if (actor.role !== UserRole.BUYER) {
      throw new ForbiddenException("Only buyers can execute a Power of Attorney");
    }

    const flags = dto.consentFlags;
    if (
      !flags.legalCapacity ||
      !flags.witnessingRequired ||
      !flags.landRegistryRegistration ||
      !flags.irrevocability
    ) {
      throw new BadRequestException("All consent acknowledgments must be accepted");
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: dto.transactionId },
      include: {
        listing: true,
        buyer: true,
        powerOfAttorney: true,
      },
    });
    if (!transaction) throw new NotFoundException("Transaction not found");
    if (transaction.buyerId !== actor.sub) {
      throw new ForbiddenException("You can only execute PoA for your own transaction");
    }
    if (transaction.powerOfAttorney) {
      throw new ConflictException("A Power of Attorney has already been executed for this transaction");
    }
    if (!transaction.listing || !transaction.listingId) {
      throw new BadRequestException("Power of Attorney requires a transaction linked to a listing");
    }

    const buyerName = `${transaction.buyer.firstName} ${transaction.buyer.lastName}`.trim();
    const executedAt = new Date();
    const pdfBuffer = await this.generate(
      buyerName,
      transaction.listing.title,
      transaction.listing.location,
      executedAt,
      dto.signatureName.trim(),
      dto.signatureMethod,
      flags,
    );

    const documentHash = this.computeDocumentHash(pdfBuffer);
    const verifyUrl = this.buildVerifyUrl(documentHash);
    const qrBuffer = await QRCode.toBuffer(verifyUrl, { type: "png", margin: 1, width: 256 });

    const pdfKey = path.join(
      "poa",
      transaction.id,
      `${executedAt.getTime()}_${documentHash.slice(0, 12)}.pdf`,
    );
    const qrKey = path.join("poa", transaction.id, `${documentHash.slice(0, 12)}_qr.png`);

    const [pdfStorageKey, qrCodeStorageKey] = await Promise.all([
      this.storage.upload(pdfBuffer, pdfKey, "application/pdf"),
      this.storage.upload(qrBuffer, qrKey, "image/png"),
    ]);

    const record = await this.prisma.powerOfAttorney.create({
      data: {
        transactionId: transaction.id,
        buyerId: actor.sub,
        listingId: transaction.listingId,
        pdfStorageKey,
        documentHash,
        qrCodeStorageKey,
        signatureMethod: dto.signatureMethod,
        signatureName: dto.signatureName.trim(),
        consentFlags: flags as object,
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
        executedAt,
      },
    });

    return this.serialize(record);
  }

  async verifyByHash(hash: string): Promise<PoaVerifyResponse> {
    const normalized = hash.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      throw new BadRequestException("Invalid document hash");
    }

    const record = await this.prisma.powerOfAttorney.findUnique({
      where: { documentHash: normalized },
      include: {
        buyer: true,
        listing: true,
      },
    });
    if (!record) {
      throw new NotFoundException("Power of Attorney not found");
    }

    return {
      verified: true,
      documentHash: record.documentHash,
      buyerName: `${record.buyer.firstName} ${record.buyer.lastName}`.trim(),
      listingTitle: record.listing.title,
      listingAddress: record.listing.location,
      executedAt: record.executedAt.toISOString(),
      signatureMethod: record.signatureMethod,
    };
  }

  private serialize(record: PowerOfAttorney): PowerOfAttorneyResponse {
    return {
      id: record.id,
      transactionId: record.transactionId,
      buyerId: record.buyerId,
      listingId: record.listingId,
      pdfStorageKey: record.pdfStorageKey,
      documentHash: record.documentHash,
      qrCodeStorageKey: record.qrCodeStorageKey,
      signatureMethod: record.signatureMethod,
      signatureName: record.signatureName,
      consentFlags: record.consentFlags as PoaConsentFlags,
      executedAt: record.executedAt.toISOString(),
    };
  }
}
