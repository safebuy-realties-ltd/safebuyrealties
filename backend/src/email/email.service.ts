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
  /** Present when the guest still needs to activate a buyer account */
  activationLink?: string | null;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  subtotal?: string;
  vatAmount?: string;
};

export type StaffDdAlertData = {
  serviceId: string;
  caseId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  propertyTitle: string;
  propertyLocation: string;
  services: string[];
  total: string;
  currency: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPaymentReceipt(to: string, data: PaymentReceiptData): Promise<void> {
    const subject = `SafeBuyRealties payment receipt — ${data.serviceId}`;
    const text = this.buildReceiptText(data);
    const html = this.buildReceiptHtml(data);
    await this.dispatch(to, subject, text, html, "Payment receipt");
  }

  async sendStaffDdAlert(data: StaffDdAlertData): Promise<void> {
    const to =
      this.config.get<string>("STAFF_ALERT_EMAIL")?.trim() ||
      this.config.get<string>("SMTP_FROM")?.trim() ||
      "ops@safebuyrealties.com";
    const subject = `New standalone DD payment — ${data.serviceId}`;
    const services = data.services.map((s) => `  - ${s}`).join("\n");
    const text = [
      "A guest completed payment for standalone due diligence.",
      "",
      `Service ID: ${data.serviceId}`,
      `Case ID: ${data.caseId}`,
      `Client: ${data.guestName} <${data.guestEmail}> ${data.guestPhone}`,
      `Property: ${data.propertyTitle}`,
      `Location: ${data.propertyLocation}`,
      "Services:",
      services,
      `Total: ${data.currency} ${data.total}`,
      "",
      "Open the staff due diligence queue to progress this case.",
    ].join("\n");
    const html = `<p>A guest completed payment for standalone due diligence.</p>
      <ul>
        <li><strong>Service ID:</strong> ${data.serviceId}</li>
        <li><strong>Case ID:</strong> ${data.caseId}</li>
        <li><strong>Client:</strong> ${data.guestName} &lt;${data.guestEmail}&gt; ${data.guestPhone}</li>
        <li><strong>Property:</strong> ${data.propertyTitle}</li>
        <li><strong>Location:</strong> ${data.propertyLocation}</li>
        <li><strong>Total:</strong> ${data.currency} ${data.total}</li>
      </ul>
      <p><strong>Services:</strong></p>
      <ul>${data.services.map((s) => `<li>${s}</li>`).join("")}</ul>
      <p>Open the staff due diligence queue to progress this case.</p>`;
    await this.dispatch(to, subject, text, html, "Staff DD alert");
  }

  private async dispatch(
    to: string,
    subject: string,
    text: string,
    html: string,
    label: string,
  ): Promise<void> {
    this.logger.log(`${label} for ${to}:\n${text}`);

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
      this.logger.log(`${label} emailed to ${to}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP send failed (${message}); ${label} logged above`);
    }
  }

  private buildReceiptText(data: PaymentReceiptData): string {
    const lines = [
      `Hello ${data.guestName},`,
      "",
      "Thank you for your payment. Your due diligence order is confirmed.",
      "",
      "IMPORTANT — Keep your Service ID",
      `Service ID: ${data.serviceId}`,
      "Use this Service ID on the Due Diligence page to look up your case anytime without logging in.",
      "",
      `Case ID: ${data.caseId}`,
      `Transaction ID: ${data.transactionPublicId}`,
      `Buyer ID: ${data.buyerPublicId}`,
      "",
      `Property: ${data.propertyTitle}`,
      `Location: ${data.propertyLocation}`,
      "",
      "Services requested:",
      ...data.services.map((s) => `  - ${s}`),
      "",
      data.subtotal ? `Subtotal: ${data.currency} ${data.subtotal}` : "",
      data.vatAmount ? `VAT: ${data.currency} ${data.vatAmount}` : "",
      `Total paid: ${data.currency} ${data.total}`,
      "",
      data.activationLink
        ? `Optional — activate your buyer account to track from the dashboard:\n${data.activationLink}`
        : "You can look up this case anytime with your Service ID (no account required).",
    ].filter(Boolean);
    return lines.join("\n");
  }

  private buildReceiptHtml(data: PaymentReceiptData): string {
    const services = data.services.map((s) => `<li>${s}</li>`).join("");
    const activation = data.activationLink
      ? `<p><a href="${data.activationLink}">Activate your buyer account</a> (optional) to track from the dashboard.</p>`
      : `<p>You can look up this case anytime with your Service ID — no account required.</p>`;
    return `
      <p>Hello ${data.guestName},</p>
      <p>Thank you for your payment. Your due diligence order is confirmed.</p>
      <p style="padding:12px;border:1px solid #0f766e;background:#ecfdf5;">
        <strong>Keep your Service ID:</strong> ${data.serviceId}<br/>
        Use it on the Due Diligence page to look up your case anytime without logging in.
      </p>
      <ul>
        <li><strong>Case ID:</strong> ${data.caseId}</li>
        <li><strong>Transaction ID:</strong> ${data.transactionPublicId}</li>
        <li><strong>Buyer ID:</strong> ${data.buyerPublicId}</li>
      </ul>
      <p><strong>Property:</strong> ${data.propertyTitle}<br/>
      <strong>Location:</strong> ${data.propertyLocation}</p>
      <p><strong>Services requested:</strong></p>
      <ul>${services}</ul>
      <p><strong>Total paid:</strong> ${data.currency} ${data.total}</p>
      ${activation}
    `;
  }
}
