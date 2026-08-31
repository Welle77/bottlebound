import {
  acknowledgeElimination,
  assignDisplayNames,
  CHARACTER_IDS,
  createSetup,
  cryptoRandomSource,
  endMatch,
  finishTurn,
  generateInitiative,
  isCharacterId,
  normalizeDisplayNames,
  rerollInitiative,
  reopenMatch,
  resolveAbility,
  resolveBasicAttack,
  ruleSimultaneousElimination,
  startMatch,
  undoLastEvent,
  type CommandResult,
  type AbilityId,
  type CharacterId,
  type MatchState,
  type RandomSource,
  type Team,
} from "../domain/match";
import { MATCH_CONFIGURATION } from "../domain/match-configuration";
import { probeCanonicalStorage } from "../storage/canonical-storage-probe";
import { appRoot, matchStore } from "./runtime";
import {
  createPhysicalConfirmations,
  patchShellState,
  state,
  type ActionDraft,
} from "../ui/shell-state.svelte";
import { buildAbilityInput } from "../ui/ability-draft";

export async function commitResult(result: CommandResult): Promise<boolean> {
  patchShellState({ saving: true, matchError: null });
  try {
    await matchStore.commit(result.event, result.state);
    patchShellState({
      match: result.state,
      events: [...state.current.events, result.event],
    });
    if (
      result.event.type === "MatchEnded" &&
      (result.state as { readonly phase: string }).phase === "ended"
    ) {
      const ended = result.state as Extract<
        MatchState,
        { readonly phase: "ended" }
      >;
      // Post-T02 the ended-state contract fields are required, so the
      // summary is always complete once phase === "ended".
      patchShellState({
        summary: {
          outcome: ended.outcome,
          decisionBasis: ended.decisionBasis,
          finalCounts: ended.finalCounts,
          finalHpTotals: ended.finalHpTotals,
          configurationVersion: ended.configurationVersion,
          endedAt: ended.endedAt,
          ...(ended.coinFlipResult
            ? { coinFlipResult: ended.coinFlipResult }
            : {}),
        },
      });
    }
    if (
      result.event.type === "SetupCreated" &&
      result.state.phase === "setup"
    ) {
      try {
        const latest = await matchStore.getSummary();
        patchShellState({ summary: latest });
      } catch {
        // Keep current summary on fetch failure
      }
    }
    return true;
  } catch {
    patchShellState({
      matchError: "Canonical storage could not commit the command.",
    });
    return false;
  } finally {
    patchShellState({ saving: false });
  }
}
export function openBasicAttack(): void {
  const match = state.current.match;
  if (
    match?.phase !== "active" ||
    match.configurationVersion !== MATCH_CONFIGURATION.version
  )
    return;
  const sourceCharacterId = match.initiative[match.activeSlot - 1]?.characterId;
  if (!sourceCharacterId) return;
  patchShellState({
    abilityPickerOpen: false,
    actionDraft: {
      kind: "basic",
      sourceCharacterId,
      configurationVersion: match.configurationVersion,
      abilityId: null,
      targets: [],
      step: "contacts",
      attackLegs: [[]],
      physicalConfirmations: createPhysicalConfirmations(
        state.current.requirePhysicalConfirmations,
      ),
      reactions: [],
      abilityOverride: false,
      overrideRequired: null,
      majorActionOverride: false,
    },
  });
}

export function openAbilityPicker(): void {
  const match = state.current.match;
  if (
    match?.phase !== "active" ||
    match.configurationVersion !== MATCH_CONFIGURATION.version ||
    state.current.actionDraft
  )
    return;
  const activeCharacterId = match.initiative[match.activeSlot - 1]?.characterId;
  const activeHp =
    match.characters.find(
      ({ characterId }) => characterId === activeCharacterId,
    )?.hp ?? 0;
  if (activeHp === 0 || match.eliminatedTeams.length === 2) return;
  patchShellState({ abilityPickerOpen: true });
}

export function closeAbilityPicker(): void {
  patchShellState({ abilityPickerOpen: false });
}

