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

test("the referee reviews, commits, restores, and undoes an ordered Basic Attack", async ({
  page,
}) => {
  await startMatch(page);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await expect(
    page.getByRole("heading", { name: "Record Basic Attack" }),
  ).toBeVisible();
  await expect(page.getByText(/This draft stays local/)).toHaveCount(0);
  await expect(page.locator("#rules-basic-attack")).toHaveCount(0);
  await expect(page.locator("[data-contact-team]")).toHaveText([
    /Opposing team · Duergar/,
    /Your team · Drow/,
  ]);
  await expect(page.locator(".attack-profile")).toContainText(/Source:/);
  await expect(page.locator(".attack-profile")).toContainText(/(Melee|Ranged)/);
  await expect(page.locator(".attack-profile")).toContainText(/Damage: 1/);

  await page.getByLabel(/Paladin · Drow/).check();
  await page.getByLabel(/Ranger · Duergar/).check();
  await expect(page.getByText("Contact 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Contact 2", { exact: true })).toHaveCount(0);
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Review Basic Attack" }),
  ).toBeVisible();
  await expect(page.locator("[data-action-review-hit]")).toHaveCount(2);
  await expect(page.locator("[data-action-review-hit]").first()).toContainText(
    "Paladin",
  );
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
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

test("a Basic Attack review row shows a marked target's committed effect damage", async ({
  page,
}) => {
  await startMatch(page);
  await activateCharacter(page, "Ranger");

  // The Ranger marks the Paladin: the first successful damaging attack
  // against him deals +1 damage and consumes the Mark.
  await page.getByRole("button", { name: "Use Ability" }).click();
  await page.getByRole("button", { name: "Use Hunter’s Mark" }).click();
  await page.getByLabel(/Paladin · Drow/).check();
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Paladin" }),
  ).toContainText("5/5");
  await page.getByRole("button", { name: "Finish Turn" }).click();

  // Whoever holds the next slot attacks the marked Paladin. Review must show
  // the finalized 2 damage (printed 1 + Hunter's Mark) that confirming
  // commits — not the effect-blind printed damage.
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Paladin · Drow/).check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  const paladinRow = page.locator("[data-action-review-hit]", {
    hasText: "Paladin",
  });
  await expect(paladinRow).toContainText("5 → 3");
  await expect(paladinRow).toContainText(/Mark consumed/);
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
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
  await page.getByLabel(/Divine Shield · Paladin protects Ranger/).check();
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");

  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await page.getByLabel(/Divine Shield · Paladin protects Ranger/).check();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");

  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await page.getByLabel(/Divine Shield · Paladin protects Ranger/).check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "events")
        throw new DOMException("Injected failure", "DataError");
      return add.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.getByText(/last committed Active Match remains visible/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await expect(
    page.getByLabel(/Divine Shield · Paladin protects Ranger/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel draft" }).click();
});

test("a second Basic Attack needs and records the referee override", async ({
  page,
}) => {
  await startMatch(page);
  for (let attack = 1; attack <= 2; attack += 1) {
    await page.getByRole("button", { name: "Basic Attack" }).click();
    await page.getByLabel(/Ranger · Duergar/).check();
    await completePhysicalChecks(page);
    await page
      .getByRole("button", { name: "Review Action Resolution" })
      .click();
    const confirm = page.getByRole("button", {
      name: "Confirm Action Resolution",
    });
    if (attack === 2) {
      await expect(confirm).toBeDisabled();
      await page.getByLabel(/Record referee override/).check();
    }
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
  await page.getByLabel(/Divine Shield · Paladin protects Ranger/).check();
  await page.getByLabel(/Misty Escape · Wizard protects Wizard/).check();
  await page.getByLabel(/Mirror Veil · Sorcerer protects Sorcerer/).check();
  await page.getByLabel(/Shield Wall · Fighter protects Paladin/).check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();

  await expect(page.locator("[data-reaction-review]")).toHaveCount(4);
  await expect(
    page.getByText(/Move Wizard up to 2 paces immediately/),
  ).toBeVisible();
  await expect(
    page.locator("[data-action-review-hit]", { hasText: "Ranger" }),
  ).toContainText("0 (prevented)");
  await expect(
    page.locator("[data-action-review-hit]", { hasText: "Warlock" }),
  ).toContainText("1");
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Warlock" }),
  ).toContainText("2/3");
  await page.reload();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/Are you sure you want to undo this action/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.getByLabel(/Ranger · Duergar/).check();
  await expect(
    page.getByLabel(/Divine Shield · Paladin protects Ranger/),
  ).toBeVisible();
});

test("a spent protective Reaction needs a clear recorded Override", async ({
  page,
}) => {
  await startMatch(page);
  for (let attack = 1; attack <= 2; attack += 1) {
    await page.getByRole("button", { name: "Basic Attack" }).click();
    await page.getByLabel(/Ranger · Duergar/).check();
    if (attack === 2) {
      await expect(
        page.getByLabel(/Divine Shield · Paladin protects Ranger/),
      ).toBeHidden();
      await page
        .getByText("Override unavailable Reactions", { exact: true })
        .click();
    }
    await page.getByLabel(/Divine Shield · Paladin protects Ranger/).check();
    await completePhysicalChecks(page);
    await page
      .getByRole("button", { name: "Review Action Resolution" })
      .click();
    if (attack === 2) {
      await expect(
        page.getByText("Divine Shield is already spent."),
      ).toBeVisible();
      await expect(
        page.getByText("Referee allowed a state-invalid Reaction."),
      ).toBeVisible();
      await page.getByLabel(/Record referee override/).check();
    }
    await page
      .getByRole("button", { name: "Confirm Action Resolution" })
      .click();
  }
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("3/3");
});

test("Deflecting Palm closes the first leg and records later unique contacts", async ({
  page,
}) => {
  await startMatch(page);
  if (
    (await page.locator("[data-active-character] h3").textContent()) === "Monk"
  ) {
    await page.getByRole("button", { name: "Finish Turn" }).click();
  }
  await page.getByRole("button", { name: "Basic Attack" }).click();
  const sourceName = (
    (await page.locator(".attack-profile p").first().textContent()) ?? ""
  )
    .replace("Source:", "")
    .trim();
  await page.getByLabel(/Monk · Duergar/).check();
  await expect(page.getByLabel(/Deflecting Palm · Monk/)).toBeVisible();
  await page.getByLabel(/Deflecting Palm · Monk/).check();

  await expect(
    page.getByRole("heading", { name: "Redirected Attack Leg 2" }),
  ).toBeVisible();
  await expect(page.locator("[data-closed-attack-leg]")).toContainText("Monk");
  await expect(page.locator("[data-redirect-evidence]")).toContainText(
    new RegExp(
      `Original source: ${sourceName}.*(Melee|Ranged).*hard maximum range (2|6) paces`,
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
  await expect(page.getByLabel(/Deflecting Palm · Monk/)).toBeVisible();
  await page.getByLabel(/Deflecting Palm · Monk/).check();
  await page.getByLabel(new RegExp(`${sourceName} ·`)).check();
  await page.getByLabel(/Paladin · Drow/).check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();

  await expect(page.locator("[data-attack-leg-review]")).toHaveCount(2);
  await expect(page.locator("[data-attack-leg-review]").first()).toContainText(
    /Leg 1.*Monk/,
  );
  await expect(page.locator("[data-attack-leg-review]").nth(1)).toContainText(
    new RegExp(`Leg 2.*${sourceName}.*Paladin`),
  );
  await expect(
    page.locator("[data-reaction-review]", { hasText: "Deflecting Palm" }),
  ).toContainText(new RegExp(`redirected toward ${sourceName}`));
  await expect(
    page.locator("[data-action-review-hit]", { hasText: "Monk" }),
  ).toContainText("0 (prevented)");
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/Are you sure you want to undo this action/)).toBeVisible();
});
