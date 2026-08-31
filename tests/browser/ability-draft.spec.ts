import { expect, test, type Page } from "@playwright/test";

type RosterKey = keyof typeof ROSTER;

const CHECK_LABELS = [
  "Range is legal",
  "Line of Sight is legal",
  "Every selected bottle was physically hit",
  "Terrain contact was resolved",
] as const;

/** Fixed Ruleset roster facts the flows need: element id and printed HP. */
const ROSTER = {
  Rogue: { id: "drow-rogue", hp: 3 },
  Druid: { id: "drow-druid", hp: 3 },
  Paladin: { id: "drow-paladin", hp: 5 },
  Wizard: { id: "drow-wizard", hp: 3 },
  Sorcerer: { id: "drow-sorcerer", hp: 3 },
  Bard: { id: "drow-bard", hp: 3 },
  Ranger: { id: "duergar-ranger", hp: 3 },
  Monk: { id: "duergar-monk", hp: 4 },
  Fighter: { id: "duergar-fighter", hp: 4 },
  Barbarian: { id: "duergar-barbarian", hp: 5 },
  Warlock: { id: "duergar-warlock", hp: 3 },
  Cleric: { id: "duergar-cleric", hp: 3 },
} as const;

async function startMatch(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
}

async function completePhysicalChecks(page: Page) {
  for (const label of CHECK_LABELS) {
    await page.getByLabel(label).check();
  }
}

/** Finishes turns until the named class is the Active Character (max one round). */
async function activateCharacter(page: Page, className: string) {
  const activeHeading = page.locator("[data-active-character] h3");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const activeName = (await activeHeading.textContent()) ?? "";
    if (activeName.trim().startsWith(className)) return;
    await page.getByRole("button", { name: "Finish Turn" }).click();
    // The commit re-render is asynchronous; wait for this turn to land.
    await expect(activeHeading).not.toHaveText(activeName);
  }
  throw new Error(`${className} never became the Active Character.`);
}

test("self ability confirms in one step, spends, persists, and undoes exactly", async ({
  page,
}) => {
  await startMatch(page);
  // A Fighter-first initiative would aim the opening attack at the Fighter on
  // their own turn, spending that turn's Major Action so Second Wind becomes
  // an override-gated second Major Action. Move past such a start first so
  // the flow stays deterministic whatever slot order was drawn.
  const activeHeading = page.locator("[data-active-character] h3");
  const firstName = ((await activeHeading.textContent()) ?? "").trim();
  if (firstName.startsWith("Fighter")) {
    await page.getByRole("button", { name: "Finish Turn" }).click();
    await expect(activeHeading).not.toHaveText(firstName);
  }

  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Fighter · Duergar/).check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Fighter" }),
  ).toContainText("3/4");

  await activateCharacter(page, "Fighter");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose an Ability" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Second Wind" }),
  ).toContainText("Self");
  await expect(page.locator(".ability-list .rules-context-link")).toHaveCount(
    0,
  );
  await expect(
    page.locator("[data-ability-option]", { hasText: "Shield Wall" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Use Second Wind" }).click();
  await expect(
    page.getByRole("heading", { name: "Review Second Wind" }),
  ).toBeVisible();
  await expect(page.locator(".ability-draft .rules-context-link")).toHaveCount(
    0,
  );
  await expect(
    page.locator("[data-ability-review-change]", { hasText: "Fighter" }),
  ).toContainText("3 → 4");
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Fighter" }),
  ).toContainText("4/4");

  await page.reload();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Fighter" }),
  ).toContainText("4/4");

  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Second Wind" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Every non-Reaction Ability of Fighter is spent."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText(/Are you sure you want to undo this action/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Fighter" }),
  ).toContainText("3/4");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Second Wind" }),
  ).toBeVisible();
});

test("targeted-attack ability picks exactly one enemy, allows Reactions, and reviews atomically", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Sorcerer");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Arcane Bolt" }),
  ).toContainText("6 paces");
  await page.getByRole("button", { name: "Use Arcane Bolt" }).click();

  await expect(
    page.getByRole("heading", { name: "Arcane Bolt", level: 2 }),
  ).toBeVisible();
  const eligibleList = page.locator("[data-eligible-targets]");
  await expect(eligibleList).toContainText("Ranger · Duergar");
  await expect(eligibleList).not.toContainText("Paladin");
  await page.getByLabel(/Ranger · Duergar/).check();
  await page.getByRole("button", { name: "Choose Reactions" }).click();

  await expect(page.getByText("Protective Reactions")).toBeVisible();
  await page.getByLabel(/Divine Shield · Paladin protects Ranger/).check();
  await page.getByRole("button", { name: "Review Action Resolution" }).click();

  await expect(
    page.getByRole("heading", { name: "Review Arcane Bolt" }),
  ).toBeVisible();
  await expect(page.locator("[data-action-review-hit]")).toHaveCount(1);
  await expect(
    page.locator("[data-action-review-hit]", { hasText: "Ranger" }),
  ).toContainText("0 (prevented)");
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");

  await page.reload();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Arcane Bolt" }),
  ).toHaveCount(0);
});

