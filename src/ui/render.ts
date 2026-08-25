import {
  cancelAbilityDraft,
  closeAbilityPicker,
  confirmAction,
  confirmBasicAttack,
  confirmAbility,
  continueMatch,
  createMatch,
  advanceTurn,
  generate,
  openAbilityDraft,
  openAbilityPicker,
  openBasicAttack,
  recordSimultaneousRuling,
  reopenEndedMatch,
  runStorageProbe,
  saveDisplayNames,
  start,
} from "../app/actions";
import { cryptoRandomSource, getEndGamePreview } from "../domain/match";
import { RULESET, type PhysicalAttackCheck } from "../domain/ruleset";
import { deriveReadinessState } from "../readiness";
import { resolveRulesReference } from "../rules-reference/rules-reference";
import { retainRulesVersion } from "../rules-reference/rules-ui-state";
import { statusLabel } from "./format";
import { matchPanel } from "./match-panels";
import {
  captureRulesView,
  closeRules,
  openRules,
  restoreRulesView,
  rulesModal,
  settleRulesPostRenderFocus,
  updateRulesSearch,
} from "./rules-dialog";
import {
  appRoot,
  createPhysicalConfirmations,
  draftAffectedCharacterIds,
  patchShellState,
  rulesUi,
  state,
} from "./shell-state";
import { saveRequirePhysicalConfirmations } from "./console-settings";

