import { expect, test } from "@playwright/test";

async function startMatch(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
}

async function completePhysicalChecks(page: import("@playwright/test").Page) {
  for (const label of [
    "Range is legal",
    "Line of Sight is legal",
    "Every selected bottle was physically hit",
    "Terrain contact was resolved",
  ]) {
    await page.getByLabel(label).check();
  }
}

function reactionChoice(
  page: import("@playwright/test").Page,
  groupName: string,
  characterName: string,
) {
  return page
    .getByRole("group", { name: groupName })
    .getByRole("checkbox", { name: `Protect ${characterName}` });
}

/** Finishes turns until the named class is the Active Character (max one round). */
async function activateCharacter(
  page: import("@playwright/test").Page,
  className: string,
) {
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

test("the referee records, restores, and undoes an ordered Basic Attack", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Rogue");
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await expect(
    page.getByRole("heading", { name: "Record Basic Attack" }),
  ).toBeVisible();
  await expect(page.getByText(/This draft stays local/)).toHaveCount(0);
  await expect(page.locator("#rules-basic-attack")).toHaveCount(0);
  await expect(
    page.locator("[data-contact-team] h3", {
      hasText: /Opposing team\s*·\s*Duergar/,
    }),
  ).toHaveCount(1);
  await expect(
    page.locator("[data-contact-team] h3", {
      hasText: /Your team\s*·\s*Drow/,
    }),
  ).toHaveCount(1);
  await expect(
    page.locator("[data-contact-team] h3", { hasText: "Attacking team" }),
  ).toHaveCount(0);
  await expect(page.locator(".attack-profile")).toContainText(/Source:/);
  await expect(page.locator(".attack-profile")).toContainText(/(Melee|Ranged)/);
  await expect(page.locator(".attack-profile")).toContainText(/Damage: 1/);

  await page.getByLabel(/Paladin · Drow/).check();
  await page.getByLabel(/Ranger · Duergar/).check();
  await expect(page.getByText("Contact 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Contact 2", { exact: true })).toHaveCount(0);
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("4/5");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("2/3");
  await page.reload();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("4/5");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Undo Action Resolution?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("5/5");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
});

test("a Basic Attack records a marked target's effect damage", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Ranger");

  // The Ranger marks the Paladin: the first successful damaging attack
  // against him deals +1 damage and consumes the Mark.
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Hunter’s Mark" }).click();
  await page.getByLabel(/Paladin · Drow/).check();
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("5/5");
  await page.getByRole("button", { name: "Finish Turn" }).click();

  // Whoever holds the next slot attacks the marked Paladin. The recorded
  // result includes the printed damage plus Hunter's Mark.
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Paladin · Drow/).check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("3/5");
});

test("cancel, reload, and a failed save discard no committed attack", async ({
  page,
}) => {
  await startMatch(page);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await reactionChoice(page, "Divine Shield · Paladin", "Ranger").check();
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");

  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await reactionChoice(page, "Divine Shield · Paladin", "Ranger").check();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");

  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await reactionChoice(page, "Divine Shield · Paladin", "Ranger").check();
  await completePhysicalChecks(page);
  await page.evaluate(() => {
    const add = Reflect.get(IDBObjectStore.prototype, "add");
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "events")
        throw new DOMException("Injected failure", "DataError");
      return Reflect.apply(add, this, args);
    };
  });
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(page.getByText(/Injected failure/)).toBeVisible();
  await page.reload();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await expect(
    reactionChoice(page, "Divine Shield · Paladin", "Ranger"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel draft" }).click();
});

test("a second Basic Attack uses the turn's second normal action", async ({
  page,
}) => {
  await startMatch(page);
  for (let attack = 1; attack <= 2; attack += 1) {
    await page.getByRole("button", { name: "Basic Attack" }).click();
    await page.getByLabel(/Ranger · Duergar/).check();
    await completePhysicalChecks(page);
    const confirm = page.getByRole("button", {
      name: "Record Action Resolution",
    });
    await expect(confirm).toBeEnabled();
    await expect(page.getByLabel(/Record referee override/)).toHaveCount(0);
    await confirm.click();
    if (attack === 1) {
      await expect(
        page.getByRole("button", { name: "Basic Attack" }),
      ).toBeEnabled();
    }
  }
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("1/3");
});

