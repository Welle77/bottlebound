<script lang="ts">
  import type { MatchState } from "../domain/match";
  import { RULESET } from "../domain/ruleset";
  import { modifierLabel } from "./format";
  import CharacterName from "./CharacterName.svelte";

  // One complete character-state table of an Undo comparison — the reactive
  // twin of the deleted legacy undoStatePanel() template. `current` marks
  // the committed state; otherwise this is the restored one.
  let {
    match,
    current,
  }: {
    match: MatchState;
    current: boolean;
  } = $props();

  const heading = $derived(current ? "Current committed state" : "State after Undo");
  const initiativeByCharacter = $derived(
    new Map(
      match.initiative?.map((entry) => [entry.characterId, entry]) ?? [],
    ),
  );
  const rows = $derived.by(() =>
    match.characters.map((entry) => {
      const character = RULESET.characters.find(
        ({ id }) => id === entry.characterId,
      );
      if (!character)
        throw new Error("The Match references an unknown character.");
      const initiative = initiativeByCharacter.get(entry.characterId);
      return {
        key: entry.characterId,
        character,
        team: character.team,
        hp: entry.hp,
        baseHp: character.baseHp,
        slot: initiative?.slot ?? "—",
        roll: initiative?.roll ?? "—",
        modifier: modifierLabel(
          initiative?.modifier ?? character.initiativeModifier,
        ),
        total: initiative?.total ?? "—",
      };
    }),
  );

  function spentNames(
    ids: readonly string[],
    kind: "abilities" | "reactions",
  ): string {
    if (ids.length === 0) return "None";
    return ids
      .map((id) =>
        kind === "abilities"
          ? (RULESET.abilities.find((ability) => ability.id === id)?.name ?? id)
          : (RULESET.reactions.find((reaction) => reaction.id === id)?.name ??
            id),
      )
      .join(", ");
  }

  const spentAbilityNames = $derived(spentNames(match.spentAbilityIds, "abilities"));
  const spentReactionNames = $derived(spentNames(match.spentReactionIds, "reactions"));
  const eliminationLine = $derived(
    `Team Elimination: ${match.eliminatedTeams.length > 0 ? match.eliminatedTeams.join(", ") : "None"} · Acknowledged: ${match.acknowledgedEliminations.length > 0 ? match.acknowledgedEliminations.join(", ") : "None"} · Outcome: ${match.outcome ?? "None"}`,
  );
</script>

<article
  class="undo-state"
  data-undo-current={current ? "" : undefined}
  data-undo-restored={current ? undefined : ""}
>
  <h4>{heading}</h4>
  <p>Phase: {match.phase === "active" ? "Active" : match.phase === "ended" ? "Ended" : "Setup"} · Sequence {match.sequence}</p>
  {#if match.phase !== "setup"}
    <p class="turn-position">Round {match.round} · Slot {match.activeSlot}</p>
    <p>Major Action: {match.majorActionUsed ? "Used" : "Available"}</p>
    <p>Spent Abilities: {spentAbilityNames}</p>
    <p>Spent Reactions: {spentReactionNames}</p>
  {:else}
    <p class="turn-position">
      {match.initiative ? "Initiative generated" : "No initiative result"}
    </p>
  {/if}
  <p>{eliminationLine}</p>
  <p>Match {match.matchId} · Rules {match.rulesVersion}</p>
  <div class="table-wrap">
    <table class="initiative-table">
      <caption>Complete character state</caption>
      <thead>
        <tr>
          <th>Character</th>
          <th>Team</th>
          <th>HP</th>
          <th>Slot</th>
          <th>Roll</th>
          <th>Modifier</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.key)}
          <tr data-state-character>
            <th scope="row">
              <CharacterName character={row.character} displayNames={match.displayNames} />
            </th>
            <td data-label="Team">{row.team}</td>
            <td data-label="HP">{row.hp}/{row.baseHp}</td>
            <td data-label="Slot">{row.slot}</td>
            <td data-label="Roll">{row.roll}</td>
            <td data-label="Modifier">{row.modifier}</td>
            <td data-label="Total">{row.total}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</article>
