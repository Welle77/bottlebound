<script lang="ts">
  import {
    cryptoRandomSource,
    getEndGamePreview,
    getUndoPreview,
  } from "../domain/match";
  import { RULESET } from "../domain/ruleset";
  import {
    advanceTurn,
    continueMatch,
    openAbilityPicker,
    openBasicAttack,
    recordSimultaneousRuling,
  } from "../app/actions";
  import { patchShellState, state } from "./shell-state.svelte";
  import { openRules } from "./rules-dialog";
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
  interface BoardRow {
    readonly key: string;
    readonly slot: number;
    readonly character: { readonly id: string; readonly name: string };
    readonly team: string;
    readonly hp: number;
    readonly baseHp: number;
    readonly turnLabel: string;
    readonly turnKey: string;
  }

  const view = $derived.by(() => {
    const match = state.current.match;
    if (match?.phase !== "active") return null;
    const activeEntry = match.initiative[match.activeSlot - 1];
    const nextScan = match.initiative.reduce<{
      readonly nextSlot: number;
      readonly found: boolean;
    }>(
      (scan) => {
        if (scan.found) return scan;
        const candidateSlot =
          scan.nextSlot === match.initiative.length ? 1 : scan.nextSlot + 1;
        const candidate = match.initiative[candidateSlot - 1];
        const candidateRules = RULESET.characters.find(
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
    );
    const nextSlot = nextScan.nextSlot;
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
    const hpByCharacter = new Map(
      match.characters.map(({ characterId, hp }) => [characterId, hp]),
    );
    const rows: readonly BoardRow[] = match.initiative.map((entry) => {
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
    const saving = state.current.saving;
    const canUndo =
      !saving && getUndoPreview(match, state.current.events) !== null;
    const combatAvailable = match.rulesVersion === RULESET.version;
    const activeDowned = hpByCharacter.get(activeEntry.characterId) === 0;
    const [firstEliminatedTeam] = match.eliminatedTeams;
    const normalElimination =
      match.eliminatedTeams.length === 1 && match.outcome !== null;
    const eliminationAcknowledged =
      normalElimination &&
      firstEliminatedTeam !== undefined &&
      match.acknowledgedEliminations.includes(firstEliminatedTeam);
    const promptKind = normalElimination
      ? eliminationAcknowledged
        ? "acknowledged"
        : "normal"
      : match.eliminatedTeams.length === 2 && match.outcome === null
        ? "simultaneous-open"
        : match.eliminatedTeams.length === 2 && match.outcome !== null
          ? "simultaneous-resolved"
          : "none";
    const activeHp = hpByCharacter.get(activeEntry.characterId);
    const nextHp = hpByCharacter.get(nextEntry.characterId);
    if (activeHp === undefined || nextHp === undefined) {
      throw new Error("The Active Match references an unknown character.");
    }
    return {
      match,
      activeSlot: activeEntry.slot,
      nextSlot: nextEntry.slot,
      activeCharacter,
      nextCharacter,
      activeHp,
      nextHp,
      activeDowned,
      rows,
      saving,
      canUndo,
      combatAvailable,
      // One composed run of text so matchers see exactly the legacy
      // single-spaced sentence across the version interpolation.
      combatStatusText: `Basic Attack is unavailable because combat data for Ruleset ${match.rulesVersion} is not bundled. Finish Turn and Undo remain available.`,
      promptKind,
      outcomeText:
        match.eliminatedTeams.length === 2 && match.outcome !== null
          ? outcomeLabel(match.outcome)
          : "",
      showCommands: promptKind === "none" || eliminationAcknowledged,
      showEndGameControl:
        (promptKind === "none" || eliminationAcknowledged) &&
        !(match.eliminatedTeams.length === 2 && match.outcome === null),
      matchError: state.current.matchError,
      summary: state.current.summary,
    };
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

  function openContextRules(anchor: string): (event: MouseEvent) => void {
    return (event) => {
      if (!(event.currentTarget instanceof HTMLButtonElement)) return;
      openRules(event.currentTarget, anchor);
    };
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
        <p class="turn-position">Round {view.match.round} · Slot {view.match.activeSlot} of {view.match.initiative.length}</p>        <div class="rules-context-links">
          <button
            id="rules-round"
            class="rules-context-link"
            type="button"
            data-open-rules-anchor="section-5-core-terms"
            onclick={openContextRules("section-5-core-terms")}
          >
            Round rules
          </button>
          <button
            id="rules-turn"
            class="rules-context-link"
            type="button"
            data-open-rules-anchor="section-7-turn-structure-movement"
            onclick={openContextRules("section-7-turn-structure-movement")}
          >
            Turn rules
          </button>
        </div>
      </div>
      <span class="readiness-badge" data-state="ready">Saved</span>
    </div>
    {#if view.matchError}
      <p class="blocking-error" role="alert">
        {view.matchError}
        The last committed Active Match remains visible.
      </p>
    {/if}
    <div class="turn-cards">
      <article class="turn-card active-character" data-active-character>
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
            <dt>HP</dt><dd>{view.activeHp}/{view.activeCharacter.baseHp}</dd>
          </div>
          <div><dt>Slot</dt><dd>{view.activeSlot}</dd></div>
        </dl>
      </article>
      <article class="turn-card" data-next-character>
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
            <dt>HP</dt><dd>{view.nextHp}/{view.nextCharacter.baseHp}</dd>
          </div>
          <div><dt>Slot</dt><dd>{view.nextSlot}</dd></div>
        </dl>
      </article>
    </div>
    {#if !view.combatAvailable}
      <p id="combat-version-status" class="blocking-error" role="status">
        {view.combatStatusText}
      </p>
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
    <div class="table-wrap">
      <table class="initiative-table active-order">
        <caption>Complete initiative order</caption>
        <thead>
          <tr>
            <th>Slot</th>
            <th>Character</th>
            <th>Team</th>
            <th>HP</th>
            <th>Turn</th>
          </tr>
        </thead>
        <tbody>
          {#each view.rows as row (row.key)}
            <tr data-active-order-row data-turn={row.turnKey}>
              <td data-label="Slot">{row.slot}</td>
              <th scope="row">
                <CharacterName
                  character={row.character}
                  displayNames={view.match.displayNames}
                />
              </th>
              <td data-label="Team">{row.team}</td>
              <td data-label="HP">{row.hp}/{row.baseHp}</td>
              <td data-label="Turn">{row.turnLabel}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if view.showCommands}
      <div class="match-actions">
        <button
          id="basic-attack"
          class="secondary-action"
          type="button"
          disabled={view.saving ||
            !view.combatAvailable ||
            view.activeDowned ||
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
            view.match.eliminatedTeams.length === 2}
          aria-describedby={view.combatAvailable
            ? undefined
            : "combat-version-status"}
          onclick={openAbilityPicker}
        >
          Use Ability
        </button>
        <button
          id="finish-turn"
          class="primary-action"
          type="button"
          disabled={view.saving || view.match.eliminatedTeams.length === 2}
          onclick={() => void advanceTurn()}
        >
          {view.saving ? "Saving…" : "Finish Turn"}
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
    {/if}
    {#if view.showEndGameControl}
      <section class="end-game-control" aria-labelledby="end-game-heading">
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
