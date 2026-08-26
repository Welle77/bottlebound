import { expect, test } from "@playwright/test";

test("the Network readiness card follows online and offline events", async ({
  page,
}) => {
  await page.goto("/");

  // The Console boots with the browser's real connectivity and reflects
  // window network transitions in the System check panel. Synthetic events
  // drive the same public listeners a real transition fires; this check makes
  // no claim about navigator.onLine itself.
  await expect(
    page.getByRole("heading", { name: "Referee Console" }),
  ).toBeVisible();
  const onlineCard = page.locator('[data-status="online"]', {
    hasText: "Network",
  });
  await expect(onlineCard).toHaveCount(1);
  await expect(
    onlineCard.getByText("A network connection is available."),
  ).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const offlineCard = page.locator('[data-status="offline"]', {
    hasText: "Network",
  });
  await expect(offlineCard).toHaveCount(1);
  await expect(
    offlineCard.getByText(
      "No network connection. The cached shell can still work.",
    ),
  ).toBeVisible();
  await expect(page.locator('[data-status="online"]')).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.locator('[data-status="online"]', { hasText: "Network" }),
  ).toHaveCount(1);
  await expect(
    page
      .locator('[data-status="online"]')
      .getByText("A network connection is available."),
  ).toBeVisible();
});
