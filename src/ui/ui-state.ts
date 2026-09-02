import type {
  AbilityId,
  CharacterId,
  EndGamePreview,
  PhysicalAttackCheck,
  ProtectiveReactionInput,
} from "../domain/match";

export type ActionDraft = {
  readonly kind: "basic" | "ability";
  readonly sourceCharacterId: CharacterId;
  readonly configurationVersion: string;
  readonly abilityId: AbilityId | null;
  readonly targets: readonly CharacterId[];
  readonly step: "select-target" | "reactions" | "contacts" | "review";
  readonly attackLegs: readonly (readonly CharacterId[])[];
  readonly physicalConfirmations: Readonly<
    Record<PhysicalAttackCheck, boolean>
  >;
  readonly reactions: readonly (ProtectiveReactionInput & {
    readonly override: string | null;
  })[];
  readonly abilityOverride: boolean;
  readonly overrideRequired: string | null;
  readonly majorActionOverride: boolean;
};

export function draftAffectedCharacterIds(
  draft: ActionDraft,
): readonly CharacterId[] {
  return draft.attackLegs.flatMap((leg) => leg);
}

export type UiConfirmation =
  | "reroll"
  | "discard"
  | "undo"
  | "end"
  | "remove"
  | "remove-summary"
  | "start-new"
  | null;

export type EndGamePresentation = {
  readonly open: boolean;
  readonly preview: EndGamePreview | null;
};

export type PickerVisibility = {
  readonly ability: boolean;
};

export type ActionDraftProgress = {
  readonly kind: "basic" | "ability";
  readonly step: "select-target" | "reactions" | "contacts" | "review";
};

export function createPhysicalConfirmations(
  requireManualChecks: boolean,
): Readonly<Record<PhysicalAttackCheck, boolean>> {
  return requireManualChecks
    ? {
        range: false,
        "line-of-sight": false,
        "legal-bottle-contact": false,
        "terrain-contact": false,
      }
    : {
        range: true,
        "line-of-sight": true,
        "legal-bottle-contact": true,
        "terrain-contact": true,
      };
}

export type RulesReferenceInteraction = {
  readonly open: boolean;
  readonly query: string;
  readonly selectedAnchor: string | null;
  readonly scrollTop: number;
  readonly openerId: string | null;
};

export type UIState = {
  readonly confirmation: UiConfirmation;
  readonly endGamePresentation: EndGamePresentation;
  readonly pickerVisibility: PickerVisibility;
  readonly actionDraft: ActionDraft | null;
  readonly actionDraftProgress: ActionDraftProgress | null;
  readonly physicalConfirmationPreference: boolean;
  readonly rulesReferenceInteraction: RulesReferenceInteraction;
};

export type UIStateAccess = {
  readonly state: UIState;
};

export type UIStateOperations = {
  readonly requestConfirmation: (
    confirmation: Exclude<UiConfirmation, null>,
  ) => void;
  readonly clearConfirmation: () => void;
  readonly setEndGamePresentation: (presentation: EndGamePresentation) => void;
  readonly setPickerVisibility: (visibility: PickerVisibility) => void;
  readonly setActionDraft: (draft: ActionDraft | null) => void;
  readonly setActionDraftProgress: (
    progress: ActionDraftProgress | null,
  ) => void;
  readonly setPhysicalConfirmationPreference: (required: boolean) => void;
  readonly setRulesReferenceInteraction: (
    interaction: RulesReferenceInteraction,
  ) => void;
};

export type UIStateStore = UIStateAccess & UIStateOperations;
