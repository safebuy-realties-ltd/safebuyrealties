#!/usr/bin/env node
/**
 * Standalone due diligence journey, in a browser: schedules → property → contact → review →
 * submit → PDF → staff queue. This is the one journey of the five that runs through the app
 * rather than the API, which is why it is the one that produces screenshots.
 *
 *   SBR_APP_URL=http://localhost:8080 node scripts/dd-checklist-e2e.mjs
 *
 * E7-S3 made the two things it had hard-coded configurable: the artifact directory, which pointed
 * at a path on a machine nobody here has, and the base URL, so CI can point it at its own server.
 */
import { chromium } from "playwright";
import fs from "fs";

const APP = (process.env.SBR_APP_URL ?? "http://localhost:8080").replace(/\/$/, "");
const outDir = process.env.SBR_E2E_ARTIFACT_DIR ?? "artifacts/e2e/standalone-dd";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(Number(process.env.SBR_E2E_TIMEOUT_MS ?? 20000));

const log = (...args) => console.log(...args);

try {
  await page.goto(`${APP}/due-diligence/request`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="dd-select-all-LEGAL_CHECK"]');

  // Ensure no recommended bundle / pay wording on schedules
  const bodyText = await page.locator('main').innerText();
  if (/Recommended|Bundle subtotal|Create order and pay/i.test(bodyText)) {
    throw new Error('Found legacy bundle/pay copy on schedules step');
  }

  await page.getByTestId('dd-select-all-LEGAL_CHECK').click();
  await page.waitForTimeout(300);
  const legalCount = await page.locator('text=10 of 10 selected').count();
  if (legalCount < 1) throw new Error('Legal select-all did not stick');

  await page.getByRole('button', { name: /Omo-onile/i }).click();
  await page.getByRole('button', { name: /Neighbourhood crime/i }).click();
  await page.waitForTimeout(300);

  await page.screenshot({ path: `${outDir}/01-schedules.png`, fullPage: true });

  await page.getByTestId('dd-continue-property').click();
  await page.getByText('Off-platform property').click();
  await page.getByLabel('Property address').fill('22 Awolowo Road');
  await page.getByRole('combobox').nth(0).click();
  await page.getByRole('option', { name: 'Lagos' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'Eti-Osa' }).click();
  await page.getByLabel('Property type').fill('Duplex');
  await page.getByRole('button', { name: /Continue to contact/i }).click();

  await page.getByLabel('Full name').fill('E2E Checklist User');
  await page.getByLabel('Email address').fill(`e2e.checklist.${Date.now()}@example.com`);
  await page.getByLabel('Phone number').fill('08039998888');
  await page.getByRole('button', { name: /Continue to review/i }).click();

  await page.waitForSelector('text=Review and submit');
  const reviewText = await page.locator('main').innerText();
  if (!/Submit request/i.test(reviewText)) throw new Error('Submit request button missing');
  if (/Create order and pay|Paystack/i.test(reviewText)) throw new Error('Payment copy still present');
  await page.screenshot({ path: `${outDir}/02-review.png`, fullPage: true });

  await page.getByRole('button', { name: /Submit request/i }).click();
  await page.waitForSelector('[data-testid="dd-download-pdf"]', { timeout: 30000 });
  await page.waitForTimeout(500);
  const confirmText = await page.locator('main').innerText();
  const serviceId = (confirmText.match(/SBR-SRV-BUY-\d+-\d+/) || [])[0];
  const caseId = (confirmText.match(/SBR-CASE-DD-[A-Z]+-\d+-\d+/) || [])[0];
  if (!serviceId) throw new Error('Service ID not found on confirmation');
  log('SERVICE_ID', serviceId);
  log('CASE_ID', caseId);

  await page.screenshot({ path: `${outDir}/03-confirmation.png`, fullPage: true });

  const pdfButton = page.getByTestId('dd-download-pdf');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    pdfButton.click(),
  ]);
  const pdfPath = `${outDir}/request-summary.pdf`;
  await download.saveAs(pdfPath);
  log('PDF_BYTES', fs.statSync(pdfPath).size);
  if (fs.statSync(pdfPath).size < 40000) {
    throw new Error('PDF looks like a text fallback, expected visual page capture');
  }

  // Staff login + queue. /login is the portal chooser and carries no form; the staff form lives at
  // /login/admin, which is where e2e-portals.mjs has always sent them.
  await page.goto(`${APP}/login/admin`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(process.env.SBR_STAFF_EMAIL ?? 'staff@safebuyrealties.test');
  await page.locator('#password').fill(process.env.SBR_PASSWORD ?? 'password123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForTimeout(1500);
  const afterLogin = page.url();
  log('AFTER_LOGIN', afterLogin);
  // Either way the next step is the same page. The branch used to differ and no longer does: the
  // cookie is set by the time the redirect resolves, so navigating directly works from both states.
  await page.goto(`${APP}/dashboard/staff/due-diligence`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`text=${serviceId}`, { timeout: 25000 });
  const queueText = await page.locator('main').innerText();
  if (!/Title search|Omo-onile|Suggested for this request|Lee Lawyer/i.test(queueText)) {
    throw new Error('Staff queue missing checklist or suggestions\n' + queueText.slice(0, 800));
  }
  await page.screenshot({ path: `${outDir}/04-staff-queue.png`, fullPage: true });
  log('STAFF_OK', true);
  log('E2E_PASS');
} catch (err) {
  await page.screenshot({ path: `${outDir}/error.png`, fullPage: true }).catch(() => {});
  console.error('E2E_FAIL', err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
