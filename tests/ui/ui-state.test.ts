import { describe, expect, it } from "vitest";

import { createUiState } from "../../src/ui/ui-state.svelte";

describe("UI state interface", () => {
  it("keeps presentation and draft interaction state outside application state", () => {
    const ui = createUiState();

    ui.requestConfirmation("end");
    ui.setEndGamePresentation({ open: true, preview: null });
    ui.setPickerVisibility({ ability: true });
    ui.setActionDraftProgress({ kind: "ability", step: "review" });
    ui.setPhysicalConfirmationPreference(false);
    ui.setRulesReferenceInteraction({
      open: true,
      query: "initiative",
      selectedAnchor: "initiative",
      scrollTop: 12,
      openerId: "rules-button",
    });

    expect(ui.state).toEqual({
      confirmation: "end",
      endGamePresentation: { open: true, preview: null },
      pickerVisibility: { ability: true },
      actionDraft: null,
      actionDraftProgress: { kind: "ability", step: "review" },
      physicalConfirmationPreference: false,
      rulesReferenceInteraction: {
        open: true,
        query: "initiative",
        selectedAnchor: "initiative",
        scrollTop: 12,
        openerId: "rules-button",
      },
    });
  });
});
