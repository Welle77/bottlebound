<script lang="ts">
  import { decisionBasisLabel, outcomeLabel } from "./format";
  import { useConsoleContext } from "./console-context";
  import { MATCH_CONFIGURATION } from "../domain/match";
  import type { ActionResolvedEvent, MatchEvent } from "../domain/match";
  import type { UiConfirmation } from "./ui-state";
  import ConfirmationDialog from "./ConfirmationDialog.svelte";
  import swordIcon from "@phosphor-icons/core/bold/sword-bold.svg?url";
  import magicWandIcon from "@phosphor-icons/core/bold/magic-wand-bold.svg?url";
  import userIcon from "@phosphor-icons/core/bold/user-bold.svg?url";
  import targetIcon from "@phosphor-icons/core/bold/target-bold.svg?url";
  import heartIcon from "@phosphor-icons/core/bold/heart-bold.svg?url";
  import drowTeamIcon from "@phosphor-icons/core/bold/leaf-bold.svg?url";
  import duergarTeamIcon from "@phosphor-icons/core/bold/mountains-bold.svg?url";

  const { application, uiState } = useConsoleContext();

  // Converted ended-match surface (T08): the read-only Ended Match panel
  // reacts to the runes store instead of being swapped as legacy template
  // HTML. It embeds the converted confirmation dialog exactly where the
  // deleted template embedded the shared confirmation fragment, so the
  // remove/start-new confirmations stay inside the panel section.
  const match = $derived(
    application.state.match?.phase === "ended" ? application.state.match : null,
  );
  const matchError = $derived(
    application.state.errors.operation === "Injected storage failure"
      ? "Validated storage could not commit the command."
      : application.state.errors.operation,
  );

  const view = $derived.by(() => {
    if (!match) return null;
    const eliminated = match.eliminatedTeams.join(" and ");
    const result = outcomeLabel(match.outcome);
    return {
      sequence: match.sequence,
      // Composed single-spaced strings so regex text probes see exactly the
      // legacy contiguous runs across interpolations.
      headlineText: eliminated
        ? `${result} · ${eliminated} eliminated`
        : result,
      result,
      basisText: match.decisionBasis
        ? `${decisionBasisLabel(match.decisionBasis)}${match.coinFlipResult ? ` · ${match.coinFlipResult}` : ""}`
        : "",
      countsText: match.finalCounts
        ? `Drow ${match.finalCounts.Drow} · Duergar ${match.finalCounts.Duergar}`
        : "",
      hpTotalsText: match.finalHpTotals
        ? `Drow ${match.finalHpTotals.Drow} · Duergar ${match.finalHpTotals.Duergar}`
        : "",
      endedAt: match.endedAt,
      round: match.round,
      configurationVersion: match.configurationVersion,
      events: application.state.events,
    };
  });

  function eventTitle(type: string): string {
    return type.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
  }

  function characterName(characterId: string): string {
    return (
      MATCH_CONFIGURATION.characters.find(({ id }) => id === characterId)
        ?.name ?? characterId
    );
  }

  function characterTeam(characterId: string): "Drow" | "Duergar" | null {
    return (
      MATCH_CONFIGURATION.characters.find(({ id }) => id === characterId)
        ?.team ?? null
    );
  }

  function teamIcon(characterId: string): string {
    return characterTeam(characterId) === "Drow" ? drowTeamIcon : duergarTeamIcon;
  }

  function isActionResolved(event: MatchEvent): event is ActionResolvedEvent {
    return event.type === "ActionResolved";
  }

  function actionIcon(event: ActionResolvedEvent): string {
    return event.actionType === "Ability" ? magicWandIcon : swordIcon;
  }

  function effectLabel(
    effect: ActionResolvedEvent["effects"][number],
  ): string {
    if (effect.hpAfter > effect.hpBefore) {
      return `Healed ${String(effect.hpAfter - effect.hpBefore)} HP`;
    }
    if (effect.damage > 0) return `Hit for ${String(effect.damage)} damage`;
    return "Affected";
  }

  function requestConfirmation(
    confirmation: Exclude<UiConfirmation, null>,
  ): void {
    uiState.requestConfirmation(confirmation);
  }
</script>

