import { expect, test } from "@playwright/test";

async function persistedMatchData(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bottlebound-match", 2);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    const transaction = database.transaction(
      ["metadata", "snapshots", "events"],
      "readonly",
    );
    const readStore = (name: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = transaction.objectStore(name).getAll();
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
      });
    const result = await Promise.all([
      readStore("metadata"),
      readStore("snapshots"),
      readStore("events"),
    ]);
    database.close();
    return result;
  });
}

async function rewritePersistedRulesVersion(
  page: import("@playwright/test").Page,
  rulesVersion: string,
) {
  await page.evaluate(async (version) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bottlebound-match", 2);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    const transaction = database.transaction(
      ["metadata", "snapshots", "events"],
      "readwrite",
    );
    for (const storeName of ["metadata", "snapshots", "events"]) {
      const store = transaction.objectStore(storeName);
      const values = await new Promise<Record<string, unknown>[]>(
        (resolve, reject) => {
          const request = store.getAll();
          request.addEventListener("success", () => resolve(request.result));
          request.addEventListener("error", () => reject(request.error));
        },
      );
      for (const value of values) {
        const rewritten = { ...value, rulesVersion: version };
        if (storeName === "metadata") {
          store.put(rewritten, "current-match");
        } else {
          store.put(rewritten);
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error));
      transaction.addEventListener("abort", () => reject(transaction.error));
    });
    database.close();
  }, rulesVersion);
}

async function rewritePersistedMatchAsSchema2(
  page: import("@playwright/test").Page,
) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bottlebound-match", 2);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    const transaction = database.transaction(
      ["metadata", "snapshots"],
      "readwrite",
    );
    const metadata = transaction.objectStore("metadata");
    const savedMetadata = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const request = metadata.get("current-match");
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
      },
    );
    metadata.put({ ...savedMetadata, schemaVersion: 2 }, "current-match");
    const snapshots = transaction.objectStore("snapshots");
    const savedSnapshots = await new Promise<Record<string, unknown>[]>(
      (resolve, reject) => {
        const request = snapshots.getAll();
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
      },
    );
    const snapshot = { ...savedSnapshots[0], schemaVersion: 2 };
    for (const key of [
      "spentReactionIds",
      "majorActionUsed",
      "eliminatedTeams",
      "acknowledgedEliminations",
      "outcome",
    ]) {
      delete snapshot[key];
    }
    snapshots.put(snapshot);
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error));
      transaction.addEventListener("abort", () => reject(transaction.error));
    });
    database.close();
  });
}

test("the complete bundled Ruleset opens globally in the responsive modal", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  const rules = page.getByRole("button", { name: "Rules", exact: true });
  await expect(rules).toBeVisible();
  await rules.click();

  const dialog = page.getByRole("dialog", { name: "BOTTLEBOUND Rules" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Ruleset BB20260822A1")).toBeVisible();
  await expect(dialog.locator("[data-rules-contents] ol a")).toHaveCount(16);
  await expect(dialog.locator("[data-rules-document] h2")).toHaveCount(16);
  await expect(dialog.getByRole("heading", { name: "Backstab" })).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "16. Referee Quick Reference" }),
  ).toBeVisible();

  for (const [linkName, headingName] of [
    ["Roster", "2. Teams, Roles, HP & Basic Attacks"],
    ["Abilities", "15. Character Ability Cards"],
    ["Universal rules", "5. Core Terms"],
    ["Quick reference", "16. Referee Quick Reference"],
  ] as const) {
    await dialog.getByRole("link", { name: linkName, exact: true }).click();
    await expect(
      dialog.getByRole("heading", { name: headingName, exact: true }),
    ).toBeInViewport();
  }

  const layout = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bottomGap: window.innerHeight - bounds.bottom,
      rightGap: window.innerWidth - bounds.right,
      widthRatio: bounds.width / window.innerWidth,
      heightRatio: bounds.height / window.innerHeight,
    };
  });
  if (testInfo.project.name === "phone") {
    expect(layout.bottomGap).toBeLessThan(2);
    expect(layout.widthRatio).toBeGreaterThan(0.9);
  } else {
    expect(layout.rightGap).toBeLessThan(2);
    expect(layout.heightRatio).toBeGreaterThan(0.9);
    expect(layout.widthRatio).toBeLessThan(0.8);
  }

  await dialog.getByRole("button", { name: "Close Rules" }).click();
  await page.getByRole("button", { name: "Create Match" }).click();
  await expect(rules).toBeVisible();
  await rules.click();
  await expect(dialog.getByText("Ruleset BB20260822A1")).toBeVisible();
  await dialog.getByRole("button", { name: "Close Rules" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(rules).toBeVisible();
  await rules.click();
  await expect(dialog.getByText("Ruleset BB20260822A1")).toBeVisible();
});