test("physical-attack ability honors the confirmation toggle and skips every manual check when OFF", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("checkbox", { name: "Require manual physical confirmations" })
    .uncheck();
  await startMatch(page);
  await activateCharacter(page, "Rogue");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Backstab" }),
  ).toContainText("2 paces");
  await page.getByRole("button", { name: "Use Backstab" }).click();

  await expect(
    page.getByRole("heading", { name: "Record Backstab" }),
  ).toBeVisible();
  await page.getByLabel(/Paladin · Drow/).check();
  await expect(page.getByLabel(CHECK_LABELS[0])).toBeHidden();
  await expect(
    page.locator("fieldset legend").filter({
      hasText: "Manual physical confirmations",
    }),
  ).toHaveCount(0);
  const review = page.getByRole("button", { name: "Review Action Resolution" });
  await expect(review).toBeEnabled();
  await review.click();
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("4/5");
});

test("physical-attack ability reuses ordered contacts, Deflecting Palm redirect legs, and manual checks when ON", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Monk");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Stunning Strike" }).click();

  await expect(
    page.getByRole("heading", { name: "Record Stunning Strike" }),
  ).toBeVisible();
  await page.getByLabel(/Monk · Duergar/).check();
  await page.getByLabel(/Deflecting Palm · Monk/).check();
  await expect(
    page.getByRole("heading", { name: "Redirected Attack Leg 2" }),
  ).toBeVisible();
  await expect(page.locator("[data-closed-attack-leg]")).toContainText("Monk");
  await expect(page.getByLabel(/Monk · Duergar/)).toBeDisabled();
  await page.getByLabel(/Ranger · Duergar/).check();
  await page.getByLabel(/Paladin · Drow/).check();
  await completePhysicalChecks(page);

  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Review Stunning Strike" }),
  ).toBeVisible();
  await expect(page.locator("[data-attack-leg-review]")).toHaveCount(2);
  await expect(page.locator("[data-attack-leg-review]").first()).toContainText(
    /Leg 1.*Monk/,
  );
  await expect(page.locator("[data-attack-leg-review]").nth(1)).toContainText(
    /Leg 2.*Ranger.*Paladin/,
  );
  await expect(
    page.locator("[data-action-review-hit]", { hasText: "Monk" }),
  ).toContainText("0 (prevented)");
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Monk" }),
  ).toContainText("4/4");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("2/3");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("4/5");
  await page.reload();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("2/3");
});

test("ally ability filters targets by policy and an invalid pick records an Override", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Cleric");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Blessing of Battle" }).click();

  const eligibleList = page.locator("[data-eligible-targets]");
  await expect(eligibleList).toContainText("Warlock · Duergar");
  await expect(eligibleList).not.toContainText("Wizard · Drow");
  await page.getByText("Override unavailable targets", { exact: true }).click();
  await page
    .locator("[data-override-targets] [data-ability-target]")
    .first()
    .waitFor();
  await page.getByLabel(/Paladin · Drow/).check();
  await page.getByRole("button", { name: "Review Action Resolution" }).click();

  await expect(page.getByText(/invalid-target-relation/)).toBeVisible();
  const confirm = page.getByRole("button", {
    name: "Confirm Action Resolution",
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByLabel("Record referee Override for this Ability choice")
    .check();
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Blessing of Battle" }),
  ).toHaveCount(0);
});

test("utility ability resolves several policy-allowed targets in one resolution", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Bard");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Battle Hymn" }).click();

  await expect(
    page.getByText("Selections are filtered by the ability's target policy"),
  ).toBeVisible();
  await page.getByLabel(/Wizard · Drow/).check();
  await page.getByLabel(/Ranger · Duergar/).check();
  await expect(
    page.getByRole("button", { name: "Review Action Resolution" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Review Battle Hymn" }),
  ).toBeVisible();
  await expect(page.locator("[data-ability-review-change]")).toHaveCount(2);
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Wizard" }),
  ).toContainText("3/3");
  // Battle Hymn records buffs without dealing damage: the Ranger stays
  // unwounded at their printed 3 HP.
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
});

