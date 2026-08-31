import { expect, test, type Page } from "@playwright/test";

type TeamName = "Drow" | "Duergar";
type CharacterName = keyof typeof CHARACTER_BY_NAME;

const TEAM_CHARACTERS = {
  Drow: [
    "drow-rogue",
    "drow-druid",
    "drow-paladin",
    "drow-wizard",
    "drow-sorcerer",
    "drow-bard",
  ],
  Duergar: [
    "duergar-ranger",
    "duergar-monk",
    "duergar-fighter",
    "duergar-barbarian",
    "duergar-warlock",
    "duergar-cleric",
  ],
} as const;

const CHARACTER_BY_NAME = {
  Rogue: { id: "drow-rogue", team: "Drow", hp: 3 },
  Druid: { id: "drow-druid", team: "Drow", hp: 3 },
  Paladin: { id: "drow-paladin", team: "Drow", hp: 5 },
  Wizard: { id: "drow-wizard", team: "Drow", hp: 3 },
  Sorcerer: { id: "drow-sorcerer", team: "Drow", hp: 3 },
  Bard: { id: "drow-bard", team: "Drow", hp: 3 },
  Ranger: { id: "duergar-ranger", team: "Duergar", hp: 3 },
  Monk: { id: "duergar-monk", team: "Duergar", hp: 4 },
  Fighter: { id: "duergar-fighter", team: "Duergar", hp: 4 },
  Barbarian: { id: "duergar-barbarian", team: "Duergar", hp: 5 },
  Warlock: { id: "duergar-warlock", team: "Duergar", hp: 3 },
  Cleric: { id: "duergar-cleric", team: "Duergar", hp: 3 },
} as const;

async function startMatch(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
}

async function eliminateOpposingTeam(page: Page): Promise<{
  readonly eliminatedTeam: keyof typeof TEAM_CHARACTERS;
  readonly winner: keyof typeof TEAM_CHARACTERS;
}> {
  const activeCard = page.locator("[data-active-character]");
  const sourceTeam = (await activeCard
    .getByText(/Drow|Duergar/, { exact: true })
    .textContent()) as TeamName;
  const eliminatedTeam: keyof typeof TEAM_CHARACTERS =
    sourceTeam === "Drow" ? "Duergar" : "Drow";
  const targets = TEAM_CHARACTERS[eliminatedTeam];

  for (let attack = 0; attack < 5; attack += 1) {
    await page.getByRole("button", { name: "Basic Attack" }).click();
    for (const characterId of targets) {
      await page.locator(`[data-hit-character="${characterId}"]`).check();
    }
    for (const label of [
      "Range is legal",
      "Line of Sight is legal",
      "Every selected bottle was physically hit",
      "Terrain contact was resolved",
    ]) {
      await page.getByLabel(label).check();
    }
    await page
      .getByRole("button", { name: "Review Action Resolution" })
      .click();
    if (attack > 0) await page.getByLabel(/Record referee override/).check();
    await page
      .getByRole("button", { name: "Confirm Action Resolution" })
      .click();
  }
  return { eliminatedTeam, winner: sourceTeam };
}

async function recordAttack(
  page: Page,
  targets: readonly string[],
  repeated: boolean,
) {
  await page.getByRole("button", { name: "Basic Attack", exact: true }).click();
  for (const characterId of targets) {
    await page.locator(`[data-hit-character="${characterId}"]`).check();
  }
  for (const label of [
    "Range is legal",
    "Line of Sight is legal",
    "Every selected bottle was physically hit",
    "Terrain contact was resolved",
  ]) {
    await page.getByLabel(label).check();
  }
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  if (repeated) await page.getByLabel(/Record referee override/).check();
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
}

async function eliminateBothTeams(page: Page) {
  let activeName = await page
    .locator("[data-active-character] h3")
    .textContent();
  while (
    activeName === "Monk" ||
    activeName === "Fighter" ||
    activeName === null
  ) {
    const previousName = activeName;
    await page.getByRole("button", { name: "Finish Turn" }).click();
    const activeHeading = page.locator("[data-active-character] h3");
    if (previousName !== null)
      await expect(activeHeading).not.toHaveText(previousName);
    activeName = await activeHeading.textContent();
  }
  const source = CHARACTER_BY_NAME[activeName as CharacterName];
  const opponent = Object.values(CHARACTER_BY_NAME).find(
    (character) => character.team !== source.team && character.hp === source.hp,
  );
  if (!opponent)
    throw new Error("The test needs an equal-HP opposing character.");
  const finalists = [source.id, opponent.id];
  const otherTargets = [
    ...TEAM_CHARACTERS.Drow,
    ...TEAM_CHARACTERS.Duergar,
  ].filter((characterId) => !finalists.includes(characterId));
  let repeated = false;
  for (let attack = 0; attack < 5; attack += 1) {
    await recordAttack(page, otherTargets, repeated);
    repeated = true;
  }
  for (let attack = 0; attack < source.hp; attack += 1) {
    await recordAttack(page, finalists, repeated);
    repeated = true;
  }
  return finalists;
}

