import { expect, test, type Page } from "@playwright/test";

/**
 * Acceptance evidence for one complete referee run that combines every new
 * capability of this feature in a single continuous Match: Display Names from
 * Setup, the persisted manual-confirmations toggle OFF, a Basic Attack and one
 * ability per interaction family (physical-attack, self, ally, and
 * targeted-attack whose enemy-only policy is visible), Undo of an ability
 * resolution, and End Game.
 */

const CHECK_TOGGLE_LABEL = "Require manual physical confirmations";

type Script = (page: Page) => Promise<void>;

async function activeHeadingText(page: Page): Promise<string> {
  const heading = page.locator("[data-active-character] h3");
  return ((await heading.textContent()) ?? "").trim();
}

/** Finishes turns until the predicate accepts the Active Character's name. */
async function runTurnsUntil(
  page: Page,
  accepts: (activeName: string) => boolean,
): Promise<void> {
  const heading = page.locator("[data-active-character] h3");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const activeName = await activeHeadingText(page);
    if (accepts(activeName)) return;
    await page.getByRole("button", { name: "Finish Turn" }).click();
    // The commit re-render is asynchronous; wait for this turn to land.
    await expect(heading).not.toHaveText(activeName);
  }
  throw new Error("The expected Active Character never took its turn.");
}

