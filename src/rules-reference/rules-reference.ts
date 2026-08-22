import { RULES_REFERENCE } from "virtual:rules-reference";

import type { RulesReference } from "./types";

const references = new Map<string, RulesReference>([
  [RULES_REFERENCE.version, RULES_REFERENCE],
]);

export type RulesSurfaceResolution =
  | { readonly status: "available"; readonly reference: RulesReference }
  | {
      readonly status: "unavailable";
      readonly version: string;
      readonly message: string;
    };

export function resolveRulesReference(version: string): RulesReference | null {
  return references.get(version) ?? null;
}

export function resolveRulesSurface(version: string): RulesSurfaceResolution {
  const reference = resolveRulesReference(version);
  if (reference) return { status: "available", reference };
  return {
    status: "unavailable",
    version,
    message: `This Match uses Ruleset ${version}, but matching rules content is not bundled. The console will not substitute another version.`,
  };
}
