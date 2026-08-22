import { describe, expect, it } from "vitest";

import { deriveReadinessState } from "./readiness";

describe("Referee Console readiness", () => {
  it("distinguishes network, service-worker, offline, and canonical-storage state", () => {
    expect(
      deriveReadinessState({
        network: "offline",
        serviceWorker: "controlled",
        appShellCache: "ready",
        canonicalStorage: "ready",
      }),
    ).toEqual({
      network: "offline",
      serviceWorker: "controlled",
      offline: "ready",
      canonicalStorage: "ready",
      matchCreation: "available",
      blockingReason: null,
    });
  });

  it("blocks Match creation with a retryable reason after a storage failure", () => {
    const readiness = deriveReadinessState({
      network: "online",
      serviceWorker: "controlled",
      appShellCache: "ready",
      canonicalStorage: "failed",
    });

    expect(readiness.matchCreation).toBe("blocked");
    expect(readiness.blockingReason).toBe(
      "Canonical storage is unavailable. Retry the storage check before you create a Match.",
    );
  });
});
