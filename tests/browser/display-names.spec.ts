import { expect, test } from "@playwright/test";

test("the referee names characters in Setup and names follow every display", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await expect(
    page.getByRole("heading", { name: "Initiative Setup" }),
  ).toBeVisible();

  await page.locator("[data-display-names] summary").click();
  const rogueInput = page.locator('[data-display-name-for="drow-rogue"]');
  await expect(rogueInput).toBeVisible();
  await rogueInput.fill("  Silk  ");
  await page.locator('[data-display-name-for="drow-druid"]').fill("   ");
  await page.getByRole("button", { name: "Save display names" }).click();

  await expect(page.getByText("Setup · Sequence 2")).toBeVisible();
  const rogueRosterRow = page.locator("[data-roster-row]", {
    hasText: "Silk",
  });
  await expect(rogueRosterRow).toHaveCount(1);
  await expect(rogueRosterRow.locator(".display-name-ruleset")).toHaveText(
    "Rogue",
  );
  await expect(
    page.locator("[data-roster-row]", { hasText: "Druid" }),
  ).toContainText("Druid");

  await page.reload();
  await page.locator("[data-display-names] summary").click();
  await expect(
    page.locator('[data-display-name-for="drow-rogue"]'),
  ).toHaveValue("Silk");
  await expect(page.getByText("Setup · Sequence 2")).toBeVisible();

  await page.getByRole("button", { name: "Generate initiative" }).click();
  await expect(page.locator("[data-initiative-row]")).toHaveCount(12);
  const rogueInitiativeRow = page.locator("[data-initiative-row]", {
    hasText: "Silk",
  });
  await expect(rogueInitiativeRow).toHaveCount(1);
  await expect(rogueInitiativeRow.locator(".display-name-ruleset")).toHaveText(
    "Rogue",
  );

  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  const rogueOrderRow = page.locator("[data-active-order-row]", {
    hasText: "Silk",
  });
  await expect(rogueOrderRow).toHaveCount(1);
  await expect(rogueOrderRow.locator(".display-name-ruleset")).toHaveText(
    "Rogue",
  );
  await expect(page.locator("[data-display-name-for]")).toHaveCount(0);
});
