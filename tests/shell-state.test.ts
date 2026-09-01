import { describe, expect, it } from "vitest";

import { createUiState } from "../src/ui/ui-state.svelte";

describe("UI state interface", () => {
  it("keeps application-owned Match state out of the interface", () => {
    const ui = createUiState();

    ui.requestConfirmation("end");
    ui.setPhysicalConfirmationPreference(false);

    expect(ui.state.confirmation).toBe("end");
    expect(ui.state.physicalConfirmationPreference).toBe(false);
    expect("match" in ui.state).toBe(false);
    expect("saving" in ui.state).toBe(false);
  });

  it("keeps Action Draft progress and End Game presentation in UI state", () => {
    const ui = createUiState();

    ui.setActionDraftProgress({ kind: "ability", step: "review" });
    ui.setEndGamePresentation({ open: true, preview: null });

    expect(ui.state.actionDraftProgress).toEqual({
      kind: "ability",
      step: "review",
    });
    expect(ui.state.endGamePresentation).toEqual({
      open: true,
      preview: null,
    });
  });
});
