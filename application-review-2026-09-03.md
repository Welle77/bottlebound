# Application Review — 2026-09-03

## Executive Summary

The BOTTLEBOUND Referee Console has strong runtime boundaries, input handling, persistence validation, and repository automation. The exhaustive static review found one high-severity CI credential-isolation issue, two medium-severity findings affecting replay determinism and CI supply-chain integrity, and two low-severity governance/offline-asset gaps. No critical finding was identified. No remediation was performed; findings require explicit user approval.

## Review Boundary

- Resolved root: `/Users/swb/projects/personal/bottlebound`
- Excluded sibling service: `/Users/swb/projects/personal/volley`; it was inspected only to identify it as a sibling service and was not audited.
- Mapped scope: one grouped deployable component, the Vite/Svelte BOTTLEBOUND Referee Console, including runtime source, tests, build and deployment configuration, CI, public assets, and relevant rules content.
- Exclusions: ignored, untracked, generated, dependency, build-output, cached, historical feature material, `.opencode` tooling, `.tmp`, and generated document assets by default. `.codebox` artifacts were used as review context and excluded from code findings unless directly relevant.
- Tracked-file rule: only files returned by `git ls-files` beneath the root were eligible evidence. The repository contained 267 tracked paths; the reviewers identified 146 eligible application files.
- Profile: repository source `/Users/swb/projects/personal/bottlebound/.codebox/application-profile.md`; feature override source absent. Effective profile: small private audience; asserted offline/repository-only exposure; asserted public non-sensitive data; asserted no application authentication boundary; asserted low operational criticality.
- Execution: static read-only inspection only. Builds, lint, tests, deployment, and runtime checks did not run; this report makes no runtime-evidence claims.

## Repository Scale

The repository contains 267 tracked paths, including 68 `src` paths, 54 test paths, and 2 build paths. It is a single deployable Vite/Svelte application with local IndexedDB persistence, a bundled rules-reference build boundary, and a GitHub Actions repository gate.

## Assessment

| Component / grouped scope               | Project Setup | Standards | Security          | Overall                                     |
| --------------------------------------- | ------------- | --------- | ----------------- | ------------------------------------------- |
| Vite/Svelte BOTTLEBOUND Referee Console | Adequate      | Mixed     | Needs improvement | Mixed; strong foundations with bounded gaps |

Dimension detail: setup is strong in reproducibility, configuration, and boundaries but adequate in command governance and deployability. Standards are mixed across maintainability, architecture, correctness, determinism, and conformance, with test construction mixed-to-strong. Runtime security, local data boundaries, and untrusted-input handling are strong; CI permissions and dependency supply-chain integrity need improvement.

## Positive Foundations

- Node and pnpm versions, frozen-lockfile installation, and browser provisioning are explicitly controlled.
- Build, lint, formatting, unit, browser, and dependency-graph checks are composed in repository automation.
- The application has clear domain, storage, UI, and rules-reference boundaries, with dependency-cruiser enforcement.
- Local persistence validates schemas, event sequence, configuration version, replay, and commits before restoration.
- Rules HTML is rejected, allowlisted, sanitized, and escaped before presentation; display names render as text.
- Clock and random-source adapters support deterministic core match operations.
- CI limits the GitHub token to `contents: read`, and no application API or telemetry boundary is present.

## Findings ordered by impact

### 1. High — CI checkout persists credentials for pull-request-controlled commands

- Axis: Security; CI credential isolation.
- Evidence: `/Users/swb/projects/personal/bottlebound/.github/workflows/repository-gate.yml:21-36` checks out pull-request code without `persist-credentials: false`, then runs PR-controlled install and check commands.
- Scenario: A malicious pull request changes a lifecycle script, test, or checked command and reads the persisted GitHub token from local Git configuration, then exfiltrates it.
- Impact: The token has `contents: read` access and may be disclosed or misused for repository/API access.
- Change: Set `persist-credentials: false` on checkout and verify that no local `http.*.extraheader` credential remains before executing PR-controlled commands.

### 2. Medium — Historical replay undercounts Powerful Ability action cost

- Axis: Standards; correctness and replay determinism.
- Evidence: `/Users/swb/projects/personal/bottlebound/src/domain/match-replay.ts:39-80,431-437`, `/Users/swb/projects/personal/bottlebound/src/domain/match-abilities.ts:137-151,742-750`, and `/Users/swb/projects/personal/bottlebound/src/domain/match-types.ts:626-651` show current Powerful Ability resolution costs two actions while historical `ActionResolved` replay increments by one and stores no action-cost field.
- Scenario: A historical Powerful Ability resolved with zero prior actions restores with `actionsUsed = 1`; a following action can pass validation although both actions should be exhausted.
- Impact: Restore, undo, and subsequent validation can disagree with the original match state and permit an illegal action.
- Change: Persist action cost in `ActionResolvedEvent` or resolve the historical configuration by version; replay the recorded cost and add a regression test for a following action.

