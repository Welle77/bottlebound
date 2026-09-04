<script lang="ts">
  import { useConsoleContext } from "./console-context";
  import {
    getUndoPreview,
    normalMovementPaces,
    type ActiveMatchState,
    type CharacterId,
    type InitiativeEntry,
    type Team,
  } from "../domain/match";
  import { MATCH_CONFIGURATION } from "../domain/match";
  import CharacterName from "./CharacterName.svelte";
  import ActiveMatchBoardFooter from "./ActiveMatchBoardFooter.svelte";
  import CharacterCombatStats from "./CharacterCombatStats.svelte";
  import { outcomeLabel } from "./format";
  import {
    activeEffectStatuses,
    downedEffectStatus,
    type ActiveEffectStatus,
  } from "./effect-status";
  import { unspentAbilities } from "./ability-draft";
  import { createPhysicalConfirmations } from "./ui-state";
  import drowTeamIcon from "@phosphor-icons/core/bold/leaf-bold.svg?url";
  import duergarTeamIcon from "@phosphor-icons/core/bold/mountains-bold.svg?url";
  import abilityUnavailableIcon from "@phosphor-icons/core/bold/prohibit-bold.svg?url";

  const { application, uiState } = useConsoleContext();

  // The App shell owns the Active Match, Action Draft, and ability-picker surfaces.
  type BoardRow = {
    readonly key: CharacterId;
    readonly slot: number;
    readonly character: (typeof MATCH_CONFIGURATION.characters)[number];
    readonly team: Team;
    readonly hp: number;
    readonly maxHp: number;
    readonly effectStatuses: readonly ActiveEffectStatus[];
    readonly turnLabel: string;
    readonly turnKey: string;
  };

  type PromptKind =
    | "none"
    | "normal"
    | "acknowledged"
    | "simultaneous-open"
    | "simultaneous-resolved";

  function findNextActiveSlot(match: ActiveMatchState): number {
    return match.initiative.reduce<{
      readonly nextSlot: number;
      readonly found: boolean;
    }>(
      (scan) => {
        if (scan.found) return scan;
        const candidateSlot =
          scan.nextSlot === match.initiative.length ? 1 : scan.nextSlot + 1;
        const candidate = match.initiative[candidateSlot - 1];
        const candidateRules = MATCH_CONFIGURATION.characters.find(
          ({ id }) => id === candidate?.characterId,
        );
        const candidateState = match.characters.find(
          ({ characterId }) => characterId === candidate?.characterId,
        );
        const usable =
          candidateRules &&
          candidateState?.hp !== 0 &&
          !match.eliminatedTeams.includes(candidateRules.team);
        return usable
          ? { nextSlot: candidateSlot, found: true }
          : { nextSlot: candidateSlot, found: false };
      },
      { nextSlot: match.activeSlot, found: false },
    ).nextSlot;
  }

  function requireInitiativeEntry(
    match: ActiveMatchState,
    slot: number,
  ): InitiativeEntry {
    const entry = match.initiative[slot - 1];
    if (!entry) {
      throw new Error("The Active Match initiative order is incomplete.");
    }
    return entry;
  }

  function requireCharacter(
    characterId: CharacterId,
  ): (typeof MATCH_CONFIGURATION.characters)[number] {
    const character = MATCH_CONFIGURATION.characters.find(
      ({ id }) => id === characterId,
    );
    if (!character) {
      throw new Error("The Active Match references an unknown character.");
    }
    return character;
  }

  function basicAttackOf(characterId: CharacterId) {
    const attack = MATCH_CONFIGURATION.basicAttacks.find(
      ({ characterId: id }) => id === characterId,
    );
    if (!attack) throw new Error("Character Basic Attack is missing.");
    return attack;
  }

  function requireHp(
    hpByCharacter: ReadonlyMap<CharacterId, number>,
    characterId: CharacterId,
  ): number {
    const hp = hpByCharacter.get(characterId);
    if (hp === undefined) {
      throw new Error("The Active Match references an unknown character.");
    }
    return hp;
  }

  function teamIconOf(team: Team): string {
    return team === "Drow" ? drowTeamIcon : duergarTeamIcon;
  }

  function buildBoardRows(
    match: ActiveMatchState,
    nextSlot: number,
    stateByCharacter: ReadonlyMap<CharacterId, ActiveMatchState["characters"][number]>,
  ): readonly BoardRow[] {
    return match.initiative.map((entry) => {
      const character = requireCharacter(entry.characterId);
      const characterState = stateByCharacter.get(entry.characterId);
      if (!characterState) {
        throw new Error("The Active Match references an unknown character.");
      }
      const { hp } = characterState;
      const turnLabel = (() => {
        if (entry.slot === match.activeSlot) return "Active";
        if (hp === 0 || match.eliminatedTeams.includes(character.team)) {
          return "Skipped · Downed";
        }
        if (entry.slot === nextSlot) return "Next";
        return "Waiting";
      })();
      return {
        key: entry.characterId,
        slot: entry.slot,
        character,
        team: character.team,
        hp,
        maxHp: characterState.currentMaxHp,
        effectStatuses: [
          ...(hp === 0 ? [downedEffectStatus()] : []),
          ...activeEffectStatuses(match.activeEffects, entry.characterId),
        ],
        turnLabel,
        turnKey: turnLabel.toLowerCase(),
      };
    });
  }

  function getPromptKind(match: ActiveMatchState): PromptKind {
    const [firstEliminatedTeam] = match.eliminatedTeams;
    const normalElimination =
      match.eliminatedTeams.length === 1 && match.outcome !== null;
    const eliminationAcknowledged =
      normalElimination &&
      firstEliminatedTeam !== undefined &&
      match.acknowledgedEliminations.includes(firstEliminatedTeam);
    if (normalElimination) {
      return eliminationAcknowledged ? "acknowledged" : "normal";
    }
    if (match.eliminatedTeams.length === 2 && match.outcome === null) {
      return "simultaneous-open";
    }
    if (match.eliminatedTeams.length === 2 && match.outcome !== null) {
      return "simultaneous-resolved";
    }
    return "none";
  }

  function moveIsAvailable(
    match: ActiveMatchState,
    saving: boolean,
    activeDowned: boolean,
  ): boolean {
    return (
      !saving &&
      !activeDowned &&
      match.eliminatedTeams.length !== 2 &&
      (match.actionsUsed ?? (match.majorActionUsed ? 1 : 0)) < 2
    );
  }

  function outcomeText(match: ActiveMatchState): string {
    return match.eliminatedTeams.length === 2 && match.outcome !== null
      ? outcomeLabel(match.outcome)
      : "";
  }

  function commandsAreVisible(promptKind: PromptKind): boolean {
    return promptKind === "none" || promptKind === "acknowledged";
  }

  function endGameControlIsVisible(
    match: ActiveMatchState,
    promptKind: PromptKind,
  ): boolean {
    return (
      commandsAreVisible(promptKind) &&
      !(match.eliminatedTeams.length === 2 && match.outcome === null)
    );
  }

  function buildActiveMatchView(match: ActiveMatchState) {
    const activeEntry = requireInitiativeEntry(match, match.activeSlot);
    const nextSlot = findNextActiveSlot(match);
    const nextEntry = requireInitiativeEntry(match, nextSlot);
    const activeCharacter = requireCharacter(activeEntry.characterId);
    const nextCharacter = requireCharacter(nextEntry.characterId);
    const hpByCharacter = new Map<CharacterId, number>(
      match.characters.map(({ characterId, hp }) => [characterId, hp]),
    );
    const maxHpByCharacter = new Map<CharacterId, number>(
      match.characters.map(({ characterId, currentMaxHp }) => [
        characterId,
        currentMaxHp,
      ]),
    );
    const stateByCharacter = new Map(
      match.characters.map((character) => [character.characterId, character]),
    );
    const rows = buildBoardRows(match, nextSlot, stateByCharacter);
    const { saving } = application.state;
    const canUndo =
      !saving && getUndoPreview(match, application.state.events) !== null;
    const combatAvailable =
      match.configurationVersion === MATCH_CONFIGURATION.version;
    const activeDowned = hpByCharacter.get(activeEntry.characterId) === 0;
    const promptKind = getPromptKind(match);
    const activeHp = requireHp(hpByCharacter, activeEntry.characterId);
    const nextHp = requireHp(hpByCharacter, nextEntry.characterId);
    const actionsUsed = match.actionsUsed ?? (match.majorActionUsed ? 1 : 0);
    const activeAttack = basicAttackOf(activeEntry.characterId);
    const nextAttack = basicAttackOf(nextEntry.characterId);
    const abilitiesAvailable = unspentAbilities(match).length > 0;
    return {
      match,
      activeSlot: activeEntry.slot,
      nextSlot: nextEntry.slot,
      activeCharacter,
      nextCharacter,
      activeHp,
      activeMaxHp: requireHp(maxHpByCharacter, activeEntry.characterId),
      movementPaces: normalMovementPaces(match, activeEntry.characterId),
      attackType: activeAttack.attackType,
      nextMovementPaces: normalMovementPaces(match, nextEntry.characterId),
      nextAttackType: nextAttack.attackType,
      nextHp,
      nextMaxHp: requireHp(maxHpByCharacter, nextEntry.characterId),
      activeDowned,
      actionsUsed,
      abilitiesAvailable,
      moveAvailable: moveIsAvailable(match, saving, activeDowned),
      rows,
      saving,
      canUndo,
      combatAvailable,
      // One composed run of text so matchers see exactly the legacy
      // single-spaced sentence across the version interpolation.
      combatStatusText: `Basic Attack is unavailable because combat data for Match Configuration ${match.configurationVersion} is not bundled. Finish Turn and Undo remain available.`,
      promptKind,
      outcomeText: outcomeText(match),
      showCommands: commandsAreVisible(promptKind),
      showEndGameControl: endGameControlIsVisible(match, promptKind),
      matchError: application.state.errors.operation,
      summary: application.state.summary,
    };
  }

  const view = $derived.by(() => {
    const { match } = application.state;
    return match?.phase === "active" ? buildActiveMatchView(match) : null;
  });

  let openEffectId = $state<string | null>(null);
  let effectTooltipPosition = $state({ left: 0, top: 0 });

  function toggleEffectTooltip(effectId: string, event: MouseEvent): void {
    if (openEffectId === effectId) {
      openEffectId = null;
      return;
    }
    if (!(event.currentTarget instanceof HTMLButtonElement)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    openEffectId = effectId;
    effectTooltipPosition = {
      left: Math.max(
        120,
        Math.min(bounds.left + bounds.width / 2, window.innerWidth - 120),
      ),
      top: Math.max(100, bounds.top - 8),
    };
  }

  async function recordMove(): Promise<void> {
    await application.recordMove();
  }

  function openBasicAttack(): void {
    const { match } = application.state;
    if (
      match?.phase !== "active" ||
      match.configurationVersion !== MATCH_CONFIGURATION.version
    )
      return;
    const sourceCharacterId =
      match.initiative[match.activeSlot - 1]?.characterId;
    if (!sourceCharacterId) return;
    uiState.setPickerVisibility({ ability: false });
    uiState.setActionDraft({
      kind: "basic",
      sourceCharacterId,
      configurationVersion: match.configurationVersion,
      abilityId: null,
      targets: [],
      step: "contacts",
      attackLegs: [[]],
      physicalConfirmations: createPhysicalConfirmations(
        uiState.state.physicalConfirmationPreference,
      ),
      reactions: [],
      abilityOverride: false,
      overrideRequired: null,
      majorActionOverride: false,
    });
  }

  function openAbilityPicker(): void {
    const { match } = application.state;
    if (
      match?.phase !== "active" ||
      match.configurationVersion !== MATCH_CONFIGURATION.version ||
      uiState.state.actionDraft
    )
      return;
    const activeCharacterId =
      match.initiative[match.activeSlot - 1]?.characterId;
    const activeHp =
      match.characters.find(
        ({ characterId }) => characterId === activeCharacterId,
      )?.hp ?? 0;
    if (activeHp === 0 || match.eliminatedTeams.length === 2) return;
    uiState.setPickerVisibility({ ability: true });
  }

  async function continueMatch(): Promise<void> {
    const { match } = application.state;
    if (match?.phase !== "active" || match.eliminatedTeams.length !== 1)
      return;
    const [eliminatedTeam] = match.eliminatedTeams;
    if (eliminatedTeam === undefined) return;
    await application.acknowledgeElimination(eliminatedTeam);
  }

  async function recordSimultaneousRuling(
    outcome: Team | "draw",
  ): Promise<void> {
    const { match } = application.state;
    if (
      match?.phase !== "active" ||
      match.eliminatedTeams.length !== 2 ||
      match.outcome !== null
    )
      return;
    await application.ruleSimultaneousElimination(outcome);
  }

  async function advanceTurn(): Promise<void> {
    await application.finishTurn();
  }

  function requestUndo(): void {
    uiState.requestConfirmation("undo");
  }

  function requestEndGame(): void {
    const { match } = application.state;
    if (uiState.state.actionDraft !== null) return;
    if (match?.phase !== "active") return;
    try {
      uiState.setEndGamePresentation({
        open: true,
        preview: application.previewEndGame(),
      });
    } catch {
      uiState.setEndGamePresentation({ open: true, preview: null });
    }
    uiState.requestConfirmation("end");
  }

  function handleRulingSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const outcome = new FormData(form).get("simultaneous-outcome");
    if (outcome !== "Drow" && outcome !== "Duergar" && outcome !== "draw")
      return;
    void recordSimultaneousRuling(outcome);
  }
