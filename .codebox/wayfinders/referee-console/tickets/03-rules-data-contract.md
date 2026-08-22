---
id: W03
type: task
status: closed
blocked_by: [W01]
claimed_by: active-wayfinder
---

# Define the fixed rules data contract

## Question

What structured data contract represents the fixed roster, abilities, triggers, durations, warnings, and objective effects without encoding physical judgments?

## Resolution

Use a versioned immutable Ruleset with stable team, character, attack, and
ability identifiers. Represent automation through closed target, manual-check,
operation, trigger, duration, and warning values. Keep full card text and source
anchors beside the structured fields. Never encode physical judgments or
arbitrary executable scripts in rules data.

The complete contract and current ability coverage are in
[fixed-rules-data-contract.md](../assets/fixed-rules-data-contract.md).
