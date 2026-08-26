/**
 * Reactive-read probe for the shell store.
 *
 * This module is compiled by the Svelte Vite plugin, so it may use runes.
 * It exposes one function that observes the shell snapshot the way a
 * component template does: through a reactive effect that re-runs whenever
 * the store replaces its snapshot.
 *
 * Scheduling notes (Svelte 5.56): Vitest runs modules through a
 * server-consumer pipeline, so `vitest.config.ts` forces client rune
 * compilation for `.svelte.ts` files; user effects queue their first run on
 * a microtask, so observers must `await tick()` from "svelte" after creating
 * the probe and after each snapshot replacement (`flushSync()` alone does
 * not cover the first queued run).
 */
import { tick } from "svelte";

import { state } from "../src/ui/shell-state.svelte";

export type ShellReadings = {
  readonly saving: boolean;
  readonly confirmation: string | null;
};

/**
 * Start observing the shell snapshot the way a component template does.
 * Callers must `await settle()` to let a queued observation run; every
 * snapshot replacement then appends the then-current reading.
 */
/* eslint-disable functional/immutable-data, functional/prefer-readonly-type --
   This probe is the single sanctioned mutability boundary of the store
   tests: it encapsulates an append-only collector and exposes it read-only. */
export function trackShellReadings() {
  const readings: ShellReadings[] = [];
  const stop = $effect.root(() => {
    $effect(() => {
      readings.push({
        saving: state.current.saving,
        confirmation: state.current.confirmation,
      });
    });
  });
  return { readings, stop } as const;
}

/** Deterministic flush helper so tests state their intent once. */
export async function settle(): Promise<void> {
  await tick();
}
