import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type PaymentReceiptData = {
  serviceId: string;
  transactionPublicId: string;
  caseId: string;
  buyerPublicId: string;
  propertyTitle: string;
  propertyLocation: string;
  services: string[];
  total: string;
  currency: string;
  activationLink: string;
  guestName: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPaymentReceipt(to: string, data: PaymentReceiptData): Promise<void> {
    const subject = `SafeBuyRealties payment receipt — ${data.serviceId}`;
    const text = this.buildReceiptText(data);
    const html = this.buildReceiptHtml(data);

    this.logger.log(`Payment receipt for ${to}:\n${text}`);

    const host = this.config.get<string>("SMTP_HOST")?.trim();
    if (!host) return;

    const port = Number(this.config.get<string>("SMTP_PORT") ?? "587");
    const user = this.config.get<string>("SMTP_USER")?.trim();
    const pass = this.config.get<string>("SMTP_PASS")?.trim();
    const from =
      this.config.get<string>("SMTP_FROM")?.trim() ?? "noreply@safebuyrealties.com";

    try {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      await transport.sendMail({ from, to, subject, text, html });
      this.logger.log(`Payment receipt emailed to ${to}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP send failed (${message}); receipt logged above`);
    }
  }

  private buildReceiptText(data: PaymentReceiptData): string {
    const lines = [
      `Hello ${data.guestName},`,
      "",
      "Thank you for your payment. Your due diligence order is confirmed.",
      "",
      `Service ID: ${data.serviceId}`,
      `Transaction ID: ${data.transactionPublicId}`,
      `Case ID: ${data.caseId}`,
      `Buyer ID: ${data.buyerPublicId}`,
      "",
      `Property: ${data.propertyTitle}`,
      `Location: ${data.propertyLocation}`,
      "",
      "Services:",
      ...data.services.map((s) => `  - ${s}`),
      "",
      `Total paid: ${data.currency} ${data.total}`,
      "",
      "Activate your buyer account to track this order:",
      data.activationLink,
    ];
    return lines.join("\n");
  }

  private buildReceiptHtml(data: PaymentReceiptData): string {
    const services = data.services.map((s) => `<li>${s}</li>`).join("");
    return `
      <p>Hello ${data.guestName},</p>
      <p>Thank you for your payment. Your due diligence order is confirmed.</p>
      <ul>
        <li><strong>Service ID:</strong> ${data.serviceId}</li>
        <li><strong>Transaction ID:</strong> ${data.transactionPublicId}</li>
        <li><strong>Case ID:</strong> ${data.caseId}</li>
        <li><strong>Buyer ID:</strong> ${data.buyerPublicId}</li>
      </ul>
      <p><strong>Property:</strong> ${data.propertyTitle}<br/>
      <strong>Location:</strong> ${data.propertyLocation}</p>
      <p><strong>Services:</strong></p>
      <ul>${services}</ul>
      <p><strong>Total paid:</strong> ${data.currency} ${data.total}</p>
      <p><a href="${data.activationLink}">Activate your buyer account</a> to track this order.</p>
    `;
  }
}
