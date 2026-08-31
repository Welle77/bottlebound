import { describe, expect, test } from "vitest";

import {
  createRulesUiState,
  openRulesWithQuery,
} from "../../src/rules-reference/rules-ui-state";

describe("Rules UI page-lifetime state", () => {
  test("keeps reading context in page-lifetime UI state", () => {
    const retained = {
      ...createRulesUiState(),
      query: "backstab",
      selectedAnchor: "rules-heading-backstab",
      scrollTop: 420,
      openerId: "rules-initiative",
    };

    expect(retained).toEqual({
      open: false,
      query: "backstab",
      selectedAnchor: "rules-heading-backstab",
      scrollTop: 420,
      openerId: "rules-initiative",
    });
  });

  test("opens contextual Rules controls in search mode with the application query", () => {
    const retained = {
      ...createRulesUiState(),
      selectedAnchor: "rules-heading-initiative-game-clock",
      scrollTop: 420,
    };

    expect(openRulesWithQuery(retained, "Initiative")).toEqual({
      ...retained,
      open: true,
      query: "Initiative",
      selectedAnchor: null,
      scrollTop: 0,
    });
  });
});