test("a Downed Active Character cannot open the ability list and Basic Attack is gated identically", async ({
  page,
}) => {
  await startMatch(page);
  const heading = page.locator("[data-active-character] h3");
  const activeName = ((await heading.textContent()) ?? "").trim();
  const character = ROSTER[activeName as RosterKey];
  if (!character) throw new Error(`Unknown Active Character ${activeName}.`);
  const row = page.locator("[data-active-order-row]", { hasText: activeName });

  // The Active Character records every contact of its own throws, so its
  // turn ends with it Downed while still holding the initiative slot.
  for (let remaining: number = character.hp; remaining > 0; remaining -= 1) {
    await page.getByRole("button", { name: "Basic Attack" }).click();
    await page.locator(`[data-hit-character="${character.id}"]`).check();
    await completePhysicalChecks(page);
    await page
      .getByRole("button", { name: "Review Action Resolution" })
      .click();
    if (remaining < character.hp) {
      await page.getByLabel(/Record referee override/).check();
    }
    if (remaining === 1) {
      await expect(
        page.locator("[data-action-review-hit]", { hasText: activeName }),
      ).toContainText("Active → Downed");
    }
    await page
      .getByRole("button", { name: "Confirm Action Resolution" })
      .click();
    await expect(row).toContainText(`${remaining - 1}/${character.hp}`);
  }

  const activeCard = page.locator("[data-active-character]");
  await expect(activeCard).toContainText(/Active\s*·\s*Downed/);
  await expect(activeCard).toContainText(`0/${character.hp}`);
  const useAbility = page.getByRole("button", { name: "Use Ability" });
  await expect(useAbility).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Basic Attack" }),
  ).toBeDisabled();

  // The picker stays unreachable: even a forced click on the disabled control
  // opens no Ability list.
  await useAbility.click({ force: true });
  await expect(
    page.getByRole("heading", { name: "Choose an Ability" }),
  ).toHaveCount(0);
  await expect(page.locator("[data-ability-option]")).toHaveCount(0);

  // Finish Turn remains available so the Match moves past the Downed slot.
  await expect(page.getByRole("button", { name: "Finish Turn" })).toBeEnabled();
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await expect(heading).not.toHaveText(activeName);
});

test("an Arcane Bolt downs a 1 HP enemy whose initiative slot is then skipped", async ({
  page,
}) => {
  await startMatch(page);
  const heading = page.locator("[data-active-character] h3");
  const rangerHp = page.locator(
    '[data-active-order-row]:has-text("Ranger") [data-label="HP"]',
  );

  // Bring the Ranger to exactly 1 HP with one ordinary Basic Attack per turn;
  // every Sorcerer turn stays unspent for the finishing Arcane Bolt.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (((await rangerHp.textContent()) ?? "").trim() === "1/3") break;
    const activeName = ((await heading.textContent()) ?? "").trim();
    if (activeName.startsWith("Sorcerer")) {
      await page.getByRole("button", { name: "Finish Turn" }).click();
      await expect(heading).not.toHaveText(activeName);
      continue;
    }
    const hpBefore = Number(
      ((await rangerHp.textContent()) ?? "").trim().split("/")[0],
    );
    if (!Number.isInteger(hpBefore) || hpBefore < 2) {
      throw new Error(`The Ranger is at an unusable HP total ${hpBefore}.`);
    }
    await page.getByRole("button", { name: "Basic Attack" }).click();
    await page.locator('[data-hit-character="duergar-ranger"]').check();
    await completePhysicalChecks(page);
    await page
      .getByRole("button", { name: "Review Action Resolution" })
      .click();
    await page
      .getByRole("button", { name: "Confirm Action Resolution" })
      .click();
    await expect(rangerHp).toHaveText(`${hpBefore - 1}/3`);
    await page.getByRole("button", { name: "Finish Turn" }).click();
    await expect(heading).not.toHaveText(activeName);
  }
  await expect(rangerHp).toHaveText("1/3");
  await activateCharacter(page, "Sorcerer");

  // The ability resolution itself does the downing.
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose an Ability" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use Arcane Bolt" }).click();
  const eligibleList = page.locator("[data-eligible-targets]");
  await expect(eligibleList).toContainText("Ranger · Duergar · HP 1/3");
  await page.getByLabel(/Ranger · Duergar/).check();
  await page.getByRole("button", { name: "Choose Reactions" }).click();
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  const hitRow = page.locator("[data-action-review-hit]", {
    hasText: "Ranger",
  });
  await expect(hitRow).toContainText("1 → 0");
  await expect(hitRow).toContainText("Active → Downed");
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();

  const rangerRow = page.locator("[data-active-order-row]", {
    hasText: "Ranger",
  });
  await expect(rangerRow).toContainText("0/3");
  await expect(rangerRow).toContainText("Skipped · Downed");

  // Initiative skip behavior: one complete pass of turns never hands the
  // Active Character card to the Downed Ranger and still wraps the round.
  for (let turn = 0; turn < 12; turn += 1) {
    const activeName = ((await heading.textContent()) ?? "").trim();
    if (activeName.startsWith("Ranger")) {
      throw new Error("The Downed Ranger took an initiative turn.");
    }
    await page.getByRole("button", { name: "Finish Turn" }).click();
    await expect(heading).not.toHaveText(activeName);
  }
});

test("a second Major Action in one turn needs the same recorded override as Basic Attack", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Barbarian");

  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Rage" }).click();
  await expect(
    page.getByRole("heading", { name: "Review Rage" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use Ability" })).toBeEnabled();

  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Brutal Shove" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  const overrideCheckbox = page.getByLabel(
    /Record referee override for a second Major Action this turn/,
  );
  await expect(overrideCheckbox).toBeVisible();
  const confirm = page.getByRole("button", {
    name: "Confirm Action Resolution",
  });
  await expect(confirm).toBeDisabled();
  await overrideCheckbox.check();
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("2/3");
});
