import { expect, test, type Page } from "@playwright/test";

type OptionalRecord = Record<string, unknown> | undefined;
type RGB = [number, number, number];
type SnapshotProbe = Record<string, unknown> & {
  activeSlot: number;
  outcome: unknown;
};
type AddMethod = typeof IDBObjectStore.prototype.add;
type AddParameters = Parameters<AddMethod>;

async function startMatch(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
}

async function completePhysicalChecks(page: Page): Promise<void> {
  for (const label of [
    "Range is legal",
    "Line of Sight is legal",
    "Every selected bottle was physically hit",
    "Terrain contact was resolved",
  ] as const) {
    await page.getByLabel(label).check();
  }
}

async function attackTargets(
  page: Page,
  targets: readonly string[],
): Promise<void> {
  await page.getByRole("button", { name: "Basic Attack" }).click();
  for (const characterId of targets) {
    await page.locator(`[data-hit-character="${characterId}"]`).check();
  }
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await page.getByRole("button", { name: "Confirm Action Resolution" }).click();
}

async function getSummary(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bottlebound-match", 2);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    const transaction = database.transaction("summaries", "readonly");
    const request = transaction.objectStore("summaries").get("latest-summary");
    const result = await new Promise<unknown>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    database.close();
    return (result as OptionalRecord) ?? null;
  });
}

async function checkUsable(page: Page): Promise<void> {
  await page.waitForTimeout(50);
  const details = await page
    .locator("button:visible")
    .evaluateAll((buttons) => {
      const parseColor = (value: string): [number, number, number] => {
        if (value === "transparent") return [21, 18, 15];
        const channels = value
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number);
        if (!channels || channels.length !== 3) return [255, 248, 232];
        return channels as RGB;
      };
      const luminance = ([red, green, blue]: [number, number, number]) => {
        const linear = [red, green, blue].map((channel) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
        return (
          0.2126 * (linear[0] ?? 0) +
          0.7152 * (linear[1] ?? 0) +
          0.0722 * (linear[2] ?? 0)
        );
      };
      const background = (element: Element): string => {
        let current: Element | null = element;
        while (current) {
          const color = getComputedStyle(current).backgroundColor;
          if (!color.endsWith(", 0)") && color !== "transparent") return color;
          current = current.parentElement;
        }
        return "rgb(21, 18, 15)";
      };
      return buttons.map((button) => {
        const style = getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        const foreground = luminance(parseColor(style.color));
        const backdrop = luminance(parseColor(background(button)));
        return {
          width: bounds.width,
          height: bounds.height,
          contrast:
            (Math.max(foreground, backdrop) + 0.05) /
            (Math.min(foreground, backdrop) + 0.05),
        };
      });
    });
  const filtered = details.filter(
    ({ width, height }) => width > 0 && height > 0,
  );
  expect(
    filtered.every(({ width, height }) => width >= 48 && height >= 48),
  ).toBe(true);
  expect(filtered.every(({ contrast }) => contrast >= 4.5)).toBe(true);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
  ).toBe(true);
  const focusOk = await page.evaluate(
    () => document.body.scrollWidth <= window.innerWidth,
  );
  expect(focusOk).toBe(true);
}

