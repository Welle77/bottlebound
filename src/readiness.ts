export type NetworkState = "online" | "offline";
export type ServiceWorkerState =
  "unsupported" | "registering" | "waiting" | "controlled" | "failed";
export type ProbeState = "checking" | "ready" | "failed";
export type AppShellCacheState = "checking" | "ready" | "failed";

export type ReadinessInputs = {
  readonly network: NetworkState;
  readonly serviceWorker: ServiceWorkerState;
  readonly appShellCache: AppShellCacheState;
  readonly canonicalStorage: ProbeState;
}

export type ReadinessState = {
  readonly network: NetworkState;
  readonly serviceWorker: ServiceWorkerState;
  readonly canonicalStorage: ProbeState;
  readonly offline: "checking" | "ready" | "unavailable";
  readonly matchCreation: "available" | "blocked";
  readonly blockingReason: string | null;
}

export function deriveReadinessState(inputs: ReadinessInputs): ReadinessState {
  const offline =
    inputs.serviceWorker === "controlled" && inputs.appShellCache === "ready"
      ? "ready"
      : inputs.serviceWorker === "failed" || inputs.appShellCache === "failed"
        ? "unavailable"
        : "checking";
  const storageReady = inputs.canonicalStorage === "ready";

  return {
    network: inputs.network,
    serviceWorker: inputs.serviceWorker,
    canonicalStorage: inputs.canonicalStorage,
    offline,
    matchCreation: storageReady ? "available" : "blocked",
    blockingReason: storageReady
      ? null
      : inputs.canonicalStorage === "failed"
        ? "Canonical storage is unavailable. Retry the storage check before you create a Match."
        : "Canonical storage must pass its safety check before you create a Match.",
  };
}
