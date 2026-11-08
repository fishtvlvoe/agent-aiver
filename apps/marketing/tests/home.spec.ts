import { expect, test } from "@playwright/test";

test.describe("home page", () => {
	test("should load", async ({ page }) => {
		await page.goto("/");

		await expect(
			page.getByRole("heading", {
				name: "讓 AI 店員，24 小時在 LINE 上回客人",
			}),
		).toBeVisible();

		await expect(page.locator('[data-test="navigation"]')).toBeVisible();
	});
});
