import { expect, test } from "@playwright/test";

test("public deployment serves the live recommendation workflow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Live API connected").first()).toBeVisible();
  await page.getByRole("button", { name: "Run playground" }).click();
  await expect(
    page.getByRole("heading", { name: "Recommendation playground" }),
  ).toBeVisible();
  await expect(page.locator(".recommendations article")).toHaveCount(10);
  await page.getByRole("button", { name: "Run policy" }).click();
  await expect(page.getByText("API unavailable")).toHaveCount(0);
});