export function openAbilityDraft(abilityId: AbilityId): void {
  const match = state.current.match;
  if (
    match?.phase !== "active" ||
    match.configurationVersion !== MATCH_CONFIGURATION.version
  )
    return;
  const activeCharacterId = match.initiative[match.activeSlot - 1]?.characterId;
  const ability = MATCH_CONFIGURATION.abilities.find(
    ({ id }) => id === abilityId,
  );
  if (!ability || !activeCharacterId) return;
  // Only the active character's unspent, non-Reaction abilities can open a draft.
  if (
    ability.ownerCharacterId !== activeCharacterId ||
    ability.actionType === "reaction" ||
    match.spentAbilityIds.includes(ability.id)
  )
    return;
  const physical = ability.interaction === "physical-attack";
  patchShellState({
    abilityPickerOpen: false,
    actionDraft: {
      kind: "ability",
      sourceCharacterId: activeCharacterId,
      configurationVersion: match.configurationVersion,
      abilityId: ability.id,
      targets: [],
      step:
        ability.interaction === "self"
          ? "review"
          : physical
            ? "contacts"
            : "select-target",
      attackLegs: physical ? [[]] : [],
      physicalConfirmations: createPhysicalConfirmations(
        state.current.requirePhysicalConfirmations,
      ),
      reactions: [],
      abilityOverride: false,
      overrideRequired: null,
      majorActionOverride: false,
    },
  });
}

export function setAbilityStep(step: ActionDraft["step"]): void {
  const draft = state.current.actionDraft;
  if (!draft || draft.kind !== "ability") return;
  patchShellState({ actionDraft: { ...draft, step } });
}
export async function confirmBasicAttack(): Promise<void> {
  const match = state.current.match;
  const draft = state.current.actionDraft;
  if (match?.phase !== "active" || !draft || draft.step !== "review") return;
  await commitResult(
    resolveBasicAttack(
      match,
      {
        sourceCharacterId: draft.sourceCharacterId,
        attackLegs: draft.attackLegs.map((affectedCharacterIds) => ({
          affectedCharacterIds,
        })),
        physicalConfirmations: {
          range: draft.physicalConfirmations.range,
          lineOfSight: draft.physicalConfirmations["line-of-sight"],
          legalBottleContact:
            draft.physicalConfirmations["legal-bottle-contact"],
          terrainContact: draft.physicalConfirmations["terrain-contact"],
        },
        reactions: draft.reactions,
        majorActionOverride: draft.majorActionOverride
          ? MATCH_CONFIGURATION.refereeInstructions.secondMajorAction
          : null,
      },
      new Date().toISOString(),
    ),
  );
  patchShellState({ actionDraft: null });
}

const OVERRIDEABLE_DOMAIN_ERRORS = new Set([
  "wrong-active-character",
  "ability-already-spent",
  "invalid-target-relation",
  "invalid-target-life-state",
]);

export function cancelAbilityDraft(): void {
  if (
    !state.current.actionDraft ||
    state.current.actionDraft.kind !== "ability"
  )
    return;
  patchShellState({ actionDraft: null, abilityPickerOpen: false });
}

/**
 * Confirms an ability draft through the store's canonical commit path,
 * mirroring confirmBasicAttack. Domain errors that accept a recorded
 * Override surface as an explicit Override prompt instead of a dead end.
 */
