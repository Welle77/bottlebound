import { expect, test, type Page } from "@playwright/test";

async function waitForInstalledShell(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(
    page.locator('[data-status="controlled"]', { hasText: "Service worker" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-status="ready"]', { hasText: "Offline shell" }),
  ).toBeVisible();
}

test("an offline cold start restores exact Setup and Active Match state", async ({
  context,
  page,
}) => {
  await waitForInstalledShell(page);
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  const setupRows = await page
    .locator("[data-initiative-row]")
    .allTextContents();
  await expect(page.getByText("Setup · Sequence 2")).toBeVisible();

  await context.setOffline(true);
  await page.close();
  let restarted = await context.newPage();
  await restarted.goto("/");
  await expect(restarted.getByText("Setup · Sequence 2")).toBeVisible();
  await expect(restarted.locator("[data-initiative-row]")).toHaveText(
    setupRows,
  );

  await restarted.getByRole("button", { name: "Start Match" }).click();
  await restarted.getByRole("button", { name: "Finish Turn" }).click();
  // The commit re-render is asynchronous; wait for the advanced turn to land
  // before capturing state so the restart comparison cannot read the stale
  // pre-commit panel.
  await expect(restarted.getByText("Round 1 · Slot 2 of 12")).toBeVisible();
  const activeRows = await restarted
    .locator("[data-active-order-row]")
    .allTextContents();
  const activeCharacter = await restarted
    .locator("[data-active-character]")
    .textContent();

  await restarted.close();
  restarted = await context.newPage();
  await restarted.goto("/");
  await expect(restarted.getByText("Round 1 · Slot 2 of 12")).toBeVisible();
  await expect(restarted.locator("[data-active-order-row]")).toHaveText(
    activeRows,
  );
  await expect(restarted.locator("[data-active-character]")).toHaveText(
    activeCharacter ?? "",
  );
});

test("invalid saved data stops recovery without creating replacement data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("bottlebound-match", 2);
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    const transaction = database.transaction("snapshots", "readwrite");
    const store = transaction.objectStore("snapshots");
    const snapshots = await new Promise<Record<string, unknown>[]>(
      (resolve, reject) => {
        const request = store.getAll();
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
      },
    );
    store.put({ ...snapshots[0], configurationVersion: "incompatible" });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("abort", () => reject(transaction.error));
      transaction.addEventListener("error", () => reject(transaction.error));
    });
    database.close();
  });

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved Match needs recovery" }),
  ).toBeVisible();
  await expect(
    page.getByText("The console did not create replacement Match data."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Match" })).toHaveCount(
    0,
  );
  await expect(
    page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("bottlebound-match", 2);
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
      });
      const transaction = database.transaction(
        ["metadata", "snapshots", "events"],
        "readonly",
      );
      const count = (storeName: string) =>
        new Promise<number>((resolve, reject) => {
          const request = transaction.objectStore(storeName).count();
          request.addEventListener("success", () => resolve(request.result));
          request.addEventListener("error", () => reject(request.error));
        });
      const counts = await Promise.all([
        count("metadata"),
        count("snapshots"),
        count("events"),
      ]);
      database.close();
      return counts;
    }),
  ).resolves.toEqual([1, 1, 1]);
});

test("the Setup controls and layout meet browser usability checks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();

  await expect(page.getByRole("columnheader")).toHaveText([
    "Slot",
    "Character",
    "Team",
    "Roll",
    "Modifier",
    "Total",
    "Tie break",
  ]);
  await expect(page.locator("[data-initiative-row]")).toHaveCount(12);
  expect(
    await page
      .locator("[data-initiative-row]")
      .evaluateAll((rows) =>
        rows.every(
          (row) =>
            row.children.length === 7 &&
            [...row.children].every((cell) => cell.textContent?.trim()),
        ),
      ),
  ).toBe(true);

  const checks = await page.locator("button:visible").evaluateAll((buttons) => {
    const parseColor = (value: string): [number, number, number] => {
      const channels = value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      if (!channels || channels.length !== 3) throw new Error("Invalid color");
      return channels as [number, number, number];
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
        if (!color.endsWith(", 0)")) return color;
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
  expect(checks.every(({ width, height }) => width >= 48 && height >= 48)).toBe(
    true,
  );
  expect(checks.every(({ contrast }) => contrast >= 4.5)).toBe(true);

  const visibleButtonCount = await page.locator("button:visible").count();
  const keyboardFocusedButtons = new Set<string>();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    const focusedButton = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLButtonElement)) return null;
      const style = getComputedStyle(element);
      return {
        id: element.id,
        hasVisibleOutline:
          style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 4,
      };
    });
    if (focusedButton) {
      keyboardFocusedButtons.add(focusedButton.id);
      expect(focusedButton.hasVisibleOutline).toBe(true);
    }
    if (keyboardFocusedButtons.size === visibleButtonCount) break;
  }
  expect(keyboardFocusedButtons.size).toBe(visibleButtonCount);

  expect(
    await page.locator("*").evaluateAll((elements) =>
      elements.every((element) => {
        const style = getComputedStyle(element);
        return (
          style.animationName === "none" &&
          style.animationDuration === "0s" &&
          style.transitionDuration === "0s"
        );
      }),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
