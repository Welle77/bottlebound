import {
  getProtectiveReactionChoices,
  type AbilityInput,
  type MatchState,
} from "../domain/match";
import { resolveAttackDamageAgainstCharacter } from "../domain/match-ability-effects";
import {
  RULESET,
  type PhysicalAttackCheck,
  type StructuredAbility,
} from "../domain/ruleset";
import {
  characterNameHtml,
  contextualRulesControl,
  escapeHtml,
} from "./format";
import { state, type ActionDraft } from "./shell-state";

type ActiveView = Extract<MatchState, { readonly phase: "active" }>;

function activeCharacterIdOf(match: ActiveView): string | undefined {
  return match.initiative[match.activeSlot - 1]?.characterId;
}

export function rulesCharacterOf(characterId: string) {
  const character = RULESET.characters.find(({ id }) => id === characterId);
  if (!character) throw new Error("The Match references an unknown character.");
  return character;
}

function hpByIdMap(match: ActiveView): ReadonlyMap<string, number> {
  return new Map(
    match.characters.map(({ characterId, hp }) => [characterId, hp]),
  );
}

function currentMaxHpOf(match: ActiveView, characterId: string): number {
  const entry = match.characters.find(
    ({ characterId: id }) => id === characterId,
  );
  return entry?.currentMaxHp ?? rulesCharacterOf(characterId).baseHp;
}

/** The active character's unspent, non-Reaction abilities from the Ruleset. */
export function unspentAbilities(
  match: ActiveView,
): readonly StructuredAbility[] {
  const activeCharacterId = activeCharacterIdOf(match);
  return RULESET.abilities.filter(
    (ability) =>
      ability.ownerCharacterId === activeCharacterId &&
      ability.actionType !== "reaction" &&
      !match.spentAbilityIds.includes(ability.id),
  );
}

function abilityOf(draft: ActionDraft): StructuredAbility {
  const ability = RULESET.abilities.find(({ id }) => id === draft.abilityId);
  if (!ability)
    throw new Error("The Action Draft references an unknown ability.");
  return ability;
}

/**
 * Maps an Ability Action Draft onto the single mutation path's input shape.
 * Physical confirmations reuse the T02 toggle-aware draft values; Reactions
 * and overrides pass through unchanged.
 */
