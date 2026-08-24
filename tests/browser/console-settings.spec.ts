import { expect, test } from "@playwright/test";

const TOGGLE_LABEL = "Require manual physical confirmations";
const CHECK_LABELS = [
  "Range is legal",
  "Line of Sight is legal",
  "Every selected bottle was physically hit",
  "Terrain contact was resolved",
];

function toggle(page: import("@playwright/test").Page) {
  return page.getByRole("checkbox", { name: TOGGLE_LABEL });
}

async function startMatch(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
}

async function completePhysicalChecks(page: import("@playwright/test").Page) {
  for (const label of CHECK_LABELS) {
    await page.getByLabel(label).check();
  }
}

test("the toggle defaults to ON, persists OFF in device-local storage, and survives a reload", async ({
  page,
}) => {
  await page.goto("/");
  const control = toggle(page);
  await expect(control).toBeChecked();

  await control.uncheck();
  await expect(control).not.toBeChecked();
  await expect(
    page.evaluate(() =>
      window.localStorage.getItem("bottlebound.require-physical-confirmations"),
    ),
  ).resolves.toBe("false");

  await page.reload();
  await expect(control).not.toBeChecked();

  await control.check();
  await page.reload();
  await expect(control).toBeChecked();
});

test("with the setting ON a Basic Attack still requires every manual physical check", async ({
  page,
}) => {
  await startMatch(page);
  await expect(toggle(page)).toBeChecked();
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();

  for (const label of CHECK_LABELS) {
    await expect(page.getByLabel(label)).toBeVisible();
  }
  const review = page.getByRole("button", {
    name: "Review Action Resolution",
  });
  await expect(review).toBeDisabled();

  await completePhysicalChecks(page);
  await review.click();
  await expect(
    page.getByRole("heading", { name: "Review Basic Attack" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("2/3");
});

test("with the setting OFF a Basic Attack commits with zero manual check taps", async ({
  page,
}) => {
  await page.goto("/");
  await toggle(page).uncheck();
  await startMatch(page);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();

  await expect(page.getByLabel(CHECK_LABELS[2]!)).toBeHidden();
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Review Basic Attack" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("2/3");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Undo Action Resolution?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
});

test("turning the setting OFF mid-draft satisfies the open draft while End Game stays confirmed", async ({
  page,
}) => {
  await startMatch(page);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  const review = page.getByRole("button", {
    name: "Review Action Resolution",
  });
  await expect(review).toBeDisabled();

  await toggle(page).uncheck();
  await expect(page.getByLabel(CHECK_LABELS[0]!)).toBeHidden();
  await expect(review).toBeEnabled();
  await review.click();
  await page.getByRole("button", { name: "Cancel draft" }).click();

  await page.getByRole("button", { name: "End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "End this Match?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
});
