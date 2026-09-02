# T01: Make Powerful Abilities consume both actions

**What to build:** Give Standard and Powerful Abilities distinct action costs
through the complete Referee Console path. A Standard Ability costs one action.
A Powerful Ability costs both actions. Reclassify the retained abilities and
preserve Powerful Ability prohibition effects.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A Standard Ability consumes one action and permits a second valid action.
- [x] A Powerful Ability is available only before the Active Character spends
      an action and consumes both actions in one Action Resolution.
- [x] Reactions remain outside the action economy.
- [x] Vanish and Battle Hymn are the only Drow Powerful Abilities.
- [x] Arcane Bolt is a Standard Ability.
- [x] Deadeye, Eldritch Blast, and Revivify are Standard Abilities.
- [x] Backstab and Stunning Strike continue to prohibit Powerful Abilities.
- [x] Replay, Undo, restore, canonical checks, and the referee Override path
      preserve the changed action economy.
- [x] The Ruleset, referee quick reference, generated Rules Reference,
      application labels, and Word character cards state the same costs.
- [x] Focused domain, contract, persistence, and browser checks pass.

# T02: Make movement blessings persistent

**What to build:** Make Battle Hymn and Blessing of Battle grant lasting Move
bonuses to their activation-time recipients, remove each bonus when its
recipient becomes Downed, and apply the current Move allowance to Vanish.

**Blocked by:** T01: Make Powerful Abilities consume both actions

**Status:** done

- [x] Battle Hymn gives every living Drow ally within 4 paces at activation,
      including the Bard, +1 Move until each recipient becomes Downed.
- [x] Blessing of Battle gives one living Duergar ally within 4 paces +1 Move
      until that recipient becomes Downed.
- [x] Later entrants do not receive Battle Hymn. Revival does not restore
      either movement effect.
- [x] Frostbind and triggered Hex remain the more restrictive one-pace limit.
- [x] Vanish costs both actions and grants `current Move × 2 + 2` paces before
      its existing physical immunity.
- [x] Activation, later turns, Downing, Revival, replay, Undo, and
      restore preserve the intended movement state.
- [x] The Ruleset, affected ability cards, referee quick reference, generated
      Rules Reference, application text, and Word character cards agree.
- [x] Focused domain, contract, persistence, and browser checks pass.

# T03: Replace Second Wind with Hold the Line

**What to build:** Give the Fighter a formation-based Powerful Ability that
protects the Fighter and nearby Duergar allies from the first damaging attack
against each recipient.

**Blocked by:** T01: Make Powerful Abilities consume both actions

**Status:** done

- [x] Hold the Line replaces Second Wind and consumes both actions.
- [x] It snapshots the Fighter and every living Duergar ally within 2 paces at
      activation. Later entrants do not receive it.
- [x] Until the Fighter's next turn, each recipient reduces the first attack's
      remaining damage against them by 1.
- [x] The Damage Block preserves legal hits and attached effects.
- [x] The effect ends separately when each recipient is first protected or
      becomes Downed. Revival does not restore it.
- [x] Expiry, separate recipients, stacked damage, attached effects, replay,
      Undo, restore, and the Action Draft behave consistently.
- [x] The Ruleset, Fighter card, referee quick reference, generated Rules
      Reference, application text, and Word character card agree.
- [x] Focused domain, contract, persistence, and browser checks pass.

# T04: Replace Rage with Rampage

**What to build:** Give the Barbarian a Powerful Ability that combines
ability-granted movement with one physical attack and the Barbarian's forced
movement identity.

**Blocked by:** T01: Make Powerful Abilities consume both actions; T02: Make
movement blessings persistent

**Status:** done

- [x] Rampage replaces Rage and consumes both actions.
- [x] Rampage moves the Barbarian up to `current Move × 2` paces, then makes
      one physical melee throw from the new position.
- [x] Each legal hit deals 1 damage and pushes that bottle up to 2 paces under
      the existing Brutal Shove forced-movement rules.
- [x] A Rampage with no legal bottle contact remains valid and spent.
- [x] Blessing of Battle, Frostbind, and triggered Hex change Rampage movement
      through the shared current Move allowance.
- [x] Reactions, Attack Legs, damage, forced movement, replay, Undo, restore,
      and the Action Draft remain consistent.
- [x] The Ruleset, Barbarian card, referee quick reference, generated Rules
      Reference, application text, and Word character card agree.
- [x] Focused domain, contract, persistence, and browser checks pass.
