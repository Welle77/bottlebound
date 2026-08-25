import { render } from "../ui/render";
import { patchShellState } from "../ui/shell-state";

export function checkCachedShell(worker: ServiceWorker): void {
  const channel = new MessageChannel();
  const timeout = window.setTimeout(() => {
    patchShellState({ appShellCache: "failed" });
    render();
  }, 3_000);
  channel.port1.addEventListener(
    "message",
    (
      event: MessageEvent<{ readonly type?: string; readonly ready?: boolean }>,
    ) => {
      window.clearTimeout(timeout);
      patchShellState({
        appShellCache:
          event.data.type === "APP_SHELL_STATUS" && event.data.ready
            ? "ready"
            : "failed",
      });
      render();
    },
    { once: true },
  );
  channel.port1.start();
  worker.postMessage({ type: "CHECK_APP_SHELL" }, [channel.port2]);
}
export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    patchShellState({ serviceWorker: "unsupported" });
    patchShellState({ appShellCache: "failed" });
    render();
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      patchShellState({ serviceWorker: "controlled" });
      checkCachedShell(controller);
      render();
      return;
    }
    patchShellState({
      serviceWorker: registration.active ? "waiting" : "registering",
    });
    render();
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        const nextController = navigator.serviceWorker.controller;
        if (nextController) {
          patchShellState({ serviceWorker: "controlled" });
          checkCachedShell(nextController);
          render();
        }
      },
      { once: true },
    );
  } catch {
    patchShellState({ serviceWorker: "failed" });
    patchShellState({ appShellCache: "failed" });
    render();
  }
}
