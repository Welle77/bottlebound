import {
  cryptoRandomSource,
  getEndGamePreview,
  getProtectiveReactionChoices,
  getUndoPreview,
  type MatchState,
  type MatchSummary,
  type SetupMatchState,
} from "../domain/match";
import { RULESET, type PhysicalAttackCheck } from "../domain/ruleset";
import {
  abilityDraftPanel,
  abilityListPanel,
  attackPreviewRow,
} from "./ability-draft";
import { deriveReadinessState } from "../readiness";
import {
  contextualRulesControl,
  characterNameHtml,
  decisionBasisLabel,
  escapeHtml,
  modifierLabel,
  outcomeLabel,
} from "./format";
import { draftAffectedCharacterIds, state } from "./shell-state";

export function rosterRows(match: SetupMatchState): string {
  if (match.initiative) {
    const totalCounts = new Map<number, number>();
    match.initiative.forEach(({ total }) =>
      totalCounts.set(total, (totalCounts.get(total) ?? 0) + 1),
    );
    return match.initiative
      .map((entry) => {
        const character = RULESET.characters.find(
          ({ id }) => id === entry.characterId,
        );
        if (!character)
          throw new Error("The Match references an unknown character.");
        const tieBreak =
          (totalCounts.get(entry.total) ?? 0) > 1 ? "Digital coin flip" : "—";
        return `<tr data-initiative-row><td data-label="Slot">${entry.slot}</td><th scope="row">${characterNameHtml(character, match.displayNames)}</th><td data-label="Team">${escapeHtml(character.team)}</td><td data-label="Roll">${entry.roll}</td><td data-label="Modifier">${modifierLabel(entry.modifier)}</td><td data-label="Total"><strong>${entry.total}</strong></td><td data-label="Tie break">${tieBreak}</td></tr>`;
      })
      .join("");
  }
  return match.characters
    .map((entry) => {
      const character = RULESET.characters.find(
        ({ id }) => id === entry.characterId,
      );
      if (!character)
        throw new Error("The Match references an unknown character.");
      return `<tr data-roster-row><td data-label="Slot">—</td><th scope="row">${characterNameHtml(character, match.displayNames)}</th><td data-label="Team">${escapeHtml(character.team)}</td><td data-label="HP">${entry.hp}/${character.baseHp}</td><td data-label="Modifier">${modifierLabel(character.initiativeModifier)}</td><td data-label="Total">—</td><td data-label="Tie break">—</td></tr>`;
    })
    .join("");
}

