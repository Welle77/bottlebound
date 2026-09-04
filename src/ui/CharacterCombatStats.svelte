<script lang="ts">
  import targetIcon from "@phosphor-icons/core/bold/target-bold.svg?url";
  import swordIcon from "@phosphor-icons/core/bold/sword-bold.svg?url";

  type Props = {
    readonly team: string;
    readonly hp: number;
    readonly maxHp: number;
    readonly movementPaces: number;
    readonly attackType: "melee" | "ranged";
  };

  const {
    team,
    hp,
    maxHp,
    movementPaces,
    attackType,
  }: Props = $props();
</script>

<dl class="character-combat-stats">
  <div>
    <dt>Team</dt>
    <dd>{team}</dd>
  </div>
  <div>
    <dt>HP</dt>
    <dd class:critical-hp={hp === 1}>{hp}/{maxHp}</dd>
  </div>
  <div>
    <dt>Move</dt>
    <dd>{movementPaces} paces</dd>
  </div>
  <div>
    <dt>Range</dt>
    <dd data-character-attack-range>
      <img
        src={attackType === "melee" ? swordIcon : targetIcon}
        data-range-icon={attackType}
        alt=""
        aria-hidden="true"
      />
    </dd>
  </div>
</dl>
