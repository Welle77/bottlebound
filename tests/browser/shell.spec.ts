import { expect, test } from "@playwright/test";

test("the installed shell shows readiness and reloads offline", async ({
  context,
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Referee Console" }),
  ).toBeVisible();
  await expect(
    page.getByText("Canonical storage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[data-status="ready"]', { hasText: "Canonical storage" }),
  ).toBeVisible();

  const createMatch = page.getByRole("button", { name: "Create Match" });
  await expect(createMatch).toBeEnabled();
  const target = await createMatch.boundingBox();
  expect(target?.height).toBeGreaterThanOrEqual(48);

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(
    page.locator('[data-status="controlled"]', { hasText: "Service worker" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-status="ready"]', { hasText: "Offline shell" }),
  ).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Referee Console" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-status="ready"]', { hasText: "Offline shell" }),
  ).toBeVisible();
});

test("a failed storage probe keeps Match creation blocked and retryable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: {
        open: () => {
          throw new Error("storage disabled for check");
        },
      },
    });
  });

  await page.goto("/");

  await expect(
    page.locator('[data-status="failed"]', { hasText: "Canonical storage" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Match" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry storage check" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Referee Console" }),
  ).toBeVisible();
});
