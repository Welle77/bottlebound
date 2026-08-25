import { describe, expect, test } from "vitest";

import {
  createRulesUiState,
  retainRulesVersion,
} from "../../src/rules-reference/rules-ui-state";

describe("Rules UI page-lifetime state", () => {
  test("retains reading context for one Ruleset and resets it for a new version", () => {
    const retained = {
      ...createRulesUiState("BB20260822A1"),
      query: "backstab",
      selectedAnchor: "ability-rogue-backstab",
      scrollTop: 420,
      openerId: "rules-initiative",
    };

    expect(retainRulesVersion(retained, "BB20260822A1")).toBe(retained);
    expect(retainRulesVersion(retained, "BB20260822B1")).toEqual(
      createRulesUiState("BB20260822B1"),
    );
  });
});
