import { expect, test } from "@playwright/test";

test("the referee starts, advances, wraps, and restores an Active Match", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();

  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.getByText("Round 1 · Slot 1 of 12")).toBeVisible();
  await expect(page.locator("[data-active-character]")).toContainText("Active");
  await expect(page.locator("[data-next-character]")).toContainText("Next");
  await expect(page.locator("[data-active-order-row]")).toHaveCount(12);
  await expect(page.locator(".active-match .primary-action")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Basic Attack" }),
  ).toBeEnabled();

  const finishTurn = page.getByRole("button", { name: "Finish Turn" });
  await finishTurn.click();
  await expect(page.getByText("Round 1 · Slot 2 of 12")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Round 1 · Slot 2 of 12")).toBeVisible();

  for (let slot = 3; slot <= 12; slot += 1) {
    await finishTurn.click();
    await expect(page.getByText(`Round 1 · Slot ${slot} of 12`)).toBeVisible();
  }
  await finishTurn.click();
  await expect(page.getByText("Round 2 · Slot 1 of 12")).toBeVisible();

  const target = await finishTurn.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(target.width).toBeGreaterThanOrEqual(48);
  expect(target.height).toBeGreaterThanOrEqual(48);
  await expect(page.locator("main")).toHaveCSS("overflow-x", "visible");
});

test("a failed Finish Turn leaves the last committed Active Match visible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByText("Round 1 · Slot 1 of 12")).toBeVisible();

  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "events") {
        throw new DOMException("Injected storage failure", "DataError");
      }
      return add.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Finish Turn" }).click();

  await expect(page.getByText("Round 1 · Slot 1 of 12")).toBeVisible();
  await expect(
    page.getByText(/The last committed Active Match remains visible/),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Round 1 · Slot 1 of 12")).toBeVisible();
});

test("the referee records Dash once and the normal action controls become unavailable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();

  const dash = page.getByRole("button", { name: "Dash" });
  await expect(dash).toBeEnabled();
  await dash.click();

  await expect(dash).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Basic Attack" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Use Ability" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Finish Turn" })).toBeEnabled();
});
