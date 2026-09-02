import { expect, test, type Page } from "@playwright/test";

const CHECK_LABELS = [
  "Range is legal",
  "Line of Sight is legal",
  "Every selected bottle was physically hit",
  "Terrain contact was resolved",
] as const;

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

function reactionChoice(page: Page, groupName: string, characterName: string) {
  return page
    .getByRole("group", { name: groupName })
    .getByRole("checkbox", { name: `Protect ${characterName}` });
}

async function finishTurnAndWait(page: Page) {
  const sequence = page.locator(".active-match > .section-heading .eyebrow");
  const previousSequence = (await sequence.textContent()) ?? "";
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await expect(sequence).not.toHaveText(previousSequence);
  await expect(
    page.locator(".active-match > .section-heading .readiness-badge"),
  ).toHaveText("Saved");
}

/** Finishes turns until the named class is the Active Character (max one round). */
async function activateCharacter(page: Page, className: string) {
  const activeHeading = page.locator("[data-active-character] h3");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const activeName = (await activeHeading.textContent()) ?? "";
    if (activeName.trim().startsWith(className)) return;
    await finishTurnAndWait(page);
  }
  throw new Error(`${className} never became the Active Character.`);
}

test("self ability confirms in one step, spends, persists, and undoes exactly", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Fighter");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose an Ability" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Hold the Line" }),
  ).toContainText("2 paces");
  await expect(page.locator(".ability-list .rules-context-link")).toHaveCount(
    0,
  );
  await expect(
    page.locator("[data-ability-option]", { hasText: "Shield Wall" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Use Hold the Line" }).click();
  const recipients = page
    .getByRole("group", { name: "Targets in range" })
    .getByRole("checkbox");
  for (let index = 0; index < (await recipients.count()); index += 1) {
    await recipients.nth(index).check();
  }
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.getByText("Review Hold the Line")).toHaveCount(0);
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Fighter" }),
  ).toContainText("4/4");

  await page.reload();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Fighter" }),
  ).toContainText("4/4");

  await expect(
    page.getByRole("button", { name: "Use Ability" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText(/Are you sure you want to undo this action/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Fighter" }),
  ).toContainText("4/4");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await expect(
    page.locator("[data-ability-option]", { hasText: "Hold the Line" }),
  ).toBeVisible();
});

test("Shapeshift confirmation closes the draft and applies its result", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Druid");

  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Shapeshift" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.getByText("Review Shapeshift")).toHaveCount(0);
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Druid" }),
  ).toContainText("4/4");
});

test("targeted-attack ability picks exactly one enemy and records Reactions atomically", async ({
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
  await reactionChoice(page, "Divine Shield · Paladin", "Ranger").check();
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
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
  const record = page.getByRole("button", { name: "Record Action Resolution" });
  await expect(record).toBeEnabled();
  await record.click();
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
  await reactionChoice(page, "Deflecting Palm · Monk", "Monk").check();
  await expect(
    page.getByRole("heading", { name: "Redirected Attack Leg 2" }),
  ).toBeVisible();
  await expect(page.locator("[data-closed-attack-leg]")).toContainText("Monk");
  await expect(page.getByLabel(/Monk · Duergar/)).toBeDisabled();
  await page.getByLabel(/Ranger · Duergar/).check();
  await page.getByLabel(/Paladin · Drow/).check();
  await completePhysicalChecks(page);

  await page.getByRole("button", { name: "Record Action Resolution" }).click();
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
  await page.getByRole("button", { name: "Record Action Resolution" }).click();

  await expect(page.getByText(/invalid-target-relation/)).toBeVisible();
  const confirm = page.getByRole("button", {
    name: "Record Action Resolution",
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

test("healing abilities do not offer full-HP characters as targets", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Druid");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Nature’s Renewal" }).click();

  await expect(page.locator("[data-eligible-targets]")).not.toContainText(
    "Bard · Drow",
  );
  await expect(page.locator('[data-ability-target="drow-bard"]')).toHaveCount(
    0,
  );
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
  await expect(
    page.locator("[data-eligible-targets]").getByLabel(/Ranger · Duergar/),
  ).toHaveCount(0);
  await page.getByLabel(/Paladin · Drow/).check();
  const record = page.getByRole("button", { name: "Record Action Resolution" });
  await expect(record).toBeEnabled();
  await record.click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Wizard" }),
  ).toContainText("3/3");
  // Battle Hymn records buffs without dealing damage: the Paladin stays
  // unwounded at their printed 5 HP.
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("5/5");
});

test("downing the Active Character skips its slot and advances to usable controls", async ({
  page,
}) => {
  await startMatch(page);
  const heading = page.locator("[data-active-character] h3");
  const row = page.locator("[data-active-order-row]", { hasText: "Ranger" });

  // Prepare the Ranger at 1 HP using the opening turn's two normal actions,
  // then advance to a fresh Ranger turn for the downing attack.
  for (let remaining = 3; remaining > 1; remaining -= 1) {
    await page.getByRole("button", { name: "Basic Attack" }).click();
    await page.locator('[data-hit-character="duergar-ranger"]').check();
    await completePhysicalChecks(page);
    await page
      .getByRole("button", { name: "Record Action Resolution" })
      .click();
    await expect(row).toContainText(`${String(remaining - 1)}/3`);
  }
  await finishTurnAndWait(page);
  await activateCharacter(page, "Ranger");
  await expect(heading).toHaveText("Ranger");
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.locator('[data-hit-character="duergar-ranger"]').check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(row).toContainText("0/3");

  const useAbility = page.getByRole("button", { name: "Use Ability" });
  if (((await heading.textContent()) ?? "").trim() === "Ranger") {
    const activeCard = page.locator("[data-active-character]");
    await expect(activeCard).toContainText(/Active\s*·\s*Downed/);
    await expect(activeCard).toContainText("0/3");
    await expect(useAbility).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Basic Attack" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Finish Turn" }),
    ).toBeEnabled();
    await finishTurnAndWait(page);
  } else {
    await expect(useAbility).toBeEnabled();
  }
  await expect(heading).not.toHaveText("Ranger");
  await expect(row).toHaveAttribute("data-turn", "skipped · downed");
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
      throw new Error(
        `The Ranger is at an unusable HP total ${String(hpBefore)}.`,
      );
    }
    await page.getByRole("button", { name: "Basic Attack" }).click();
    await page.locator('[data-hit-character="duergar-ranger"]').check();
    await completePhysicalChecks(page);
    await page
      .getByRole("button", { name: "Record Action Resolution" })
      .click();
    await expect(rangerHp).toHaveText(`${String(hpBefore - 1)}/3`);
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
  await page.getByRole("button", { name: "Record Action Resolution" }).click();

  const rangerRow = page.locator("[data-active-order-row]", {
    hasText: "Ranger",
  });
  await expect(rangerRow).toContainText("0/3");
  await expect(rangerRow).toHaveAttribute("data-turn", "skipped · downed");

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

test("Rampage uses both normal actions without a referee override", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Barbarian");

  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Rampage" }).click();
  await completePhysicalChecks(page);
  const confirm = page.getByRole("button", {
    name: "Record Action Resolution",
  });
  await expect(confirm).toBeEnabled();
  await expect(page.getByLabel(/Record referee override/)).toHaveCount(0);
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Basic Attack" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Use Ability" }),
  ).toBeDisabled();
});
