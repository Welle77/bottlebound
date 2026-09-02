import { expect, test } from "@playwright/test";

test("an Ended Match shows every recorded Match Event in order", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.locator('[data-hit-character="drow-rogue"]').check();
  for (const label of [
    "Range is legal",
    "Line of Sight is legal",
    "Every selected bottle was physically hit",
    "Terrain contact was resolved",
  ]) {
    await page.getByLabel(label).check();
  }
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "Confirm End Game" }).click();

  const history = page.getByRole("region", { name: "Match Event history" });
  await expect(history).toBeVisible();
  await expect(history.locator(".match-event-list")).toHaveCSS(
    "overflow-y",
    "auto",
  );
  await expect(history.locator(".match-event-list > .match-event")).toHaveCount(
    5,
  );
  await expect(
    history.locator("[data-event-sequence]").first(),
  ).toHaveAttribute("data-event-sequence", "1");
  await expect(history.locator("[data-event-sequence]").nth(1)).toHaveAttribute(
    "data-event-sequence",
    "2",
  );
  await expect(history.locator("[data-event-sequence]").nth(2)).toHaveAttribute(
    "data-event-sequence",
    "3",
  );
  await expect(history.locator("[data-event-sequence]").nth(3)).toHaveAttribute(
    "data-event-sequence",
    "4",
  );
  await expect(history.locator("[data-event-sequence]").nth(4)).toHaveAttribute(
    "data-event-sequence",
    "5",
  );
  await expect(history).toContainText("Setup Created");
  await expect(history).toContainText("Initiative Generated");
  await expect(history).toContainText("Match Started");
  await expect(history).toContainText("Basic Attack");
  await expect(history).toContainText("Rogue");
  await expect(history).toContainText("Hit for 1 damage");
  await expect(history.locator(".event-basic-attack-icon")).toHaveCount(1);
  await expect(history.locator(".event-ability-icon")).toHaveCount(0);
  await expect(history.locator("[data-team-icon]")).toHaveCount(2);
  await expect(history).toContainText("Match Ended");
  await expect(history.locator("details").first()).not.toHaveAttribute("open");
  await history.locator("details").first().locator("summary").click();
  await expect(history.locator("details").first()).toHaveAttribute("open", "");
  await expect(history.locator("details").first()).toContainText(
    '"type": "SetupCreated"',
  );
});
