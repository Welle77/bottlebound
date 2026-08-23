# Codebox Constitution

Committed pipeline configuration. Coding and content rules live in the adjacent
`.codebox/standards.md`.

## Commands

- Build: `pnpm run build`
- Lint: `pnpm run lint`
- Format: `pnpm run format:check`
- Focused test: `pnpm run test:focused`
- Full suite: `pnpm run test`

## Contract surfaces

- BOTTLEBOUND rules, roster, ability cards, and referee quick reference — `bottlebound_rules_final.md` — validate/regenerate with `none found`; inspect Markdown structure and internal rules consistency

## Review

- Default target branch: `main`
- Blocking severities: `critical`, `high`

## Gate policy

```yaml
planning: auto
code: auto
test: auto
review: auto
ship: skip
```

## Model routing

Required for Codebox. Model identifiers are runtime-specific. Agent entries
override phase entries, and unavailable overrides fall through to the
configured default. `default` is required. Aliases classify model candidates,
not reasoning effort. The active Codebox orchestrator is stricter: Planning
must route to `frontier`, the normalized active model identifier must match a
candidate in that alias, and no default fallback applies. Normalization trims
outer whitespace, case-folds, and replaces runs of spaces or `.`, `_`, `-`,
and `:` with one `-`. Provider-qualified runtime identifiers match an
unqualified candidate when their normalized final path segment equals the
complete normalized candidate. Explicitly provider-qualified candidates and
model suffixes still require a complete match.

```yaml
default: frontier
aliases:
  lightweight: [gpt-5.6-luna, claude-haiku-4.5]
  general: [gpt-5.6-terra, claude-sonnet-5]
  frontier: [opencode/x-preview-f-free, muse-spark-1.2-contributor-free, opencode/muse-spark-1.2-contributor-free]
phases:
  planning: frontier
```

## Ship workflow

Ship resolves the current repository-owned workflow from
`.codebox/ship/workflow.md`. The workflow's explicit ordered Markdown links
select its step files beneath `.codebox/ship/steps/`. Configure delivery
procedures in those files; do not configure built-in targets, provider recipes,
or template fallbacks here.

No repository-owned Ship workflow is currently configured.
