import type {
  ActionDraft,
  ActionDraftProgress,
  EndGamePresentation,
  PickerVisibility,
  RulesReferenceInteraction,
  UIState,
  UIStateStore,
  UiConfirmation,
} from "./ui-state";
import { loadRequirePhysicalConfirmations } from "./console-settings";

function initialState(): UIState {
  return {
    confirmation: null,
    endGamePresentation: { open: false, preview: null },
    pickerVisibility: { ability: false },
    actionDraft: null,
    actionDraftProgress: null,
    physicalConfirmationPreference: loadRequirePhysicalConfirmations(),
    rulesReferenceInteraction: {
      open: false,
      query: "",
      selectedAnchor: null,
      scrollTop: 0,
      openerId: null,
    },
  };
}

export function createUiState(): UIStateStore {
  let snapshot = initialState();
  const revision = $state({ value: 0 });

  function install(patch: Partial<UIState>): void {
    snapshot = { ...snapshot, ...patch };
    revision.value += 1;
  }

  function setEndGamePresentation(presentation: EndGamePresentation): void {
    install({ endGamePresentation: presentation });
  }

  function setPickerVisibility(visibility: PickerVisibility): void {
    install({ pickerVisibility: visibility });
  }

  function setActionDraftProgress(progress: ActionDraftProgress | null): void {
    const { actionDraft } = snapshot;
    install({
      actionDraftProgress: progress,
      ...(actionDraft && progress
        ? { actionDraft: { ...actionDraft, step: progress.step } }
        : {}),
    });
  }

  function setActionDraft(draft: ActionDraft | null): void {
    install({
      actionDraft: draft,
      actionDraftProgress: draft
        ? { kind: draft.kind, step: draft.step }
        : null,
    });
  }

  function setPhysicalConfirmationPreference(required: boolean): void {
    install({ physicalConfirmationPreference: required });
  }

  function setRulesReferenceInteraction(
    interaction: RulesReferenceInteraction,
  ): void {
    install({ rulesReferenceInteraction: interaction });
  }

  return {
    get state(): UIState {
      String(revision.value);
      return snapshot;
    },
    requestConfirmation(confirmation: Exclude<UiConfirmation, null>): void {
      install({ confirmation });
    },
    clearConfirmation(): void {
      install({ confirmation: null });
    },
    setEndGamePresentation,
    setPickerVisibility,
    setActionDraft,
    setActionDraftProgress,
    setPhysicalConfirmationPreference,
    setRulesReferenceInteraction,
  };
}
