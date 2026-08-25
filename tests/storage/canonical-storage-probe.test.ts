import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { probeCanonicalStorage } from "../../src/storage/canonical-storage-probe";

describe("canonical storage probe", () => {
  it("reports ready only after IndexedDB writes and removes the probe record", async () => {
    const indexedDB = new IDBFactory();

    await expect(probeCanonicalStorage(indexedDB)).resolves.toEqual({
      status: "ready",
    });
  });

  it("returns a safe blocking result when IndexedDB cannot open", async () => {
    const unavailableIndexedDB = {
      open: () => {
        throw new Error("storage disabled");
      },
    } as unknown as IDBFactory;

    await expect(probeCanonicalStorage(unavailableIndexedDB)).resolves.toEqual({
      status: "failed",
      reason:
        "IndexedDB could not complete the canonical write and removal check.",
    });
  });
});
