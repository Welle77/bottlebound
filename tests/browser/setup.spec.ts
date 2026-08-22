import { expect, test } from "@playwright/test";

test("the referee can create, roll, restore, reroll, and discard Setup", async ({
  page,
}) => {
  await page.goto("/");
  const create = page.getByRole("button", { name: "Create Match" });
  await expect(create).toBeEnabled();
  await create.click();

  await expect(
    page.getByRole("heading", { name: "Initiative Setup" }),
  ).toBeVisible();
  await expect(page.locator("[data-roster-row]")).toHaveCount(12);
  await expect(page.getByRole("cell", { name: "5/5" })).toHaveCount(2);

  await page.getByRole("button", { name: "Generate initiative" }).click();
  await expect(page.locator("[data-initiative-row]")).toHaveCount(12);
  await expect(
    page.getByText(
      "The complete committed order is ready. Exact ties use recorded digital coin flips.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Tie break" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator("[data-initiative-row]")).toHaveCount(12);
  await expect(page.getByText("Setup · Sequence 2")).toBeVisible();

  await page.getByRole("button", { name: "Reroll initiative" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm reroll" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Setup · Sequence 2")).toBeVisible();
  await page.getByRole("button", { name: "Reroll initiative" }).click();
  await page.getByRole("button", { name: "Confirm reroll" }).click();
  await expect(page.getByText("Setup · Sequence 3")).toBeVisible();

  await page.getByRole("button", { name: "Discard Match" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm discard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm discard" }).click();
  await expect(
    page.getByRole("button", { name: "Create Match" }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create Match" }),
  ).toBeEnabled();
});

test("the Setup view labels every exact tie as a digital coin flip", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint32Array) array.fill(0);
        return array;
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();

  await expect(
    page.getByRole("cell", { name: "Digital coin flip", exact: true }),
  ).toHaveCount(11);
});
