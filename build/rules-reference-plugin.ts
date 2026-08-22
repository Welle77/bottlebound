import { readFileSync } from "node:fs";

import type { Plugin } from "vite";

import { buildRulesReference } from "./rules-reference.ts";

const VIRTUAL_ID = "virtual:rules-reference";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const RULES_VERSION = "BB20260822A1";

const rulesSource = new URL("../bottlebound_rules_final.md", import.meta.url);

export function rulesReferencePlugin(): Plugin {
  return {
    name: "bottlebound-rules-reference",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const source = readFileSync(rulesSource, "utf8");
      const reference = buildRulesReference(source, RULES_VERSION);
      return `const deepFreeze = (value) => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
};
export const RULES_REFERENCE = deepFreeze(${JSON.stringify(reference)});`;
    },
  };
}
