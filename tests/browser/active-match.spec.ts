import { expect, test } from "@playwright/test";

test("the referee starts, advances, wraps, and restores an Active Match", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();

  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.getByText("Round 1 · Slot 1 of 12")).toBeVisible();
  await expect(page.locator("[data-active-character]")).toContainText("Active");
  const actionUsage = page.locator("[data-active-character] .action-usage");
  await expect(actionUsage).toHaveAttribute(
    "aria-label",
    "0 of 2 actions used",
  );
  await expect(page.locator("[data-next-character]")).toContainText("Next");
  await expect(page.locator("#rules-round, #rules-turn")).toHaveCount(0);
  const surfaceOrder = await page
    .locator("[data-surface-order]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-surface-order")),
    );
  expect(surfaceOrder).toEqual([
    "active-player",
    "actions",
    "next-player",
    "finish-turn",
    "initiative-order",
    "end-game",
  ]);
  await expect(
    page.locator('[data-surface-order="actions"] button'),
  ).toHaveText(["Move", "Basic Attack", "Use Ability"]);
  await expect(page.locator(".active-order thead th")).toHaveText([
    "Character",
    "Team",
    "HP",
  ]);
  await expect(page.locator('.active-order [data-label="Slot"]')).toHaveCount(
    0,
  );
  await expect(page.locator('.active-order [data-label="Turn"]')).toHaveCount(
    0,
  );
  await expect(page.locator(".critical-hp")).toHaveCount(0);
  const actionButtonCenters = await page
    .locator('[data-surface-order="actions"] button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const bounds = button.getBoundingClientRect();
        return Math.round(bounds.top + bounds.height / 2);
      }),
    );
  expect(new Set(actionButtonCenters).size).toBe(1);
  const finishTurnWidths = await page
    .locator(".finish-turn-action, .finish-turn-action button")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    );
  expect(finishTurnWidths).toHaveLength(2);
  expect(finishTurnWidths[0]).toBeGreaterThanOrEqual(48);
  expect(finishTurnWidths[1]).toBe(finishTurnWidths[0]);
  await expect(page.locator(".turn-position-row .turn-undo")).toBeVisible();
  await expect(page.locator("[data-active-order-row]")).toHaveCount(12);
  await expect(page.locator(".active-match .primary-action")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Basic Attack" }),
  ).toBeEnabled();

  const finishTurn = page.getByRole("button", { name: "Finish Turn" });
  await finishTurn.click();
  await expect(page.getByText("Round 1 · Slot 2 of 12")).toBeVisible();
  await expect(page.locator(".turn-position-row .turn-undo")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Round 1 · Slot 2 of 12")).toBeVisible();

  for (let slot = 3; slot <= 12; slot += 1) {
    await finishTurn.click();
    await expect(
      page.getByText(`Round 1 · Slot ${String(slot)} of 12`),
    ).toBeVisible();
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
    const add = Reflect.get(IDBObjectStore.prototype, "add");
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "events") {
        throw new DOMException("Injected storage failure", "DataError");
      }
      return Reflect.apply(add, this, args);
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

test("the referee can Move twice, then the normal action controls become unavailable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();

  const move = page.getByRole("button", { name: "Move" });
  await expect(move).toBeEnabled();
  await move.click();
  await expect(
    page.locator("[data-active-character] .action-usage"),
  ).toHaveAttribute("aria-label", "1 of 2 actions used");

  await expect(move).toBeEnabled();
  await move.click();
  await expect(
    page.locator("[data-active-character] .action-usage"),
  ).toHaveAttribute("aria-label", "2 of 2 actions used");
  await expect(move).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Basic Attack" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Use Ability" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Finish Turn" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { name: "Undo Move?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.locator("[data-active-character] .action-usage"),
  ).toHaveAttribute("aria-label", "1 of 2 actions used");
});
