import { expect, test } from "@playwright/test";

test("the referee previews, confirms, repeats, and restores Undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await page.getByRole("button", { name: "Finish Turn" }).click();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Undo Finish Turn?" }),
  ).toBeVisible();
  await expect(page.getByText(/Are you sure you want to undo this action/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(page.getByText("Round 1 · Slot 1 of 12")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Round 1 · Slot 1 of 12")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Initiative Setup" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The complete committed order is ready. Exact ties use recorded digital coin flips.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Confirm Undo" }).click();
  await expect(
    page.getByText("Generate the complete order when ready."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

test("a failed Undo leaves the last committed Match visible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Match" }).click();
  await page.getByRole("button", { name: "Generate initiative" }).click();
  await page.getByRole("button", { name: "Start Match" }).click();
  await page.getByRole("button", { name: "Finish Turn" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.evaluate(() => {
    const { add } = IDBObjectStore.prototype;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "events") {
        throw new DOMException("Injected storage failure", "DataError");
      }
      return add.apply(this, args);
    };
  });

  await page.getByRole("button", { name: "Confirm Undo" }).click();

  await expect(page.getByText("Round 1 · Slot 2 of 12")).toBeVisible();
  await expect(
    page.getByText(/The last committed Active Match remains visible/),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Round 1 · Slot 2 of 12")).toBeVisible();
});