### 3. Medium — GitHub Actions are identified by mutable major tags

- Axis: Security; CI supply-chain integrity.
- Evidence: `/Users/swb/projects/personal/bottlebound/.github/workflows/repository-gate.yml:21,23,27,40` uses `actions/checkout@v6`, `pnpm/action-setup@v4`, `actions/setup-node@v5`, and `actions/upload-artifact@v4`.
- Scenario: An upstream compromise or tag retarget changes action code executed by pull-request or main-branch jobs.
- Impact: The altered action can access source and the contents-read token, falsify checks, or alter uploaded artifacts.
- Change: Pin every action to a reviewed full commit SHA and automate reviewed dependency updates.

### 4. Low — Canonical check command is absent from the constitution inventory

- Axis: Project Setup; setup governance.
- Evidence: `/Users/swb/projects/personal/bottlebound/.codebox/constitution.md:6-8` omits `pnpm run check`, while `/Users/swb/projects/personal/bottlebound/.codebox/standards.md:35-37`, `/Users/swb/projects/personal/bottlebound/package.json:24`, and `/Users/swb/projects/personal/bottlebound/.github/workflows/repository-gate.yml:36` identify or execute it as the canonical gate.
- Scenario: A maintainer follows the constitution command inventory and does not discover the gate used by CI.
- Impact: Low operational friction and reduced confidence when reproducing the repository gate.
- Change: Add `pnpm run check` to the constitution inventory and retain a contract check that the constitution, package manifest, and CI agree.

### 5. Low — Effect-status icon assets are not included in the service-worker app shell

- Axis: Standards; offline architecture and correctness.
- Evidence: `/Users/swb/projects/personal/bottlebound/src/ui/effect-status.ts:1-5,57-75` imports emitted `?url` assets, while `/Users/swb/projects/personal/bottlebound/public/sw.js:1-14,31-60` precaches only the listed shell assets and sends misses to the network.
- Scenario: Offline, a Match with an active effect requests its icon; the icon is not precached and fails to load.
- Impact: Gameplay remains usable, but status presentation is incomplete and visual clarity is reduced.
- Change: Include emitted effect icons in the generated app-shell manifest or bundle them inline, then add an offline browser assertion.

## Quality Analysis

The strongest quality controls are strict typing, lint/format checks, dependency-direction checks, separated tests, deterministic clock/random adapters, and broad domain/storage/browser coverage. The review did not run those commands, so their current execution status was not independently verified. The main quality risks are the ambient IndexedDB probe outside the application seam, historical action-cost loss during replay, and the missing offline asset coverage.

## Target Architecture and Governance

The target state is a single explicitly composed Referee Console: all environmental dependencies, including storage readiness probing, enter through declared adapters; persisted events contain enough information for lossless replay; every essential UI asset is available offline; CI executes PR-controlled code without persisted credentials; action identities are immutable; and the constitution, package scripts, and CI expose one canonical gate.

## Improvement Plan

1. P0: Disable checkout credential persistence and add a post-checkout credential canary.
2. P1: Pin GitHub Actions to full commit SHAs and enforce the rule in repository checks.
3. P1: Make historical action replay cost-aware and add a Powerful Ability regression case.
4. P2: Inject the storage-probe dependency and cover ready, failed, and unavailable probes.
5. P2: Close the offline effect-icon app-shell manifest and test icon loading offline.
6. P3: Synchronize the constitution command inventory with `pnpm run check`.

## Suggested Success Measures

- The checkout step contains `persist-credentials: false`, and a canary finds no `http.*.extraheader` credentials.
- Every `uses:` reference in the workflow ends in a 40-character commit SHA, with a repository check rejecting mutable tags.
- Historical Powerful Ability replay consumes two actions, and a subsequent action is rejected; restore and replay agree on `actionsUsed`.
- Application dependencies include a storage-probe adapter, and application tests cover ready, failing, and unavailable probes without reading ambient IndexedDB.
- Every emitted effect icon is precached or inline, and an offline browser test verifies successful loading.
- `.codebox/constitution.md`, `package.json`, and CI identify the same `pnpm run check` gate.

## Overall Conclusion

The application is well-structured for a low-criticality, local-only referee tool, but the high-severity CI credential exposure should be addressed first. The medium replay and CI supply-chain findings deserve the next priority. This standalone review is complete and static-only. Findings authorize no edits or remediation until the user explicitly approves a follow-up change.
