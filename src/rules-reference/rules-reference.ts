import { RULES_REFERENCE } from "virtual:rules-reference";

import type { RulesReference } from "./types";

export type RulesSurfaceResolution = {
  readonly status: "available";
  readonly reference: RulesReference;
};

export function resolveRulesSurface(): RulesSurfaceResolution {
  return { status: "available", reference: RULES_REFERENCE };
}