export function activeMatchPanel(
  match: Extract<MatchState, { phase: "active" }>,
): string {
  const activeEntry = match.initiative[match.activeSlot - 1];
  let nextSlot = match.activeSlot;
  for (let checked = 0; checked < match.initiative.length; checked += 1) {
    nextSlot = nextSlot === match.initiative.length ? 1 : nextSlot + 1;
    const candidate = match.initiative[nextSlot - 1];
    const candidateRules = RULESET.characters.find(
      ({ id }) => id === candidate?.characterId,
    );
    const candidateState = match.characters.find(
      ({ characterId }) => characterId === candidate?.characterId,
    );
    if (
      candidateRules &&
      candidateState?.hp !== 0 &&
      !match.eliminatedTeams.includes(candidateRules.team)
    )
      break;
  }
  const nextEntry = match.initiative[nextSlot - 1];
  if (!activeEntry || !nextEntry) {
    throw new Error("The Active Match initiative order is incomplete.");
  }
  const activeCharacter = RULESET.characters.find(
    ({ id }) => id === activeEntry.characterId,
  );
  const nextCharacter = RULESET.characters.find(
    ({ id }) => id === nextEntry.characterId,
  );
  if (!activeCharacter || !nextCharacter) {
    throw new Error("The Active Match references an unknown character.");
  }
  if (state.actionDraft) {
    return state.actionDraft.kind === "ability"
      ? abilityDraftPanel(match)
      : actionDraftPanel(
          match,
          characterNameHtml(activeCharacter, match.displayNames),
        );
  }
  if (state.abilityPickerOpen) return abilityListPanel(match);
  const hpByCharacter = new Map(
    match.characters.map(({ characterId, hp }) => [characterId, hp]),
  );
  const rows = match.initiative
    .map((entry) => {
      const character = RULESET.characters.find(
        ({ id }) => id === entry.characterId,
      );
      const hp = hpByCharacter.get(entry.characterId);
      if (!character || hp === undefined) {
        throw new Error("The Active Match references an unknown character.");
      }
      const turnLabel =
        entry.slot === match.activeSlot
          ? "Active"
          : hp === 0 || match.eliminatedTeams.includes(character.team)
            ? "Skipped · Downed"
            : entry.slot === nextSlot
              ? "Next"
              : "Waiting";
      return `<tr data-active-order-row data-turn="${turnLabel.toLowerCase()}"><td data-label="Slot">${entry.slot}</td><th scope="row">${characterNameHtml(character, match.displayNames)}</th><td data-label="Team">${escapeHtml(character.team)}</td><td data-label="HP">${hp}/${character.baseHp}</td><td data-label="Turn">${turnLabel}</td></tr>`;
    })
    .join("");
  const activeHp = hpByCharacter.get(activeEntry.characterId);
  const nextHp = hpByCharacter.get(nextEntry.characterId);
  const canUndo = !state.saving && getUndoPreview(match, state.events) !== null;
  const combatAvailable = match.rulesVersion === RULESET.version;
  const activeDowned = activeHp === 0;
  const normalElimination =
    match.eliminatedTeams.length === 1 && match.outcome !== null;
  const eliminationAcknowledged =
    normalElimination &&
    match.acknowledgedEliminations.includes(match.eliminatedTeams[0]!);
  const eliminationPrompt =
    normalElimination && !eliminationAcknowledged
      ? `<section class="elimination-result" role="alert" aria-labelledby="elimination-heading"><p class="eyebrow">Team Elimination</p><h3 id="elimination-heading">${escapeHtml(match.outcome!)} wins</h3><p>All six ${escapeHtml(match.eliminatedTeams[0]!)} characters are Downed. Choose how this Match proceeds.</p><div class="match-actions"><button id="request-end-game" class="primary-action" type="button">End Game</button>${canUndo ? '<button id="request-undo" class="secondary-action" type="button">Undo</button>' : ""}<button id="continue-match" class="secondary-action" type="button">Continue</button></div></section>`
      : eliminationAcknowledged
        ? `<p class="elimination-acknowledged" role="status">${escapeHtml(match.eliminatedTeams[0]!)} remains eliminated. Continue was acknowledged; its initiative slots are skipped.</p>`
        : match.eliminatedTeams.length === 2 && match.outcome === null
          ? `<section class="elimination-result simultaneous-elimination" role="alert" aria-labelledby="simultaneous-elimination-heading"><p class="eyebrow">Simultaneous Team Elimination</p><h3 id="simultaneous-elimination-heading">Both teams are eliminated</h3><p>The authoritative rules do not define the simultaneous outcome. Contact order is not a tiebreak. Record the referee's override before ending the Match.</p><form class="simultaneous-ruling"><fieldset><legend>Referee ruling</legend><div class="ruling-options"><label><input type="radio" name="simultaneous-outcome" value="Drow" required> Drow wins</label><label><input type="radio" name="simultaneous-outcome" value="Duergar"> Duergar wins</label><label><input type="radio" name="simultaneous-outcome" value="draw"> Draw</label></div></fieldset><div class="match-actions"><button class="primary-action" type="submit">Record referee ruling</button>${canUndo ? '<button id="request-undo" class="secondary-action" type="button">Undo</button>' : ""}</div></form></section>`
          : match.eliminatedTeams.length === 2 && match.outcome !== null
            ? `<section class="elimination-result simultaneous-elimination" role="alert" aria-labelledby="simultaneous-result-heading"><p class="eyebrow">Simultaneous Team Elimination</p><h3 id="simultaneous-result-heading">${escapeHtml(outcomeLabel(match.outcome))}</h3><p>Both Drow and Duergar are eliminated. Recorded referee override: the authoritative rules do not define this simultaneous outcome.</p><div class="match-actions"><button id="request-end-game" class="primary-action" type="button">End Game</button>${canUndo ? '<button id="request-undo" class="secondary-action" type="button">Undo</button>' : ""}</div></section>`
            : "";
  const combatStatus = combatAvailable
    ? ""
    : `<p id="combat-version-status" class="blocking-error" role="status">Basic Attack is unavailable because combat data for Ruleset ${escapeHtml(match.rulesVersion)} is not bundled. Finish Turn and Undo remain available.</p>`;
  const commands =
    eliminationPrompt && !eliminationAcknowledged
      ? ""
      : `<div class="match-actions"><button id="basic-attack" class="secondary-action" type="button" ${state.saving || !combatAvailable || activeDowned || match.eliminatedTeams.length === 2 ? "disabled" : ""} ${combatAvailable ? "" : 'aria-describedby="combat-version-status"'}>Basic Attack</button><button id="use-ability" class="secondary-action" type="button" ${state.saving || !combatAvailable || activeDowned || match.eliminatedTeams.length === 2 ? "disabled" : ""} ${combatAvailable ? "" : 'aria-describedby="combat-version-status"'}>Use Ability</button><button id="finish-turn" class="primary-action" type="button" ${state.saving || match.eliminatedTeams.length === 2 ? "disabled" : ""}>${state.saving ? "Saving…" : "Finish Turn"}</button>${canUndo ? '<button id="request-undo" class="secondary-action" type="button">Undo</button>' : ""}</div>`;
  const needsSeparateEndGame =
    !eliminationPrompt || eliminationAcknowledged || eliminationPrompt === "";
  const endGameControl =
    needsSeparateEndGame &&
    !(match.eliminatedTeams.length === 2 && match.outcome === null)
      ? `<section class="end-game-control" aria-labelledby="end-game-heading"><h3 id="end-game-heading">End Game</h3><p>Close the Match with the calculated winner and Decision Basis.</p><button id="request-end-game" class="secondary-action" type="button">End Game</button></section>`
      : "";
  const priorSummary = state.summary ? priorSummaryCard(state.summary) : "";
  return `<section class="match-panel active-match" aria-labelledby="active-heading"><div class="section-heading"><div><p class="eyebrow">Active · Sequence ${match.sequence}</p><h2 id="active-heading">Active Match</h2><p class="turn-position">Round ${match.round} · Slot ${match.activeSlot} of ${match.initiative.length}</p><div class="rules-context-links">${contextualRulesControl("rules-round", "Round rules", "section-5-core-terms")}${contextualRulesControl("rules-turn", "Turn rules", "section-7-turn-structure-movement")}</div></div><span class="readiness-badge" data-state="ready">Saved</span></div>${state.matchError ? `<p class="blocking-error" role="alert">${escapeHtml(state.matchError)} The last committed Active Match remains visible.</p>` : ""}<div class="turn-cards"><article class="turn-card active-character" data-active-character><p class="eyebrow">Active${activeDowned ? " · Downed" : ""}</p><h3>${characterNameHtml(activeCharacter, match.displayNames)}</h3><dl><div><dt>Team</dt><dd>${escapeHtml(activeCharacter.team)}</dd></div><div><dt>HP</dt><dd>${activeHp}/${activeCharacter.baseHp}</dd></div><div><dt>Slot</dt><dd>${activeEntry.slot}</dd></div></dl></article><article class="turn-card" data-next-character><p class="eyebrow">Next Active</p><h3>${characterNameHtml(nextCharacter, match.displayNames)}</h3><dl><div><dt>Team</dt><dd>${escapeHtml(nextCharacter.team)}</dd></div><div><dt>HP</dt><dd>${nextHp}/${nextCharacter.baseHp}</dd></div><div><dt>Slot</dt><dd>${nextEntry.slot}</dd></div></dl></article></div>${combatStatus}${eliminationPrompt}<div class="table-wrap"><table class="initiative-table active-order"><caption>Complete initiative order</caption><thead><tr><th>Slot</th><th>Character</th><th>Team</th><th>HP</th><th>Turn</th></tr></thead><tbody>${rows}</tbody></table></div>${commands}${endGameControl}${priorSummary}${confirmationPanel()}</section>`;
}