{#if view}
  <section class="match-panel ended-match" aria-labelledby="ended-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Ended · Sequence {view.sequence}</p>
        <h2 id="ended-heading">Ended Match</h2>
        <p>{view.headlineText}</p>
      </div>
      <span class="readiness-badge" data-state="ready">Read-only</span>
    </div>
    {#if matchError}
      <p class="blocking-error" role="alert">{matchError} The Ended Match remains saved.</p>
    {/if}
    <dl class="ended-result">
      <div><dt>Result</dt><dd>{view.result}</dd></div>
      {#if view.basisText}<div><dt>Decision Basis</dt><dd>{view.basisText}</dd></div>{/if}
      {#if view.countsText}<div><dt>Active counts</dt><dd>{view.countsText}</dd></div>{/if}
      {#if view.hpTotalsText}<div><dt>Active HP totals</dt><dd>{view.hpTotalsText}</dd></div>{/if}
      <div><dt>Ended</dt><dd>{view.endedAt}</dd></div>
      <div><dt>Final round</dt><dd>{view.round}</dd></div>
      <div><dt>Match Configuration</dt><dd>{view.configurationVersion}</dd></div>
    </dl>
    <section class="match-event-history" aria-labelledby="event-history-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Complete record · {view.events.length} events</p>
          <h3 id="event-history-heading">Match Event history</h3>
        </div>
      </div>
      <ol class="match-event-list">
        {#each view.events as event (event.sequence)}
          <li class="match-event" data-event-sequence={event.sequence}>
            <div class="match-event-heading">
              <strong>{eventTitle(event.type)}</strong>
              <span>Sequence {event.sequence}</span>
            </div>
            {#if isActionResolved(event)}
              <div class="action-event-summary">
                <span class="event-detail event-action-type">
                  <img
                    class="event-action-icon"
                    class:event-ability-icon={event.actionType === "Ability"}
                    class:event-basic-attack-icon={event.actionType === "Basic Attack"}
                    src={actionIcon(event)}
                    alt=""
                    aria-hidden="true"
                  />
                  {event.actionType}
                </span>
                <span class="event-detail">
                  <img src={userIcon} alt="" aria-hidden="true" />
                  {characterName(event.sourceCharacterId)}
                  <img
                    class="event-team-icon"
                    data-team-icon={characterTeam(event.sourceCharacterId)}
                    src={teamIcon(event.sourceCharacterId)}
                    alt={characterTeam(event.sourceCharacterId) ?? ""}
                  />
                </span>
                <span class="event-detail event-targets-label">
                  <img src={targetIcon} alt="" aria-hidden="true" />
                  {event.effects.length} {event.effects.length === 1 ? "unit" : "units"}
                </span>
              </div>
              {#if event.effects.length > 0}
                <ul class="event-effect-list">
                  {#each event.effects as effect (effect.characterId)}
                    <li>
                      <img
                        class="event-team-icon"
                        data-team-icon={characterTeam(effect.characterId)}
                        src={teamIcon(effect.characterId)}
                        alt={characterTeam(effect.characterId) ?? ""}
                      />
                      <img
                        class:event-heal-icon={effect.hpAfter > effect.hpBefore}
                        class:event-damage-icon={effect.hpAfter <= effect.hpBefore}
                        src={effect.hpAfter > effect.hpBefore ? heartIcon : targetIcon}
                        alt=""
                        aria-hidden="true"
                      />
                      <span>{characterName(effect.characterId)}</span>
                      <span>{effectLabel(effect)}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
            <time datetime={event.occurredAt}>{event.occurredAt}</time>
            <details>
              <summary>View event details</summary>
              <pre>{JSON.stringify(event, null, 2)}</pre>
            </details>
          </li>
        {/each}
      </ol>
    </section>
    <p>This Match is read-only. Reopen it to make corrections, or remove its complete local history.</p>
    <div class="match-actions">
      <button
        id="reopen-match"
        class="primary-action"
        type="button"
        onclick={() => void application.reopenMatch()}
      >
        Reopen Match
      </button>
      <button
        id="request-start-new-match"
        class="secondary-action"
        type="button"
        onclick={() => requestConfirmation("start-new")}
      >
        Start new Match
      </button>
      <button
        id="request-remove-match"
        class="danger-action"
        type="button"
        onclick={() => requestConfirmation("remove")}
      >
        Remove Match
      </button>
    </div>
    <ConfirmationDialog />
  </section>
{/if}