</script>

{#if view}
  <section class="match-panel active-match" aria-labelledby="active-heading">
    <div class="section-heading">
      <div>
        <!-- Single-line runs: text stays exactly single-spaced across
             interpolations for every matcher, matching legacy output. -->
        <p class="eyebrow">Active · Sequence {view.match.sequence}</p>
        <h2 id="active-heading">Active Match</h2>
      </div>
      <span class="readiness-badge" data-state="ready">Saved</span>
    </div>
    <div class="turn-position-row">
      <p class="turn-position">
        Round {view.match.round} · Slot {view.match.activeSlot} of {view.match
          .initiative.length}
      </p>
      {#if view.canUndo}
        <button
          id="request-undo"
          class="secondary-action turn-undo"
          type="button"
          onclick={requestUndo}
        >
          Undo
        </button>
      {/if}
    </div>
    {#if view.matchError}
      <p class="blocking-error" role="alert">
        {view.matchError}
        The last committed Active Match remains visible.
      </p>
    {/if}
    <div class="turn-cards">
      <article
        class="turn-card active-character"
        data-active-character
        data-surface-order="active-player"
      >
        <p class="eyebrow">Active{view.activeDowned ? " · Downed" : ""}</p>
        <h3>
          <CharacterName
            character={view.activeCharacter}
            displayNames={view.match.displayNames}
          />
        </h3>
        <CharacterCombatStats
          team={view.activeCharacter.team}
          hp={view.activeHp}
          maxHp={view.activeMaxHp}
          movementPaces={view.movementPaces}
          attackType={view.attackType}
        />
        <div
          class="action-usage"
          aria-label={`${view.actionsUsed} of 2 actions used`}
        >
          <span class="action-usage-label">Actions</span>
          <span
            class:spent={view.actionsUsed >= 1}
            class="action-usage-marker"
            aria-hidden="true"
          ></span>
          <span
            class:spent={view.actionsUsed >= 2}
            class="action-usage-marker"
            aria-hidden="true"
          ></span>
        </div>
      </article>
    </div>
    {#if !view.combatAvailable}
      <p id="combat-version-status" class="blocking-error" role="status">
        {view.combatStatusText}
      </p>
    {/if}
    {#if view.showCommands}
      <div class="match-actions" data-surface-order="actions">
        <button
          id="move"
          class="secondary-action"
          type="button"
          disabled={!view.moveAvailable}
          onclick={() => void recordMove()}
        >
          Move
        </button>
        <button
          id="basic-attack"
          class="secondary-action"
          type="button"
          disabled={view.saving ||
            !view.combatAvailable ||
            view.activeDowned ||
            (view.match.actionsUsed ?? (view.match.majorActionUsed ? 1 : 0)) >=
              2 ||
            view.match.eliminatedTeams.length === 2}
          aria-describedby={view.combatAvailable
            ? undefined
            : "combat-version-status"}
          onclick={openBasicAttack}
        >
          Basic Attack
        </button>
        <button
          id="use-ability"
          class="secondary-action"
          type="button"
          disabled={view.saving ||
            !view.combatAvailable ||
            view.activeDowned ||
            !view.abilitiesAvailable ||
            (view.match.actionsUsed ?? (view.match.majorActionUsed ? 1 : 0)) >=
              2 ||
            view.match.eliminatedTeams.length === 2}
          aria-describedby={view.combatAvailable
            ? undefined
            : "combat-version-status"}
          onclick={openAbilityPicker}
          title={view.abilitiesAvailable ? undefined : "No abilities remaining"}
        >
          Use Ability{#if !view.abilitiesAvailable}<img
              class="action-button-icon"
              src={abilityUnavailableIcon}
              alt=""
              aria-hidden="true"
            />{/if}
        </button>
      </div>
    {/if}
    <div class="turn-cards">
      <article
        class="turn-card"
        data-next-character
        data-surface-order="next-player"
      >
        <p class="eyebrow">Next Active</p>
        <h3>
          <CharacterName
            character={view.nextCharacter}
            displayNames={view.match.displayNames}
          />
        </h3>
        <CharacterCombatStats
          team={view.nextCharacter.team}
          hp={view.nextHp}
          maxHp={view.nextMaxHp}
          movementPaces={view.nextMovementPaces}
          attackType={view.nextAttackType}
        />
      </article>
    </div>
    {#if view.showCommands}
      <div class="finish-turn-action" data-surface-order="finish-turn">
        <button
          id="finish-turn"
          class="primary-action"
          type="button"
          disabled={view.saving || view.match.eliminatedTeams.length === 2}
          onclick={() => void advanceTurn()}
        >
          {view.saving ? "Saving…" : "Finish Turn"}
        </button>
      </div>
    {/if}
    {#if view.promptKind === "normal"}
      <section
        class="elimination-result"
        role="alert"
        aria-labelledby="elimination-heading"
      >
        <p class="eyebrow">Team Elimination</p>
        <h3 id="elimination-heading">{view.match.outcome} wins</h3>
        <p>
          All six {view.match.eliminatedTeams[0]} characters are Downed. Choose how
          this Match proceeds.
        </p>
        <div class="match-actions">
          <button
            id="request-end-game"
            class="primary-action"
            type="button"
            onclick={requestEndGame}
          >
            End Game
          </button>
          {#if view.canUndo}
            <button
              id="request-undo"
              class="secondary-action"
              type="button"
              onclick={requestUndo}
            >
              Undo
            </button>
          {/if}
          <button
            id="continue-match"
            class="secondary-action"
            type="button"
            onclick={() => void continueMatch()}
          >
            Continue
          </button>
        </div>
      </section>
    {:else if view.promptKind === "acknowledged"}
      <p class="elimination-acknowledged" role="status">
        {view.match.eliminatedTeams[0]} remains eliminated. Continue was acknowledged;
        its initiative slots are skipped.
      </p>
    {:else if view.promptKind === "simultaneous-open"}
      <section
        class="elimination-result simultaneous-elimination"
        role="alert"
        aria-labelledby="simultaneous-elimination-heading"
      >
        <p class="eyebrow">Simultaneous Team Elimination</p>
        <h3 id="simultaneous-elimination-heading">Both teams are eliminated</h3>
        <p>
          The authoritative rules do not define the simultaneous outcome.
          Contact order is not a tiebreak. Record the referee's override before
          ending the Match.
        </p>
        <form class="simultaneous-ruling" onsubmit={handleRulingSubmit}>
          <fieldset>
            <legend>Referee ruling</legend>
            <div class="ruling-options">
              <label>
                <input
                  type="radio"
                  name="simultaneous-outcome"
                  value="Drow"
                  required
                />
                Drow wins
              </label>
              <label>
                <input
                  type="radio"
                  name="simultaneous-outcome"
                  value="Duergar"
                />
                Duergar wins
              </label>
              <label>
                <input type="radio" name="simultaneous-outcome" value="draw" />
                Draw
              </label>
            </div>
          </fieldset>
          <div class="match-actions">
            <button class="primary-action" type="submit">
              Record referee ruling
            </button>
            {#if view.canUndo}
              <button
                id="request-undo"
                class="secondary-action"
                type="button"
                onclick={requestUndo}
              >
                Undo
              </button>
            {/if}
          </div>
        </form>
      </section>
    {:else if view.promptKind === "simultaneous-resolved"}
      <section
        class="elimination-result simultaneous-elimination"
        role="alert"
        aria-labelledby="simultaneous-result-heading"
      >
        <p class="eyebrow">Simultaneous Team Elimination</p>
        <h3 id="simultaneous-result-heading">{view.outcomeText}</h3>
        <p>
          Both Drow and Duergar are eliminated. Recorded referee override: the
          authoritative rules do not define this simultaneous outcome.
        </p>
        <div class="match-actions">
          <button
            id="request-end-game"
            class="primary-action"
            type="button"
            onclick={requestEndGame}
          >
            End Game
          </button>
          {#if view.canUndo}
            <button
              id="request-undo"
              class="secondary-action"
              type="button"
              onclick={requestUndo}
            >
              Undo
            </button>
          {/if}
        </div>
      </section>
    {/if}
    <div class="table-wrap" data-surface-order="initiative-order">
      <table class="initiative-table active-order">
        <caption>Complete initiative order</caption>
        <thead>
          <tr>
            <th>Character</th>
            <th>Team</th>
            <th>HP</th>
            <th>Effects</th>
          </tr>
        </thead>
        <tbody>
          {#each view.rows as row (row.key)}
            <tr data-active-order-row data-turn={row.turnKey}>
              <th scope="row">
                <CharacterName
                  character={row.character}
                  displayNames={view.match.displayNames}
                />
              </th>
              <td data-label="Team" aria-label={row.team}>
                <img
                  class="team-icon"
                  class:team-icon-drow={row.team === "Drow"}
                  class:team-icon-duergar={row.team === "Duergar"}
                  src={teamIconOf(row.team)}
                  alt={row.team}
                  title={row.team}
                />
              </td>
              <td data-label="HP" class:critical-hp={row.hp === 1}
                >{row.hp}/{row.maxHp}</td
              >
              <td data-label="Effects" class="effect-status-cell">
                <span class="effect-status-list">
                  {#each row.effectStatuses as effect (effect.effectId)}
                    <button
                      class="effect-status-icon"
                      class:effect-status-buff={effect.tone === "buff"}
                      class:effect-status-debuff={effect.tone === "debuff"}
                      type="button"
                      aria-label={`${effect.tone === "buff" ? "Buff" : "Debuff"}: ${effect.name}`}
                      aria-controls={`effect-tooltip-${effect.effectId}`}
                      aria-expanded={openEffectId === effect.effectId}
                      onclick={(event) => toggleEffectTooltip(effect.effectId, event)}
                    ><img
                      class="effect-status-glyph"
                      src={effect.icon}
                      alt=""
                    /></button>
                    {#if openEffectId === effect.effectId}
                      <div
                        id={`effect-tooltip-${effect.effectId}`}
                        class="effect-status-tooltip"
                        role="tooltip"
                        aria-label={effect.name}
                        style={`left: ${String(effectTooltipPosition.left)}px; top: ${String(effectTooltipPosition.top)}px;`}
                      >
                        <h3>{effect.name}</h3>
                        <p>{effect.summary}</p>
                      </div>
                    {/if}
                  {/each}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <ActiveMatchBoardFooter
      showEndGameControl={view.showEndGameControl}
      hasSummary={view.summary !== null}
      {requestEndGame}
    />
  </section>
{/if}