test("the complete bundled Ruleset remains readable after an offline cold launch", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(
    page.locator('[data-status="ready"]', { hasText: "Offline shell" }),
  ).toBeVisible();

  await context.setOffline(true);
  await page.close();
  const restarted = await context.newPage();
  await restarted.goto("/");
  await restarted.getByRole("button", { name: "Rules", exact: true }).click();

  const dialog = restarted.getByRole("dialog", {
    name: "BOTTLEBOUND Rules",
  });
  await dialog
    .getByRole("searchbox", { name: "Search rules" })
    .fill("backstab");
  await dialog
    .locator("[data-rules-results]")
    .getByRole("link")
    .first()
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Backstab" }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("heading", { name: "16. Referee Quick Reference" }),
  ).toBeVisible();
});

test("search explains matches and opens the complete reference at stable anchors", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rules", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "BOTTLEBOUND Rules" });
  await dialog.getByRole("link", { name: "1. Game Overview" }).click();
  await expect(
    dialog.getByRole("heading", { name: "1. Game Overview" }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("heading", { name: "Backstab" }),
  ).toBeAttached();

  await dialog
    .getByRole("searchbox", { name: "Search rules" })
    .fill("BACK-stab!!!");
  const results = dialog.locator("[data-rules-results]");
  const firstResult = results.getByRole("link").first();
  await expect(firstResult).toContainText("Backstab");
  await expect(firstResult.locator("mark")).toHaveCount(2);
  await expect(results.getByRole("link")).toHaveCount(3);

  await firstResult.click();
  await expect(
    dialog.getByRole("heading", { name: "Backstab" }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("heading", { name: "16. Referee Quick Reference" }),
  ).toBeAttached();
});

test("searches production rules prose and ranks the Backstab card before broader sections", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "BOTTLEBOUND Rules" });
  const search = dialog.getByRole("searchbox", { name: "Search rules" });

  await search.fill("unsafe movement");
  await expect(
    dialog.getByRole("link", { name: /4\. Battlefield Setup/ }),
  ).toBeVisible();

  await search.fill("Backstab");
  const results = dialog.locator("[data-rules-results]").getByRole("link");
  await expect(results.first()).toContainText("Backstab");
  await expect(results.first()).toContainText("Ability card");
  await expect(results).toHaveCount(3);

  await search.fill("back backstab");
  await expect(results.first().locator("mark")).toHaveCount(1);
  await expect(results.first().locator("mark")).toHaveText("Backstab");
});

test("restores an older Match unchanged and opens its exact unavailable Rules surface", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  const before = await persistedMatchData(page);
  await rewritePersistedRulesVersion(page, "BB-prior-release");

  await page.reload();
  await expect(page.getByText("Setup · Sequence 2")).toBeVisible();
  const restored = await persistedMatchData(page);
  expect(restored).toEqual(
    before.map((values) =>
      (values as Array<Record<string, unknown>>).map((value) => ({
        ...value,
        rulesVersion: "BB-prior-release",
      })),
    ),
  );

  await page.getByRole("button", { name: "Rules", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "BOTTLEBOUND Rules" });
  await expect(
    dialog.getByText("Ruleset BB-prior-release", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(/matching rules content is not bundled/),
  ).toBeVisible();
  expect(await persistedMatchData(page)).toEqual(restored);
});

