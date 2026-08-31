<script lang="ts">
  import {
    cryptoRandomSource,
    getEndGamePreview,
    getUndoPreview,
    type ActiveMatchState,
    type CharacterId,
    type InitiativeEntry,
    type Team,
  } from "../domain/match";
  import { MATCH_CONFIGURATION } from "../domain/match-configuration";
  import {
    advanceTurn,
    continueMatch,
    openAbilityPicker,
    openBasicAttack,
    recordMove,
    recordSimultaneousRuling,
  } from "../app/actions";
  import { patchShellState, state } from "./shell-state.svelte";
  import { outcomeLabel } from "./format";
  import ConfirmationDialog from "./ConfirmationDialog.svelte";
  import PriorSummaryCard from "./PriorSummaryCard.svelte";
  import UndoConfirmation from "./UndoConfirmation.svelte";
  import CharacterName from "./CharacterName.svelte";

  // Converted active-match board (T06): turn cards, complete initiative
  // order, turn/round commands, Team Elimination prompts, End Game control,
  // prior summary, and the undo confirmation react directly to the runes
  // store instead of being swapped as legacy template HTML. While the Action
  // Draft flow or the ability picker holds the surface (both component-owned
  // since T07), this component does not render; the App shell owns that
  // branching.
  type BoardRow = {
    readonly key: CharacterId;
    readonly slot: number;
    readonly character: (typeof MATCH_CONFIGURATION.characters)[number];
    readonly team: Team;
    readonly hp: number;
    readonly baseHp: number;
    readonly turnLabel: string;
    readonly turnKey: string;
  }

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

  function buildBoardRows(
    match: ActiveMatchState,
    nextSlot: number,
    hpByCharacter: ReadonlyMap<CharacterId, number>,
  ): readonly BoardRow[] {
    return match.initiative.map((entry) => {
      const character = requireCharacter(entry.characterId);
      const hp = requireHp(hpByCharacter, entry.characterId);
      const turnLabel =
        entry.slot === match.activeSlot
          ? "Active"
          : hp === 0 || match.eliminatedTeams.includes(character.team)
            ? "Skipped · Downed"
            : entry.slot === nextSlot
              ? "Next"
              : "Waiting";
      return {
        key: entry.characterId,
        slot: entry.slot,
        character,
        team: character.team,
        hp,
        baseHp: character.baseHp,
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
    return normalElimination
      ? eliminationAcknowledged
        ? "acknowledged"
        : "normal"
      : match.eliminatedTeams.length === 2 && match.outcome === null
        ? "simultaneous-open"
        : match.eliminatedTeams.length === 2 && match.outcome !== null
          ? "simultaneous-resolved"
          : "none";
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
    const rows = buildBoardRows(match, nextSlot, hpByCharacter);
    const saving = state.current.saving;
    const canUndo =
      !saving && getUndoPreview(match, state.current.events) !== null;
    const combatAvailable =
      match.configurationVersion === MATCH_CONFIGURATION.version;
    const activeDowned = hpByCharacter.get(activeEntry.characterId) === 0;
    const promptKind = getPromptKind(match);
    const activeHp = requireHp(hpByCharacter, activeEntry.characterId);
    const nextHp = requireHp(hpByCharacter, nextEntry.characterId);
    return {
      match,
      activeSlot: activeEntry.slot,
      nextSlot: nextEntry.slot,
      activeCharacter,
      nextCharacter,
      activeHp,
      nextHp,
      activeDowned,
      moveAvailable:
        !saving &&
        !activeDowned &&
        match.eliminatedTeams.length !== 2 &&
        (match.actionsUsed ?? (match.majorActionUsed ? 1 : 0)) < 2,
      rows,
      saving,
      canUndo,
      combatAvailable,
      // One composed run of text so matchers see exactly the legacy
      // single-spaced sentence across the version interpolation.
      combatStatusText: `Basic Attack is unavailable because combat data for Match Configuration ${match.configurationVersion} is not bundled. Finish Turn and Undo remain available.`,
      promptKind,
      outcomeText:
        match.eliminatedTeams.length === 2 && match.outcome !== null
          ? outcomeLabel(match.outcome)
          : "",
      showCommands: promptKind === "none" || promptKind === "acknowledged",
      showEndGameControl:
        (promptKind === "none" || promptKind === "acknowledged") &&
        !(match.eliminatedTeams.length === 2 && match.outcome === null),
      matchError: state.current.matchError,
      summary: state.current.summary,
    };
  }

  const view = $derived.by(() => {
    const match = state.current.match;
    return match?.phase === "active" ? buildActiveMatchView(match) : null;
  });

  function requestUndo(): void {
    patchShellState({ confirmation: "undo" });
  }

  function requestEndGame(): void {
    const match = state.current.match;
    if (state.current.actionDraft !== null) return;
    if (match?.phase !== "active") return;
    try {
      patchShellState({
        endGamePreview: getEndGamePreview(match, cryptoRandomSource),
      });
    } catch {
      patchShellState({ endGamePreview: null });
    }
    patchShellState({ confirmation: "end" });
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
      <p class="turn-position">Round {view.match.round} · Slot {view.match.activeSlot} of {view.match.initiative.length}</p>
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
      <article class="turn-card active-character" data-active-character data-surface-order="active-player">
        <p class="eyebrow">Active{view.activeDowned ? " · Downed" : ""}</p>
        <h3>
          <CharacterName
            character={view.activeCharacter}
            displayNames={view.match.displayNames}
          />
        </h3>
        <dl>
          <div><dt>Team</dt><dd>{view.activeCharacter.team}</dd></div>
          <div>
            <dt>HP</dt><dd class:critical-hp={view.activeHp === 1}>{view.activeHp}/{view.activeCharacter.baseHp}</dd>
          </div>
          <div><dt>Slot</dt><dd>{view.activeSlot}</dd></div>
        </dl>
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
            (view.match.actionsUsed ??
              (view.match.majorActionUsed ? 1 : 0)) >= 2 ||
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
            (view.match.actionsUsed ??
              (view.match.majorActionUsed ? 1 : 0)) >= 2 ||
            view.match.eliminatedTeams.length === 2}
          aria-describedby={view.combatAvailable
            ? undefined
            : "combat-version-status"}
          onclick={openAbilityPicker}
        >
          Use Ability
        </button>
      </div>
    {/if}
    <div class="turn-cards">
      <article class="turn-card" data-next-character data-surface-order="next-player">
        <p class="eyebrow">Next Active</p>
        <h3>
          <CharacterName
            character={view.nextCharacter}
            displayNames={view.match.displayNames}
          />
        </h3>
        <dl>
          <div><dt>Team</dt><dd>{view.nextCharacter.team}</dd></div>
          <div>
            <dt>HP</dt><dd class:critical-hp={view.nextHp === 1}>{view.nextHp}/{view.nextCharacter.baseHp}</dd>
          </div>
          <div><dt>Slot</dt><dd>{view.nextSlot}</dd></div>
        </dl>
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
          All six {view.match.eliminatedTeams[0]} characters are Downed.
          Choose how this Match proceeds.
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
        {view.match.eliminatedTeams[0]} remains eliminated. Continue was acknowledged; its
        initiative slots are skipped.
      </p>
    {:else if view.promptKind === "simultaneous-open"}
      <section
        class="elimination-result simultaneous-elimination"
        role="alert"
        aria-labelledby="simultaneous-elimination-heading"
      >
        <p class="eyebrow">Simultaneous Team Elimination</p>
        <h3 id="simultaneous-elimination-heading">
          Both teams are eliminated
        </h3>
        <p>
          The authoritative rules do not define the simultaneous outcome.
          Contact order is not a tiebreak. Record the referee's override
          before ending the Match.
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
          Both Drow and Duergar are eliminated. Recorded referee override:
          the authoritative rules do not define this simultaneous outcome.
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
              <td data-label="Team">{row.team}</td>
              <td data-label="HP" class:critical-hp={row.hp === 1}>{row.hp}/{row.baseHp}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if view.showEndGameControl}
      <section class="end-game-control" aria-labelledby="end-game-heading" data-surface-order="end-game">
        <h3 id="end-game-heading">End Game</h3>
        <p>Close the Match with the calculated winner and Decision Basis.</p>
        <button
          id="request-end-game"
          class="secondary-action"
          type="button"
          onclick={requestEndGame}
        >
          End Game
        </button>
      </section>
    {/if}
    {#if view.summary}
      <PriorSummaryCard />
    {/if}
    {#if state.current.confirmation === "undo"}
      <UndoConfirmation />
    {:else}
      <!-- Converted confirmations (T08): the End Game preview and generic
           dialogs as real markup. -->
      <ConfirmationDialog />
    {/if}
  </section>
{/if}
