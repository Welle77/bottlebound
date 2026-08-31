export type NetworkState = "online" | "offline";
export type ServiceWorkerState =
  "unsupported" | "registering" | "waiting" | "controlled" | "failed";
export type ProbeState = "checking" | "ready" | "failed";
export type AppShellCacheState = "checking" | "ready" | "failed";

export type ReadinessInputs = {
  readonly network: NetworkState;
  readonly serviceWorker: ServiceWorkerState;
  readonly appShellCache: AppShellCacheState;
  readonly validatedStorage: ProbeState;
};

export type ReadinessState = {
  readonly network: NetworkState;
  readonly serviceWorker: ServiceWorkerState;
  readonly validatedStorage: ProbeState;
  readonly offline: "checking" | "ready" | "unavailable";
  readonly matchCreation: "available" | "blocked";
  readonly blockingReason: string | null;
};

export function deriveReadinessState(inputs: ReadinessInputs): ReadinessState {
  const offline =
    inputs.serviceWorker === "controlled" && inputs.appShellCache === "ready"
      ? "ready"
      : inputs.serviceWorker === "failed" || inputs.appShellCache === "failed"
        ? "unavailable"
        : "checking";
  const storageReady = inputs.validatedStorage === "ready";

  return {
    network: inputs.network,
    serviceWorker: inputs.serviceWorker,
    validatedStorage: inputs.validatedStorage,
    offline,
    matchCreation: storageReady ? "available" : "blocked",
    blockingReason: storageReady
      ? null
      : inputs.validatedStorage === "failed"
        ? "Validated storage is unavailable. Retry the storage check before you create a Match."
        : "Validated storage must pass its safety check before you create a Match.",
  };
}