test("protective Reactions prevent only selected damage and restore after Undo", async ({
  page,
}) => {
  await startMatch(page);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  for (const character of [
    /Ranger · Duergar/,
    /Wizard · Drow/,
    /Sorcerer · Drow/,
    /Paladin · Drow/,
    /Warlock · Duergar/,
  ]) {
    await page.getByLabel(character).check();
  }
  await reactionChoice(page, "Divine Shield · Paladin", "Ranger").check();
  await reactionChoice(page, "Misty Escape · Wizard", "Wizard").check();
  await reactionChoice(page, "Mirror Veil · Sorcerer", "Sorcerer").check();
  await reactionChoice(page, "Shield Wall · Fighter", "Paladin").check();
  const reactionControls = page
    .locator("fieldset")
    .filter({ hasText: "Protective Reactions" })
    .locator(".reaction-group .reaction-control");
  await expect(reactionControls).toHaveCount(10);
  for (const control of await reactionControls.all()) {
    await expect(control).toBeVisible();
    await expect(control).toContainText(/Protect .+/);
  }
  const reactionBounds = await reactionControls.evaluateAll((controls) =>
    controls.map((control) => {
      const bounds = control.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
    }),
  );
  expect(new Set(reactionBounds.map(({ top }) => top)).size).toBe(
    reactionBounds.length,
  );
  for (let index = 1; index < reactionBounds.length; index += 1) {
    const current = reactionBounds[index];
    const previous = reactionBounds[index - 1];
    if (!current || !previous) throw new Error("Missing reaction bounds.");
    expect(current.height).toBeGreaterThanOrEqual(48);
    expect(current.top).toBeGreaterThanOrEqual(previous.bottom);
  }
  const [firstReactionBounds] = reactionBounds;
  if (!firstReactionBounds) throw new Error("Missing reaction bounds.");
  expect(firstReactionBounds.height).toBeGreaterThanOrEqual(48);

  // Recheck the same multi-target reaction surface at a desktop width as
  // well as the existing mobile project viewport.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const control of await reactionControls.all()) {
    await expect(control).toBeVisible();
    await expect(control).toContainText(/Protect .+/);
  }
  const desktopReactionBounds = await reactionControls.evaluateAll((controls) =>
    controls.map((control) => {
      const bounds = control.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
    }),
  );
  expect(new Set(desktopReactionBounds.map(({ top }) => top)).size).toBe(
    desktopReactionBounds.length,
  );
  for (let index = 0; index < desktopReactionBounds.length; index += 1) {
    const current = desktopReactionBounds[index];
    if (!current) throw new Error("Missing desktop reaction bounds.");
    expect(current.height).toBeGreaterThanOrEqual(48);
    if (index > 0) {
      const previous = desktopReactionBounds[index - 1];
      if (!previous) throw new Error("Missing desktop reaction bounds.");
      expect(current.top).toBeGreaterThanOrEqual(previous.bottom);
    }
  }
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Warlock" }),
  ).toContainText("2/3");
  await page.reload();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText(/Are you sure you want to undo this action/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await expect(
    reactionChoice(page, "Divine Shield · Paladin", "Ranger"),
  ).toBeVisible();
});

test("the referee can inspect a Reaction and choose characters inside its group", async ({
  page,
}) => {
  await startMatch(page);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await page.getByLabel(/Paladin · Drow/).check();

  const reactions = page
    .locator("fieldset")
    .filter({ hasText: "Protective Reactions" });
  const divineShield = reactions.getByRole("group", {
    name: "Divine Shield · Paladin",
  });
  const guidanceButton = divineShield.getByRole("button", {
    name: "What Divine Shield does",
  });
  const guidance = divineShield.getByRole("tooltip", {
    name: "Divine Shield effect",
  });

  await expect(reactions.locator(".reaction-group")).toHaveCount(2);
  await expect(divineShield.getByRole("checkbox")).toHaveCount(2);
  await expect(divineShield.getByText("Protect Ranger")).toBeVisible();
  await expect(divineShield.getByText("Protect Paladin")).toBeVisible();
  await expect(guidanceButton).toHaveAttribute("aria-expanded", "false");
  await expect(guidance).toBeHidden();

  await guidanceButton.click();

  await expect(guidanceButton).toHaveAttribute("aria-expanded", "true");
  await expect(guidance).toContainText(
    "reduce that character's remaining damage by 1",
  );
  await expect(guidance).toContainText("Target: Self or 1 ally");
  await expect(guidance).toContainText("Range: 3 paces");
});

