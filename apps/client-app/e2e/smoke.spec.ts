import { expect, test } from "@playwright/test";

test("login and raise complaint", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("SocietyHub").first()).toBeVisible();

  await page.getByTestId("login-mode-otp").click();
  await page.getByLabel("Mobile").fill("8888888888");
  await page.getByRole("button", { name: "Send OTP" }).click();
  await expect(page.getByLabel("OTP")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("OTP").fill("123456");
  await page.getByRole("button", { name: "Verify & continue" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("link", { name: "Complaints" }).click();
  await expect(page.getByRole("heading", { name: "Complaints" })).toBeVisible();

  await page.getByRole("link", { name: "Raise complaint" }).click();
  await page.getByLabel("Title").fill("Playwright leak");
  await page.getByLabel("Type").selectOption("plumbing");
  await page.getByLabel("Description").fill("Automated smoke complaint");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("Playwright leak")).toBeVisible({ timeout: 15_000 });
});
