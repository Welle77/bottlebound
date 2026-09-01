import { getContext, setContext } from "svelte";

import type { Application } from "../app/application";
import type { UIStateStore } from "./ui-state";

const CONSOLE_CONTEXT = Symbol("bottlebound-console");

export type ConsoleContext = {
  readonly application: Application;
  readonly uiState: UIStateStore;
};

export function provideConsoleContext(context: ConsoleContext): void {
  setContext(CONSOLE_CONTEXT, context);
}

export function useConsoleContext(): ConsoleContext {
  return getContext<ConsoleContext>(CONSOLE_CONTEXT);
}
