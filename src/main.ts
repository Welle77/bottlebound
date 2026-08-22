import "./styles.css";

import {
  acknowledgeElimination,
  createSetup,
  cryptoRandomSource,
  endMatch,
  finishTurn,
  getUndoPreview,
  getProtectiveReactionChoices,
  generateInitiative,
  rerollInitiative,
  reopenMatch,
  resolveBasicAttack,
  ruleSimultaneousElimination,
  startMatch,
  undoLastEvent,
  type CommandResult,
  type MatchEvent,
  type MatchState,
  type ProtectiveReactionInput,
  type SetupMatchState,
} from "./domain/match";
import { RULESET, type PhysicalAttackCheck } from "./domain/ruleset";
import {
  deriveReadinessState,
  type AppShellCacheState,
  type NetworkState,
  type ProbeState,
  type ServiceWorkerState,
} from "./readiness";
import { probeCanonicalStorage } from "./storage/canonical-storage-probe";
import { IndexedDbMatchStore } from "./storage/match-store";
import {
  resolveRulesReference,
  resolveRulesSurface,
} from "./rules-reference/rules-reference";
import {
  normalizeRulesQuery,
  searchRules,
  type RulesSearchHighlight,
} from "./rules-reference/rules-search";
import type { RulesReference } from "./rules-reference/types";
import {
  createRulesUiState,
  retainRulesVersion,
} from "./rules-reference/rules-ui-state";

type Confirmation = "reroll" | "discard" | "undo" | "end" | "remove" | null;
interface ActionDraft {
  readonly sourceCharacterId: string;
  readonly rulesVersion: string;
  step: "contacts" | "review";
  attackLegs: string[][];
  physicalConfirmations: Record<PhysicalAttackCheck, boolean>;
  reactions: Array<
    ProtectiveReactionInput & { readonly override: string | null }
  >;
  majorActionOverride: boolean;
}

function draftAffectedCharacterIds(draft: ActionDraft): string[] {
  return draft.attackLegs.flatMap((leg) => leg);
}
interface ShellState {
  network: NetworkState;
  serviceWorker: ServiceWorkerState;
  appShellCache: AppShellCacheState;
  canonicalStorage: ProbeState;
  storageDetail: string;
  match: MatchState | null;
  events: readonly MatchEvent[];
  matchLoaded: boolean;
  matchError: string | null;
  confirmation: Confirmation;
  actionDraft: ActionDraft | null;
  saving: boolean;
}

const state: ShellState = {
  network: navigator.onLine ? "online" : "offline",
  serviceWorker: "serviceWorker" in navigator ? "registering" : "unsupported",
  appShellCache: "checking",
  canonicalStorage: "checking",
  storageDetail: "Running a write and removal safety check.",
  match: null,
  events: [],
  matchLoaded: false,
  matchError: null,
  confirmation: null,
  actionDraft: null,
  saving: false,
};
let rulesUi = createRulesUiState(RULESET.version);
const matchStore = new IndexedDbMatchStore();
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("The Referee Console root element is missing.");
const appRoot: HTMLDivElement = root;

function statusLabel(value: string): string {
  return value.replaceAll("-", " ");
}
function modifierLabel(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function outcomeLabel(outcome: Exclude<MatchState["outcome"], null>): string {
  return outcome === "draw" ? "Draw" : `${outcome} wins`;
}

function highlightedExcerpt(
  excerpt: string,
  highlights: readonly RulesSearchHighlight[],
): string {
  let cursor = 0;
  let result = "";
  for (const highlight of highlights) {
    if (highlight.start < cursor) continue;
    result += escapeHtml(excerpt.slice(cursor, highlight.start));
    result += `<mark>${escapeHtml(excerpt.slice(highlight.start, highlight.end))}</mark>`;
    cursor = highlight.end;
  }
  return result + escapeHtml(excerpt.slice(cursor));
}

function searchResultKind(kind: string): string {
  return (
    {
      ability: "Ability card",
      character: "Character",
      section: "Rules section",
      "quick-reference": "Quick reference",
    }[kind] ?? kind
  );
}

function contextualRulesControl(
  id: string,
  label: string,
  anchor: string,
): string {
  return `<button id="${escapeHtml(id)}" class="rules-context-link" type="button" data-open-rules-anchor="${escapeHtml(anchor)}">${escapeHtml(label)}</button>`;
}

function updateRulesSearch(reference: RulesReference, query: string): void {
  const contents = appRoot.querySelector<HTMLElement>("[data-rules-contents]");
  const output = appRoot.querySelector<HTMLElement>("[data-rules-results]");
  if (!contents || !output) return;

  const hasQuery = normalizeRulesQuery(query).length > 0;
  contents.hidden = hasQuery;
  output.hidden = !hasQuery;
  if (!hasQuery) {
    output.innerHTML = "";
    return;
  }

  const results = searchRules(reference.records, query);
  if (results.length === 0) {
    output.innerHTML =
      '<h3 id="rules-results-heading">Search results</h3><p>No rules match every search term.</p>';
    return;
  }
  const items = results
    .map(
      (result) =>
        `<li><a href="#${escapeHtml(result.anchor)}" data-rules-source><span class="rules-result-heading"><strong>${escapeHtml(result.title)}</strong><span>${escapeHtml(searchResultKind(result.kind))}</span></span><span class="rules-result-excerpt">${highlightedExcerpt(result.excerpt, result.highlights)}</span></a></li>`,
    )
    .join("");
  output.innerHTML = `<h3 id="rules-results-heading">Search results</h3><p>${results.length} ${results.length === 1 ? "result" : "results"}. All matches are shown.</p><ol>${items}</ol>`;
}

function rosterRows(match: SetupMatchState): string {
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
        return `<tr data-initiative-row><td data-label="Slot">${entry.slot}</td><th scope="row">${escapeHtml(character.name)}</th><td data-label="Team">${escapeHtml(character.team)}</td><td data-label="Roll">${entry.roll}</td><td data-label="Modifier">${modifierLabel(entry.modifier)}</td><td data-label="Total"><strong>${entry.total}</strong></td><td data-label="Tie break">${tieBreak}</td></tr>`;
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
      return `<tr data-roster-row><td data-label="Slot">—</td><th scope="row">${escapeHtml(character.name)}</th><td data-label="Team">${escapeHtml(character.team)}</td><td data-label="HP">${entry.hp}/${character.baseHp}</td><td data-label="Modifier">${modifierLabel(character.initiativeModifier)}</td><td data-label="Total">—</td><td data-label="Tie break">—</td></tr>`;
    })
    .join("");
}

