# Approved tickets — Maintainability guardrails

The feature uses an expand–migrate–contract sequence. Every ticket finishes
green. Codebox may dispatch tickets together only inside the two approved
Parallel groups below.

## Approved Parallel groups

- **Parallel group A:** T02 and T03 may start together after T01 completes.
  T01 owns package and lockfile changes. T02 owns TypeScript, ESLint, and
  resulting code fixes. T03 owns dependency-cruiser configuration and its
  negative proof.
- **Parallel group B:** T05 and T06 may start together after T04 completes.
  T04 freezes the application and UI state interfaces plus compatibility
  paths. T05 owns lifecycle and infrastructure callers. T06 owns Active Match
  and Action Draft callers.
- No other tickets may run in parallel.

## T01: Establish the canonical repository gate

**What to build:** Give maintainers and agents one reproducible local and
remote check path with accurate repository instructions and an enforced
runtime.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] The standards point to the constitution for executable commands and no longer claim that tooling is absent.
- [x] The repository enforces Node 26 during installation and retains exact pnpm 11.24.0 selection.
- [x] Dependency-cruiser is installed through the repository package manager, with package and lockfile changes owned by this ticket.
- [x] One canonical check command runs formatting, lint, unit tests, and browser tests; the browser server supplies the existing build path.
- [x] One sequential GitHub Actions job runs the canonical check for pull requests and pushes to `main` after a frozen install and Chromium setup.
- [x] CI cancels superseded branch runs, uses no test retries, and uploads Playwright evidence only after failure.
- [x] Existing build, lint, format, focused-test, and full-suite commands remain available for Codebox phases.
- [x] The canonical check is deferred until T02/T03 complete the strict lint and dependency configuration; T01's focused checks passed.

## T02: Enforce explicit TypeScript and ESLint contracts

**What to build:** Make every maintained TypeScript surface reject ambiguous
optional properties, abandoned code, incomplete control flow, unclear exported
interfaces, and excessive local structure.

**Blocked by:** T01.

**Parallel group:** A.

**Status:** done

- [x] Type-aware checks cover source, tests, build tooling, and every TypeScript configuration file.
- [x] TypeScript enforces exact optional properties, unused locals and parameters, implicit returns, and switch fallthrough.
- [x] Inapplicable optional properties are omitted; applicable empty values use `null`; code does not assign `undefined` to optional properties.
- [x] Exported TypeScript functions declare return types while internal functions, callbacks, and Svelte component internals retain inference.
- [x] ESLint enforces exhaustive switches, complexity 20, depth 4, parameters 3, lines 800, statements 40 outside tests, and statements 70 in tests.
- [x] No function-length, blanket immutable-data, index-signature property-access, or lower-complexity rule enters this ticket.
- [x] All exposed violations are fixed without changing gameplay, persistence, Rules Reference, browser, or service-worker behavior.
- [x] TypeScript, ESLint, formatting, and focused tests pass; canonical check awaits T03 dependency configuration.

## T03: Reject dependency cycles and unresolved edges

**What to build:** Add one resolved dependency graph that rejects cycles and
invalid dependency edges across all maintained code, including Svelte and
type-only imports.

**Blocked by:** T01.

**Parallel group:** A.

**Status:** done

- [x] Dependency-cruiser analyzes source, tests, build tooling, configuration, Svelte, and type-only dependencies through the repository TypeScript configuration.
- [x] The graph rejects circular dependencies, unresolved internal imports, and production or build imports from tests.
- [x] Every currently valid module-direction rule becomes blocking without a baseline or allowlist.
- [x] A temporary deliberate Svelte cycle makes the selected dependency-cruiser release fail before the repository adopts it.
- [x] The temporary negative fixture is removed before completion, and the real dependency graph passes.
- [x] ESLint does not duplicate resolved graph rules.
- [x] Dependency analysis is part of lint and therefore part of the canonical check.
- [x] Focused dependency checks, lint, formatting, and the canonical check pass.

## T04: Expand the testable application interface

**What to build:** Add one deep application module with deterministic
dependencies and stable application and UI-state interfaces beside the current
paths, without changing assembled Referee Console behavior.

**Blocked by:** T02 and T03.

**Status:** done