export function priorSummaryCard(summary: MatchSummary): string {
  const result = outcomeLabel(summary.outcome);
  const basis = `${decisionBasisLabel(summary.decisionBasis)}${summary.coinFlipResult ? ` · ${escapeHtml(summary.coinFlipResult)}` : ""}`;
  return `<section class="prior-summary-card" aria-labelledby="prior-summary-heading" data-prior-summary><div class="section-heading"><div><p class="eyebrow">Prior summary · On this device</p><h3 id="prior-summary-heading">Prior Match Summary</h3><p>Compact latest result — no export, no expiry.</p></div></div><dl class="ended-result"><div><dt>Result</dt><dd>${escapeHtml(result)}</dd></div><div><dt>Decision Basis</dt><dd>${escapeHtml(basis)}</dd></div><div><dt>Active counts</dt><dd>Drow ${summary.finalCounts.Drow} · Duergar ${summary.finalCounts.Duergar}</dd></div><div><dt>Active HP totals</dt><dd>Drow ${summary.finalHpTotals.Drow} · Duergar ${summary.finalHpTotals.Duergar}</dd></div><div><dt>Ruleset</dt><dd>${escapeHtml(summary.rulesVersion)}</dd></div><div><dt>Ended</dt><dd>${escapeHtml(summary.endedAt)}</dd></div></dl><p class="device-note">On this device only. No export.</p><button id="request-remove-summary" class="danger-action" type="button">Remove prior summary</button></section>`;
}

export function endedMatchPanel(
  match: Extract<MatchState, { phase: "ended" }>,
): string {
  const eliminated = match.eliminatedTeams.join(" and ");
  const result = outcomeLabel(match.outcome);
  const decisionBasis = (match as { decisionBasis?: string }).decisionBasis;
  const finalCounts = (
    match as { finalCounts?: { Drow: number; Duergar: number } }
  ).finalCounts;
  const finalHpTotals = (
    match as { finalHpTotals?: { Drow: number; Duergar: number } }
  ).finalHpTotals;
  const coinFlipResult = (match as { coinFlipResult?: string }).coinFlipResult;
  const basisLine = decisionBasis
    ? `<div><dt>Decision Basis</dt><dd>${escapeHtml(decisionBasisLabel(decisionBasis))}${coinFlipResult ? ` · ${escapeHtml(coinFlipResult)}` : ""}</dd></div>`
    : "";
  const countsLine = finalCounts
    ? `<div><dt>Active counts</dt><dd>Drow ${finalCounts.Drow} · Duergar ${finalCounts.Duergar}</dd></div>`
    : "";
  const hpLine = finalHpTotals
    ? `<div><dt>Active HP totals</dt><dd>Drow ${finalHpTotals.Drow} · Duergar ${finalHpTotals.Duergar}</dd></div>`
    : "";
  return `<section class="match-panel ended-match" aria-labelledby="ended-heading"><div class="section-heading"><div><p class="eyebrow">Ended · Sequence ${match.sequence}</p><h2 id="ended-heading">Ended Match</h2><p>${escapeHtml(result)}${eliminated ? ` · ${escapeHtml(eliminated)} eliminated` : ""}</p></div><span class="readiness-badge" data-state="ready">Read-only</span></div>${state.matchError ? `<p class="blocking-error" role="alert">${escapeHtml(state.matchError)} The Ended Match remains saved.</p>` : ""}<dl class="ended-result"><div><dt>Result</dt><dd>${escapeHtml(result)}</dd></div>${basisLine}${countsLine}${hpLine}<div><dt>Ended</dt><dd>${escapeHtml(match.endedAt)}</dd></div><div><dt>Final round</dt><dd>${match.round}</dd></div><div><dt>Ruleset</dt><dd>${escapeHtml(match.rulesVersion)}</dd></div></dl><p>This Match is read-only. Reopen it to make corrections, or remove its complete local history.</p><div class="match-actions"><button id="reopen-match" class="primary-action" type="button">Reopen Match</button><button id="request-start-new-match" class="secondary-action" type="button">Start new Match</button><button id="request-remove-match" class="danger-action" type="button">Remove Match</button></div>${confirmationPanel()}</section>`;
}

