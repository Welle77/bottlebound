import {
  acknowledgeElimination,
  assignDisplayNames,
  createSetup,
  cryptoRandomSource,
  endMatch,
  finishTurn,
  generateInitiative,
  normalizeDisplayNames,
  rerollInitiative,
  reopenMatch,
  resolveAbility,
  resolveBasicAttack,
  ruleSimultaneousElimination,
  startMatch,
  undoLastEvent,
  type CommandResult,
  type MatchState,
  type RandomSource,
} from "../domain/match";
import { RULESET } from "../domain/ruleset";
import { probeCanonicalStorage } from "../storage/canonical-storage-probe";
import { render } from "../ui/render";
import {
  appRoot,
  createPhysicalConfirmations,
  matchStore,
  state,
  type ActionDraft,
} from "../ui/shell-state";
import { buildAbilityInput } from "../ui/ability-draft";

export async function commitResult(result: CommandResult): Promise<boolean> {
  state.saving = true;
  state.matchError = null;
  render();
  try {
    await matchStore.commit(result.event, result.state);
    state.match = result.state;
    state.events = [...state.events, result.event];
    if (
      result.event.type === "MatchEnded" &&
      (result.state as { phase: string }).phase === "ended"
    ) {
      const ended = result.state as Extract<MatchState, { phase: "ended" }>;
      if (ended.decisionBasis && ended.finalCounts && ended.finalHpTotals) {
        state.summary = {
          outcome: ended.outcome,
          decisionBasis: ended.decisionBasis,
          finalCounts: ended.finalCounts,
          finalHpTotals: ended.finalHpTotals,
          rulesVersion: ended.rulesVersion,
          endedAt: ended.endedAt,
          ...(ended.coinFlipResult
            ? { coinFlipResult: ended.coinFlipResult }
            : {}),
        };
      }
    }
    if (
      result.event.type === "SetupCreated" &&
      result.state.phase === "setup"
    ) {
      try {
        const latest = await matchStore.getSummary();
        state.summary = latest;
      } catch {
        // Keep current summary on fetch failure
      }
    }
    return true;
  } catch {
    state.matchError = "Canonical storage could not commit the command.";
    return false;
  } finally {
    state.saving = false;
    render();
  }
}
export function openBasicAttack(): void {
  if (
    state.match?.phase !== "active" ||
    state.match.rulesVersion !== RULESET.version
  )
    return;
  const sourceCharacterId =
    state.match.initiative[state.match.activeSlot - 1]?.characterId;
  if (!sourceCharacterId) return;
  state.abilityPickerOpen = false;
  state.actionDraft = {
    kind: "basic",
    sourceCharacterId,
    rulesVersion: state.match.rulesVersion,
    abilityId: null,
    targets: [],
    step: "contacts",
    attackLegs: [[]],
    physicalConfirmations: createPhysicalConfirmations(
      state.requirePhysicalConfirmations,
    ),
    reactions: [],
    abilityOverride: false,
    overrideRequired: null,
    majorActionOverride: false,
  };
  render();
}

export function openAbilityPicker(): void {
  const match = state.match;
  if (
    match?.phase !== "active" ||
    match.rulesVersion !== RULESET.version ||
    state.actionDraft
  )
    return;
  const activeCharacterId = match.initiative[match.activeSlot - 1]?.characterId;
  const activeHp =
    match.characters.find(
      ({ characterId }) => characterId === activeCharacterId,
    )?.hp ?? 0;
  if (activeHp === 0 || match.eliminatedTeams.length === 2) return;
  state.abilityPickerOpen = true;
  render();
}

export function closeAbilityPicker(): void {
  state.abilityPickerOpen = false;
  render();
}

export function openAbilityDraft(abilityId: string): void {
  const match = state.match;
  if (match?.phase !== "active" || match.rulesVersion !== RULESET.version)
    return;
  const activeCharacterId = match.initiative[match.activeSlot - 1]?.characterId;
  const ability = RULESET.abilities.find(({ id }) => id === abilityId);
  if (!ability || !activeCharacterId) return;
  // Only the active character's unspent, non-Reaction abilities can open a draft.
  if (
    ability.ownerCharacterId !== activeCharacterId ||
    ability.actionType === "reaction" ||
    match.spentAbilityIds.includes(ability.id)
  )
    return;
  const physical = ability.interaction === "physical-attack";
  state.abilityPickerOpen = false;
  state.actionDraft = {
    kind: "ability",
    sourceCharacterId: activeCharacterId,
    rulesVersion: match.rulesVersion,
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
      state.requirePhysicalConfirmations,
    ),
    reactions: [],
    abilityOverride: false,
    overrideRequired: null,
    majorActionOverride: false,
  };
  render();
}