- [x] An application factory requires Match Store, clock, and random-source adapters and creates no ambient production dependency.
- [x] The factory returns read-only application state and intent-specific operations through one declared application interface.
- [x] The Svelte-backed implementation returns raw structured-clone-safe domain values and does not expose deep reactive proxies.
- [x] Application state covers Match, Match Events, loading, saving, validation, errors, readiness, and the latest Match Summary.
- [x] A declared UI-state interface covers confirmations, End Game presentation, picker visibility, Action Draft progress, physical-confirmation preference, and Rules Reference interaction.
- [x] Temporary compatibility paths keep every existing caller and test green while later migration tickets use the new interfaces.
- [x] Deterministic tests through the application interface cover successful transitions, persistence failures, loading, summaries, readiness, time, randomness, and the absence of UI-only drafts.
- [x] Focused application, storage, readiness, type, lint, and format checks pass; canonical check is deferred until T05/T06.

## T05: Migrate lifecycle and infrastructure flows

**What to build:** Move Referee Console startup, readiness, storage, setup, and
summary workflows to the application interface without changing their visible
or persisted behavior.

**Blocked by:** T04.

**Parallel group:** B.

**Status:** done

- [x] Loading, storage probing, Match creation and setup, Display Names, summaries, network state, and service-worker readiness use the application interface.
- [x] These callers read application state and invoke intent-specific operations instead of patching application fields.
- [x] Service-worker and readiness behavior use injected application dependencies and import no UI implementation.
- [x] UI-only lifecycle interaction remains in the declared UI state.
- [x] The ticket changes no Active Match, attack, ability, Action Draft, confirmation, or Undo caller owned by T06.
- [x] Existing setup, storage, summary, readiness, service-worker, and browser behavior remains unchanged.
- [x] Focused lifecycle, storage, readiness, browser, type, lint, format, and build checks pass; canonical check is deferred until T07.

## T06: Migrate Active Match and Action Draft flows

**What to build:** Move active play and temporary referee interactions to the
new application and UI interfaces without changing Match rules or command
results.

**Blocked by:** T04.

**Parallel group:** B.

**Status:** done

- [x] Active Match, Move, Basic Attack, Ability, End Game, confirmation, Undo, and reopen callers use intent-specific application operations.
- [x] Completed command inputs cross the application seam, while mutable Action Draft progress remains UI-owned.
- [x] Ability-input conversion is application-owned and imports no UI implementation type or helper.
- [x] Dialogs, picker state, draft steps, physical-confirmation preference, and Rules Reference interaction use the UI-state interface.
- [x] These callers cannot patch Match, persistence, readiness, error, or summary fields directly.
- [x] The ticket changes no lifecycle, setup, storage, network, service-worker, or summary caller owned by T05.
- [x] Existing domain, Action Draft, End Game, Undo, persistence, and browser behavior remains unchanged.
- [x] Focused domain, application, Action Draft, browser, type, lint, format, and build checks pass; canonical check is deferred until T07.

## T07: Contract legacy paths and enforce final direction

**What to build:** Remove compatibility paths after every caller uses the new
interfaces, then make the agreed dependency direction a blocking repository
property.

**Blocked by:** T05 and T06.

**Status:** done

- [x] Legacy singleton operations, broad shell-state compatibility, generic application-state patching, and obsolete UI-to-application conversion paths are removed.
- [x] Cross-module callers use only the declared Match, application, Match Store, and Rules Reference interfaces.
- [x] Dependency rules enforce composition to UI to application to domain, application to storage, storage to domain, and UI to Rules Reference.
- [x] Domain imports no outer module; storage imports neither application nor UI; application imports no UI; UI imports no storage.
- [x] Type-only imports obey the same direction rules, and no exception baseline or allowlist remains.
- [x] Application-interface tests and existing domain, storage, Svelte, Rules Reference, service-worker, and browser tests pass after compatibility removal.
- [x] Dependency analysis, TypeScript, ESLint, formatting, and focused tests pass; complete canonical check is owned by final Test.

## T08: Lower complexity threshold and clear all lint violations

**What to build:** Set the repository-wide maximum cyclomatic complexity to 10,
including Svelte files, and refactor every currently reported violation without
changing runtime behavior.

**Blocked by:** T07.

**Status:** in progress

- [ ] TypeScript and Svelte ESLint configurations both enforce complexity 10.
- [ ] `pnpm run lint` passes with zero errors and zero warnings.
- [ ] Focused regression tests, formatting, and TypeScript checks pass after the
  behavior-preserving refactors.