test("normal Team Elimination continues, ends, reopens, and removes exactly", async ({
  page,
}) => {
  await startMatch(page);
  const { eliminatedTeam, winner } = await eliminateOpposingTeam(page);

  await expect(
    page.getByRole("heading", { name: `${winner} wins` }),
  ).toBeVisible();
  await expect(
    page.getByText(`All six ${eliminatedTeam} characters are Downed.`),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "End Game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Continue was acknowledged/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Continue was acknowledged/)).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Undo Continue?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.getByRole("heading", { name: `${winner} wins` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "End this Match?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await expect(page.getByText(`${winner} wins`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Basic Attack" })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reopen Match" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.locator("[data-prior-summary]")).toContainText(
    `${winner} wins`,
  );
  await page.getByRole("button", { name: "End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "End this Match?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove Match" }).click();
  await expect(
    page.getByRole("heading", { name: /Remove this Ended Match/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(
    page.getByRole("button", { name: "Create Match" }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create Match" }),
  ).toBeEnabled();
});

test("Continue skips every eliminated-team slot and preserves round wrap", async ({
  page,
}) => {
  await startMatch(page);
  const { eliminatedTeam, winner } = await eliminateOpposingTeam(page);
  await page.getByRole("button", { name: "Continue" }).click();

  for (const characterId of TEAM_CHARACTERS[eliminatedTeam]) {
    const familyName = characterId.split("-").at(-1);
    if (familyName === undefined) {
      throw new Error("The character id has no name segments.");
    }
    await expect(
      page.locator(`[data-active-order-row]`, {
        has: page.locator(`th`, {
          hasText: new RegExp(familyName, "i"),
        }),
      }),
    ).toContainText("Skipped · Downed");
  }
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await expect(page.locator("[data-active-character]")).toContainText(winner);
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await expect(page.getByLabel(/Record referee override/)).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel draft" }).click();

  for (let turn = 0; turn < 12; turn += 1) {
    if (
      (await page.locator(".turn-position").first().textContent())?.includes(
        "Round 2",
      )
    )
      break;
    await page.getByRole("button", { name: "Finish Turn" }).click();
  }
  await expect(page.locator(".turn-position").first()).toContainText("Round 2");
  await page.reload();
  await expect(page.locator(".turn-position").first()).toContainText("Round 2");
});

for (const ruling of [
  { label: "Drow wins", result: "Drow wins" },
  { label: "Duergar wins", result: "Duergar wins" },
  { label: "Draw", result: "Draw" },
] as const) {
  test(`simultaneous Team Elimination records ${ruling.result}, Undo, End Game, and Reopen`, async ({
    page,
  }) => {
    await startMatch(page);
    const finalists = await eliminateBothTeams(page);

    await expect(
      page.getByRole("heading", { name: "Both teams are eliminated" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /authoritative rules do not define the simultaneous outcome/i,
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "End Game" })).toHaveCount(0);
    await page.getByRole("button", { name: "Record referee ruling" }).click();
    await expect(
      page.getByRole("heading", { name: "Both teams are eliminated" }),
    ).toBeVisible();

    await page.getByLabel(ruling.label).check();
    await page.getByRole("button", { name: "Record referee ruling" }).click();
    await expect(
      page.getByRole("heading", { name: ruling.result }),
    ).toBeVisible();
    await expect(page.getByText(/Recorded referee override/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: ruling.result }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Undo Simultaneous Elimination Ruling?",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm Undo" }).click();
    await expect(
      page.getByRole("heading", { name: "Both teams are eliminated" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(
      page.getByRole("heading", { name: "Undo Action Resolution?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm Undo" }).click();
    await expect(
      page.getByRole("heading", { name: "Both teams are eliminated" }),
    ).toHaveCount(0);

    await recordAttack(page, finalists, true);
    await page.getByLabel(ruling.label).check();
    await page.getByRole("button", { name: "Record referee ruling" }).click();

    await page.getByRole("button", { name: "End Game" }).click();
    await page.getByRole("button", { name: "Confirm End Game" }).click();
    await expect(
      page.getByRole("heading", { name: "Ended Match" }),
    ).toBeVisible();
    await expect(page.getByText(ruling.result, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Basic Attack" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(ruling.result, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reopen Match" }).click();
    await expect(
      page.getByRole("heading", { name: "Active Match" }),
    ).toBeVisible();
    await expect(page.locator("[data-prior-summary]")).toContainText(
      ruling.result,
    );
    await expect(
      page.getByRole("heading", { name: "Both teams are eliminated" }),
    ).toBeVisible();
  });
}
