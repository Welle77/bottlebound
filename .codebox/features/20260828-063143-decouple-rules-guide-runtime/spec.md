---
slug: 20260828-063143-decouple-rules-guide-runtime
title: Decouple rules guide from runtime
branch: feature/decouple-rules-guide-runtime
target_branch: main
current_phase: done
phases:
  planning: done
  code: done
  test: done
  review: done
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
    frontier: [gpt-5.6-luna, gpt-5.6-sol, copilot/gpt-5.6-sol, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
---

# Decouple rules guide from runtime

## Problem Statement

The Referee Console derives executable Match data from the Markdown Ruleset. The build parser expects fixed headings, positions, anchors, roster tables, and ability-card fields. An editorial Ruleset change can therefore stop the application build or change runtime inputs even when no gameplay behavior changed. The Ruleset must guide the application without serving as its implementation.

## Solution

Give the Referee Console an immutable, application-owned Match Configuration. It contains the values, labels, instructions, and operation declarations that Match behavior needs. Match domain modules execute that configuration without importing Ruleset content.

Keep the Rules Reference as a separate informational surface. It renders and searches the bundled Markdown as opaque content. It does not infer roster data, ability data, runtime operations, version identity, or stable anchors from document structure.

## User Stories

1. As a maintainer, I want to change a Ruleset heading level, number, order, or position without breaking the Referee Console.
2. As a maintainer, I want Match behavior to change only through an explicit application change.
3. As a maintainer, I want application-owned configuration to state every executable value and operation declaration in one clear boundary.
4. As a developer, I want Match domain code to depend on Match Configuration without importing guide-derived data.
5. As a referee, I want to read and search the bundled Ruleset without its document layout affecting Match behavior.
6. As a referee, I want contextual Rules links to search for the relevant application term without relying on a fixed guide anchor.
7. As a referee, I want roster, attack, ability, Reaction, effect, and End Game behavior to remain unchanged.
8. As a maintainer, I want persisted Matches to record the Match Configuration version instead of a Ruleset version.
9. As a maintainer, I want incompatible stored Matches to fail through the established single-schema error path without migration code.
10. As a future maintainer, I want the guide/configuration ownership boundary recorded so that structural guide parsing is not restored accidentally.
11. As a developer, I want every closed Match Configuration value represented by an explicit union, so that invalid semantic values fail at compile time.

## Implementation Decisions

- The Ruleset is the human-authored, authoritative guide. It guides product behavior but supplies no executable application data.
- The Rules Reference is the searchable presentation of the current bundled Ruleset. It has no association with Match State or Match Configuration versions.
- Match Configuration is immutable and application-owned. It contains roster values, attack values, ability values, Reaction values, labels, referee instructions, and operation declarations.
- Match Configuration contains data and declarations, not executable functions. Match domain modules retain execution logic.
- Every closed semantic set uses a centralized explicit union type. This includes identifiers, action and attack kinds, target policies, triggers, checks, and operation declarations. True free-form labels and referee instructions remain `string`.
- The application does not compare Match Configuration with the Ruleset. Ruleset changes require human interpretation and explicit application changes when behavior must change.
- The Rules Reference treats Markdown structure as generic content. It may use headings for navigation and search labels, but it does not require specific heading text, levels, numbers, positions, order, tables, anchors, roster entries, or card fields.
- The Rules Reference keeps the existing content-safety boundary when it renders Markdown.
- Contextual Rules controls open the Rules Reference with an application-owned search query. They do not store or resolve guide anchors.
- Runtime and persistence records remove guide-source anchors, including Action Resolution source anchors.
- Runtime symbols use `MATCH_CONFIGURATION` and a Match Configuration version. Persisted Match records, Match Events, canonical records, histories, and summaries use `configurationVersion` instead of `rulesVersion`.
- The persistence schema increments for the renamed version field and removed guide-anchor fields. The application rejects prior records through the existing incompatibility path. It adds no migration or compatibility layer.
- The change preserves all current gameplay semantics and referee-visible Match information.
- ADR 0002 records the ownership boundary and its trade-off.

## Testing Decisions

- Tests check behavior through public Match, persistence, and Rules Reference seams. They do not check private helpers or duplicate implementation logic.
- Match command tests prove that the application-owned Match Configuration preserves roster, attack, ability, Reaction, effect-duration, elimination, replay, and End Game behavior.
- Persistence contract tests prove that current records use `configurationVersion`, omit guide anchors, restore successfully, and reject the prior schema through the established incompatibility path.
- Rules Reference contract tests use Markdown fixtures with changed heading levels, numbering, order, and positions. Rendering and search remain usable for each fixture.
- Browser tests prove that contextual Rules controls open a search query and that the guide remains readable and searchable.
- Static dependency checks prove that Match Configuration and Match domain modules do not import the Rules Reference, its virtual module, or build parser.
- Compile-time probes prove that closed Match Configuration unions reject invented values without testing private implementation details.
- Existing focused and full repository checks remain the regression evidence for unchanged gameplay.

## Acceptance Criteria

1. Match Configuration is application-owned and contains every runtime roster, attack, ability, Reaction, label, instruction, and operation declaration needed by Match behavior.
2. Match domain, application, storage, and Match UI modules consume Match Configuration without importing guide-derived structured data.
3. No contract test compares Match Configuration values or behavior with the Ruleset.
4. The Rules Reference renders and searches bundled Markdown without fixed assumptions about heading text, level, number, position, order, roster tables, card fields, or generated anchors.
5. Changing only Ruleset heading levels, numbering, order, or positions does not stop the build, change Match Configuration, or change Match behavior.
6. Contextual Rules controls use application-owned search queries and no runtime or persistence record stores a guide source anchor.
7. Runtime symbols use `MATCH_CONFIGURATION`; persisted Match records and summaries use `configurationVersion` instead of `rulesVersion`.
8. The persistence schema rejects prior records through the existing incompatibility path and contains no migration or compatibility branch.
9. Current roster, initiative, attack, ability, Reaction, effect, elimination, replay, undo, and End Game behavior remains unchanged.
10. Build, lint, format, focused tests, and the full configured test suite pass.
11. Every closed Match Configuration field uses a centralized explicit union type, and no helper widens those values to bare `string` when it branches on them.

## Out of Scope

- Changes to BOTTLEBOUND gameplay, roster values, ability semantics, or the Ruleset text.
- Automated guide-to-configuration drift detection.
- Persistence migration or support for prior Match schemas.
- A visual redesign of the Rules Reference or Match controls.
- External Ruleset loading, multiple bundled guides, or historical guide lookup.
- Moving executable Match logic into configuration functions or a rule engine.

## Further Notes

- The implementation baseline is commit `01168bb1603af64c5eaf29ffc4ec13e2dbc31a66` on `main`.
- The existing no-migration persistence decision remains in force.
