import {
  confirmAction,
  confirmBasicAttack,
  continueMatch,
  createMatch,
  advanceTurn,
  generate,
  openBasicAttack,
  recordSimultaneousRuling,
  reopenEndedMatch,
  runStorageProbe,
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
  draftAffectedCharacterIds,
  replaceRulesUi,
  rulesUi,
  state,
} from "./shell-state";

export function render(): void {
  if (rulesUi.open) captureRulesView();
  replaceRulesUi(
    retainRulesVersion(rulesUi, state.match?.rulesVersion ?? RULESET.version),
  );
  const readiness = deriveReadinessState(state);
  const blocked = readiness.matchCreation === "blocked";
  appRoot.innerHTML = `<main class="shell" ${rulesUi.open ? "inert" : ""}><header class="hero"><div class="hero-heading"><div><p class="eyebrow">BOTTLEBOUND</p><h1>Referee Console</h1></div><button id="open-rules" class="secondary-action" type="button">Rules</button></div><p class="lede">Run one reliable initiative order, even after an offline restart.</p></header><details class="panel readiness-panel" open><summary><span><span class="eyebrow">System check</span><strong>Readiness</strong></span><span class="readiness-badge" data-state="${blocked ? "blocked" : "ready"}">${blocked ? "Checks required" : "Storage ready"}</span></summary><dl class="status-grid" aria-live="polite"><div class="status-card" data-status="${readiness.network}"><dt>Network</dt><dd>${statusLabel(readiness.network)}</dd><p>${readiness.network === "online" ? "A network connection is available." : "No network connection. The cached shell can still work."}</p></div><div class="status-card" data-status="${readiness.serviceWorker}"><dt>Service worker</dt><dd>${statusLabel(readiness.serviceWorker)}</dd><p>${readiness.serviceWorker === "controlled" ? "This page uses the installed shell." : "Reload after installation so the service worker can control this page."}</p></div><div class="status-card" data-status="${readiness.offline}"><dt>Offline shell</dt><dd>${statusLabel(readiness.offline)}</dd><p>${readiness.offline === "ready" ? "The required app shell is cached." : "The app shell is not ready for an offline launch yet."}</p></div><div class="status-card" data-status="${readiness.canonicalStorage}"><dt>Canonical storage</dt><dd>${statusLabel(readiness.canonicalStorage)}</dd><p>${state.storageDetail}</p></div></dl></details>${matchPanel()}</main>${rulesModal()}`;
  appRoot
    .querySelector("#basic-attack")
    ?.addEventListener("click", openBasicAttack);
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-hit-character]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const draft = state.actionDraft;
        const characterId = control.dataset.hitCharacter;
        if (!draft || !characterId) return;
        const activeLegIndex = draft.attackLegs.length - 1;
        const activeLeg = draft.attackLegs[activeLegIndex]!;
        draft.attackLegs[activeLegIndex] = control.checked
          ? [...activeLeg, characterId]
          : activeLeg.filter((id) => id !== characterId);
        const affectedCharacterIds = draftAffectedCharacterIds(draft);
        draft.reactions = draft.reactions.filter(({ protectedCharacterId }) =>
          affectedCharacterIds.includes(protectedCharacterId),
        );
        render();
      });
    });
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-reaction-id]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const draft = state.actionDraft;
        const reactionId = control.dataset.reactionId;
        const protectedCharacterId = control.dataset.protectedCharacter;
        if (!draft || !reactionId || !protectedCharacterId) return;
        draft.reactions = draft.reactions.filter(
          (selection) => selection.reactionId !== reactionId,
        );
        if (control.checked) {
          draft.reactions.push({
            reactionId,
            protectedCharacterId,
            override:
              control.dataset.reactionOverride === "true"
                ? "Referee allowed a state-invalid Reaction."
                : null,
          });
          if (
            reactionId === "duergar-monk-deflecting-palm" &&
            draft.attackLegs.length === 1
          ) {
            draft.attackLegs.push([]);
          }
        } else if (
          reactionId === "duergar-monk-deflecting-palm" &&
          draft.attackLegs.length === 2
        ) {
          draft.attackLegs.pop();
        }
        render();
      });
    });
  appRoot
    .querySelectorAll<HTMLInputElement>("[data-physical-check]")
    .forEach((control) => {
      control.addEventListener("change", () => {
        const key = control.dataset.physicalCheck as
          PhysicalAttackCheck | undefined;
        if (!state.actionDraft || !key) return;
        state.actionDraft.physicalConfirmations[key] = control.checked;
        render();
      });
    });
  appRoot
    .querySelector("#review-basic-attack")
    ?.addEventListener("click", () => {
      if (!state.actionDraft) return;
      state.actionDraft.step = "review";
      render();
    });
  appRoot.querySelector("#back-to-contacts")?.addEventListener("click", () => {
    if (!state.actionDraft) return;
    state.actionDraft.step = "contacts";
    render();
  });
  appRoot
    .querySelector("#major-action-override")
    ?.addEventListener("change", (event) => {
      if (
        !state.actionDraft ||
        !(event.currentTarget instanceof HTMLInputElement)
      )
        return;
      state.actionDraft.majorActionOverride = event.currentTarget.checked;
      render();
    });
  appRoot
    .querySelector("#cancel-basic-attack")
    ?.addEventListener("click", () => {
      state.actionDraft = null;
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
    state.match?.rulesVersion ?? RULESET.version,
  );
  const rulesSearch = appRoot.querySelector<HTMLInputElement>("#rules-search");
  if (reference && rulesSearch) {
    appRoot
      .querySelector<HTMLFormElement>(".rules-search")
      ?.addEventListener("submit", (event) => event.preventDefault());
    rulesSearch.addEventListener("input", () => {
      rulesUi.query = rulesSearch.value;
      updateRulesSearch(reference, rulesSearch.value);
    });
    const rulesScroll = appRoot.querySelector<HTMLElement>(".rules-scroll");
    rulesScroll?.addEventListener("scroll", () => {
      rulesUi.scrollTop = rulesScroll.scrollTop;
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
      rulesUi.selectedAnchor = anchor;
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
    if (state.actionDraft) return;
    if (state.match?.phase !== "active") return;
    try {
      state.endGamePreview = getEndGamePreview(state.match, cryptoRandomSource);
    } catch {
      state.endGamePreview = null;
    }
    state.confirmation = "end";
    render();
  });
  appRoot
    .querySelector("#reopen-match")
    ?.addEventListener("click", () => void reopenEndedMatch());
  appRoot
    .querySelector("#request-remove-match")
    ?.addEventListener("click", () => {
      state.confirmation = "remove";
      render();
    });
  appRoot
    .querySelector("#request-start-new-match")
    ?.addEventListener("click", () => {
      state.confirmation = "start-new";
      render();
    });
  appRoot
    .querySelector("#request-remove-summary")
    ?.addEventListener("click", () => {
      state.confirmation = "remove-summary";
      render();
    });
  appRoot.querySelector("#request-reroll")?.addEventListener("click", () => {
    state.confirmation = "reroll";
    render();
  });
  appRoot.querySelector("#request-discard")?.addEventListener("click", () => {
    state.confirmation = "discard";
    render();
  });
  appRoot.querySelector("#request-undo")?.addEventListener("click", () => {
    state.confirmation = "undo";
    render();
  });
  appRoot.querySelector("#cancel-action")?.addEventListener("click", () => {
    if (state.confirmation === "end") {
      state.endGamePreview = null;
    }
    state.confirmation = null;
    render();
  });
  appRoot
    .querySelector("#confirm-action")
    ?.addEventListener("click", () => void confirmAction());
}