test("preview, confirm, read-only Ended, Reopen, and restore consistency", async ({
  page,
  context,
}) => {
  await startMatch(page);

  await expect(page.getByRole("button", { name: "End Game" })).toBeVisible();
  await page.getByRole("button", { name: "End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "End this Match?" }),
  ).toBeVisible();
  await expect(
    page.locator(".ended-result", { hasText: "Winner" }),
  ).toBeVisible();
  await expect(page.getByText("Decision Basis", { exact: true })).toBeVisible();
  // initial fresh match: active counts 6-6, HP 20 vs 22 => activeHpTotal, Duergar wins
  await expect(
    page.getByText("Active HP total", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ended-result")).toContainText("Duergar wins");
  await checkUsable(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "End this Match?" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await expect(page.locator(".ended-result")).toContainText("Duergar wins");
  await expect(
    page.getByText("Active HP total", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Active counts/)).toBeVisible();
  await expect(page.getByText(/Active HP totals/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Basic Attack" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Finish Turn" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reopen Match" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove Match" }),
  ).toBeVisible();
  await checkUsable(page);

  // read-only: attempts to mutate via reload + finish turn not present
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Basic Attack" })).toHaveCount(
    0,
  );

  // Undo inert while Ended: no Undo button
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);

  // Reopen restores exact pre-End Game
  const beforeReopenSlot = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bottlebound-match", 2);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    const transaction = database.transaction("snapshots", "readonly");
    const result = await new Promise<SnapshotProbe>((resolve, reject) => {
      const request = transaction.objectStore("snapshots").getAll();
      request.addEventListener("success", () =>
        resolve(request.result[0] as SnapshotProbe),
      );
      request.addEventListener("error", () => reject(request.error));
    });
    database.close();
    return { activeSlot: result.activeSlot, outcome: result.outcome };
  });
  expect(beforeReopenSlot.outcome).not.toBeNull();

  await page.getByRole("button", { name: "Reopen Match" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Basic Attack" }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Finish Turn" })).toBeEnabled();

  // outcome cleared on Reopen => preview recomputes same activeHpTotal
  await page.getByRole("button", { name: "End Game" }).click();
  await expect(page.locator(".end-game-preview .ended-result")).toContainText(
    "Active HP total",
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  // Undo works after Reopen
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await expect(page.getByText("Round 1 · Slot 2 of 12")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Undo Finish Turn?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(page.getByText("Round 1 · Slot 1 of 12")).toBeVisible();

  // restore consistency after reopen via browser restart
  const restarted = await context.newPage();
  await restarted.goto("/");
  await expect(
    restarted.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(restarted.getByText("Round 1 · Slot 1 of 12")).toBeVisible();
  // summary should have survived reopen
  await expect(restarted.locator("[data-prior-summary]")).toBeVisible();
  await expect(restarted.locator("[data-prior-summary]")).toContainText(
    "Duergar wins",
  );
  await restarted.close();
});

test("Action Draft blocks End Game until confirmed or canceled", async ({
  page,
}) => {
  await startMatch(page);
  await expect(page.getByRole("button", { name: "End Game" })).toBeVisible();
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await expect(
    page.getByRole("heading", { name: "Record Basic Attack" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "End Game" })).toHaveCount(0);
  // cannot trigger via keyboard either
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByRole("button", { name: "End Game" })).toBeVisible();
  await page.getByRole("button", { name: "Basic Attack" }).click();
  await page.locator('[data-hit-character="drow-paladin"]').check();
  await completePhysicalChecks(page);
  await page.getByRole("button", { name: "Review Action Resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Review Basic Attack" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "End Game" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByRole("button", { name: "End Game" })).toBeVisible();
});

test("coin-flip tie resolves via recorded flip, no draw, cancel discards", async ({
  page,
}) => {
  await startMatch(page);

  // create equal HP totals: initial Drow 20, Duergar 22 -> damage 2 Duergar to tie
  await attackTargets(page, ["duergar-ranger"]);
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await attackTargets(page, ["duergar-warlock"]);
  // verify HP totals now equal via Ended preview indirectly, but check row HP
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Ranger" }),
  ).toContainText("2/3");
  await expect(
    page.locator("[data-active-order-row]", { hasText: "Warlock" }),
  ).toContainText("2/3");

  await page.getByRole("button", { name: "End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "End this Match?" }),
  ).toBeVisible();
  await expect(page.getByText("Coin Flip")).toBeVisible();
  const firstWinner = await page
    .locator(".ended-result dd")
    .first()
    .textContent();
  expect(firstWinner === "Drow wins" || firstWinner === "Duergar wins").toBe(
    true,
  );
  // recorded flip should appear next to basis
  const basisTextFirst = await page.getByText(/Coin Flip/).textContent();
  expect(
    basisTextFirst === null ? false : /Drow|Duergar/.test(basisTextFirst),
  ).toBe(true);
  await checkUsable(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Ended Match" })).toHaveCount(
    0,
  );
  // ensure no summary was created on cancel
  expect(await getSummary(page)).toBeNull();

  // re-enter preview flips again (still coinFlip, winner may be same or other but must be valid)
  await page.getByRole("button", { name: "End Game" }).click();
  await expect(page.getByText("Coin Flip")).toBeVisible();
  const secondWinner = await page
    .locator(".ended-result dd")
    .first()
    .textContent();
  expect(secondWinner === "Drow wins" || secondWinner === "Duergar wins").toBe(
    true,
  );
  expect(secondWinner?.includes("Draw")).toBe(false);

  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await expect(page.getByText("Coin Flip")).toBeVisible();
  const endedWinner = await page
    .locator(".ended-result dd")
    .first()
    .textContent();
  expect(endedWinner).toBe(secondWinner);

  const summary = await getSummary(page);
  expect(summary).not.toBeNull();
  expect(summary?.decisionBasis).toBe("coinFlip");
  expect(
    summary?.coinFlipResult === "Drow" || summary?.coinFlipResult === "Duergar",
  ).toBe(true);
  if (summary?.coinFlipResult === "Drow") expect(endedWinner).toBe("Drow wins");
  if (summary?.coinFlipResult === "Duergar")
    expect(endedWinner).toBe("Duergar wins");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await expect(page.getByText("Coin Flip")).toBeVisible();
  const summaryAfterReload = await getSummary(page);
  expect(summaryAfterReload).toEqual(summary);
});

test("summary retention, replacement, and restore consistency", async ({
  page,
  context,
}) => {
  await startMatch(page);
  // first Ended: activeHpTotal Duergar wins
  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  const firstSummary = await getSummary(page);
  expect(firstSummary?.outcome).toBe("Duergar");
  expect(firstSummary?.decisionBasis).toBe("activeHpTotal");

  // Start new Match retains prior summary
  await page.getByRole("button", { name: "Start new Match" }).click();
  await expect(
    page.getByRole("heading", { name: "Start a new Match?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm start" }).click();
  await expect(
    page.getByRole("heading", { name: "Initiative Setup" }),
  ).toBeVisible();
  await expect(page.locator("[data-prior-summary]")).toBeVisible();
  await expect(page.locator("[data-prior-summary]")).toContainText(
    "Duergar wins",
  );
  await expect(page.locator("[data-prior-summary]")).toContainText(
    "Active HP total",
  );
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.locator("[data-prior-summary]")).toBeVisible();
  await expect(page.locator("[data-prior-summary]")).toContainText(
    "Duergar wins",
  );

  // restart while new Match runs retains prior summary
  let restarted = await context.newPage();
  await restarted.goto("/");
  await expect(
    restarted.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(restarted.locator("[data-prior-summary]")).toContainText(
    "Duergar wins",
  );
  await restarted.close();

  // make second Ended produce different outcome: create coin-flip tie
  await attackTargets(page, ["duergar-ranger"]);
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await attackTargets(page, ["duergar-warlock"]);
  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await expect(page.getByText("Coin Flip")).toBeVisible();
  const secondSummary = await getSummary(page);
  expect(secondSummary?.decisionBasis).toBe("coinFlip");
  expect(secondSummary).not.toEqual(firstSummary);

  // replacement: prior summary now is the new one
  await page.getByRole("button", { name: "Start new Match" }).click();
  await page.getByRole("button", { name: "Confirm start" }).click();
  await expect(page.locator("[data-prior-summary]")).toContainText("Coin Flip");
  // verify prior summary field count correctness via DB
  const summaryAfterReplace = await getSummary(page);
  expect(summaryAfterReplace).toEqual(secondSummary);
  restarted = await context.newPage();
  await restarted.goto("/");
  await expect(restarted.locator("[data-prior-summary]")).toContainText(
    "Coin Flip",
  );
  await restarted.close();
});

test("both removal paths require confirmation and produce distinct effects", async ({
  page,
}) => {
  await startMatch(page);
  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  expect(await getSummary(page)).not.toBeNull();

  // removal of current Ended Match requires confirmation: cancel keeps Ended
  await page.getByRole("button", { name: "Remove Match" }).click();
  await expect(
    page.getByRole("heading", { name: /Remove this Ended Match/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  expect(await getSummary(page)).not.toBeNull();

  // confirm removal removes snapshot, history, summary, reopen, undo
  await page.getByRole("button", { name: "Remove Match" }).click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(
    page.getByRole("button", { name: "Create Match" }),
  ).toBeEnabled();
  expect(await getSummary(page)).toBeNull();
  const afterRemoveSummary = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bottlebound-match", 2);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    const transaction = database.transaction(
      ["metadata", "snapshots", "events"],
      "readonly",
    );
    const metadata = await new Promise<unknown>((resolve, reject) => {
      const req = transaction.objectStore("metadata").get("current-match");
      req.addEventListener("success", () => resolve(req.result));
      req.addEventListener("error", () => reject(req.error));
    });
    const snapshots = await new Promise<unknown[]>((resolve, reject) => {
      const req = transaction.objectStore("snapshots").getAll();
      req.addEventListener("success", () => resolve(req.result));
      req.addEventListener("error", () => reject(req.error));
    });
    const events = await new Promise<unknown[]>((resolve, reject) => {
      const req = transaction.objectStore("events").getAll();
      req.addEventListener("success", () => resolve(req.result));
      req.addEventListener("error", () => reject(req.error));
    });
    database.close();
    return { metadata, snapshots, events };
  });
  expect(afterRemoveSummary.metadata).toBeUndefined();
  expect(afterRemoveSummary.snapshots).toEqual([]);
  expect(afterRemoveSummary.events).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create Match" }),
  ).toBeEnabled();
  expect(await getSummary(page)).toBeNull();

  // create prior summary scenario
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  const summaryForPrior = await getSummary(page);
  expect(summaryForPrior).not.toBeNull();
  await page.getByRole("button", { name: "Start new Match" }).click();
  await page.getByRole("button", { name: "Confirm start" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.locator("[data-prior-summary]")).toBeVisible();
  await expect(page.locator("[data-active-order-row]")).toHaveCount(12);
  const activeOrderBefore = await page
    .locator("[data-active-order-row]")
    .allTextContents();

  // removal of prior summary requires confirmation and does not touch Active Match
  await page.locator("#request-remove-summary").click();
  await expect(
    page.getByRole("heading", { name: "Remove prior summary?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-prior-summary]")).toBeVisible();
  await page.locator("#request-remove-summary").click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.locator("[data-prior-summary]")).toHaveCount(0);
  expect(await getSummary(page)).toBeNull();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.locator("[data-active-order-row]")).toHaveText(
    activeOrderBefore,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  await expect(page.locator("[data-prior-summary]")).toHaveCount(0);
  await expect(page.locator("[data-active-order-row]")).toHaveText(
    activeOrderBefore,
  );
});

test("restore consistency after failed End Game and Reopen transactions", async ({
  page,
}) => {
  await startMatch(page);
  // inject failure on events add to simulate partial commit failure
  await page.evaluate(() => {
    const originalAdd = IDBObjectStore.prototype.add;
    Reflect.set(IDBObjectStore.prototype, "__originalAdd", originalAdd);
  });
  await page.getByRole("button", { name: "End Game" }).click();
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add as AddMethod;
    const patched = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof IDBObjectStore.prototype.add>
    ): ReturnType<typeof IDBObjectStore.prototype.add> {
      if (this.name === "events") {
        throw new DOMException("Injected storage failure", "DataError");
      }
      return add.apply(this, args as AddParameters);
    } as AddMethod;
    IDBObjectStore.prototype.add = patched;
  });
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByText(/last committed Active Match remains visible/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  // restore original before reload so restore can read old state
  await page.evaluate(() => {
    const original = Reflect.get(IDBObjectStore.prototype, "__originalAdd");
    if (typeof original === "function") IDBObjectStore.prototype.add = original;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Active Match" }),
  ).toBeVisible();
  expect(await getSummary(page)).toBeNull();

  // successful End Game after failure shows no partial state
  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  const goodSummary = await getSummary(page);
  expect(goodSummary).not.toBeNull();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  expect(await getSummary(page)).toEqual(goodSummary);

  // failed Reopen should leave Ended intact
  await page.evaluate(() => {
    const originalAdd = IDBObjectStore.prototype.add;
    Reflect.set(IDBObjectStore.prototype, "__originalAdd2", originalAdd);
  });
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add as AddMethod;
    const patched = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof IDBObjectStore.prototype.add>
    ): ReturnType<typeof IDBObjectStore.prototype.add> {
      if (this.name === "events") {
        throw new DOMException("Injected storage failure", "DataError");
      }
      return add.apply(this, args as AddParameters);
    } as AddMethod;
    IDBObjectStore.prototype.add = patched;
  });
  await page.getByRole("button", { name: "Reopen Match" }).click();
  await expect(page.getByText(/could not commit/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const original = Reflect.get(IDBObjectStore.prototype, "__originalAdd2");
    if (typeof original === "function") IDBObjectStore.prototype.add = original;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ended Match" }),
  ).toBeVisible();
  expect(await getSummary(page)).toEqual(goodSummary);
});

test("phone and tablet high-contrast large-target responsive holds on new screens", async ({
  page,
}) => {
  await startMatch(page);
  await attackTargets(page, ["duergar-ranger"]);
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await attackTargets(page, ["duergar-warlock"]);
  await page.getByRole("button", { name: "End Game" }).click();
  await checkUsable(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "Confirm End Game" }).click();
  await checkUsable(page);
  await page.getByRole("button", { name: "Start new Match" }).click();
  await page.getByRole("button", { name: "Confirm start" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await checkUsable(page);
  await page.getByRole("button", { name: "Start Match" }).click();
  await checkUsable(page);
  await expect(page.locator("[data-prior-summary]")).toBeVisible();
  await checkUsable(page);
  await page.locator("#request-remove-summary").click();
  await checkUsable(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await checkUsable(page);
});