function activeMatchPanel(
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
  if (state.actionDraft) return actionDraftPanel(match, activeCharacter.name);
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
      return `<tr data-active-order-row data-turn="${turnLabel.toLowerCase()}"><td data-label="Slot">${entry.slot}</td><th scope="row">${escapeHtml(character.name)}</th><td data-label="Team">${escapeHtml(character.team)}</td><td data-label="HP">${hp}/${character.baseHp}</td><td data-label="Turn">${turnLabel}</td></tr>`;
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
      : `<div class="match-actions"><button id="basic-attack" class="secondary-action" type="button" ${state.saving || !combatAvailable || activeDowned || match.eliminatedTeams.length === 2 ? "disabled" : ""} ${combatAvailable ? "" : 'aria-describedby="combat-version-status"'}>Basic Attack</button><button id="finish-turn" class="primary-action" type="button" ${state.saving || match.eliminatedTeams.length === 2 ? "disabled" : ""}>${state.saving ? "Saving…" : "Finish Turn"}</button>${canUndo ? '<button id="request-undo" class="secondary-action" type="button">Undo</button>' : ""}</div>`;
  return `<section class="match-panel active-match" aria-labelledby="active-heading"><div class="section-heading"><div><p class="eyebrow">Active · Sequence ${match.sequence}</p><h2 id="active-heading">Active Match</h2><p class="turn-position">Round ${match.round} · Slot ${match.activeSlot} of ${match.initiative.length}</p><div class="rules-context-links">${contextualRulesControl("rules-round", "Round rules", "section-5-core-terms")}${contextualRulesControl("rules-turn", "Turn rules", "section-7-turn-structure-movement")}</div></div><span class="readiness-badge" data-state="ready">Saved</span></div>${state.matchError ? `<p class="blocking-error" role="alert">${escapeHtml(state.matchError)} The last committed Active Match remains visible.</p>` : ""}<div class="turn-cards"><article class="turn-card active-character" data-active-character><p class="eyebrow">Active${activeDowned ? " · Downed" : ""}</p><h3>${escapeHtml(activeCharacter.name)}</h3><dl><div><dt>Team</dt><dd>${escapeHtml(activeCharacter.team)}</dd></div><div><dt>HP</dt><dd>${activeHp}/${activeCharacter.baseHp}</dd></div><div><dt>Slot</dt><dd>${activeEntry.slot}</dd></div></dl></article><article class="turn-card" data-next-character><p class="eyebrow">Next Active</p><h3>${escapeHtml(nextCharacter.name)}</h3><dl><div><dt>Team</dt><dd>${escapeHtml(nextCharacter.team)}</dd></div><div><dt>HP</dt><dd>${nextHp}/${nextCharacter.baseHp}</dd></div><div><dt>Slot</dt><dd>${nextEntry.slot}</dd></div></dl></article></div>${combatStatus}${eliminationPrompt}<div class="table-wrap"><table class="initiative-table active-order"><caption>Complete initiative order</caption><thead><tr><th>Slot</th><th>Character</th><th>Team</th><th>HP</th><th>Turn</th></tr></thead><tbody>${rows}</tbody></table></div>${commands}${confirmationPanel()}</section>`;
}

