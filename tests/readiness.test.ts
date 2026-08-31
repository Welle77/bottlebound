import { describe, expect, it } from "vitest";

import { deriveReadinessState } from "../src/readiness";

describe("Referee Console readiness", () => {
  it("distinguishes network, service-worker, offline, and validated-storage state", () => {
    expect(
      deriveReadinessState({
        network: "offline",
        serviceWorker: "controlled",
        appShellCache: "ready",
        validatedStorage: "ready",
      }),
    ).toEqual({
      network: "offline",
      serviceWorker: "controlled",
      offline: "ready",
      validatedStorage: "ready",
      matchCreation: "available",
      blockingReason: null,
    });
  });

  it("blocks Match creation with a retryable reason after a storage failure", () => {
    const readiness = deriveReadinessState({
      network: "online",
      serviceWorker: "controlled",
      appShellCache: "ready",
      validatedStorage: "failed",
    });

    expect(readiness.matchCreation).toBe("blocked");
    expect(readiness.blockingReason).toBe(
      "Validated storage is unavailable. Retry the storage check before you create a Match.",
    );
  });
});
