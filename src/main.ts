import "./styles.css";

import { runStorageProbe } from "./app/actions";
import { registerServiceWorker } from "./app/service-worker";
import { render } from "./ui/render";
import { keepFocusInsideRules } from "./ui/rules-dialog";
import { state } from "./ui/shell-state";

window.addEventListener("online", () => {
  state.network = "online";
  render();
});
window.addEventListener("offline", () => {
  state.network = "offline";
  render();
});
document.addEventListener("keydown", keepFocusInsideRules);
render();
void runStorageProbe();
void registerServiceWorker();
