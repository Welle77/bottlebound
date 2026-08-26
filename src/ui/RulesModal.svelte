<script lang="ts">
  import { RULESET } from "../domain/ruleset";
  import { resolveRulesSurface } from "../rules-reference/rules-reference";
  import {
    normalizeRulesQuery,
    searchRules,
  } from "../rules-reference/rules-search";
  import { highlightedExcerpt, searchResultKind } from "./format";
  import { closeRules } from "./rules-dialog";
  import {
    pendingAnchorReveal,
    rulesUi,
    state,
  } from "./shell-state.svelte";

  // Converted Rules reference modal (T09): open/search/close and focus
  // containment react to the runes-backed rules UI state instead of being
  // swapped as legacy template HTML. The component mounts beside main.shell
  // as the last child of the app root, exactly where the legacy renderer
  // appended the swapped modal, so no wrapper nodes appear in the DOM.
  const open = $derived(rulesUi.current.open);
  const surface = $derived(
    resolveRulesSurface(state.current.match?.rulesVersion ?? RULESET.version),
  );
  const query = $derived(rulesUi.current.query);
  const hasQuery = $derived(normalizeRulesQuery(query).length > 0);
  const results = $derived(
    surface.status === "available" && hasQuery
      ? searchRules(surface.reference.records, query)
      : [],
  );

  // Captured through a mount action below so the keydown focus trap can
  // enumerate this dialog's controls without reaching into the app root.
  let dialogElement: HTMLElement | null = null;

  function captureDialog(node: HTMLElement): void {
    dialogElement = node;
  }

  /** Mount action: move focus into the freshly opened dialog. */
  function focusDialog(node: HTMLElement): void {
    node.focus();
  }

  /**
   * Mount action for .rules-scroll: marks the retained selection and either
   * reveals a freshly requested anchor or restores the reading position —
   * the reactive counterpart of the deleted legacy restore wiring. Search
   * text and scroll offsets stay continuously synced into the store by the
   * input/scroll handlers, so no extra capture step exists.
   */
  function restoreReadingPosition(node: HTMLElement): void {
    if (rulesUi.current.selectedAnchor) {
      document
        .getElementById(rulesUi.current.selectedAnchor)
        ?.setAttribute("data-rules-selected", "");
    }
    const pendingAnchor = pendingAnchorReveal.current;
    if (pendingAnchor !== null) {
      document
        .getElementById(pendingAnchor)
        ?.scrollIntoView({ block: "start" });
      rulesUi.set({ ...rulesUi.current, scrollTop: node.scrollTop });
      pendingAnchorReveal.set(null);
      return;
    }
    node.scrollTop = rulesUi.current.scrollTop;
  }

  function handleSearchInput(event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    rulesUi.set({ ...rulesUi.current, query: event.currentTarget.value });
  }

  function handleScroll(event: Event): void {
    if (!(event.currentTarget instanceof HTMLElement)) return;
    rulesUi.set({
      ...rulesUi.current,
      scrollTop: event.currentTarget.scrollTop,
    });
  }

  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
  }

  /**
   * Delegated anchor routing for every in-dialog link (direct links,
   * contents entries, and search results): selects and reveals the target
   * section without navigating, like the deleted .rules-scroll listener.
   */
  function handleDelegatedClick(event: MouseEvent): void {
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
  }

  /**
   * Focus-trap and dismissal key handling, owned by this dialog component
   * since T09 (previously a document-level listener wired by App). The open
   * guard keeps the window-level listener inert while no dialog exists.
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (!rulesUi.current.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeRules();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogElement;
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
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  {#if surface.status === "unavailable"}
    <!-- Legacy parity: the dialog role stays on a section element exactly
         as the deleted legacy template rendered it. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <div class="rules-backdrop">
      <section
        class="rules-dialog rules-error"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-heading"
        use:captureDialog
      >
        <header class="rules-dialog-header">
          <div>
            <p class="eyebrow">Rules unavailable</p>
            <h2 id="rules-heading">BOTTLEBOUND Rules</h2>
            <p>Ruleset {surface.version}</p>
          </div>
          <button
            id="close-rules"
            class="secondary-action"
            type="button"
            aria-label="Close Rules"
            use:focusDialog
            onclick={closeRules}
          >
            Close
          </button>
        </header>
        <p role="alert">{surface.message}</p>
      </section>
    </div>
  {:else}
    <div class="rules-backdrop">
      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
      <section
        class="rules-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-heading"
        use:captureDialog
      >
        <header class="rules-dialog-header">
          <div>
            <p class="eyebrow">Ruleset {surface.reference.version}</p>
            <h2 id="rules-heading">BOTTLEBOUND Rules</h2>
          </div>
          <button
            id="close-rules"
            class="secondary-action"
            type="button"
            aria-label="Close Rules"
            use:focusDialog
            onclick={closeRules}
          >
            Close
          </button>
        </header>
        <!-- Delegation transport only: routes every in-document anchor link
             (direct links, contents entries, search results) through the
             shared selection handler below. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="rules-scroll"
          use:restoreReadingPosition
          onclick={handleDelegatedClick}
          onscroll={handleScroll}
        >
          <form class="rules-search" role="search" onsubmit={handleSubmit}>
            <label for="rules-search">Search rules</label>
            <input
              id="rules-search"
              type="search"
              autocomplete="off"
              spellcheck="false"
              value={query}
              oninput={handleSearchInput}
            />
          </form>
          <section
            class="rules-results"
            aria-labelledby="rules-results-heading"
            aria-live="polite"
            data-rules-results
            hidden={!hasQuery}
          >
            {#if hasQuery}
              <h3 id="rules-results-heading">Search results</h3>
              {#if results.length === 0}
                <p>No rules match every search term.</p>
              {:else}
                <p>{`${results.length} ${results.length === 1 ? "result" : "results"}. All matches are shown.`}</p>
                <ol>
                  {#each results as result, resultIndex (resultIndex)}
                    <li>
                      <a href="#{result.anchor}" data-rules-source>
                        <span class="rules-result-heading"><strong>{result.title}</strong><span>{searchResultKind(result.kind)}</span></span>
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        <span class="rules-result-excerpt">{@html highlightedExcerpt(result.excerpt, result.highlights)}</span>
                      </a>
                    </li>
                  {/each}
                </ol>
              {/if}
            {/if}
          </section>
          <nav
            class="rules-contents"
            aria-labelledby="rules-contents-heading"
            data-rules-contents
            hidden={hasQuery}
          >
            <h3 id="rules-contents-heading">Contents</h3>
            <ul class="rules-direct-links">
              <li><a href="#section-2-teams-roles-hp-basic-attacks" data-rules-source>Roster</a></li>
              <li><a href="#section-15-character-ability-cards" data-rules-source>Abilities</a></li>
              <li><a href="#section-5-core-terms" data-rules-source>Universal rules</a></li>
              <li><a href="#section-16-referee-quick-reference" data-rules-source>Quick reference</a></li>
            </ul>
            <ol>
              {#each surface.reference.sections as section (section.anchor)}
                <li><a href="#{section.anchor}">{section.title}</a></li>
              {/each}
            </ol>
          </nav>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <article class="rules-document" data-rules-document>{@html surface.reference.html}</article>
        </div>
      </section>
    </div>
  {/if}
{/if}
