<script lang="ts">
  import { onMount } from "svelte";

  import { runStorageProbe } from "../app/actions";
  import { registerServiceWorker } from "../app/service-worker";
  import AbilityPicker from "./AbilityPicker.svelte";
  import ActionDraftPanel from "./ActionDraftPanel.svelte";
  import ActiveMatchBoard from "./ActiveMatchBoard.svelte";
  import EndedMatchPanel from "./EndedMatchPanel.svelte";
  import HeroHeader from "./HeroHeader.svelte";
  import MatchControlPanel from "./MatchControlPanel.svelte";
  import MatchSetupPanel from "./MatchSetupPanel.svelte";
  import RulesModal from "./RulesModal.svelte";
  import SystemCheckPanel from "./SystemCheckPanel.svelte";
  import { patchShellState, state } from "./shell-state.svelte";

  // Shell owner since T04: every Console surface is a reactive component —
  // hero header and system check panel (T04), setup-phase match panel (T05),
  // active-phase board with the full Action Draft flow and ability picker
  // (T06/T07), ended-phase panel with every confirmation dialog (T08), the
  // Rules reference modal mounted beside main (T09), and since T10 the
  // pre-Match create/error-recovery panels. main's inert flag is toggled
  // synchronously by the rules-dialog open/close transitions: dialog-close
  // refocusing depends on it landing in the same tick as the transition.
  const match = $derived(state.current.match);
  const draftOpen = $derived(state.current.actionDraft !== null);
  const abilityPickerOpen = $derived(state.current.abilityPickerOpen);

  onMount(() => {
    const handleOnline = (): void => {
      patchShellState({ network: "online" });
    };
    const handleOffline = (): void => {
      patchShellState({ network: "offline" });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // Same bootstrap order as the pre-Svelte entry point: paint the shell,
    // then start the canonical-storage probe and service-worker registration.
    // Every surface reacts to the runes store, so no render step exists.
    void runStorageProbe();
    void registerServiceWorker();
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
