---
slug: 20260903-074016-application-review-remediation
title: Application review remediation
branch: main
target_branch: main
current_phase: code
phases:
  planning: done
  code: done
  test: running
  review: pending
  ship: skipped
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
  agents:
    codebox-implementer: lightweight
    codebox-tester: general
    codebox-review-standards: frontier
    codebox-review-spec: general
    codebox-review-security: frontier
---

## Problem Statement

The application review identified five issues in the BOTTLEBOUND Referee Console: pull-request CI can expose persisted checkout credentials; CI actions use mutable tags; historical replay can undercount Powerful Ability action cost; the storage readiness probe bypasses the application dependency seam; effect-status icons are not guaranteed offline; and the canonical check command is missing from the constitution inventory.

## Solution

Harden pull-request CI, make historical Action Resolution replay lossless, inject the validated-storage probe, close the offline icon asset path, and synchronize command governance. Preserve the repository's single-schema persistence decision: update the current schema and reject old incompatible data through the existing incompatibility path, without migrations.

## User Stories

1. As a maintainer, I want pull-request jobs to run without persisted checkout credentials, so untrusted changes cannot read the repository token from Git configuration.
2. As a maintainer, I want CI actions pinned to reviewed immutable identities, so upstream tag movement cannot silently change the gate.
3. As a referee, I want restored Matches to preserve the exact action cost of historical Action Resolutions, so Powerful Abilities cannot create an illegal follow-up action.
4. As a tester, I want storage readiness probing to use an injected dependency, so application startup is deterministic in hosts with different IndexedDB availability.
5. As a referee, I want effect-status icons to load while offline, so active effects remain visually clear during a Match.
6. As a maintainer, I want the constitution to name the same canonical gate as CI, so repository verification is discoverable and reproducible.

## Acceptance Criteria

- Pull-request checkout disables credential persistence and a verification step confirms no credential extraheader remains.
- Every GitHub Action reference is pinned to a full reviewed commit SHA, and repository checks reject mutable action tags.
- `ActionResolvedEvent` records or deterministically resolves the exact action cost; historical Powerful Ability replay consumes two actions and rejects a subsequent action.
- Application dependencies explicitly provide the storage probe; application tests cover ready, failed, and unavailable probes without ambient IndexedDB access in the application module.
- Every effect-status icon needed by the active Match is precached or bundled locally, and an offline browser test confirms successful loading.
- `.codebox/constitution.md`, `package.json`, and CI identify `pnpm run check` as the canonical gate.
- Existing domain, storage, application, browser, and Rules Reference behavior remains green under the current schema.

## Implementation Decisions

- Keep the work on the current `main` workspace as explicitly requested.
- Treat the persisted event change as a current-schema breaking change, consistent with ADR 0001; do not add migration or compatibility branches.
- Prefer an explicit action-cost field on the canonical event when that is the smallest lossless contract; update schemas, validators, fixtures, replay, undo, and store checks together.
- Keep the storage probe as an adapter at the application seam and retain its production IndexedDB implementation in composition.
- Generate the offline app-shell asset list from the build output or use local inline assets; do not hand-maintain an incomplete emitted-filename list.
- Test through public application/domain/store/browser seams with independent expected outcomes.

## Testing Decisions

- Add focused public-interface tests before implementation for replay action cost and application storage-probe injection.
- Add CI/configuration contract assertions for credential persistence, immutable action references, and the canonical gate.
- Add an offline browser assertion for rendered effect icons.
- Run focused tests after each slice, then `pnpm run check` as the full configured gate.

## Out of Scope

- Migrating saved Matches from previous schema or configuration versions.
- Changing gameplay rules, base action economy, ability semantics, or physical referee judgments.
- Adding authentication, network APIs, telemetry, or deployment jobs.
- Committing generated build output.

## Further Notes

The originating evidence is `/Users/swb/projects/personal/bottlebound/application-review-2026-09-03.md`. Remediation was explicitly approved by the user on 2026-09-03.
