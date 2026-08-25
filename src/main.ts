import "./styles.css";

import { runStorageProbe } from "./app/actions";
import { registerServiceWorker } from "./app/service-worker";
import { render } from "./ui/render";
import { keepFocusInsideRules } from "./ui/rules-dialog";
import { patchShellState } from "./ui/shell-state";

window.addEventListener("online", () => {
  patchShellState({ network: "online" });
  render();
});
window.addEventListener("offline", () => {
  patchShellState({ network: "offline" });
  render();
});
document.addEventListener("keydown", keepFocusInsideRules);
render();
void runStorageProbe();
void registerServiceWorker();
