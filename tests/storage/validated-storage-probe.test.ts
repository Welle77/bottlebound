import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { probeValidatedStorage } from "../../src/storage/validated-storage-probe";

describe("validated storage probe", () => {
  it("reports ready only after IndexedDB writes and removes the probe record", async () => {
    const indexedDB = new IDBFactory();

    await expect(probeValidatedStorage(indexedDB)).resolves.toEqual({
      status: "ready",
    });
  });

  it("returns a safe blocking result when IndexedDB cannot open", async () => {
    class UnavailableIDBFactory extends IDBFactory {
      override open(): IDBOpenDBRequest {
        throw new Error("storage disabled");
      }
    }
    const unavailableIndexedDB = new UnavailableIDBFactory();

    await expect(probeValidatedStorage(unavailableIndexedDB)).resolves.toEqual({
      status: "failed",
      reason:
        "IndexedDB could not complete the validated write and removal check.",
    });
  });
});