test("Damage Block availability and review preview stay consistent", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Sorcerer");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Arcane Bolt" }).click();

  await page.getByText("Override unavailable targets", { exact: true }).click();
  await page.getByLabel(/Paladin · Drow/).check();
  await page.getByRole("button", { name: "Choose Reactions" }).click();

  await reactionChoice(page, "Divine Shield · Paladin", "Paladin").check();
  await expect(
    reactionChoice(page, "Shield Wall · Fighter", "Paladin"),
  ).toBeHidden();

  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Override Arcane Bolt" }),
  ).toBeVisible();
  await expect(page.locator("[data-action-review-hit]")).toContainText("0");
  await expect(page.locator("[data-action-review-hit]")).toContainText("5 → 5");
  await expect(page.locator("[data-reaction-review]")).toContainText(
    "Reduces remaining damage by 1",
  );
});

test("targeted Arcane Bolt against the Monk does not offer Deflecting Palm", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Sorcerer");
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Arcane Bolt" }).click();

  await page.getByText("Override unavailable targets", { exact: true }).click();
  await page.getByLabel(/Monk · Duergar/).check();
  await page.getByRole("button", { name: "Choose Reactions" }).click();

  await expect(
    page.getByRole("group", { name: "Deflecting Palm · Monk" }),
  ).toHaveCount(0);
});

test("Attack Avoidance conflict stays disabled until the referee deselects it", async ({
  page,
}) => {
  await startMatch(page);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Wizard · Drow/).check();

  const mistyEscape = reactionChoice(page, "Misty Escape · Wizard", "Wizard");
  const divineShield = reactionChoice(
    page,
    "Divine Shield · Paladin",
    "Wizard",
  );
  await mistyEscape.check();
  await expect(divineShield).toBeDisabled();
  await expect(divineShield).toHaveAttribute("data-reaction-override", "false");

  await mistyEscape.uncheck();
  await expect(divineShield).toBeEnabled();
  await divineShield.check();
  await expect(divineShield).toBeChecked();
});

test("a spent protective Reaction stays visible but disabled", async ({
  page,
}) => {
  await startMatch(page);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await reactionChoice(page, "Divine Shield · Paladin", "Ranger").check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Record Action Resolution" }).click();

  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  const spentDivineShield = reactionChoice(
    page,
    "Divine Shield · Paladin",
    "Ranger",
  );
  await expect(spentDivineShield).toBeVisible();
  await expect(spentDivineShield).toBeDisabled();
  await expect(
    page.getByRole("group", { name: "Divine Shield · Paladin" }),
  ).toContainText("Already used.");
  await expect(
    page.getByText("Override unavailable Reactions", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
});

test("Deflecting Palm closes the first leg and records later unique contacts", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Rogue");
  await page.getByRole("button", { name: "Basic Attack" }).click();
  const sourceName = (
    (await page.locator(".attack-profile p").first().textContent()) ?? ""
  )
    .replace("Source:", "")
    .trim();
  await page.getByLabel(/Monk · Duergar/).check();
  const deflectingPalm = reactionChoice(page, "Deflecting Palm · Monk", "Monk");
  await expect(deflectingPalm).toBeVisible();
  await deflectingPalm.check();

  await expect(
    page.getByRole("heading", { name: "Redirected Attack Leg 2" }),
  ).toBeVisible();
  await expect(page.locator('[data-contact-team="Duergar"] h3')).toContainText(
    "Your team",
  );
  await expect(page.locator('[data-contact-team="Drow"] h3')).toContainText(
    "Opposing team",
  );
  await expect(page.locator("[data-closed-attack-leg]")).toContainText("Monk");
  await expect(page.locator("[data-redirect-evidence]")).toContainText(
    new RegExp(
      `Original source: ${sourceName}[\\s\\S]*(Melee|Ranged)[\\s\\S]*hard[\\s\\S]*maximum range (2|6) paces`,
    ),
  );
  await expect(page.getByLabel(/Monk · Duergar/)).toBeDisabled();
  await page.getByLabel(new RegExp(`${sourceName} ·`)).check();
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Monk · Duergar/).check();
  await expect(deflectingPalm).toBeVisible();
  await deflectingPalm.check();
  await page.getByLabel(new RegExp(`${sourceName} ·`)).check();
  await page.getByLabel(/Paladin · Drow/).check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Record Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText(/Are you sure you want to undo this action/),
  ).toBeVisible();
});