export function actionDraftPanel(
  match: Extract<MatchState, { phase: "active" }>,
  sourceNameHtml: string,
): string {
  const draft = state.actionDraft;
  if (!draft) return "";
  const attack = RULESET.basicAttacks.find(
    ({ characterId }) => characterId === draft.sourceCharacterId,
  );
  if (!attack || draft.rulesVersion !== match.rulesVersion) {
    throw new Error(
      "The Action Draft does not match the Active Match Ruleset.",
    );
  }
  const characterById = new Map(
    RULESET.characters.map((character) => [character.id, character]),
  );
  const nameHtmlOf = (characterId: string): string => {
    const character = characterById.get(characterId);
    return character
      ? characterNameHtml(character, match.displayNames)
      : escapeHtml(characterId);
  };
  const primaryNameOf = (character: {
    readonly id: string;
    readonly name: string;
  }): string => match.displayNames?.[character.id] ?? character.name;
  const attackLabel = attack.attackType === "melee" ? "Melee" : "Ranged";
  const source = `<div class="attack-profile"><p><strong>Source:</strong> ${sourceNameHtml}</p><p><strong>Type:</strong> ${attackLabel}</p><p><strong>Range:</strong> ${attack.rangePaces} paces</p><p><strong>Damage:</strong> ${attack.damage}</p>${contextualRulesControl("rules-basic-attack", "Basic Attack rules", attack.sourceAnchor)}</div>`;
  const affectedCharacterIds = draftAffectedCharacterIds(draft);
  if (draft.step === "review") {
    // Review rows run through the shared damage pipeline, so a marked,
    // raged, Vanished, or protected contact shows exactly the finalized
    // damage and effect consumption that confirming records.
    const rows = draft.attackLegs
      .flatMap((leg, legIndex) =>
        leg.map((characterId, contactIndex) =>
          attackPreviewRow(
            { match, draft, baseDamage: attack.damage, physicalAttack: true },
            characterId,
            `${legIndex + 1}.${contactIndex + 1}`,
          ),
        ),
      )
      .join("");
    const legReview = draft.attackLegs
      .map((leg, index) => {
        const names = leg.map(nameHtmlOf);
        return `<article class="attack-leg-review" data-attack-leg-review><h3>Leg ${index + 1} · ${index === 0 ? "Initial throw" : "Deflecting Palm redirect"}</h3><p>${names.length > 0 ? names.join(" → ") : "No later bottle contacts."}</p>${index === 1 ? `<p>Original source: ${sourceNameHtml} · ${attackLabel} · hard maximum range ${attack.rangePaces} paces.</p>` : ""}</article>`;
      })
      .join("");
    const reactions = draft.reactions
      .map((selection) => {
        const reaction = RULESET.reactions.find(
          ({ id }) => id === selection.reactionId,
        );
        const owner = reaction
          ? characterById.get(reaction.ownerCharacterId)
          : undefined;
        const protectedCharacter = characterById.get(
          selection.protectedCharacterId,
        );
        if (!reaction || !owner || !protectedCharacter) {
          throw new Error("The Action Draft references an unknown Reaction.");
        }
        const choice = getProtectiveReactionChoices(
          match,
          affectedCharacterIds,
        ).find(
          ({ reactionId, protectedCharacterId }) =>
            reactionId === selection.reactionId &&
            protectedCharacterId === selection.protectedCharacterId,
        );
        const warnings = choice?.warnings ?? [];
        const sourceCharacter = characterById.get(draft.sourceCharacterId);
        const details = [
          `Prevents damage and effects for ${primaryNameOf(protectedCharacter)}.`,
          reaction.name === "Misty Escape"
            ? `Move ${primaryNameOf(owner)} up to 2 paces immediately. Position remains physical.`
            : "",
          reaction.name === "Deflecting Palm" && sourceCharacter
            ? `The same physical attack is redirected toward ${primaryNameOf(sourceCharacter)}; its original source, profile, and hard maximum range remain unchanged.`
            : "",
          ...warnings,
          selection.override ? selection.override : "",
        ]
          .filter(Boolean)
          .map((detail) => `<li>${escapeHtml(detail)}</li>`)
          .join("");
        return `<article class="reaction-review" data-reaction-review><h3>${escapeHtml(reaction.name)}</h3><p>${characterNameHtml(owner, match.displayNames)} protects ${characterNameHtml(protectedCharacter, match.displayNames)}.</p><ul>${details}</ul></article>`;
      })
      .join("");
    const reactionReview = reactions
      ? `<section aria-labelledby="reaction-review-heading"><h3 id="reaction-review-heading">Reactions and objective operations</h3><div class="reaction-review-list">${reactions}</div></section>`
      : "<p>No Reactions apply in this resolution.</p>";
    return `<section class="match-panel action-draft" aria-labelledby="action-draft-heading"><p class="eyebrow">Action Draft · Review</p><h2 id="action-draft-heading">Review Basic Attack</h2>${source}<p>All four physical facts are referee-confirmed.</p><section aria-labelledby="attack-legs-heading"><h3 id="attack-legs-heading">Ordered Attack Legs</h3><div class="attack-leg-review-list">${legReview}</div></section>${reactionReview}<div class="table-wrap"><table class="initiative-table"><caption>Ordered hits and final changes</caption><thead><tr><th>Contact</th><th>Character</th><th>Team</th><th>Damage</th><th>HP</th><th>Downed</th></tr></thead><tbody>${rows}</tbody></table></div>${match.majorActionUsed ? `<label class="override-control"><input id="major-action-override" type="checkbox" ${draft.majorActionOverride ? "checked" : ""}> Record referee override for a second Basic Attack this turn</label>` : ""}<div class="match-actions"><button id="confirm-basic-attack" class="primary-action" type="button" ${match.majorActionUsed && !draft.majorActionOverride ? "disabled" : ""}>${state.saving ? "Saving…" : "Confirm Action Resolution"}</button><button id="back-to-contacts" class="secondary-action" type="button">Back</button><button id="cancel-basic-attack" class="secondary-action" type="button">Cancel draft</button></div></section>`;
  }
  const activeLegIndex = draft.attackLegs.length - 1;
  const activeLeg = draft.attackLegs[activeLegIndex]!;
  const closedCharacterIds = new Set(
    draft.attackLegs.slice(0, activeLegIndex).flatMap((leg) => leg),
  );
  const contacts = RULESET.characters
    .map((character) => {
      const order = activeLeg.indexOf(character.id);
      const duplicate = closedCharacterIds.has(character.id);
      return `<label class="contact-control"><input type="checkbox" data-hit-character="${escapeHtml(character.id)}" ${order >= 0 ? "checked" : ""} ${duplicate ? "disabled" : ""}><span>${characterNameHtml(character, match.displayNames)} · ${escapeHtml(character.team)}${duplicate ? ` · Already contacted in Leg ${draft.attackLegs.slice(0, activeLegIndex).findIndex((leg) => leg.includes(character.id)) + 1}` : ""}</span>${order >= 0 ? `<strong>Contact ${order + 1}</strong>` : ""}</label>`;
    })
    .join("");
  const checkLabels: readonly [PhysicalAttackCheck, string][] = [
    ["range", "Range is legal"],
    ["line-of-sight", "Line of Sight is legal"],
    ["legal-bottle-contact", "Every selected bottle was physically hit"],
    ["terrain-contact", "Terrain contact was resolved"],
  ];
  const checks = checkLabels
    .map(
      ([key, label]) =>
        `<label class="check-control"><input type="checkbox" data-physical-check="${key}" ${draft.physicalConfirmations[key] ? "checked" : ""}> ${escapeHtml(label)}</label>`,
    )
    .join("");
  const requireManualChecks = state.requirePhysicalConfirmations;
  const checksFieldset = requireManualChecks
    ? `<fieldset><legend>Manual physical confirmations</legend><div class="check-list">${checks}</div></fieldset>`
    : "";
  const ready =
    affectedCharacterIds.length > 0 &&
    (!requireManualChecks ||
      Object.values(draft.physicalConfirmations).every(Boolean));
  const choices = getProtectiveReactionChoices(match, affectedCharacterIds);
  const reactionChoice = (
    choice: (typeof choices)[number],
    override: boolean,
  ) => {
    const reaction = RULESET.reactions.find(
      ({ id }) => id === choice.reactionId,
    );
    const owner = reaction
      ? characterById.get(reaction.ownerCharacterId)
      : undefined;
    const protectedCharacter = characterById.get(choice.protectedCharacterId);
    if (!reaction || !owner || !protectedCharacter) return "";
    const selected = draft.reactions.some(
      ({ reactionId, protectedCharacterId }) =>
        reactionId === choice.reactionId &&
        protectedCharacterId === choice.protectedCharacterId,
    );
    const warning = choice.warnings.map(escapeHtml).join(" ");
    return `<label class="reaction-control${override ? " reaction-override" : ""}"><input type="checkbox" data-reaction-id="${escapeHtml(choice.reactionId)}" data-protected-character="${escapeHtml(choice.protectedCharacterId)}" data-reaction-override="${override}" ${selected ? "checked" : ""}><span><strong>${escapeHtml(reaction.name)}</strong> · ${characterNameHtml(owner, match.displayNames)} protects ${characterNameHtml(protectedCharacter, match.displayNames)}${warning ? `<small>${warning} Override records the referee decision.</small>` : ""}</span></label>`;
  };
  const eligibleChoices = choices
    .filter(({ eligible }) => eligible)
    .map((choice) => reactionChoice(choice, false))
    .join("");
  const overrideChoices = choices
    .filter(({ eligible }) => !eligible)
    .map((choice) => reactionChoice(choice, true))
    .join("");
  const reactions = affectedCharacterIds.length
    ? `<fieldset><legend>Protective Reactions</legend><p>Select at most one protected character for each reacting character.</p><div class="reaction-list">${eligibleChoices || "<p>No state-eligible Reactions.</p>"}</div>${overrideChoices ? `<details class="reaction-overrides"><summary>Override unavailable Reactions</summary><p>These choices have state warnings. Selection records an Override.</p><div class="reaction-list">${overrideChoices}</div></details>` : ""}</fieldset>`
    : "";
  const closedLeg =
    activeLegIndex === 1
      ? `<section class="closed-attack-leg" data-closed-attack-leg><h3>Attack Leg 1 closed</h3><p>${draft.attackLegs[0]!.map(nameHtmlOf).join(" → ")}</p></section><section class="redirect-evidence" data-redirect-evidence><h3>Redirected Attack Leg 2</h3><p>Original source: ${sourceNameHtml} · ${attackLabel} · hard maximum range ${attack.rangePaces} paces. Record every later legal contact; earlier contacts remain unavailable.</p></section>`
      : "";
  return `<section class="match-panel action-draft" aria-labelledby="action-draft-heading"><p class="eyebrow">Action Draft · Physical result</p><h2 id="action-draft-heading">Record Basic Attack</h2><p>This draft stays local until final confirmation.</p>${source}${closedLeg}<fieldset><legend>${activeLegIndex === 0 ? "Ordered bottle contacts" : "Redirected bottle contacts"}</legend><p>Select contacts in their physical order. Allies and the attacker remain valid choices.</p><div class="contact-list">${contacts}</div></fieldset>${reactions}${checksFieldset}<div class="match-actions"><button id="review-basic-attack" class="primary-action" type="button" ${ready ? "" : "disabled"}>Review Action Resolution</button><button id="cancel-basic-attack" class="secondary-action" type="button">Cancel draft</button></div></section>`;
}