test("one named Match mixes Basic Attack, every ability interaction, undo, and End Game with confirmations off", async ({
  page,
}) => {
  // --- Setup: switch the console toggle OFF, then name four characters. ---
  await page.goto("/");
  await page.getByRole("checkbox", { name: CHECK_TOGGLE_LABEL }).uncheck();
  await expect(
    page.getByRole("checkbox", { name: CHECK_TOGGLE_LABEL }),
  ).not.toBeChecked();

  await page.getByRole("button", { name: "Create Match" }).click();
  await page.locator("[data-display-names] summary").click();
  await page.locator('[data-display-name-for="drow-rogue"]').fill("Silk");
  await page.locator('[data-display-name-for="drow-sorcerer"]').fill("Ember");
  await page.locator('[data-display-name-for="duergar-monk"]').fill("Stone");
  await page.locator('[data-display-name-for="duergar-cleric"]').fill("Vesper");
  await page.getByRole("button", { name: "Save display names" }).click();

  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Silk" }),
  ).toHaveCount(1);

  // --- Round 1: resolve Silk (Backstab), Vesper (ally ability), and Stone
  // (Basic Attack) whenever their turn comes up; Ember waits for round 2. ---

  const silkBackstab: Script = async (workingPage) => {
    await workingPage.getByRole("button", { name: "Use Ability" }).click();
    await workingPage.getByRole("button", { name: "Use Backstab" }).click();
    await expect(
      workingPage.getByRole("heading", { name: "Record Backstab" }),
    ).toBeVisible();
    // The draft profile shows the Display Name beside the ability.
    await expect(
      workingPage.locator(".attack-profile", { hasText: "Silk" }),
    ).toBeVisible();
    await workingPage.getByLabel(/Wizard · Drow/).check();
    // Toggle OFF: no manual physical confirmation fieldset appears.
    await expect(workingPage.getByLabel("Range is legal")).toBeHidden();
    await workingPage
      .getByRole("button", { name: "Review Action Resolution" })
      .click();
    await expect(
      workingPage.getByRole("heading", { name: "Review Backstab" }),
    ).toBeVisible();
    await workingPage
      .getByRole("button", { name: "Confirm Action Resolution" })
      .click();
    await expect(
      workingPage.locator("[data-active-order-row]", { hasText: "Wizard" }),
    ).toContainText("2/3");
  };

  const vesperBlessing: Script = async (workingPage) => {
    await workingPage.getByRole("button", { name: "Use Ability" }).click();
    await workingPage
      .getByRole("button", { name: "Use Blessing of Battle" })
      .click();
    const eligibleList = workingPage.locator("[data-eligible-targets]");
    await expect(eligibleList).toContainText("Barbarian · Duergar");
    await expect(eligibleList).not.toContainText("Paladin · Drow");
    await workingPage.getByLabel(/Barbarian · Duergar/).check();
    await workingPage
      .getByRole("button", { name: "Review Action Resolution" })
      .click();
    await expect(
      workingPage.getByRole("heading", { name: "Review Blessing of Battle" }),
    ).toBeVisible();
    await expect(
      workingPage.locator("[data-ability-review-change]", {
        hasText: "Barbarian",
      }),
    ).toContainText("No HP change");
    await workingPage
      .getByRole("button", { name: "Confirm Action Resolution" })
      .click();
    await expect(
      workingPage.locator("[data-active-order-row]", { hasText: "Barbarian" }),
    ).toContainText("5/5");
  };

  const stoneBasicAttack: Script = async (workingPage) => {
    await workingPage.getByRole("button", { name: "Basic Attack" }).click();
    await expect(
      workingPage.getByRole("heading", { name: "Record Basic Attack" }),
    ).toBeVisible();
    await workingPage.getByLabel(/Druid · Drow/).check();
    await expect(workingPage.getByLabel("Range is legal")).toBeHidden();
    await workingPage
      .getByRole("button", { name: "Review Action Resolution" })
      .click();
    await workingPage
      .getByRole("button", { name: "Confirm Action Resolution" })
      .click();
    await expect(
      workingPage.locator("[data-active-order-row]", { hasText: "Druid" }),
    ).toContainText("2/3");
  };

  const rageSelfAbility: Script = async (workingPage) => {
    await workingPage.getByRole("button", { name: "Use Ability" }).click();
    await workingPage.getByRole("button", { name: "Use Rage" }).click();
    // Self abilities confirm in one step from the picker.
    await expect(
      workingPage.getByRole("heading", { name: "Review Rage" }),
    ).toBeVisible();
    await expect(
      workingPage.locator("[data-ability-review-change]", {
        hasText: "Barbarian",
      }),
    ).toContainText("No HP change");
    await workingPage
      .getByRole("button", { name: "Confirm Action Resolution" })
      .click();
    await expect(
      workingPage.locator("[data-active-order-row]", { hasText: "Barbarian" }),
    ).toContainText("5/5");
  };

  const pendingRoundOne: [string, Script][] = [
    ["Silk", silkBackstab],
    ["Vesper", vesperBlessing],
    ["Stone", stoneBasicAttack],
    ["Barbarian", rageSelfAbility],
  ];
  for (
    let attempt = 0;
    attempt < 30 && pendingRoundOne.length > 0;
    attempt += 1
  ) {
    const activeName = await activeHeadingText(page);
    const index = pendingRoundOne.findIndex(([name]) =>
      activeName.startsWith(name),
    );
    if (index >= 0) {
      const entry = pendingRoundOne[index];
      if (entry === undefined) throw new Error("Missing pending script.");
      const [, script] = entry;
      await script(page);
      pendingRoundOne.splice(index, 1);
    }
    if (pendingRoundOne.length > 0) {
      const before = activeName;
      await page.getByRole("button", { name: "Finish Turn" }).click();
      await expect(page.locator("[data-active-character] h3")).not.toHaveText(
        before,
      );
    }
  }
  expect(pendingRoundOne).toHaveLength(0);

  // --- Persistence: an offline-style restart keeps names, effects, and the
  // device-local confirmation preference. ---
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: CHECK_TOGGLE_LABEL }),
  ).toBeHidden();
  const silkRow = page.locator("[data-active-order-row]", { hasText: "Silk" });
  await expect(silkRow.locator(".display-name-character")).toHaveText("Rogue");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Wizard" }),
  ).toContainText("2/3");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Druid" }),
  ).toContainText("2/3");

  // --- Round 2: Ember resolves the targeted-attack Arcane Bolt. ---
  await runTurnsUntil(page, (activeName) => activeName.startsWith("Ember"));
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Arcane Bolt" }).click();
  const eligibleTargets = page.locator("[data-eligible-targets]");
  await expect(eligibleTargets).toContainText("Warlock · Duergar");
  await expect(eligibleTargets).not.toContainText("Paladin · Drow");
  await page.getByLabel(/Warlock · Duergar/).check();
  await page.getByRole("button", { name: "Choose Reactions" }).click();
  await expect(page.getByText("Protective Reactions")).toBeVisible();
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Review Arcane Bolt" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-action-review-hit]", { hasText: "Warlock" }),
  ).toContainText("3 → 2");
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Warlock" }),
  ).toContainText("2/3");

  // --- Undo previews and restores the ability resolution exactly. ---
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Undo Action Resolution?" }),
  ).toBeVisible();
  await expect(page.locator("[data-undo-current]")).toContainText(
    "Spent Abilities:",
  );
  await expect(page.locator("[data-undo-current]")).toContainText(
    "Arcane Bolt",
  );
  await expect(page.locator("[data-undo-current]")).toContainText("Ember");
  await expect(page.locator("[data-undo-restored]")).toContainText(
    "Blessing of Battle",
  );
  await expect(page.locator("[data-undo-restored]")).not.toContainText(
    "Arcane Bolt",
  );
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Warlock" }),
  ).toContainText("3/3");

  // --- End Game closes the Match with the calculated Decision Basis. ---
  await page.getByRole("button", { name: "End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "End this Match?" }),
  ).toBeVisible();
  await expect(page.locator(".end-game-preview")).toContainText("Duergar wins");
  await expect(page.locator(".end-game-preview")).toContainText(
    "Active HP total",
  );
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await expect(page.locator(".ended-match")).toContainText("Duergar wins");
  await expect(page.locator(".ended-match")).toContainText("Active HP total");
});
