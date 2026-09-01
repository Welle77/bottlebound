<script lang="ts">
  import { onMount } from "svelte";

  import { registerServiceWorker } from "../app/service-worker";
  import type { Application } from "../app/application";
  import AbilityPicker from "./AbilityPicker.svelte";
  import ActionDraftPanel from "./ActionDraftPanel.svelte";
  import ActiveMatchBoard from "./ActiveMatchBoard.svelte";
  import EndedMatchPanel from "./EndedMatchPanel.svelte";
  import HeroHeader from "./HeroHeader.svelte";
  import MatchControlPanel from "./MatchControlPanel.svelte";
  import MatchSetupPanel from "./MatchSetupPanel.svelte";
  import RulesModal from "./RulesModal.svelte";
  import SystemCheckPanel from "./SystemCheckPanel.svelte";
  import { provideConsoleContext } from "./console-context";
  import type { UIStateStore } from "./ui-state";

  const {
    application,
    uiState,
  }: { application: Application; uiState: UIStateStore } = $props();
  provideConsoleContext({
    get application(): Application {
      return application;
    },
    get uiState(): UIStateStore {
      return uiState;
    },
  });

  // Shell owner since T04: every Console surface is a reactive component —
  // hero header and system check panel (T04), setup-phase match panel (T05),
  // active-phase board with the full Action Draft flow and ability picker
  // (T06/T07), ended-phase panel with every confirmation dialog (T08), the
  // Rules reference modal mounted beside main (T09), and since T10 the
  // pre-Match create/error-recovery panels. main's inert flag is toggled
  // synchronously by the rules-dialog open/close transitions: dialog-close
  // refocusing depends on it landing in the same tick as the transition.
  const match = $derived(application.state.match);
  const draftOpen = $derived(uiState.state.actionDraft !== null);
  const abilityPickerOpen = $derived(uiState.state.pickerVisibility.ability);

  onMount(() => {
    application.setNetworkState(navigator.onLine ? "online" : "offline");
    const handleOnline = (): void => {
      application.setNetworkState("online");
    };
    const handleOffline = (): void => {
      application.setNetworkState("offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // Same bootstrap order as the pre-Svelte entry point: paint the shell,
    // then start the validated-storage probe and service-worker registration.
    // Every surface reacts to the runes store, so no render step exists.
    void application.probeStorage();
    void registerServiceWorker(application);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  });
</script>

<main class="shell">
  <HeroHeader />
  {#if !match}
    <SystemCheckPanel />
    <MatchControlPanel />
  {/if}
  {#if match?.phase === "setup"}
    <MatchSetupPanel />
  {/if}
  {#if match?.phase === "active"}
    {#if draftOpen}
      <!-- The converted Action Draft flow replaces the whole board as
           main.shell's last child, exactly like the swapped legacy panel did. -->
      <ActionDraftPanel />
    {:else if abilityPickerOpen}
      <AbilityPicker match={match} />
    {:else}
      <ActiveMatchBoard />
    {/if}
  {/if}
  {#if match?.phase === "ended"}
    <EndedMatchPanel />
  {/if}
</main>
<RulesModal />
