# Tickets

Approved tracer-bullet implementation tickets for converting the Referee
Console UI to Svelte 5. Every ticket must leave the existing Playwright browser
suite green (minimal selector adjustments allowed only where a spec reaches
into internals). Domain (`src/domain/**`) and storage (`src/storage/**`)
layers are untouched by every ticket.

---

## T01: Wire the Svelte 5 toolchain

**What to build:** The repository builds and lints `.svelte` files with zero
behavior change: add `svelte` and `@sveltejs/vite-plugin-svelte`, wire the Vite
plugin, add `svelte-check` to the build chain, and add `eslint-plugin-svelte`
to the lint configuration. The app still runs exactly as before through the
legacy renderer.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `pnpm run build` passes including a `svelte-check` step over a trivial placeholder component
- [ ] `pnpm run lint` passes with Svelte-aware ESLint rules active
- [ ] Existing Vitest suites stay green
- [ ] No runtime behavior change; legacy renderer untouched

## T02: Mount a root Svelte app

**What to build:** `main.ts` mounts a root `App.svelte` component. Application
bootstrap (canonical-storage probe start, service-worker registration,
online/offline listeners) moves into component lifecycle. The legacy renderer's
output initially renders inside the component so the whole Console works
unchanged under the Svelte mount.

**Blocked by:** T01.

**Status:** ready-for-agent

- [ ] Console boots identically under the Svelte root component
- [ ] Offline restart behavior preserved (service worker still registers)
- [ ] Full Playwright browser suite passes unchanged

## T03: Runes shell store behind the existing API

**What to build:** `ShellState` becomes reactive state in a `$state`-backed
Svelte module. `patchShellState` keeps its wholesale immutable-replacement
semantics. The existing `Ref` becomes a thin delegate over the new store so
unconverted consumers compile and behave identically. Add focused Vitest
coverage for patch semantics (wholesale replacement, no in-place mutation).

**Blocked by:** T02.

**Status:** ready-for-agent

- [ ] Components can read shell state reactively from the new store
- [ ] `patchShellState` replaces the snapshot wholesale; store test proves immutability
- [ ] All existing suites pass with no behavior change

## T04: Convert static shell surfaces

**What to build:** The hero header and system check panel become reactive
Svelte components reading the runes store; their string-template code is
deleted from the legacy renderer. Global class names and `styles.css` are
unchanged.

**Blocked by:** T03.

**Status:** ready-for-agent

- [ ] Header and system-check panels render as components with identical markup/classes
- [ ] Corresponding legacy template code removed
- [ ] Playwright browser suite passes (shell and readiness specs)

## T05: Convert match setup surfaces

**What to build:** The match setup form, roster rows, Display Names editor,
and prior Match Summary card become components; their legacy template code is
deleted.

**Blocked by:** T04.

**Status:** ready-for-agent

- [ ] Setup, Display Names, and prior Summary behave identically per browser specs
- [ ] Corresponding legacy template code removed
- [ ] Playwright browser suite passes

## T06: Convert the active match board

**What to build:** The initiative order, character status, turn/round controls,
and undo state panel become components; their legacy template code is deleted.
Match Event updates re-render only affected components via the runes store.

**Blocked by:** T05.

**Status:** ready-for-agent

- [ ] Active-match board behaves identically per browser specs (active-match, undo)
- [ ] Corresponding legacy template code removed
- [ ] Playwright browser suite passes

## T07: Convert the Action Draft flow

**What to build:** The full Action Draft flow becomes components: draft steps
(select-target, reactions, contacts, review), ability picker, Reactions,
physical confirmations, and Override prompts. Existing pure helpers
(`ability-draft.ts`, `format.ts`) are reused unchanged.

**Blocked by:** T06.

**Status:** ready-for-agent

- [ ] Action Draft and ability flows behave identically per browser specs (action-draft, ability-draft)
- [ ] Corresponding legacy template code removed
- [ ] Playwright browser suite passes

## T08: Convert confirmation and ended-match surfaces

**What to build:** Confirmation dialogs, the End Game preview, and the Ended
Match panel become components; their legacy template code is deleted.

**Blocked by:** T07.

**Status:** ready-for-agent

- [ ] End Game, reopen/remove confirmations behave identically per browser specs (manual-end-game, elimination-workflow)
- [ ] Corresponding legacy template code removed
- [ ] Playwright browser suite passes

## T09: Convert the Rules reference modal

**What to build:** The Rules modal, its search UI, and the focus-trap key
handling become components driven by the reactive rules UI state; their legacy
template code is deleted.

**Blocked by:** T08.

**Status:** ready-for-agent

- [ ] Rules open/search/close and focus containment behave identically per browser specs (rules-reference)
- [ ] Corresponding legacy template code removed
- [ ] Playwright browser suite passes

## T10: Remove the legacy renderer

**What to build:** Delete `render.ts`, `match-panels.ts`, the `Ref` class, and
all remaining shims so exactly one rendering path remains. Verify the complete
suite and that no dead exports linger.

**Blocked by:** T09.

**Status:** ready-for-agent

- [ ] Legacy renderer files and shims fully deleted; no references remain
- [ ] `pnpm run build`, `pnpm run lint`, `pnpm run test:focused`, and full `pnpm run test` pass
- [ ] Manual smoke: offline reload shows the Console correctly
