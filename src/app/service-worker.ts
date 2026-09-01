import type { Application } from "./application";

export function checkCachedShell(
  worker: ServiceWorker,
  application: Application,
): void {
  const channel = new MessageChannel();
  const timeout = window.setTimeout(() => {
    application.setAppShellCacheState("failed");
  }, 3_000);
  channel.port1.addEventListener(
    "message",
    (
      event: MessageEvent<{ readonly type?: string; readonly ready?: boolean }>,
    ) => {
      window.clearTimeout(timeout);
      application.setAppShellCacheState(
        event.data.type === "APP_SHELL_STATUS" && event.data.ready
          ? "ready"
          : "failed",
      );
    },
    { once: true },
  );
  channel.port1.start();
  worker.postMessage({ type: "CHECK_APP_SHELL" }, [channel.port2]);
}
export async function registerServiceWorker(
  application: Application,
): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    application.setServiceWorkerState("unsupported");
    application.setAppShellCacheState("failed");
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    const { controller } = navigator.serviceWorker;
    if (controller) {
      application.setServiceWorkerState("controlled");
      checkCachedShell(controller, application);
      return;
    }
    application.setServiceWorkerState(
      registration.active ? "waiting" : "registering",
    );
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        const nextController = navigator.serviceWorker.controller;
        if (nextController) {
          application.setServiceWorkerState("controlled");
          checkCachedShell(nextController, application);
        }
      },
      { once: true },
    );
  } catch {
    application.setServiceWorkerState("failed");
    application.setAppShellCacheState("failed");
  }
}