function endedMatchPanel(
  match: Extract<MatchState, { phase: "ended" }>,
): string {
  const eliminated = match.eliminatedTeams.join(" and ");
  const result = outcomeLabel(match.outcome);
  return `<section class="match-panel ended-match" aria-labelledby="ended-heading"><div class="section-heading"><div><p class="eyebrow">Ended · Sequence ${match.sequence}</p><h2 id="ended-heading">Ended Match</h2><p>${escapeHtml(result)} · ${escapeHtml(eliminated)} eliminated</p></div><span class="readiness-badge" data-state="ready">Read-only</span></div>${state.matchError ? `<p class="blocking-error" role="alert">${escapeHtml(state.matchError)} The Ended Match remains saved.</p>` : ""}<dl class="ended-result"><div><dt>Result</dt><dd>${escapeHtml(result)}</dd></div><div><dt>Ended</dt><dd>${escapeHtml(match.endedAt)}</dd></div><div><dt>Final round</dt><dd>${match.round}</dd></div><div><dt>Ruleset</dt><dd>${escapeHtml(match.rulesVersion)}</dd></div></dl><p>This Match is read-only. Reopen it to make corrections, or remove its complete local history.</p><div class="match-actions"><button id="reopen-match" class="primary-action" type="button">Reopen Match</button><button id="request-remove-match" class="danger-action" type="button">Remove Match</button></div>${confirmationPanel()}</section>`;
}