export function undoStatePanel(match: MatchState, attribute: string): string {
  const initiativeByCharacter = new Map(
    match.initiative?.map((entry) => [entry.characterId, entry]),
  );
  const rows = match.characters
    .map((entry) => {
      const character = RULESET.characters.find(
        ({ id }) => id === entry.characterId,
      );
      if (!character)
        throw new Error("The Match references an unknown character.");
      const initiative = initiativeByCharacter.get(entry.characterId);
      return `<tr data-state-character><th scope="row">${characterNameHtml(character, match.displayNames)}</th><td data-label="Team">${escapeHtml(character.team)}</td><td data-label="HP">${entry.hp}/${character.baseHp}</td><td data-label="Slot">${initiative?.slot ?? "—"}</td><td data-label="Roll">${initiative?.roll ?? "—"}</td><td data-label="Modifier">${modifierLabel(initiative?.modifier ?? character.initiativeModifier)}</td><td data-label="Total">${initiative?.total ?? "—"}</td></tr>`;
    })
    .join("");
  const turn =
    match.phase !== "setup"
      ? `<p class="turn-position">Round ${match.round} · Slot ${match.activeSlot}</p><p>Major Action: ${match.majorActionUsed ? "Used" : "Available"}</p><p>Spent Abilities: ${match.spentAbilityIds.length > 0 ? match.spentAbilityIds.map((id) => escapeHtml(RULESET.abilities.find((ability) => ability.id === id)?.name ?? id)).join(", ") : "None"}</p><p>Spent Reactions: ${match.spentReactionIds.length > 0 ? match.spentReactionIds.map((id) => escapeHtml(RULESET.reactions.find((reaction) => reaction.id === id)?.name ?? id)).join(", ") : "None"}</p>`
      : `<p class="turn-position">${match.initiative ? "Initiative generated" : "No initiative result"}</p>`;
  return `<article class="undo-state" ${attribute}><h4>${attribute === "data-undo-current" ? "Current committed state" : "State after Undo"}</h4><p>Phase: ${match.phase === "active" ? "Active" : match.phase === "ended" ? "Ended" : "Setup"} · Sequence ${match.sequence}</p>${turn}<p>Team Elimination: ${match.eliminatedTeams.length > 0 ? match.eliminatedTeams.join(", ") : "None"} · Acknowledged: ${match.acknowledgedEliminations.length > 0 ? match.acknowledgedEliminations.join(", ") : "None"} · Outcome: ${match.outcome ?? "None"}</p><p>Match ${escapeHtml(match.matchId)} · Rules ${escapeHtml(match.rulesVersion)}</p><div class="table-wrap"><table class="initiative-table"><caption>Complete character state</caption><thead><tr><th>Character</th><th>Team</th><th>HP</th><th>Slot</th><th>Roll</th><th>Modifier</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

export function confirmationPanel(): string {
  if (state.confirmation === null) return "";
  if (state.confirmation === "undo") {
    if (state.match === null) return "";
    const preview = getUndoPreview(state.match, state.events);
    if (preview === null) return "";
    const targetLabel = {
      DisplayNamesAssigned: "Assign Display Names",
      InitiativeGenerated: "Generate Initiative",
      InitiativeRerolled: "Reroll Initiative",
      MatchStarted: "Start Match",
      TurnFinished: "Finish Turn",
      ActionResolved: "Action Resolution",
      EliminationContinued: "Continue",
      SimultaneousEliminationRuled: "Simultaneous Elimination Ruling",
      MatchReopened: "Reopen Match",
    }[preview.target.type];
    const sourceAnchor =
      preview.target.type === "TurnFinished" ||
      preview.target.type === "MatchStarted" ||
      preview.target.type === "ActionResolved"
        ? "section-7-turn-structure-movement"
        : "section-6-initiative-game-clock";
    return `<section class="confirmation-panel undo-confirmation" role="alertdialog" aria-labelledby="confirmation-heading" aria-describedby="confirmation-detail"><div><p class="eyebrow">Confirmation required</p><h3 id="confirmation-heading">Undo ${targetLabel}?</h3><p id="confirmation-detail">Check the complete committed state and the complete state that Undo will restore.</p>${contextualRulesControl("rules-undo", "Undo rules", sourceAnchor)}</div><div class="undo-comparison">${undoStatePanel(preview.currentState, "data-undo-current")}${undoStatePanel(preview.restoredState, "data-undo-restored")}</div><div class="button-row"><button id="confirm-action" class="danger-action" type="button">Confirm Undo</button><button id="cancel-action" class="secondary-action" type="button">Cancel</button></div></section>`;
  }
  if (state.confirmation === "end" && state.match?.phase === "active") {
    const storedPreview = state.endGamePreview;
    if (storedPreview) {
      const result =
        storedPreview.outcome === "draw"
          ? "Draw"
          : `${storedPreview.outcome} wins`;
      return `<section class="confirmation-panel end-game-preview" role="alertdialog" aria-labelledby="confirmation-heading" aria-describedby="confirmation-detail"><div><p class="eyebrow">End Game preview</p><h3 id="confirmation-heading">End this Match?</h3><p id="confirmation-detail">Review the calculated winner and Decision Basis before confirming. This becomes read-only until reopened.</p></div><dl class="ended-result"><div><dt>Winner</dt><dd>${escapeHtml(result)}</dd></div><div><dt>Decision Basis</dt><dd>${escapeHtml(decisionBasisLabel(storedPreview.decisionBasis))}${storedPreview.coinFlipResult ? ` · ${escapeHtml(storedPreview.coinFlipResult)}` : ""}</dd></div><div><dt>Active counts</dt><dd>Drow ${storedPreview.finalCounts.Drow} · Duergar ${storedPreview.finalCounts.Duergar}</dd></div><div><dt>Active HP totals</dt><dd>Drow ${storedPreview.finalHpTotals.Drow} · Duergar ${storedPreview.finalHpTotals.Duergar}</dd></div><div><dt>Ruleset</dt><dd>${escapeHtml(state.match.rulesVersion)}</dd></div></dl><div class="button-row"><button id="confirm-action" class="danger-action" type="button">Confirm End Game</button><button id="cancel-action" class="secondary-action" type="button">Cancel</button></div></section>`;
    }
    try {
      const preview = getEndGamePreview(state.match, cryptoRandomSource);
      const result =
        preview.outcome === "draw" ? "Draw" : `${preview.outcome} wins`;
      return `<section class="confirmation-panel end-game-preview" role="alertdialog" aria-labelledby="confirmation-heading" aria-describedby="confirmation-detail"><div><p class="eyebrow">End Game preview</p><h3 id="confirmation-heading">End this Match?</h3><p id="confirmation-detail">Review the calculated winner and Decision Basis before confirming. This becomes read-only until reopened.</p></div><dl class="ended-result"><div><dt>Winner</dt><dd>${escapeHtml(result)}</dd></div><div><dt>Decision Basis</dt><dd>${escapeHtml(decisionBasisLabel(preview.decisionBasis))}${preview.coinFlipResult ? ` · ${escapeHtml(preview.coinFlipResult)}` : ""}</dd></div><div><dt>Active counts</dt><dd>Drow ${preview.finalCounts.Drow} · Duergar ${preview.finalCounts.Duergar}</dd></div><div><dt>Active HP totals</dt><dd>Drow ${preview.finalHpTotals.Drow} · Duergar ${preview.finalHpTotals.Duergar}</dd></div><div><dt>Ruleset</dt><dd>${escapeHtml(state.match.rulesVersion)}</dd></div></dl><div class="button-row"><button id="confirm-action" class="danger-action" type="button">Confirm End Game</button><button id="cancel-action" class="secondary-action" type="button">Cancel</button></div></section>`;
    } catch {
      // fall back to generic panel if preview cannot be computed (e.g., simultaneous unruled)
    }
  }
  const content = {
    reroll: [
      "Replace every initiative result?",
      "This creates 12 new rolls and a new committed order.",
      "Confirm reroll",
    ],
    discard: [
      "Discard this Match and its history?",
      "This final deletion cannot be undone.",
      "Confirm discard",
    ],
    end: [
      "End this Match?",
      "The result becomes read-only until the Match is reopened.",
      "Confirm End Game",
    ],
    remove: [
      "Remove this Ended Match and its history?",
      "This final deletion cannot be undone.",
      "Confirm removal",
    ],
    "remove-summary": [
      "Remove prior summary?",
      "This only removes the compact latest result. The Active Match stays.",
      "Confirm removal",
    ],
    "start-new": [
      "Start a new Match?",
      "This clears the Ended Match history but keeps its summary as prior result.",
      "Confirm start",
    ],
  }[state.confirmation];
  if (!content) return "";
  return `<section class="confirmation-panel" role="alertdialog" aria-labelledby="confirmation-heading" aria-describedby="confirmation-detail"><div><p class="eyebrow">Confirmation required</p><h3 id="confirmation-heading">${content[0]}</h3><p id="confirmation-detail">${content[1]}</p></div><div class="button-row"><button id="confirm-action" class="danger-action" type="button">${content[2]}</button><button id="cancel-action" class="secondary-action" type="button">Cancel</button></div></section>`;
}

export function displayNamesEditor(match: SetupMatchState): string {
  const fields = RULESET.characters.map((character) => {
    const displayName = match.displayNames?.[character.id] ?? "";
    return `<label class="display-name-control"><span>${characterNameHtml(character, match.displayNames)} · ${escapeHtml(character.team)}</span><input type="text" data-display-name-for="${escapeHtml(character.id)}" value="${escapeHtml(displayName)}" placeholder="${escapeHtml(character.name)}" autocomplete="off"></label>`;
  });
  return `<details class="display-names-panel" data-display-names><summary>Character Display Names</summary><p>Optionally name each character to match the miniatures on the table. An empty field keeps the Ruleset name. Saving records one reversible event.</p><div class="display-name-list">${fields.join("")}</div><div class="match-actions"><button id="save-display-names" class="secondary-action" type="button" ${state.saving ? "disabled" : ""}>${state.saving ? "Saving…" : "Save display names"}</button></div></details>`;
}

export function matchPanel(): string {
  const readiness = deriveReadinessState(state);
  if (state.matchError && state.match === null) {
    return `<section class="action-panel error-panel" role="alert" aria-labelledby="recovery-heading"><div><p class="eyebrow">Recovery stopped</p><h2 id="recovery-heading">Saved Match needs recovery</h2><p>${state.matchError}</p><p>The console did not create replacement Match data.</p></div></section>`;
  }
  if (state.match === null) {
    const blocked =
      readiness.matchCreation === "blocked" ||
      !state.matchLoaded ||
      state.saving ||
      state.matchError !== null;
    return `<section class="action-panel" aria-labelledby="match-heading"><div><p class="eyebrow">Match control</p><h2 id="match-heading">Create a Match</h2><p id="match-guidance">${readiness.blockingReason ?? (state.matchLoaded ? "Create the fixed 12-character Setup at full HP." : "Checking for a saved Match.")}</p></div><button id="create-match" class="primary-action" type="button" ${blocked ? "disabled" : ""} aria-describedby="match-guidance">${state.saving ? "Saving…" : "Create Match"}</button>${readiness.canonicalStorage === "failed" ? '<button id="retry-storage" class="secondary-action" type="button">Retry storage check</button>' : ""}</section>`;
  }
  if (state.match.phase === "active") {
    return activeMatchPanel(state.match);
  }
  if (state.match.phase === "ended") {
    return endedMatchPanel(state.match);
  }
  const hasInitiative = state.match.initiative !== null;
  const canUndo =
    !state.saving && getUndoPreview(state.match, state.events) !== null;
  const contextLink = hasInitiative
    ? contextualRulesControl(
        "rules-tie-break",
        "Exact tie-break rules",
        "section-6-initiative-game-clock",
      )
    : contextualRulesControl(
        "rules-initiative",
        "Initiative rules",
        "section-6-initiative-game-clock",
      );
  const priorSummary = state.summary ? priorSummaryCard(state.summary) : "";
  return `<section class="match-panel" aria-labelledby="setup-heading"><div class="section-heading"><div><p class="eyebrow">Setup · Sequence ${state.match.sequence}</p><h2 id="setup-heading">Initiative Setup</h2><p>${hasInitiative ? "The complete committed order is ready. Exact ties use recorded digital coin flips." : "All characters start at full HP. Generate the complete order when ready."}</p><div class="rules-context-links">${contextLink}</div></div><span class="readiness-badge" data-state="ready">Saved</span></div>${state.matchError ? `<p class="blocking-error" role="alert">${state.matchError} The last committed Setup remains visible.</p>` : ""}<div class="table-wrap"><table class="initiative-table"><thead><tr><th>Slot</th><th>Character</th><th>Team</th><th>${hasInitiative ? "Roll" : "HP"}</th><th>Modifier</th><th>Total</th><th>Tie break</th></tr></thead><tbody>${rosterRows(state.match)}</tbody></table></div>${displayNamesEditor(state.match)}<div class="match-actions">${hasInitiative ? '<button id="start-match" class="primary-action" type="button">Start Match</button><button id="request-reroll" class="secondary-action" type="button">Reroll initiative</button>' : '<button id="generate-initiative" class="primary-action" type="button">Generate initiative</button>'}${canUndo ? '<button id="request-undo" class="secondary-action" type="button">Undo</button>' : ""}<button id="request-discard" class="danger-action" type="button">Discard Match</button></div>${priorSummary}${confirmationPanel()}</section>`;
}
