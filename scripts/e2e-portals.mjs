import { chromium } from "playwright";
import { mkdirSync } from "fs";

const APP = process.env.SBR_APP_URL || "http://localhost:8080";
const OUT = "/opt/cursor/artifacts/screenshots";
mkdirSync(OUT, { recursive: true });

const results = [];

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function login(page, portal, email, password = "password123") {
  await page.goto(`${APP}/login/${portal}`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/dashboard\//, { timeout: 25000 }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
  // Auth gate can briefly bounce; wait until workspace chrome is visible.
  await page.getByText(/ADMIN PORTAL|WORKSPACE|dashboard/i).first().waitFor({
    timeout: 20000,
  });
}

async function logout(page) {
  const btn = page.getByRole("button", { name: /log out|logout|sign out/i }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForURL(/\/(login|$)/, { timeout: 15000 }).catch(() => {});
  } else {
    await page.evaluate(async () => {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    });
    await page.goto(`${APP}/login`);
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // 1 Buyer
  await login(page, "buyer", "buyer@safebuyrealties.test");
  await page.waitForURL(/\/dashboard\/buyer/, { timeout: 20000 });
  results.push({
    step: "buyer-login",
    ok: page.url().includes("/dashboard/buyer"),
    shot: await shot(page, "e2e-buyer-dashboard"),
  });

  await page.goto(`${APP}/dashboard/buyer/due-diligence`, { waitUntil: "networkidle" });
  results.push({
    step: "buyer-dd",
    ok: page.url().includes("due-diligence"),
    shot: await shot(page, "e2e-buyer-dd"),
  });

  await logout(page);

  // 2 Seller
  await login(page, "seller", "seller@safebuyrealties.test");
  await page.waitForURL(/\/dashboard\/seller/, { timeout: 20000 });
  results.push({
    step: "seller-login",
    ok: page.url().includes("/dashboard/seller"),
    shot: await shot(page, "e2e-seller-dashboard"),
  });
  await logout(page);

  // 3 Professional
  await login(page, "professional", "lawyer@safebuyrealties.test");
  await page.waitForURL(/\/dashboard\/professional|\/onboarding\/professional/, {
    timeout: 20000,
  });
  results.push({
    step: "pro-login",
    ok: /professional/.test(page.url()),
    shot: await shot(page, "e2e-pro-dashboard"),
  });
  await logout(page);

  // 4 Wrong portal
  await page.goto(`${APP}/login/admin`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("buyer@safebuyrealties.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(1000);
  const errText = await page.locator(".text-destructive, [class*=destructive]").first().textContent().catch(() => "");
  const wrongOk = /cannot sign in|admin portal|portal/i.test(errText || "");
  results.push({
    step: "wrong-portal",
    ok: wrongOk,
    detail: errText,
    shot: await shot(page, "e2e-wrong-portal"),
  });

  // 5 Content admin
  await login(page, "admin", "content-admin@safebuyrealties.test");
  await page.waitForURL(/\/dashboard\/(admin|super-admin)/, { timeout: 20000 });
  const nav = await page.locator("nav, aside").first().innerText();
  const contentOk =
    /DD Checklists|Checklists/i.test(nav) && !/\bEscrow\b/i.test(nav);
  results.push({
    step: "content-admin-nav",
    ok: contentOk,
    detail: nav.slice(0, 400),
    shot: await shot(page, "e2e-content-admin"),
  });
  // Role title should show named admin role
  const roleShown = /Content Manager/i.test(nav);
  results.push({
    step: "content-admin-role-label",
    ok: roleShown,
    detail: nav.slice(0, 400),
  });
  await page.goto(`${APP}/dashboard/admin/checklists`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const cmsText = await page.locator("main").innerText();
  results.push({
    step: "content-admin-cms",
    ok: /LEGAL_CHECK|Schedule|checklist|Legal/i.test(cmsText),
    shot: await shot(page, "e2e-dd-checklists-cms"),
  });
  await logout(page);

  // 6 Finance admin
  await login(page, "admin", "finance-admin@safebuyrealties.test");
  await page.waitForURL(/\/dashboard\/(admin|super-admin)/, { timeout: 20000 });
  const finNav = await page.locator("nav, aside").first().innerText();
  const financeOk = /\bEscrow\b/i.test(finNav) && !/DD Checklists|Checklists/i.test(finNav);
  results.push({
    step: "finance-admin-nav",
    ok: financeOk,
    detail: finNav.slice(0, 300),
    shot: await shot(page, "e2e-finance-admin"),
  });
  await logout(page);

  // 7 Staff — lands on unified admin portal
  await login(page, "admin", "staff@safebuyrealties.test");
  await page.waitForURL(/\/dashboard\/admin/, { timeout: 20000 });
  results.push({
    step: "staff-login",
    ok: page.url().includes("/dashboard/admin"),
    shot: await shot(page, "e2e-staff-dashboard"),
  });
  await page.goto(`${APP}/dashboard/admin/due-diligence`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  results.push({
    step: "staff-dd-queue",
    ok: page.url().includes("due-diligence"),
    shot: await shot(page, "e2e-staff-dd"),
  });

  // 8 Full admin users + permissions
  await logout(page);
  await login(page, "admin", "admin@safebuyrealties.test");
  await page.waitForURL(/\/dashboard\/admin/, { timeout: 20000 });
  await page.goto(`${APP}/dashboard/admin/users`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const usersText = await page.locator("main").innerText();
  results.push({
    step: "admin-users",
    ok: /content-admin|Users|Permissions|staff@/i.test(usersText),
    shot: await shot(page, "e2e-admin-users"),
  });

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error("FAILED:", failed.map((f) => f.step).join(", "));
    process.exit(1);
  }
  console.log("ALL_PASSED", results.length);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
