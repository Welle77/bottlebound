import "./styles.css";

import { mount } from "svelte";

import { cryptoRandomSource } from "./domain/match";
import { createIndexedDbMatchStore } from "./storage/match-store";
import App from "./ui/App.svelte";
import { createUiState } from "./ui/ui-state.svelte";
import { createApplication } from "./app/application";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("The Referee Console root element is missing.");

const matchStore = createIndexedDbMatchStore();
const application = createApplication({
  matchStore,
  clock: { now: (): string => new Date().toISOString() },
  randomSource: cryptoRandomSource,
});
const uiState = createUiState();

// The composition root owns concrete adapters; the UI receives only declared
// application and UI-state interfaces through the root component.
mount(App, { target: appRoot, props: { application, uiState } });
