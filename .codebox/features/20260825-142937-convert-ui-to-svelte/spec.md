---
slug: 20260825-142937-convert-ui-to-svelte
title: Convert the Referee Console UI to Svelte
branch: feature/convert-ui-to-svelte
target_branch: main
current_phase: done
phases:
  planning: done
  code: done
  test: done
  review: done
  ship: skipped
  test: pending
  review: pending
  ship: pending
gate_policy:
  planning: auto
  code: auto
  test: auto
  review: auto
  ship: skip
model_routing:
  default: frontier
  aliases:
    frontier: [opencode/x-preview-f-free, muse-spark-1.2-contributor-free, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
---

# Convert the Referee Console UI to Svelte

## Problem Statement

The Referee Console renders its entire interface by rebuilding one HTML
template string on every Match Event or shell change, then reattaching event
handlers by hand. As the Console grows, this hand-managed rendering makes every
UI change risk regressions elsewhere, and contributors must reason about the
whole DOM on every edit instead of one panel.

## Solution

Replace the hand-rolled vanilla-DOM render layer with Svelte 5 components on
the existing Vite pipeline. Each Console surface (shell header, system check,
match setup, active match, action draft, confirmation, undo, ended match,
rules modal) becomes a component that reacts to a runes-backed reactive shell
state. The domain and storage layers are untouched, so all Match rules,
persistence, and offline behavior keep working exactly as before. All existing
browser behavior stays verifiable through the unchanged Playwright suite.

## User Stories

1. As a referee, I want the Console to show my current Match exactly as before, so that converting the UI does not change how I referee.
2. As a referee, I want Match Events to update only the affected panels efficiently, so that the Console feels responsive during play.
3. As a referee, I want to draft attacks and abilities step by step as before, so that my physical refereeing flow is unchanged.
4. As a referee, I want physical confirmations, Overrides, and Reactions prompted exactly as before, so that rule enforcement keeps working.
5. As a referee, I want to start, undo, end, reopen, and remove Matches as before, so that Match lifecycle behavior is unchanged.
6. As a referee, I want Display Name editing and prior Match Summary display unchanged, so that my record keeping continues.
7. As a referee, I want the Rules reference modal and search unchanged, so that in-Match rule lookups stay fast.
8. As a referee, I want the Console to work offline after install, so that the service worker and app-shell cache behavior survives the conversion.
9. As a referee, I want the canonical-storage safety probe and its status display unchanged, so that I can trust persistence before play.
10. As a developer, I want each Console surface as an isolated Svelte component, so that I can change one panel without reasoning about the whole DOM.
11. As a developer, I want shell state exposed through a reactive runes store with wholesale immutable replacement, so that functional-style standards hold and components update automatically.
12. As a developer, I want `svelte-check` in the build and Svelte-aware ESLint, so that component errors are caught statically like TypeScript errors today.
13. As a developer, I want the existing Playwright specs to pass unchanged, so that the conversion proves behavioral parity rather than rewriting history.
14. As a developer, I want the legacy string-template renderer fully deleted at the end, so that there is one rendering path, not two.
15. As an operator, I want build and lint commands to keep working with the same entry points, so that CI and local workflows stay stable.

## Implementation Decisions

- **Plain Svelte 5** with `@sveltejs/vite-plugin-svelte` on the existing Vite setup. No SvelteKit; `index.html`, PWA wiring, and the service worker stay as-is.
- **Runes-based shell store**: the `ShellState` snapshot moves into a `$state`-backed module (`src/ui/shell-state.svelte.ts`). `patchShellState` keeps its wholesale-replacement semantics. The `Ref` class and manual full re-renders go away once all consumers convert.
- **Big-bang conversion** of the render layer on this branch, sliced into tracer-bullet tickets that each leave the Playwright suite green. No dual long-lived rendering systems.
- **Bootstrap migration**: `main.ts` mounts the root `App` component; storage probe, service-worker registration, online/offline listeners, and rules-modal focus handling move into component lifecycle where sensible.
- **Panel decomposition**: components mirror the current panel functions (shell header, system check, match setup, active match, action draft, confirmation, undo, ended match, prior summary, display names editor, ability picker, rules modal). Existing pure helpers (`format`, ability-draft logic) are reused, not rewritten.
- **Styling unchanged**: global `styles.css` and class names stay identical. Component-scoped styling is explicitly out of scope.
- **Domain and storage layers untouched**: `src/domain/**`, `src/storage/**`, `src/rules-reference` logic modules, and `immer` usage remain unchanged.
- **Tooling**: add `svelte-check` to the build chain and `eslint-plugin-svelte` to lint configuration.

## Testing Decisions

- A good test verifies external behavior through public seams with independent expected values; it must not depend on internal render mechanics.
- The primary seam is the **existing Playwright browser suite**: ~3,000 lines driving the real DOM. It is the fixed behavioral contract and must pass without modification except minimal selector adjustments where a spec reaches into internals.
- Domain, storage, readiness, console-settings, contract, and rules-audit Vitest suites are unaffected and must stay green.
- One small new seam is allowed: focused Vitest coverage for the runes shell-store's patch semantics (replace-wholesale, immutability), since it replaces the unit-tested `Ref` discipline.
- Prior art: existing `tests/browser/*.spec.ts` for behavior; existing Vitest unit style for the store test.

## Out of Scope

- Any change to BOTTLEBOUND rules data, Match domain logic, storage format, or persistence behavior.
- Component-scoped styles or visual redesign; `styles.css` stays byte-compatible in effect.
- SvelteKit, routing, SSR, or deployment changes.
- Rewriting Playwright specs beyond minimal selector adjustments.
- Accessibility improvements beyond preserving current roles and behavior.

## Further Notes

- The service worker hash/version may change because bundled assets change; verify offline restart behavior via the existing readiness and service-worker tests plus a browser smoke pass.
- `immer` stays: it is used by the domain layer (`match-random.ts`), which is untouched.
