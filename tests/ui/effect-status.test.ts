import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  activeEffectStatuses,
  downedEffectStatus,
} from "../../src/ui/effect-status";

describe("effect status icons", () => {
  it("uses raw local assets so Vite bundles the icons inline", () => {
    const source = readFileSync(
      new URL("../../src/ui/effect-status.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("?url");
    expect(source.match(/\?raw"/gu)).toHaveLength(3);
  });

  it("bundles every status icon into the application", () => {
    const effect = {
      effectId: "effect-1",
      abilityId: "duergar-fighter-hold-the-line" as const,
      kind: "hold-the-line" as const,
      anchorCharacterId: "duergar-fighter" as const,
      affectedCharacterId: "duergar-fighter" as const,
      duration: {
        kind: "until-boundary" as const,
        boundaryTrigger: "beginning-of-next-turn" as const,
        anchor: "affected" as const,
        removeWhenAffectedDowned: true,
      },
      operations: ["reduce-remaining-damage"] as const,
      appliedSequence: 1,
    };

    const statuses = activeEffectStatuses([effect], "duergar-fighter");

    expect(statuses[0]?.icon).toMatch(/^data:image\/svg\+xml,/u);
    expect(downedEffectStatus().icon).toMatch(/^data:image\/svg\+xml,/u);
  });
});