function actionDraftPanel(
  match: Extract<MatchState, { phase: "active" }>,
  sourceName: string,
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
  const hpById = new Map(
    match.characters.map((character) => [character.characterId, character.hp]),
  );
  const attackLabel = attack.attackType === "melee" ? "Melee" : "Ranged";
  const source = `<div class="attack-profile"><p><strong>Source:</strong> ${escapeHtml(sourceName)}</p><p><strong>Type:</strong> ${attackLabel}</p><p><strong>Range:</strong> ${attack.rangePaces} paces</p><p><strong>Damage:</strong> ${attack.damage}</p>${contextualRulesControl("rules-basic-attack", "Basic Attack rules", attack.sourceAnchor)}</div>`;
  const affectedCharacterIds = draftAffectedCharacterIds(draft);
  if (draft.step === "review") {
    const protectedCharacterIds = new Set(
      draft.reactions.map(({ protectedCharacterId }) => protectedCharacterId),
    );
    const rows = draft.attackLegs
      .flatMap((leg, legIndex) =>
        leg.map((characterId, contactIndex) => {
          const character = characterById.get(characterId);
          const hp = hpById.get(characterId);
          if (!character || hp === undefined)
            throw new Error(
              "The Action Draft references an unknown character.",
            );
          const damage = protectedCharacterIds.has(characterId)
            ? 0
            : attack.damage;
          const after = Math.max(0, hp - damage);
          return `<tr data-action-review-hit><td>${legIndex + 1}.${contactIndex + 1}</td><th scope="row">${escapeHtml(character.name)}</th><td>${escapeHtml(character.team)}</td><td>${damage}${damage === 0 ? " (prevented)" : ""}</td><td>${hp} → ${after}</td><td>${hp === 0 ? "Downed → Downed" : after === 0 ? "Active → Downed" : "Active → Active"}</td></tr>`;
        }),
      )
      .join("");
    const legReview = draft.attackLegs
      .map((leg, index) => {
        const names = leg.map((id) => characterById.get(id)?.name ?? id);
        return `<article class="attack-leg-review" data-attack-leg-review><h3>Leg ${index + 1} · ${index === 0 ? "Initial throw" : "Deflecting Palm redirect"}</h3><p>${names.length > 0 ? names.map(escapeHtml).join(" → ") : "No later bottle contacts."}</p>${index === 1 ? `<p>Original source: ${escapeHtml(sourceName)} · ${attackLabel} · hard maximum range ${attack.rangePaces} paces.</p>` : ""}</article>`;
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
        const details = [
          `Prevents damage and effects for ${protectedCharacter.name}.`,
          reaction.name === "Misty Escape"
            ? `Move ${owner.name} up to 2 paces immediately. Position remains physical.`
            : "",
          reaction.name === "Deflecting Palm"
            ? `The same physical attack is redirected toward ${sourceName}; its original source, profile, and hard maximum range remain unchanged.`
            : "",
          ...warnings,
          selection.override ? selection.override : "",
        ]
          .filter(Boolean)
          .map((detail) => `<li>${escapeHtml(detail)}</li>`)
          .join("");
        return `<article class="reaction-review" data-reaction-review><h3>${escapeHtml(reaction.name)}</h3><p>${escapeHtml(owner.name)} protects ${escapeHtml(protectedCharacter.name)}.</p><ul>${details}</ul></article>`;
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
      return `<label class="contact-control"><input type="checkbox" data-hit-character="${escapeHtml(character.id)}" ${order >= 0 ? "checked" : ""} ${duplicate ? "disabled" : ""}><span>${escapeHtml(character.name)} · ${escapeHtml(character.team)}${duplicate ? ` · Already contacted in Leg ${draft.attackLegs.slice(0, activeLegIndex).findIndex((leg) => leg.includes(character.id)) + 1}` : ""}</span>${order >= 0 ? `<strong>Contact ${order + 1}</strong>` : ""}</label>`;
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
  const ready =
    affectedCharacterIds.length > 0 &&
    Object.values(draft.physicalConfirmations).every(Boolean);
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
    return `<label class="reaction-control${override ? " reaction-override" : ""}"><input type="checkbox" data-reaction-id="${escapeHtml(choice.reactionId)}" data-protected-character="${escapeHtml(choice.protectedCharacterId)}" data-reaction-override="${override}" ${selected ? "checked" : ""}><span><strong>${escapeHtml(reaction.name)}</strong> · ${escapeHtml(owner.name)} protects ${escapeHtml(protectedCharacter.name)}${warning ? `<small>${warning} Override records the referee decision.</small>` : ""}</span></label>`;
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
      ? `<section class="closed-attack-leg" data-closed-attack-leg><h3>Attack Leg 1 closed</h3><p>${draft.attackLegs[0]!.map((id) => escapeHtml(characterById.get(id)?.name ?? id)).join(" → ")}</p></section><section class="redirect-evidence" data-redirect-evidence><h3>Redirected Attack Leg 2</h3><p>Original source: ${escapeHtml(sourceName)} · ${attackLabel} · hard maximum range ${attack.rangePaces} paces. Record every later legal contact; earlier contacts remain unavailable.</p></section>`
      : "";
  return `<section class="match-panel action-draft" aria-labelledby="action-draft-heading"><p class="eyebrow">Action Draft · Physical result</p><h2 id="action-draft-heading">Record Basic Attack</h2><p>This draft stays local until final confirmation.</p>${source}${closedLeg}<fieldset><legend>${activeLegIndex === 0 ? "Ordered bottle contacts" : "Redirected bottle contacts"}</legend><p>Select contacts in their physical order. Allies and the attacker remain valid choices.</p><div class="contact-list">${contacts}</div></fieldset>${reactions}<fieldset><legend>Manual physical confirmations</legend><div class="check-list">${checks}</div></fieldset><div class="match-actions"><button id="review-basic-attack" class="primary-action" type="button" ${ready ? "" : "disabled"}>Review Action Resolution</button><button id="cancel-basic-attack" class="secondary-action" type="button">Cancel draft</button></div></section>`;
}

function undoStatePanel(match: MatchState, attribute: string): string {
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
      return `<tr data-state-character><th scope="row">${escapeHtml(character.name)}</th><td data-label="Team">${escapeHtml(character.team)}</td><td data-label="HP">${entry.hp}/${character.baseHp}</td><td data-label="Slot">${initiative?.slot ?? "—"}</td><td data-label="Roll">${initiative?.roll ?? "—"}</td><td data-label="Modifier">${modifierLabel(initiative?.modifier ?? character.initiativeModifier)}</td><td data-label="Total">${initiative?.total ?? "—"}</td></tr>`;
    })
    .join("");
  const turn =
    match.phase !== "setup"
      ? `<p class="turn-position">Round ${match.round} · Slot ${match.activeSlot}</p><p>Major Action: ${match.majorActionUsed ? "Used" : "Available"}</p><p>Spent Reactions: ${match.spentReactionIds.length > 0 ? match.spentReactionIds.map((id) => escapeHtml(RULESET.reactions.find((reaction) => reaction.id === id)?.name ?? id)).join(", ") : "None"}</p>`
      : `<p class="turn-position">${match.initiative ? "Initiative generated" : "No initiative result"}</p>`;
  return `<article class="undo-state" ${attribute}><h4>${attribute === "data-undo-current" ? "Current committed state" : "State after Undo"}</h4><p>Phase: ${match.phase === "active" ? "Active" : match.phase === "ended" ? "Ended" : "Setup"} · Sequence ${match.sequence}</p>${turn}<p>Team Elimination: ${match.eliminatedTeams.length > 0 ? match.eliminatedTeams.join(", ") : "None"} · Acknowledged: ${match.acknowledgedEliminations.length > 0 ? match.acknowledgedEliminations.join(", ") : "None"} · Outcome: ${match.outcome ?? "None"}</p><p>Match ${escapeHtml(match.matchId)} · Rules ${escapeHtml(match.rulesVersion)}</p><div class="table-wrap"><table class="initiative-table"><caption>Complete character state</caption><thead><tr><th>Character</th><th>Team</th><th>HP</th><th>Slot</th><th>Roll</th><th>Modifier</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function confirmationPanel(): string {
  if (state.confirmation === null) return "";
  if (state.confirmation === "undo") {
    if (state.match === null) return "";
    const preview = getUndoPreview(state.match, state.events);
    if (preview === null) return "";
    const targetLabel = {
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
  }[state.confirmation];
  if (!content) return "";
  return `<section class="confirmation-panel" role="alertdialog" aria-labelledby="confirmation-heading" aria-describedby="confirmation-detail"><div><p class="eyebrow">Confirmation required</p><h3 id="confirmation-heading">${content[0]}</h3><p id="confirmation-detail">${content[1]}</p></div><div class="button-row"><button id="confirm-action" class="danger-action" type="button">${content[2]}</button><button id="cancel-action" class="secondary-action" type="button">Cancel</button></div></section>`;
}

function matchPanel(): string {
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
  return `<section class="match-panel" aria-labelledby="setup-heading"><div class="section-heading"><div><p class="eyebrow">Setup · Sequence ${state.match.sequence}</p><h2 id="setup-heading">Initiative Setup</h2><p>${hasInitiative ? "The complete committed order is ready. Exact ties use recorded digital coin flips." : "All characters start at full HP. Generate the complete order when ready."}</p><div class="rules-context-links">${contextLink}</div></div><span class="readiness-badge" data-state="ready">Saved</span></div>${state.matchError ? `<p class="blocking-error" role="alert">${state.matchError} The last committed Setup remains visible.</p>` : ""}<div class="table-wrap"><table class="initiative-table"><thead><tr><th>Slot</th><th>Character</th><th>Team</th><th>${hasInitiative ? "Roll" : "HP"}</th><th>Modifier</th><th>Total</th><th>Tie break</th></tr></thead><tbody>${rosterRows(state.match)}</tbody></table></div><div class="match-actions">${hasInitiative ? '<button id="start-match" class="primary-action" type="button">Start Match</button><button id="request-reroll" class="secondary-action" type="button">Reroll initiative</button>' : '<button id="generate-initiative" class="primary-action" type="button">Generate initiative</button>'}${canUndo ? '<button id="request-undo" class="secondary-action" type="button">Undo</button>' : ""}<button id="request-discard" class="danger-action" type="button">Discard Match</button></div>${confirmationPanel()}</section>`;
}

function rulesModal(): string {
  if (!rulesUi.open) return "";
  const version = state.match?.rulesVersion ?? RULESET.version;
  const surface = resolveRulesSurface(version);
  if (surface.status === "unavailable") {
    return `<div class="rules-backdrop"><section class="rules-dialog rules-error" role="dialog" aria-modal="true" aria-labelledby="rules-heading"><header class="rules-dialog-header"><div><p class="eyebrow">Rules unavailable</p><h2 id="rules-heading">BOTTLEBOUND Rules</h2><p>Ruleset ${escapeHtml(surface.version)}</p></div><button id="close-rules" class="secondary-action" type="button" aria-label="Close Rules">Close</button></header><p role="alert">${escapeHtml(surface.message)}</p></section></div>`;
  }
  const reference = surface.reference;
  const contents = reference.sections
    .map(
      ({ title, anchor }) =>
        `<li><a href="#${escapeHtml(anchor)}">${escapeHtml(title)}</a></li>`,
    )
    .join("");
  return `<div class="rules-backdrop"><section class="rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-heading"><header class="rules-dialog-header"><div><p class="eyebrow">Ruleset ${escapeHtml(reference.version)}</p><h2 id="rules-heading">BOTTLEBOUND Rules</h2></div><button id="close-rules" class="secondary-action" type="button" aria-label="Close Rules">Close</button></header><div class="rules-scroll"><form class="rules-search" role="search"><label for="rules-search">Search rules</label><input id="rules-search" type="search" autocomplete="off" spellcheck="false" value="${escapeHtml(rulesUi.query)}"></form><section class="rules-results" aria-labelledby="rules-results-heading" aria-live="polite" data-rules-results hidden></section><nav class="rules-contents" aria-labelledby="rules-contents-heading" data-rules-contents><h3 id="rules-contents-heading">Contents</h3><ul class="rules-direct-links"><li><a href="#section-2-teams-roles-hp-basic-attacks" data-rules-source>Roster</a></li><li><a href="#section-15-character-ability-cards" data-rules-source>Abilities</a></li><li><a href="#section-5-core-terms" data-rules-source>Universal rules</a></li><li><a href="#section-16-referee-quick-reference" data-rules-source>Quick reference</a></li></ul><ol>${contents}</ol></nav><article class="rules-document" data-rules-document>${reference.html}</article></div></section></div>`;
}

let focusRulesAfterRender = false;
let revealRulesAnchorAfterRender: string | null = null;

function captureRulesView(): void {
  const search = appRoot.querySelector<HTMLInputElement>("#rules-search");
  const scroll = appRoot.querySelector<HTMLElement>(".rules-scroll");
  if (search) rulesUi.query = search.value;
  if (scroll) rulesUi.scrollTop = scroll.scrollTop;
}

function openRules(opener: HTMLElement, anchor: string | null = null): void {
  const version = state.match?.rulesVersion ?? RULESET.version;
  rulesUi = retainRulesVersion(rulesUi, version);
  rulesUi.open = true;
  rulesUi.openerId = opener.id;
  if (anchor) {
    rulesUi.selectedAnchor = anchor;
    rulesUi.scrollTop = 0;
    revealRulesAnchorAfterRender = anchor;
  }
  focusRulesAfterRender = true;
  render();
}

function closeRules(): void {
  captureRulesView();
  const openerId = rulesUi.openerId;
  rulesUi.open = false;
  render();
  if (openerId) document.getElementById(openerId)?.focus();
}

function restoreRulesView(reference: RulesReference): void {
  const search = appRoot.querySelector<HTMLInputElement>("#rules-search");
  const scroll = appRoot.querySelector<HTMLElement>(".rules-scroll");
  if (!search || !scroll) return;

  updateRulesSearch(reference, rulesUi.query);
  if (rulesUi.selectedAnchor) {
    document
      .getElementById(rulesUi.selectedAnchor)
      ?.setAttribute("data-rules-selected", "");
  }
  if (revealRulesAnchorAfterRender) {
    document
      .getElementById(revealRulesAnchorAfterRender)
      ?.scrollIntoView({ block: "start" });
    rulesUi.scrollTop = scroll.scrollTop;
    revealRulesAnchorAfterRender = null;
  } else {
    scroll.scrollTop = rulesUi.scrollTop;
  }
  if (focusRulesAfterRender) {
    appRoot.querySelector<HTMLElement>("#close-rules")?.focus();
    focusRulesAfterRender = false;
  }
}

function keepFocusInsideRules(event: KeyboardEvent): void {
  if (!rulesUi.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeRules();
    return;
  }
  if (event.key !== "Tab") return;
  const dialog = appRoot.querySelector<HTMLElement>(".rules-dialog");
  if (!dialog) return;
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((control) => control.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function render(): void {
  if (rulesUi.open) captureRulesView();
  rulesUi = retainRulesVersion(
    rulesUi,
    state.match?.rulesVersion ?? RULESET.version,
  );
  const readiness = deriveReadinessState(state);
  const blocked = readiness.matchCreation === "blocked";
  appRoot.innerHTML = `<main class="shell" ${rulesUi.open ? "inert" : ""}><header class="hero"><div class="hero-heading"><div><p class="eyebrow">BOTTLEBOUND</p><h1>Referee Console</h1></div><button id="open-rules" class="secondary-action" type="button">Rules</button></div><p class="lede">Run one reliable initiative order, even after an offline restart.</p></header><details class="panel readiness-panel" open><summary><span><span class="eyebrow">System check</span><strong>Readiness</strong></span><span class="readiness-badge" data-state="${blocked ? "blocked" : "ready"}">${blocked ? "Checks required" : "Storage ready"}</span></summary><dl class="status-grid" aria-live="polite"><div class="status-card" data-status="${readiness.network}"><dt>Network</dt><dd>${statusLabel(readiness.network)}</dd><p>${readiness.network === "online" ? "A network connection is available." : "No network connection. The cached shell can still work."}</p></div><div class="status-card" data-status="${readiness.serviceWorker}"><dt>Service worker</dt><dd>${statusLabel(readiness.serviceWorker)}</dd><p>${readiness.serviceWorker === "controlled" ? "This page uses the installed shell." : "Reload after installation so the service worker can control this page."}</p></div><div class="status-card" data-status="${readiness.offline}"><dt>Offline shell</dt><dd>${statusLabel(readiness.offline)}</dd><p>${readiness.offline === "ready" ? "The required app shell is cached." : "The app shell is not ready for an offline launch yet."}</p></div><div class="status-card" data-status="${readiness.canonicalStorage}"><dt>Canonical storage</dt><dd>${statusLabel(readiness.canonicalStorage)}</dd><p>${state.storageDetail}</p></div></dl></details>${matchPanel()}</main>${rulesModal()}`;
  appRoot
    .querySelector("#basic-attack")
    ?.addEventListener("click", openBasicAttack);
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-hit-character]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const draft = state.actionDraft;
        const characterId = control.dataset.hitCharacter;
        if (!draft || !characterId) return;
        const activeLegIndex = draft.attackLegs.length - 1;
        const activeLeg = draft.attackLegs[activeLegIndex]!;
        draft.attackLegs[activeLegIndex] = control.checked
          ? [...activeLeg, characterId]
          : activeLeg.filter((id) => id !== characterId);
        const affectedCharacterIds = draftAffectedCharacterIds(draft);
        draft.reactions = draft.reactions.filter(({ protectedCharacterId }) =>
          affectedCharacterIds.includes(protectedCharacterId),
        );
        render();
      });
    });
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-reaction-id]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const draft = state.actionDraft;
        const reactionId = control.dataset.reactionId;
        const protectedCharacterId = control.dataset.protectedCharacter;
        if (!draft || !reactionId || !protectedCharacterId) return;
        draft.reactions = draft.reactions.filter(
          (selection) => selection.reactionId !== reactionId,
        );
        if (control.checked) {
          draft.reactions.push({
            reactionId,
            protectedCharacterId,
            override:
              control.dataset.reactionOverride === "true"
                ? "Referee allowed a state-invalid Reaction."
                : null,
          });
          if (
            reactionId === "duergar-monk-deflecting-palm" &&
            draft.attackLegs.length === 1
          ) {
            draft.attackLegs.push([]);
          }
        } else if (
          reactionId === "duergar-monk-deflecting-palm" &&
          draft.attackLegs.length === 2
        ) {
          draft.attackLegs.pop();
        }
        render();
      });
    });
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-physical-check]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const key = control.dataset.physicalCheck as
          PhysicalAttackCheck | undefined;
        if (!state.actionDraft || !key) return;
        state.actionDraft.physicalConfirmations[key] = control.checked;
        render();
      });
    });
  appRoot
    .querySelector("#review-basic-attack")
    ?.addEventListener("click", () => {
      if (!state.actionDraft) return;
      state.actionDraft.step = "review";
      render();
    });
  appRoot.querySelector("#back-to-contacts")?.addEventListener("click", () => {
    if (!state.actionDraft) return;
    state.actionDraft.step = "contacts";
    render();
  });
  appRoot
    .querySelector("#major-action-override")
    ?.addEventListener("change", (event) => {
      if (
        !state.actionDraft ||
        !(event.currentTarget instanceof HTMLInputElement)
      )
        return;
      state.actionDraft.majorActionOverride = event.currentTarget.checked;
      render();
    });
  appRoot
    .querySelector("#cancel-basic-attack")
    ?.addEventListener("click", () => {
      state.actionDraft = null;
      render();
    });
  appRoot
    .querySelector("#confirm-basic-attack")
    ?.addEventListener("click", () => void confirmBasicAttack());
  appRoot
    .querySelectorAll<HTMLElement>("#open-rules, [data-open-rules-anchor]")
    .forEach((control) =>
      control.addEventListener("click", () =>
        openRules(control, control.dataset.openRulesAnchor ?? null),
      ),
    );
  appRoot.querySelector("#close-rules")?.addEventListener("click", closeRules);
  const reference = resolveRulesReference(
    state.match?.rulesVersion ?? RULESET.version,
  );
  const rulesSearch = appRoot.querySelector<HTMLInputElement>("#rules-search");
  if (reference && rulesSearch) {
    appRoot
      .querySelector<HTMLFormElement>(".rules-search")
      ?.addEventListener("submit", (event) => event.preventDefault());
    rulesSearch.addEventListener("input", () => {
      rulesUi.query = rulesSearch.value;
      updateRulesSearch(reference, rulesSearch.value);
    });
    const rulesScroll = appRoot.querySelector<HTMLElement>(".rules-scroll");
    rulesScroll?.addEventListener("scroll", () => {
      rulesUi.scrollTop = rulesScroll.scrollTop;
    });
    rulesScroll?.addEventListener("click", (event) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
          : null;
      const anchor = link?.getAttribute("href")?.slice(1);
      if (!anchor) return;
      const source = document.getElementById(anchor);
      if (!source) return;
      event.preventDefault();
      document
        .querySelector("[data-rules-selected]")
        ?.removeAttribute("data-rules-selected");
      rulesUi.selectedAnchor = anchor;
      source.setAttribute("data-rules-selected", "");
      source.scrollIntoView({ block: "start" });
    });
    restoreRulesView(reference);
  } else if (rulesUi.open && focusRulesAfterRender) {
    appRoot.querySelector<HTMLElement>("#close-rules")?.focus();
    focusRulesAfterRender = false;
  }
  appRoot
    .querySelector("#retry-storage")
    ?.addEventListener("click", () => void runStorageProbe());
  appRoot
    .querySelector("#create-match")
    ?.addEventListener("click", () => void createMatch());
  appRoot
    .querySelector("#generate-initiative")
    ?.addEventListener("click", () => void generate());
  appRoot
    .querySelector("#start-match")
    ?.addEventListener("click", () => void start());
  appRoot
    .querySelector("#finish-turn")
    ?.addEventListener("click", () => void advanceTurn());
  appRoot
    .querySelector("#continue-match")
    ?.addEventListener("click", () => void continueMatch());
  appRoot
    .querySelector<HTMLFormElement>(".simultaneous-ruling")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const outcome = new FormData(form).get("simultaneous-outcome");
      if (outcome !== "Drow" && outcome !== "Duergar" && outcome !== "draw")
        return;
      void recordSimultaneousRuling(outcome);
    });
  appRoot.querySelector("#request-end-game")?.addEventListener("click", () => {
    state.confirmation = "end";
    render();
  });
  appRoot
    .querySelector("#reopen-match")
    ?.addEventListener("click", () => void reopenEndedMatch());
  appRoot
    .querySelector("#request-remove-match")
    ?.addEventListener("click", () => {
      state.confirmation = "remove";
      render();
    });
  appRoot.querySelector("#request-reroll")?.addEventListener("click", () => {
    state.confirmation = "reroll";
    render();
  });
  appRoot.querySelector("#request-discard")?.addEventListener("click", () => {
    state.confirmation = "discard";
    render();
  });
  appRoot.querySelector("#request-undo")?.addEventListener("click", () => {
    state.confirmation = "undo";
    render();
  });
  appRoot.querySelector("#cancel-action")?.addEventListener("click", () => {
    state.confirmation = null;
    render();
  });
  appRoot
    .querySelector("#confirm-action")
    ?.addEventListener("click", () => void confirmAction());
}

async function commitResult(result: CommandResult): Promise<boolean> {
  state.saving = true;
  state.matchError = null;
  render();
  try {
    await matchStore.commit(result.event, result.state);
    state.match = result.state;
    state.events = [...state.events, result.event];
    return true;
  } catch {
    state.matchError = "Canonical storage could not commit the command.";
    return false;
  } finally {
    state.saving = false;
    render();
  }
}
function openBasicAttack(): void {
  if (
    state.match?.phase !== "active" ||
    state.match.rulesVersion !== RULESET.version
  )
    return;
  const sourceCharacterId =
    state.match.initiative[state.match.activeSlot - 1]?.characterId;
  if (!sourceCharacterId) return;
  state.actionDraft = {
    sourceCharacterId,
    rulesVersion: state.match.rulesVersion,
    step: "contacts",
    attackLegs: [[]],
    physicalConfirmations: {
      range: false,
      "line-of-sight": false,
      "legal-bottle-contact": false,
      "terrain-contact": false,
    },
    reactions: [],
    majorActionOverride: false,
  };
  render();
}
async function confirmBasicAttack(): Promise<void> {
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
async function createMatch(): Promise<void> {
  await commitResult(
    createSetup(crypto.randomUUID(), new Date().toISOString()),
  );
}
async function generate(): Promise<void> {
  if (state.match?.phase === "setup")
    await commitResult(
      generateInitiative(
        state.match,
        cryptoRandomSource,
        new Date().toISOString(),
      ),
    );
}
async function start(): Promise<void> {
  if (state.match?.phase === "setup") {
    await commitResult(startMatch(state.match, new Date().toISOString()));
  }
}
async function advanceTurn(): Promise<void> {
  if (state.match?.phase === "active") {
    await commitResult(finishTurn(state.match, new Date().toISOString()));
  }
}
async function continueMatch(): Promise<void> {
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
async function recordSimultaneousRuling(
  outcome: "Drow" | "Duergar" | "draw",
): Promise<void> {
  if (
    state.match?.phase !== "active" ||
    state.match.eliminatedTeams.length !== 2 ||
    state.match.outcome !== null
  )
    return;
  await commitResult(
    ruleSimultaneousElimination(
      state.match,
      outcome,
      "The authoritative rules do not define simultaneous Team Elimination; the referee selected this recorded override.",
      new Date().toISOString(),
    ),
  );
}
async function reopenEndedMatch(): Promise<void> {
  if (state.match?.phase !== "ended") return;
  await commitResult(reopenMatch(state.match, new Date().toISOString()));
}
async function confirmAction(): Promise<void> {
  if (state.match === null || !state.confirmation) return;
  const confirmation = state.confirmation;
  state.confirmation = null;
  if (confirmation === "undo") {
    await commitResult(
      undoLastEvent(state.match, state.events, new Date().toISOString(), true),
    );
    return;
  }
  if (confirmation === "end" && state.match.phase === "active") {
    await commitResult(endMatch(state.match, new Date().toISOString(), true));
    return;
  }
  if (confirmation === "remove" && state.match.phase === "ended") {
    state.saving = true;
    render();
    try {
      await matchStore.deleteMatch(state.match.matchId, true);
      state.match = null;
      state.events = [];
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
      rerollInitiative(
        state.match,
        cryptoRandomSource,
        new Date().toISOString(),
        true,
      ),
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
  } catch {
    state.matchError = "Canonical storage could not discard the Match.";
  } finally {
    state.saving = false;
    render();
  }
}
async function restoreMatch(): Promise<void> {
  try {
    const restored = await matchStore.restore();
    state.match = restored?.state ?? null;
    state.events = restored?.events ?? [];
    state.matchError = null;
  } catch {
    state.match = null;
    state.events = [];
    state.matchError =
      "Saved canonical data is incompatible, incomplete, or structurally invalid.";
  } finally {
    state.matchLoaded = true;
    render();
  }
}
async function runStorageProbe(): Promise<void> {
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

function checkCachedShell(worker: ServiceWorker): void {
  const channel = new MessageChannel();
  const timeout = window.setTimeout(() => {
    state.appShellCache = "failed";
    render();
  }, 3_000);
  channel.port1.addEventListener(
    "message",
    (event: MessageEvent<{ type?: string; ready?: boolean }>) => {
      window.clearTimeout(timeout);
      state.appShellCache =
        event.data.type === "APP_SHELL_STATUS" && event.data.ready
          ? "ready"
          : "failed";
      render();
    },
    { once: true },
  );
  channel.port1.start();
  worker.postMessage({ type: "CHECK_APP_SHELL" }, [channel.port2]);
}
async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    state.serviceWorker = "unsupported";
    state.appShellCache = "failed";
    render();
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      state.serviceWorker = "controlled";
      checkCachedShell(controller);
      render();
      return;
    }
    state.serviceWorker = registration.active ? "waiting" : "registering";
    render();
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        const nextController = navigator.serviceWorker.controller;
        if (nextController) {
          state.serviceWorker = "controlled";
          checkCachedShell(nextController);
          render();
        }
      },
      { once: true },
    );
  } catch {
    state.serviceWorker = "failed";
    state.appShellCache = "failed";
    render();
  }
}

window.addEventListener("online", () => {
  state.network = "online";
  render();
});
window.addEventListener("offline", () => {
  state.network = "offline";
  render();
});
document.addEventListener("keydown", keepFocusInsideRules);
render();
void runStorageProbe();
void registerServiceWorker();