export function buildAbilityInput(draft: ActionDraft): AbilityInput {
  const ability = abilityOf(draft);
  const toDomain = (key: PhysicalAttackCheck): boolean =>
    draft.physicalConfirmations[key];
  return {
    abilityId: ability.id,
    targetCharacterIds:
      ability.interaction === "self" ? undefined : [...draft.targets],
    attackLegs:
      ability.interaction === "physical-attack"
        ? draft.attackLegs.map((affectedCharacterIds) => ({
            affectedCharacterIds: [...affectedCharacterIds],
          }))
        : undefined,
    physicalConfirmations:
      ability.interaction === "physical-attack"
        ? {
            range: toDomain("range"),
            lineOfSight: toDomain("line-of-sight"),
            legalBottleContact: toDomain("legal-bottle-contact"),
            terrainContact: toDomain("terrain-contact"),
          }
        : undefined,
    reactions:
      draft.reactions.length > 0
        ? draft.reactions.map(
            ({ reactionId, protectedCharacterId, override }) => ({
              reactionId,
              protectedCharacterId,
              override,
            }),
          )
        : undefined,
    majorActionOverride: draft.majorActionOverride
      ? "Referee confirmed a second Major Action this turn."
      : null,
    abilityOverride: draft.abilityOverride
      ? "The referee recorded an Override for this state-invalid ability choice."
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Ability list                                                        */
/* ------------------------------------------------------------------ */

export function abilityListPanel(match: ActiveView): string {
  if (!state.current.abilityPickerOpen || state.current.actionDraft) return "";
  const activeRules = rulesCharacterOf(activeCharacterIdOf(match) ?? "");
  const abilities = unspentAbilities(match);
  const cards = abilities
    .map(
      (ability) =>
        `<article class="ability-option" data-ability-option><div><h3>${escapeHtml(ability.name)}</h3><p class="ability-meta">${escapeHtml(ability.actionType === "powerful" ? "Powerful Ability" : "Standard Ability")} · Range ${escapeHtml(ability.range)}${ability.targetPolicy.lifeState === "active" ? " · Active targets" : ""}</p><p class="ability-effect">${escapeHtml(ability.rulesText)}</p></div><div class="match-actions">${contextualRulesControl(`rules-ability-${escapeHtml(ability.id)}`, `${escapeHtml(ability.name)} rules`, ability.sourceAnchor)}<button class="secondary-action" type="button" data-open-ability="${escapeHtml(ability.id)}">Use ${escapeHtml(ability.name)}</button></div></article>`,
    )
    .join("");
  const list =
    cards ||
    `<p class="ability-empty" role="status">Every non-Reaction Ability of ${characterNameHtml(activeRules, match.displayNames)} is spent. Reactions stay available inside Basic Attack drafts.</p>`;
  return `<section class="match-panel ability-list" aria-labelledby="ability-list-heading"><p class="eyebrow">Use Ability</p><h2 id="ability-list-heading">Choose an Ability</h2><p>Unspent Abilities of ${characterNameHtml(activeRules, match.displayNames)}. Each Ability may be used once per Match.</p><div class="ability-option-list">${list}</div><div class="match-actions"><button id="close-ability-picker" class="secondary-action" type="button">Back</button></div></section>`;
}

/* ------------------------------------------------------------------ */
/* Shared fragments                                                    */
/* ------------------------------------------------------------------ */

function profileBlock(
  ability: StructuredAbility,
  sourceNameHtml: string,
): string {
  return `<div class="attack-profile"><p><strong>Source:</strong> ${sourceNameHtml}</p><p><strong>Ability:</strong> ${escapeHtml(ability.name)} · ${escapeHtml(ability.actionType === "powerful" ? "Powerful" : "Standard")}</p><p><strong>Range:</strong> ${escapeHtml(ability.range)}</p><p><strong>Effect:</strong> ${escapeHtml(ability.rulesText)}</p>${contextualRulesControl(`rules-ability-draft-${escapeHtml(ability.id)}`, `${escapeHtml(ability.name)} rules`, ability.sourceAnchor)}</div>`;
}

interface DraftView {
  readonly match: ActiveView;
  readonly draft: ActionDraft;
}

function reactionChoiceHtml(
  view: DraftView,
  choice: ReturnType<typeof getProtectiveReactionChoices>[number],
  override: boolean,
): string {
  const { match, draft } = view;
  const reaction = RULESET.reactions.find(({ id }) => id === choice.reactionId);
  const owner = reaction
    ? rulesCharacterOf(reaction.ownerCharacterId)
    : undefined;
  const protectedCharacter = rulesCharacterOf(choice.protectedCharacterId);
  if (!reaction || !owner) return "";
  const selected = draft.reactions.some(
    ({ reactionId, protectedCharacterId }) =>
      reactionId === choice.reactionId &&
      protectedCharacterId === choice.protectedCharacterId,
  );
  const warning = choice.warnings.map(escapeHtml).join(" ");
  return `<label class="reaction-control${override ? " reaction-override" : ""}"><input type="checkbox" data-reaction-id="${escapeHtml(choice.reactionId)}" data-protected-character="${escapeHtml(choice.protectedCharacterId)}" data-reaction-override="${override}" ${selected ? "checked" : ""}><span><strong>${escapeHtml(reaction.name)}</strong> · ${characterNameHtml(owner, match.displayNames)} protects ${characterNameHtml(protectedCharacter, match.displayNames)}${warning ? `<small>${warning} Override records the referee decision.</small>` : ""}</span></label>`;
}

function reactionFieldset(
  match: ActiveView,
  draft: ActionDraft,
  affectedCharacterIds: readonly string[],
): string {
  if (affectedCharacterIds.length === 0) return "";
  const view: DraftView = { match, draft };
  const choices = getProtectiveReactionChoices(match, affectedCharacterIds);
  const eligibleChoices = choices
    .filter(({ eligible }) => eligible)
    .map((choice) => reactionChoiceHtml(view, choice, false))
    .join("");
  const overrideChoices = choices
    .filter(({ eligible }) => !eligible)
    .map((choice) => reactionChoiceHtml(view, choice, true))
    .join("");
  return `<fieldset><legend>Protective Reactions</legend><p>Select at most one protected character for each reacting character.</p><div class="reaction-list">${eligibleChoices || "<p>No state-eligible Reactions.</p>"}</div>${overrideChoices ? `<details class="reaction-overrides"><summary>Override unavailable Reactions</summary><p>These choices have state warnings. Selection records an Override.</p><div class="reaction-list">${overrideChoices}</div></details>` : ""}</fieldset>`;
}

const CHECK_LABELS: readonly (readonly [PhysicalAttackCheck, string])[] = [
  ["range", "Range is legal"],
  ["line-of-sight", "Line of Sight is legal"],
  ["legal-bottle-contact", "Every selected bottle was physically hit"],
  ["terrain-contact", "Terrain contact was resolved"],
];

function checksFieldset(draft: ActionDraft): string {
  if (!state.current.requirePhysicalConfirmations) return "";
  const checks = CHECK_LABELS.map(
    ([key, label]) =>
      `<label class="check-control"><input type="checkbox" data-physical-check="${key}" ${draft.physicalConfirmations[key] ? "checked" : ""}> ${escapeHtml(label)}</label>`,
  ).join("");
  return `<fieldset><legend>Manual physical confirmations</legend><div class="check-list">${checks}</div></fieldset>`;
}

/* ------------------------------------------------------------------ */
/* Warnings and Override prompts                                       */
/* ------------------------------------------------------------------ */

interface TargetCandidate {
  readonly characterId: string;
  readonly blocked: boolean;
  readonly reasons: readonly string[];
}

function reviveBlockedOnEliminatedTeam(
  match: ActiveView,
  ability: StructuredAbility,
  targetCharacterId: string,
): boolean {
  if (ability.name !== "Revivify" && ability.name !== "Lay on Hands")
    return false;
  const hp = hpByIdMap(match).get(targetCharacterId) ?? 0;
  if (hp !== 0) return false;
  return match.eliminatedTeams.includes(
    rulesCharacterOf(targetCharacterId).team,
  );
}

function targetCandidates(
  match: ActiveView,
  ability: StructuredAbility,
): readonly TargetCandidate[] {
  const hpById = hpByIdMap(match);
  const ownerTeam = rulesCharacterOf(ability.ownerCharacterId).team;
  return RULESET.characters.map((character) => {
    const hp = hpById.get(character.id) ?? 0;
    const relation = ability.targetPolicy.relation;
    const lifeState = ability.targetPolicy.lifeState;
    const reasons: readonly string[] = [
      ...(relation === "enemy" && character.team === ownerTeam
        ? ["Enemies only"]
        : []),
      ...(relation === "ally" && character.team !== ownerTeam
        ? ["Allies only"]
        : []),
      ...(lifeState === "active" && hp === 0 ? ["Active characters only"] : []),
      ...(lifeState === "downed" && hp !== 0 ? ["Downed characters only"] : []),
    ];
    const blocked = reviveBlockedOnEliminatedTeam(match, ability, character.id);
    return {
      characterId: character.id,
      blocked,
      reasons: blocked
        ? ["That team is permanently eliminated; revival cannot restore it"]
        : reasons,
    };
  });
}

/**
 * Collects every condition that requires a recorded Override before this
 * draft may commit. The list mirrors the domain's overridable validation
 * outcomes so the referee sees the exact reason before confirming.
 */
function draftWarnings(
  match: ActiveView,
  draft: ActionDraft,
  ability: StructuredAbility,
): readonly string[] {
  const hpById = hpByIdMap(match);
  const ownerTeam = rulesCharacterOf(ability.ownerCharacterId).team;
  const targetWarnings: readonly string[] = draft.targets.flatMap(
    (targetCharacterId) => {
      const character = rulesCharacterOf(targetCharacterId);
      const nameHtml = characterNameHtml(character, match.displayNames);
      const hp = hpById.get(targetCharacterId) ?? 0;
      return [
        ...(ability.targetPolicy.relation === "enemy" &&
        character.team === ownerTeam
          ? [
              `invalid-target-relation — ${nameHtml} is not an enemy. Confirming records an Override.`,
            ]
          : []),
        ...(ability.targetPolicy.relation === "ally" &&
        character.team !== ownerTeam
          ? [
              `invalid-target-relation — ${nameHtml} is not an ally. Confirming records an Override.`,
            ]
          : []),
        ...(ability.targetPolicy.lifeState === "active" && hp === 0
          ? [
              `invalid-target-life-state — ${nameHtml} is Downed. Confirming records an Override.`,
            ]
          : []),
        ...(ability.targetPolicy.lifeState === "downed" && hp !== 0
          ? [
              `invalid-target-life-state — ${nameHtml} is Active. Confirming records an Override.`,
            ]
          : []),
      ];
    },
  );
  return [
    ...(draft.sourceCharacterId !== activeCharacterIdOf(match)
      ? [
          "wrong-active-character — the Active Character changed since this draft opened. Confirming records an Override.",
        ]
      : []),
    ...(match.spentAbilityIds.includes(ability.id)
      ? [
          "ability-already-spent — this Ability was already used this Match. Confirming records an Override.",
        ]
      : []),
    ...targetWarnings,
    ...(draft.overrideRequired
      ? [
          `${escapeHtml(draft.overrideRequired)} — the resolution needs a recorded Override. Tick the checkbox below and confirm again.`,
        ]
      : []),
  ];
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

function targetingPanel(match: ActiveView, ability: StructuredAbility): string {
  const draft = state.current.actionDraft!;
  const single = ability.targetPolicy.cardinality !== "all-in-range";
  const candidates = targetCandidates(match, ability);
  const hpById = hpByIdMap(match);
  const rowOf = (candidate: TargetCandidate): string => {
    const character = rulesCharacterOf(candidate.characterId);
    const selected = draft.targets.includes(candidate.characterId);
    return `<label class="contact-control"><input type="checkbox" data-ability-target="${escapeHtml(candidate.characterId)}" data-ability-target-override="${!candidate.blocked && candidate.reasons.length > 0}" ${selected ? "checked" : ""} ${candidate.blocked ? "disabled" : ""}><span>${characterNameHtml(character, match.displayNames)} · ${escapeHtml(character.team)} · HP ${hpById.get(candidate.characterId) ?? 0}/${currentMaxHpOf(match, candidate.characterId)}${candidate.reasons.length > 0 ? `<small>${escapeHtml(candidate.reasons.join(" · "))}. Selecting records an Override.</small>` : ""}</span></label>`;
  };
  const eligible = candidates
    .filter((candidate) => !candidate.blocked && candidate.reasons.length === 0)
    .map(rowOf)
    .join("");
  const overridden = candidates
    .filter((candidate) => !candidate.blocked && candidate.reasons.length > 0)
    .map(rowOf)
    .join("");
  const blockedCount = candidates.filter(
    (candidate) => candidate.blocked,
  ).length;
  const continueLabel =
    ability.interaction === "targeted-attack"
      ? "Choose Reactions"
      : "Review Action Resolution";
  const ready = single ? draft.targets.length === 1 : draft.targets.length >= 1;
  return `<section class="match-panel action-draft ability-draft" aria-labelledby="ability-draft-heading"><p class="eyebrow">Use Ability · Choose target</p><h2 id="ability-draft-heading">${escapeHtml(ability.name)}</h2>${profileBlock(ability, characterNameHtml(rulesCharacterOf(draft.sourceCharacterId), match.displayNames))}<fieldset><legend>${single ? "Exactly one target" : "Targets in range"}</legend><p>Selections are filtered by the ability's target policy: ${escapeHtml(ability.targetPolicy.relation)} · ${escapeHtml(ability.targetPolicy.lifeState)}.</p><div class="contact-list" data-eligible-targets>${eligible || "<p>No state-eligible targets.</p>"}</div></fieldset>${overridden ? `<details class="target-overrides"><summary>Override unavailable targets</summary><p>These choices violate the target policy. Selection records an Override.</p><div class="contact-list" data-override-targets>${overridden}</div></details>` : ""}${blockedCount > 0 ? `<p class="device-note">${blockedCount} Downed character${blockedCount === 1 ? "" : "s"} of an eliminated team cannot be revived and remain unavailable.</p>` : ""}<div class="match-actions"><button id="ability-targets-continue" class="primary-action" type="button" ${ready ? "" : "disabled"}>${continueLabel}</button><button id="cancel-ability" class="secondary-action" type="button">Cancel draft</button></div></section>`;
}

function reactionsPanel(match: ActiveView, ability: StructuredAbility): string {
  const draft = state.current.actionDraft!;
  return `<section class="match-panel action-draft ability-draft" aria-labelledby="ability-draft-heading"><p class="eyebrow">Use Ability · Reactions</p><h2 id="ability-draft-heading">${escapeHtml(ability.name)}</h2>${profileBlock(ability, characterNameHtml(rulesCharacterOf(draft.sourceCharacterId), match.displayNames))}${reactionFieldset(match, draft, draft.targets)}<div class="match-actions"><button id="review-ability" class="primary-action" type="button">Review Action Resolution</button><button id="back-to-ability-targets" class="secondary-action" type="button">Back</button><button id="cancel-ability" class="secondary-action" type="button">Cancel draft</button></div></section>`;
}

function physicalContactsPanel(
  match: ActiveView,
  ability: StructuredAbility,
): string {
  const draft = state.current.actionDraft!;
  const activeLegIndex = draft.attackLegs.length - 1;
  const activeLeg = draft.attackLegs[activeLegIndex]!;
  const closedCharacterIds = new Set(
    draft.attackLegs.slice(0, activeLegIndex).flatMap((leg) => leg),
  );
  const contacts = RULESET.characters.map((character) => {
    const order = activeLeg.indexOf(character.id);
    const duplicate = closedCharacterIds.has(character.id);
    return `<label class="contact-control"><input type="checkbox" data-hit-character="${escapeHtml(character.id)}" ${order >= 0 ? "checked" : ""} ${duplicate ? "disabled" : ""}><span>${characterNameHtml(character, match.displayNames)} · ${escapeHtml(character.team)}${duplicate ? ` · Already contacted in Leg ${draft.attackLegs.slice(0, activeLegIndex).findIndex((leg) => leg.includes(character.id)) + 1}` : ""}</span>${order >= 0 ? `<strong>Contact ${order + 1}</strong>` : ""}</label>`;
  });
  const closedLeg =
    activeLegIndex === 1
      ? `<section class="closed-attack-leg" data-closed-attack-leg><h3>Attack Leg 1 closed</h3><p>${draft.attackLegs[0]!.map((id) => characterNameHtml(rulesCharacterOf(id), match.displayNames)).join(" → ")}</p></section><section class="redirect-evidence" data-redirect-evidence><h3>Redirected Attack Leg 2</h3><p>Original source: ${characterNameHtml(rulesCharacterOf(draft.sourceCharacterId), match.displayNames)} · ${escapeHtml(ability.name)} · hard maximum range ${escapeHtml(ability.range)}. Record every later legal contact; earlier contacts remain unavailable.</p></section>`
      : "";
  const ready =
    activeLeg.length > 0 &&
    (!state.current.requirePhysicalConfirmations ||
      Object.values(draft.physicalConfirmations).every(Boolean));
  return `<section class="match-panel action-draft ability-draft" aria-labelledby="ability-draft-heading"><p class="eyebrow">Use Ability · Physical result</p><h2 id="ability-draft-heading">Record ${escapeHtml(ability.name)}</h2><p>This draft stays local until final confirmation.</p>${profileBlock(ability, characterNameHtml(rulesCharacterOf(draft.sourceCharacterId), match.displayNames))}${closedLeg}<fieldset><legend>${activeLegIndex === 0 ? "Ordered bottle contacts" : "Redirected bottle contacts"}</legend><p>Select contacts in their physical order. Allies and the attacker remain valid choices.</p><div class="contact-list">${contacts.join("")}</div></fieldset>${reactionFieldset(match, draft, draft.attackLegs.flat())}${checksFieldset(draft)}<div class="match-actions"><button id="review-ability" class="primary-action" type="button" ${ready ? "" : "disabled"}>Review Action Resolution</button><button id="cancel-ability" class="secondary-action" type="button">Cancel draft</button></div></section>`;
}

interface HitRowContext {
  readonly match: ActiveView;
  readonly draft: ActionDraft;
  readonly ability: StructuredAbility;
}

interface AttackPreviewContext {
  readonly match: ActiveView;
  readonly draft: ActionDraft;
  /** Printed damage before effect modification (Basic Attacks and abilities both print 1). */
  readonly baseDamage: number;
  /** Physical throws cannot affect a Vanish-protected character. */
  readonly physicalAttack: boolean;
}

/**
 * One "Ordered hits and final changes" review row computed through the same
 * shared damage pipeline the confirm path uses
 * (resolveAttackDamageAgainstCharacter), so Review shows exactly the finalized
 * damage and effect consumption that confirming records. Consumed effects are
 * named; a Vanish that zeroed the damage is noted as retained.
 */
export function attackPreviewRow(
  { match, draft, baseDamage, physicalAttack }: AttackPreviewContext,
  characterId: string,
  contactLabel: string,
): string {
  const character = rulesCharacterOf(characterId);
  const hp = hpByIdMap(match).get(characterId) ?? 0;
  const prevented = draft.reactions.some(
    ({ protectedCharacterId }) => protectedCharacterId === characterId,
  );
  // The commit path resolves with the next sequence number; previews never
  // render the hex movement cap it can attach.
  const resolved = resolveAttackDamageAgainstCharacter({
    baseDamage,
    affectedCharacterId: characterId,
    physicalAttack,
    prevented,
    activeEffects: match.activeEffects,
    sequence: match.sequence + 1,
  });
  const damage = resolved.finalDamage;
  const after = Math.max(0, hp - damage);
  const consumedNames = [
    ...new Set(
      resolved.expired.map(
        ({ abilityId }) =>
          RULESET.abilities.find(({ id }) => id === abilityId)?.name ??
          abilityId,
      ),
    ),
  ];
  const vanishRetained =
    damage === 0 &&
    !prevented &&
    physicalAttack &&
    match.activeEffects.some(
      (effect) =>
        effect.kind === "vanish" && effect.affectedCharacterId === characterId,
    );
  const notes = [
    ...consumedNames.map((name) => `${name} consumed`),
    ...(vanishRetained ? ["Vanish retained"] : []),
  ]
    .map(escapeHtml)
    .join(" · ");
  return `<tr data-action-review-hit><td>${escapeHtml(contactLabel)}</td><th scope="row">${characterNameHtml(character, match.displayNames)}</th><td>${escapeHtml(character.team)}</td><td>${damage}${damage === 0 ? " (prevented)" : ""}${notes ? ` · ${notes}` : ""}</td><td>${hp} → ${after}</td><td>${hp === 0 ? "Downed → Downed" : after === 0 ? "Active → Downed" : "Active → Active"}</td></tr>`;
}

function hitPreviewRow(
  { match, draft, ability }: HitRowContext,
  characterId: string,
  contactLabel: string,
): string {
  return attackPreviewRow(
    {
      match,
      draft,
      baseDamage: 1,
      physicalAttack: ability.interaction === "physical-attack",
    },
    characterId,
    contactLabel,
  );
}

function effectPreviewRow(
  match: ActiveView,
  ability: StructuredAbility,
  characterId: string,
): string {
  const character = rulesCharacterOf(characterId);
  const hp = hpByIdMap(match).get(characterId) ?? 0;
  const heals =
    ability.name === "Nature’s Renewal" ||
    ability.name === "Inspiring Words" ||
    ability.name === "Second Wind" ||
    ability.name === "Shapeshift";
  const revives =
    (ability.name === "Lay on Hands" && hp === 0) ||
    ability.name === "Revivify";
  const after = revives
    ? 1
    : heals
      ? Math.min(
          ability.name === "Shapeshift"
            ? 4
            : currentMaxHpOf(match, characterId),
          hp + 1,
        )
      : hp;
  const label = revives ? "Revived" : heals ? "+1 HP" : "No HP change";
  return `<tr data-ability-review-change><th scope="row">${characterNameHtml(character, match.displayNames)}</th><td>${escapeHtml(character.team)}</td><td>${escapeHtml(label)}</td><td>${hp} → ${after}</td><td>${after === 0 ? "Downed" : "Active"}</td></tr>`;
}

function reviewPanel(match: ActiveView, ability: StructuredAbility): string {
  const draft = state.current.actionDraft!;
  const sourceNameHtml = characterNameHtml(
    rulesCharacterOf(draft.sourceCharacterId),
    match.displayNames,
  );
  const attacks =
    ability.interaction === "targeted-attack" ||
    ability.interaction === "physical-attack";
  const hitContext: HitRowContext = { match, draft, ability };
  const hitRows = attacks
    ? (ability.interaction === "physical-attack"
        ? draft.attackLegs.flatMap((leg, legIndex) =>
            leg.map((characterId, contactIndex) => ({
              characterId,
              label: `${legIndex + 1}.${contactIndex + 1}`,
            })),
          )
        : draft.targets.map((characterId) => ({
            characterId,
            label: "1.1",
          }))
      )
        .map(({ characterId, label }) =>
          hitPreviewRow(hitContext, characterId, label),
        )
        .join("")
    : "";
  const changeRows =
    attacks || (draft.targets.length === 0 && ability.interaction !== "self")
      ? ""
      : (ability.interaction === "self"
          ? [ability.ownerCharacterId]
          : draft.targets
        )
          .map((characterId) => effectPreviewRow(match, ability, characterId))
          .join("");
  const legsReview = draft.attackLegs
    .filter((leg) => leg.length > 0 || draft.attackLegs.length > 1)
    .map((leg, index) => {
      const names = leg.map((id) =>
        characterNameHtml(rulesCharacterOf(id), match.displayNames),
      );
      return `<article class="attack-leg-review" data-attack-leg-review><h3>Leg ${index + 1} · ${index === 0 ? "Initial throw" : "Deflecting Palm redirect"}</h3><p>${names.length > 0 ? names.join(" → ") : "No later bottle contacts."}</p>${index === 1 ? `<p>Original source: ${sourceNameHtml} · ${escapeHtml(ability.name)} · hard maximum range ${escapeHtml(ability.range)}.</p>` : ""}</article>`;
    })
    .join("");
  const reactionReviews = draft.reactions
    .map((selection) => {
      const reaction = RULESET.reactions.find(
        ({ id }) => id === selection.reactionId,
      );
      const owner = reaction
        ? rulesCharacterOf(reaction.ownerCharacterId)
        : undefined;
      const protectedCharacter = rulesCharacterOf(
        selection.protectedCharacterId,
      );
      if (!reaction || !owner) return "";
      const details = [
        `Prevents damage and effects for ${protectedCharacter.name}.`,
        reaction.name === "Misty Escape"
          ? `Move ${owner.name} up to 2 paces immediately. Position remains physical.`
          : "",
        reaction.name === "Deflecting Palm"
          ? `The same physical attack is redirected toward ${rulesCharacterOf(draft.sourceCharacterId).name}; its original source, profile, and hard maximum range remain unchanged.`
          : "",
        selection.override ? selection.override : "",
      ]
        .filter(Boolean)
        .map((detail) => `<li>${escapeHtml(detail)}</li>`)
        .join("");
      return `<article class="reaction-review" data-reaction-review><h3>${escapeHtml(reaction.name)}</h3><p>${characterNameHtml(owner, match.displayNames)} protects ${characterNameHtml(protectedCharacter, match.displayNames)}.</p><ul>${details}</ul></article>`;
    })
    .join("");
  const warnings = draftWarnings(match, draft, ability);
  const needsAbilityOverride = warnings.length > 0;
  const needsMajorOverride =
    match.majorActionUsed && !draft.majorActionOverride;
  const ready = !needsAbilityOverride || draft.abilityOverride;
  const backStep =
    ability.interaction === "physical-attack"
      ? "contacts"
      : ability.interaction === "targeted-attack"
        ? "reactions"
        : "select-target";
  const backButton =
    backStep === "contacts"
      ? '<button id="back-to-contacts" class="secondary-action" type="button">Back</button>'
      : backStep === "reactions"
        ? '<button id="back-to-ability-reactions" class="secondary-action" type="button">Back</button>'
        : '<button id="back-to-ability-targets" class="secondary-action" type="button">Back</button>';
  return `<section class="match-panel action-draft ability-draft" aria-labelledby="ability-draft-heading"><p class="eyebrow">Use Ability · Review</p><h2 id="ability-draft-heading">Review ${escapeHtml(ability.name)}</h2>${profileBlock(ability, sourceNameHtml)}${legsReview ? `<section aria-labelledby="ability-legs-heading"><h3 id="ability-legs-heading">Ordered Attack Legs</h3><div class="attack-leg-review-list">${legsReview}</div></section>` : ""}${hitRows ? `<div class="table-wrap"><table class="initiative-table"><caption>Ordered hits and final changes</caption><thead><tr><th>Contact</th><th>Character</th><th>Team</th><th>Damage</th><th>HP</th><th>Downed</th></tr></thead><tbody>${hitRows}</tbody></table></div>` : ""}${changeRows ? `<div class="table-wrap"><table class="initiative-table"><caption>Expected changes</caption><thead><tr><th>Character</th><th>Team</th><th>Effect</th><th>HP</th><th>State</th></tr></thead><tbody>${changeRows}</tbody></table></div>` : ""}${reactionReviews ? `<section aria-labelledby="ability-reaction-review-heading"><h3 id="ability-reaction-review-heading">Reactions and objective operations</h3><div class="reaction-review-list">${reactionReviews}</div></section>` : "<p>No Reactions apply in this resolution.</p>"}${match.majorActionUsed ? `<label class="override-control"><input id="major-action-override" type="checkbox" ${draft.majorActionOverride ? "checked" : ""}> Record referee override for a second Major Action this turn</label>` : ""}${needsAbilityOverride ? `<div class="draft-warning" role="alert">${warnings.map((warning) => `<p>${warning}</p>`).join("")}<label class="override-control"><input id="ability-override" type="checkbox" ${draft.abilityOverride ? "checked" : ""}> Record referee Override for this Ability choice</label></div>` : ""}<div class="match-actions"><button id="confirm-ability" class="primary-action" type="button" ${ready && !needsMajorOverride ? "" : "disabled"}>${state.current.saving ? "Saving…" : "Confirm Action Resolution"}</button>${backButton}<button id="cancel-ability" class="secondary-action" type="button">Cancel draft</button></div></section>`;
}

/** Renders the ability draft panel shaped by the chosen ability's interaction. */
export function abilityDraftPanel(match: ActiveView): string {
  const draft = state.current.actionDraft;
  if (!draft || draft.kind !== "ability") return "";
  const ability = abilityOf(draft);
  if (draft.rulesVersion !== match.rulesVersion) {
    throw new Error(
      "The Action Draft does not match the Active Match Ruleset.",
    );
  }
  switch (ability.interaction) {
    case "physical-attack":
      return draft.step === "review"
        ? reviewPanel(match, ability)
        : physicalContactsPanel(match, ability);
    case "targeted-attack":
      if (draft.step === "select-target") return targetingPanel(match, ability);
      if (draft.step === "reactions") return reactionsPanel(match, ability);
      return reviewPanel(match, ability);
    default:
      return draft.step === "select-target"
        ? targetingPanel(match, ability)
        : reviewPanel(match, ability);
  }
}