export function setAbilityStep(step: ActionDraft["step"]): void {
  if (!state.actionDraft || state.actionDraft.kind !== "ability") return;
  state.actionDraft.step = step;
  render();
}
export async function confirmBasicAttack(): Promise<void> {
  const match = state.match;
  const draft = state.actionDraft;
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
          ? "Referee confirmed a second Basic Attack this turn."
          : null,
      },
      new Date().toISOString(),
    ),
  );
  state.actionDraft = null;
  render();
}

const OVERRIDEABLE_DOMAIN_ERRORS = new Set([
  "wrong-active-character",
  "ability-already-spent",
  "invalid-target-relation",
  "invalid-target-life-state",
]);

export function cancelAbilityDraft(): void {
  if (!state.actionDraft || state.actionDraft.kind !== "ability") return;
  state.actionDraft = null;
  state.abilityPickerOpen = false;
  render();
}

/**
 * Confirms an ability draft through the store's canonical commit path,
 * mirroring confirmBasicAttack. Domain errors that accept a recorded
 * Override surface as an explicit Override prompt instead of a dead end.
 */
export async function confirmAbility(): Promise<void> {
  const match = state.match;
  const draft = state.actionDraft;
  if (
    match?.phase !== "active" ||
    draft?.kind !== "ability" ||
    draft.step !== "review"
  )
    return;
  let result;
  try {
    result = resolveAbility(
      match,
      buildAbilityInput(draft),
      new Date().toISOString(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (OVERRIDEABLE_DOMAIN_ERRORS.has(message)) {
      // Surface the domain error as an explicit Override recording prompt.
      draft.overrideRequired = message;
    } else {
      state.matchError = message;
    }
    render();
    return;
  }
  await commitResult(result);
  state.actionDraft = null;
  state.abilityPickerOpen = false;
  render();
}

export async function createMatch(): Promise<void> {
  await commitResult(
    createSetup(crypto.randomUUID(), new Date().toISOString()),
  );
}
export async function generate(): Promise<void> {
  if (state.match?.phase === "setup")
    await commitResult(
      generateInitiative(
        state.match,
        cryptoRandomSource,
        new Date().toISOString(),
      ),
    );
}
export async function start(): Promise<void> {
  if (state.match?.phase === "setup") {
    await commitResult(startMatch(state.match, new Date().toISOString()));
  }
}
export async function saveDisplayNames(): Promise<void> {
  const match = state.match;
  if (match?.phase !== "setup") return;
  const requested: Record<string, string> = {};
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-display-name-for]")
    .forEach((input) => {
      const characterId = input.dataset.displayNameFor;
      if (characterId) requested[characterId] = input.value;
    });
  const normalized = normalizeDisplayNames(requested);
  const current = match.displayNames ?? {};
  const unchanged =
    Object.keys(normalized).length === Object.keys(current).length &&
    Object.entries(normalized).every(([id, name]) => current[id] === name);
  if (unchanged) return;
  await commitResult(
    assignDisplayNames(match, requested, new Date().toISOString()),
  );
}
export async function advanceTurn(): Promise<void> {
  if (state.match?.phase === "active") {
    await commitResult(finishTurn(state.match, new Date().toISOString()));
  }
}
export async function continueMatch(): Promise<void> {
  if (
    state.match?.phase !== "active" ||
    state.match.eliminatedTeams.length !== 1
  )
    return;
  await commitResult(
    acknowledgeElimination(
      state.match,
      state.match.eliminatedTeams[0]!,
      new Date().toISOString(),
    ),
  );
}
export async function recordSimultaneousRuling(
  outcome: "Drow" | "Duergar" | "draw",
): Promise<void> {
  if (
    state.match?.phase !== "active" ||
    state.match.eliminatedTeams.length !== 2 ||
    state.match.outcome !== null
  )
    return;
  await commitResult(
    ruleSimultaneousElimination(state.match, outcome, {
      overrideEvidence:
        "The authoritative rules do not define simultaneous Team Elimination; the referee selected this recorded override.",
      occurredAt: new Date().toISOString(),
    }),
  );
}
export async function reopenEndedMatch(): Promise<void> {
  if (state.match?.phase !== "ended") return;
  await commitResult(reopenMatch(state.match, new Date().toISOString()));
}
export async function confirmAction(): Promise<void> {
  if (!state.confirmation) return;
  const confirmation = state.confirmation;
  state.confirmation = null;
  if (confirmation === "remove-summary") {
    state.saving = true;
    render();
    try {
      await matchStore.deleteSummary(true);
      state.summary = null;
      state.matchError = null;
    } catch {
      state.matchError =
        "Canonical storage could not remove the prior summary.";
    } finally {
      state.saving = false;
      render();
    }
    return;
  }
  if (confirmation === "start-new" && state.match?.phase === "ended") {
    state.saving = true;
    render();
    try {
      const setup = createSetup(crypto.randomUUID(), new Date().toISOString());
      await matchStore.commit(setup.event, setup.state);
      state.match = setup.state;
      state.events = [setup.event];
      state.matchError = null;
      try {
        state.summary = await matchStore.getSummary();
      } catch {
        // keep existing
      }
    } catch {
      state.matchError = "Canonical storage could not start a new Match.";
    } finally {
      state.saving = false;
      render();
    }
    return;
  }
  if (state.match === null) return;
  if (confirmation === "undo") {
    await commitResult(
      undoLastEvent(state.match, state.events, {
        occurredAt: new Date().toISOString(),
        confirmed: true,
      }),
    );
    return;
  }
  if (confirmation === "end" && state.match.phase === "active") {
    const preview = state.endGamePreview;
    let random: RandomSource = cryptoRandomSource;
    if (preview?.coinFlipResult) {
      const expected = preview.coinFlipResult;
      random = { nextUint32: () => (expected === "Drow" ? 0 : 1) };
    }
    const result = endMatch(state.match, {
      occurredAt: new Date().toISOString(),
      confirmed: true,
      random,
    });
    state.endGamePreview = null;
    await commitResult(result);
    return;
  }
  if (confirmation === "remove" && state.match.phase === "ended") {
    state.saving = true;
    render();
    try {
      await matchStore.deleteMatch(state.match.matchId, true);
      state.match = null;
      state.events = [];
      state.summary = null;
      state.matchError = null;
    } catch {
      state.matchError = "Canonical storage could not remove the Ended Match.";
    } finally {
      state.saving = false;
      render();
    }
    return;
  }
  if (state.match.phase !== "setup") return;
  if (confirmation === "reroll") {
    await commitResult(
      rerollInitiative(state.match, cryptoRandomSource, {
        occurredAt: new Date().toISOString(),
        confirmed: true,
      }),
    );
    return;
  }
  state.saving = true;
  render();
  try {
    await matchStore.deleteMatch(state.match.matchId, true);
    state.match = null;
    state.events = [];
    state.matchError = null;
    try {
      state.summary = await matchStore.getSummary();
    } catch {
      // keep prior summary on fetch failure
    }
  } catch {
    state.matchError = "Canonical storage could not discard the Match.";
  } finally {
    state.saving = false;
    render();
  }
}
export async function restoreMatch(): Promise<void> {
  try {
    const restored = await matchStore.restore();
    state.match = restored?.state ?? null;
    state.events = restored?.events ?? [];
    state.summary = restored?.summary ?? null;
    if (state.summary === null) {
      try {
        state.summary = await matchStore.getSummary();
      } catch {
        // keep null on fetch failure
      }
    }
    state.matchError = null;
  } catch {
    state.match = null;
    state.events = [];
    state.summary = null;
    try {
      state.summary = await matchStore.getSummary();
    } catch {
      // keep null
    }
    if (state.match === null && state.summary === null) {
      state.matchError =
        "Saved canonical data is incompatible, incomplete, or structurally invalid.";
    } else {
      state.matchError = null;
    }
  } finally {
    state.matchLoaded = true;
    render();
  }
}
export async function runStorageProbe(): Promise<void> {
  state.canonicalStorage = "checking";
  state.storageDetail = "Running a write and removal safety check.";
  render();
  const result = await probeCanonicalStorage();
  state.canonicalStorage = result.status;
  state.storageDetail =
    result.status === "ready"
      ? "The canonical write and removal check passed."
      : `${result.reason} The shell remains safe. Retry this check.`;
  render();
  if (result.status === "ready" && !state.matchLoaded) await restoreMatch();
}