export function render(): void {
  if (rulesUi.current.open) captureRulesView();
  rulesUi.set(
    retainRulesVersion(
      rulesUi.current,
      state.current.match?.rulesVersion ?? RULESET.version,
    ),
  );
  const readiness = deriveReadinessState(state.current);
  const blocked = readiness.matchCreation === "blocked";
  appRoot.innerHTML = `<main class="shell" ${rulesUi.current.open ? "inert" : ""}><header class="hero"><div class="hero-heading"><div><p class="eyebrow">BOTTLEBOUND</p><h1>Referee Console</h1></div><button id="open-rules" class="secondary-action" type="button">Rules</button></div><p class="lede">Run one reliable initiative order, even after an offline restart.</p><label class="console-setting"><input id="require-physical-confirmations" type="checkbox" ${state.current.requirePhysicalConfirmations ? "checked" : ""}> Require manual physical confirmations</label></header><details class="panel readiness-panel" open><summary><span><span class="eyebrow">System check</span><strong>Readiness</strong></span><span class="readiness-badge" data-state="${blocked ? "blocked" : "ready"}">${blocked ? "Checks required" : "Storage ready"}</span></summary><dl class="status-grid" aria-live="polite"><div class="status-card" data-status="${readiness.network}"><dt>Network</dt><dd>${statusLabel(readiness.network)}</dd><p>${readiness.network === "online" ? "A network connection is available." : "No network connection. The cached shell can still work."}</p></div><div class="status-card" data-status="${readiness.serviceWorker}"><dt>Service worker</dt><dd>${statusLabel(readiness.serviceWorker)}</dd><p>${readiness.serviceWorker === "controlled" ? "This page uses the installed shell." : "Reload after installation so the service worker can control this page."}</p></div><div class="status-card" data-status="${readiness.offline}"><dt>Offline shell</dt><dd>${statusLabel(readiness.offline)}</dd><p>${readiness.offline === "ready" ? "The required app shell is cached." : "The app shell is not ready for an offline launch yet."}</p></div><div class="status-card" data-status="${readiness.canonicalStorage}"><dt>Canonical storage</dt><dd>${statusLabel(readiness.canonicalStorage)}</dd><p>${state.current.storageDetail}</p></div></dl></details>${matchPanel()}</main>${rulesModal()}`;
  appRoot
    .querySelector("#basic-attack")
    ?.addEventListener("click", openBasicAttack);
  appRoot
    .querySelector("#use-ability")
    ?.addEventListener("click", openAbilityPicker);
  appRoot
    .querySelector("#close-ability-picker")
    ?.addEventListener("click", closeAbilityPicker);
  appRoot
    .querySelectorAll<HTMLElement>("[data-open-ability]")
    .forEach((control) => {
      control.addEventListener("click", () => {
        const abilityId = control.dataset.openAbility;
        if (abilityId) openAbilityDraft(abilityId);
      });
    });
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-ability-target]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const currentDraft = state.current.actionDraft;
        const characterId = control.dataset.abilityTarget;
        if (!currentDraft || currentDraft.kind !== "ability" || !characterId)
          return;
        const ability = RULESET.abilities.find(
          ({ id }) => id === currentDraft.abilityId,
        );
        if (!ability) return;
        const multi = ability.targetPolicy.cardinality === "all-in-range";
        const targets = control.checked
          ? multi
            ? [...currentDraft.targets, characterId]
            : [characterId]
          : currentDraft.targets.filter((id) => id !== characterId);
        patchShellState({
          actionDraft: {
            ...currentDraft,
            targets,
            reactions: currentDraft.reactions.filter(
              ({ protectedCharacterId }) =>
                targets.includes(protectedCharacterId),
            ),
          },
        });
        render();
      });
    });
  appRoot
    .querySelector("#ability-targets-continue")
    ?.addEventListener("click", () => {
      const currentDraft = state.current.actionDraft;
      if (!currentDraft || currentDraft.kind !== "ability") return;
      const ability = RULESET.abilities.find(
        ({ id }) => id === currentDraft.abilityId,
      );
      patchShellState({
        actionDraft: {
          ...currentDraft,
          step:
            ability?.interaction === "targeted-attack" ? "reactions" : "review",
        },
      });
      render();
    });
  appRoot.querySelector("#review-ability")?.addEventListener("click", () => {
    const currentDraft = state.current.actionDraft;
    if (!currentDraft || currentDraft.kind !== "ability") return;
    patchShellState({ actionDraft: { ...currentDraft, step: "review" } });
    render();
  });
  appRoot
    .querySelector("#back-to-ability-targets")
    ?.addEventListener("click", () => {
      const currentDraft = state.current.actionDraft;
      if (!currentDraft || currentDraft.kind !== "ability") return;
      patchShellState({
        actionDraft: { ...currentDraft, step: "select-target" },
      });
      render();
    });
  appRoot
    .querySelector("#back-to-ability-reactions")
    ?.addEventListener("click", () => {
      const currentDraft = state.current.actionDraft;
      if (!currentDraft || currentDraft.kind !== "ability") return;
      patchShellState({ actionDraft: { ...currentDraft, step: "reactions" } });
      render();
    });
  appRoot
    .querySelector("#cancel-ability")
    ?.addEventListener("click", cancelAbilityDraft);
  appRoot
    .querySelector("#ability-override")
    ?.addEventListener("change", (event) => {
      const currentDraft = state.current.actionDraft;
      if (
        !currentDraft ||
        currentDraft.kind !== "ability" ||
        !(event.currentTarget instanceof HTMLInputElement)
      )
        return;
      patchShellState({
        actionDraft: {
          ...currentDraft,
          abilityOverride: event.currentTarget.checked,
        },
      });
      render();
    });
  appRoot
    .querySelector("#confirm-ability")
    ?.addEventListener("click", () => void confirmAbility());
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-hit-character]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const currentDraft = state.current.actionDraft;
        const characterId = control.dataset.hitCharacter;
        if (!currentDraft || !characterId) return;
        const activeLegIndex = currentDraft.attackLegs.length - 1;
        const activeLeg = currentDraft.attackLegs[activeLegIndex]!;
        const attackLegs = currentDraft.attackLegs.map((leg, index) =>
          index === activeLegIndex
            ? control.checked
              ? [...activeLeg, characterId]
              : activeLeg.filter((id) => id !== characterId)
            : leg,
        );
        const affectedCharacterIds = draftAffectedCharacterIds({
          ...currentDraft,
          attackLegs,
        });
        patchShellState({
          actionDraft: {
            ...currentDraft,
            attackLegs,
            reactions: currentDraft.reactions.filter(
              ({ protectedCharacterId }) =>
                affectedCharacterIds.includes(protectedCharacterId),
            ),
          },
        });
        render();
      });
    });
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-reaction-id]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const currentDraft = state.current.actionDraft;
        const reactionId = control.dataset.reactionId;
        const protectedCharacterId = control.dataset.protectedCharacter;
        if (!currentDraft || !reactionId || !protectedCharacterId) return;
        const selected = control.checked;
        const deflectingPalm = reactionId === "duergar-monk-deflecting-palm";
        const reactions = selected
          ? [
              ...currentDraft.reactions.filter(
                (selection) => selection.reactionId !== reactionId,
              ),
              {
                reactionId,
                protectedCharacterId,
                override:
                  control.dataset.reactionOverride === "true"
                    ? "Referee allowed a state-invalid Reaction."
                    : null,
              },
            ]
          : currentDraft.reactions.filter(
              (selection) => selection.reactionId !== reactionId,
            );
        const attackLegs =
          selected && deflectingPalm && currentDraft.attackLegs.length === 1
            ? [...currentDraft.attackLegs, [] as readonly string[]]
            : !selected &&
                deflectingPalm &&
                currentDraft.attackLegs.length === 2
              ? currentDraft.attackLegs.slice(0, -1)
              : currentDraft.attackLegs;
        patchShellState({
          actionDraft: { ...currentDraft, reactions, attackLegs },
        });
        render();
      });
    });
  appRoot
    .querySelector("#require-physical-confirmations")
    ?.addEventListener("change", (event) => {
      if (!(event.currentTarget instanceof HTMLInputElement)) return;
      const requireManualChecks = event.currentTarget.checked;
      const currentDraft = state.current.actionDraft;
      patchShellState({
        requirePhysicalConfirmations: requireManualChecks,
        ...(currentDraft && !requireManualChecks
          ? {
              actionDraft: {
                ...currentDraft,
                physicalConfirmations: createPhysicalConfirmations(false),
              },
            }
          : {}),
      });
      saveRequirePhysicalConfirmations(requireManualChecks);
      render();
    });
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-physical-check]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const key = control.dataset.physicalCheck as
          PhysicalAttackCheck | undefined;
        if (!key || state.current.actionDraft === null) return;
        const currentDraft = state.current.actionDraft;
        patchShellState({
          actionDraft: {
            ...currentDraft,
            physicalConfirmations: {
              ...currentDraft.physicalConfirmations,
              [key]: control.checked,
            },
          },
        });
        render();
      });
    });
  appRoot
    .querySelector("#review-basic-attack")
    ?.addEventListener("click", () => {
      if (state.current.actionDraft === null) return;
      patchShellState({
        actionDraft: { ...state.current.actionDraft, step: "review" },
      });
      render();
    });
  appRoot.querySelector("#back-to-contacts")?.addEventListener("click", () => {
    if (state.current.actionDraft === null) return;
    patchShellState({
      actionDraft: { ...state.current.actionDraft, step: "contacts" },
    });
    render();
  });
  appRoot
    .querySelector("#major-action-override")
    ?.addEventListener("change", (event) => {
      if (
        state.current.actionDraft === null ||
        !(event.currentTarget instanceof HTMLInputElement)
      )
        return;
      patchShellState({
        actionDraft: {
          ...state.current.actionDraft,
          majorActionOverride: event.currentTarget.checked,
        },
      });
      render();
    });
  appRoot
    .querySelector("#cancel-basic-attack")
    ?.addEventListener("click", () => {
      patchShellState({ actionDraft: null });
      render();
    });
  appRoot
    .querySelector("#confirm-basic-attack")
    ?.addEventListener("click", () => void confirmBasicAttack());
  appRoot
    .querySelectorAll<HTMLElement>("#open-rules, [data-open-rules-anchor]")
    .forEach((control) =>
      control.addEventListener("click", () =>
        openRules(control, control.dataset.openRulesAnchor ?? null),
      ),
    );
  appRoot.querySelector("#close-rules")?.addEventListener("click", closeRules);
  const reference = resolveRulesReference(
    state.current.match?.rulesVersion ?? RULESET.version,
  );
  const rulesSearch = appRoot.querySelector<HTMLInputElement>("#rules-search");
  if (reference && rulesSearch) {
    appRoot
      .querySelector<HTMLFormElement>(".rules-search")
      ?.addEventListener("submit", (event) => event.preventDefault());
    rulesSearch.addEventListener("input", () => {
      rulesUi.set({ ...rulesUi.current, query: rulesSearch.value });
      updateRulesSearch(reference, rulesSearch.value);
    });
    const rulesScroll = appRoot.querySelector<HTMLElement>(".rules-scroll");
    rulesScroll?.addEventListener("scroll", () => {
      rulesUi.set({ ...rulesUi.current, scrollTop: rulesScroll.scrollTop });
    });
    rulesScroll?.addEventListener("click", (event) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
          : null;
      const anchor = link?.getAttribute("href")?.slice(1);
      if (!anchor) return;
      const source = document.getElementById(anchor);
      if (!source) return;
      event.preventDefault();
      document
        .querySelector("[data-rules-selected]")
        ?.removeAttribute("data-rules-selected");
      rulesUi.set({ ...rulesUi.current, selectedAnchor: anchor });
      source.setAttribute("data-rules-selected", "");
      source.scrollIntoView({ block: "start" });
    });
    restoreRulesView(reference);
  } else {
    settleRulesPostRenderFocus();
  }
  appRoot
    .querySelector("#retry-storage")
    ?.addEventListener("click", () => void runStorageProbe());
  appRoot
    .querySelector("#create-match")
    ?.addEventListener("click", () => void createMatch());
  appRoot
    .querySelector("#generate-initiative")
    ?.addEventListener("click", () => void generate());
  appRoot
    .querySelector("#save-display-names")
    ?.addEventListener("click", () => void saveDisplayNames());
  appRoot
    .querySelector("#start-match")
    ?.addEventListener("click", () => void start());
  appRoot
    .querySelector("#finish-turn")
    ?.addEventListener("click", () => void advanceTurn());
  appRoot
    .querySelector("#continue-match")
    ?.addEventListener("click", () => void continueMatch());
  appRoot
    .querySelector<HTMLFormElement>(".simultaneous-ruling")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const outcome = new FormData(form).get("simultaneous-outcome");
      if (outcome !== "Drow" && outcome !== "Duergar" && outcome !== "draw")
        return;
      void recordSimultaneousRuling(outcome);
    });
  appRoot.querySelector("#request-end-game")?.addEventListener("click", () => {
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
    render();
  });
  appRoot
    .querySelector("#reopen-match")
    ?.addEventListener("click", () => void reopenEndedMatch());
  appRoot
    .querySelector("#request-remove-match")
    ?.addEventListener("click", () => {
      patchShellState({ confirmation: "remove" });
      render();
    });
  appRoot
    .querySelector("#request-start-new-match")
    ?.addEventListener("click", () => {
      patchShellState({ confirmation: "start-new" });
      render();
    });
  appRoot
    .querySelector("#request-remove-summary")
    ?.addEventListener("click", () => {
      patchShellState({ confirmation: "remove-summary" });
      render();
    });
  appRoot.querySelector("#request-reroll")?.addEventListener("click", () => {
    patchShellState({ confirmation: "reroll" });
    render();
  });
  appRoot.querySelector("#request-discard")?.addEventListener("click", () => {
    patchShellState({ confirmation: "discard" });
    render();
  });
  appRoot.querySelector("#request-undo")?.addEventListener("click", () => {
    patchShellState({ confirmation: "undo" });
    render();
  });
  appRoot.querySelector("#cancel-action")?.addEventListener("click", () => {
    if (state.current.confirmation === "end") {
      patchShellState({ endGamePreview: null });
    }
    patchShellState({ confirmation: null });
    render();
  });
  appRoot
    .querySelector("#confirm-action")
    ?.addEventListener("click", () => void confirmAction());
}
