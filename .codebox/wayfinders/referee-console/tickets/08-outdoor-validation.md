---
id: W08
type: prototype
status: closed
blocked_by: [W02, W05, W07]
claimed_by: active-wayfinder
---

# Test outdoor operation

## Question

Does the proposed Referee Console support fast input, readable outdoor use, interrupted-session recovery, and safe Undo on the target devices?

## Resolution

The proposed workflow is viable at the prototype level. Browser evidence
supports fast simple input, responsive layout, deterministic recovery, and
confirmed atomic Undo. A production feature still needs a field test on the
intended phone and tablet before release.

### Prototype evidence

The [outdoor operation validation prototype](../assets/outdoor-operation-validation-prototype.html)
uses a pure Match recovery model and guided scenarios.

- A one-target Basic Attack takes three live controls: start the attack,
  select the target, and confirm the result.
- Finish Turn takes one live control in the no-expiry case.
- Undo takes two live controls: open the exact preview and confirm it.
- A restart during an Action Draft restores the last saved snapshot and
  discards the draft without a Match State change.
- A restart after confirmation restores the confirmed event and resulting
  Match State.
- Undo restores and saves the complete pre-event Match State. It keeps both
  the target event and Undo Event in history.
- A failed canonical-storage check blocks Match start.

All five guided scenarios passed without browser errors. The responsive check
used a 390 × 844 phone viewport and a 1024 × 768 tablet viewport. Buttons use
a minimum 48-pixel height. The layouts use dark text on a light background,
high-contrast primary controls, and no decorative animation.

### Field validation gate

Browser simulation cannot check direct sunlight, wet hands, screen glare,
device heat, or divided referee attention. Each implementation feature must
pass its applicable checks on the intended phone and tablet:

1. Start from a cold offline launch after the app reports offline readiness.
2. Use each live control that the feature adds without zoom.
3. Restore after a forced browser close during an Action Draft.
4. Restore after a forced browser close immediately after confirmation.
5. Read HP, effects, warnings, and the active character in direct sunlight.
6. Use every main control with one hand and damp fingers.
7. Keep the device usable through a representative outdoor Match duration.

Any failed check blocks release. It does not change gameplay rules or move a
physical judgment into the Referee Console.