export async function confirmAbility(): Promise<void> {
  const match = state.current.match;
  const draft = state.current.actionDraft;
  if (
    match?.phase !== "active" ||
    draft?.kind !== "ability" ||
    draft.step !== "review"
  )
    return;
  const result = (() => {
    try {
      return resolveAbility(
        match,
        buildAbilityInput(draft),
        new Date().toISOString(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (OVERRIDEABLE_DOMAIN_ERRORS.has(message)) {
        // Surface the domain error as an explicit Override recording prompt.
        patchShellState({
          actionDraft: { ...draft, overrideRequired: message },
        });
      } else {
        patchShellState({ matchError: message });
      }
      return null;
    }
  })();
  if (result === null) return;
  await commitResult(result);
  patchShellState({ actionDraft: null, abilityPickerOpen: false });
}

export async function createMatch(): Promise<void> {
  await commitResult(
    createSetup(crypto.randomUUID(), new Date().toISOString()),
  );
}
export async function generate(): Promise<void> {
  if (state.current.match?.phase === "setup")
    await commitResult(
      generateInitiative(
        state.current.match,
        cryptoRandomSource,
        new Date().toISOString(),
      ),
    );
}
export async function start(): Promise<void> {
  if (state.current.match?.phase === "setup") {
    await commitResult(
      startMatch(state.current.match, new Date().toISOString()),
    );
  }
}
export async function saveDisplayNames(): Promise<void> {
  const match = state.current.match;
  if (match?.phase !== "setup") return;
  const requested = Array.from(
    appRoot.querySelectorAll<HTMLInputElement>("[data-display-name-for]"),
  ).reduce<Partial<Record<CharacterId, string>>>((displayNames, input) => {
    const characterId = input.dataset.displayNameFor;
    return characterId && isCharacterId(characterId)
      ? { ...displayNames, [characterId]: input.value }
      : displayNames;
  }, {});
  const normalized = normalizeDisplayNames(requested);
  const current = match.displayNames;
  const unchanged = CHARACTER_IDS.every(
    (characterId) => normalized[characterId] === current[characterId],
  );
  if (unchanged) return;
  await commitResult(
    assignDisplayNames(match, requested, new Date().toISOString()),
  );
}
export async function advanceTurn(): Promise<void> {
  if (state.current.match?.phase === "active") {
    await commitResult(
      finishTurn(state.current.match, new Date().toISOString()),
    );
  }
}
export async function continueMatch(): Promise<void> {
  const match = state.current.match;
  if (match?.phase !== "active" || match.eliminatedTeams.length !== 1) return;
  const [eliminatedTeam] = match.eliminatedTeams;
  if (eliminatedTeam === undefined) return;
  await commitResult(
    acknowledgeElimination(match, eliminatedTeam, new Date().toISOString()),
  );
}
export async function recordSimultaneousRuling(
  outcome: Team | "draw",
): Promise<void> {
  if (
    state.current.match?.phase !== "active" ||
    state.current.match.eliminatedTeams.length !== 2 ||
    state.current.match.outcome !== null
  )
    return;
  await commitResult(
    ruleSimultaneousElimination(state.current.match, outcome, {
      overrideEvidence:
        "The authoritative rules do not define simultaneous Team Elimination; the referee selected this recorded override.",
      occurredAt: new Date().toISOString(),
    }),
  );
}
export async function reopenEndedMatch(): Promise<void> {
  if (state.current.match?.phase !== "ended") return;
  await commitResult(
    reopenMatch(state.current.match, new Date().toISOString()),
  );
}

async function removePriorSummary(): Promise<void> {
  patchShellState({ saving: true });
  try {
    await matchStore.deleteSummary(true);
    patchShellState({ summary: null, matchError: null });
  } catch {
    patchShellState({
      matchError: "Canonical storage could not remove the prior summary.",
    });
  } finally {
    patchShellState({ saving: false });
  }
}

async function startNewMatch(): Promise<void> {
  patchShellState({ saving: true });
  try {
    const setup = createSetup(crypto.randomUUID(), new Date().toISOString());
    await matchStore.commit(setup.event, setup.state);
    patchShellState({
      match: setup.state,
      events: [setup.event],
      matchError: null,
    });
    try {
      patchShellState({ summary: await matchStore.getSummary() });
    } catch {
      // keep existing
    }
  } catch {
    patchShellState({
      matchError: "Canonical storage could not start a new Match.",
    });
  } finally {
    patchShellState({ saving: false });
  }
}

async function confirmUndo(match: MatchState): Promise<void> {
  await commitResult(
    undoLastEvent(match, state.current.events, {
      occurredAt: new Date().toISOString(),
      confirmed: true,
    }),
  );
}

async function confirmEndGame(
  match: Extract<MatchState, { readonly phase: "active" }>,
): Promise<void> {
  const preview = state.current.endGamePreview;
  const expected = preview?.coinFlipResult;
  const random: RandomSource =
    expected === undefined
      ? cryptoRandomSource
      : { nextUint32: () => (expected === "Drow" ? 0 : 1) };
  const result = endMatch(match, {
    occurredAt: new Date().toISOString(),
    confirmed: true,
    random,
  });
  patchShellState({ endGamePreview: null });
  await commitResult(result);
}

async function removeEndedMatch(
  match: Extract<MatchState, { readonly phase: "ended" }>,
): Promise<void> {
  patchShellState({ saving: true });
  try {
    await matchStore.deleteMatch(match.matchId, true);
    patchShellState({
      match: null,
      events: [],
      summary: null,
      matchError: null,
    });
  } catch {
    patchShellState({
      matchError: "Canonical storage could not remove the Ended Match.",
    });
  } finally {
    patchShellState({ saving: false });
  }
}

async function confirmInitiativeReroll(
  match: Extract<MatchState, { readonly phase: "setup" }>,
): Promise<void> {
  await commitResult(
    rerollInitiative(match, cryptoRandomSource, {
      occurredAt: new Date().toISOString(),
      confirmed: true,
    }),
  );
}

async function discardSetupMatch(
  match: Extract<MatchState, { readonly phase: "setup" }>,
): Promise<void> {
  patchShellState({ saving: true });
  try {
    await matchStore.deleteMatch(match.matchId, true);
    patchShellState({ match: null, events: [], matchError: null });
    try {
      patchShellState({ summary: await matchStore.getSummary() });
    } catch {
      // keep prior summary on fetch failure
    }
  } catch {
    patchShellState({
      matchError: "Canonical storage could not discard the Match.",
    });
  } finally {
    patchShellState({ saving: false });
  }
}

export async function confirmAction(): Promise<void> {
  if (!state.current.confirmation) return;
  const confirmation = state.current.confirmation;
  patchShellState({ confirmation: null });
  if (confirmation === "remove-summary") {
    await removePriorSummary();
    return;
  }
  if (confirmation === "start-new" && state.current.match?.phase === "ended") {
    await startNewMatch();
    return;
  }
  const match = state.current.match;
  if (match === null) return;
  if (confirmation === "undo") {
    await confirmUndo(match);
    return;
  }
  if (confirmation === "end" && match.phase === "active") {
    await confirmEndGame(match);
    return;
  }
  if (confirmation === "remove" && match.phase === "ended") {
    await removeEndedMatch(match);
    return;
  }
  if (match.phase !== "setup") return;
  if (confirmation === "reroll") {
    await confirmInitiativeReroll(match);
    return;
  }
  await discardSetupMatch(match);
}
export async function restoreMatch(): Promise<void> {
  try {
    const restored = await matchStore.restore();
    patchShellState({
      match: restored?.state ?? null,
      events: restored?.events ?? [],
      summary: restored?.summary ?? null,
    });
    if (state.current.summary === null) {
      try {
        patchShellState({ summary: await matchStore.getSummary() });
      } catch {
        // keep null on fetch failure
      }
    }
    patchShellState({ matchError: null });
  } catch {
    patchShellState({ match: null, events: [], summary: null });
    try {
      patchShellState({ summary: await matchStore.getSummary() });
    } catch {
      // keep null
    }
    if (state.current.match === null && state.current.summary === null) {
      patchShellState({
        matchError:
          "Saved canonical data is incompatible, incomplete, or structurally invalid.",
      });
    } else {
      patchShellState({ matchError: null });
    }
  } finally {
    patchShellState({ matchLoaded: true });
  }
}
export async function runStorageProbe(): Promise<void> {
  patchShellState({
    canonicalStorage: "checking",
    storageDetail: "Running a write and removal safety check.",
  });
  const result = await probeCanonicalStorage();
  patchShellState({
    canonicalStorage: result.status,
    storageDetail:
      result.status === "ready"
        ? "The canonical write and removal check passed."
        : `${result.reason} The shell remains safe. Retry this check.`,
  });
  if (result.status === "ready" && !state.current.matchLoaded)
    await restoreMatch();
}
