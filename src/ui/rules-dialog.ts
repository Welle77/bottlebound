import { RULESET } from "../domain/ruleset";
import { resolveRulesSurface } from "../rules-reference/rules-reference";
import {
  normalizeRulesQuery,
  searchRules,
} from "../rules-reference/rules-search";
import { retainRulesVersion } from "../rules-reference/rules-ui-state";
import type { RulesReference } from "../rules-reference/types";
import { render } from "./render";
import { escapeHtml, highlightedExcerpt, searchResultKind } from "./format";
import { appRoot, Ref, rulesUi, state } from "./shell-state";

export function updateRulesSearch(
  reference: RulesReference,
  query: string,
): void {
  const contents = appRoot.querySelector<HTMLElement>("[data-rules-contents]");
  const output = appRoot.querySelector<HTMLElement>("[data-rules-results]");
  if (!contents || !output) return;

  const hasQuery = normalizeRulesQuery(query).length > 0;
  contents.hidden = hasQuery;
  output.hidden = !hasQuery;
  if (!hasQuery) {
    output.innerHTML = "";
    return;
  }

  const results = searchRules(reference.records, query);
  if (results.length === 0) {
    output.innerHTML =
      '<h3 id="rules-results-heading">Search results</h3><p>No rules match every search term.</p>';
    return;
  }
  const items = results
    .map(
      (result) =>
        `<li><a href="#${escapeHtml(result.anchor)}" data-rules-source><span class="rules-result-heading"><strong>${escapeHtml(result.title)}</strong><span>${escapeHtml(searchResultKind(result.kind))}</span></span><span class="rules-result-excerpt">${highlightedExcerpt(result.excerpt, result.highlights)}</span></a></li>`,
    )
    .join("");
  output.innerHTML = `<h3 id="rules-results-heading">Search results</h3><p>${results.length} ${results.length === 1 ? "result" : "results"}. All matches are shown.</p><ol>${items}</ol>`;
}

export function rulesModal(): string {
  if (!rulesUi.current.open) return "";
  const version = state.current.match?.rulesVersion ?? RULESET.version;
  const surface = resolveRulesSurface(version);
  if (surface.status === "unavailable") {
    return `<div class="rules-backdrop"><section class="rules-dialog rules-error" role="dialog" aria-modal="true" aria-labelledby="rules-heading"><header class="rules-dialog-header"><div><p class="eyebrow">Rules unavailable</p><h2 id="rules-heading">BOTTLEBOUND Rules</h2><p>Ruleset ${escapeHtml(surface.version)}</p></div><button id="close-rules" class="secondary-action" type="button" aria-label="Close Rules">Close</button></header><p role="alert">${escapeHtml(surface.message)}</p></section></div>`;
  }
  const reference = surface.reference;
  const contents = reference.sections
    .map(
      ({ title, anchor }) =>
        `<li><a href="#${escapeHtml(anchor)}">${escapeHtml(title)}</a></li>`,
    )
    .join("");
  return `<div class="rules-backdrop"><section class="rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-heading"><header class="rules-dialog-header"><div><p class="eyebrow">Ruleset ${escapeHtml(reference.version)}</p><h2 id="rules-heading">BOTTLEBOUND Rules</h2></div><button id="close-rules" class="secondary-action" type="button" aria-label="Close Rules">Close</button></header><div class="rules-scroll"><form class="rules-search" role="search"><label for="rules-search">Search rules</label><input id="rules-search" type="search" autocomplete="off" spellcheck="false" value="${escapeHtml(rulesUi.current.query)}"></form><section class="rules-results" aria-labelledby="rules-results-heading" aria-live="polite" data-rules-results hidden></section><nav class="rules-contents" aria-labelledby="rules-contents-heading" data-rules-contents><h3 id="rules-contents-heading">Contents</h3><ul class="rules-direct-links"><li><a href="#section-2-teams-roles-hp-basic-attacks" data-rules-source>Roster</a></li><li><a href="#section-15-character-ability-cards" data-rules-source>Abilities</a></li><li><a href="#section-5-core-terms" data-rules-source>Universal rules</a></li><li><a href="#section-16-referee-quick-reference" data-rules-source>Quick reference</a></li></ul><ol>${contents}</ol></nav><article class="rules-document" data-rules-document>${reference.html}</article></div></section></div>`;
}

const focusRulesAfterRender = new Ref(false);
const revealRulesAnchorAfterRender = new Ref<string | null>(null);

export function captureRulesView(): void {
  const search = appRoot.querySelector<HTMLInputElement>("#rules-search");
  const scroll = appRoot.querySelector<HTMLElement>(".rules-scroll");
  if (search) rulesUi.set({ ...rulesUi.current, query: search.value });
  if (scroll) rulesUi.set({ ...rulesUi.current, scrollTop: scroll.scrollTop });
}

export function openRules(
  opener: HTMLElement,
  anchor: string | null = null,
): void {
  const version = state.current.match?.rulesVersion ?? RULESET.version;
  const retained = retainRulesVersion(rulesUi.current, version);
  rulesUi.set({ ...retained, open: true, openerId: opener.id });
  if (anchor) {
    rulesUi.set({
      ...rulesUi.current,
      selectedAnchor: anchor,
      scrollTop: 0,
    });
    revealRulesAnchorAfterRender.set(anchor);
  }
  focusRulesAfterRender.set(true);
  render();
}

export function closeRules(): void {
  captureRulesView();
  const openerId = rulesUi.current.openerId;
  rulesUi.set({ ...rulesUi.current, open: false });
  render();
  if (openerId) document.getElementById(openerId)?.focus();
}

export function restoreRulesView(reference: RulesReference): void {
  const search = appRoot.querySelector<HTMLInputElement>("#rules-search");
  const scroll = appRoot.querySelector<HTMLElement>(".rules-scroll");
  if (!search || !scroll) return;

  updateRulesSearch(reference, rulesUi.current.query);
  if (rulesUi.current.selectedAnchor) {
    document
      .getElementById(rulesUi.current.selectedAnchor)
      ?.setAttribute("data-rules-selected", "");
  }
  if (revealRulesAnchorAfterRender.current !== null) {
    document
      .getElementById(revealRulesAnchorAfterRender.current)
      ?.scrollIntoView({ block: "start" });
    rulesUi.set({ ...rulesUi.current, scrollTop: scroll.scrollTop });
    revealRulesAnchorAfterRender.set(null);
  } else {
    scroll.scrollTop = rulesUi.current.scrollTop;
  }
  if (focusRulesAfterRender.current) {
    appRoot.querySelector<HTMLElement>("#close-rules")?.focus();
    focusRulesAfterRender.set(false);
  }
}

export function keepFocusInsideRules(event: KeyboardEvent): void {
  if (!rulesUi.current.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeRules();
    return;
  }
  if (event.key !== "Tab") return;
  const dialog = appRoot.querySelector<HTMLElement>(".rules-dialog");
  if (!dialog) return;
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((control) => control.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function settleRulesPostRenderFocus(): void {
  if (!rulesUi.current.open || !focusRulesAfterRender.current) return;
  appRoot.querySelector<HTMLElement>("#close-rules")?.focus();
  focusRulesAfterRender.set(false);
}
