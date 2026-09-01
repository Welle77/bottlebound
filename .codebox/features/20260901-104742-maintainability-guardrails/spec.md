---
slug: 20260901-104742-maintainability-guardrails
title: Maintainability guardrails
branch: feature/maintainability-guardrails
target_branch: main
current_phase: code
phases:
  planning: done
  code: done
  test: done
  review: blocked
  review: pending
  ship: pending
gate_policy:
  planning: auto
  code: auto
  test: auto
  review: auto
  ship: skip
model_routing:
  default: lightweight
  aliases:
    lightweight: [opencode/muse-spark-1.2-contributor-free, gpt-5.6-luna, copilot/gpt-5.6-luna]
    general: [gpt-5.6-terra]
    frontier: [gpt-5.6-sol, copilot/gpt-5.6-sol, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
---

## Problem Statement

The repository has strong local correctness checks, but agents can still make
maintenance harder without an immediate failure. They can create dependency
cycles, cross module seams, hide ambient time or randomness, grow long
procedures, leave dead code, and depend on inferred exported interfaces. The
canonical standards also claim that no executable checks exist even though the
constitution and package scripts define them. Local checks have no single
command or required remote pipeline.

The application layer compounds this problem. Application operations import
UI state and helpers, UI modules can patch a broad shared state object, and
storage, time, and randomness enter through ambient singletons. These shallow
interfaces make changes harder to test and make dependency direction difficult
to enforce.

## Solution

Add one enforceable maintenance policy across application code, tests, build
tooling, configuration, Svelte modules, and type-only dependencies. Make the
policy available through one local check command and one sequential GitHub
Actions pipeline.

Reshape the application layer as one deep module. A Svelte-backed application
factory accepts storage, time, and randomness adapters and exposes read-only
application state plus intent-specific operations. UI interaction state stays
in the UI module. Cross-module callers use declared module interfaces, and one
resolved dependency graph enforces direction and rejects cycles.

## User Stories

1. As a maintainer, I want one check command, so that local and remote policy cannot drift.
2. As a maintainer, I want the canonical standards to name the constitution as the command owner, so that agents read accurate instructions.
3. As a maintainer, I want unsupported Node versions to fail during installation, so that local and CI behavior use the same runtime semantics.
4. As a reviewer, I want explicit lint thresholds, so that I can read the policy without knowing tool defaults.
5. As a reviewer, I want exported functions to declare return types, so that module interfaces remain clear during implementation changes.
6. As a maintainer, I want exhaustive union handling, so that a new domain variant exposes every incomplete branch.
7. As a maintainer, I want unused symbols and incomplete control flow to fail checks, so that abandoned agent code cannot accumulate.
8. As a maintainer, I want optional properties to distinguish absence from an intentional empty value, so that command and persistence interfaces stay precise.
9. As a maintainer, I want dependency cycles and invalid module direction to fail, so that extractions cannot erode architecture.
10. As a maintainer, I want type-only dependencies included in architecture checks, so that implementation types cannot become hidden cross-module interfaces.
11. As a UI developer, I want UI interaction state separate from application state, so that local presentation changes do not expand the application interface.
12. As an application developer, I want intent-specific operations instead of a generic state patch, so that callers cannot change unrelated application fields.
13. As a tester, I want deterministic storage, time, and randomness adapters, so that application behavior can be tested without browser globals.
14. As a reviewer, I want callers to use declared module interfaces, so that implementation files can change without widespread caller edits.
15. As a repository owner, I want one blocking CI job with useful failure artifacts, so that failed checks cannot hide behind local agent behavior.

## Implementation Decisions

- The standards describe durable expectations and point to the constitution for executable commands. They do not duplicate command lists.
- The repository supports Node 26 and the exact declared pnpm 11.24.0 release. pnpm enforces the Node major during installation.
- One `check` command runs formatting, lint and dependency checks, unit tests, and browser tests. The existing browser server performs the TypeScript, Svelte, and production build.
- GitHub Actions uses one sequential job for pull requests and pushes to `main`. It cancels superseded branch runs, performs a frozen install, installs Chromium with system dependencies, runs the canonical check, uses no retries, and uploads Playwright evidence only after failure.
- ESLint keeps complexity at 20. It sets depth to 4, parameters to 3, lines to 800, statements to 40 for non-test maintained code, and statements to 70 for tests. It adds no function-length rule.
- Type-aware lint covers source, tests, build tooling, and all TypeScript configuration files. Svelte keeps its parser-specific configuration, and the service worker keeps core JavaScript checks.
- Exported TypeScript functions declare return types. Internal functions, callbacks, and Svelte component internals may use inference.
- TypeScript enables exact optional properties, unused local and parameter checks, implicit return checks, and switch fallthrough checks. ESLint enforces exhaustive switches.
- An inapplicable optional property is absent. An applicable concept with an intentional empty value uses `null`. Code does not assign `undefined` to optional properties.
- Dependency-cruiser is the sole dependency graph authority. It checks resolved imports across source, tests, build tooling, configuration, Svelte, and type-only imports. ESLint does not duplicate its direction rules.
- Dependency checks reject cycles, unresolved internal imports, production imports from tests, and invalid module direction. A temporary negative fixture must prove that the selected dependency-cruiser release catches a Svelte cycle before adoption.
- The allowed direction is composition root to UI to application to domain, with application to storage and storage to domain. UI can use the Rules Reference. Domain imports no outer module; storage imports neither application nor UI; application imports no UI; UI imports no storage.
- Cross-module callers use declared interfaces. Domain uses the Match interface, application uses one application interface, storage uses the Match Store interface, and Rules Reference callers use its declared interfaces. Module implementations may use internal sibling files.
- `createApplication` requires Match Store, clock, and random-source adapters. It creates no ambient production dependency. Production composition supplies real adapters, and tests supply deterministic adapters.
- The application implementation may use Svelte runes. No hypothetical framework-neutral subscription seam is added while only one UI adapter exists.
- Application state owns Match State, Match Events, loading, saving, storage validation, errors, network and service-worker readiness, and the latest Match Summary.
- UI state owns confirmations, End Game presentation, picker visibility, Action Draft progress, physical-confirmation preference, and Rules Reference modal interaction.
- The application exposes read-only state and intent-specific operations. No generic application-state patch crosses the module seam. The UI passes completed command inputs and never exposes its mutable draft to the application.
- The work proceeds in two green slices: repository guardrails first, then application architecture. Architecture direction becomes blocking only after backwards dependencies are removed.

## Acceptance Criteria

1. The canonical standards no longer claim that executable checks are absent and do not duplicate constitution commands.
2. Installation rejects unsupported Node majors and uses the exact declared pnpm release.
3. One canonical check command covers format, lint, dependency analysis, unit tests, browser tests, and the production build path.
4. One sequential GitHub Actions job runs the canonical check for pull requests and pushes to `main`, cancels superseded runs, and retains Playwright failure evidence without retries.
5. TypeScript and ESLint apply the agreed strict checks and explicit thresholds to every maintained TypeScript surface.
6. Existing source, test, build, and configuration code passes exact optional-property, unused-symbol, control-flow, exported-return-type, and exhaustive-switch checks.
7. Dependency analysis includes Svelte and type-only edges and rejects cycles, unresolved internal imports, production-to-test imports, and invalid module direction.
8. A deliberate temporary Svelte cycle fails dependency analysis before the project accepts the dependency tool; the fixture does not remain in the repository.
9. Production application behavior is available through one application interface created with explicit Match Store, clock, and random-source adapters.
10. Application operations no longer import UI state or UI helpers.
11. UI code cannot patch arbitrary application state and does not import storage directly.
12. Cross-module production imports use declared module interfaces rather than implementation files.
13. Focused application tests exercise successful transitions, persistence failures, loading and summary behavior, readiness transitions, deterministic time and randomness, and the absence of UI-only draft state from the application interface.
14. Existing gameplay, Match persistence, Rules Reference behavior, browser behavior, and service-worker behavior remain unchanged.
15. Every ticket finishes with its focused checks green, and both planned slices finish with the complete canonical check green.

## Testing Decisions

- Test the application through the highest seam: the application interface returned by the factory. Do not test private runes or implementation helpers.
- Use deterministic Match Store, clock, and random-source adapters in focused application tests. Cover both successful and failed persistence paths.
- Keep existing domain, storage contract, Svelte behavior, Playwright, service-worker, and Rules Reference tests as regression evidence.
- Test dependency policy with the real dependency-analysis command. Use one temporary Svelte cycle as negative evidence during implementation, then remove it.
- Run the focused repository suite during implementation tickets. The Codebox Test phase owns the complete canonical check and full suite.
- Treat unchanged game semantics and persisted data behavior as compatibility requirements, not as opportunities to rewrite tests.

## Out of Scope

- Lowering complexity below 20.
- Adding blanket immutable-data enforcement.
- Enabling property-access restrictions for index signatures.
- Adding a function-length rule or a 100-percent coverage requirement.
- Changing BOTTLEBOUND rules, Match semantics, Match Configuration values, persistence schema policy, or Rules Reference content.
- Supporting another UI framework or adding a framework-neutral state adapter.
- Configuring GitHub branch protection; the repository owner will do this after the workflow exists.
- Deployment, release, commit, push, or other Ship actions. This feature snapshots Ship as skipped.

## Further Notes

The repository owner plans to lower complexity in a later change. This feature
makes the current value explicit but does not preselect a future threshold.