test("gates Basic Attack by exact combat version while turn correction remains safe", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await rewritePersistedRulesVersion(page, "BB-prior-release");

  await page.reload();

  await expect(
    page.getByRole("button", { name: "Basic Attack" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/combat data for Ruleset BB-prior-release is not bundled/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish Turn" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.getByRole("button", { name: "Finish Turn" }).click();
  await expect(page.getByText("Round 1 · Slot 3 of 12")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(page.getByText("Round 1 · Slot 2 of 12")).toBeVisible();
});

test("restores a schema-2 Match only after one atomic combat migration", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await rewritePersistedMatchAsSchema2(page);

  await page.reload();

  await expect(page.getByText("Setup · Sequence 3")).toBeVisible();
  const [, snapshots, events] = await persistedMatchData(page);
  expect(snapshots).toEqual([
    expect.objectContaining({
      schemaVersion: 3,
      sequence: 3,
      spentReactionIds: [],
      majorActionUsed: false,
      eliminatedTeams: [],
      acknowledgedEliminations: [],
      outcome: null,
    }),
  ]);
  expect(events).toHaveLength(3);
  expect(events.at(-1)).toMatchObject({
    type: "MatchMigrated",
    fromSchemaVersion: 2,
    toSchemaVersion: 3,
  });
});

test("Rules retains live context, focus, search, and reading position", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();

  const initiativeRules = page.getByRole("button", {
    name: "Initiative rules",
  });
  await initiativeRules.click();
  const dialog = page.getByRole("dialog", { name: "BOTTLEBOUND Rules" });
  await expect(
    dialog.getByRole("heading", { name: "6. Initiative & Game Clock" }),
  ).toBeInViewport();
  await expect(dialog.getByText("Ruleset BB20260822A1")).toBeVisible();

  const search = dialog.getByRole("searchbox", { name: "Search rules" });
  await search.fill("backstab");
  await dialog
    .locator("[data-rules-results]")
    .getByRole("link")
    .first()
    .click();
  const retainedScroll = await dialog
    .locator(".rules-scroll")
    .evaluate((node) => {
      node.scrollTop += 37;
      return node.scrollTop;
    });
  expect(retainedScroll).toBeGreaterThan(0);

  await dialog.getByRole("button", { name: "Close Rules" }).click();
  await expect(initiativeRules).toBeFocused();
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await expect(search).toHaveValue("backstab");
  await expect(dialog.locator("#ability-rogue-backstab")).toHaveAttribute(
    "data-rules-selected",
  );
  await expect
    .poll(() =>
      dialog.locator(".rules-scroll").evaluate((node) => node.scrollTop),
    )
    .toBe(retainedScroll);

  await dialog.getByRole("button", { name: "Close Rules" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close Rules" }),
  ).toBeFocused();

  await page.locator(".rules-backdrop").dispatchEvent("click");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Rules", exact: true }),
  ).toBeFocused();
});

test("contextual rules preserve confirmations and committed Match progress", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await expect(
    page.getByRole("button", { name: "Exact tie-break rules" }),
  ).toBeVisible();
  const committedBeforeRules = await persistedMatchData(page);

  await page.getByRole("button", { name: "Exact tie-break rules" }).click();
  let dialog = page.getByRole("dialog", { name: "BOTTLEBOUND Rules" });
  await expect(
    dialog.getByRole("heading", { name: "6. Initiative & Game Clock" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  expect(await persistedMatchData(page)).toEqual(committedBeforeRules);

  await page.getByRole("button", { name: "Reroll initiative" }).click();
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "BOTTLEBOUND Rules" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm reroll" }),
  ).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Confirm reroll" }),
  ).toBeVisible();
  await expect(page.getByText("Setup · Sequence 2")).toBeVisible();
  expect(await persistedMatchData(page)).toEqual(committedBeforeRules);

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Discard Match" }).click();
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Confirm discard" }),
  ).toBeVisible();
  expect(await persistedMatchData(page)).toEqual(committedBeforeRules);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo rules" }).click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "6. Initiative & Game Clock" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Confirm Undo" }),
  ).toBeVisible();
  expect(await persistedMatchData(page)).toEqual(committedBeforeRules);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await page.getByRole("button", { name: "Turn rules" }).click();
  await expect(
    dialog.getByRole("heading", {
      name: "7. Turn Structure & Movement",
    }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Round rules" }).click();
  await expect(
    dialog.getByRole("heading", { name: "5. Core Terms" }),
  ).toBeInViewport();
});
